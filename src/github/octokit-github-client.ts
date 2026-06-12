import { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";

import { Octokit } from "@octokit/rest";

import { GitHubClient } from "./github-client.js";
import { GitHubClientError } from "./github-errors.js";
import { withGitHubRetry } from "./github-retry.js";
import {
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
  GitHubWorkflowRunConclusion,
  GitHubWorkflowRunStatus,
  ListWorkflowRunsInput,
  RemoveCollaboratorInput,
  WriteRepositoryFileInput
} from "./github-models.js";

const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_CREATED = 201;
const HTTP_STATUS_FOUND = 302;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const HTTP_STATUS_SERVER_ERROR_MIN = 500;
const DEFAULT_BRANCH_FALLBACK = "main";
const ROOT_CONTENT_PATH = "";
const FIRST_PAGE_LIMIT = 1;
const UNKNOWN_COMMIT_SHA = "unknown";
const UNKNOWN_ID = 0;
const EMPTY_LENGTH = 0;
const SINGLE_BYTE_STEP = 1;
const DECIMAL_RADIX = 10;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_DEFLATE_COMPRESSION = 8;
const ZIP_STORED_COMPRESSION = 0;
const ZIP_GENERAL_PURPOSE_DATA_DESCRIPTOR_FLAG = 0x08;
const ZIP_MIN_LOCAL_FILE_HEADER_BYTES = 30;
const ZIP_MIN_CENTRAL_DIRECTORY_FILE_HEADER_BYTES = 46;
const ZIP_MIN_END_OF_CENTRAL_DIRECTORY_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 65_535;
const ZIP_COMPRESSION_METHOD_OFFSET = 8;
const ZIP_GENERAL_PURPOSE_FLAG_OFFSET = 6;
const ZIP_COMPRESSED_SIZE_OFFSET = 18;
const ZIP_FILE_NAME_LENGTH_OFFSET = 26;
const ZIP_EXTRA_FIELD_LENGTH_OFFSET = 28;
const ZIP_LOCAL_FILE_NAME_OFFSET = 30;
const ZIP_CENTRAL_COMPRESSION_METHOD_OFFSET = 10;
const ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET = 20;
const ZIP_CENTRAL_FILE_NAME_LENGTH_OFFSET = 28;
const ZIP_CENTRAL_EXTRA_FIELD_LENGTH_OFFSET = 30;
const ZIP_CENTRAL_FILE_COMMENT_LENGTH_OFFSET = 32;
const ZIP_CENTRAL_LOCAL_HEADER_OFFSET = 42;
const ZIP_CENTRAL_FILE_NAME_OFFSET = 46;
const ZIP_END_CENTRAL_DIRECTORY_ENTRY_COUNT_OFFSET = 10;
const ZIP_END_CENTRAL_DIRECTORY_SIZE_OFFSET = 12;
const ZIP_END_CENTRAL_DIRECTORY_OFFSET = 16;
const ZIP_END_CENTRAL_DIRECTORY_COMMENT_LENGTH_OFFSET = 20;
const BASE64_ENCODING = "base64";
const UTF8_ENCODING = "utf8";
const WINDOWS_PATH_SEPARATOR_PATTERN = /\\/g;
const PARSE_SUCCESS_RESPONSE_BODY_DISABLED = false;
const LOCATION_HEADER = "location";
const LOCATION_HEADER_ALTERNATE = "Location";
const GET_METHOD = "GET";

type OctokitParameters = Record<string, unknown>;

export interface OctokitResponseLike {
  data: unknown;
  headers?: Record<string, string>;
  status?: number;
}

export type OctokitMethodLike = (parameters?: OctokitParameters) => Promise<OctokitResponseLike>;

export interface OctokitRestClientLike {
  rest: {
    actions: {
      createWorkflowDispatch: OctokitMethodLike;
      downloadArtifact: OctokitMethodLike;
      getGithubActionsPermissionsRepository: OctokitMethodLike;
      getWorkflow: OctokitMethodLike;
      listWorkflowRunArtifacts: OctokitMethodLike;
      listWorkflowRuns: OctokitMethodLike;
      listWorkflowRunsForRepo: OctokitMethodLike;
      setGithubActionsPermissionsRepository: OctokitMethodLike;
    };
    repos: {
      addCollaborator: OctokitMethodLike;
      createOrUpdateFileContents: OctokitMethodLike;
      createUsingTemplate: OctokitMethodLike;
      get: OctokitMethodLike;
      getCollaboratorPermissionLevel: OctokitMethodLike;
      getContent: OctokitMethodLike;
      listBranches: unknown;
      listCollaborators: unknown;
      listCommits: OctokitMethodLike;
      removeCollaborator: OctokitMethodLike;
      update: OctokitMethodLike;
    };
    teams: {
      addOrUpdateRepoPermissionsInOrg: OctokitMethodLike;
      checkPermissionsForRepoInOrg: OctokitMethodLike;
      getByName: OctokitMethodLike;
    };
    users: {
      getAuthenticated: OctokitMethodLike;
      getByUsername: OctokitMethodLike;
    };
  };
  paginate: (method: unknown, parameters?: OctokitParameters) => Promise<unknown[]>;
  request: OctokitMethodLike;
}

export interface OctokitGitHubClientOptions {
  token?: string;
  octokit?: OctokitRestClientLike;
}

interface ReadableStreamReaderLike {
  read: () => Promise<{ done: boolean; value?: unknown }>;
  releaseLock?: () => void;
}

interface ReadableStreamLike {
  getReader: () => ReadableStreamReaderLike;
}

interface BlobLike {
  arrayBuffer: () => Promise<ArrayBuffer>;
}

type AsyncIterableLike = AsyncIterable<unknown>;

interface AsyncIterableCandidate {
  [Symbol.asyncIterator]?: unknown;
}

export class OctokitGitHubClient implements GitHubClient {
  private readonly octokit: OctokitRestClientLike;
  private readonly token: string | undefined;

  constructor(options: OctokitGitHubClientOptions = {}) {
    this.token = normalizeToken(options.token);
    this.octokit =
      options.octokit ?? (new Octokit({ auth: this.token }) as unknown as OctokitRestClientLike);
  }

  async getAuthenticatedUser(): Promise<GitHubUser> {
    const data = await this.run(() => this.octokit.rest.users.getAuthenticated());
    return mapUser(data);
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository | null> {
    const data = await this.runNullable(() => this.octokit.rest.repos.get({ owner, repo }));

    return data === null ? null : mapRepository(data);
  }

  async getTemplateRepository(
    owner: string,
    repo: string
  ): Promise<GitHubTemplateRepository | null> {
    const repository = await this.getRepository(owner, repo);

    if (repository === null) {
      return null;
    }

    const repoData = await this.run(() => this.octokit.rest.repos.get({ owner, repo }));
    const repoRecord = asRecord(repoData);
    const branches = await this.listBranchNames(owner, repo);
    const files = await this.listRootFiles(owner, repo);
    const latestCommitSha = await this.getLatestCommitSha(owner, repo, repository.defaultBranch);

    return {
      ...repository,
      branches,
      files,
      isTemplate: asBoolean(repoRecord.is_template) ?? false,
      latestCommitSha
    };
  }

  async createRepositoryFromTemplate(input: CreateFromTemplateInput): Promise<GitHubRepository> {
    const data = await this.run(() =>
      this.octokit.rest.repos.createUsingTemplate({
        description: input.description,
        include_all_branches: false,
        name: input.name,
        owner: input.owner,
        private: input.private,
        template_owner: input.templateOwner,
        template_repo: input.templateRepo
      })
    );

    return mapRepository(data);
  }

  async getUser(username: string): Promise<GitHubUser | null> {
    const data = await this.runNullable(() => this.octokit.rest.users.getByUsername({ username }));

    return data === null ? null : mapUser(data);
  }

  async getTeam(org: string, teamSlug: string): Promise<GitHubTeam | null> {
    const data = await this.runNullable(() =>
      this.octokit.rest.teams.getByName({ org, team_slug: teamSlug })
    );

    if (data === null) {
      return null;
    }

    const record = asRecord(data);
    const id = asNumber(record.id);
    return {
      name: asString(record.name) ?? teamSlug,
      org,
      slug: asString(record.slug) ?? teamSlug,
      ...(id === undefined ? {} : { id })
    };
  }

  async getCollaboratorPermission(
    owner: string,
    repo: string,
    username: string
  ): Promise<GitHubPermissionState> {
    const data = await this.runNullable(() =>
      this.octokit.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username
      })
    );

    if (data === null) {
      return noPermission();
    }

    const record = asRecord(data);
    return {
      pendingInvite: false,
      permission: toPermission(asString(record.permission))
    };
  }

  async listCollaboratorPermissions(
    owner: string,
    repo: string
  ): Promise<GitHubCollaboratorPermissionState[]> {
    this.ensureAuthenticated();
    const collaborators = await this.runPaginated(this.octokit.rest.repos.listCollaborators, {
      affiliation: "all",
      owner,
      repo
    });

    return collaborators
      .map(asRecord)
      .map((collaborator) => ({
        pendingInvite: false,
        permission: toCollaboratorPermission(collaborator),
        username: asString(collaborator.login) ?? ""
      }))
      .filter((collaborator) => collaborator.username.length > EMPTY_LENGTH);
  }

  async addCollaborator(input: AddCollaboratorInput): Promise<GitHubCollaboratorResult> {
    const response = await this.runResponse(() =>
      this.octokit.rest.repos.addCollaborator({
        owner: input.owner,
        permission: input.permission,
        repo: input.repo,
        username: input.username
      })
    );

    return {
      pendingInvite: response.status === HTTP_STATUS_CREATED,
      permission: input.permission,
      username: input.username
    };
  }

  async removeCollaborator(input: RemoveCollaboratorInput): Promise<void> {
    await this.run(() =>
      this.octokit.rest.repos.removeCollaborator({
        owner: input.owner,
        repo: input.repo,
        username: input.username
      })
    );
  }

  async getTeamPermission(
    owner: string,
    repo: string,
    teamSlug: string
  ): Promise<GitHubPermissionState> {
    const data = await this.runNullable(() =>
      this.octokit.rest.teams.checkPermissionsForRepoInOrg({
        org: owner,
        owner,
        repo,
        team_slug: teamSlug
      })
    );

    if (data === null) {
      return noPermission();
    }

    const record = asRecord(data);
    return {
      pendingInvite: false,
      permission: toPermission(asString(record.permission))
    };
  }

  async addTeamPermission(input: AddTeamPermissionInput): Promise<void> {
    await this.run(() =>
      this.octokit.rest.teams.addOrUpdateRepoPermissionsInOrg({
        org: input.owner,
        owner: input.owner,
        permission: input.permission,
        repo: input.repo,
        team_slug: input.teamSlug
      })
    );
  }

  async getActionsState(owner: string, repo: string): Promise<GitHubActionsState> {
    const data = await this.run(() =>
      this.octokit.rest.actions.getGithubActionsPermissionsRepository({
        owner,
        repo
      })
    );
    const record = asRecord(data);

    return asBoolean(record.enabled) === false ? "disabled" : "enabled";
  }

  async enableActions(owner: string, repo: string): Promise<void> {
    await this.run(() =>
      this.octokit.rest.actions.setGithubActionsPermissionsRepository({
        allowed_actions: "all",
        enabled: true,
        owner,
        repo
      })
    );
  }

  async getRepositoryFileContent(
    owner: string,
    repo: string,
    filePath: string,
    ref: string
  ): Promise<string | null> {
    const data = await this.runNullable(() =>
      this.octokit.rest.repos.getContent({
        owner,
        path: filePath,
        ref,
        repo
      })
    );

    if (data === null || Array.isArray(data)) {
      return null;
    }

    const record = asRecord(data);
    const content = asString(record.content);

    return content === undefined
      ? null
      : Buffer.from(content, BASE64_ENCODING).toString(UTF8_ENCODING);
  }

  async getWorkflow(
    owner: string,
    repo: string,
    workflowPath: string
  ): Promise<GitHubWorkflow | null> {
    const data = await this.runNullable(() =>
      this.octokit.rest.actions.getWorkflow({
        owner,
        repo,
        workflow_id: workflowPath
      })
    );

    if (data === null) {
      return null;
    }

    const record = asRecord(data);
    return {
      id: asNumber(record.id) ?? UNKNOWN_ID,
      name: asString(record.name) ?? workflowPath,
      path: asString(record.path) ?? workflowPath,
      supportsDispatch: asString(record.state) !== "disabled_manually"
    };
  }

  async dispatchWorkflow(input: DispatchWorkflowInput): Promise<void> {
    await this.run(() =>
      this.octokit.rest.actions.createWorkflowDispatch({
        owner: input.owner,
        ref: input.ref,
        repo: input.repo,
        workflow_id: input.workflowPath,
        ...(input.inputs === undefined ? {} : { inputs: input.inputs })
      })
    );
  }

  async listWorkflowRuns(input: ListWorkflowRunsInput): Promise<GitHubWorkflowRun[]> {
    const response =
      input.workflowPath === undefined
        ? await this.run(() =>
            this.octokit.rest.actions.listWorkflowRunsForRepo({
              owner: input.owner,
              repo: input.repo
            })
          )
        : await this.run(() =>
            this.octokit.rest.actions.listWorkflowRuns({
              owner: input.owner,
              repo: input.repo,
              workflow_id: input.workflowPath
            })
          );
    const record = asRecord(response);
    const runs = asArray(record.workflow_runs);

    return runs.map((run) => mapWorkflowRun(run, input.workflowPath));
  }

  async downloadArtifact(input: DownloadArtifactInput): Promise<DownloadedArtifact | null> {
    const artifactsData = await this.run(() =>
      this.octokit.rest.actions.listWorkflowRunArtifacts({
        owner: input.owner,
        repo: input.repo,
        run_id: input.runId
      })
    );
    const artifactsRecord = asRecord(artifactsData);
    const artifacts = asArray(artifactsRecord.artifacts);
    const artifact = artifacts
      .map(asRecord)
      .find((candidate) => asString(candidate.name) === input.artifactName);

    if (artifact === undefined) {
      return null;
    }

    const artifactId = asNumber(artifact.id);
    if (artifactId === undefined) {
      return null;
    }

    const archiveResponse = await this.resolveArtifactDownloadResponse(
      await this.runResponse(() =>
        this.octokit.rest.actions.downloadArtifact({
          archive_format: "zip",
          artifact_id: artifactId,
          owner: input.owner,
          repo: input.repo,
          request: {
            parseSuccessResponseBody: PARSE_SUCCESS_RESPONSE_BODY_DISABLED
          }
        })
      )
    );
    const archiveBuffer = await toBuffer(archiveResponse.data);
    const files = extractZipTextFiles(archiveBuffer);

    if (Object.keys(files).length === EMPTY_LENGTH) {
      throw createArtifactDecodeError();
    }

    return {
      files,
      name: input.artifactName
    };
  }

  private async resolveArtifactDownloadResponse(
    response: OctokitResponseLike
  ): Promise<OctokitResponseLike> {
    if (response.status !== HTTP_STATUS_FOUND) {
      return response;
    }

    const location =
      response.headers?.[LOCATION_HEADER] ?? response.headers?.[LOCATION_HEADER_ALTERNATE];

    if (location === undefined || location.length === EMPTY_LENGTH) {
      throw createArtifactDecodeError();
    }

    return this.runResponse(() =>
      this.octokit.request({
        method: GET_METHOD,
        url: location,
        request: {
          parseSuccessResponseBody: PARSE_SUCCESS_RESPONSE_BODY_DISABLED
        }
      })
    );
  }

  async archiveRepository(owner: string, repo: string): Promise<void> {
    await this.run(() => this.octokit.rest.repos.update({ archived: true, owner, repo }));
  }

  async writeRepositoryFile(input: WriteRepositoryFileInput): Promise<GitHubFileWriteResult> {
    return withGitHubRetry(() => this.writeRepositoryFileOnce(input));
  }

  private async writeRepositoryFileOnce(
    input: WriteRepositoryFileInput
  ): Promise<GitHubFileWriteResult> {
    const existingSha = await this.getExistingFileSha(input);
    const response = await this.run(() =>
      this.octokit.rest.repos.createOrUpdateFileContents({
        branch: input.branch,
        content: Buffer.from(input.content, UTF8_ENCODING).toString(BASE64_ENCODING),
        message: input.message,
        owner: input.owner,
        path: input.path,
        repo: input.repo,
        ...(existingSha === undefined ? {} : { sha: existingSha })
      })
    );
    const record = asRecord(response);
    const content = asRecord(record.content);
    const commit = asRecord(record.commit);

    return {
      commitSha: asString(commit.sha) ?? UNKNOWN_COMMIT_SHA,
      path: asString(content.path) ?? input.path
    };
  }

  private async listBranchNames(owner: string, repo: string): Promise<string[]> {
    const branches = await this.runPaginated(this.octokit.rest.repos.listBranches, { owner, repo });
    return branches
      .map(asRecord)
      .map((branch) => asString(branch.name))
      .filter((name): name is string => name !== undefined);
  }

  private async listRootFiles(owner: string, repo: string): Promise<string[]> {
    const data = await this.runNullable(() =>
      this.octokit.rest.repos.getContent({
        owner,
        path: ROOT_CONTENT_PATH,
        repo
      })
    );

    if (data === null) {
      return [];
    }

    return asArray(data)
      .map(asRecord)
      .map((file) => asString(file.name))
      .filter((name): name is string => name !== undefined);
  }

  private async getLatestCommitSha(owner: string, repo: string, branch: string): Promise<string> {
    const data = await this.runNullable(() =>
      this.octokit.rest.repos.listCommits({
        owner,
        per_page: FIRST_PAGE_LIMIT,
        repo,
        sha: branch
      })
    );

    const commit = asArray(data).map(asRecord).at(0);
    return commit === undefined ? UNKNOWN_COMMIT_SHA : (asString(commit.sha) ?? UNKNOWN_COMMIT_SHA);
  }

  private async getExistingFileSha(input: WriteRepositoryFileInput): Promise<string | undefined> {
    const data = await this.runNullable(() =>
      this.octokit.rest.repos.getContent({
        owner: input.owner,
        path: input.path,
        ref: input.branch,
        repo: input.repo
      })
    );

    if (data === null || Array.isArray(data)) {
      return undefined;
    }

    return asString(asRecord(data).sha);
  }

  private async run<T>(operation: () => Promise<OctokitResponseLike>): Promise<T> {
    const response = await this.runResponse(operation);
    return response.data as T;
  }

  private async runNullable<T>(operation: () => Promise<OctokitResponseLike>): Promise<T | null> {
    this.ensureAuthenticated();

    try {
      const response = await operation();
      return response.data as T;
    } catch (error) {
      if (getErrorStatus(error) === HTTP_STATUS_NOT_FOUND) {
        return null;
      }

      throw normalizeOctokitError(error);
    }
  }

  private async runPaginated(method: unknown, parameters: OctokitParameters): Promise<unknown[]> {
    this.ensureAuthenticated();

    try {
      return await this.octokit.paginate(method, parameters);
    } catch (error) {
      throw normalizeOctokitError(error);
    }
  }

  private async runResponse(
    operation: () => Promise<OctokitResponseLike>
  ): Promise<OctokitResponseLike> {
    this.ensureAuthenticated();

    try {
      return await operation();
    } catch (error) {
      throw normalizeOctokitError(error);
    }
  }

  private ensureAuthenticated(): void {
    if (this.token === undefined) {
      throw new GitHubClientError("auth_missing", "GitHub token is not configured.");
    }
  }
}

function normalizeToken(token: string | undefined): string | undefined {
  const normalized = token?.trim();
  return normalized === undefined || normalized.length === EMPTY_LENGTH ? undefined : normalized;
}

function normalizeOctokitError(error: unknown): GitHubClientError {
  if (error instanceof GitHubClientError) {
    return error;
  }

  const status = getErrorStatus(error);
  const retryAfterSeconds = getRetryAfterSeconds(error);

  if (status === HTTP_STATUS_UNAUTHORIZED) {
    return new GitHubClientError("auth_failed", "GitHub authentication failed.");
  }

  if (
    status === HTTP_STATUS_TOO_MANY_REQUESTS ||
    (status === HTTP_STATUS_FORBIDDEN && isRateLimitError(error))
  ) {
    const options = retryAfterSeconds === undefined ? {} : { retryAfterSeconds };
    return new GitHubClientError("rate_limited", "GitHub rate limit was reached.", options);
  }

  if (status === HTTP_STATUS_FORBIDDEN) {
    return new GitHubClientError("permission_denied", "GitHub permission was denied.");
  }

  if (status !== undefined && status >= HTTP_STATUS_SERVER_ERROR_MIN) {
    return new GitHubClientError("api_error", "GitHub API request failed.");
  }

  if (status !== undefined) {
    return new GitHubClientError("api_error", "GitHub API request failed.");
  }

  return new GitHubClientError("network_error", "GitHub network request failed.");
}

function createArtifactDecodeError(): GitHubClientError {
  return new GitHubClientError("api_error", "GitHub artifact download could not be decoded.");
}

function getErrorStatus(error: unknown): number | undefined {
  const record = asRecord(error);
  return asNumber(record.status);
}

function getRetryAfterSeconds(error: unknown): number | undefined {
  const headers = getErrorHeaders(error);
  const retryAfter = headers["retry-after"] ?? headers["Retry-After"];
  return typeof retryAfter === "string" ? Number.parseInt(retryAfter, DECIMAL_RADIX) : undefined;
}

function isRateLimitError(error: unknown): boolean {
  const headers = getErrorHeaders(error);
  const remaining = headers["x-ratelimit-remaining"] ?? headers["X-RateLimit-Remaining"];
  const message = asString(asRecord(error).message)?.toLowerCase() ?? "";

  return (
    remaining === "0" || headers["retry-after"] !== undefined || message.includes("rate limit")
  );
}

function getErrorHeaders(error: unknown): Record<string, string | undefined> {
  const response = asRecord(asRecord(error).response);
  const headers = asRecord(response.headers);
  const normalized: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }

  return normalized;
}

function mapUser(value: unknown): GitHubUser {
  const record = asRecord(value);
  const id = asNumber(record.id);

  if (id === undefined) {
    return {
      username: asString(record.login) ?? ""
    };
  }

  return {
    id,
    username: asString(record.login) ?? ""
  };
}

function mapRepository(value: unknown): GitHubRepository {
  const record = asRecord(value);
  const ownerRecord = asRecord(record.owner);
  const owner = asString(ownerRecord.login) ?? "";
  const name = asString(record.name) ?? "";

  return {
    archived: asBoolean(record.archived) ?? false,
    defaultBranch: asString(record.default_branch) ?? DEFAULT_BRANCH_FALLBACK,
    fullName: asString(record.full_name) ?? `${owner}/${name}`,
    htmlUrl: asString(record.html_url) ?? "",
    id: asNumber(record.id) ?? UNKNOWN_ID,
    name,
    owner,
    private: asBoolean(record.private) ?? true
  };
}

function mapWorkflowRun(value: unknown, workflowPath: string | undefined): GitHubWorkflowRun {
  const record = asRecord(value);
  const runUrl = asString(record.html_url);
  const event = asString(record.event);
  const startedAt = asString(record.run_started_at);

  return {
    conclusion: toWorkflowConclusion(record.conclusion),
    createdAt: asString(record.created_at) ?? "",
    headSha: asString(record.head_sha) ?? "",
    id: asNumber(record.id) ?? UNKNOWN_ID,
    status: toWorkflowStatus(record.status),
    updatedAt: asString(record.updated_at) ?? "",
    workflowPath: asString(record.path) ?? workflowPath ?? "",
    ...(runUrl === undefined ? {} : { runUrl }),
    ...(event === undefined ? {} : { event }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(asString(record.status) === "completed"
      ? { completedAt: asString(record.updated_at) ?? "" }
      : {})
  };
}

function toPermission(value: string | undefined): GitHubPermission {
  const allowed: GitHubPermission[] = ["none", "pull", "triage", "push", "maintain", "admin"];
  return value !== undefined && allowed.includes(value as GitHubPermission)
    ? (value as GitHubPermission)
    : "none";
}

function toCollaboratorPermission(collaborator: Record<string, unknown>): GitHubPermission {
  const permissions = asRecord(collaborator.permissions);

  if (asBoolean(permissions.admin) === true) {
    return "admin";
  }

  if (asBoolean(permissions.maintain) === true) {
    return "maintain";
  }

  if (asBoolean(permissions.push) === true || asBoolean(permissions.write) === true) {
    return "push";
  }

  if (asBoolean(permissions.triage) === true) {
    return "triage";
  }

  if (asBoolean(permissions.pull) === true || asBoolean(permissions.read) === true) {
    return "pull";
  }

  return "none";
}

function toWorkflowStatus(value: unknown): GitHubWorkflowRunStatus {
  const status = asString(value);
  if (status === "queued" || status === "in_progress" || status === "completed") {
    return status;
  }

  return "queued";
}

function toWorkflowConclusion(value: unknown): GitHubWorkflowRunConclusion {
  const conclusion = asString(value);
  if (
    conclusion === "success" ||
    conclusion === "failure" ||
    conclusion === "cancelled" ||
    conclusion === "skipped" ||
    conclusion === "neutral" ||
    conclusion === "timed_out" ||
    conclusion === "action_required"
  ) {
    return conclusion;
  }

  return null;
}

function noPermission(): GitHubPermissionState {
  return {
    pendingInvite: false,
    permission: "none"
  };
}

function extractZipTextFiles(buffer: Buffer): Record<string, string> {
  const centralDirectoryFiles = extractZipTextFilesFromCentralDirectory(buffer);

  if (Object.keys(centralDirectoryFiles).length !== EMPTY_LENGTH) {
    return centralDirectoryFiles;
  }

  return extractZipTextFilesFromLocalHeaders(buffer);
}

function extractZipTextFilesFromCentralDirectory(buffer: Buffer): Record<string, string> {
  const files: Record<string, string> = {};
  const directory = findZipCentralDirectory(buffer);

  if (directory === undefined) {
    return files;
  }

  const directoryEnd = Math.min(directory.offset + directory.size, buffer.length);

  for (
    let offset = directory.offset, remainingEntries = directory.entries, scanning = true;
    scanning &&
    remainingEntries > EMPTY_LENGTH &&
    offset + ZIP_MIN_CENTRAL_DIRECTORY_FILE_HEADER_BYTES <= directoryEnd;
    remainingEntries -= SINGLE_BYTE_STEP
  ) {
    const signature = buffer.readUInt32LE(offset);

    if (signature !== ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      scanning = false;
    } else {
      const fileNameLength = buffer.readUInt16LE(offset + ZIP_CENTRAL_FILE_NAME_LENGTH_OFFSET);
      const extraFieldLength = buffer.readUInt16LE(offset + ZIP_CENTRAL_EXTRA_FIELD_LENGTH_OFFSET);
      const fileCommentLength = buffer.readUInt16LE(
        offset + ZIP_CENTRAL_FILE_COMMENT_LENGTH_OFFSET
      );
      const nameStart = offset + ZIP_CENTRAL_FILE_NAME_OFFSET;
      const nameEnd = nameStart + fileNameLength;
      const nextOffset = nameEnd + extraFieldLength + fileCommentLength;

      if (nextOffset > directoryEnd) {
        scanning = false;
      } else {
        const compressionMethod = buffer.readUInt16LE(
          offset + ZIP_CENTRAL_COMPRESSION_METHOD_OFFSET
        );
        const compressedSize = buffer.readUInt32LE(offset + ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET);
        const localHeaderOffset = buffer.readUInt32LE(offset + ZIP_CENTRAL_LOCAL_HEADER_OFFSET);
        const name = normalizeZipEntryPath(
          buffer.subarray(nameStart, nameEnd).toString(UTF8_ENCODING)
        );
        const content = extractZipEntryContent(
          buffer,
          localHeaderOffset,
          compressedSize,
          compressionMethod
        );

        if (content !== undefined && name.length > EMPTY_LENGTH && !name.endsWith("/")) {
          files[name] = content.toString(UTF8_ENCODING);
        }

        offset = nextOffset;
      }
    }
  }

  return files;
}

function extractZipTextFilesFromLocalHeaders(buffer: Buffer): Record<string, string> {
  const files: Record<string, string> = {};

  for (
    let offset = 0, scanning = true;
    scanning && offset + ZIP_MIN_LOCAL_FILE_HEADER_BYTES <= buffer.length;
  ) {
    const signature = buffer.readUInt32LE(offset);

    if (signature !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      scanning = false;
    } else {
      const flags = buffer.readUInt16LE(offset + ZIP_GENERAL_PURPOSE_FLAG_OFFSET);
      const compressionMethod = buffer.readUInt16LE(offset + ZIP_COMPRESSION_METHOD_OFFSET);
      const compressedSize = buffer.readUInt32LE(offset + ZIP_COMPRESSED_SIZE_OFFSET);
      const fileNameLength = buffer.readUInt16LE(offset + ZIP_FILE_NAME_LENGTH_OFFSET);
      const extraFieldLength = buffer.readUInt16LE(offset + ZIP_EXTRA_FIELD_LENGTH_OFFSET);
      const nameStart = offset + ZIP_LOCAL_FILE_NAME_OFFSET;
      const nameEnd = nameStart + fileNameLength;
      const dataStart = nameEnd + extraFieldLength;
      const dataEnd = dataStart + compressedSize;

      if ((flags & ZIP_GENERAL_PURPOSE_DATA_DESCRIPTOR_FLAG) !== 0 || dataEnd > buffer.length) {
        scanning = false;
      } else {
        const name = normalizeZipEntryPath(
          buffer.subarray(nameStart, nameEnd).toString(UTF8_ENCODING)
        );
        const compressed = buffer.subarray(dataStart, dataEnd);
        const content =
          compressionMethod === ZIP_DEFLATE_COMPRESSION
            ? inflateRawSync(compressed)
            : compressionMethod === ZIP_STORED_COMPRESSION
              ? compressed
              : undefined;

        if (content !== undefined && name.length > EMPTY_LENGTH && !name.endsWith("/")) {
          files[name] = content.toString(UTF8_ENCODING);
        }

        offset = dataEnd;
      }
    }
  }

  return files;
}

function findZipCentralDirectory(
  buffer: Buffer
): { offset: number; size: number; entries: number } | undefined {
  const firstOffset = Math.max(
    EMPTY_LENGTH,
    buffer.length - ZIP_MIN_END_OF_CENTRAL_DIRECTORY_BYTES - ZIP_MAX_COMMENT_BYTES
  );
  let directory: { offset: number; size: number; entries: number } | undefined;

  for (
    let offset = buffer.length - ZIP_MIN_END_OF_CENTRAL_DIRECTORY_BYTES;
    directory === undefined && offset >= firstOffset;
    offset -= SINGLE_BYTE_STEP
  ) {
    const signature = buffer.readUInt32LE(offset);

    if (signature === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      const commentLength = buffer.readUInt16LE(
        offset + ZIP_END_CENTRAL_DIRECTORY_COMMENT_LENGTH_OFFSET
      );
      const expectedEnd = offset + ZIP_MIN_END_OF_CENTRAL_DIRECTORY_BYTES + commentLength;

      if (expectedEnd <= buffer.length) {
        directory = {
          entries: buffer.readUInt16LE(offset + ZIP_END_CENTRAL_DIRECTORY_ENTRY_COUNT_OFFSET),
          offset: buffer.readUInt32LE(offset + ZIP_END_CENTRAL_DIRECTORY_OFFSET),
          size: buffer.readUInt32LE(offset + ZIP_END_CENTRAL_DIRECTORY_SIZE_OFFSET)
        };
      }
    }
  }

  return directory;
}

function extractZipEntryContent(
  buffer: Buffer,
  localHeaderOffset: number,
  compressedSize: number,
  compressionMethod: number
): Buffer | undefined {
  if (
    localHeaderOffset + ZIP_MIN_LOCAL_FILE_HEADER_BYTES > buffer.length ||
    buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE
  ) {
    return undefined;
  }

  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + ZIP_FILE_NAME_LENGTH_OFFSET);
  const extraFieldLength = buffer.readUInt16LE(localHeaderOffset + ZIP_EXTRA_FIELD_LENGTH_OFFSET);
  const dataStart =
    localHeaderOffset + ZIP_LOCAL_FILE_NAME_OFFSET + fileNameLength + extraFieldLength;
  const dataEnd = dataStart + compressedSize;

  if (dataEnd > buffer.length) {
    return undefined;
  }

  const compressed = buffer.subarray(dataStart, dataEnd);

  return compressionMethod === ZIP_DEFLATE_COMPRESSION
    ? inflateRawSync(compressed)
    : compressionMethod === ZIP_STORED_COMPRESSION
      ? compressed
      : undefined;
}

function normalizeZipEntryPath(filePath: string): string {
  return filePath.replace(WINDOWS_PATH_SEPARATOR_PATTERN, "/");
}

async function toBuffer(value: unknown): Promise<Buffer> {
  const directBuffer = toDirectBuffer(value);

  if (directBuffer !== undefined) {
    if (directBuffer.length === EMPTY_LENGTH) {
      throw createArtifactDecodeError();
    }

    return directBuffer;
  }

  if (isReadableStreamLike(value)) {
    return readStreamToBuffer(value);
  }

  if (isAsyncIterableLike(value)) {
    return readAsyncIterableToBuffer(value);
  }

  if (isBlobLike(value)) {
    const blobBuffer = Buffer.from(await value.arrayBuffer());

    if (blobBuffer.length === EMPTY_LENGTH) {
      throw createArtifactDecodeError();
    }

    return blobBuffer;
  }

  throw createArtifactDecodeError();
}

function toDirectBuffer(value: unknown): Buffer | undefined {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  if (typeof value === "string") {
    return Buffer.from(value, UTF8_ENCODING);
  }

  return undefined;
}

async function readStreamToBuffer(stream: ReadableStreamLike): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];

  try {
    for (let reading = true; reading; ) {
      const result = await reader.read();

      if (result.done) {
        reading = false;
      } else {
        const chunk = toDirectBuffer(result.value);

        if (chunk !== undefined) {
          chunks.push(chunk);
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  const buffer = Buffer.concat(chunks);

  if (buffer.length === EMPTY_LENGTH) {
    throw createArtifactDecodeError();
  }

  return buffer;
}

async function readAsyncIterableToBuffer(iterable: AsyncIterableLike): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const value of iterable) {
    const chunk = toDirectBuffer(value);

    if (chunk === undefined) {
      throw createArtifactDecodeError();
    }

    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);

  if (buffer.length === EMPTY_LENGTH) {
    throw createArtifactDecodeError();
  }

  return buffer;
}

function isReadableStreamLike(value: unknown): value is ReadableStreamLike {
  const candidate = asRecord(value);

  return typeof candidate.getReader === "function";
}

function isAsyncIterableLike(value: unknown): value is AsyncIterableLike {
  const candidate =
    typeof value === "object" && value !== null ? (value as AsyncIterableCandidate) : {};

  return typeof candidate[Symbol.asyncIterator] === "function";
}

function isBlobLike(value: unknown): value is BlobLike {
  const candidate = asRecord(value);

  return typeof candidate.arrayBuffer === "function";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
