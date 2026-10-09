import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import { createGitHubClient } from "../../../src/github/github-client-factory.js";
import {
  readGitHubToken,
  resolveProductionGitHubClient
} from "../../../src/github/github-client-composition.js";

vi.mock("../../../src/github/github-client-factory.js", () => ({
  createGitHubClient: vi.fn()
}));

const client = new FakeGitHubClient();
const environment = {
  GRAIDER_GITHUB_TOKEN: "graider-token",
  GITHUB_TOKEN: "github-token"
};

describe("production GitHub client composition", () => {
  beforeEach(() => {
    vi.mocked(createGitHubClient).mockReturnValue(client);
  });

  it.each([
    { env: environment, expected: "graider-token" },
    { env: { GITHUB_TOKEN: " github-token " }, expected: "github-token" },
    { env: { GRAIDER_GITHUB_TOKEN: " \t", GITHUB_TOKEN: "github-token" }, expected: "github-token" }
  ])("uses transitional environment priority and trims tokens: $env", ({ env, expected }) => {
    expect(readGitHubToken(env)).toBe(expected);
    expect(resolveProductionGitHubClient({ env })).toEqual({
      status: "available",
      githubClient: client
    });
    expect(createGitHubClient).toHaveBeenCalledExactlyOnceWith({ token: expected });
  });

  it.each([environment, {}])(
    "honors an explicit token even with an empty environment: %j",
    (env) => {
      expect(resolveProductionGitHubClient({ token: " explicit-token ", env })).toEqual({
        status: "available",
        githubClient: client
      });
      expect(createGitHubClient).toHaveBeenCalledExactlyOnceWith({ token: "explicit-token" });
    }
  );

  it("treats a whitespace-only explicit token as missing and falls back to environment", () => {
    expect(resolveProductionGitHubClient({ token: " \t", env: environment }).status).toBe(
      "available"
    );
    expect(createGitHubClient).toHaveBeenCalledExactlyOnceWith({ token: "graider-token" });
  });

  it("uses injection without reading credentials or creating a client", () => {
    const lookup = vi.fn(() => {
      throw new Error("Unexpected credential lookup");
    });
    const env = {
      get GRAIDER_GITHUB_TOKEN(): string {
        return lookup();
      }
    };
    const options = {
      githubClient: client,
      env,
      get token(): string {
        return lookup();
      }
    };
    expect(resolveProductionGitHubClient(options)).toEqual({
      status: "available",
      githubClient: client
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(createGitHubClient).not.toHaveBeenCalled();
  });

  it.each([{}, { GRAIDER_GITHUB_TOKEN: " ", GITHUB_TOKEN: "\t" }])(
    "returns token_missing without construction: %j",
    (env) => {
      expect(readGitHubToken(env)).toBeUndefined();
      expect(resolveProductionGitHubClient({ env })).toEqual({ status: "token_missing" });
      expect(createGitHubClient).not.toHaveBeenCalled();
    }
  );

  it("exposes only status and the constructed client in the resolution", () => {
    const resolution = resolveProductionGitHubClient({ token: "private-credential", env: {} });
    expect(Object.keys(resolution).sort()).toEqual(["githubClient", "status"]);
    expect(JSON.stringify(resolution)).not.toContain("private-credential");
  });
});
