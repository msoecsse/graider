const COMMIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;
const FIRST_CONTROL_CODE_POINT = 32;
const DELETE_CODE_POINT = 127;

export type ObjectId = string & { readonly __objectId: unique symbol };
export type ExactCommitRevision = string & { readonly __exactCommitRevision: unique symbol };

export type GitOperationName =
  | "verify_available"
  | "clone"
  | "open"
  | "resolve_head"
  | "resolve_revision"
  | "list_commits";

export type GitErrorKind =
  | "engine_unavailable"
  | "repository_unavailable"
  | "remote_unavailable"
  | "not_repository"
  | "revision_unavailable"
  | "operation_rejected"
  | "unknown_engine_failure";

const ERROR_MESSAGES: Readonly<Record<GitErrorKind, string>> = {
  engine_unavailable: "The Git engine is unavailable.",
  repository_unavailable: "The local repository path is unavailable.",
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

export interface CommitHistoryRequest {
  readonly anchor: ObjectId;
  readonly maximumCount: number;
}

export type TrustedGitRemote = string & { readonly __trustedGitRemote: unique symbol };

export interface CloneRequest {
  readonly remote: TrustedGitRemote;
  readonly destination: string;
  readonly checkout: "default";
}

export interface GitWorkspaceReader {
  readonly root: string;
  resolveHead(): Promise<ObjectId>;
  resolveRevision(revision: ExactCommitRevision): Promise<ObjectId>;
  listCommits(request: CommitHistoryRequest): Promise<readonly GitCommitSummary[]>;
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
