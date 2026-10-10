import { describe, expect, it, vi } from "vitest";
import type { GitHubClient } from "./githubClientProvider.js";
import { createGithubClientProvider } from "./githubClientProvider.js";

const client = {} as GitHubClient;

describe("trusted GitHub client provider", () => {
  it("lazily composes the exact client with explicit credentials and an empty environment", () => {
    const resolveProductionGitHubClient = vi.fn(() => ({
      status: "available" as const,
      githubClient: client
    }));
    const load = vi.fn(() => ({ resolveProductionGitHubClient }));
    const provide = createGithubClientProvider(load);
    expect(load).not.toHaveBeenCalled();
    expect(provide("resolved-secret")).toBe(client);
    expect(resolveProductionGitHubClient).toHaveBeenCalledExactlyOnceWith({
      token: "resolved-secret",
      env: {}
    });
  });

  it("rejects empty credentials before loading and safely handles unexpected missing resolution", () => {
    const load = vi.fn(() => ({
      resolveProductionGitHubClient: vi.fn(() => ({ status: "token_missing" as const }))
    }));
    const provide = createGithubClientProvider(load);
    expect(() => provide(" ")).toThrow("GitHub client unavailable.");
    expect(load).not.toHaveBeenCalled();
    expect(() => provide("private-secret")).toThrow("GitHub client unavailable.");
  });
});
