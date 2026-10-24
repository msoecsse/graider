import { describe, expect, it, vi } from "vitest";
import {
  OctokitGitHubClient,
  type OctokitRestClientLike
} from "../../../src/github/octokit-github-client.js";
const OK = 200;
const FORBIDDEN = 403;
const UNAUTHORIZED = 401;
const PAGE = 2;
const PAGE_SIZE = 100;
const response = { status: OK, headers: { "x-oauth-scopes": "read:org" }, data: [] };
const fixture = () => {
  const request = vi.fn().mockResolvedValue(response);
  const client = new OctokitGitHubClient({
    token: "fake_oauth_token",
    octokit: { request } as unknown as OctokitRestClientLike
  });
  return { request, client, signal: new AbortController().signal };
};
describe("faculty OAuth organization adapter operations", () => {
  it("uses fixed read-only routes and keeps cancellation and redirect protection", async () => {
    const f = fixture();
    expect(await f.client.getOrganizationScopeResponse(f.signal)).toEqual(response);
    await f.client.listOrganizationMembershipsPage(PAGE, PAGE_SIZE, f.signal);
    await f.client.getOrganizationMembership("faculty", f.signal);
    expect(f.request.mock.calls.map(([parameters]: readonly unknown[]) => parameters)).toEqual([
      { method: "GET", url: "/user", request: { signal: f.signal, redirect: "error" } },
      {
        method: "GET",
        url: "/user/memberships/orgs",
        page: PAGE,
        per_page: PAGE_SIZE,
        request: { signal: f.signal, redirect: "error" }
      },
      {
        method: "GET",
        url: "/user/memberships/orgs/{org}",
        org: "faculty",
        request: { signal: f.signal, redirect: "error" }
      }
    ]);
  });
  it.each([FORBIDDEN, UNAUTHORIZED])(
    "retains status and header evidence for trusted classification (%s)",
    async (status) => {
      const f = fixture();
      const rejected = {
        status,
        headers: { "x-github-sso": "required" },
        data: { message: "Restricted" }
      };
      f.request.mockRejectedValueOnce({ response: rejected });
      expect(await f.client.getOrganizationMembership("faculty", f.signal)).toEqual(rejected);
    }
  );
  it("discards arbitrary network exception details", async () => {
    const f = fixture();
    f.request.mockRejectedValueOnce(new Error("fake_oauth_token"));
    await expect(f.client.getOrganizationScopeResponse(f.signal)).rejects.toThrow(
      "GitHub organization request unavailable."
    );
  });
});
