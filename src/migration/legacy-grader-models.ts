import type {
  GitHubCoursePermissionClient,
  GitHubManagedTeamClient
} from "../github/github-client.js";
import type { GitHubPermission } from "../github/github-models.js";
import type {
  GraderMigrationEvidence,
  Immutable,
  MigrationSourceBinding
} from "./migration-models.js";

/** Backend-only GET capability. No mutation, filesystem, Git or renderer authority. */
export type LegacyGraderReadClient = Pick<
  GitHubManagedTeamClient,
  | "getOrganizationScopeResponse"
  | "getOrganizationMembership"
  | "listManagedOrganizationTeamsPage"
  | "getManagedTeam"
  | "listManagedTeamMembersPage"
> &
  Pick<GitHubCoursePermissionClient, "getCourseRepositoryById" | "listCourseRepositoryTeamsPage">;
export type LegacyGraderFindingCode =
  | "review_binding_invalid"
  | "review_not_authorized"
  | "account_identity_conflict"
  | "organization_identity_conflict"
  | "grader_evidence_conflict"
  | "grant_evidence_mismatch"
  | "team_locator_unresolved"
  | "team_missing"
  | "team_ambiguous"
  | "team_identity_conflict"
  | "member_identity_conflict"
  | "repository_identity_unresolved"
  | "repository_identity_conflict"
  | "runtime_repository_unproven"
  | "manifest_evidence_incomplete"
  | "runtime_coverage_unknown"
  | "observation_incomplete";
export interface LegacyGraderFinding {
  code: LegacyGraderFindingCode;
  classification: "unresolved" | "blocking";
  location: string;
}
export interface LegacyRepositoryEvidence {
  provenance: "course-config" | "source" | "runtime";
  location: string;
  repositoryId: number | null;
  repositoryName: string;
}
export interface LegacyRepositoryObservation {
  repositoryId: number;
  owner: string | null;
  name: string | null;
  evidence: LegacyRepositoryEvidence[];
  associationsComplete: boolean;
  associations: Array<{
    teamId: number;
    slug: string;
    permission: GitHubPermission;
    parentId: number | null;
    /** Exact ID correlation only; never a managed-team or cleanup authorization. */
    legacyCandidate: boolean;
  }>;
}
export interface LegacyGraderInventoryData {
  kind: "schema-v1-legacy-grader-inventory";
  status: "ready" | "needs_attention" | "blocked" | "not_applicable";
  publicationReady: false;
  source: MigrationSourceBinding & { reportId: string };
  runtimeCoverage: "not_applicable" | "machine_local" | "unavailable";
  evidence: GraderMigrationEvidence[];
  repositoryEvidence: LegacyRepositoryEvidence[];
  candidate: null | {
    classification: "legacy_candidate";
    organizationId: number;
    organizationLogin: string;
    slug: string;
    teamId: number | null;
    membershipComplete: boolean;
    members: Array<{ id: number; login: string }>;
  };
  repositories: LegacyRepositoryObservation[];
  findings: LegacyGraderFinding[];
}
export type LegacyGraderInventory = Immutable<LegacyGraderInventoryData>;
