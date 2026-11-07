import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";
import {
  isMigrationReviewSessionRequest,
  loadMigrationReviewBackend,
  type MigrationReviewService,
  type MigrationReviewSessionRequest
} from "./migrationReviewService.js";

export interface GraderRemovalHandoffDependencies {
  readonly reviewService: Pick<
    MigrationReviewService,
    "getCompleted" | "getCompletedGraderHandoff"
  >;
  readonly backend?: () => Pick<
    typeof Backend,
    | "planAssignmentMigration"
    | "planGraderRemoval"
    | "LegacyGraderReconciler"
    | "rawCourseConfigV2Schema"
    | "rawTermConfigV2Schema"
  >;
  /** Main-only composition for 9.5. Not installed in production controls or IPC.
   * readPublished must independently synchronize/verify publication from this exact
   * review/source, including complete terms/targets and current faculty authority.
   * It returns null until that proof exists; working-tree/caller assertions cannot qualify.
   * The caller serializes publication/reconciliation with other course/session work.
   */
  readonly publication?: {
    readonly readPublished: (
      owner: number,
      request: MigrationReviewSessionRequest,
      signal: AbortSignal
    ) => Promise<Backend.PublishedGraderContext | null>;
    readonly client: Backend.GitHubCoursePermissionClient & Backend.GitHubManagedTeamClient;
    readonly organizationAccess: Backend.LegacyGraderDependencies["organizationAccess"];
    readonly creationJournal: Backend.LegacyGraderDependencies["creationJournal"];
  };
}
const TIMEOUT_MS = 30_000;
const SHA = /^[0-9a-f]{40}$/;

/** On-demand retained authority only. No publication, migration writes or cached proof. */
export const createGraderRemovalHandoffService = (deps: GraderRemovalHandoffDependencies) => ({
  async getHandoff(owner: number, input: MigrationReviewSessionRequest) {
    if (!isMigrationReviewSessionRequest(input)) throw new Error("Invalid review binding.");
    const backend = (deps.backend ?? loadMigrationReviewBackend)();
    const request = Object.freeze({ ...input, source: Object.freeze({ ...input.source }) });
    const completed = await deps.reviewService.getCompleted(owner, request);
    if (!completed) return null;
    const retained = await deps.reviewService.getCompletedGraderHandoff(owner, request);
    if (!retained) return null;
    if (retained.analysis !== completed.analysis || retained.review !== completed.review)
      throw new Error("Migration review was replaced.");
    const assignment = backend.planAssignmentMigration(retained.analysis, retained.review);
    const plan = backend.planGraderRemoval(
      retained.analysis,
      retained.review,
      assignment,
      retained.inventory,
      retained.access
    );
    await retained.revalidate();
    // Every invocation and every backend checkpoint obtains independent publication proof.
    const readPublished = async (signal: AbortSignal): Promise<Backend.PublishedGraderContext> => {
      signal.throwIfAborted();
      const observed = await deps.publication?.readPublished(owner, request, signal);
      if (!observed) throw new Error("Verified v2 publication is required.");
      const published = structuredClone(observed);
      const source = retained.analysis.source;
      if (
        !published.authorized ||
        published.sessionId !== request.sessionId ||
        published.courseRepositoryId !== source.repositoryId ||
        published.organizationId !== source.organizationId ||
        published.authenticatedUserId !== source.authenticatedGithubUserId ||
        !SHA.test(published.publishedRevision) ||
        published.publishedRevision === source.sourceCommitSha ||
        published.course.github.organization !== source.organizationLogin ||
        published.course.course.repository !== source.repositoryName
      )
        throw new Error("Published migration binding changed.");
      backend.rawCourseConfigV2Schema.parse(published.course);
      published.terms.forEach((term) => backend.rawTermConfigV2Schema.parse(term));
      await retained.revalidate(published.publishedRevision);
      signal.throwIfAborted();
      return published;
    };
    return Object.freeze({
      plan,
      async reconcile(signal = AbortSignal.timeout(TIMEOUT_MS)) {
        if (!deps.publication || !["ready", "needs_attention"].includes(plan.status))
          throw new Error("Grader reconciliation is unavailable.");
        const context = await readPublished(signal);
        const reconciler = new backend.LegacyGraderReconciler(
          deps.publication.client,
          context,
          plan,
          {
            readPublished,
            organizationAccess: deps.publication.organizationAccess,
            creationJournal: deps.publication.creationJournal
          }
        );
        return reconciler.reconcile(signal);
      }
    });
  }
});
