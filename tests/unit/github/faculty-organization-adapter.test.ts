import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  OctokitGitHubClient,
  type OctokitRestClientLike
} from "../../../src/github/octokit-github-client.js";

const USER_ID = 123;
const PAGE_SIZE = 100;
const FORBIDDEN = 403;
const fixture = (token: string | undefined = "fake-session-token") => {
  const request = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: [] });
  const client = new OctokitGitHubClient({
    token,
    octokit: { request } as unknown as OctokitRestClientLike
  });
  return { client, request, signal: new AbortController().signal };
};

describe("faculty organization transport", () => {
  it("uses paginated organization reads and immutable-ID invitation with no team assignment", async () => {
    const { client, request, signal } = fixture();
    await client.listOrganizationMembersPage("trusted-org", 2, PAGE_SIZE, signal);
    await client.listPendingOrganizationInvitationsPage("trusted-org", 3, PAGE_SIZE, signal);
    await client.createOrganizationInvitation("trusted-org", USER_ID, signal);
    expect(request.mock.calls.map(([input]: readonly unknown[]) => input)).toEqual([
      {
        method: "GET",
        url: "/orgs/{org}/members",
        org: "trusted-org",
        page: 2,
        per_page: PAGE_SIZE,
        filter: "all",
        role: "all",
        request: { signal, redirect: "error" }
      },
      {
        method: "GET",
        url: "/orgs/{org}/invitations",
        org: "trusted-org",
        page: 3,
        per_page: PAGE_SIZE,
        request: { signal, redirect: "error" }
      },
      {
        method: "POST",
        url: "/orgs/{org}/invitations",
        org: "trusted-org",
        invitee_id: USER_ID,
        role: "direct_member",
        request: { signal, redirect: "error" }
      }
    ]);
  });

  it("preserves policy evidence on write failure", async () => {
    const { client, request, signal } = fixture();
    const response = {
      status: FORBIDDEN,
      headers: { "x-github-sso": "required" },
      data: { message: "Restricted" }
    };
    request.mockRejectedValueOnce({ response });
    expect(await client.createOrganizationInvitation("trusted-org", USER_ID, signal)).toEqual(
      response
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("never retries a mutation after transport failure", async () => {
    const { client, request, signal } = fixture();
    request.mockRejectedValue(new Error("secret-token"));
    await expect(
      client.createOrganizationInvitation("trusted-org", USER_ID, signal)
    ).rejects.toThrow("GitHub organization request unavailable.");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("refuses unauthenticated invitation without a request", async () => {
    const { client, request, signal } = fixture("");
    await expect(
      client.createOrganizationInvitation("trusted-org", USER_ID, signal)
    ).rejects.toMatchObject({ kind: "auth_missing" });
    expect(request).not.toHaveBeenCalled();
  });

  it("retains the current discovery OAuth scopes and setup behavior", () => {
    const scopes = readFileSync("ui/electron/githubOAuthNetwork.ts", "utf8");
    expect(scopes).toContain('["read:org", "repo"]');
    for (const file of [
      "ui/electron/githubOAuthSession.ts",
      "ui/electron/main.ts",
      "ui/electron/courseSetupService.ts"
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("createOrganizationInvitation");
      expect(source).not.toContain("FacultyOrganizationReconciler");
    }
  });
});
