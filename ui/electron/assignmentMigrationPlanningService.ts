import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";
import {
  loadMigrationReviewBackend,
  type MigrationReviewService,
  type MigrationReviewSessionRequest
} from "./migrationReviewService.js";

export interface AssignmentMigrationPlanningServiceDependencies {
  readonly reviewService: Pick<MigrationReviewService, "getCompleted">;
  /** Main-only dependency injection; never accepted from a renderer or IPC request. */
  readonly backend?: () => Pick<typeof Backend, "planAssignmentMigration">;
}

/**
 * On-demand main-only handoff for later migration work. getCompleted owns all session,
 * authorization and freshness checks. Plans are neither cached nor publication authority.
 */
export const createAssignmentMigrationPlanningService = (
  deps: AssignmentMigrationPlanningServiceDependencies
) => ({
  async getPlan(
    owner: number,
    request: MigrationReviewSessionRequest
  ): Promise<Backend.AssignmentMigrationPlan | null> {
    const completed = await deps.reviewService.getCompleted(owner, request);
    if (completed === null) return null;
    return (deps.backend ?? loadMigrationReviewBackend)().planAssignmentMigration(
      completed.analysis,
      completed.review
    );
  }
});
