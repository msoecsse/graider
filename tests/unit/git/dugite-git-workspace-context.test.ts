import { describe, expect, it, vi } from "vitest";
import type { GitCredentialResolver } from "../../../src/git/git-credential-resolver.js";
import { createGitAuthenticationContext } from "../../../src/git/git-workspace.js";
import {
  createAuthenticatedDugiteGitWorkspace,
  createDugiteGitWorkspaceFactory
} from "../../../src/git/dugite-git-workspace-context.js";

const captured = vi.hoisted(() => ({ resolvers: [] as (GitCredentialResolver | undefined)[] }));
vi.mock("../../../src/git/git-command-workspace.js", () => ({
  GitCommandWorkspaceFactory: class {
    constructor(readonly options: { credentialResolver?: GitCredentialResolver }) {
      captured.resolvers.push(options.credentialResolver);
    }
  }
}));
vi.mock("../../../src/git/dugite-git-runners.js", () => ({ createDugiteGitRunners: () => ({}) }));

describe("authenticated Dugite composition", () => {
  it("resolves a trimmed GitHub token only for the exact operation context", async () => {
    const first = createAuthenticatedDugiteGitWorkspace("  operation-secret  ");
    const resolver = captured.resolvers[captured.resolvers.length - 1];
    const second = createAuthenticatedDugiteGitWorkspace("second-secret");
    expect(first.factory).not.toBe(second.factory);
    expect(first.authentication.id).not.toBe(second.authentication.id);
    expect(Object.keys(first).sort()).toEqual(["authentication", "factory"]);
    await expect(resolver?.resolve(first.authentication)).resolves.toEqual({
      kind: "github_token",
      host: "github.com",
      token: "operation-secret"
    });
    await expect(resolver?.resolve(second.authentication)).resolves.toBeNull();
    const copied = createGitAuthenticationContext(first.authentication.id);
    if (copied === null) throw new Error("Invalid test context.");
    await expect(resolver?.resolve(copied)).resolves.toBeNull();
    expect(JSON.stringify(first)).not.toContain("operation-secret");
  });

  it("rejects empty credentials and preserves credential-free local composition", () => {
    expect(() => createAuthenticatedDugiteGitWorkspace(" \n ")).toThrow(/authentication/u);
    createDugiteGitWorkspaceFactory();
    expect(captured.resolvers[captured.resolvers.length - 1]).toBeUndefined();
  });
});
