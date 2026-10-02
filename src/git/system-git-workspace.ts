import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { promisify } from "node:util";
import {
  GitError,
  isObjectId,
  type CommitHistoryRequest,
  type ExactCommitRevision,
  type GitCommitSummary,
  type GitOperationName,
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

const errorForFailure = (
  failure: unknown,
  operation: GitOperationName,
  fallback: "repository_unavailable" | "revision_unavailable" | "unknown_engine_failure"
): GitError => {
  if (failure instanceof SystemGitFailure && failure.code === "ENOENT") {
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

class SystemGitWorkspace implements GitWorkspaceReader {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async resolveHead(): Promise<ObjectId> {
    try {
      return parseObjectId(
        await runSystemGit(this.root, ["rev-parse", "--verify", "HEAD^{commit}"]),
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
        await runSystemGit(this.root, ["rev-parse", "--verify", `${revision}^{commit}`]),
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
      const stdout = await runSystemGit(this.root, [
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
      const discoveredRoot = (await runSystemGit(path, ["rev-parse", "--show-toplevel"])).trim();
      if (discoveredRoot === "") throw new GitError("unknown_engine_failure", "open");
      return new SystemGitWorkspace(await realpath(discoveredRoot));
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
