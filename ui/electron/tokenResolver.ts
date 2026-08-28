import fs from "node:fs";
import path from "node:path";
import type { ProcessRunner } from "./commandRunner.js";
import type { DashboardCommandError } from "./ipc.js";

export const GITHUB_TOKEN_ENV_NAME = "GRAIDER_GITHUB_TOKEN";
export const GITHUB_TOKEN_FALLBACK_ENV_NAME = "GITHUB_TOKEN";
export const GITHUB_CLI_NOT_FOUND_CODE = "github_cli_not_found";
export const GITHUB_CLI_AUTH_FAILED_CODE = "github_cli_auth_failed";
export const GITHUB_AUTH_REQUIRED_CODE = "github_token_unavailable";

const GITHUB_CLI_COMMAND = "gh";
const GITHUB_AUTH_TOKEN_ARGS = ["auth", "token"] as const;
const SUCCESS_EXIT_CODE = 0;
const DEBUG_ENV_NAME = "GRAIDER_UI_DEBUG";
const DEBUG_ENABLED_VALUE = "1";

const MACOS_GITHUB_CLI_PATHS = [
  "/opt/homebrew/bin/gh",
  "/usr/local/bin/gh",
  "/usr/bin/gh"
] as const;
const LINUX_GITHUB_CLI_PATHS = ["/usr/bin/gh", "/usr/local/bin/gh"] as const;
const WINDOWS_GITHUB_CLI_PATH_SUFFIX = ["GitHub CLI", "gh.exe"] as const;

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
  readonly fileExists?: (candidatePath: string) => boolean;
  readonly platform?: NodeJS.Platform;
  readonly runner: ProcessRunner;
}

const createTokenUnavailableError = (
  code: string,
  message: string,
  exitCode: number | null
): DashboardCommandError => ({
  code,
  message,
  exitCode,
  stderrSnippet: null,
  stdoutSnippet: null
});

const isDebugEnabled = (env: NodeJS.ProcessEnv): boolean =>
  env[DEBUG_ENV_NAME]?.trim() === DEBUG_ENABLED_VALUE;

const logAuthResolution = (env: NodeJS.ProcessEnv, message: string): void => {
  if (isDebugEnabled(env)) {
    console.error(`[graider-ui] GitHub auth: ${message}`);
  }
};

const appendIfPresent = (
  values: string[],
  candidate: string | undefined,
  suffix: readonly string[]
): void => {
  if (candidate !== undefined && candidate.trim().length > 0) {
    values.push(path.join(candidate, ...suffix));
  }
};

export const getCommonGithubCliPaths = (
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): readonly string[] => {
  if (platform === "darwin") {
    return MACOS_GITHUB_CLI_PATHS;
  }

  if (platform === "linux") {
    return LINUX_GITHUB_CLI_PATHS;
  }

  if (platform === "win32") {
    const windowsPaths: string[] = [];
    appendIfPresent(windowsPaths, env.ProgramFiles, WINDOWS_GITHUB_CLI_PATH_SUFFIX);
    appendIfPresent(windowsPaths, env["ProgramFiles(x86)"], WINDOWS_GITHUB_CLI_PATH_SUFFIX);
    return windowsPaths;
  }

  return [];
};

const getGithubCliCandidates = (
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv
): readonly string[] => [
  GITHUB_CLI_COMMAND,
  ...getCommonGithubCliPaths(platform, env).filter((candidate) => candidate !== GITHUB_CLI_COMMAND)
];

export const resolveGithubToken = async ({
  env = process.env,
  fileExists = fs.existsSync,
  platform = process.platform,
  runner
}: GithubTokenResolverOptions): Promise<GithubTokenResolution> => {
  const environmentToken =
    env[GITHUB_TOKEN_ENV_NAME]?.trim() ?? env[GITHUB_TOKEN_FALLBACK_ENV_NAME]?.trim();

  if (environmentToken !== undefined && environmentToken.length > 0) {
    logAuthResolution(env, "env token present.");
    return {
      status: "success",
      token: environmentToken
    };
  }

  for (const candidate of getGithubCliCandidates(platform, env)) {
    if (candidate !== GITHUB_CLI_COMMAND && !fileExists(candidate)) {
      continue;
    }

    const result = await runner({
      command: candidate,
      args: GITHUB_AUTH_TOKEN_ARGS,
      env
    });

    if (result.error !== null) {
      if (result.error.code === "ENOENT") {
        logAuthResolution(env, `gh not found at ${candidate}.`);
        continue;
      }

      logAuthResolution(env, "gh auth token failed.");
      return {
        status: "failure",
        error: createTokenUnavailableError(
          GITHUB_CLI_AUTH_FAILED_CODE,
          "GitHub CLI is installed, but no authenticated token was available. Run gh auth login, then refresh.",
          null
        )
      };
    }

    if (result.exitCode !== SUCCESS_EXIT_CODE) {
      logAuthResolution(env, "gh auth token failed.");
      return {
        status: "failure",
        error: createTokenUnavailableError(
          GITHUB_CLI_AUTH_FAILED_CODE,
          "GitHub CLI is installed, but no authenticated token was available. Run gh auth login, then refresh.",
          result.exitCode
        )
      };
    }

    const githubCliToken = result.stdout.trim();

    if (githubCliToken.length === 0) {
      logAuthResolution(env, "gh auth token failed.");
      return {
        status: "failure",
        error: createTokenUnavailableError(
          GITHUB_CLI_AUTH_FAILED_CODE,
          "GitHub CLI is installed, but no authenticated token was available. Run gh auth login, then refresh.",
          result.exitCode
        )
      };
    }

    logAuthResolution(env, "gh auth token succeeded.");
    return {
      status: "success",
      token: githubCliToken
    };
  }

  return {
    status: "failure",
    error: createTokenUnavailableError(
      GITHUB_CLI_NOT_FOUND_CODE,
      "GitHub CLI was not found. Install GitHub CLI, then run gh auth login.",
      null
    )
  };
};
