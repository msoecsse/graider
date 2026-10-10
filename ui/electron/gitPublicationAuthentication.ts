import type { ProcessRunner } from "./commandRunner.js";
import {
  createAuthenticatedProductionGitWorkspace,
  type AuthenticatedGitWorkspaceContext,
  type GitWorkspaceInspectionFactory
} from "./gitWorkspaceReader.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";

export interface GitPublicationOptions {
  readonly runner: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly factory?: GitWorkspaceInspectionFactory;
  readonly resolveToken?: () => Promise<GithubTokenResolution>;
  readonly createAuthenticatedWorkspace?: (token: string) => AuthenticatedGitWorkspaceContext;
}

export const authenticateGitPublication = async (
  options: GitPublicationOptions
): Promise<AuthenticatedGitWorkspaceContext | null> => {
  try {
    const resolution = await (options.resolveToken ?? (() => resolveGithubToken(options)))();
    return resolution.status === "success"
      ? (options.createAuthenticatedWorkspace ?? createAuthenticatedProductionGitWorkspace)(
          resolution.token
        )
      : null;
  } catch {
    return null;
  }
};
