import { describe, expect, it, vi } from "vitest";
import {
  OctokitGitHubClient,
  type OctokitRestClientLike
} from "../../../src/github/octokit-github-client.js";
const PAGE_SIZE = 100;
const fixture = (token = "fake-session-token") => {
  const request = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} });
  const client = new OctokitGitHubClient({
    token,
    octokit: { request } as unknown as OctokitRestClientLike
  });
  return { client, request, signal: new AbortController().signal };
};
describe("managed branch GitHub transport", () => {
  it("reads effective ref identity and complete cursor-paginated classic rule state by repository node ID", async () => {
    const f = fixture();
    await f.client.getManagedBranchRulesPage(
      "immutable-node",
      "hand-in/topic",
      "next-page",
      f.signal
    );
    const input = f.request.mock.calls[0]?.[0] as {
      method: string;
      url: string;
      query: string;
      variables: unknown;
      request: unknown;
    };
    expect(input.method).toBe("POST");
    expect(input.url).toBe("/graphql");
    expect(input.variables).toEqual({
      repositoryId: "immutable-node",
      qualifiedName: "refs/heads/hand-in/topic",
      cursor: "next-page"
    });
    for (const field of [
      "branchProtectionRule { id }",
      "defaultBranchRef",
      "isAdminEnforced",
      "lockBranch",
      "bypassForcePushAllowances",
      "branchProtectionRuleConflicts",
      "pageInfo",
      "requiresDeployments"
    ])
      expect(input.query).toContain(field);
    expect(input.request).toEqual({ signal: f.signal, redirect: "error" });
  });

  it("reads effective REST protection and inherited rulesets without ruleset mutation", async () => {
    const f = fixture();
    await f.client.getManagedBranchProtection(
      "current-org",
      "current-repo",
      "topic/hand-in",
      f.signal
    );
    await f.client.listManagedBranchRulesetsPage(
      "current-org",
      "current-repo",
      2,
      PAGE_SIZE,
      f.signal
    );
    await f.client.listManagedEffectiveBranchRulesPage(
      "current-org",
      "current-repo",
      "topic/hand-in",
      3,
      PAGE_SIZE,
      f.signal
    );
    expect(f.request.mock.calls.map(([input]: readonly unknown[]) => input)).toEqual([
      {
        method: "GET",
        url: "/repos/{owner}/{repo}/branches/{branch}/protection",
        owner: "current-org",
        repo: "current-repo",
        branch: "topic/hand-in",
        request: { signal: f.signal, redirect: "error" }
      },
      {
        method: "GET",
        url: "/repos/{owner}/{repo}/rulesets",
        owner: "current-org",
        repo: "current-repo",
        page: 2,
        per_page: PAGE_SIZE,
        includes_parents: true,
        request: { signal: f.signal, redirect: "error" }
      },
      {
        method: "GET",
        url: "/repos/{owner}/{repo}/rules/branches/{branch}",
        owner: "current-org",
        repo: "current-repo",
        branch: "topic/hand-in",
        page: 3,
        per_page: PAGE_SIZE,
        request: { signal: f.signal, redirect: "error" }
      }
    ]);
  });

  it("new exact policy enforces admins and introduces none of the normal-push restrictions", async () => {
    const f = fixture();
    await f.client.createManagedBranchRule("immutable-repo", "default-branch", f.signal);
    const input = f.request.mock.calls[0]?.[0] as {
      method: string;
      query: string;
      variables: { input: Record<string, unknown> };
    };
    expect(input.method).toBe("POST");
    expect(input.query).toContain("createBranchProtectionRule");
    expect(input.variables.input).toMatchObject({
      repositoryId: "immutable-repo",
      pattern: "default-branch",
      allowsForcePushes: false,
      allowsDeletions: false,
      isAdminEnforced: true
    });
    for (const field of [
      "requiresApprovingReviews",
      "requiresStatusChecks",
      "requiresStrictStatusChecks",
      "requiresCodeOwnerReviews",
      "requiresCommitSignatures",
      "requiresLinearHistory",
      "requiresConversationResolution",
      "requiresDeployments",
      "requireLastPushApproval",
      "restrictsPushes",
      "lockBranch"
    ])
      expect(input.variables.input[field]).toBe(false);
    expect(input.variables.input).not.toHaveProperty("bypassForcePushActorIds");
    expect(input.variables.input).not.toHaveProperty("pushActorIds");
  });

  it("existing exact rule updates send only immutable rule ID and the three owned fields", async () => {
    const f = fixture();
    await f.client.tightenManagedBranchRule("immutable-rule", f.signal);
    const input = f.request.mock.calls[0]?.[0] as { query: string; variables: unknown };
    expect(input.query).toContain("updateBranchProtectionRule");
    expect(input.variables).toEqual({
      input: {
        branchProtectionRuleId: "immutable-rule",
        allowsForcePushes: false,
        allowsDeletions: false,
        isAdminEnforced: true
      }
    });
  });

  it.each(["create", "update"])(
    "%s has no blind retries or unauthenticated fallback",
    async (kind) => {
      const f = fixture();
      f.request.mockRejectedValue(new Error("provider secret"));
      const invoke = (client: OctokitGitHubClient) =>
        kind === "create"
          ? client.createManagedBranchRule("repo-id", "branch", f.signal)
          : client.tightenManagedBranchRule("rule-id", f.signal);
      await expect(invoke(f.client)).rejects.toThrow("GitHub organization request unavailable.");
      expect(f.request).toHaveBeenCalledTimes(1);
      const unauthenticated = fixture("");
      await expect(invoke(unauthenticated.client)).rejects.toMatchObject({ kind: "auth_missing" });
      expect(unauthenticated.request).not.toHaveBeenCalled();
    }
  );
});
