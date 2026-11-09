import path from "node:path";
import { verifiedGithubAccount } from "./githubAccountVerification.js";
import { managedCourseOperation } from "./managedCourseOperationContext.js";
import type { resolveProductionGitHubClient } from "../dist-electron/githubClientCompositionBackend.cjs";

export type GitHubClient = Extract<
  ReturnType<typeof resolveProductionGitHubClient>,
  { readonly status: "available" }
>["githubClient"];

interface CompositionBackend {
  readonly resolveProductionGitHubClient: typeof resolveProductionGitHubClient;
  readonly GITHUB_MUTATION_METHODS: readonly string[];
}

export type GithubClientProvider = (token: string) => GitHubClient;

const loadBackend = (): CompositionBackend =>
  require(path.join(__dirname, "githubClientCompositionBackend.cjs")) as CompositionBackend;

export const createGithubClientProvider =
  (load: () => CompositionBackend = loadBackend): GithubClientProvider =>
  (token) => {
    if (["local_read", "local_grading"].includes(managedCourseOperation.getStore()?.mode ?? ""))
      throw new Error("Local course operations cannot acquire a GitHub client.");
    if (token.trim().length === 0) throw new Error("GitHub client unavailable.");
    try {
      const backend = load();
      const resolved = backend.resolveProductionGitHubClient({ token, env: {} });
      if (resolved.status === "token_missing") throw new Error("GitHub client unavailable.");
      const operation = managedCourseOperation.getStore();
      const account = verifiedGithubAccount(token);
      if (!operation?.revalidate && !account) return resolved.githubClient;
      return new Proxy(resolved.githubClient, {
        get(target, key) {
          // Adapt existing backend account-evidence reads to the current verified lease.
          // Membership, repository authority and all mutation methods still use GitHub.
          if (account && key === "getOrganizationScopeResponse")
            return async (signal: AbortSignal) => {
              const verified = await account(signal);
              return {
                status: 200,
                headers: { "x-oauth-scopes": verified.scopes.join(",") },
                data: verified.identity
              };
            };
          if (account && key === "getAuthenticatedUser")
            return async (options?: { readonly signal: AbortSignal }) => {
              const { identity } = await account(options?.signal);
              return {
                id: identity.id,
                username: identity.login,
                ...(identity.name === null ? {} : { name: identity.name })
              };
            };
          const method = target[key as keyof GitHubClient];
          if (typeof method !== "function") return method;
          return backend.GITHUB_MUTATION_METHODS.includes(String(key))
            ? async (...args: unknown[]) => {
                await operation?.revalidate?.();
                return Reflect.apply(method, target, args);
              }
            : method.bind(target);
        }
      });
    } catch {
      throw new Error("GitHub client unavailable.");
    }
  };

export const provideGithubClient = createGithubClientProvider();
