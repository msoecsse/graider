const COMMIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;
const FIRST_CONTROL_CODE_POINT = 32;
const DELETE_CODE_POINT = 127;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:\//u;
const REMOTE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const BRANCH_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const MAX_AUTHENTICATION_CONTEXT_ID_LENGTH = 256;
const MAX_BRANCH_NAME_LENGTH = 255;

declare const gitAuthenticationContextBrand: unique symbol;

export interface GitAuthenticationContext {
  readonly id: string;
  readonly [gitAuthenticationContextBrand]: true;
}

export type ObjectId = string & { readonly __objectId: unique symbol };
export type ExactCommitRevision = string & { readonly __exactCommitRevision: unique symbol };
export type RelativeGitPath = string & { readonly __relativeGitPath: unique symbol };
export type RemoteName = string & { readonly __remoteName: unique symbol };
export type BranchName = string & { readonly __branchName: unique symbol };

export type GitOperationName =
  | "verify_available"
  | "clone"
  | "open"
  | "inspect"
  | "stage"
  | "commit"
  | "push"
  | "remote_url"
  | "remote_default_branch"
  | "checkout"
  | "branch"
  | "resolve_head"
  | "resolve_revision"
  | "list_commits";

export type GitErrorKind =
  | "engine_unavailable"
  | "repository_unavailable"
  | "authentication_failed"
  | "remote_unavailable"
  | "not_repository"
  | "revision_unavailable"
  | "operation_rejected"
  | "unknown_engine_failure";

const ERROR_MESSAGES: Readonly<Record<GitErrorKind, string>> = {
  engine_unavailable: "The Git engine is unavailable.",
  repository_unavailable: "The local repository path is unavailable.",
  authentication_failed: "Git authentication failed.",
  remote_unavailable: "The Git remote is unavailable.",
  not_repository: "The selected path is not a Git repository.",
  revision_unavailable: "The requested Git revision is unavailable.",
  operation_rejected: "The requested Git operation was rejected.",
  unknown_engine_failure: "The Git engine could not complete the operation."
};

export class GitError extends Error {
  readonly kind: GitErrorKind;
  readonly operation: GitOperationName;

  constructor(kind: GitErrorKind, operation: GitOperationName, cause?: unknown) {
    super(ERROR_MESSAGES[kind]);
    this.name = "GitError";
    this.kind = kind;
    this.operation = operation;
    if (cause !== undefined) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: cause
      });
    }
  }
}

export interface GitCommitSummary {
  readonly id: ObjectId;
  readonly committedAt: string;
  readonly subject: string;
}

export type PathChangeKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "type_changed"
  | "other";

export interface PathChange {
  readonly kind: PathChangeKind;
  readonly path: RelativeGitPath;
  readonly originalPath?: RelativeGitPath;
}

export interface ConflictPath {
  readonly path: RelativeGitPath;
  readonly indexStatus: string;
  readonly workingTreeStatus: string;
}

export interface RepositoryState {
  readonly kind: "repository";
  readonly root: string;
  readonly head:
    | { readonly kind: "unborn"; readonly branch: string | null }
    | { readonly kind: "attached"; readonly branch: string; readonly commit: ObjectId }
    | { readonly kind: "detached"; readonly commit: ObjectId };
  readonly workingTree: {
    readonly trackedChanges: readonly PathChange[];
    readonly stagedChanges: readonly PathChange[];
    readonly untrackedPaths: readonly RelativeGitPath[];
    readonly conflicts: readonly ConflictPath[];
  };
  readonly upstream:
    | { readonly kind: "missing" }
    | {
        readonly kind: "configured";
        readonly remote: RemoteName | null;
        readonly branch: string;
        readonly ahead: number;
        readonly behind: number;
        readonly relation: "current" | "ahead" | "behind" | "diverged";
      };
}

export interface CommitHistoryRequest {
  readonly anchor: ObjectId;
  readonly maximumCount: number;
}

export type TrustedGitRemote = string & { readonly __trustedGitRemote: unique symbol };

export interface CloneRequest {
  readonly remote: TrustedGitRemote;
  readonly destination: string;
  readonly checkout: "default" | "none";
  readonly authentication?: GitAuthenticationContext;
}

export interface GitWorkspaceReader {
  readonly root: string;
  inspect(options?: { readonly paths?: readonly RelativeGitPath[] }): Promise<RepositoryState>;
  remoteUrl(remote: RemoteName): Promise<string | null>;
  resolveHead(): Promise<ObjectId>;
  resolveRevision(revision: ExactCommitRevision): Promise<ObjectId>;
  listCommits(request: CommitHistoryRequest): Promise<readonly GitCommitSummary[]>;
}

export interface GitWorkspaceWriter extends GitWorkspaceReader {
  stage(paths: readonly RelativeGitPath[]): Promise<void>;
  commit(request: CommitRequest): Promise<ObjectId>;
  pushUpstream(request?: PushUpstreamRequest): Promise<PushResult>;
}

export interface CreateOrResetBranchRequest {
  readonly branch: BranchName;
  readonly startPoint: {
    readonly remote: RemoteName;
    readonly branch: BranchName;
  };
}

export interface GitWorkspacePreparer extends GitWorkspaceWriter {
  remoteDefaultBranch(remote: RemoteName): Promise<BranchName | null>;
  checkoutDetached(revision: ExactCommitRevision): Promise<ObjectId>;
  createOrResetBranch(request: CreateOrResetBranchRequest): Promise<ObjectId>;
}

export interface CommitRequest {
  readonly message: string;
}

export interface PushResult {
  readonly kind: "pushed";
}

export interface PushUpstreamRequest {
  readonly authentication?: GitAuthenticationContext;
}

export type RepositoryInspection =
  | { readonly kind: "repository"; readonly root: string }
  | { readonly kind: "not_repository" }
  | { readonly kind: "unavailable"; readonly error: GitError };

export interface GitWorkspaceFactory {
  verifyAvailable(): Promise<void>;
  clone(request: CloneRequest): Promise<GitWorkspaceReader>;
  inspect(path: string): Promise<RepositoryInspection>;
  open(path: string): Promise<GitWorkspaceReader>;
}

export interface GitWorkspaceWriterFactory extends GitWorkspaceFactory {
  open(path: string): Promise<GitWorkspaceWriter>;
}

export interface GitWorkspacePreparationFactory extends GitWorkspaceWriterFactory {
  clone(request: CloneRequest): Promise<GitWorkspacePreparer>;
  open(path: string): Promise<GitWorkspacePreparer>;
}

export const createExactCommitRevision = (value: string): ExactCommitRevision | null =>
  COMMIT_OBJECT_ID_PATTERN.test(value) ? (value as ExactCommitRevision) : null;

export const isObjectId = (value: string): value is ObjectId =>
  COMMIT_OBJECT_ID_PATTERN.test(value);

export const createTrustedGitRemote = (value: string): TrustedGitRemote | null => {
  const hasControlCharacter = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint === undefined ||
      codePoint < FIRST_CONTROL_CODE_POINT ||
      codePoint === DELETE_CODE_POINT
    );
  });
  return value.length > 0 && !hasControlCharacter ? (value as TrustedGitRemote) : null;
};

export const createGitAuthenticationContext = (id: string): GitAuthenticationContext | null =>
  id.length > 0 && id.length <= MAX_AUTHENTICATION_CONTEXT_ID_LENGTH && !hasControlCharacter(id)
    ? (Object.freeze({ id }) as GitAuthenticationContext)
    : null;

const hasControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint === undefined ||
      codePoint < FIRST_CONTROL_CODE_POINT ||
      codePoint === DELETE_CODE_POINT
    );
  });

export const createRelativeGitPath = (value: string): RelativeGitPath | null => {
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/");
  return normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !WINDOWS_ABSOLUTE_PATH_PATTERN.test(normalized) &&
    !hasControlCharacter(normalized) &&
    parts.every((part) => part.length > 0 && part !== "." && part !== "..")
    ? (normalized as RelativeGitPath)
    : null;
};

export const createRemoteName = (value: string): RemoteName | null =>
  REMOTE_NAME_PATTERN.test(value) && !value.startsWith("-") && !value.includes("..")
    ? (value as RemoteName)
    : null;

export const createBranchName = (value: string): BranchName | null => {
  const parts = value.split("/");
  return value.length > 0 &&
    value.length <= MAX_BRANCH_NAME_LENGTH &&
    BRANCH_NAME_PATTERN.test(value) &&
    !value.startsWith("-") &&
    !value.startsWith("refs/") &&
    !value.endsWith(".") &&
    !value.endsWith("/") &&
    !value.includes("..") &&
    !value.includes("//") &&
    !value.includes("@{") &&
    parts.every((part) => part.length > 0 && !part.startsWith(".") && !part.endsWith(".lock"))
    ? (value as BranchName)
    : null;
};
