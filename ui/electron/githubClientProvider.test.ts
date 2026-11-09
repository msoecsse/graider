import { managedCourseOperation } from "./managedCourseOperationContext";
import type { VerifiedEvidenceReadContext } from "./managedCourseMutationTypes";
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
    const load = vi.fn(() => ({ resolveProductionGitHubClient, GITHUB_MUTATION_METHODS: [] }));
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
      resolveProductionGitHubClient: vi.fn(() => ({ status: "token_missing" as const })),
      GITHUB_MUTATION_METHODS: []
    }));
    const provide = createGithubClientProvider(load);
    expect(() => provide(" ")).toThrow("GitHub client unavailable.");
    expect(load).not.toHaveBeenCalled();
    expect(() => provide("private-secret")).toThrow("GitHub client unavailable.");
  });
});

it("evidence capabilities permit reads, deny mutations and invalidate reads after account changes", async () => {
  let active = true;
  const read = vi.fn(async () => {
    active = false;
    return {};
  });
  const write = vi.fn();
  const evidenceClient = {
    getRepository: read,
    createRepository: write
  } as unknown as GitHubClient;
  const provider = createGithubClientProvider(() => ({
    resolveProductionGitHubClient: () => ({ status: "available", githubClient: evidenceClient }),
    GITHUB_MUTATION_METHODS: ["createRepository"]
  }));
  const context: VerifiedEvidenceReadContext = {
    mode: "evidence_read",
    managed: true,
    userId: 42,
    repositoryId: 20,
    cachedCommit: "a".repeat(40),
    operationalCommit: "a".repeat(40),
    courseFolderId: "fixture",
    courseFolderPath: "fixture",
    evidence: {
      token: "test-secret",
      assertCurrent: () => {
        if (!active) throw new Error("Account changed");
      }
    }
  };
  await managedCourseOperation.run(context, async () => {
    const client = provider("test-secret") as unknown as {
      getRepository: () => Promise<unknown>;
      createRepository: () => Promise<unknown>;
    };
    await expect(client.createRepository()).rejects.toThrow("cannot mutate GitHub");
    expect(write).not.toHaveBeenCalled();
    await expect(client.getRepository()).rejects.toThrow("Account changed");
    await expect(client.getRepository()).rejects.toThrow("Account changed");
    expect(read).toHaveBeenCalledOnce();
  });
});
