import type { GitHubClient } from "./github-client.js";
import { createGitHubClient } from "./github-client-factory.js";

export const GRAIDER_GITHUB_TOKEN_ENV = "GRAIDER_GITHUB_TOKEN";
export const GITHUB_TOKEN_ENV = "GITHUB_TOKEN";
const EMPTY_LENGTH = 0;

export interface ProductionGitHubClientOptions {
  readonly githubClient?: GitHubClient | undefined;
  readonly token?: string;
  readonly env?: Record<string, string | undefined>;
}

export type ProductionGitHubClientResolution =
  | { readonly status: "available"; readonly githubClient: GitHubClient }
  | { readonly status: "token_missing" };

export const resolveProductionGitHubClient = (
  options: ProductionGitHubClientOptions = {}
): ProductionGitHubClientResolution => {
  if (options.githubClient !== undefined) {
    return { status: "available", githubClient: options.githubClient };
  }

  const token = normalizeToken(options.token) ?? readGitHubToken(options.env);
  return token === undefined
    ? { status: "token_missing" }
    : { status: "available", githubClient: createGitHubClient({ token }) };
};

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
