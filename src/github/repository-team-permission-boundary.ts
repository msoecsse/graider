import type { GitHubCoursePermissionClient, GitHubOrganizationResponse } from "./github-client.js";
import type { GitHubPermission, GitHubTeam } from "./github-models.js";
import {
  facultyOrganizationAttentionReasonFor,
  requireOrganizationResponse
} from "./faculty-organization-access.js";
import { renderManagedTeamMetadata, type ManagedTeamIdentity } from "./managed-team-identity.js";
import type {
  ManagedTeamOutcome,
  TeamReconciliationReason
} from "./managed-team-reconciliation.js";

const PAGE_SIZE = 100;
const PAGE_LIMIT = 1000;
export type RepositoryTeamPermissionClient = Pick<
  GitHubCoursePermissionClient,
  | "getOrganizationScopeResponse"
  | "getOrganizationMembership"
  | "getCourseRepositoryById"
  | "getManagedTeam"
  | "listCourseRepositoryTeamsPage"
  | "setCourseRepositoryTeamPermission"
>;
export type RepositoryTeamMembershipReader = (
  organization: string,
  signal: AbortSignal
) => Promise<readonly ManagedTeamOutcome[]>;
export type RepositoryPermissionReason =
  | TeamReconciliationReason
  | "repository_identity_mismatch"
  | "repository_transfer_requires_migration"
  | "repository_unavailable"
  | "repository_changed_during_read"
  | "unsafe_team_membership"
  | "cross_course_repository_access"
  | "unowned_repository_access"
  | "scoped_team_cleanup_deferred"
  | "permission_unverified"
  | "unsupported_repository_permission";
export interface PermissionRepository {
  readonly id: number;
  readonly nodeId: string;
  readonly organizationId: number;
  readonly owner: string;
  readonly name: string;
}
export interface RepositoryTeamAssociation {
  readonly team: GitHubTeam & { readonly id: number };
  readonly permission: GitHubPermission;
  readonly parentId: number | null;
}
export class PermissionError extends Error {
  constructor(readonly reason: RepositoryPermissionReason) {
    super(reason);
  }
}
export const fail = (reason: RepositoryPermissionReason): never => {
  throw new PermissionError(reason);
};
export const reasonFor = (error: unknown): RepositoryPermissionReason =>
  error instanceof PermissionError ? error.reason : facultyOrganizationAttentionReasonFor(error);
export const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("unexpected_response");
  return value as Record<string, unknown>;
};
export const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
export const segment = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-z\d._-]+$/i.test(value) || [".", ".."].includes(value))
    return fail("unexpected_response");
  return value;
};
export const checked = (response: GitHubOrganizationResponse, status?: number): unknown => {
  requireOrganizationResponse(response, status);
  return response.data;
};
export const permission = (value: unknown): GitHubPermission => {
  if (
    value === "admin" ||
    value === "maintain" ||
    value === "push" ||
    value === "triage" ||
    value === "pull" ||
    value === "none"
  )
    return value;
  return fail("unsupported_repository_permission");
};

/** Shared read/preflight boundary for v2 course and student team grants. No role calculation or collaborator mutation. */
export class RepositoryTeamPermissionBoundary {
  private readonly courseRepositoryId: number;
  private readonly organizationId: number;
  private readonly accountId: number;
  constructor(
    private readonly client: RepositoryTeamPermissionClient,
    context: {
      readonly courseRepositoryId: number;
      readonly organizationId: number;
      readonly authenticatedUserId: number;
    },
    private readonly inspectMemberships: RepositoryTeamMembershipReader
  ) {
    if (
      ![context.courseRepositoryId, context.organizationId, context.authenticatedUserId].every(
        positiveId
      )
    )
      throw new Error("Invalid trusted repository/organization/account identity.");
    this.courseRepositoryId = context.courseRepositoryId;
    this.organizationId = context.organizationId;
    this.accountId = context.authenticatedUserId;
  }
  async repository(repositoryId: number, signal: AbortSignal): Promise<PermissionRepository> {
    if (!positiveId(repositoryId)) return fail("repository_identity_mismatch");
    const userResponse = await this.client.getOrganizationScopeResponse(signal);
    if (object(checked(userResponse)).id !== this.accountId) return fail("session_mismatch");
    const value = object(checked(await this.client.getCourseRepositoryById(repositoryId, signal)));
    const owner = object(value.owner);
    if (value.id !== repositoryId || typeof value.node_id !== "string" || !value.node_id)
      return fail("repository_identity_mismatch");
    if (owner.id !== this.organizationId || owner.type !== "Organization")
      return fail("repository_transfer_requires_migration");
    if (value.archived !== false || value.disabled !== false) return fail("repository_unavailable");
    if (object(value.permissions).admin !== true) return fail("permission_denied");
    const login = segment(owner.login);
    const membership = object(checked(await this.client.getOrganizationMembership(login, signal)));
    const organization = object(membership.organization);
    if (
      organization.id !== this.organizationId ||
      typeof organization.login !== "string" ||
      organization.login.toLowerCase() !== login.toLowerCase()
    )
      return fail("identity_mismatch");
    if (membership.user !== undefined && object(membership.user).id !== this.accountId)
      return fail("session_mismatch");
    if (membership.state !== "active" || membership.role !== "admin")
      return fail("permission_denied");
    const scopes = new Headers(userResponse.headers).get("x-oauth-scopes");
    if (scopes !== null && !scopes.split(/[ ,]+/).includes("repo"))
      return fail("insufficient_scope");
    return Object.freeze({
      id: repositoryId,
      nodeId: value.node_id,
      organizationId: this.organizationId,
      owner: login,
      name: segment(value.name)
    });
  }

  sameLocator(before: PermissionRepository, after: PermissionRepository): void {
    if (
      before.id !== after.id ||
      before.organizationId !== after.organizationId ||
      before.nodeId !== after.nodeId ||
      before.owner !== after.owner ||
      before.name !== after.name
    )
      return fail("repository_changed_during_read");
  }

  async associations(
    repo: PermissionRepository,
    signal: AbortSignal
  ): Promise<readonly RepositoryTeamAssociation[]> {
    const values = new Map<number, RepositoryTeamAssociation>();
    const slugs = new Map<string, number>();
    for (let page = 1; page <= PAGE_LIMIT; page += 1) {
      const response = await this.client.listCourseRepositoryTeamsPage(
        repo.owner,
        repo.name,
        page,
        PAGE_SIZE,
        signal
      );
      const data = checked(response);
      if (!Array.isArray(data) || data.length > PAGE_SIZE) return fail("unexpected_response");
      for (const input of data as unknown[]) {
        const value = object(input);
        if (
          !positiveId(value.id) ||
          typeof value.name !== "string" ||
          !value.name ||
          (value.description !== null && typeof value.description !== "string")
        )
          return fail("unexpected_response");
        const slug = segment(value.slug);
        const parent = value.parent === null ? null : object(value.parent).id;
        if (parent !== null && !positiveId(parent)) return fail("unexpected_response");
        const association: RepositoryTeamAssociation = {
          team: {
            id: value.id,
            org: repo.owner,
            name: value.name,
            slug,
            description: value.description
          },
          permission: permission(value.permission),
          parentId: parent
        };
        if (value.role_name !== undefined) {
          const roleAliases: Record<string, string | undefined> = {
            read: "pull",
            write: "push",
            pull: "pull",
            push: "push",
            admin: "admin",
            maintain: "maintain",
            triage: "triage"
          };
          if (
            typeof value.role_name !== "string" ||
            roleAliases[value.role_name] !== association.permission
          )
            return fail("unsupported_repository_permission");
        }
        const previous = values.get(value.id);
        if (
          (previous && JSON.stringify(previous) !== JSON.stringify(association)) ||
          (slugs.has(slug) && slugs.get(slug) !== value.id)
        )
          return fail("team_identity_changed");
        values.set(value.id, association);
        slugs.set(slug, value.id);
      }
      if (
        data.length < PAGE_SIZE &&
        !/rel="next"/.test(new Headers(response.headers).get("link") ?? "")
      ) {
        this.sameLocator(repo, await this.repository(repo.id, signal));
        return Object.freeze([...values.values()]);
      }
    }
    return fail("unexpected_response");
  }

  async membership(
    identity: ManagedTeamIdentity,
    repo: PermissionRepository,
    signal: AbortSignal
  ): Promise<ManagedTeamOutcome> {
    if (identity.courseRepositoryId !== this.courseRepositoryId) return fail("identity_mismatch");
    const values = await this.inspectMemberships(repo.owner, signal);
    const key = renderManagedTeamMetadata(identity);
    const matches = values.filter((value) => renderManagedTeamMetadata(value.identity) === key);
    const outcome = matches[0];
    if (matches.length !== 1 || !outcome) return fail("unsafe_team_membership");
    if (outcome.status === "needs_attention")
      return fail(outcome.reason ?? "unsafe_team_membership");
    if (!positiveId(outcome.teamId)) return fail("unsafe_team_membership");
    if (
      !outcome.faculty.every(
        (value) =>
          value.observed !== null &&
          value.status !== "needs_attention" &&
          (value.desired || !value.observed) &&
          (value.status === "pending_organization_access" || value.desired === value.observed)
      )
    )
      return fail("unsafe_team_membership");
    return outcome;
  }

  async verifyTeam(
    identity: ManagedTeamIdentity,
    teamId: number,
    repo: PermissionRepository,
    signal: AbortSignal
  ): Promise<void> {
    const value = object(
      checked(await this.client.getManagedTeam(repo.organizationId, teamId, signal))
    );
    const org = object(value.organization);
    if (
      value.id !== teamId ||
      value.description !== renderManagedTeamMetadata(identity) ||
      org.id !== repo.organizationId ||
      typeof org.login !== "string" ||
      org.login.toLowerCase() !== repo.owner.toLowerCase()
    )
      return fail("team_identity_changed");
    if (value.parent !== null) return fail("team_hierarchy_unsupported");
  }
}
