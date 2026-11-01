import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  OctokitGitHubClient,
  type OctokitRestClientLike
} from "../../../src/github/octokit-github-client.js";
const ORGANIZATION_ID = 200;
const TEAM_ID = 1000;
const PAGE_SIZE = 100;
const fixture = (token = "fake-session-token") => {
  const request = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} });
  return {
    client: new OctokitGitHubClient({
      token,
      octokit: { request } as unknown as OctokitRestClientLike
    }),
    request,
    signal: new AbortController().signal
  };
};
describe("v2 course repository permission transport", () => {
  it("uses complete pagination and numeric team identity with current repository locators", async () => {
    const { client, request, signal } = fixture();
    await client.listCourseRepositoryTeamsPage(
      "current-org",
      "current-admin",
      2,
      PAGE_SIZE,
      signal
    );
    await client.setCourseRepositoryTeamPermission(
      ORGANIZATION_ID,
      TEAM_ID,
      "current-org",
      "current-admin",
      "push",
      signal
    );
    await client.setCourseRepositoryTeamPermission(
      ORGANIZATION_ID,
      TEAM_ID,
      "current-org",
      "current-admin",
      "none",
      signal
    );
    await client.setCourseFallbackPermission(
      "current-org",
      "current-admin",
      "verified-fallback",
      signal
    );
    expect(request.mock.calls.map(([input]: readonly unknown[]) => input)).toEqual([
      {
        method: "GET",
        url: "/repos/{owner}/{repo}/teams",
        owner: "current-org",
        repo: "current-admin",
        page: 2,
        per_page: PAGE_SIZE,
        request: { signal, redirect: "error" }
      },
      {
        method: "PUT",
        url: "/organizations/{org_id}/team/{team_id}/repos/{owner}/{repo}",
        org_id: ORGANIZATION_ID,
        team_id: TEAM_ID,
        owner: "current-org",
        repo: "current-admin",
        permission: "push",
        request: { signal, redirect: "error" }
      },
      {
        method: "DELETE",
        url: "/organizations/{org_id}/team/{team_id}/repos/{owner}/{repo}",
        org_id: ORGANIZATION_ID,
        team_id: TEAM_ID,
        owner: "current-org",
        repo: "current-admin",
        request: { signal, redirect: "error" }
      },
      {
        method: "PUT",
        url: "/repos/{owner}/{repo}/collaborators/{username}",
        owner: "current-org",
        repo: "current-admin",
        username: "verified-fallback",
        permission: "admin",
        request: { signal, redirect: "error" }
      }
    ]);
  });

  it("reads permission sources by canonical node ID with cursor pagination", async () => {
    const { client, request, signal } = fixture();
    await client.getCourseFallbackPermissionPage(
      "canonical-node-id",
      "verified-fallback",
      "next-cursor",
      signal
    );
    const input = request.mock.calls[0]?.[0] as {
      method: string;
      url: string;
      query: string;
      variables: unknown;
    };
    expect(input.method).toBe("POST");
    expect(input.url).toBe("/graphql");
    expect(input.query).toContain("permissionSources");
    expect(input.query).toContain("... on Repository { databaseId }");
    expect(input.query).toContain("affiliation: DIRECT");
    expect(input.variables).toEqual({
      repositoryId: "canonical-node-id",
      login: "verified-fallback",
      cursor: "next-cursor"
    });
  });

  it.each(["team", "fallback"])(
    "does not retry %s writes or use an unauthenticated client",
    async (kind) => {
      const f = fixture();
      f.request.mockRejectedValue(new Error("provider secret"));
      const write = (client: OctokitGitHubClient) =>
        kind === "team"
          ? client.setCourseRepositoryTeamPermission(
              ORGANIZATION_ID,
              TEAM_ID,
              "org",
              "repo",
              "admin",
              f.signal
            )
          : client.setCourseFallbackPermission("org", "repo", "fallback", f.signal);
      await expect(write(f.client)).rejects.toThrow("GitHub organization request unavailable.");
      expect(f.request).toHaveBeenCalledTimes(1);
      const unauthenticated = fixture("");
      await expect(write(unauthenticated.client)).rejects.toMatchObject({ kind: "auth_missing" });
      expect(unauthenticated.request).not.toHaveBeenCalled();
    }
  );

  it("leaves production v1 Apply/setup/scope paths unchanged", () => {
    for (const file of [
      "src/execution/apply-executor.ts",
      "ui/electron/courseSetupService.ts",
      "ui/electron/githubOAuthSession.ts",
      "ui/electron/main.ts",
      "src/faculty/authorization-resolver.ts"
    ])
      expect(readFileSync(file, "utf8")).not.toMatch(
        /CourseRepositoryPermissionReconciler|setCourseRepositoryTeamPermission|setCourseFallbackPermission/
      );
    expect(readFileSync("src/execution/apply-executor.ts", "utf8")).toContain(
      "input.githubClient.addTeamPermission"
    );
    expect(readFileSync("ui/electron/githubOAuthNetwork.ts", "utf8")).toContain(
      '["read:org", "repo"]'
    );
  });
});
