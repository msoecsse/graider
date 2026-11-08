import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";
import type { GithubOAuthSession, ManagedOperationInput } from "./githubOAuthSession.js";
import { managedCoursePath, validateManagedStorage } from "./managedCourses.js";
import { CourseMutationBlocked, requireSynchronizedCommit } from "./managedCourseMutationGuard.js";
import {
  publishManagedCourseTransaction,
  observeManagedCoursePublication
} from "./managedCourseTransaction.js";
import { createAssignmentMigrationPlanningService } from "./assignmentMigrationPlanningService.js";
import { createGraderRemovalHandoffService } from "./graderRemovalHandoffService.js";
import { createMigrationReviewReader } from "./migrationReviewReader.js";
import {
  isMigrationReviewSessionRequest,
  loadMigrationReviewBackend,
  type MigrationReviewService,
  type MigrationReviewSessionRequest
} from "./migrationReviewService.js";
import {
  readMigrationPublicationReadiness,
  type MigrationTransactionReadiness
} from "./migrationPublicationReadiness.js";
import { createMigrationPublicationStore } from "./migrationPublicationStore.js";
import type {
  AuthenticatedGitWorkspaceContext,
  GitWorkspaceFactory
} from "./gitWorkspaceReader.js";

export type MigrationPublicationPhase =
  | "preparing"
  | "validating"
  | "checkpointing"
  | "publishing"
  | "synchronizing";
export interface MigrationPublicationDependencies {
  readonly userData: string;
  readonly reviewService: MigrationReviewService;
  /** withSynchronizedCourse owns the account/course lease through outcome recovery. */
  readonly session: Pick<GithubOAuthSession, "withSynchronizedCourse">;
  readonly observe?: (
    input: ManagedOperationInput
  ) => ReturnType<ReturnType<typeof createMigrationReviewReader>["observe"]>;
  readonly authenticate?: (token: string) => AuthenticatedGitWorkspaceContext;
  readonly factory?: GitWorkspaceFactory;
  readonly withCheckpointWorkspace?: typeof Backend.withMigrationCheckpointWorkspace;
  readonly changed?: () => void;
}
export type MigrationPublicationOutcome =
  | { readonly status: "published"; readonly commit: string; readonly refreshRequired: boolean }
  | { readonly status: "outcome_unknown"; readonly action: string }
  | { readonly status: "cancelled" }
  | { readonly status: "not_published"; readonly action: string }
  | {
      readonly status: "blocked";
      readonly action: string;
      readonly readiness?: MigrationTransactionReadiness;
    };
class PublicationRefused extends Error {
  readonly result: MigrationPublicationOutcome;
  constructor(readonly outcome: MigrationPublicationOutcome) {
    super("Migration publication refused.");
    this.result = outcome;
  }
}
const refuse = (action: string): never => {
  throw new PublicationRefused({ status: "blocked", action });
};
const unknownOutcome = (): MigrationPublicationOutcome => ({
  status: "outcome_unknown",
  action:
    "Reconnect and recover the authoritative remote outcome before retrying. Publication will never be retried automatically."
});

/** Main-only publication capability. #25 exposes intent through its execution coordinator.
 * A cancellation signal applies to preparation only; nothing after the durable
 * beforePush boundary reads it, the renderer owner or the ephemeral review again.
 */
export const createMigrationPublicationService = (deps: MigrationPublicationDependencies) => {
  const store = createMigrationPublicationStore(deps.userData);
  const assignment = createAssignmentMigrationPlanningService({
    reviewService: deps.reviewService
  });
  const removal = createGraderRemovalHandoffService({ reviewService: deps.reviewService });
  const backend = loadMigrationReviewBackend;
  const factory =
    deps.factory ??
    (new (backend().GitCommandWorkspaceFactory)(
      backend().createMigrationGitRunners()
    ) as unknown as GitWorkspaceFactory);
  const authenticate =
    deps.authenticate ??
    ((token: string) =>
      backend().createAuthenticatedMigrationGitWorkspace(
        token
      ) as unknown as AuthenticatedGitWorkspaceContext);
  const observe = (input: ManagedOperationInput) =>
    (
      deps.observe ??
      ((operation) =>
        createMigrationReviewReader(operation, deps.userData, null, backend()).observe())
    )(input);
  const recover = async (
    input: ManagedOperationInput,
    intent: Backend.MigrationPublicationIntent
  ): Promise<MigrationPublicationOutcome> => {
    try {
      if (
        input.userId !== intent.binding.authenticatedGithubUserId ||
        input.course.repositoryId !== intent.binding.repositoryId ||
        input.course.organizationId !== intent.binding.organizationId ||
        !(await input.revalidateSession())
      )
        return unknownOutcome();
      const current = await observe(input);
      if (
        current.repository.disabled ||
        current.repository.id !== intent.binding.repositoryId ||
        current.repository.organizationId !== intent.binding.organizationId ||
        current.repository.defaultBranch !== input.course.defaultBranch ||
        input.course.url !==
          `https://github.com/${current.repository.owner}/${current.repository.name}`
      )
        return unknownOutcome();
      const observation = await observeManagedCoursePublication({
        userData: deps.userData,
        input,
        authenticate,
        factory,
        verifyCommit: (root, remoteCommit) =>
          backend().verifyMigrationPublicationCommit(root, intent, remoteCommit)
      });
      if (!observation.accepted)
        return {
          status: "not_published",
          action:
            "No publication commit is in authoritative history. Reopen and revalidate the current course review before an explicit retry."
        };
      let refreshed = false;
      try {
        const sync = await input.resynchronize?.(true);
        refreshed =
          (sync?.status === "up_to_date" || sync?.status === "updated") &&
          sync.currentCommit === observation.remoteCommit;
      } catch {
        /* Confirmed v2 remains authoritative. */
      }
      try {
        deps.changed?.();
      } catch {
        /* Closed renderer cannot alter remote outcome. */
      }
      return { status: "published", commit: intent.commit, refreshRequired: !refreshed };
    } catch {
      return unknownOutcome();
    }
  };
  return {
    hasIntent(userId: number, repositoryId: number): boolean {
      return store.read(userId, repositoryId) !== null;
    },
    /** Restart recovery reads remote history and exact commit objects, never resumes a push. */
    async recover(userId: number, repositoryId: number): Promise<MigrationPublicationOutcome> {
      try {
        const intent = store.read(userId, repositoryId);
        if (!intent)
          return {
            status: "not_published",
            action: "No retained publication intent exists. Reopen review before publishing."
          };
        return await deps.session.withSynchronizedCourse(repositoryId, userId, (input) =>
          recover(input, intent)
        );
      } catch {
        return unknownOutcome();
      }
    },
    async publish(
      owner: number,
      submitted: MigrationReviewSessionRequest,
      cancellation?: AbortSignal,
      onPhase?: (phase: MigrationPublicationPhase, cancellable: boolean) => void
    ): Promise<MigrationPublicationOutcome> {
      let nonCancellable = false;
      let intentWritten = false;
      const progress = (phase: MigrationPublicationPhase): void => {
        try {
          onPhase?.(phase, !nonCancellable);
        } catch {
          /* UI delivery never changes backend outcome. */
        }
      };
      const preparing = (): void => {
        if (!nonCancellable && cancellation?.aborted)
          throw new PublicationRefused({ status: "cancelled" });
      };
      try {
        if (!isMigrationReviewSessionRequest(submitted))
          return {
            status: "blocked",
            action:
              "Use the exact retained migration review; publication assertions are not accepted."
          };
        const request = Object.freeze({
          ...submitted,
          source: Object.freeze({ ...submitted.source })
        });
        preparing();
        progress("preparing");
        return await deps.session.withSynchronizedCourse(
          request.source.repositoryId,
          request.source.authenticatedGithubUserId,
          async (input, sync) => {
            const pending = store.read(input.userId, input.course.repositoryId);
            if (pending) {
              const recovered = await recover(input, pending);
              if (recovered.status !== "not_published") return recovered;
            }
            const sourceSha = requireSynchronizedCommit(input.course, sync);
            if (sourceSha !== request.source.sourceCommitSha)
              refuse("The authoritative course changed. Refresh analysis and renew the review.");
            preparing();
            const retained = await deps.reviewService.getCheckpointHandoff(owner, request);
            if (!retained)
              return { status: "blocked", action: "Complete the current migration review first." };
            const assignmentPlan = await assignment.getPlan(owner, request);
            const grader = await removal.getHandoff(owner, request);
            if (!assignmentPlan || !grader)
              return {
                status: "blocked",
                action: "Complete assignment and grader-access review first."
              };
            const acknowledgement = await deps.reviewService.getAcknowledgement(owner, request);
            const b = backend();
            const artifacts: Backend.MigrationCandidateInput = {
              snapshot: retained.snapshot,
              analysis: retained.analysis,
              review: retained.review,
              assignmentPlan,
              graderRemovalPlan: grader.plan,
              boundary: b.STAGED_PHASE_9_BOUNDARY
            };
            const candidate = b.buildMigrationCandidate(artifacts);
            const binding = b.migrationPublicationBinding(artifacts, candidate, {
              sessionId: request.sessionId,
              completionId: retained.reviewId,
              generation: retained.generation
            });
            const revalidate = async (): Promise<void> => {
              preparing();
              if (
                input.signal.aborted ||
                input.userId !== binding.authenticatedGithubUserId ||
                input.course.repositoryId !== binding.repositoryId ||
                input.course.organizationId !== binding.organizationId ||
                !(await input.revalidateSession())
              )
                refuse("Account authorization changed. Refresh course access and renew review.");
              await retained.revalidate();
              await grader.revalidate();
              await acknowledgement.revalidate();
              const currentAssignment = await assignment.getPlan(owner, request);
              const currentGrader = await removal.getHandoff(owner, request);
              if (
                b.migrationFingerprint(currentAssignment) !== binding.assignmentPlanId ||
                b.migrationFingerprint(currentGrader?.plan) !== binding.graderRemovalPlanId
              )
                refuse("Trusted handoffs changed. Renew review.");
              const current = await observe(input);
              const repository = current.repository;
              const source = retained.analysis.source;
              if (
                repository.disabled ||
                repository.id !== binding.repositoryId ||
                repository.organizationId !== binding.organizationId ||
                repository.owner !== source.organizationLogin ||
                repository.name !== source.repositoryName ||
                repository.defaultBranch !== input.course.defaultBranch ||
                input.course.url !== `https://github.com/${repository.owner}/${repository.name}` ||
                current.sourceCommitSha !== binding.sourceCommitSha
              )
                refuse(
                  "Canonical repository, organization or reviewed source changed. Refresh analysis."
                );
              await retained.revalidate();
              await grader.revalidate();
              await acknowledgement.revalidate();
              if (!(await input.revalidateSession()))
                refuse("Authenticated session changed. Renew review.");
              preparing();
            };
            const ready = async (
              actualCandidate: Backend.MigrationCandidate = candidate
            ): Promise<void> => {
              await revalidate();
              const current = b.migrationPublicationBinding(
                artifacts,
                b.buildMigrationCandidate(artifacts),
                {
                  sessionId: request.sessionId,
                  completionId: retained.reviewId,
                  generation: retained.generation
                }
              );
              const readiness = await readMigrationPublicationReadiness({
                artifacts,
                candidate: actualCandidate,
                binding,
                current,
                authorizedFaculty: true,
                environment: "production",
                observationId: randomUUID()
              });
              if (
                !readiness.publicationReady ||
                !readiness.internalReady ||
                !readiness.productionEnablement.enabled ||
                readiness.productionEnablement.releaseAvailability !== "verified"
              )
                throw new PublicationRefused({
                  status: "blocked",
                  action:
                    "Publication requires current operational Schema v2 safeguards, authorized access-loss acknowledgement and verified signed/distributed macOS arm64 and Windows x64 releases with update prerequisites. Production evidence is unavailable.",
                  readiness
                });
              await revalidate();
            };
            progress("validating");
            await ready();
            progress("checkpointing");
            const remote = b.createTrustedGitRemote(`${input.course.url}.git`);
            const sourceCommit = b.createExactCommitRevision(binding.sourceCommitSha);
            if (!remote || !sourceCommit)
              return refuse("Invalid authoritative repository binding.");
            const checkpoint = await (
              deps.withCheckpointWorkspace ?? b.withMigrationCheckpointWorkspace
            )(remote, input.token, (workspace, authentication) =>
              b.verifyMigrationCheckpoint(
                workspace,
                { remote, sourceCommit, authentication },
                revalidate
              )
            );
            if (checkpoint.status !== "verified")
              return refuse(
                "The immutable Schema v1 remote checkpoint could not be independently verified. Resolve checkpoint access/conflicts before retrying."
              );
            progress("validating");
            await ready();
            const original = new Map(
              artifacts.snapshot.sourceBytesBase64
                ? Object.entries(artifacts.snapshot.sourceBytesBase64)
                : []
            );
            const approved = candidate.files.filter(
              (file) =>
                file.bytesBase64 !==
                (original.get(file.path) ??
                  (Object.hasOwn(artifacts.snapshot.sourceFiles, file.path)
                    ? Buffer.from(artifacts.snapshot.sourceFiles[file.path]!).toString("base64")
                    : undefined))
            );
            const paths = new Set(approved.map((file) => file.path));
            const identity = retained.review.facultyDirectory.find(
              (faculty) => faculty.github_user_id === input.userId
            );
            if (!identity) return refuse("Trusted faculty attribution is unavailable.");
            const result = await publishManagedCourseTransaction({
              userData: deps.userData,
              input: {
                ...input,
                resynchronize: async (afterPublication) => {
                  if (afterPublication) progress("synchronizing");
                  return input.resynchronize!(afterPublication);
                }
              },
              context: {
                managed: true,
                userId: input.userId,
                repositoryId: input.course.repositoryId,
                authoritativeCommit: sourceSha,
                operationalCommit: sourceSha,
                courseFolderId: `managed-course:${input.userId}:${input.course.repositoryId}`,
                courseFolderPath: managedCoursePath(
                  deps.userData,
                  input.userId,
                  input.course.repositoryId
                ),
                mode: "new_mutation",
                sessionGeneration: retained.generation
              },
              expectedRevision: sourceSha,
              author: {
                name: identity.github_login,
                email: `${input.userId}+${identity.github_login}@users.noreply.github.com`
              },
              allows: (file) => paths.has(file),
              validateChangedPaths: (changed) => {
                if (changed.length !== paths.size || changed.some((file) => !paths.has(file)))
                  throw new Error("Unexpected migration transaction paths.");
              },
              validateMetadata: (root) => b.verifyMigrationTransactionFiles(root, candidate.files),
              revalidateRepository: revalidate,
              changed: deps.changed ?? (() => {}),
              authenticate,
              factory,
              mutate: async (root) => {
                if (validateManagedStorage(deps.userData, root).length)
                  throw new Error("Unsafe migration workspace.");
                for (const file of approved) {
                  const target = path.join(root, ...file.path.split("/"));
                  fs.mkdirSync(path.dirname(target), { recursive: true });
                  fs.writeFileSync(target, Buffer.from(file.bytesBase64, "base64"));
                }
                return {
                  status: "success",
                  publication: undefined as { commit: string; refreshRequired: boolean } | undefined
                };
              },
              publication: {
                verifyAcceptance: true,
                beforeStage: async (root) => {
                  b.verifyMigrationTransactionFiles(root, candidate.files);
                  await ready(b.readMigrationTransactionCandidate(root, candidate));
                  b.verifyMigrationTransactionFiles(root, candidate.files);
                },
                beforePush: async (root, commit) => {
                  const intent: Backend.MigrationPublicationIntent = {
                    kind: "migration-publication-intent",
                    version: 1,
                    binding,
                    commit,
                    filesFingerprint: b.migrationFileSetFingerprint(candidate.files)
                  };
                  await b.verifyMigrationPublicationCommit(root, intent);
                  const finalCheckpoint = await (
                    deps.withCheckpointWorkspace ?? b.withMigrationCheckpointWorkspace
                  )(remote, input.token, (workspace, authentication) =>
                    b.verifyMigrationCheckpoint(
                      workspace,
                      { remote, sourceCommit, authentication },
                      revalidate,
                      { create: false }
                    )
                  );
                  if (finalCheckpoint.status !== "verified")
                    refuse(
                      "The immutable checkpoint changed. Resolve checkpoint verification before retrying."
                    );
                  await ready(b.readMigrationTransactionCandidate(root, candidate));
                  b.verifyMigrationTransactionFiles(root, candidate.files);
                  // Last cancellable check and durable intent are synchronous. From this
                  // point renderer cancellation/closure cannot interrupt push or observation.
                  preparing();
                  store.write(intent);
                  intentWritten = true;
                  nonCancellable = true;
                  progress("publishing");
                }
              }
            });
            if (result.publication)
              return {
                status: "published",
                commit: result.publication.commit,
                refreshRequired: result.publication.refreshRequired
              };
            return refuse("Candidate transaction did not establish remote publication.");
          }
        );
      } catch (error) {
        if (intentWritten) {
          if (
            error instanceof CourseMutationBlocked &&
            ["publication_failed", "remote_version_conflict"].includes(error.result.reason)
          )
            return {
              status: "not_published",
              action:
                "Fresh remote observation confirmed no publication. Renew source/review before an explicit retry."
            };
          return unknownOutcome();
        }
        if (error instanceof PublicationRefused) return error.outcome;
        if (cancellation?.aborted && !nonCancellable) return { status: "cancelled" };
        return {
          status: "blocked",
          action:
            "Publication stopped before any course push. Refresh course access, source and review, then resolve validation/checkpoint blockers before retrying."
        };
      }
    }
  };
};
