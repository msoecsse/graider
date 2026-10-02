import path from "node:path";

export interface GitCommitSummary {
  readonly id: string;
  readonly committedAt: string;
  readonly subject: string;
}

export interface GitWorkspaceReader {
  readonly root: string;
  resolveHead(): Promise<string>;
  resolveRevision(revision: string): Promise<string>;
  listCommits(request: {
    readonly anchor: string;
    readonly maximumCount: number;
  }): Promise<readonly GitCommitSummary[]>;
}

export type RelativeGitPath = string & { readonly __relativeGitPath: unique symbol };

export interface GitPathChange {
  readonly kind: "added" | "modified" | "deleted" | "renamed" | "copied" | "type_changed" | "other";
  readonly path: RelativeGitPath;
  readonly originalPath?: RelativeGitPath;
}

export interface GitRepositoryState {
  readonly kind: "repository";
  readonly root: string;
  readonly head:
    | { readonly kind: "unborn"; readonly branch: string | null }
    | { readonly kind: "attached"; readonly branch: string; readonly commit: string }
    | { readonly kind: "detached"; readonly commit: string };
  readonly workingTree: {
    readonly trackedChanges: readonly GitPathChange[];
    readonly stagedChanges: readonly GitPathChange[];
    readonly untrackedPaths: readonly RelativeGitPath[];
    readonly conflicts: readonly {
      readonly path: RelativeGitPath;
      readonly indexStatus: string;
      readonly workingTreeStatus: string;
    }[];
  };
  readonly upstream:
    | { readonly kind: "missing" }
    | {
        readonly kind: "configured";
        readonly remote: string | null;
        readonly branch: string;
        readonly ahead: number;
        readonly behind: number;
        readonly relation: "current" | "ahead" | "behind" | "diverged";
      };
}

export interface GitWorkspaceInspector {
  readonly root: string;
  inspect(options?: { readonly paths?: readonly RelativeGitPath[] }): Promise<GitRepositoryState>;
  remoteUrl(remote: "origin"): Promise<string | null>;
}

export type GitRepositoryInspection =
  | { readonly kind: "repository"; readonly root: string }
  | { readonly kind: "not_repository" }
  | { readonly kind: "unavailable"; readonly error: unknown };

export interface GitWorkspaceInspectionFactory {
  inspect(repositoryPath: string): Promise<GitRepositoryInspection>;
  open(repositoryPath: string): Promise<GitWorkspaceInspector>;
}

export interface GitWorkspaceReaderFactory {
  open(repositoryPath: string): Promise<GitWorkspaceReader>;
}

export type GitWorkspaceFactory = GitWorkspaceReaderFactory & GitWorkspaceInspectionFactory;

interface SystemGitWorkspaceBackend {
  createSystemGitWorkspaceFactory(): GitWorkspaceFactory;
}

// Root infrastructure is bundled into the trusted Electron-main output alongside the
// existing generated CJS backends; it is never imported by preload or renderer code.
const loadSystemGitWorkspaceBackend = (): SystemGitWorkspaceBackend =>
  require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "systemGitWorkspaceBackend.cjs"
    )
  ) as SystemGitWorkspaceBackend;

let systemGitWorkspaceFactory: GitWorkspaceFactory | undefined;

export const getSystemGitWorkspaceFactory = (): GitWorkspaceFactory => {
  systemGitWorkspaceFactory ??= loadSystemGitWorkspaceBackend().createSystemGitWorkspaceFactory();
  return systemGitWorkspaceFactory;
};

const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:\//u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

export const createRelativeGitPath = (value: string): RelativeGitPath | null => {
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/");
  return normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !WINDOWS_ABSOLUTE_PATH_PATTERN.test(normalized) &&
    !CONTROL_CHARACTER_PATTERN.test(normalized) &&
    parts.every((part) => part.length > 0 && part !== "." && part !== "..")
    ? (normalized as RelativeGitPath)
    : null;
};
