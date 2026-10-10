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

export interface GitWorkspaceWriter extends GitWorkspaceInspector {
  stage(paths: readonly RelativeGitPath[]): Promise<void>;
  commit(request: { readonly message: string }): Promise<string>;
  pushUpstream(request: {
    readonly authentication: GitAuthenticationContextRef;
  }): Promise<{ readonly kind: "pushed" }>;
}

export type GitRepositoryInspection =
  | { readonly kind: "repository"; readonly root: string }
  | { readonly kind: "not_repository" }
  | { readonly kind: "unavailable"; readonly error: unknown };

export interface GitWorkspaceInspectionFactory {
  inspect(repositoryPath: string): Promise<GitRepositoryInspection>;
  open(repositoryPath: string): Promise<GitWorkspaceInspector>;
}

export interface GitWorkspaceWriterFactory extends GitWorkspaceInspectionFactory {
  open(repositoryPath: string): Promise<GitWorkspaceWriter>;
}

export interface GitWorkspaceReaderFactory {
  open(repositoryPath: string): Promise<GitWorkspaceReader>;
}

export interface GitWorkspace extends GitWorkspaceReader, GitWorkspaceWriter {}

export interface GitWorkspaceFactory {
  inspect(repositoryPath: string): Promise<GitRepositoryInspection>;
  open(repositoryPath: string): Promise<GitWorkspace>;
}

export interface GitAuthenticationContextRef {
  readonly id: string;
}

export interface AuthenticatedGitWorkspaceContext {
  readonly factory: GitWorkspaceWriterFactory;
  readonly authentication: GitAuthenticationContextRef;
}

interface ProductionGitWorkspaceBackend {
  createAuthenticatedDugiteGitWorkspace(token: string): AuthenticatedGitWorkspaceContext;
  createDugiteGitWorkspaceFactory(): GitWorkspaceFactory;
}

// Root infrastructure is bundled into the trusted Electron-main output alongside the
// existing generated CJS backends; it is never imported by preload or renderer code.
const loadProductionGitWorkspaceBackend = (): ProductionGitWorkspaceBackend =>
  require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "dugiteGitWorkspaceBackend.cjs"
    )
  ) as ProductionGitWorkspaceBackend;

let productionGitWorkspaceFactory: GitWorkspaceFactory | undefined;

export const getProductionGitWorkspaceFactory = (): GitWorkspaceFactory => {
  productionGitWorkspaceFactory ??=
    loadProductionGitWorkspaceBackend().createDugiteGitWorkspaceFactory();
  return productionGitWorkspaceFactory;
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

export const createAuthenticatedProductionGitWorkspace = (
  token: string
): AuthenticatedGitWorkspaceContext =>
  loadProductionGitWorkspaceBackend().createAuthenticatedDugiteGitWorkspace(token);
