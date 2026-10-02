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

export interface GitWorkspaceReaderFactory {
  open(repositoryPath: string): Promise<GitWorkspaceReader>;
}

interface SystemGitWorkspaceBackend {
  createSystemGitWorkspaceFactory(): GitWorkspaceReaderFactory;
}

// Root infrastructure is bundled into the trusted Electron-main output alongside the
// existing generated CJS backends; it is never imported by preload or renderer code.
const loadSystemGitWorkspaceBackend = (): SystemGitWorkspaceBackend =>
  require(path.join(__dirname, "systemGitWorkspaceBackend.cjs")) as SystemGitWorkspaceBackend;

let systemGitWorkspaceFactory: GitWorkspaceReaderFactory | undefined;

export const getSystemGitWorkspaceFactory = (): GitWorkspaceReaderFactory => {
  systemGitWorkspaceFactory ??= loadSystemGitWorkspaceBackend().createSystemGitWorkspaceFactory();
  return systemGitWorkspaceFactory;
};
