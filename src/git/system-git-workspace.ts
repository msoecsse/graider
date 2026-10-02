import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { promisify } from "node:util";
import {
  GitError,
  createRelativeGitPath,
  createRemoteName,
  isObjectId,
  type CommitHistoryRequest,
  type ExactCommitRevision,
  type GitCommitSummary,
  type CloneRequest,
  type GitOperationName,
  type PathChange,
  type PathChangeKind,
  type RelativeGitPath,
  type RemoteName,
  type RepositoryState,
  type GitWorkspaceFactory,
  type GitWorkspaceReader,
  type ObjectId,
  type RepositoryInspection
} from "./git-workspace.js";

const executeFile = promisify(execFile);
const MAX_GIT_OUTPUT_BYTES = 1_048_576;
const MAX_COMMIT_HISTORY_COUNT = 100;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const LOG_FORMAT = "%H%x00%cI%x00%s%x00";
const STATUS_RECORD_PATTERN = /^1 ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/su;
const RENAME_RECORD_PATTERN = /^2 ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/su;
const CONFLICT_RECORD_PATTERN =
  /^u ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/su;

class SystemGitFailure extends Error {
  readonly code: unknown;
  readonly stderr: string;

  constructor(error: unknown) {
    super("System Git command failed.");
    this.name = "SystemGitFailure";
    const details = error as { readonly code?: unknown; readonly stderr?: unknown };
    this.code = details.code;
    this.stderr = typeof details.stderr === "string" ? details.stderr : "";
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: error
    });
  }
}

const runSystemGit = async (root: string, arguments_: readonly string[]): Promise<string> => {
  try {
    const result = await executeFile(
      "git",
      ["-c", "color.ui=false", "-c", "core.quotepath=false", ...arguments_],
      {
        cwd: root,
        encoding: "utf8",
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

type SystemGitRunner = (root: string, arguments_: readonly string[]) => Promise<string>;

const errorForFailure = (
  failure: unknown,
  operation: GitOperationName,
  fallback:
    | "repository_unavailable"
    | "remote_unavailable"
    | "revision_unavailable"
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
  operation: "resolve_head" | "resolve_revision"
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

const requireRelativePath = (value: string): RelativeGitPath => {
  const path = createRelativeGitPath(value);
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

class SystemGitWorkspace implements GitWorkspaceReader {
  readonly root: string;

  constructor(
    root: string,
    private readonly runGit: SystemGitRunner = runSystemGit
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
      const status = parseStatus(await this.runGit(this.root, arguments_));
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
        const remoteOutput = await this.runGit(this.root, [
          "for-each-ref",
          "--format=%(upstream:remotename)",
          "--count=1",
          `refs/heads/${status.branch ?? ""}`
        ]);
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

  async remoteUrl(remote: RemoteName): Promise<string | null> {
    try {
      const value = (
        await this.runGit(this.root, ["config", "--get", `remote.${remote}.url`])
      ).trim();
      return value === "" ? null : value;
    } catch (error) {
      if (error instanceof SystemGitFailure && error.code === 1) return null;
      throw errorForFailure(error, "remote_url", "remote_unavailable");
    }
  }

  async resolveHead(): Promise<ObjectId> {
    try {
      return parseObjectId(
        await this.runGit(this.root, ["rev-parse", "--verify", "HEAD^{commit}"]),
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
        await this.runGit(this.root, ["rev-parse", "--verify", `${revision}^{commit}`]),
        "resolve_revision"
      );
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw errorForFailure(error, "resolve_revision", "revision_unavailable");
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
      const stdout = await this.runGit(this.root, [
        "log",
        `--max-count=${String(request.maximumCount)}`,
        `--format=${LOG_FORMAT}`,
        request.anchor,
        "--"
      ]);
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

export class SystemGitWorkspaceFactory implements GitWorkspaceFactory {
  constructor(private readonly runGit: SystemGitRunner = runSystemGit) {}

  async verifyAvailable(): Promise<void> {
    try {
      await this.runGit(process.cwd(), ["--version"]);
    } catch (error) {
      throw errorForFailure(error, "verify_available", "unknown_engine_failure");
    }
  }

  async clone(request: CloneRequest): Promise<GitWorkspaceReader> {
    if (request.destination.length === 0 || existsSync(request.destination)) {
      throw new GitError("operation_rejected", "clone");
    }
    try {
      await this.runGit(process.cwd(), ["clone", "--", request.remote, request.destination]);
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

  async open(path: string): Promise<GitWorkspaceReader> {
    await requireDirectory(path);
    try {
      const discoveredRoot = (await this.runGit(path, ["rev-parse", "--show-toplevel"])).trim();
      if (discoveredRoot === "") throw new GitError("unknown_engine_failure", "open");
      return new SystemGitWorkspace(await realpath(discoveredRoot), this.runGit);
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
