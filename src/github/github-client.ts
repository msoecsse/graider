import type {
  AddCollaboratorInput,
  AddTeamPermissionInput,
  CreateFromTemplateInput,
  DispatchWorkflowInput,
  DownloadArtifactInput,
  DownloadedArtifact,
  GitHubActionsState,
  GitHubCollaboratorResult,
  GitHubCollaboratorPermissionState,
  GitHubFileWriteResult,
  GitHubPermissionState,
  GitHubRepository,
  GitHubTeam,
  GitHubTemplateRepository,
  GitHubUser,
  GitHubWorkflow,
  GitHubWorkflowRun,
  ListWorkflowRunsInput,
  RemoveCollaboratorInput,
  WriteRepositoryFileInput
} from "./github-models.js";

export interface GitHubClient {
  getAuthenticatedUser(): Promise<GitHubUser>;

  getRepository(owner: string, repo: string): Promise<GitHubRepository | null>;

  getTemplateRepository(owner: string, repo: string): Promise<GitHubTemplateRepository | null>;

  createRepositoryFromTemplate(input: CreateFromTemplateInput): Promise<GitHubRepository>;

  getUser(username: string): Promise<GitHubUser | null>;

  getTeam(org: string, teamSlug: string): Promise<GitHubTeam | null>;

  getCollaboratorPermission(
    owner: string,
    repo: string,
    username: string
  ): Promise<GitHubPermissionState>;

  listCollaboratorPermissions(
    owner: string,
    repo: string
  ): Promise<GitHubCollaboratorPermissionState[]>;

  addCollaborator(input: AddCollaboratorInput): Promise<GitHubCollaboratorResult>;

  removeCollaborator(input: RemoveCollaboratorInput): Promise<void>;

  getTeamPermission(owner: string, repo: string, teamSlug: string): Promise<GitHubPermissionState>;

  addTeamPermission(input: AddTeamPermissionInput): Promise<void>;

  getActionsState(owner: string, repo: string): Promise<GitHubActionsState>;

  enableActions(owner: string, repo: string): Promise<void>;

  getRepositoryFileContent(
    owner: string,
    repo: string,
    filePath: string,
    ref: string
  ): Promise<string | null>;

  getWorkflow(owner: string, repo: string, workflowPath: string): Promise<GitHubWorkflow | null>;

  dispatchWorkflow(input: DispatchWorkflowInput): Promise<void>;

  listWorkflowRuns(input: ListWorkflowRunsInput): Promise<GitHubWorkflowRun[]>;

  downloadArtifact(input: DownloadArtifactInput): Promise<DownloadedArtifact | null>;

  archiveRepository(owner: string, repo: string): Promise<void>;

  writeRepositoryFile(input: WriteRepositoryFileInput): Promise<GitHubFileWriteResult>;
}

export type GitHubClientMethodName = keyof GitHubClient;
