import {
  provideGithubClient,
  type GithubClientProvider,
  type GitHubClient
} from "./githubClientProvider.js";
import { GithubOAuthError } from "./githubOAuthCallback.js";
import type {
  GithubOrganization,
  OrganizationAccessStatus,
  OrganizationDiscovery
} from "./githubOAuthTypes.js";

const TIMEOUT_MS = 30_000;
const PAGE_SIZE = 100;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const RATE_LIMIT = 429;
const SERVER_ERROR = 500;
export const ORGANIZATION_DIAGNOSTICS: Record<OrganizationAccessStatus, string> = {
  accessible:
    "Organization membership access verified. Repository permissions will be checked separately when needed.",
  pending: "Invitation pending. Accept your invitation on GitHub, then refresh organizations.",
  oauth_approval_required:
    "Your GitHub sign-in is valid. An organization owner may need to approve Graider for this organization.",
  sso_required:
    "Establish an organization SAML session in your browser, then update GitHub authorization and refresh.",
  authorization_required:
    "GitHub cannot expose this membership. Check organization authorization and membership on GitHub, then refresh.",
  insufficient_scope: "Authorize organization access to grant read:org.",
  forbidden:
    "GitHub denied organization access. Check organization policies with an owner, then refresh.",
  network_unavailable: "GitHub is unavailable. Your sign-in is preserved. Retry when connected.",
  rate_limited: "GitHub is limiting requests. Wait before refreshing organizations.",
  error: "GitHub returned an unexpected organization response. Try refreshing organizations."
};
const failure = (status: OrganizationAccessStatus): never => {
  throw new GithubOAuthError(status, ORGANIZATION_DIAGNOSTICS[status]);
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return failure("error");
  return value as Record<string, unknown>;
};
export const hasOrganizationScope = (header: string): boolean =>
  header.split(/[ ,]+/).some((scope) => ["read:org", "write:org", "admin:org"].includes(scope));

type OrganizationResponse = Awaited<
  ReturnType<NonNullable<GitHubClient["getOrganizationScopeResponse"]>>
>;
export const createGithubOrganizationNetwork = (
  provideClient: GithubClientProvider = provideGithubClient
) => {
  const get = async (
    token: string,
    signal: AbortSignal,
    read: (client: GitHubClient, signal: AbortSignal) => Promise<OrganizationResponse>
  ): Promise<Response> => {
    try {
      const response = await read(
        provideClient(token),
        AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
      );
      return new Response(JSON.stringify(response.data), {
        status: response.status,
        headers: response.headers
      });
    } catch {
      return failure("network_unavailable");
    }
  };
  const classify = async (response: Response): Promise<OrganizationAccessStatus | null> => {
    if (response.status === UNAUTHORIZED)
      throw new GithubOAuthError(
        "invalid_credential",
        "Your GitHub sign-in has expired or been revoked. Sign in again."
      );
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { message?: unknown } | null;
    const message = typeof body?.message === "string" ? body.message : "";
    if (
      response.status === RATE_LIMIT ||
      response.headers.get("x-ratelimit-remaining") === "0" ||
      response.headers.has("retry-after") ||
      /secondary rate limit|API rate limit exceeded/i.test(message)
    )
      return "rate_limited";
    if (/^required\b/i.test(response.headers.get("x-github-sso") ?? "")) return "sso_required";
    const scopes = response.headers.get("x-oauth-scopes");
    if (scopes !== null && !hasOrganizationScope(scopes)) return "insufficient_scope";
    if (response.ok) return null;
    if (response.status >= SERVER_ERROR) return "network_unavailable";
    if (
      /OAuth (App|application).*restric|third.party.*(restric|approv)|organization.*OAuth.*(restric|approv)/i.test(
        message
      )
    )
      return "oauth_approval_required";
    if (response.status === FORBIDDEN) return "forbidden";
    if (response.status === NOT_FOUND) return "authorization_required";
    return "error";
  };
  const classifyOrganizationResponse = async (
    response: Response,
    token: string,
    signal: AbortSignal
  ): Promise<OrganizationAccessStatus | null> => {
    if (response.status !== UNAUTHORIZED) return classify(response);
    // Confirm global rejection at /user before allowing an organization response to revoke sign-in.
    const identityResponse = await get(token, signal, (client, bounded) =>
      client.getOrganizationScopeResponse!(bounded)
    );
    const identityStatus = await classify(identityResponse);
    if (identityStatus) return failure(identityStatus);
    return "forbidden";
  };
  const read = async (response: Response): Promise<unknown> => {
    try {
      return await response.json();
    } catch {
      return failure("error");
    }
  };
  const normalize = (value: unknown): GithubOrganization => {
    const membership = record(value);
    const org = record(membership.organization);
    if (
      typeof org.login !== "string" ||
      !/^[A-Za-z0-9-]+$/.test(org.login) ||
      !Number.isSafeInteger(org.id) ||
      Number(org.id) <= 0 ||
      !["active", "pending"].includes(String(membership.state)) ||
      !["admin", "member"].includes(String(membership.role))
    )
      return failure("error");
    const accessStatus = membership.state === "pending" ? "pending" : "accessible";
    return {
      organizationId: org.id as number,
      login: org.login,
      membershipState: membership.state as "active" | "pending",
      membershipRole: membership.role as "admin" | "member",
      directMembership:
        typeof membership.direct_membership === "boolean" ? membership.direct_membership : null,
      accessStatus,
      accessDiagnostic: ORGANIZATION_DIAGNOSTICS[accessStatus]
    };
  };
  return {
    async organizationCapability(token: string, signal: AbortSignal): Promise<boolean> {
      const response = await get(token, signal, (client, bounded) =>
        client.getOrganizationScopeResponse!(bounded)
      );
      // Scope absence is authoritative only when GitHub actually supplies the header.
      const status = await classify(response);
      if (status === "insufficient_scope") return false;
      if (status) return failure(status);
      if (!response.headers.has("x-oauth-scopes")) return failure("error");
      return hasOrganizationScope(response.headers.get("x-oauth-scopes")!);
    },
    async discoverOrganizations(
      token: string,
      signal: AbortSignal
    ): Promise<OrganizationDiscovery> {
      const memberships = new Map<number, GithubOrganization>();
      let page = 1;
      let more = true;
      let partial = false;
      while (more) {
        const response = await get(token, signal, (client, bounded) =>
          client.listOrganizationMembershipsPage!(page, PAGE_SIZE, bounded)
        );
        const status = await classifyOrganizationResponse(response, token, signal);
        if (status) return failure(status);
        partial ||= /partial-results/i.test(response.headers.get("x-github-sso") ?? "");
        const body = await read(response);
        if (!Array.isArray(body)) return failure("error");
        for (const value of body) {
          const org = normalize(value);
          memberships.set(org.organizationId, org);
        }
        more = /rel="next"/.test(response.headers.get("link") ?? "") || body.length === PAGE_SIZE;
        page += 1;
      }
      const organizations: GithubOrganization[] = [];
      for (const org of memberships.values()) {
        let validated = org;
        if (org.membershipState === "active") {
          try {
            const response = await get(token, signal, (client, bounded) =>
              client.getOrganizationMembership!(org.login, bounded)
            );
            const status = await classifyOrganizationResponse(response, token, signal);
            if (status === "insufficient_scope") failure(status);
            if (status)
              validated = {
                ...org,
                accessStatus: status,
                accessDiagnostic: ORGANIZATION_DIAGNOSTICS[status]
              };
            else {
              validated = normalize(await read(response));
              if (
                validated.organizationId !== org.organizationId ||
                validated.login.toLowerCase() !== org.login.toLowerCase()
              )
                return failure("error");
            }
          } catch (error) {
            if (
              !(error instanceof GithubOAuthError) ||
              error.code === "invalid_credential" ||
              error.code === "insufficient_scope"
            )
              throw error;
            const status = error.code === "network_unavailable" ? "network_unavailable" : "error";
            validated = {
              ...org,
              accessStatus: status,
              accessDiagnostic: ORGANIZATION_DIAGNOSTICS[status]
            };
          }
        }
        organizations.push(validated);
      }
      return {
        status: "ready",
        organizations,
        message: partial
          ? "GitHub returned partial SSO results. Establish your organization SAML session and update authorization to discover missing organizations."
          : null,
        stale: false
      };
    }
  };
};
