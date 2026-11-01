import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  OctokitGitHubClient,
  type OctokitRestClientLike
} from "../../../src/github/octokit-github-client.js";

const ORGANIZATION_ID = 123;
const TEAM_ID = 456;
const PAGE_SIZE = 100;
const fixture = (token = "fake-session-token") => {
  const request = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} });
  return {
    request,
    client: new OctokitGitHubClient({
      token,
      octokit: { request } as unknown as OctokitRestClientLike
    }),
    signal: new AbortController().signal
  };
};

describe("managed team numeric transport", () => {
  it("paginates organization/team inventories and uses canonical numeric IDs for membership", async () => {
    const { client, request, signal } = fixture();
    await client.listManagedOrganizationTeamsPage("trusted-org", 2, PAGE_SIZE, signal);
    await client.getManagedTeam(ORGANIZATION_ID, TEAM_ID, signal);
    await client.listManagedTeamMembersPage(ORGANIZATION_ID, TEAM_ID, 3, PAGE_SIZE, signal);
    await client.createManagedTeam(
      "trusted-org",
      "Managed display",
      "canonical-description",
      signal
    );
    await client.setManagedTeamMembership(ORGANIZATION_ID, TEAM_ID, "verified-login", true, signal);
    await client.setManagedTeamMembership(
      ORGANIZATION_ID,
      TEAM_ID,
      "verified-extra",
      false,
      signal
    );
    expect(request.mock.calls.map(([input]: readonly unknown[]) => input)).toEqual([
      {
        method: "GET",
        url: "/orgs/{org}/teams",
        org: "trusted-org",
        page: 2,
        per_page: PAGE_SIZE,
        request: { signal, redirect: "error" }
      },
      {
        method: "GET",
        url: "/organizations/{org_id}/team/{team_id}",
        org_id: ORGANIZATION_ID,
        team_id: TEAM_ID,
        request: { signal, redirect: "error" }
      },
      {
        method: "GET",
        url: "/organizations/{org_id}/team/{team_id}/members",
        org_id: ORGANIZATION_ID,
        team_id: TEAM_ID,
        page: 3,
        per_page: PAGE_SIZE,
        role: "all",
        request: { signal, redirect: "error" }
      },
      {
        method: "POST",
        url: "/orgs/{org}/teams",
        org: "trusted-org",
        name: "Managed display",
        description: "canonical-description",
        privacy: "closed",
        request: { signal, redirect: "error" }
      },
      {
        method: "PUT",
        url: "/organizations/{org_id}/team/{team_id}/memberships/{username}",
        org_id: ORGANIZATION_ID,
        team_id: TEAM_ID,
        username: "verified-login",
        role: "member",
        request: { signal, redirect: "error" }
      },
      {
        method: "DELETE",
        url: "/organizations/{org_id}/team/{team_id}/memberships/{username}",
        org_id: ORGANIZATION_ID,
        team_id: TEAM_ID,
        username: "verified-extra",
        request: { signal, redirect: "error" }
      }
    ]);
  });

  it.each(["create", "add", "remove"])(
    "does not retry %s after transport failure or fall back to unauthenticated credentials",
    async (action) => {
      const { client, request, signal } = fixture();
      request.mockRejectedValue(new Error("private-provider-body"));
      const operation = () =>
        action === "create"
          ? client.createManagedTeam("org", "name", "description", signal)
          : client.setManagedTeamMembership(
              ORGANIZATION_ID,
              TEAM_ID,
              "verified-login",
              action === "add",
              signal
            );
      await expect(operation()).rejects.toThrow("GitHub organization request unavailable.");
      expect(request).toHaveBeenCalledTimes(1);
      const unauthenticated = fixture("");
      await expect(
        action === "create"
          ? unauthenticated.client.createManagedTeam("org", "name", "description", signal)
          : unauthenticated.client.setManagedTeamMembership(
              ORGANIZATION_ID,
              TEAM_ID,
              "verified-login",
              action === "add",
              signal
            )
      ).rejects.toMatchObject({ kind: "auth_missing" });
      expect(unauthenticated.request).not.toHaveBeenCalled();
    }
  );

  it("preserves existing production setup, Apply, discovery and faculty scope boundaries", () => {
    for (const file of [
      "ui/electron/main.ts",
      "ui/electron/courseSetupService.ts",
      "ui/electron/githubOAuthSession.ts",
      "src/faculty/faculty-scope-resolver.ts",
      "src/faculty/authorization-resolver.ts"
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /ManagedTeamMembershipReconciler|createManagedTeam|setManagedTeamMembership/
      );
    }
    expect(readFileSync("ui/electron/githubOAuthNetwork.ts", "utf8")).toContain(
      '["read:org", "repo"]'
    );
  });
});
