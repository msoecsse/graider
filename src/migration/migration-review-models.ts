import type { FacultyIdentity, TermLifecycleStatus } from "../config/config-models.js";
import type { CourseMigrationAnalysis, Immutable, MigrationIssue } from "./migration-models.js";

export interface MigrationReviewSource {
  readonly repositoryId: number;
  readonly sourceCommitSha: string;
  readonly reportId: string;
  readonly authenticatedGithubUserId: number;
}
/** Main-process issued receipt, never a renderer-supplied identity assertion. */
export interface VerifiedMigrationFaculty {
  readonly identity: Immutable<FacultyIdentity>;
  readonly verificationId: string;
  readonly origin: "analysis" | "explicit_review" | "explicit_addition";
}
export interface MigrationReviewAcknowledgement {
  readonly kind: "ownerless_assignment" | "legacy_closed" | "group_targets";
  readonly termCode: string;
  readonly assignmentSlug: string;
}
export interface MigrationReviewTermDecision {
  readonly termCode: string;
  readonly currentCoordinatorUsernames: readonly string[];
  readonly status: TermLifecycleStatus | null;
  readonly hasEverBeenActive: boolean | null;
}
/** IDs/fingerprint here are assertions compared with retained main-process context. */
export interface MigrationReviewSubmission {
  readonly source: MigrationReviewSource;
  readonly facultyMappings: readonly {
    readonly institutionalUsername: string;
    readonly verificationId: string;
  }[];
  readonly fallbackAdministratorUsername: string | null;
  readonly creationOrder: { readonly termCodes: readonly string[]; readonly confirmed: boolean };
  readonly terms: readonly MigrationReviewTermDecision[];
  readonly acknowledgements: readonly MigrationReviewAcknowledgement[];
}
export interface MigrationReviewProblem {
  readonly key: string;
  readonly message: string;
}
export interface MigrationReviewResultData {
  kind: "schema-v1-migration-review";
  status: "incomplete" | "complete" | "blocked" | "stale" | "not_applicable";
  source: MigrationReviewSource;
  /** Even complete reviews authorize no publication. 9.5 must revalidate again. */
  publicationReady: false;
  courseLifecycle: "unarchived";
  facultyDirectory: FacultyIdentity[];
  fallbackAdministratorGithubUserId: number | null;
  termCreationOrder: string[];
  terms: Array<{
    termCode: string;
    currentCoordinatorGithubUserIds: number[];
    status: TermLifecycleStatus | null;
    hasEverBeenActive: boolean | null;
    sections: Array<{ sectionId: string; currentFacultyGithubUserIds: number[] | null }>;
  }>;
  acknowledgements: MigrationReviewAcknowledgement[];
  missingDecisions: MigrationReviewProblem[];
  errors: MigrationReviewProblem[];
  remainingIssues: MigrationIssue[];
  publicationBlockers: string[];
  conversionNeedsAttention: string[];
  deferredMigrationWork: string[];
  preservation: CourseMigrationAnalysis["preservation"];
  organizationCondition: CourseMigrationAnalysis["organization"]["value"];
  graderDebtPresent: boolean;
  assignmentReviewSummary: Array<{
    termCode: string;
    slug: string;
    legacyStatus: string;
    proposedOwnerGithubUserIds: number[] | null;
    ownerlessRepairRequired: boolean;
    applyState: string;
  }>;
}
export type MigrationReviewResult = Immutable<MigrationReviewResultData>;
export interface MigrationReviewContext {
  readonly analysis: CourseMigrationAnalysis;
  /** Trusted service-owned records; IPC may never populate this argument. */
  readonly verifiedFaculty: readonly VerifiedMigrationFaculty[];
}
export interface MigrationReviewSessionView extends MigrationReviewContext {
  readonly sessionId: string;
  readonly selector: string;
}
