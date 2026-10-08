import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  createGitAuthenticationContext,
  createTrustedGitRemote,
  type GitWorkspaceFactory
} from "../git/git-workspace.js";
import type { GitCredentialResolver } from "../git/git-credential-resolver.js";
import { createSystemGitWorkspaceFactory } from "../git/system-git-workspace-context.js";
import { buildAssignmentRepositoryMappings } from "../repository-mappings/repository-mappings-builder.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { createConfigDiagnostic, DiagnosticCode } from "../diagnostics/error-catalog.js";

export interface RepositoryDownloadTargetResult {
  readonly targetId: string;
  readonly groupId?: string;
  readonly repositoryName: string;
  readonly cloneUrl?: string | null;
  readonly htmlUrl?: string | null;
  readonly localPath: string;
  readonly status: "cloned" | "failed";
  readonly studentIds: readonly string[];
  readonly githubUsernames: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface RepositoryDownloadResult {
  readonly schemaVersion: 1;
  readonly commandName: "assignment download-repositories";
  readonly status: "success" | "partial_success" | "failure";
  readonly exitCode: 0 | 1 | 2;
  readonly assignmentPath: string;
  readonly destination: string;
  readonly repositoryMode: "individual" | "group";
  readonly totalTargets: number;
  readonly clonedCount: number;
  readonly failedCount: number;
  readonly targets: readonly RepositoryDownloadTargetResult[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface RepositoryDownloadDependencies {
  readonly existsSync: (value: string) => boolean;
  readonly statSync: (value: string) => fs.Stats;
  readonly mkdirSync: (value: string, options: { recursive: true }) => void;
  readonly git?: GitWorkspaceFactory;
  readonly createGitWorkspaceFactory?: (resolver: GitCredentialResolver) => GitWorkspaceFactory;
}

const defaultDependencies: RepositoryDownloadDependencies = {
  existsSync: fs.existsSync,
  statSync: fs.statSync,
  mkdirSync: fs.mkdirSync,
  createGitWorkspaceFactory: createSystemGitWorkspaceFactory
};

const safeTargetPath = (destination: string, repositoryName: string): string | null => {
  if (
    repositoryName.length === 0 ||
    repositoryName.includes("/") ||
    repositoryName.includes("\\")
  ) {
    return null;
  }
  const resolvedDestination = path.resolve(destination);
  const targetPath = path.resolve(resolvedDestination, repositoryName);
  return targetPath.startsWith(`${resolvedDestination}${path.sep}`) ? targetPath : null;
};

const diagnostic = (code: string, message: string, context: Record<string, unknown>): Diagnostic =>
  createConfigDiagnostic(code, message, context);

export const downloadAssignmentRepositories = async ({
  cwd,
  assignmentFile,
  destination,
  token = null,
  dependencies: overrides = {}
}: {
  readonly cwd: string;
  readonly assignmentFile: string;
  readonly destination: string;
  readonly token?: string | null;
  readonly dependencies?: Partial<RepositoryDownloadDependencies>;
}): Promise<RepositoryDownloadResult> => {
  const dependencies = { ...defaultDependencies, ...overrides };
  const mappings = buildAssignmentRepositoryMappings({ cwd, assignmentFile });
  const base = {
    schemaVersion: 1 as const,
    commandName: "assignment download-repositories" as const,
    assignmentPath: assignmentFile,
    destination,
    repositoryMode: mappings.repositoryMode,
    totalTargets: mappings.targets.length
  };
  if (mappings.manifest.status !== "present") {
    return {
      ...base,
      status: "failure",
      exitCode: 1,
      clonedCount: 0,
      failedCount: 0,
      targets: [],
      diagnostics: mappings.diagnostics
    };
  }
  if (token === null && mappings.targets.length > 0) {
    return {
      ...base,
      status: "failure",
      exitCode: 1,
      clonedCount: 0,
      failedCount: 0,
      targets: [],
      diagnostics: [
        diagnostic(
          DiagnosticCode.GithubAuthMissing,
          "GitHub authentication is required to download repositories. Set GRAIDER_GITHUB_TOKEN or GITHUB_TOKEN.",
          {}
        )
      ]
    };
  }
  const authentication = createGitAuthenticationContext(randomUUID());
  if (authentication === null) throw new Error("Unable to create Git authentication context.");
  const credentialResolver: GitCredentialResolver = {
    resolve: (context) =>
      Promise.resolve(
        context === authentication && token !== null
          ? { kind: "github_token", host: "github.com", token }
          : null
      )
  };
  const git =
    dependencies.git ??
    (dependencies.createGitWorkspaceFactory ?? createSystemGitWorkspaceFactory)(credentialResolver);
  try {
    if (dependencies.existsSync(destination) && !dependencies.statSync(destination).isDirectory()) {
      throw new Error("destination_not_directory");
    }
    dependencies.mkdirSync(destination, { recursive: true });
  } catch {
    return {
      ...base,
      status: "failure",
      exitCode: 1,
      clonedCount: 0,
      failedCount: 0,
      targets: [],
      diagnostics: [
        diagnostic(
          "repository_download_destination_invalid",
          "Download destination is not a usable directory.",
          { destination }
        )
      ]
    };
  }
  try {
    await git.verifyAvailable();
  } catch {
    return {
      ...base,
      status: "failure",
      exitCode: 1,
      clonedCount: 0,
      failedCount: 0,
      targets: [],
      diagnostics: [
        diagnostic(
          "repository_download_git_unavailable",
          "Git is required to download repositories but was not available.",
          {}
        )
      ]
    };
  }
  const results: RepositoryDownloadTargetResult[] = [];
  for (const target of mappings.targets) {
    const localPath =
      safeTargetPath(destination, target.repositoryName) ??
      path.join(destination, target.repositoryName);
    const cloneUrl = target.cloneUrl ?? target.repositoryUrl;
    const baseTarget = {
      targetId: target.targetId,
      ...(target.groupId === undefined ? {} : { groupId: target.groupId }),
      repositoryName: target.repositoryName,
      ...(target.cloneUrl === undefined ? {} : { cloneUrl: target.cloneUrl }),
      ...(target.repositoryUrl === null ? {} : { htmlUrl: target.repositoryUrl }),
      localPath,
      studentIds: target.studentIds,
      githubUsernames: target.githubUsernames
    };
    if (cloneUrl === null || cloneUrl.length === 0) {
      results.push({
        ...baseTarget,
        status: "failed",
        diagnostics: [
          diagnostic(
            "repository_download_clone_url_missing",
            "Repository target does not have a cloneable URL.",
            { targetId: target.targetId, repositoryName: target.repositoryName }
          )
        ]
      });
      continue;
    }
    if (safeTargetPath(destination, target.repositoryName) === null) {
      results.push({
        ...baseTarget,
        status: "failed",
        diagnostics: [
          diagnostic(
            "repository_download_unsafe_path",
            "Repository name cannot be used as a safe download path.",
            { targetId: target.targetId, repositoryName: target.repositoryName }
          )
        ]
      });
      continue;
    }
    if (dependencies.existsSync(localPath)) {
      results.push({
        ...baseTarget,
        status: "failed",
        diagnostics: [
          diagnostic(
            "repository_download_destination_exists",
            "Destination folder already exists; Graider will not overwrite or update it in this release.",
            { repositoryName: target.repositoryName, localPath }
          )
        ]
      });
      continue;
    }
    try {
      const remote = createTrustedGitRemote(cloneUrl);
      if (remote === null) throw new Error("invalid_clone_remote");
      await git.clone({ remote, destination: localPath, checkout: "default", authentication });
      results.push({ ...baseTarget, status: "cloned", diagnostics: [] });
    } catch {
      results.push({
        ...baseTarget,
        status: "failed",
        diagnostics: [
          diagnostic("repository_download_clone_failed", "Repository clone failed.", {
            targetId: target.targetId,
            repositoryName: target.repositoryName
          })
        ]
      });
    }
  }
  const clonedCount = results.filter((result) => result.status === "cloned").length;
  const failedCount = results.length - clonedCount;
  return {
    ...base,
    status: failedCount === 0 ? "success" : clonedCount === 0 ? "failure" : "partial_success",
    exitCode: failedCount === 0 ? 0 : clonedCount === 0 ? 1 : 2,
    clonedCount,
    failedCount,
    targets: results,
    diagnostics: results.flatMap((result) => result.diagnostics)
  };
};
