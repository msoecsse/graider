// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { GitHubClient } from "./githubClientProvider.js";
import { createGithubOrganizationNetwork } from "./githubOrganizations.js";
const signal = new AbortController().signal;
const TOKEN = "fake_private_oauth_token";
const membership = (id = 1, state = "active", role = "admin") => ({
  organization: { id, login: `org-${id}` },
  state,
  role,
  direct_membership: true
});
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "x-oauth-scopes": "read:org", ...headers }
  });
// Fake adapter transport; automated tests never use a real GitHub credential.
const createNetwork = (request: (url: string, init: RequestInit) => Promise<Response>) => {
  const call = async (path: string, signal: AbortSignal) => {
    const response: Response = await request(`https://api.github.com${path}`, {
      redirect: "error",
      signal
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      data: await response.clone().json()
    };
  };
  return createGithubOrganizationNetwork(
    () =>
      ({
        getOrganizationScopeResponse: (signal: AbortSignal) => call("/user", signal),
        listOrganizationMembershipsPage: (page: number, perPage: number, signal: AbortSignal) =>
          call(`/user/memberships/orgs?per_page=${perPage}&page=${page}`, signal),
        getOrganizationMembership: (login: string, signal: AbortSignal) =>
          call(`/user/memberships/orgs/${login}`, signal)
      }) as GitHubClient
  );
};
describe("OAuth organization adapter", () => {
  it.each([
    ["", false],
    ["read:org", true],
    ["user, read:org", true],
    ["admin:org", true],
    ["repo", false]
  ])("uses authoritative scope header %s", async (scope, expected) => {
    const request = vi.fn().mockResolvedValue(response({}, 200, { "x-oauth-scopes": scope }));
    expect(await createNetwork(request).organizationCapability(TOKEN, signal)).toBe(expected);
    expect(request.mock.calls[0][0]).toBe("https://api.github.com/user");
    expect(request.mock.calls[0][1].redirect).toBe("error");
  });
  it("does not guess when GitHub omits scopes", async () => {
    await expect(
      createNetwork(vi.fn().mockResolvedValue(new Response("{}"))).organizationCapability(
        TOKEN,
        signal
      )
    ).rejects.toMatchObject({ code: "error" });
  });
  it("paginates, deduplicates IDs, normalizes pending/member and active/admin, and probes only active memberships", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        response([membership()], 200, {
          link: '<https://api.github.com/user/memberships/orgs?page=2>; rel="next"'
        })
      )
      .mockResolvedValueOnce(response([membership(), membership(2, "pending", "member")]))
      .mockResolvedValueOnce(response(membership()));
    const result = await createNetwork(request).discoverOrganizations(TOKEN, signal);
    expect(result.organizations).toHaveLength(2);
    expect(result.organizations[0]).toMatchObject({
      organizationId: 1,
      membershipRole: "admin",
      accessStatus: "accessible",
      directMembership: true
    });
    expect(result.organizations[1]).toMatchObject({
      membershipRole: "member",
      membershipState: "pending",
      accessStatus: "pending"
    });
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/user/memberships/orgs?per_page=100&page=1",
      "https://api.github.com/user/memberships/orgs?per_page=100&page=2",
      "https://api.github.com/user/memberships/orgs/org-1"
    ]);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
  it.each([
    [403, {}, "Resource not accessible", "forbidden"],
    [404, {}, "Not Found", "authorization_required"],
    [403, {}, "Organization has enabled OAuth App access restrictions", "oauth_approval_required"],
    [403, { "x-github-sso": "required; url=https://evil.example/" }, "Forbidden", "sso_required"],
    [403, { "x-oauth-scopes": "" }, "Forbidden", "insufficient_scope"],
    [403, { "x-ratelimit-remaining": "0" }, "Forbidden", "rate_limited"],
    [429, {}, "Slow down", "rate_limited"],
    [403, {}, "You have exceeded a secondary rate limit", "rate_limited"],
    [503, {}, "Unavailable", "network_unavailable"],
    [422, {}, TOKEN, "error"]
  ])(
    "classifies org response %s %j without reflecting provider data",
    async (status, headers, message, expected) => {
      const request = vi
        .fn()
        .mockResolvedValueOnce(response([membership()]))
        .mockResolvedValueOnce(
          response({ message }, status as number, headers as Record<string, string>)
        );
      const discovery = createNetwork(request).discoverOrganizations(TOKEN, signal);
      if (expected === "insufficient_scope") {
        await expect(discovery).rejects.toMatchObject({ code: "insufficient_scope" });
      } else {
        const result = await discovery;
        expect(result.organizations[0].accessStatus).toBe(expected);
        expect(JSON.stringify(result)).not.toContain(TOKEN);
        expect(JSON.stringify(result)).not.toContain("evil.example");
      }
    }
  );
  it("reports invalid credentials distinctly", async () => {
    const request = vi.fn().mockResolvedValue(response({}, 401));
    await expect(createNetwork(request).discoverOrganizations(TOKEN, signal)).rejects.toMatchObject(
      { code: "invalid_credential" }
    );
  });
  it("does not revoke a valid global identity when only the organization returns 401", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response([membership()]))
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ id: 42 }));
    const result = await createNetwork(request).discoverOrganizations(TOKEN, signal);
    expect(result.organizations[0].accessStatus).toBe("forbidden");
    expect(request.mock.calls[2][0]).toBe("https://api.github.com/user");
  });
  it("keeps discovered membership on a failed network probe", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response([membership()]))
      .mockRejectedValueOnce(new Error(TOKEN));
    const result = await createNetwork(request).discoverOrganizations(TOKEN, signal);
    expect(result.organizations[0].accessStatus).toBe("network_unavailable");
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
  it("does not accept malformed membership identities or mismatched probes", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response([membership()]))
      .mockResolvedValueOnce(response(membership(9)));
    expect(
      (await createNetwork(request).discoverOrganizations(TOKEN, signal)).organizations[0]
        .accessStatus
    ).toBe("error");
  });
  it("surfaces partial SSO discovery explicitly", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        response([], 200, { "x-github-sso": "partial-results; organizations=123" })
      );
    expect((await createNetwork(request).discoverOrganizations(TOKEN, signal)).message).toContain(
      "partial SSO"
    );
  });
});

describe("authoritative private repository capability", () => {
  it.each([
    ["read:org", false],
    ["read:org, repo", true],
    ["public_repo, read:org", false],
    ["repo:status, read:org", false]
  ])("requires full repo in %s", async (scopes, expected) => {
    const network = createNetwork(
      vi.fn().mockResolvedValue(response({}, 200, { "x-oauth-scopes": scopes }))
    );
    expect(await network.repositoryCapability(TOKEN, signal)).toBe(expected);
  });
});
