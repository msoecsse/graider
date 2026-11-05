import type {
  ApplyEvidenceState,
  AssignmentMigrationInventory,
  CourseMigrationAnalysis,
  GraderMigrationEvidence,
  Immutable,
  ManifestMigrationEvidence
} from "./migration-models.js";
import type { MigrationReviewSource } from "./migration-review-models.js";

export type AssignmentMigrationPlanStatus =
  | "ready"
  | "needs_attention"
  | "blocked"
  | "not_applicable";
export type AssignmentMigrationFindingCode =
  | "review_binding_invalid"
  | "review_not_authorized"
  | "owner_evidence_conflict"
  | "owner_repair_required"
  | "owner_unresolved"
  | "section_scope_conflict"
  | "apply_incomplete"
  | "apply_ambiguous"
  | "repository_identity_unresolved"
  | "group_targets_unresolved"
  | "legacy_closed_unresolved"
  | "draft_activity_conflict"
  | "assignment_evidence_unresolved";
export interface AssignmentMigrationFinding {
  code: AssignmentMigrationFindingCode;
  message: string;
  termCode?: string;
  assignmentSlug?: string;
  sectionId?: string;
}
export interface AssignmentSectionMigrationProjection {
  sectionId: string;
  status: "ready" | "needs_attention";
  schedule: AssignmentMigrationInventory["sharedDeadline"]["value"]["deadline"];
  /** No migration evidence can manufacture an intentional opt-out. */
  usage: "available" | "prior_activity" | "unresolved";
  provisioning: ApplyEvidenceState;
  /** Indices into this assignment's manifest evidence, preserving both provenances. */
  manifestEvidenceIndices: number[];
}
export interface AssignmentMigrationProjection {
  termCode: string;
  assignmentSlug: string;
  title: string;
  type: string;
  status: "ready" | "needs_attention";
  legacyStatus: string;
  preserveOperationalHistory: boolean;
  owners: number[] | null;
  ownerRepairRequired: boolean;
  ownerEvidence: Immutable<AssignmentMigrationInventory["owner"]>;
  originalFacultyOwner: string | null;
  /** Validated analyzer provenance, not raw YAML or a final serialization model. */
  configurationEvidence: Immutable<AssignmentMigrationInventory["configurationEvidence"]>;
  deadlineEvidence: Immutable<AssignmentMigrationInventory["sharedDeadline"]>;
  groupFileEvidence: Immutable<AssignmentMigrationInventory["groupFileEvidence"]>;
  applyState: ApplyEvidenceState;
  manifests: ManifestMigrationEvidence[];
  sections: AssignmentSectionMigrationProjection[];
}
export interface AssignmentMigrationPlanData {
  kind: "schema-v1-assignment-migration-plan";
  status: AssignmentMigrationPlanStatus;
  publicationReady: false;
  source: MigrationReviewSource;
  assignments: AssignmentMigrationProjection[];
  findings: AssignmentMigrationFinding[];
  runtimeCoverage: CourseMigrationAnalysis["runtimeCoverage"];
  organizationCondition: CourseMigrationAnalysis["organization"]["value"];
  publicationBlockers: string[];
  grader: { removalPhase: "9.4"; evidence: GraderMigrationEvidence[]; debtPresent: boolean };
}
export type AssignmentMigrationPlan = Immutable<AssignmentMigrationPlanData>;
