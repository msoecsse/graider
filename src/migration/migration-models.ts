import type {
  FacultyIdentity,
  RawAssignmentConfig,
  RawCourseConfigV1
} from "../config/config-models.js";

export type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export type EvidenceClass = "derived" | "requires_confirmation" | "unresolved" | "blocking";
export interface MigrationFact<T> {
  classification: EvidenceClass;
  value: T;
  evidence: string[];
}
export interface MigrationIssue {
  code: string;
  classification: "unresolved" | "blocking";
  location: string;
  message: string;
}
export interface MigrationDecision {
  key: string;
  classification: "requires_confirmation";
  reason: string;
  candidates: string[];
}
/** Trusted outer context; none of these IDs are inferred from config locators. */
export interface MigrationSourceBinding {
  repositoryId: number;
  sourceCommitSha: string;
  authenticatedGithubUserId: number;
  organizationId?: number;
  historicalOrganizationId?: number;
  historicalRepositoryId?: number;
  repositoryName: string;
  organizationLogin: string;
}
export interface TrustedFacultyIdentityEvidence {
  institutionalUsername: string;
  githubUserId: number;
  githubLogin: string;
  githubLoginHistory?: readonly string[];
  provenance: "authenticated-identity" | "trusted-identity-evidence";
  /** Authentication proves an institutional mapping only when explicitly verified outside v1. */
  reference: string;
}
export interface FacultyIdentitySuggestion {
  institutionalUsername: string;
  githubUserId?: number;
  githubLogin: string;
  reason: string;
}
export interface TermHistoryCommit {
  sha: string;
  parents: readonly string[];
  /** All term directories, including directories without term.yml, at this commit. */
  termCodes: readonly string[];
}
export interface MigrationHistoryEvidence {
  sourceCommitSha: string;
  /** Complete reachable DAG, genuine roots, no shallow/graft/replace boundary. */
  complete: boolean;
  commits: readonly TermHistoryCommit[];
}
export interface MigrationSnapshot {
  binding: MigrationSourceBinding;
  /** Complete regular-file inventory at binding.sourceCommitSha, never a working tree. */
  sourceFiles: Readonly<Record<string, string>>;
  runtime: {
    coverage: "not_applicable" | "machine_local" | "unavailable";
    files: Readonly<Record<string, string>>;
  };
  history?: MigrationHistoryEvidence;
  trustedIdentities?: readonly TrustedFacultyIdentityEvidence[];
  suggestions?: readonly FacultyIdentitySuggestion[];
  /** Read failures/non-regular source files supplied by the read-only adapter. */
  sourceProblems?: readonly string[];
}
export interface FacultyReference {
  provenance: "v1-term-section-faculty" | "assignment-faculty-owner";
  location: string;
  termCode: string;
  sectionId?: string;
  assignmentSlug?: string;
  originalSpelling: string;
}
export interface FacultyMigrationInventory {
  institutionalUsername: string;
  originalSpellings: string[];
  references: FacultyReference[];
  resolution: MigrationFact<FacultyIdentity | null>;
  trustedEvidence: TrustedFacultyIdentityEvidence[];
  suggestions: Array<FacultyIdentitySuggestion & { classification: "requires_confirmation" }>;
}
export type ApplyEvidenceState =
  | "not_observed"
  | "complete_evidence"
  | "partial_incomplete"
  | "ambiguous";
export interface ManifestMigrationEvidence {
  provenance: "source" | "runtime";
  location: string;
  contentFingerprint: string | null;
  state: "missing" | "loaded" | "invalid";
  classification: EvidenceClass;
  schemaVersion: number | null;
  applyState: ApplyEvidenceState;
  sectionStates: Array<{ sectionId: string; state: ApplyEvidenceState }>;
  repositories: Array<{
    studentId: string;
    githubUsername: string;
    sectionId: string;
    repositoryId: number | null;
    repositoryName: string;
    lifecycle: string;
  }>;
  targets: Array<{
    targetId: string;
    sectionIds: string[];
    studentIds: string[];
    repositoryName: string;
    lifecycle: string | null;
  }>;
  operations: Array<{
    command: string;
    status: string;
    completed: boolean;
    startedAt: string;
    completedAt: string | null;
  }>;
  studentMappings: Array<{
    studentId: string;
    githubUsername: string;
    targetId: string;
    repositoryName: string;
  }>;
  diagnostics: string[];
  /** Positive operational evidence only; never inferred from assignment status. */
  provesPriorActivity: boolean;
}
export interface GraderMigrationEvidence {
  location: string;
  provenance: "course-config" | "manifest-source" | "manifest-runtime";
  team: string | null;
  permission: string | null;
  classification: "derived";
}
export interface AssignmentMigrationInventory {
  termCode: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  sections: string[];
  facultyOwner: string | null;
  owner: MigrationFact<number[] | null>;
  ownerlessRepairRequired: boolean;
  groupFileEvidence: MigrationFact<{
    path: string;
    present: boolean;
    contentFingerprint: string | null;
  }> | null;
  sharedDeadline: MigrationFact<{
    deadline: RawAssignmentConfig["deadline"] | null;
    copyToSections: string[];
  }>;
  /** Validated v1 evidence only, deliberately not a v2 assignment write model. */
  configurationEvidence: MigrationFact<RawAssignmentConfig>;
  manifests: ManifestMigrationEvidence[];
  applyState: ApplyEvidenceState;
}
export interface TermMigrationInventory {
  code: string;
  academicYear: number;
  semester: number;
  displayName: string;
  sections: Array<{
    id: string;
    roster: string | null;
    facultyIdentities: string[];
    proposedCurrentFacultyIds: MigrationFact<number[] | null>;
  }>;
  facultyIdentities: string[];
  assignmentSlugs: string[];
  lifecycle: {
    status: MigrationFact<null>;
    hasEverBeenActive: MigrationFact<true | null>;
  };
  coordinatorSelection: MigrationFact<null>;
}
export interface CourseMigrationAnalysisData {
  kind: "schema-v1-migration-analysis";
  status: "ready_for_review" | "needs_attention" | "not_applicable" | "blocked";
  source: MigrationSourceBinding;
  /** Hash covers source, identity, runtime and history evidence, not paths or wall-clock time. */
  reportId: string;
  validatedMigrationFacts: boolean;
  summary: {
    terms: number;
    assignments: number;
    faculty: number;
    resolvedFaculty: number;
    unresolvedFaculty: number;
    blockingIssues: number;
    reviewDecisions: number;
    graderEvidence: number;
  };
  courseLifecycle: MigrationFact<"unarchived"> | null;
  courseConfigurationEvidence: MigrationFact<RawCourseConfigV1> | null;
  unassignedManifests: ManifestMigrationEvidence[];
  fallbackAdministrator: MigrationFact<null>;
  faculty: FacultyMigrationInventory[];
  provisionalFacultyDirectory: MigrationFact<FacultyIdentity[]>;
  unresolvedIdentities: string[];
  terms: TermMigrationInventory[];
  assignments: AssignmentMigrationInventory[];
  termCreationOrder: MigrationFact<string[] | null>;
  termCreationEvidence: Array<{ termCode: string; firstCommitSha: string }>;
  reviewDecisions: MigrationDecision[];
  issues: MigrationIssue[];
  grader: {
    activeV2Role: false;
    removalPhase: "9.4";
    statement: string;
    evidence: GraderMigrationEvidence[];
  };
  organization: MigrationFact<
    "organization_reconciled" | "organization_migration_required" | "organization_binding_unknown"
  >;
  locatorDrift: string[];
  runtimeCoverage: MigrationSnapshot["runtime"]["coverage"];
}
export type CourseMigrationAnalysis = Immutable<CourseMigrationAnalysisData>;
