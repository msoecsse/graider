import path from "node:path";
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
    if (managedCourseOperation.getStore()?.mode === "local_read")
      throw new Error("Local course reads cannot acquire a GitHub client.");
    if (token.trim().length === 0) throw new Error("GitHub client unavailable.");
    try {
      const backend = load();
      const resolved = backend.resolveProductionGitHubClient({ token, env: {} });
      if (resolved.status === "token_missing") throw new Error("GitHub client unavailable.");
      const operation = managedCourseOperation.getStore();
      if (!operation?.revalidate) return resolved.githubClient;
      return new Proxy(resolved.githubClient, {
        get(target, key) {
          const method = target[key as keyof GitHubClient];
          if (typeof method !== "function") return method;
          return backend.GITHUB_MUTATION_METHODS.includes(String(key))
            ? async (...args: unknown[]) => {
                await operation.revalidate?.();
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
