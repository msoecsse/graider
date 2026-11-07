import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";
import type { ManagedOperationInput } from "./githubOAuthSession.js";
import { createMigrationReviewReader } from "./migrationReviewReader.js";
import { serializeManagedOperation } from "./managedCourses.js";
import { createMigrationRetryStore } from "./migrationRetryStore.js";
import {
  isMigrationReviewSessionRequest,
  loadMigrationReviewBackend,
  type MigrationReviewService,
  type MigrationReviewSessionRequest
} from "./migrationReviewService.js";

export interface MigrationCheckpointDependencies {
  readonly userData: string;
  readonly reviewService: Pick<MigrationReviewService, "getCheckpointHandoff">;
  /** Current OAuth course boundary, never an IPC-provided context. No production control installs this service. */
  readonly withCourse: <T>(
    selector: string,
    operation: (input: ManagedOperationInput) => Promise<T>
  ) => Promise<T>;
  /** Main-owned current candidate identity. Recompute from the retained candidate on each call;
   * never return an artifact/renderer-provided assertion. This does not validate publication.
   */
  readonly readCandidateFingerprint: (
    owner: number,
    request: MigrationReviewSessionRequest
  ) => Promise<string>;
  readonly backend?: () => typeof Backend;
  readonly observe?: (
    input: ManagedOperationInput
  ) => ReturnType<ReturnType<typeof createMigrationReviewReader>["observe"]>;
}
type RetryResult = {
  readonly status: "retained" | "reusable" | "invalidated";
  readonly publicationReady: false;
};
const invalid = (): RetryResult =>
  Object.freeze({ status: "invalidated", publicationReady: false });
const attention = (): Backend.MigrationCheckpointResult =>
  Object.freeze({
    status: "needs_attention",
    reason: "validation_failed",
    publicationReady: false
  });

/** Narrow prepublication infrastructure. Nothing here publishes, grants execution authority or crosses IPC. */
export const createMigrationCheckpointService = (deps: MigrationCheckpointDependencies) => {
  const backend = deps.backend ?? loadMigrationReviewBackend;
  const store = createMigrationRetryStore(deps.userData, backend);
  const run = async (
    owner: number,
    inputRequest: MigrationReviewSessionRequest,
    mode: "checkpoint" | "retain" | "retry",
    failure?: Backend.MigrationRetryFailure
  ): Promise<Backend.MigrationCheckpointResult | RetryResult> => {
    try {
      if (!isMigrationReviewSessionRequest(inputRequest))
        throw new Error("Invalid review binding.");
      const request = Object.freeze({
        ...inputRequest,
        source: Object.freeze({ ...inputRequest.source })
      });
      const handoff = await deps.reviewService.getCheckpointHandoff(owner, request);
      if (!handoff) throw new Error("Complete current review first.");
      const source = handoff.analysis.source;
      const selector = `managed-course:${source.authenticatedGithubUserId}:${source.repositoryId}`;
      return await deps.withCourse(selector, async (input) =>
        serializeManagedOperation(input, async () => {
          const b = backend();
          const observe =
            deps.observe ??
            ((operation: ManagedOperationInput) =>
              createMigrationReviewReader(operation, deps.userData, null, b).observe());
          let expectedRemote: string | null = null;
          let expectedBranch: string | null = null;
          let expectedCandidate: string | null = null;
          const revalidate = async (): Promise<void> => {
            input.signal.throwIfAborted();
            if (
              input.userId !== source.authenticatedGithubUserId ||
              input.course.repositoryId !== source.repositoryId ||
              input.course.organizationId !== source.organizationId ||
              !(await input.revalidateSession())
            )
              throw new Error("Current course account is required.");
            await handoff.revalidate();
            const observed = await observe(input);
            const repo = observed.repository;
            if (
              repo.id !== source.repositoryId ||
              repo.organizationId !== source.organizationId ||
              repo.disabled ||
              observed.sourceCommitSha !== source.sourceCommitSha ||
              !/^[A-Za-z0-9._-]+$/.test(repo.owner) ||
              !/^[A-Za-z0-9._-]+$/.test(repo.name) ||
              [".", ".."].includes(repo.owner) ||
              [".", ".."].includes(repo.name)
            )
              throw new Error("Canonical course source changed.");
            const remote = `https://github.com/${repo.owner}/${repo.name}.git`;
            if (
              (expectedRemote !== null && expectedRemote !== remote) ||
              (expectedBranch !== null && expectedBranch !== repo.defaultBranch)
            )
              throw new Error("Canonical repository locator changed.");
            expectedRemote = remote;
            expectedBranch = repo.defaultBranch;
            if (mode !== "checkpoint") {
              const fingerprint = await deps.readCandidateFingerprint(owner, request);
              if (
                !/^[a-f0-9]{64}$/.test(fingerprint) ||
                (expectedCandidate !== null && expectedCandidate !== fingerprint)
              )
                throw new Error("Current candidate changed.");
              expectedCandidate = fingerprint;
            }
            await handoff.revalidate();
            if (!(await input.revalidateSession()))
              throw new Error("Authenticated session changed.");
            input.signal.throwIfAborted();
          };
          await revalidate();
          const remote = b.createTrustedGitRemote(expectedRemote!);
          const sourceCommit = b.createExactCommitRevision(source.sourceCommitSha);
          if (!remote || !sourceCommit) throw new Error("Invalid source binding.");
          if (mode === "retain") b.migrationRetryFailureSchema.parse(failure);
          const binding = (): Backend.MigrationRetryBinding =>
            b.migrationRetryBindingSchema.parse({
              authenticatedGithubUserId: source.authenticatedGithubUserId,
              repositoryId: source.repositoryId,
              organizationId: source.organizationId,
              sourceCommitSha: source.sourceCommitSha,
              reportId: handoff.analysis.reportId,
              reviewId: b.migrationFingerprint({
                sessionId: request.sessionId,
                completionId: handoff.reviewId,
                review: handoff.review
              }),
              candidateFingerprint: expectedCandidate,
              checkpointReference: b.migrationCheckpointReference(source.sourceCommitSha),
              checkpointCommit: source.sourceCommitSha
            });
          const record =
            mode === "retry" ? store.read(input.userId, input.course.repositoryId) : null;
          if (mode === "retry" && !b.matchesMigrationRetryBinding(record, binding()))
            return invalid();
          const result = await b.withMigrationCheckpointWorkspace(
            remote,
            input.token,
            async (workspace, authentication) => {
              const checkpoint = await b.verifyMigrationCheckpoint(
                workspace,
                { remote, sourceCommit, authentication },
                revalidate,
                { create: mode === "checkpoint" }
              );
              if (mode === "checkpoint") return checkpoint;
              if (checkpoint.status !== "verified") return invalid();
              await revalidate();
              if (mode === "retry") {
                if (!b.matchesMigrationRetryBinding(record, binding())) return invalid();
                return Object.freeze({ status: "reusable", publicationReady: false });
              }
              store.write({
                kind: "migration-prepublication-retry",
                version: 1,
                binding: binding(),
                failure
              });
              return Object.freeze({ status: "retained", publicationReady: false });
            }
          );
          await revalidate();
          return result;
        })
      );
    } catch {
      return mode === "checkpoint" ? attention() : invalid();
    }
  };
  return {
    async checkpoint(
      owner: number,
      request: MigrationReviewSessionRequest
    ): Promise<Backend.MigrationCheckpointResult> {
      return (await run(owner, request, "checkpoint")) as Backend.MigrationCheckpointResult;
    },
    async retainFailure(
      owner: number,
      request: MigrationReviewSessionRequest,
      failure: Backend.MigrationRetryFailure
    ): Promise<RetryResult> {
      return (await run(owner, request, "retain", failure)) as RetryResult;
    },
    async retry(owner: number, request: MigrationReviewSessionRequest): Promise<RetryResult> {
      return (await run(owner, request, "retry")) as RetryResult;
    }
  };
};
