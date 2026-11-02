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

/** Trusted backend adapter metadata for OAuth discovery and desired-state reconciliation; never IPC. */
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

/** Trusted backend transport only. Never expose organization/user locators over IPC. */
export interface GitHubFacultyOrganizationClient extends Pick<
  GitHubOAuthOrganizationClient,
  "getOrganizationScopeResponse" | "getOrganizationMembership"
> {
  getUser(username: string): Promise<GitHubUser | null>;
  listOrganizationMembersPage(
    org: string,
    page: number,
    perPage: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  listPendingOrganizationInvitationsPage(
    org: string,
    page: number,
    perPage: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  createOrganizationInvitation(
    org: string,
    githubUserId: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
}

/** Backend-only managed-team transport. Numeric organization/team IDs prevent slug reuse from redirecting writes. */
export interface GitHubManagedTeamClient extends Pick<
  GitHubOAuthOrganizationClient,
  "getOrganizationScopeResponse" | "getOrganizationMembership"
> {
  getUser(username: string): Promise<GitHubUser | null>;
  listManagedOrganizationTeamsPage(
    org: string,
    page: number,
    perPage: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  getManagedTeam(
    organizationId: number,
    teamId: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  listManagedTeamMembersPage(
    organizationId: number,
    teamId: number,
    page: number,
    perPage: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  createManagedTeam(
    org: string,
    name: string,
    description: string,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  setManagedTeamMembership(
    organizationId: number,
    teamId: number,
    username: string,
    present: boolean,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
}

/** Internal v2 course/admin permission transport; no direct-collaborator removal capability. */
export interface GitHubCoursePermissionClient extends Pick<
  GitHubManagedTeamClient,
  "getOrganizationScopeResponse" | "getOrganizationMembership" | "getUser" | "getManagedTeam"
> {
  getCourseRepositoryById(
    repositoryId: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  listCourseRepositoryTeamsPage(
    owner: string,
    repo: string,
    page: number,
    perPage: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  setCourseRepositoryTeamPermission(
    organizationId: number,
    teamId: number,
    owner: string,
    repo: string,
    permission: "admin" | "push" | "pull" | "none",
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  getCourseFallbackPermissionPage(
    repositoryNodeId: string,
    login: string,
    cursor: string | null,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  setCourseFallbackPermission(
    owner: string,
    repo: string,
    login: string,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
}

/** Backend-only branch policy transport. No ruleset, rule-delete, branch or permission mutation capability. */
export interface GitHubManagedBranchClient extends Pick<
  GitHubCoursePermissionClient,
  "getOrganizationScopeResponse" | "getOrganizationMembership" | "getCourseRepositoryById"
> {
  getManagedBranchRulesPage(
    repositoryNodeId: string,
    branch: string,
    cursor: string | null,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  getManagedBranchProtection(
    owner: string,
    repo: string,
    branch: string,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  listManagedBranchRulesetsPage(
    owner: string,
    repo: string,
    page: number,
    perPage: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  listManagedEffectiveBranchRulesPage(
    owner: string,
    repo: string,
    branch: string,
    page: number,
    perPage: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  createManagedBranchRule(
    repositoryNodeId: string,
    branch: string,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  tightenManagedBranchRule(
    ruleId: string,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
}

/** Read-only transport for trusted remote course discovery; never exposed over IPC. */
export interface GitHubRemoteCourseClient {
  getCourseRepositoryById(
    repositoryId: number,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
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

/** Exact-object GETs for migration review; carries no write capability. */
export interface GitHubMigrationReadClient {
  getMigrationCommit(
    owner: string,
    repo: string,
    commitSha: string,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  getMigrationTree(
    owner: string,
    repo: string,
    commitSha: string,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
  getMigrationBlob(
    owner: string,
    repo: string,
    blobSha: string,
    signal: AbortSignal
  ): Promise<GitHubOrganizationResponse>;
}

export interface GitHubClient
  extends
    Partial<GitHubOAuthOrganizationClient>,
    Partial<GitHubFacultyOrganizationClient>,
    Partial<GitHubManagedTeamClient>,
    Partial<GitHubCoursePermissionClient>,
    Partial<GitHubManagedBranchClient>,
    Partial<GitHubRemoteCourseClient>,
    Partial<GitHubMigrationReadClient> {
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
