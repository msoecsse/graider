import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { promisify } from "node:util";
import {
  GitError,
  createBranchName,
  createExactCommitRevision,
  createGitAuthenticationContext,
  createRelativeGitPath,
  createRemoteName,
  isObjectId,
  type CommitHistoryRequest,
  type CommitRequest,
  type CreateOrResetBranchRequest,
  type DisposableAttemptRestorationRequest,
  type DeleteLocalBranchRequest,
  type DeleteRemoteBranchRequest,
  type BranchName,
  type ExactCommitRevision,
  type GitAuthenticationContext,
  type GitCommitSummary,
  type GitCommitTreeSummary,
  type GitTreeEntry,
  type GitTreeObjectType,
  type CloneRequest,
  type GitOperationName,
  type PathChange,
  type PathChangeKind,
  type PatchApplyResult,
  type PushResult,
  type PushBranchRequest,
  type PushUpstreamRequest,
  type RelativeGitPath,
  type RemoteName,
  type RevisionDiff,
  type RevisionDiffRequest,
  type ThreeWayPatchRequest,
  type RepositoryState,
  type GitWorkspacePreparationFactory,
  type GitWorkspacePreparer,
  type ObjectId,
  type RepositoryInspection
} from "./git-workspace.js";
import type { GitCredentialResolver, GitResolvedCredential } from "./git-credential-resolver.js";

const executeFile = promisify(execFile);
const MAX_GIT_OUTPUT_BYTES = 10_485_760;
const MAX_GIT_BINARY_OUTPUT_BYTES = MAX_GIT_OUTPUT_BYTES;
const MAX_COMMIT_HISTORY_COUNT = 100;
const GITHUB_HTTPS_HOST = "github.com";
const GITHUB_TOKEN_USERNAME = "x-access-token";
const AUTHORIZATION_CONFIG_KEY = "http.https://github.com/.extraHeader";
const CREDENTIAL_HELPER_CONFIG_KEY = "credential.helper";
const AUTHENTICATED_CONFIG_COUNT = 2;
const REDACTED_VALUE = "[REDACTED]";
const AUTHENTICATION_REJECTION_PATTERN =
  /authentication failed|invalid username or token|http basic: access denied|requested url returned error:\s*401/iu;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const LOG_FORMAT = "%H%x00%cI%x00%s%x00";
const FIRST_PARENT_TREE_LOG_FORMAT = "%H%x00%T%x00";
const TREE_ENTRY_PATTERN = /^([0-7]{6}) ([a-z]+) ([0-9a-f]+)\t([\s\S]*)$/u;
const STATUS_RECORD_PATTERN = /^1 ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/su;
const RENAME_RECORD_PATTERN = /^2 ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/su;
const CONFLICT_RECORD_PATTERN =
  /^u ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/su;

class SystemGitFailure extends Error {
  readonly code: unknown;
  readonly stderr: string;
  readonly authenticationRejected: boolean;
  readonly explicitAuthentication: boolean;

  constructor(error: unknown, secrets: readonly string[] = [], explicitAuthentication = false) {
    super("System Git command failed.");
    this.name = "SystemGitFailure";
    const details = error as {
      readonly code?: unknown;
      readonly command?: unknown;
      readonly message?: unknown;
      readonly stderr?: unknown;
      readonly stdout?: unknown;
    };
    this.code = details.code;
    const rawMessage = typeof details.message === "string" ? details.message : String(error);
    const rawStderr = typeof details.stderr === "string" ? details.stderr : "";
    this.authenticationRejected = AUTHENTICATION_REJECTION_PATTERN.test(
      `${rawMessage}\n${rawStderr}`
    );
    this.explicitAuthentication = explicitAuthentication;
    this.stderr = redact(rawStderr, secrets);
    const sanitizedCause = new Error(redact(rawMessage, secrets));
    sanitizedCause.name =
      typeof (error as { readonly name?: unknown }).name === "string"
        ? (error as { readonly name: string }).name
        : "Error";
    for (const [key, value] of [
      ["stderr", details.stderr],
      ["stdout", details.stdout],
      ["command", details.command]
    ] as const) {
      if (typeof value === "string") {
        Object.defineProperty(sanitizedCause, key, {
          configurable: true,
          enumerable: false,
          value: redact(value, secrets)
        });
      }
    }
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: sanitizedCause
    });
  }
}

export interface SystemGitExecutionRequest {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

export type SystemGitRunner = (request: SystemGitExecutionRequest) => Promise<string>;

export interface SystemGitBinaryExecutionRequest extends SystemGitExecutionRequest {
  readonly input?: Uint8Array;
}

export interface SystemGitBinaryExecutionResult {
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

export type SystemGitBinaryRunner = (
  request: SystemGitBinaryExecutionRequest
) => Promise<SystemGitBinaryExecutionResult>;

const redact = (value: string, secrets: readonly string[]): string =>
  secrets.reduce(
    (sanitized, secret) =>
      secret.length === 0 ? sanitized : sanitized.replaceAll(secret, REDACTED_VALUE),
    value
  );

const runSystemGit: SystemGitRunner = async ({ cwd, args, env }): Promise<string> => {
  try {
    const result = await executeFile(
      "git",
      ["-c", "color.ui=false", "-c", "core.quotepath=false", ...args],
      {
        cwd,
        encoding: "utf8",
        ...(env === undefined ? {} : { env }),
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
        shell: false,
        windowsHide: true
      }
    );
    return result.stdout;
  } catch (error) {
    throw new SystemGitFailure(error);
  }
};

const runSystemGitBinary: SystemGitBinaryRunner = async ({
  cwd,
  args,
  env,
  input
}): Promise<SystemGitBinaryExecutionResult> =>
  await new Promise<SystemGitBinaryExecutionResult>((resolve, reject) => {
    const child = spawn("git", ["-c", "color.ui=false", "-c", "core.quotepath=false", ...args], {
      cwd,
      ...(env === undefined ? {} : { env }),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const fail = (error: unknown): void => {
      if (!settled) {
        settled = true;
        reject(error instanceof Error ? error : new Error("System Git command failed."));
      }
    };
    const append = (chunks: Buffer[], chunk: Buffer, stream: "stdout" | "stderr"): void => {
      if (stream === "stdout") stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (stdoutBytes > MAX_GIT_BINARY_OUTPUT_BYTES || stderrBytes > MAX_GIT_BINARY_OUTPUT_BYTES) {
        child.kill();
        fail(
          new SystemGitFailure({
            code: "OUTPUT_LIMIT",
            message: "System Git output exceeded the configured limit."
          })
        );
      } else chunks.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      append(stdout, chunk, "stdout");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      append(stderr, chunk, "stderr");
    });
    child.on("error", (error) => {
      fail(new SystemGitFailure(error));
    });
    child.on("close", (code) => {
      if (!settled) {
        const stdoutBuffer = Buffer.concat(stdout);
        const stderrBuffer = Buffer.concat(stderr);
        if (code === 0) {
          settled = true;
          resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
        } else {
          fail(
            new SystemGitFailure({
              code,
              message: "System Git command failed.",
              stderr: stderrBuffer.toString("utf8"),
              stdout: stdoutBuffer.toString("utf8")
            })
          );
        }
      }
    });
    child.stdin.on("error", (error) => {
      fail(new SystemGitFailure(error));
    });
    child.stdin.end(input);
  });

interface AuthenticatedExecution {
  readonly authentication?: GitAuthenticationContext;
  readonly remote?: string;
}

export interface SystemGitWorkspaceFactoryOptions {
  readonly runGit?: SystemGitRunner;
  readonly runGitBinary?: SystemGitBinaryRunner;
  readonly credentialResolver?: GitCredentialResolver;
}

const isTrustedGitHubHttpsRemote = (remote: string, host: string): boolean => {
  try {
    const url = new URL(remote);
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === host &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
};

const requireAuthenticationContext = (
  context: GitAuthenticationContext,
  operation: GitOperationName
): void => {
  if (createGitAuthenticationContext(context.id) === null) {
    throw new GitError("authentication_failed", operation);
  }
};

const requireResolvedCredential = (
  credential: GitResolvedCredential | null,
  operation: GitOperationName
): GitResolvedCredential => {
  if (
    credential === null ||
    credential.host !== GITHUB_HTTPS_HOST ||
    credential.token.length === 0
  ) {
    throw new GitError("authentication_failed", operation);
  }
  return credential;
};

const authenticatedEnvironment = (
  credential: GitResolvedCredential
): { readonly env: NodeJS.ProcessEnv; readonly secrets: readonly string[] } => {
  const encoded = Buffer.from(`${GITHUB_TOKEN_USERNAME}:${credential.token}`).toString("base64");
  const authorization = `AUTHORIZATION: basic ${encoded}`;
  return {
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: String(AUTHENTICATED_CONFIG_COUNT),
      GIT_CONFIG_KEY_0: CREDENTIAL_HELPER_CONFIG_KEY,
      GIT_CONFIG_VALUE_0: "",
      GIT_CONFIG_KEY_1: AUTHORIZATION_CONFIG_KEY,
      GIT_CONFIG_VALUE_1: authorization,
      GIT_TERMINAL_PROMPT: "0"
    },
    secrets: [credential.token, encoded, authorization]
  };
};

class SystemGitOperationExecutor {
  constructor(
    private readonly runner: SystemGitRunner,
    private readonly credentialResolver?: GitCredentialResolver,
    private readonly binaryRunner: SystemGitBinaryRunner = runSystemGitBinary
  ) {}

  async run(
    cwd: string,
    args: readonly string[],
    operation: GitOperationName,
    execution: AuthenticatedExecution = {}
  ): Promise<string> {
    if (execution.authentication === undefined) return await this.runner({ cwd, args });

    requireAuthenticationContext(execution.authentication, operation);
    if (
      execution.remote === undefined ||
      !isTrustedGitHubHttpsRemote(execution.remote, GITHUB_HTTPS_HOST)
    ) {
      throw new GitError("operation_rejected", operation);
    }
    if (this.credentialResolver === undefined) {
      throw new GitError("authentication_failed", operation);
    }
    let resolvedCredential: GitResolvedCredential | null;
    try {
      resolvedCredential = await this.credentialResolver.resolve(execution.authentication);
    } catch {
      throw new GitError("authentication_failed", operation);
    }
    const credential = requireResolvedCredential(resolvedCredential, operation);
    if (!isTrustedGitHubHttpsRemote(execution.remote, credential.host)) {
      throw new GitError("operation_rejected", operation);
    }
    const { env, secrets } = authenticatedEnvironment(credential);
    try {
      return await this.runner({ cwd, args, env });
    } catch (error) {
      throw new SystemGitFailure(error, secrets, true);
    }
  }

  async runBinary(
    cwd: string,
    args: readonly string[],
    operation: GitOperationName,
    input?: Uint8Array,
    execution: AuthenticatedExecution = {}
  ): Promise<SystemGitBinaryExecutionResult> {
    if (execution.authentication === undefined)
      return await this.binaryRunner({ cwd, args, ...(input === undefined ? {} : { input }) });

    requireAuthenticationContext(execution.authentication, operation);
    if (
      execution.remote === undefined ||
      !isTrustedGitHubHttpsRemote(execution.remote, GITHUB_HTTPS_HOST)
    ) {
      throw new GitError("operation_rejected", operation);
    }
    if (this.credentialResolver === undefined) {
      throw new GitError("authentication_failed", operation);
    }
    let resolvedCredential: GitResolvedCredential | null;
    try {
      resolvedCredential = await this.credentialResolver.resolve(execution.authentication);
    } catch {
      throw new GitError("authentication_failed", operation);
    }
    const credential = requireResolvedCredential(resolvedCredential, operation);
    if (!isTrustedGitHubHttpsRemote(execution.remote, credential.host)) {
      throw new GitError("operation_rejected", operation);
    }
    const { env, secrets } = authenticatedEnvironment(credential);
    try {
      return await this.binaryRunner({
        cwd,
        args,
        env,
        ...(input === undefined ? {} : { input })
      });
    } catch (error) {
      throw new SystemGitFailure(error, secrets, true);
    }
  }
}

const errorForFailure = (
  failure: unknown,
  operation: GitOperationName,
  fallback:
    | "repository_unavailable"
    | "remote_unavailable"
    | "revision_unavailable"
    | "operation_rejected"
    | "unknown_engine_failure"
): GitError => {
  if (
    (failure instanceof SystemGitFailure && failure.code === "ENOENT") ||
    (typeof failure === "object" &&
      failure !== null &&
      (failure as { readonly code?: unknown }).code === "ENOENT")
  ) {
    return new GitError("engine_unavailable", operation, failure);
  }
  if (
    failure instanceof SystemGitFailure &&
    failure.explicitAuthentication &&
    failure.authenticationRejected
  ) {
    return new GitError("authentication_failed", operation, failure);
  }
  return new GitError(fallback, operation, failure);
};

const requireDirectory = async (path: string): Promise<void> => {
  try {
    const details = await stat(path);
    if (!details.isDirectory()) throw new GitError("repository_unavailable", "open");
  } catch (error) {
    if (error instanceof GitError) throw error;
    throw new GitError("repository_unavailable", "open", error);
  }
};

const parseObjectId = (
  stdout: string,
  operation:
    | "resolve_head"
    | "resolve_revision"
    | "resolve_tree"
    | "resolve_remote_branch"
    | "commit"
): ObjectId => {
  const value = stdout.trim();
  if (!isObjectId(value)) throw new GitError("unknown_engine_failure", operation);
  return value;
};

const parseCommitHistory = (stdout: string): readonly GitCommitSummary[] => {
  if (stdout === "") throw new GitError("unknown_engine_failure", "list_commits");
  const fields = stdout.split("\u0000");
  const trailing = fields.pop();
  if (trailing === undefined || trailing.trim() !== "" || fields.length % 3 !== 0) {
    throw new GitError("unknown_engine_failure", "list_commits");
  }
  const commits: GitCommitSummary[] = [];
  for (let index = 0; index < fields.length; index += 3) {
    const id = fields[index]?.replace(/^\r?\n/u, "") ?? "";
    const committedAt = fields[index + 1] ?? "";
    const subject = fields[index + 2] ?? "";
    if (
      !isObjectId(id) ||
      !ISO_TIMESTAMP_PATTERN.test(committedAt) ||
      !Number.isFinite(Date.parse(committedAt))
    ) {
      throw new GitError("unknown_engine_failure", "list_commits");
    }
    commits.push({ id, committedAt, subject });
  }
  if (commits.length === 0) throw new GitError("unknown_engine_failure", "list_commits");
  return commits;
};

const parseFirstParentHistory = (stdout: string): readonly GitCommitTreeSummary[] => {
  if (stdout === "") throw new GitError("unknown_engine_failure", "list_first_parent_history");
  const fields = stdout.split("\u0000");
  const trailing = fields.pop();
  if (trailing === undefined || trailing.trim() !== "" || fields.length % 2 !== 0) {
    throw new GitError("unknown_engine_failure", "list_first_parent_history");
  }
  const history: GitCommitTreeSummary[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const commit = fields[index]?.replace(/^\r?\n/u, "") ?? "";
    const tree = fields[index + 1] ?? "";
    if (!isObjectId(commit) || !isObjectId(tree))
      throw new GitError("unknown_engine_failure", "list_first_parent_history");
    history.push({ commit, tree });
  }
  if (history.length === 0)
    throw new GitError("unknown_engine_failure", "list_first_parent_history");
  return history;
};

const isGitTreeObjectType = (value: string): value is GitTreeObjectType =>
  value === "blob" || value === "tree" || value === "commit" || value === "tag";

const parseRelativeGitOutputPath = (value: string): RelativeGitPath | null => {
  const parts = value.split("/");
  return value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\u0000") &&
    parts.every((part) => part.length > 0 && part !== "." && part !== "..")
    ? (value as RelativeGitPath)
    : null;
};

const parseTreeEntries = (stdout: string): readonly GitTreeEntry[] => {
  const records = stdout.split("\u0000");
  const trailing = records.pop();
  if (trailing !== "") throw new GitError("unknown_engine_failure", "list_tree");
  return records.map((record) => {
    const match = record.match(TREE_ENTRY_PATTERN);
    if (match === null) throw new GitError("unknown_engine_failure", "list_tree");
    const mode = match[1] ?? "";
    const objectType = match[2] ?? "";
    const objectId = match[3] ?? "";
    const path = parseRelativeGitOutputPath(match[4] ?? "");
    if (!isGitTreeObjectType(objectType) || !isObjectId(objectId) || path === null)
      throw new GitError("unknown_engine_failure", "list_tree");
    return { path, objectId, mode, objectType };
  });
};

const requireRelativePath = (value: string): RelativeGitPath => {
  const path = parseRelativeGitOutputPath(value);
  if (path === null) throw new GitError("unknown_engine_failure", "inspect");
  return path;
};

const changeKind = (status: string): PathChangeKind => {
  if (status === "A") return "added";
  if (status === "M") return "modified";
  if (status === "D") return "deleted";
  if (status === "R") return "renamed";
  if (status === "C") return "copied";
  if (status === "T") return "type_changed";
  return "other";
};

interface ParsedStatus {
  readonly headOid: string | null;
  readonly branch: string | null;
  readonly upstreamBranch: string | null;
  readonly ahead: number | null;
  readonly behind: number | null;
  readonly workingTree: RepositoryState["workingTree"];
}

const parseStatus = (stdout: string): ParsedStatus => {
  let headOid: string | null = null;
  let branch: string | null = null;
  let upstreamBranch: string | null = null;
  let ahead: number | null = null;
  let behind: number | null = null;
  const trackedChanges: PathChange[] = [];
  const stagedChanges: PathChange[] = [];
  const untrackedPaths: RelativeGitPath[] = [];
  const conflicts: RepositoryState["workingTree"]["conflicts"][number][] = [];
  const records = stdout.split("\u0000");
  const trailing = records.pop();
  if (trailing !== "") throw new GitError("unknown_engine_failure", "inspect");

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (record.startsWith("# branch.oid ")) headOid = record.slice("# branch.oid ".length);
    else if (record.startsWith("# branch.head ")) {
      const value = record.slice("# branch.head ".length);
      branch = value === "(detached)" ? null : value;
    } else if (record.startsWith("# branch.upstream "))
      upstreamBranch = record.slice("# branch.upstream ".length);
    else if (record.startsWith("# branch.ab ")) {
      const match = record.match(/^# branch\.ab \+(\d+) -(\d+)$/u);
      if (match === null) throw new GitError("unknown_engine_failure", "inspect");
      ahead = Number(match[1]);
      behind = Number(match[2]);
    } else if (record.startsWith("? ")) untrackedPaths.push(requireRelativePath(record.slice(2)));
    else if (record.startsWith("u ")) {
      const match = record.match(CONFLICT_RECORD_PATTERN);
      if (match === null) throw new GitError("unknown_engine_failure", "inspect");
      conflicts.push({
        path: requireRelativePath(match[2] ?? ""),
        indexStatus: match[1]?.[0] ?? "U",
        workingTreeStatus: match[1]?.[1] ?? "U"
      });
    } else if (record.startsWith("1 ") || record.startsWith("2 ")) {
      const renamed = record.startsWith("2 ");
      const match = record.match(renamed ? RENAME_RECORD_PATTERN : STATUS_RECORD_PATTERN);
      if (match === null) throw new GitError("unknown_engine_failure", "inspect");
      const statuses = match[1] ?? "..";
      const path = requireRelativePath(match[2] ?? "");
      let originalPath: RelativeGitPath | undefined;
      if (renamed) {
        index += 1;
        originalPath = requireRelativePath(records[index] ?? "");
      }
      const toChange = (status: string): PathChange =>
        originalPath === undefined
          ? { kind: changeKind(status), path }
          : { kind: changeKind(status), path, originalPath };
      if (statuses[0] !== ".") stagedChanges.push(toChange(statuses[0] ?? "."));
      if (statuses[1] !== ".") trackedChanges.push(toChange(statuses[1] ?? "."));
    } else if (!record.startsWith("# ")) throw new GitError("unknown_engine_failure", "inspect");
  }

  return {
    headOid,
    branch,
    upstreamBranch,
    ahead,
    behind,
    workingTree: { trackedChanges, stagedChanges, untrackedPaths, conflicts }
  };
};

const relationForCounts = (
  ahead: number,
  behind: number
): "current" | "ahead" | "behind" | "diverged" => {
  if (ahead > 0 && behind > 0) return "diverged";
  if (ahead > 0) return "ahead";
  if (behind > 0) return "behind";
  return "current";
};

class SystemGitWorkspace implements GitWorkspacePreparer {
  readonly root: string;

  constructor(
    root: string,
    private readonly executor: SystemGitOperationExecutor
  ) {
    this.root = root;
  }

  async inspect(options?: {
    readonly paths?: readonly RelativeGitPath[];
  }): Promise<RepositoryState> {
    try {
      const arguments_ = ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"];
      if (options?.paths !== undefined && options.paths.length > 0)
        arguments_.push("--", ...options.paths);
      const status = parseStatus(await this.executor.run(this.root, arguments_, "inspect"));
      if (status.headOid === null) throw new GitError("unknown_engine_failure", "inspect");
      const head: RepositoryState["head"] =
        status.headOid === "(initial)"
          ? { kind: "unborn", branch: status.branch }
          : !isObjectId(status.headOid)
            ? (() => {
                throw new GitError("unknown_engine_failure", "inspect");
              })()
            : status.branch === null
              ? { kind: "detached", commit: status.headOid }
              : { kind: "attached", branch: status.branch, commit: status.headOid };
      let upstream: RepositoryState["upstream"] = { kind: "missing" };
      if (status.upstreamBranch !== null) {
        if (status.ahead === null || status.behind === null)
          throw new GitError("unknown_engine_failure", "inspect");
        const remoteOutput = await this.executor.run(
          this.root,
          [
            "for-each-ref",
            "--format=%(upstream:remotename)",
            "--count=1",
            `refs/heads/${status.branch ?? ""}`
          ],
          "inspect"
        );
        const remoteValue = remoteOutput.trim();
        upstream = {
          kind: "configured",
          remote: remoteValue === "" ? null : createRemoteName(remoteValue),
          branch: status.upstreamBranch,
          ahead: status.ahead,
          behind: status.behind,
          relation: relationForCounts(status.ahead, status.behind)
        };
      }
      return {
        kind: "repository",
        root: this.root,
        head,
        workingTree: status.workingTree,
        upstream
      };
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "inspect", "unknown_engine_failure");
    }
  }

  async stage(paths: readonly RelativeGitPath[]): Promise<void> {
    if (paths.length === 0 || paths.some((path) => createRelativeGitPath(path) !== path))
      throw new GitError("operation_rejected", "stage");
    try {
      await this.executor.run(this.root, ["add", "--", ...paths], "stage");
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "stage", "unknown_engine_failure");
    }
  }

  async applyPatchToIndex(request: ThreeWayPatchRequest): Promise<PatchApplyResult> {
    if (!(request.patch instanceof Uint8Array))
      throw new GitError("operation_rejected", "apply_patch");
    if (request.patch.length === 0) return { kind: "applied" };
    try {
      await this.executor.runBinary(
        this.root,
        ["apply", "--3way", "--index", "-"],
        "apply_patch",
        request.patch
      );
      return { kind: "applied" };
    } catch (error) {
      try {
        const unmerged = await this.executor.run(
          this.root,
          ["ls-files", "--unmerged", "-z"],
          "apply_patch"
        );
        if (unmerged.length > 0) return { kind: "conflict" };
      } catch {
        // Preserve the patch application's primary failure.
      }
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "apply_patch", "operation_rejected");
    }
  }

  async commit(request: CommitRequest): Promise<ObjectId> {
    if (request.message.trim() === "" || request.message.includes("\u0000"))
      throw new GitError("operation_rejected", "commit");
    try {
      await this.executor.run(
        this.root,
        [
          "commit",
          ...(request.allowEmpty === true ? ["--allow-empty"] : []),
          "-m",
          request.message
        ],
        "commit"
      );
      return parseObjectId(
        await this.executor.run(this.root, ["rev-parse", "HEAD"], "commit"),
        "commit"
      );
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "commit", "operation_rejected");
    }
  }

  async pushUpstream(request: PushUpstreamRequest = {}): Promise<PushResult> {
    try {
      if (request.authentication === undefined) {
        await this.executor.run(this.root, ["push"], "push");
      } else {
        const remote = await this.resolveUpstreamRemoteUrl();
        await this.executor.run(this.root, ["push"], "push", {
          authentication: request.authentication,
          remote
        });
      }
      return { kind: "pushed" };
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "push", "remote_unavailable");
    }
  }

  async pushBranch(request: PushBranchRequest): Promise<PushResult> {
    if (
      createRemoteName(request.remote) !== request.remote ||
      createBranchName(request.branch) !== request.branch
    )
      throw new GitError("operation_rejected", "push");
    try {
      const execution =
        request.authentication === undefined
          ? {}
          : {
              authentication: request.authentication,
              remote: await this.resolveRemotePushUrl(request.remote, "push")
            };
      await this.executor.run(
        this.root,
        ["push", request.remote, `HEAD:refs/heads/${request.branch}`],
        "push",
        execution
      );
      return { kind: "pushed" };
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "push", "remote_unavailable");
    }
  }

  private async resolveUpstreamRemoteUrl(): Promise<string> {
    const branch = (
      await this.executor.run(this.root, ["symbolic-ref", "--quiet", "--short", "HEAD"], "push")
    ).trim();
    if (branch === "") throw new GitError("operation_rejected", "push");
    const remoteNameValue = (
      await this.executor.run(
        this.root,
        ["for-each-ref", "--format=%(upstream:remotename)", "--count=1", `refs/heads/${branch}`],
        "push"
      )
    ).trim();
    const remoteName = createRemoteName(remoteNameValue);
    if (remoteName === null) throw new GitError("operation_rejected", "push");
    return await this.resolveRemotePushUrl(remoteName, "push");
  }

  private async resolveRemotePushUrl(
    remoteName: RemoteName,
    operation: "push" | "delete_remote_branch"
  ): Promise<string> {
    let pushRemotes: readonly string[] = [];
    try {
      pushRemotes = (
        await this.executor.run(
          this.root,
          ["config", "--get-all", `remote.${remoteName}.pushurl`],
          operation
        )
      )
        .split(/\r?\n/u)
        .filter((value) => value.length > 0);
    } catch (error) {
      if (!(error instanceof SystemGitFailure && error.code === 1)) throw error;
    }
    if (pushRemotes.length > 0) {
      if (pushRemotes.some((remote) => !isTrustedGitHubHttpsRemote(remote, GITHUB_HTTPS_HOST))) {
        throw new GitError("operation_rejected", operation);
      }
      const firstPushRemote = pushRemotes[0];
      if (firstPushRemote === undefined) throw new GitError("operation_rejected", operation);
      return firstPushRemote;
    }
    const fetchRemotes = (
      await this.executor.run(
        this.root,
        ["config", "--get-all", `remote.${remoteName}.url`],
        operation
      )
    )
      .split(/\r?\n/u)
      .filter((value) => value.length > 0);
    if (
      fetchRemotes.length === 0 ||
      fetchRemotes.some((remote) => !isTrustedGitHubHttpsRemote(remote, GITHUB_HTTPS_HOST))
    ) {
      throw new GitError("operation_rejected", operation);
    }
    const firstFetchRemote = fetchRemotes[0];
    if (firstFetchRemote === undefined) throw new GitError("operation_rejected", operation);
    return firstFetchRemote;
  }

  async remoteUrl(remote: RemoteName): Promise<string | null> {
    try {
      const value = (
        await this.executor.run(
          this.root,
          ["config", "--get", `remote.${remote}.url`],
          "remote_url"
        )
      ).trim();
      return value === "" ? null : value;
    } catch (error) {
      if (error instanceof SystemGitFailure && error.code === 1) return null;
      throw errorForFailure(error, "remote_url", "remote_unavailable");
    }
  }

  async remoteDefaultBranch(remote: RemoteName): Promise<BranchName | null> {
    if (createRemoteName(remote) !== remote)
      throw new GitError("operation_rejected", "remote_default_branch");
    const symbolicReference = `refs/remotes/${remote}/HEAD`;
    let target: string;
    try {
      target = (
        await this.executor.run(
          this.root,
          ["symbolic-ref", "--quiet", symbolicReference],
          "remote_default_branch"
        )
      ).trim();
    } catch (error) {
      if (error instanceof SystemGitFailure && error.code === 1) return null;
      throw errorForFailure(error, "remote_default_branch", "remote_unavailable");
    }
    const prefix = `refs/remotes/${remote}/`;
    if (!target.startsWith(prefix)) return null;
    const branch = createBranchName(target.slice(prefix.length));
    if (branch === null) return null;
    try {
      await this.executor.run(
        this.root,
        ["show-ref", "--verify", "--quiet", `${prefix}${branch}`],
        "remote_default_branch"
      );
      return branch;
    } catch (error) {
      if (error instanceof SystemGitFailure && error.code === 1) return null;
      throw errorForFailure(error, "remote_default_branch", "remote_unavailable");
    }
  }

  async checkoutDetached(revision: ExactCommitRevision): Promise<ObjectId> {
    if (createExactCommitRevision(revision) !== revision)
      throw new GitError("operation_rejected", "checkout");
    const commit = await this.resolveRevision(revision);
    try {
      await this.executor.run(this.root, ["checkout", "--detach", commit], "checkout");
      return await this.resolveHead();
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "checkout", "operation_rejected");
    }
  }

  async createOrResetBranch(request: CreateOrResetBranchRequest): Promise<ObjectId> {
    if (
      createBranchName(request.branch) !== request.branch ||
      createRemoteName(request.startPoint.remote) !== request.startPoint.remote ||
      createBranchName(request.startPoint.branch) !== request.startPoint.branch
    ) {
      throw new GitError("operation_rejected", "branch");
    }
    const remoteReference = `refs/remotes/${request.startPoint.remote}/${request.startPoint.branch}`;
    try {
      await this.executor.run(
        this.root,
        ["show-ref", "--verify", "--quiet", remoteReference],
        "branch"
      );
    } catch (error) {
      if (error instanceof SystemGitFailure && error.code === 1)
        throw new GitError("revision_unavailable", "branch", error);
      throw errorForFailure(error, "branch", "revision_unavailable");
    }
    try {
      await this.executor.run(
        this.root,
        ["checkout", "-B", request.branch, remoteReference, "--"],
        "branch"
      );
      return await this.resolveHead();
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "branch", "operation_rejected");
    }
  }

  async createBranch(branch: BranchName): Promise<ObjectId> {
    if (createBranchName(branch) !== branch) throw new GitError("operation_rejected", "branch");
    try {
      await this.executor.run(this.root, ["checkout", "-b", branch, "--"], "branch");
      return await this.resolveHead();
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "branch", "operation_rejected");
    }
  }

  async switchBranch(branch: BranchName): Promise<ObjectId> {
    if (createBranchName(branch) !== branch) throw new GitError("operation_rejected", "branch");
    try {
      await this.executor.run(this.root, ["checkout", branch, "--"], "branch");
      return await this.resolveHead();
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "branch", "operation_rejected");
    }
  }

  async restoreDisposableAttempt(request: DisposableAttemptRestorationRequest): Promise<void> {
    const removeUntracked: unknown = (request as { readonly removeUntracked?: unknown })
      .removeUntracked;
    if (!isObjectId(request.expectedHead) || removeUntracked !== true)
      throw new GitError("operation_rejected", "restore_disposable_attempt");
    try {
      await this.executor.run(
        this.root,
        ["reset", "--hard", request.expectedHead],
        "restore_disposable_attempt"
      );
      await this.executor.run(this.root, ["clean", "-fd"], "restore_disposable_attempt");
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "restore_disposable_attempt", "operation_rejected");
    }
  }

  async deleteRemoteBranch(request: DeleteRemoteBranchRequest): Promise<void> {
    if (
      createRemoteName(request.remote) !== request.remote ||
      createBranchName(request.branch) !== request.branch
    )
      throw new GitError("operation_rejected", "delete_remote_branch");
    try {
      const execution =
        request.authentication === undefined
          ? {}
          : {
              authentication: request.authentication,
              remote: await this.resolveRemotePushUrl(request.remote, "delete_remote_branch")
            };
      await this.executor.run(
        this.root,
        ["push", request.remote, "--delete", request.branch],
        "delete_remote_branch",
        execution
      );
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "delete_remote_branch", "remote_unavailable");
    }
  }

  async deleteLocalBranch(request: DeleteLocalBranchRequest): Promise<void> {
    const force: unknown = (request as { readonly force?: unknown }).force;
    if (createBranchName(request.branch) !== request.branch || force !== true)
      throw new GitError("operation_rejected", "branch");
    try {
      let currentBranch: string | null = null;
      try {
        currentBranch = (
          await this.executor.run(
            this.root,
            ["symbolic-ref", "--quiet", "--short", "HEAD"],
            "branch"
          )
        ).trim();
      } catch (error) {
        if (!(error instanceof SystemGitFailure && error.code === 1)) throw error;
      }
      if (currentBranch === request.branch) throw new GitError("operation_rejected", "branch");
      await this.executor.run(this.root, ["branch", "-D", "--", request.branch], "branch");
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "branch", "operation_rejected");
    }
  }

  async resolveHead(): Promise<ObjectId> {
    try {
      return parseObjectId(
        await this.executor.run(
          this.root,
          ["rev-parse", "--verify", "HEAD^{commit}"],
          "resolve_head"
        ),
        "resolve_head"
      );
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "resolve_head", "revision_unavailable");
    }
  }

  async resolveRevision(revision: ExactCommitRevision): Promise<ObjectId> {
    try {
      return parseObjectId(
        await this.executor.run(
          this.root,
          ["rev-parse", "--verify", `${revision}^{commit}`],
          "resolve_revision"
        ),
        "resolve_revision"
      );
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "resolve_revision", "revision_unavailable");
    }
  }

  async resolveTree(commit: ObjectId): Promise<ObjectId> {
    if (!isObjectId(commit)) throw new GitError("operation_rejected", "resolve_tree");
    try {
      return parseObjectId(
        await this.executor.run(
          this.root,
          ["rev-parse", "--verify", `${commit}^{tree}`],
          "resolve_tree"
        ),
        "resolve_tree"
      );
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "resolve_tree", "revision_unavailable");
    }
  }

  async listTree(commit: ObjectId): Promise<readonly GitTreeEntry[]> {
    if (!isObjectId(commit)) throw new GitError("operation_rejected", "list_tree");
    try {
      return parseTreeEntries(
        await this.executor.run(
          this.root,
          ["ls-tree", "-r", "-z", "--full-tree", commit],
          "list_tree"
        )
      );
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "list_tree", "revision_unavailable");
    }
  }

  async listFirstParentCommitTrees(anchor: ObjectId): Promise<readonly GitCommitTreeSummary[]> {
    if (!isObjectId(anchor)) throw new GitError("operation_rejected", "list_first_parent_history");
    try {
      return parseFirstParentHistory(
        await this.executor.run(
          this.root,
          ["log", "--first-parent", `--format=${FIRST_PARENT_TREE_LOG_FORMAT}`, anchor, "--"],
          "list_first_parent_history"
        )
      );
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "list_first_parent_history", "revision_unavailable");
    }
  }

  async resolveRemoteBranch(remote: RemoteName, branch: BranchName): Promise<ObjectId> {
    if (createRemoteName(remote) !== remote || createBranchName(branch) !== branch)
      throw new GitError("operation_rejected", "resolve_remote_branch");
    const reference = `refs/remotes/${remote}/${branch}`;
    try {
      await this.executor.run(
        this.root,
        ["show-ref", "--verify", "--quiet", reference],
        "resolve_remote_branch"
      );
      return parseObjectId(
        await this.executor.run(
          this.root,
          ["rev-parse", "--verify", `${reference}^{commit}`],
          "resolve_remote_branch"
        ),
        "resolve_remote_branch"
      );
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "resolve_remote_branch", "revision_unavailable");
    }
  }

  async diff(request: RevisionDiffRequest): Promise<RevisionDiff> {
    if (!isObjectId(request.base) || !isObjectId(request.target))
      throw new GitError("operation_rejected", "diff");
    try {
      const result = await this.executor.runBinary(
        this.root,
        ["diff", "--binary", "--full-index", request.base, request.target, "--"],
        "diff"
      );
      return { patch: new Uint8Array(result.stdout) };
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "diff", "revision_unavailable");
    }
  }

  async listCommits(request: CommitHistoryRequest): Promise<readonly GitCommitSummary[]> {
    if (
      !Number.isInteger(request.maximumCount) ||
      request.maximumCount < 1 ||
      request.maximumCount > MAX_COMMIT_HISTORY_COUNT
    ) {
      throw new GitError("operation_rejected", "list_commits");
    }
    try {
      const stdout = await this.executor.run(
        this.root,
        [
          "log",
          `--max-count=${String(request.maximumCount)}`,
          `--format=${LOG_FORMAT}`,
          request.anchor,
          "--"
        ],
        "list_commits"
      );
      const commits = parseCommitHistory(stdout);
      return commits.length > request.maximumCount
        ? commits.slice(0, request.maximumCount)
        : commits;
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "list_commits", "unknown_engine_failure");
    }
  }
}

export class SystemGitWorkspaceFactory implements GitWorkspacePreparationFactory {
  private readonly executor: SystemGitOperationExecutor;

  constructor(options: SystemGitWorkspaceFactoryOptions = {}) {
    this.executor = new SystemGitOperationExecutor(
      options.runGit ?? runSystemGit,
      options.credentialResolver,
      options.runGitBinary ?? runSystemGitBinary
    );
  }

  async verifyAvailable(): Promise<void> {
    try {
      await this.executor.run(process.cwd(), ["--version"], "verify_available");
    } catch (error) {
      throw errorForFailure(error, "verify_available", "unknown_engine_failure");
    }
  }

  async clone(request: CloneRequest): Promise<GitWorkspacePreparer> {
    const checkout: string = request.checkout;
    if (
      (checkout !== "default" && checkout !== "none") ||
      request.destination.length === 0 ||
      existsSync(request.destination)
    ) {
      throw new GitError("operation_rejected", "clone");
    }
    try {
      await this.executor.run(
        process.cwd(),
        [
          "clone",
          ...(request.checkout === "none" ? ["--no-checkout"] : []),
          "--",
          request.remote,
          request.destination
        ],
        "clone",
        {
          ...(request.authentication === undefined
            ? {}
            : { authentication: request.authentication, remote: request.remote })
        }
      );
      return await this.open(request.destination);
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "clone", "remote_unavailable");
    }
  }

  async inspect(path: string): Promise<RepositoryInspection> {
    try {
      return { kind: "repository", root: (await this.open(path)).root };
    } catch (error) {
      if (error instanceof GitError && error.kind === "not_repository") {
        return { kind: "not_repository" };
      }
      return {
        kind: "unavailable",
        error:
          error instanceof GitError ? error : new GitError("unknown_engine_failure", "open", error)
      };
    }
  }

  async open(path: string): Promise<GitWorkspacePreparer> {
    await requireDirectory(path);
    try {
      const discoveredRoot = (
        await this.executor.run(path, ["rev-parse", "--show-toplevel"], "open")
      ).trim();
      if (discoveredRoot === "") throw new GitError("unknown_engine_failure", "open");
      return new SystemGitWorkspace(await realpath(discoveredRoot), this.executor);
    } catch (error) {
      if (error instanceof GitError) throw error;
      if (
        error instanceof SystemGitFailure &&
        /not a git repository|must be run in a work tree/iu.test(error.stderr)
      ) {
        throw new GitError("not_repository", "open", error);
      }
      throw errorForFailure(error, "open", "repository_unavailable");
    }
  }
}
