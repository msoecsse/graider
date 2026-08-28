import type { ProcessRunner } from "./commandRunner.js";
import type { GitHubAuthResult } from "./ipc.js";
import { resolveGithubToken } from "./tokenResolver.js";

export interface GitHubAuthCheckerOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly fileExists?: (candidatePath: string) => boolean;
  readonly platform?: NodeJS.Platform;
  readonly runner: ProcessRunner;
}

export const checkGitHubAuth = async ({
  env = process.env,
  fileExists,
  platform,
  runner
}: GitHubAuthCheckerOptions): Promise<GitHubAuthResult> => {
  const tokenResolution = await resolveGithubToken({
    env,
    fileExists,
    platform,
    runner
  });

  if (tokenResolution.status === "success") {
    return {
      status: "connected",
      username: null,
      diagnostic: null,
      diagnosticCode: null
    };
  }

  return {
    status: "not_connected",
    username: null,
    diagnostic: tokenResolution.error.message,
    diagnosticCode: tokenResolution.error.code
  };
};
