import type { GitHubClient, GitHubClientMethodName } from "./github-client.js";
import { GitHubClientError, type GitHubErrorKind } from "./github-errors.js";
import type {
  AddCollaboratorInput,
  AddTeamPermissionInput,
  CreateFromTemplateInput,
  DispatchWorkflowInput,
  DownloadArtifactInput,
  DownloadedArtifact,
  GitHubActionsState,
  GitHubCollaboratorPermissionState,
  GitHubCollaboratorResult,
  GitHubFileWriteResult,
  GitHubPermission,
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

enum FakeGitHubNumber {
  FirstGeneratedRepositoryId = 1000,
  FirstGeneratedCommitNumber = 1
}

enum FakeGitHubCount {
  SingleRecord = 1
}

const NO_FAKE_GITHUB_FAILURES = 0;
const DEFAULT_AUTHENTICATED_USER: GitHubUser = {
  username: "graider-fake-user"
};
const DEFAULT_BRANCH = "main";
const DEFAULT_ACTIONS_STATE: GitHubActionsState = "disabled";
const DEFAULT_PERMISSION_STATE: GitHubPermissionState = {
  permission: "none",
  pendingInvite: false
};
const GENERATED_COMMIT_SHA_PREFIX = "fake-commit-";

export interface FakeCollaboratorPermissionRecord {
  owner: string;
  repo: string;
  username: string;
  permission: GitHubPermission;
  pendingInvite?: boolean;
}

export interface FakeTeamPermissionRecord {
  owner: string;
  repo: string;
  teamSlug: string;
  permission: GitHubPermission;
}

export interface FakeActionsStateRecord {
  owner: string;
  repo: string;
  state: GitHubActionsState;
}

export interface FakeWorkflowRecord {
  owner: string;
  repo: string;
  workflow: GitHubWorkflow;
}

export interface FakeWorkflowRunRecord {
  owner: string;
  repo: string;
  run: GitHubWorkflowRun;
}

export interface FakeArtifactRecord {
  owner: string;
  repo: string;
  runId: number;
  artifact: DownloadedArtifact;
}

export interface FakeRepositoryFileRecord {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  commitSha: string;
  branch?: string;
}

export interface FakeRepositoryCreationRecord {
  input: CreateFromTemplateInput;
  repository: GitHubRepository;
}

export type FakeWorkflowDispatchRecord = DispatchWorkflowInput;

export interface FakeGitHubFailure {
  method?: GitHubClientMethodName;
  kind: GitHubErrorKind;
  retryAfterSeconds?: number;
  persistent?: boolean;
}

type FakeGitHubFailureOptions = Pick<FakeGitHubFailure, "retryAfterSeconds">;

export interface FakeGitHubClientState {
  authenticatedUser?: GitHubUser;
  users?: GitHubUser[];
  teams?: GitHubTeam[];
  repositories?: GitHubRepository[];
  templateRepositories?: GitHubTemplateRepository[];
  collaboratorPermissions?: FakeCollaboratorPermissionRecord[];
  teamPermissions?: FakeTeamPermissionRecord[];
  actionsStates?: FakeActionsStateRecord[];
  workflows?: FakeWorkflowRecord[];
  workflowRuns?: FakeWorkflowRunRecord[];
  artifacts?: FakeArtifactRecord[];
  repositoryFiles?: FakeRepositoryFileRecord[];
  failures?: FakeGitHubFailure[];
}

export interface FakeGitHubClientMutations {
  createdRepositories: FakeRepositoryCreationRecord[];
  addedCollaborators: AddCollaboratorInput[];
  removedCollaborators: RemoveCollaboratorInput[];
  teamPermissions: AddTeamPermissionInput[];
  enabledActions: Array<{ owner: string; repo: string }>;
  workflowDispatches: FakeWorkflowDispatchRecord[];
  archivedRepositories: Array<{ owner: string; repo: string }>;
  fileWrites: FakeRepositoryFileRecord[];
}

const normalizeKeyPart = (value: string): string => value.toLowerCase();

const repositoryKey = (owner: string, repo: string): string =>
  `${normalizeKeyPart(owner)}/${normalizeKeyPart(repo)}`;

const userKey = (username: string): string => normalizeKeyPart(username);

const teamKey = (org: string, teamSlug: string): string =>
  `${normalizeKeyPart(org)}/${normalizeKeyPart(teamSlug)}`;

const workflowKey = (owner: string, repo: string, workflowPath: string): string =>
  `${repositoryKey(owner, repo)}:${workflowPath}`;

const collaboratorKey = (owner: string, repo: string, username: string): string =>
  `${repositoryKey(owner, repo)}:${userKey(username)}`;

const teamPermissionKey = (owner: string, repo: string, teamSlug: string): string =>
  `${repositoryKey(owner, repo)}:${normalizeKeyPart(teamSlug)}`;

const actionsStateKey = (owner: string, repo: string): string => repositoryKey(owner, repo);

const createGitHubClientError = (failure: FakeGitHubFailure): GitHubClientError =>
  new GitHubClientError(failure.kind, `Fake GitHub ${failure.kind} failure.`, {
    ...(failure.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: failure.retryAfterSeconds })
  });

export class FakeGitHubClient implements GitHubClient {
  readonly mutations: FakeGitHubClientMutations = {
    createdRepositories: [],
    addedCollaborators: [],
    removedCollaborators: [],
    teamPermissions: [],
    enabledActions: [],
    workflowDispatches: [],
    archivedRepositories: [],
    fileWrites: []
  };

  private readonly authenticatedUser: GitHubUser;
  private readonly users: GitHubUser[];
  private readonly teams: GitHubTeam[];
  private readonly repositories: GitHubRepository[];
  private readonly templateRepositories: GitHubTemplateRepository[];
  private readonly collaboratorPermissions: FakeCollaboratorPermissionRecord[];
  private readonly teamPermissions: FakeTeamPermissionRecord[];
  private readonly actionsStates: FakeActionsStateRecord[];
  private readonly workflows: FakeWorkflowRecord[];
  private readonly workflowRuns: FakeWorkflowRunRecord[];
  private readonly artifacts: FakeArtifactRecord[];
  private readonly repositoryFiles: FakeRepositoryFileRecord[];
  private readonly failures: FakeGitHubFailure[];
  private nextRepositoryId: number;
  private nextCommitNumber: number;

  constructor(state: FakeGitHubClientState = {}) {
    this.authenticatedUser = state.authenticatedUser ?? DEFAULT_AUTHENTICATED_USER;
    this.users = [...(state.users ?? [])];
    this.teams = [...(state.teams ?? [])];
    this.repositories = [...(state.repositories ?? [])];
    this.templateRepositories = [...(state.templateRepositories ?? [])];
    this.collaboratorPermissions = [...(state.collaboratorPermissions ?? [])];
    this.teamPermissions = [...(state.teamPermissions ?? [])];
    this.actionsStates = [...(state.actionsStates ?? [])];
    this.workflows = [...(state.workflows ?? [])];
    this.workflowRuns = [...(state.workflowRuns ?? [])];
    this.artifacts = [...(state.artifacts ?? [])];
    this.repositoryFiles = [...(state.repositoryFiles ?? [])];
    this.failures = [...(state.failures ?? [])];
    this.nextRepositoryId = FakeGitHubNumber.FirstGeneratedRepositoryId;
    this.nextCommitNumber = FakeGitHubNumber.FirstGeneratedCommitNumber;
  }

  failNext(
    method: GitHubClientMethodName,
    kind: GitHubErrorKind,
    options: FakeGitHubFailureOptions = {}
  ): void {
    this.failures.push({
      method,
      kind,
      ...options
    });
  }

  failTimes(
    method: GitHubClientMethodName,
    kind: GitHubErrorKind,
    count: number,
    options: FakeGitHubFailureOptions = {}
  ): void {
    for (let remaining = count; remaining > NO_FAKE_GITHUB_FAILURES; remaining -= 1) {
      this.failNext(method, kind, options);
    }
  }

  failAll(kind: GitHubErrorKind, options: FakeGitHubFailureOptions = {}): void {
    this.failures.push({
      kind,
      persistent: true,
      ...options
    });
  }

  clearFailures(): void {
    this.failures.splice(0);
  }

  getAuthenticatedUser(): Promise<GitHubUser> {
    return this.run("getAuthenticatedUser", () => this.authenticatedUser);
  }

  getRepository(owner: string, repo: string): Promise<GitHubRepository | null> {
    return this.run(
      "getRepository",
      () =>
        this.repositories.find(
          (repository) =>
            repositoryKey(repository.owner, repository.name) === repositoryKey(owner, repo)
        ) ?? null
    );
  }

  getTemplateRepository(owner: string, repo: string): Promise<GitHubTemplateRepository | null> {
    return this.run(
      "getTemplateRepository",
      () =>
        this.templateRepositories.find(
          (repository) =>
            repositoryKey(repository.owner, repository.name) === repositoryKey(owner, repo)
        ) ?? null
    );
  }

  createRepositoryFromTemplate(input: CreateFromTemplateInput): Promise<GitHubRepository> {
    return this.run("createRepositoryFromTemplate", () => {
      const templateRepository = this.templateRepositories.find(
        (repository) =>
          repositoryKey(repository.owner, repository.name) ===
          repositoryKey(input.templateOwner, input.templateRepo)
      );
      const defaultBranch = templateRepository?.defaultBranch ?? DEFAULT_BRANCH;
      const repository = {
        owner: input.owner,
        name: input.name,
        fullName: `${input.owner}/${input.name}`,
        id: this.consumeRepositoryId(),
        private: input.private,
        archived: false,
        defaultBranch,
        htmlUrl: `https://github.com/${input.owner}/${input.name}`
      };

      this.repositories.push(repository);
      this.mutations.createdRepositories.push({
        input,
        repository
      });

      return repository;
    });
  }

  getUser(username: string): Promise<GitHubUser | null> {
    return this.run(
      "getUser",
      () => this.users.find((user) => userKey(user.username) === userKey(username)) ?? null
    );
  }

  getTeam(org: string, teamSlug: string): Promise<GitHubTeam | null> {
    return this.run(
      "getTeam",
      () =>
        this.teams.find((team) => teamKey(team.org, team.slug) === teamKey(org, teamSlug)) ?? null
    );
  }

  getCollaboratorPermission(
    owner: string,
    repo: string,
    username: string
  ): Promise<GitHubPermissionState> {
    return this.run("getCollaboratorPermission", () => {
      const permissionRecord = this.collaboratorPermissions.find(
        (record) =>
          collaboratorKey(record.owner, record.repo, record.username) ===
          collaboratorKey(owner, repo, username)
      );

      if (permissionRecord === undefined) {
        return DEFAULT_PERMISSION_STATE;
      }

      return {
        permission: permissionRecord.permission,
        pendingInvite: permissionRecord.pendingInvite ?? false
      };
    });
  }

  listCollaboratorPermissions(
    owner: string,
    repo: string
  ): Promise<GitHubCollaboratorPermissionState[]> {
    return this.run("listCollaboratorPermissions", () =>
      this.collaboratorPermissions
        .filter((record) => repositoryKey(record.owner, record.repo) === repositoryKey(owner, repo))
        .map((record) => ({
          username: record.username,
          permission: record.permission,
          pendingInvite: record.pendingInvite ?? false
        }))
    );
  }

  addCollaborator(input: AddCollaboratorInput): Promise<GitHubCollaboratorResult> {
    return this.run("addCollaborator", () => {
      const existingIndex = this.collaboratorPermissions.findIndex(
        (record) =>
          collaboratorKey(record.owner, record.repo, record.username) ===
          collaboratorKey(input.owner, input.repo, input.username)
      );
      const record = {
        ...input,
        pendingInvite: false
      };

      if (existingIndex < 0) {
        this.collaboratorPermissions.push(record);
      } else {
        this.collaboratorPermissions[existingIndex] = record;
      }

      this.mutations.addedCollaborators.push(input);

      return {
        username: input.username,
        permission: input.permission,
        pendingInvite: false
      };
    });
  }

  removeCollaborator(input: RemoveCollaboratorInput): Promise<void> {
    return this.run("removeCollaborator", () => {
      const existingIndex = this.collaboratorPermissions.findIndex(
        (record) =>
          collaboratorKey(record.owner, record.repo, record.username) ===
          collaboratorKey(input.owner, input.repo, input.username)
      );

      if (existingIndex >= 0) {
        this.collaboratorPermissions.splice(existingIndex, FakeGitHubCount.SingleRecord);
      }

      this.mutations.removedCollaborators.push(input);
    });
  }

  getTeamPermission(owner: string, repo: string, teamSlug: string): Promise<GitHubPermissionState> {
    return this.run("getTeamPermission", () => {
      const permissionRecord = this.teamPermissions.find(
        (record) =>
          teamPermissionKey(record.owner, record.repo, record.teamSlug) ===
          teamPermissionKey(owner, repo, teamSlug)
      );

      if (permissionRecord === undefined) {
        return DEFAULT_PERMISSION_STATE;
      }

      return {
        permission: permissionRecord.permission,
        pendingInvite: false
      };
    });
  }

  addTeamPermission(input: AddTeamPermissionInput): Promise<void> {
    return this.run("addTeamPermission", () => {
      const existingIndex = this.teamPermissions.findIndex(
        (record) =>
          teamPermissionKey(record.owner, record.repo, record.teamSlug) ===
          teamPermissionKey(input.owner, input.repo, input.teamSlug)
      );

      if (existingIndex < 0) {
        this.teamPermissions.push(input);
      } else {
        this.teamPermissions[existingIndex] = input;
      }

      this.mutations.teamPermissions.push(input);
    });
  }

  getActionsState(owner: string, repo: string): Promise<GitHubActionsState> {
    return this.run(
      "getActionsState",
      () =>
        this.actionsStates.find(
          (record) => actionsStateKey(record.owner, record.repo) === actionsStateKey(owner, repo)
        )?.state ?? DEFAULT_ACTIONS_STATE
    );
  }

  enableActions(owner: string, repo: string): Promise<void> {
    return this.run("enableActions", () => {
      const existingIndex = this.actionsStates.findIndex(
        (record) => actionsStateKey(record.owner, record.repo) === actionsStateKey(owner, repo)
      );
      const record = {
        owner,
        repo,
        state: "enabled" as const
      };

      if (existingIndex < 0) {
        this.actionsStates.push(record);
      } else {
        this.actionsStates[existingIndex] = record;
      }

      this.mutations.enabledActions.push({ owner, repo });
    });
  }

  getWorkflow(owner: string, repo: string, workflowPath: string): Promise<GitHubWorkflow | null> {
    return this.run(
      "getWorkflow",
      () =>
        this.workflows.find(
          (record) =>
            workflowKey(record.owner, record.repo, record.workflow.path) ===
            workflowKey(owner, repo, workflowPath)
        )?.workflow ?? null
    );
  }

  dispatchWorkflow(input: DispatchWorkflowInput): Promise<void> {
    return this.run("dispatchWorkflow", () => {
      this.mutations.workflowDispatches.push(input);
    });
  }

  listWorkflowRuns(input: ListWorkflowRunsInput): Promise<GitHubWorkflowRun[]> {
    return this.run("listWorkflowRuns", () =>
      this.workflowRuns
        .filter(
          (record) =>
            repositoryKey(record.owner, record.repo) === repositoryKey(input.owner, input.repo)
        )
        .filter(
          (record) =>
            input.workflowPath === undefined || record.run.workflowPath === input.workflowPath
        )
        .map((record) => record.run)
    );
  }

  downloadArtifact(input: DownloadArtifactInput): Promise<DownloadedArtifact | null> {
    return this.run(
      "downloadArtifact",
      () =>
        this.artifacts.find(
          (record) =>
            repositoryKey(record.owner, record.repo) === repositoryKey(input.owner, input.repo) &&
            record.runId === input.runId &&
            record.artifact.name === input.artifactName
        )?.artifact ?? null
    );
  }

  archiveRepository(owner: string, repo: string): Promise<void> {
    return this.run("archiveRepository", () => {
      const existingIndex = this.repositories.findIndex(
        (repository) =>
          repositoryKey(repository.owner, repository.name) === repositoryKey(owner, repo)
      );

      if (existingIndex >= 0) {
        const existingRepository = this.repositories[existingIndex];

        if (existingRepository !== undefined) {
          this.repositories[existingIndex] = {
            ...existingRepository,
            archived: true
          };
        }
      }

      this.mutations.archivedRepositories.push({ owner, repo });
    });
  }

  writeRepositoryFile(input: WriteRepositoryFileInput): Promise<GitHubFileWriteResult> {
    return this.run("writeRepositoryFile", () => {
      const commitSha = this.consumeCommitSha();
      const record = {
        owner: input.owner,
        repo: input.repo,
        path: input.path,
        content: input.content,
        message: input.message,
        commitSha,
        ...(input.branch === undefined ? {} : { branch: input.branch })
      };
      const existingIndex = this.repositoryFiles.findIndex(
        (file) =>
          repositoryKey(file.owner, file.repo) === repositoryKey(input.owner, input.repo) &&
          file.path === input.path &&
          file.branch === input.branch
      );

      if (existingIndex < 0) {
        this.repositoryFiles.push(record);
      } else {
        this.repositoryFiles[existingIndex] = record;
      }

      this.mutations.fileWrites.push(record);

      return {
        path: input.path,
        commitSha
      };
    });
  }

  private run<T>(method: GitHubClientMethodName, action: () => T): Promise<T> {
    const failure = this.consumeFailure(method);

    if (failure !== undefined) {
      return Promise.reject(createGitHubClientError(failure));
    }

    return Promise.resolve(action());
  }

  private consumeFailure(method: GitHubClientMethodName): FakeGitHubFailure | undefined {
    const failureIndex = this.failures.findIndex(
      (failure) => failure.method === undefined || failure.method === method
    );

    if (failureIndex < 0) {
      return undefined;
    }

    const failure = this.failures[failureIndex];

    if (failure?.persistent !== true) {
      this.failures.splice(failureIndex, FakeGitHubCount.SingleRecord);
    }

    return failure;
  }

  private consumeRepositoryId(): number {
    const repositoryId = this.nextRepositoryId;
    this.nextRepositoryId += FakeGitHubCount.SingleRecord;

    return repositoryId;
  }

  private consumeCommitSha(): string {
    const commitSha = `${GENERATED_COMMIT_SHA_PREFIX}${String(this.nextCommitNumber)}`;
    this.nextCommitNumber += FakeGitHubCount.SingleRecord;

    return commitSha;
  }
}
