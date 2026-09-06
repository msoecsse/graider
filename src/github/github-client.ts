import type {
  AddCollaboratorInput,
  AddTeamPermissionInput,
  CreateFromTemplateInput,
  DispatchWorkflowInput,
  DownloadArtifactInput,
  DownloadedArtifact,
  GitHubActionsState,
  GitHubCollaboratorResult,
  GitHubFileWriteResult,
  GitHubPermissionState,
  GitHubPullRequest,
  GitHubRepository,
  GitHubTeam,
  GitHubTemplateRepository,
  GitHubUser,
  GitHubWorkflow,
  GitHubWorkflowRun,
  ListWorkflowRunsInput,
  RemoveCollaboratorInput,
  WriteRepositoryFileInput,
  CreatePullRequestInput
} from "./github-models.js";

export interface GitHubClient {
  getAuthenticatedUser(): Promise<GitHubUser>;

  getRepository(owner: string, repo: string): Promise<GitHubRepository | null>;

  getDefaultBranchCommitSha(owner: string, repo: string): Promise<string | undefined>;

  getTemplateRepository(owner: string, repo: string): Promise<GitHubTemplateRepository | null>;

  createRepositoryFromTemplate(input: CreateFromTemplateInput): Promise<GitHubRepository>;

  getUser(username: string): Promise<GitHubUser | null>;

  getTeam(org: string, teamSlug: string): Promise<GitHubTeam | null>;

  getCollaboratorPermission(
    owner: string,
    repo: string,
    username: string
  ): Promise<GitHubPermissionState>;

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
  findPullRequest(
    owner: string,
    repo: string,
    head: string,
    base: string
  ): Promise<GitHubPullRequest | null>;
  createPullRequest(input: CreatePullRequestInput): Promise<GitHubPullRequest>;
  deleteRepositoryBranch(
    owner: string,
    repo: string,
    branch: string,
    defaultBranch: string
  ): Promise<void>;
}

export type GitHubClientMethodName = keyof GitHubClient;
