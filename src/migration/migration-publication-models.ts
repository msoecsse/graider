import type { MigrationCandidate, MigrationCandidateInput } from "./migration-candidate.js";
import type { Immutable } from "./migration-models.js";

export interface MigrationPublicationSession {
  readonly sessionId: string;
  /** Identity of this completion, including identical renewed reviews. */
  readonly completionId: string;
  readonly generation: number;
}
export interface MigrationPublicationBinding extends MigrationPublicationSession {
  readonly repositoryId: number;
  readonly organizationId: number;
  readonly authenticatedGithubUserId: number;
  readonly sourceCommitSha: string;
  readonly reportId: string;
  readonly reviewId: string;
  readonly assignmentPlanId: string;
  readonly graderRemovalPlanId: string;
  readonly candidateFingerprint: string;
}
export const MIGRATION_SAFEGUARDS = [
  "access",
  "unsupportedSchema",
  "staleCache",
  "legacyMutations",
  "authoritativeRevision",
  "overwrite",
  "downgrade"
] as const;
export const MIGRATION_RELEASE_REQUIREMENTS = [
  "macosArm64",
  "windowsX64",
  "signing",
  "distribution",
  "updates"
] as const;

/** An explicit test seam, NOT a production attestation format/provider. No serialized
 * assertion, including scope, can enable production. #22/#23/#25 and Phase 3 must
 * supply independently trusted evidence in future production composition. */
export interface MigrationCompatibilityEvidence {
  readonly scope: "synthetic";
  readonly observationId: string;
  readonly binding: MigrationPublicationBinding;
  readonly operationalSchema: number | null;
  readonly safeguards: Readonly<Record<(typeof MIGRATION_SAFEGUARDS)[number], boolean | null>>;
  readonly acknowledgement: {
    readonly binding: MigrationPublicationBinding;
    readonly githubUserId: number;
    readonly consequence: "incompatible-clients-lose-access-until-update";
  } | null;
  readonly releases: Readonly<
    Record<(typeof MIGRATION_RELEASE_REQUIREMENTS)[number], "verified" | "unknown" | "unavailable">
  >;
}

/** Backend-owned arguments only. Never deserialize this context or accept it via IPC.
 * Outer main code must re-enter completed handoffs and observe source/account/session/
 * faculty authority immediately before calling. current is that independent observation,
 * not a copy of submitted assertions. observationId identifies the current observation.
 * No freshness reads or mutations occur inside the validator. */
export interface MigrationPublicationContext {
  readonly artifacts: MigrationCandidateInput;
  readonly candidate: MigrationCandidate;
  readonly binding: MigrationPublicationBinding;
  readonly current: MigrationPublicationBinding;
  readonly authorizedFaculty: boolean;
  readonly environment: "production" | "synthetic";
  readonly observationId: string;
  readonly compatibility?: MigrationCompatibilityEvidence;
}
export type MigrationPublicationBlockerCode =
  | "request_invalid"
  | "source_binding_invalid"
  | "faculty_not_authorized"
  | "review_incomplete"
  | "grader_review_invalid"
  | "plan_invalid"
  | "candidate_untrusted"
  | "candidate_tampered"
  | "candidate_blocked"
  | "course_identity_invalid"
  | "faculty_directory_invalid"
  | "faculty_reference_invalid"
  | "faculty_history_invalid"
  | "term_creation_order_invalid"
  | "term_lifecycle_invalid"
  | "assignment_owner_invalid"
  | "assignment_lifecycle_unresolved"
  | "section_reference_invalid"
  | "section_evidence_invalid"
  | "manifest_provenance_invalid"
  | "grader_desired_state"
  | "organization_not_permitted"
  | "preservation_invalid"
  | "unsafe_path"
  | "file_preservation_invalid"
  | "file_integrity_invalid"
  | "schema_unsupported"
  | "metadata_version_unsupported"
  | "snapshot_invalid"
  | "compatibility_missing"
  | "compatibility_stale"
  | "compatibility_untrusted"
  | "operational_support_unknown"
  | "operational_support_incompatible"
  | "safeguard_unproven"
  | "acknowledgement_invalid";
export interface MigrationPublicationBlocker {
  readonly code: MigrationPublicationBlockerCode;
  readonly location: string;
  readonly action: string;
}
export interface MigrationDeferredFinding {
  readonly code: string;
  readonly location: string;
  readonly phase: "9" | "13" | "14" | "later";
  readonly classification: "deferred" | "needs_attention";
  readonly message: string;
}
export interface MigrationProductionBlocker {
  readonly code:
    | "synthetic_evidence"
    | "production_evidence_unavailable"
    | "production_release_unproven"
    | "publication_facts_unproven";
  readonly location: string;
  readonly action: string;
}
export interface MigrationPublicationResultData {
  kind: "schema-v2-migration-publication-validation";
  status: "blocked" | "implementation_ready";
  internalReady: boolean;
  /** No production evidence provider exists in this slice. */
  publicationReady: false;
  candidateFingerprint: string;
  provenance: {
    binding: MigrationPublicationBinding;
    source: MigrationCandidateInput["analysis"]["source"];
    boundary: MigrationCandidateInput["boundary"];
    inventoryId: string;
    inventoryFingerprint: string;
    accessReviewId: string;
    snapshotFingerprint: string;
  };
  blockers: MigrationPublicationBlocker[];
  deferredFindings: MigrationDeferredFinding[];
  compatibility: {
    operationalSupport: "verified" | "unproven";
    safeguards: "verified" | "unproven";
    acknowledgement: "verified" | "unproven";
    evidenceScope: "synthetic" | "unavailable";
  };
  productionEnablement: {
    enabled: false;
    releaseAvailability: "verified" | "unproven";
    blockers: MigrationProductionBlocker[];
  };
}
export type MigrationPublicationResult = Immutable<MigrationPublicationResultData>;
