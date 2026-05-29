import type { SourceFileHash } from "../config/source-fingerprint.js";
import type { CommandStatus } from "../core/command-result.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubPermission } from "../github/github-models.js";
import type { RosterStatus } from "../roster/roster-models.js";

export const MANIFEST_SCHEMA_VERSION = 1;

export const MANIFEST_LIFECYCLE_STATUSES = [
  "created",
  "active",
  "archived",
  "access_removed",
  "missing",
  "error"
] as const;

export type ManifestLifecycleStatus = (typeof MANIFEST_LIFECYCLE_STATUSES)[number];
export type ManifestPermission = Exclude<GitHubPermission, "none">;

export interface Manifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  assignment: ManifestAssignment;
  source: ManifestSource;
  template: ManifestTemplate;
  repositories: ManifestRepositoryRecord[];
  operationHistory: ManifestOperationRecord[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

export interface ManifestAssignment {
  termCode: string;
  courseCode: string;
  assignmentSlug: string;
  assignmentTitle: string;
}

export interface ManifestSource {
  sourceFiles: SourceFileHash[];
  inputFingerprint: string;
}

export interface ManifestTemplate {
  repository: string;
  branch: string;
  commitSha?: string;
}

export interface ManifestRepositoryRecord {
  studentId: string;
  githubUsername: string;
  section: string;
  rosterStatus: RosterStatus;
  repository: ManifestRepositoryIdentity;
  permissions: ManifestPermissionState;
  actions: ManifestActionsState;
  lifecycle: ManifestLifecycleState;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

export interface ManifestRepositoryIdentity {
  owner: string;
  name: string;
  fullName: string;
  id?: number;
  htmlUrl?: string;
  createdFromTemplate: boolean;
  templateRepository: string;
  templateCommitSha?: string;
  createdAt?: string;
  lastObservedAt?: string;
}

export interface ManifestPermissionState {
  student?: ManifestCollaboratorPermission;
  facultyTeam?: ManifestTeamPermission;
  graderTeam?: ManifestTeamPermission;
}

export interface ManifestCollaboratorPermission {
  username: string;
  permission: ManifestPermission;
  pendingInvite: boolean;
  lastAppliedAt?: string;
  lastObservedAt?: string;
}

export interface ManifestTeamPermission {
  teamSlug: string;
  permission: ManifestPermission;
  lastAppliedAt?: string;
  lastObservedAt?: string;
}

export interface ManifestActionsState {
  enabled: boolean;
  gradingWorkflowPath?: string;
  gradingWorkflowFound?: boolean;
  workflowDispatchSupported?: boolean;
  lastObservedAt?: string;
}

export interface ManifestLifecycleState {
  repositoryArchived: boolean;
  studentAccessRemoved: boolean;
  status: ManifestLifecycleStatus;
  lastChangedAt?: string;
}

export interface ManifestOperationRecord {
  command: string;
  startedAt: string;
  completedAt?: string;
  status: CommandStatus;
  summary: Record<string, unknown>;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}
