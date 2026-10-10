import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubClient } from "./githubClientProvider.js";
import { validateTemplateRepository } from "./templateRepositoryValidationService.js";

const TOKEN = "secret-token";
const runner = vi.fn();
const successToken = async () => ({ status: "success" as const, token: TOKEN });
const REACHABILITY_MESSAGE =
  "Unable to reach GitHub to validate the template repository. Try again when GitHub is available.";
const REPOSITORY_MESSAGE = "Template repository was not found or is not accessible: owner/repo";
const BRANCH_MESSAGE = "Unable to validate the template branch. Check GitHub access and try again.";

const createDependencies = (defaultBranch = "main") => {
  const getRepository = vi.fn<GitHubClient["getRepository"]>().mockResolvedValue({
    owner: "owner",
    name: "repo",
    fullName: "owner/repo",
    id: 1,
    private: true,
    archived: false,
    defaultBranch,
    htmlUrl: "https://github.com/owner/repo"
  });
  const getRepositoryBranch = vi.fn<GitHubClient["getRepositoryBranch"]>().mockResolvedValue({
    name: "main",
    commitSha: "branch-sha"
  });
  const reads: Pick<GitHubClient, "getRepository" | "getRepositoryBranch"> = {
    getRepository,
    getRepositoryBranch
  };
  const client = reads as GitHubClient;
  const provideClient = vi.fn(() => client);
  const resolveToken = vi.fn(successToken);
  return { client, getRepository, getRepositoryBranch, provideClient, resolveToken, runner };
};

// Bundled clients expose the domain error's name/kind across the Electron backend boundary.
const clientError = (kind: string) =>
  Object.assign(new Error(`Internal API response https://${TOKEN}@github.test raw body`), {
    name: "GitHubClientError",
    kind
  });

const expectSafe = (result: unknown): void => {
  expect(JSON.stringify(result)).not.toMatch(/secret-token|raw body|Internal API|github\.test/u);
};

describe("templateRepositoryValidationService", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Unexpected direct fetch");
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("normalizes GitHub URLs and uses exactly the provider's client for an explicit branch", async () => {
    const dependencies = createDependencies();
    const result = await validateTemplateRepository(
      "https://github.com/csc1120/template.git",
      " release/course ",
      dependencies
    );

    expect(result).toEqual({
      valid: true,
      repository: "csc1120/template",
      branch: "release/course",
      diagnostics: [{ message: "Template repository validated." }]
    });
    expect(dependencies.resolveToken).toHaveBeenCalledTimes(1);
    expect(dependencies.provideClient).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(dependencies.provideClient.mock.results[0]?.value).toBe(dependencies.client);
    expect(dependencies.getRepository).toHaveBeenCalledExactlyOnceWith("csc1120", "template");
    expect(dependencies.getRepositoryBranch).toHaveBeenCalledExactlyOnceWith(
      "csc1120",
      "template",
      "release/course"
    );
    expect(dependencies.resolveToken.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.provideClient.mock.invocationCallOrder[0]!
    );
    expect(dependencies.provideClient.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.getRepository.mock.invocationCallOrder[0]!
    );
    expect(dependencies.getRepository.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.getRepositoryBranch.mock.invocationCallOrder[0]!
    );
    expectSafe(result);
  });

  it("uses the returned repository default branch when branch input is blank", async () => {
    const dependencies = createDependencies("master");
    const result = await validateTemplateRepository("owner/repo", "  ", dependencies);

    expect(result).toEqual({
      valid: true,
      repository: "owner/repo",
      branch: "master",
      diagnostics: [{ message: "Template repository validated. Using default branch: master." }]
    });
    expect(dependencies.getRepository).toHaveBeenCalledExactlyOnceWith("owner", "repo");
    expect(dependencies.getRepositoryBranch).toHaveBeenCalledExactlyOnceWith(
      "owner",
      "repo",
      "master"
    );
    expectSafe(result);
  });

  it("rejects invalid syntax before any authentication or client work", async () => {
    const dependencies = createDependencies();
    const result = await validateTemplateRepository("not valid", "main", dependencies);

    expect(result).toEqual({
      valid: false,
      repository: null,
      branch: null,
      diagnostics: [
        {
          message:
            "Template repository value must be in owner/repo form or a GitHub repository URL."
        }
      ]
    });
    expect(dependencies.resolveToken).not.toHaveBeenCalled();
    expect(dependencies.provideClient).not.toHaveBeenCalled();
    expect(dependencies.getRepository).not.toHaveBeenCalled();
    expect(dependencies.getRepositoryBranch).not.toHaveBeenCalled();
  });

  it("projects authentication failure safely without constructing a client", async () => {
    const dependencies = createDependencies();
    const result = await validateTemplateRepository("owner/repo", "main", {
      ...dependencies,
      resolveToken: async () => ({
        status: "failure",
        error: {
          code: "github_token_unavailable",
          message: TOKEN,
          exitCode: null,
          stderrSnippet: TOKEN,
          stdoutSnippet: TOKEN
        }
      })
    });

    expect(result).toEqual({
      valid: false,
      repository: "owner/repo",
      branch: "main",
      diagnostics: [
        {
          message:
            "GitHub authentication is required. Sign in with GitHub CLI or configure the supported token before saving this assignment."
        }
      ]
    });
    expect(dependencies.provideClient).not.toHaveBeenCalled();
    expect(dependencies.getRepository).not.toHaveBeenCalled();
    expectSafe(result);
  });

  it("resolves the environment token through the existing resolver without mutating process.env", async () => {
    const dependencies = createDependencies();
    const environmentBefore = { ...process.env };
    const env = { GRAIDER_GITHUB_TOKEN: ` ${TOKEN} `, GITHUB_TOKEN: "fallback-token" };
    const result = await validateTemplateRepository("owner/repo", "main", {
      runner,
      env,
      provideClient: dependencies.provideClient
    });

    expect(result.valid).toBe(true);
    expect(dependencies.provideClient).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(runner).not.toHaveBeenCalled();
    expect(env.GRAIDER_GITHUB_TOKEN).toBe(` ${TOKEN} `);
    expect(process.env).toEqual(environmentBefore);
    expectSafe(result);
  });

  it("returns the existing diagnostic for an inaccessible repository and skips branch lookup", async () => {
    const dependencies = createDependencies();
    dependencies.getRepository.mockResolvedValue(null);
    const result = await validateTemplateRepository("owner/repo", "", dependencies);

    expect(result).toEqual({
      valid: false,
      repository: "owner/repo",
      branch: null,
      diagnostics: [{ message: REPOSITORY_MESSAGE }]
    });
    expect(dependencies.getRepositoryBranch).not.toHaveBeenCalled();
  });

  it("reports a missing branch with the chosen default branch", async () => {
    const dependencies = createDependencies("master");
    dependencies.getRepositoryBranch.mockResolvedValue(null);
    const result = await validateTemplateRepository("owner/repo", "", dependencies);

    expect(result).toEqual({
      valid: false,
      repository: "owner/repo",
      branch: "master",
      diagnostics: [{ message: "Template repository exists, but branch master was not found." }]
    });
  });

  it("reports a missing explicit branch", async () => {
    const dependencies = createDependencies();
    dependencies.getRepositoryBranch.mockResolvedValue(null);
    const result = await validateTemplateRepository("owner/repo", "missing", dependencies);

    expect(result).toEqual({
      valid: false,
      repository: "owner/repo",
      branch: "missing",
      diagnostics: [{ message: "Template repository exists, but branch missing was not found." }]
    });
  });

  it("rejects empty default branch metadata before branch lookup", async () => {
    const dependencies = createDependencies(" ");
    const result = await validateTemplateRepository("owner/repo", "", dependencies);

    expect(result).toEqual({
      valid: false,
      repository: "owner/repo",
      branch: null,
      diagnostics: [{ message: "Template repository did not provide a default branch." }]
    });
    expect(dependencies.getRepositoryBranch).not.toHaveBeenCalled();
  });

  it.each(["auth_missing", "auth_failed", "permission_denied", "rate_limited", "api_error"])(
    "projects repository %s failures without exposing client details",
    async (kind) => {
      const dependencies = createDependencies();
      dependencies.getRepository.mockRejectedValue(clientError(kind));
      const result = await validateTemplateRepository("owner/repo", "main", dependencies);

      expect(result).toEqual({
        valid: false,
        repository: "owner/repo",
        branch: "main",
        diagnostics: [{ message: REPOSITORY_MESSAGE }]
      });
      expect(dependencies.getRepositoryBranch).not.toHaveBeenCalled();
      expectSafe(result);
    }
  );

  it.each(["auth_missing", "auth_failed", "permission_denied", "rate_limited", "api_error"])(
    "projects branch %s failures safely and retains the resolved branch",
    async (kind) => {
      const dependencies = createDependencies("master");
      dependencies.getRepositoryBranch.mockRejectedValue(clientError(kind));
      const result = await validateTemplateRepository("owner/repo", "", dependencies);

      expect(result).toEqual({
        valid: false,
        repository: "owner/repo",
        branch: "master",
        diagnostics: [{ message: BRANCH_MESSAGE }]
      });
      expectSafe(result);
    }
  );

  it.each(["getRepository", "getRepositoryBranch"] as const)(
    "projects network, timeout and unexpected failures from %s safely",
    async (method) => {
      for (const error of [
        clientError("network_error"),
        clientError("timeout"),
        new Error(TOKEN)
      ]) {
        const dependencies = createDependencies("master");
        dependencies[method].mockRejectedValue(error);
        const result = await validateTemplateRepository("owner/repo", "", dependencies);

        expect(result).toEqual({
          valid: false,
          repository: "owner/repo",
          branch: null,
          diagnostics: [{ message: REACHABILITY_MESSAGE }]
        });
        expectSafe(result);
      }
    }
  );

  it("projects provider failures safely", async () => {
    const dependencies = createDependencies();
    dependencies.provideClient.mockImplementation(() => {
      throw new Error(TOKEN);
    });
    const result = await validateTemplateRepository("owner/repo", "main", dependencies);

    expect(result).toEqual({
      valid: false,
      repository: "owner/repo",
      branch: "main",
      diagnostics: [{ message: REACHABILITY_MESSAGE }]
    });
    expect(dependencies.getRepository).not.toHaveBeenCalled();
    expectSafe(result);
  });
});
