import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";
import { loadMigrationReviewBackend } from "./migrationReviewService.js";
export interface MigrationTransactionReadiness {
  readonly publicationReady: boolean;
  readonly internalReady: boolean;
  readonly blockers: Backend.MigrationPublicationResult["blockers"];
  readonly productionEnablement: {
    readonly enabled: boolean;
    readonly releaseAvailability: "verified" | "unproven";
    readonly blockers: Backend.MigrationPublicationResult["productionEnablement"]["blockers"];
  };
}
/** Fixed production composition. No synthetic provider, environment flag, version string,
 * renderer assertion or injected readiness override can grant publication here.
 */
export const readMigrationPublicationReadiness = async (
  context: Backend.MigrationPublicationContext
): Promise<MigrationTransactionReadiness> =>
  loadMigrationReviewBackend().validateMigrationPublication(
    {
      artifacts: context.artifacts,
      candidate: context.candidate,
      binding: context.binding,
      current: context.current,
      authorizedFaculty: context.authorizedFaculty,
      observationId: context.observationId,
      environment: "production"
    },
    { candidate: context.candidate, binding: context.binding }
  );
