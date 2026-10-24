import type {
  ConditionalWriteRepositoryFileInput,
  ConditionalWriteRepositoryFileResult,
  GitHubRepositoryFileReadResult,
  AddCollaboratorInput,
  AddTeamPermissionInput,
  CreateFromTemplateInput,
  CreateRepositoryInput,
  DispatchWorkflowInput,
  DownloadArtifactArchiveInput,
  DownloadArtifactInput,
  DownloadedArtifact,
  GitHubActionsState,
  GitHubActionsArtifact,
  GitHubCollaboratorResult,
  GitHubFileWriteResult,
  GitHubPermissionState,
  GitHubPullRequest,
  GitHubRepository,
  GitHubRepositoryBranch,
  GitHubTeam,
  GitHubTemplateRepository,
  GitHubUser,
  GitHubWorkflow,
  GitHubWorkflowRun,
  GitHubWorkflowRunForCommit,
  ListWorkflowRunArtifactsInput,
  ListWorkflowRunsForCommitInput,
  ListWorkflowRunsInput,
  RemoveCollaboratorInput,
  WriteRepositoryFileInput,
  CreatePullRequestInput
} from "./github-models.js";

/** Trusted adapter metadata, consumed only by the faculty OAuth service. */
export interface GitHubOrganizationResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly data: unknown;
}
export interface GitHubOAuthOrganizationClient {
  getOrganizationScopeResponse(signal: AbortSignal): Promise<GitHubOrganizationResponse>;
  listOrganizationMembershipsPage(
    page: number,
    perPage: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  getOrganizationMembership(
    login: string,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
}

/** Read-only transport for trusted remote course discovery; never exposed over IPC. */
export interface GitHubRemoteCourseClient {
  listCourseRepositoriesPage(
    org: string,
    page: number,
    perPage: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  searchCourseMetadataPage(
    org: string,
    page: number,
    perPage: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  getCourseRepository(
    owner: string,
    repo: string,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  getCourseMetadataPath(
    owner: string,
    repo: string,
    metadataPath: string,
    ref: string,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
}

export interface GitHubClient
  extends Partial<GitHubOAuthOrganizationClient>, Partial<GitHubRemoteCourseClient> {
  getAuthenticatedUser(options?: { readonly signal: AbortSignal }): Promise<GitHubUser>;

  getRepository(owner: string, repo: string): Promise<GitHubRepository | null>;

  getRepositoryBranch(
    owner: string,
    repo: string,
    branch: string
  ): Promise<GitHubRepositoryBranch | null>;

  getDefaultBranchCommitSha(owner: string, repo: string): Promise<string | undefined>;

  getTemplateRepository(owner: string, repo: string): Promise<GitHubTemplateRepository | null>;

  createRepositoryFromTemplate(input: CreateFromTemplateInput): Promise<GitHubRepository>;

  createRepository(input: CreateRepositoryInput): Promise<GitHubRepository>;

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

  readRepositoryFile(
    owner: string,
    repo: string,
    filePath: string,
    ref: string
  ): Promise<GitHubRepositoryFileReadResult>;

  /** Compare-and-write using caller state; never refreshes the expected blob SHA. */
  conditionalWriteRepositoryFile(
    input: ConditionalWriteRepositoryFileInput
  ): Promise<ConditionalWriteRepositoryFileResult>;

  getRepositoryFileContent(
    owner: string,
    repo: string,
    filePath: string,
    ref: string
  ): Promise<string | null>;

  getWorkflow(owner: string, repo: string, workflowPath: string): Promise<GitHubWorkflow | null>;

  dispatchWorkflow(input: DispatchWorkflowInput): Promise<void>;

  listWorkflowRuns(input: ListWorkflowRunsInput): Promise<GitHubWorkflowRun[]>;

  listWorkflowRunsForCommit(
    input: ListWorkflowRunsForCommitInput
  ): Promise<GitHubWorkflowRunForCommit[]>;

  listWorkflowRunArtifacts(input: ListWorkflowRunArtifactsInput): Promise<GitHubActionsArtifact[]>;

  downloadArtifactArchive(input: DownloadArtifactArchiveInput): Promise<Uint8Array>;

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
