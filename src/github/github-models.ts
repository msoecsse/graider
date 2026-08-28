export interface GitHubUser {
  username: string;
  id?: number;
}

export interface GitHubRepository {
  owner: string;
  name: string;
  fullName: string;
  id: number;
  private: boolean;
  archived: boolean;
  defaultBranch: string;
  htmlUrl: string;
}

export interface GitHubTemplateRepository extends GitHubRepository {
  isTemplate: boolean;
  branches: string[];
  files: string[];
  latestCommitSha: string;
}

export interface GitHubTeam {
  org: string;
  slug: string;
  name: string;
  id?: number;
}

export type GitHubPermission = "none" | "pull" | "triage" | "push" | "maintain" | "admin";

export interface GitHubPermissionState {
  permission: GitHubPermission;
  pendingInvite: boolean;
}

export interface GitHubCollaboratorPermissionState extends GitHubPermissionState {
  username: string;
}

export interface GitHubCollaboratorResult {
  username: string;
  permission: GitHubPermission;
  pendingInvite: boolean;
}

export type GitHubActionsState = "enabled" | "disabled";

export interface GitHubWorkflow {
  id: number;
  path: string;
  name: string;
  supportsDispatch: boolean;
}

export type GitHubWorkflowRunStatus = "queued" | "in_progress" | "completed";

export type GitHubWorkflowRunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "neutral"
  | "timed_out"
  | "action_required"
  | null;

export interface GitHubWorkflowRun {
  id: number;
  workflowPath: string;
  status: GitHubWorkflowRunStatus;
  conclusion: GitHubWorkflowRunConclusion;
  headSha: string;
  createdAt: string;
  updatedAt: string;
  runUrl?: string;
  event?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DownloadedArtifact {
  name: string;
  files: Record<string, string>;
}

export interface GitHubFileWriteResult {
  path: string;
  commitSha: string;
}

export interface CreateFromTemplateInput {
  templateOwner: string;
  templateRepo: string;
  owner: string;
  name: string;
  private: boolean;
  description?: string;
}

export interface AddCollaboratorInput {
  owner: string;
  repo: string;
  username: string;
  permission: Exclude<GitHubPermission, "none">;
}

export interface RemoveCollaboratorInput {
  owner: string;
  repo: string;
  username: string;
}

export interface AddTeamPermissionInput {
  owner: string;
  repo: string;
  teamSlug: string;
  permission: Exclude<GitHubPermission, "none">;
}

export interface DispatchWorkflowInput {
  owner: string;
  repo: string;
  workflowPath: string;
  ref: string;
  inputs?: Record<string, string>;
}

export interface ListWorkflowRunsInput {
  owner: string;
  repo: string;
  workflowPath?: string;
}

export interface DownloadArtifactInput {
  owner: string;
  repo: string;
  runId: number;
  artifactName: string;
}

export interface WriteRepositoryFileInput {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  branch?: string;
}
