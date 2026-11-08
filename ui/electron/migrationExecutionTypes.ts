import type {
  MigrationReviewSessionRequest,
  MigrationReviewLoadRequest
} from "./migrationReviewService.js";
import type * as Backend from "../dist-electron/migrationReconciliationBackend.cjs";
type MigrationPublicationPhase =
  | "preparing"
  | "validating"
  | "checkpointing"
  | "publishing"
  | "synchronizing";
export interface MigrationExecutionRequest extends MigrationReviewSessionRequest {
  readonly confirmed: true;
}
export interface MigrationRecoveryRequest extends MigrationReviewLoadRequest {
  readonly freshPlan?: true;
}
export interface MigrationHistory {
  readonly source: string;
  readonly checkpoint: string;
  readonly publication: string;
  readonly migrationDate: string | null;
  readonly reviewedAuthority: Backend.MigrationHistorySnapshot["reviewedAuthority"] | null;
  readonly currentAccess: "ready" | "needs_attention";
  readonly journalRevision: string;
  readonly executionState: "current_plan" | "fresh_plan_required";
  readonly operationalReadiness: "unverified";
  readonly reviewedIdentity: number;
  readonly review: Backend.MigrationHistorySnapshot["metadata"]["audit"]["review"];
  readonly reviewedRoles: NonNullable<
    Backend.MigrationHistorySnapshot["metadata"]["recovery"]
  >["legacy"]["facultyTerms"];
  readonly findings: Backend.MigrationHistorySnapshot["metadata"]["findings"];
  readonly deferredWork: Backend.MigrationHistorySnapshot["metadata"]["deferred_work"];
  readonly evidence: Backend.MigrationHistorySnapshot["metadata"]["evidence"];
  readonly reconciliation: Backend.ReconciliationRecord | null;
}
export type MigrationStage = MigrationPublicationPhase | "reconciling" | "recovering";
export interface MigrationExecutionState {
  readonly selector: string;
  readonly active: boolean;
  readonly cancellable: boolean;
  readonly phase: MigrationStage;
  readonly stages: readonly {
    readonly phase: MigrationStage;
    readonly status: "running" | "complete" | "needs_attention";
  }[];
  readonly outcome:
    | "idle"
    | "running"
    | "ready"
    | "needs_attention"
    | "not_published"
    | "outcome_unknown";
  readonly published: true | false | null;
  readonly action: string;
  readonly refreshRequired: boolean;
  readonly blockers: readonly {
    readonly code: string;
    readonly location: string;
    readonly action: string;
  }[];
}

export interface MigrationExecutionApi {
  start(request: MigrationExecutionRequest): Promise<MigrationExecutionState>;
  status(request: MigrationReviewLoadRequest): Promise<MigrationExecutionState>;
  active(): Promise<MigrationExecutionState | null>;
  cancel(request: MigrationReviewLoadRequest): Promise<MigrationExecutionState>;
  recover(request: MigrationReviewLoadRequest): Promise<MigrationExecutionState>;
  history(request: MigrationReviewLoadRequest): Promise<MigrationHistory>;
  retry(request: MigrationRecoveryRequest): Promise<MigrationExecutionState>;
}

export const MIGRATION_STATUS_POLL_MS = 750;
