import path from "node:path";
import type { resolveProductionGitHubClient } from "../dist-electron/githubClientCompositionBackend.cjs";

export type GitHubClient = Extract<
  ReturnType<typeof resolveProductionGitHubClient>,
  { readonly status: "available" }
>["githubClient"];

interface CompositionBackend {
  readonly resolveProductionGitHubClient: typeof resolveProductionGitHubClient;
}

export type GithubClientProvider = (token: string) => GitHubClient;

const loadBackend = (): CompositionBackend =>
  require(path.join(__dirname, "githubClientCompositionBackend.cjs")) as CompositionBackend;

export const createGithubClientProvider =
  (load: () => CompositionBackend = loadBackend): GithubClientProvider =>
  (token) => {
    if (token.trim().length === 0) throw new Error("GitHub client unavailable.");
    try {
      const resolved = load().resolveProductionGitHubClient({ token, env: {} });
      if (resolved.status === "token_missing") throw new Error("GitHub client unavailable.");
      return resolved.githubClient;
    } catch {
      throw new Error("GitHub client unavailable.");
    }
  };

export const provideGithubClient = createGithubClientProvider();
