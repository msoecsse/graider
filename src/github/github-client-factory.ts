import { GitHubClient } from "./github-client.js";
import { OctokitGitHubClient } from "./octokit-github-client.js";

export const GRAIDER_GITHUB_TOKEN_ENV = "GRAIDER_GITHUB_TOKEN";
export const GITHUB_TOKEN_ENV = "GITHUB_TOKEN";
const EMPTY_LENGTH = 0;

export interface GitHubClientFactoryOptions {
  token?: string;
  env?: Record<string, string | undefined>;
}

export function createGitHubClient(options: GitHubClientFactoryOptions = {}): GitHubClient {
  const token = options.token ?? readGitHubToken(options.env);
  return new OctokitGitHubClient(token === undefined ? {} : { token });
}

export function readGitHubToken(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const graiderToken = normalizeToken(env[GRAIDER_GITHUB_TOKEN_ENV]);

  if (graiderToken !== undefined) {
    return graiderToken;
  }

  return normalizeToken(env[GITHUB_TOKEN_ENV]);
}

function normalizeToken(token: string | undefined): string | undefined {
  const normalized = token?.trim();
  return normalized === undefined || normalized.length === EMPTY_LENGTH ? undefined : normalized;
}
