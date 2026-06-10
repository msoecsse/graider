import type { ProcessRunner } from "./commandRunner.js";
import type { DashboardCommandError } from "./ipc.js";

export const GITHUB_TOKEN_ENV_NAME = "GRAIDER_GITHUB_TOKEN";

const GITHUB_CLI_COMMAND = "gh";
const GITHUB_AUTH_TOKEN_ARGS = ["auth", "token"] as const;
const SUCCESS_EXIT_CODE = 0;

export type GithubTokenResolution =
  | {
      readonly status: "success";
      readonly token: string;
    }
  | {
      readonly status: "failure";
      readonly error: DashboardCommandError;
    };

export interface GithubTokenResolverOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly runner: ProcessRunner;
}

const createTokenUnavailableError = (
  message: string,
  exitCode: number | null
): DashboardCommandError => ({
  code: "github_token_unavailable",
  message,
  exitCode,
  stderrSnippet: null,
  stdoutSnippet: null
});

export const resolveGithubToken = async ({
  env = process.env,
  runner
}: GithubTokenResolverOptions): Promise<GithubTokenResolution> => {
  const environmentToken = env[GITHUB_TOKEN_ENV_NAME]?.trim();

  if (environmentToken !== undefined && environmentToken.length > 0) {
    return {
      status: "success",
      token: environmentToken
    };
  }

  const result = await runner({
    command: GITHUB_CLI_COMMAND,
    args: GITHUB_AUTH_TOKEN_ARGS,
    env
  });

  if (result.error !== null) {
    return {
      status: "failure",
      error: createTokenUnavailableError(
        "GitHub token unavailable. Sign in with GitHub CLI or launch Graider with GRAIDER_GITHUB_TOKEN set.",
        null
      )
    };
  }

  if (result.exitCode !== SUCCESS_EXIT_CODE) {
    return {
      status: "failure",
      error: createTokenUnavailableError(
        "GitHub token unavailable. Run gh auth login, then refresh.",
        result.exitCode
      )
    };
  }

  const githubCliToken = result.stdout.trim();

  if (githubCliToken.length === 0) {
    return {
      status: "failure",
      error: createTokenUnavailableError(
        "GitHub token unavailable. GitHub CLI returned an empty token.",
        result.exitCode
      )
    };
  }

  return {
    status: "success",
    token: githubCliToken
  };
};
