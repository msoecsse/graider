import type { RawCourseConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema } from "../config/config-schemas.js";
import { FallbackAdministrator } from "../faculty/fallback-administrator.js";
import { isGithubUsername } from "../roster/roster-validation.js";
import type { GitHubCoursePermissionClient, GitHubOrganizationResponse } from "./github-client.js";
import type { GitHubPermission, GitHubTeam } from "./github-models.js";
import {
  facultyOrganizationAttentionReasonFor,
  requireOrganizationResponse,
  type FacultyOrganizationAccess
} from "./faculty-organization-access.js";
import {
  classifyManagedTeam,
  createManagedTeamIdentity,
  findDuplicateManagedTeams,
  renderManagedTeamMetadata,
  type ManagedTeamIdentity
} from "./managed-team-identity.js";
import type {
  ManagedTeamOutcome,
  TeamReconciliationReason,
  TeamReconciliationStatus
} from "./managed-team-reconciliation.js";

const PAGE_SIZE = 100;
const PAGE_LIMIT = 1000;
const TIMEOUT_MS = 30_000;
const HTTP_NO_CONTENT = 204;
const COURSE_TEAM_KINDS = ["course-current-coordinators", "course-write", "course-read"] as const;

export const courseTeamRepositoryPermission = (
  identity: ManagedTeamIdentity
): "admin" | "push" | "pull" | undefined => {
  switch (identity.kind) {
    case "course-current-coordinators":
      return "admin";
    case "course-write":
      return "push";
    case "course-read":
      return "pull";
    case "term-current-coordinators":
    case "term-former-coordinators":
    case "section-current-faculty":
    case "section-former-faculty":
      return undefined;
  }
};
export type CoursePermissionReason =
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
export interface CourseRepositoryPermissionOutcome {
  readonly repositoryId: number;
  readonly subject: "team" | "fallback_administrator";
  readonly identity?: ManagedTeamIdentity;
  readonly teamId?: number;
  readonly githubUserId?: number;
  readonly desiredPermission: GitHubPermission;
  readonly observedPermission: GitHubPermission | null;
  readonly status: TeamReconciliationStatus;
  readonly reason?: CoursePermissionReason;
}
export interface CourseRepositoryPermissionDependencies {
  /** Trusted factories/readers bound to this account, metadata revision and complete term set. */
  inspectTeamMemberships(
    organization: string,
    signal: AbortSignal
  ): Promise<readonly ManagedTeamOutcome[]>;
  inspectOrganizationAccess(
    organization: string,
    signal: AbortSignal
  ): Promise<readonly FacultyOrganizationAccess[]>;
}
interface Repository {
  readonly id: number;
  readonly nodeId: string;
  readonly organizationId: number;
  readonly owner: string;
  readonly name: string;
}
interface Association {
  readonly team: GitHubTeam & { readonly id: number };
  readonly permission: GitHubPermission;
  readonly parentId: number | null;
}
class PermissionError extends Error {
  constructor(readonly reason: CoursePermissionReason) {
    super(reason);
  }
}
const fail = (reason: CoursePermissionReason): never => {
  throw new PermissionError(reason);
};
const reasonFor = (error: unknown): CoursePermissionReason =>
  error instanceof PermissionError ? error.reason : facultyOrganizationAttentionReasonFor(error);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("unexpected_response");
  return value as Record<string, unknown>;
};
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const segment = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-z\d._-]+$/i.test(value) || [".", ".."].includes(value))
    return fail("unexpected_response");
  return value;
};
const checked = (response: GitHubOrganizationResponse, status?: number): unknown => {
  requireOrganizationResponse(response, status);
  return response.data;
};
const permission = (value: unknown): GitHubPermission => {
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

/**
 * Backend only. Trusted context comes from Phase 2 canonical repository/organization
 * IDs and the selected authenticated OAuth session, never renderer names or paths.
 * Outer composition enforces AuthorizationResolver, source revisions, complete term
 * inputs and shared serialization. Dependencies must read the same course/session.
 * They may refresh organization locators in an execution-only metadata snapshot after
 * a verified rename; this operation never rewrites persisted identity or invokes 7.3 writes.
 */
export class CourseRepositoryPermissionReconciler {
  private readonly course: RawCourseConfigV2;
  private readonly fallback: ReturnType<FallbackAdministrator["getFacultyRecord"]>;
  private readonly repositoryId: number;
  private readonly organizationId: number;
  private readonly accountId: number;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly client: GitHubCoursePermissionClient,
    context: {
      readonly course: RawCourseConfigV2;
      readonly courseRepositoryId: number;
      readonly organizationId: number;
      readonly authenticatedUserId: number;
    },
    private readonly dependencies: CourseRepositoryPermissionDependencies
  ) {
    this.course = rawCourseConfigV2Schema.parse(context.course);
    this.fallback = new FallbackAdministrator(this.course).getFacultyRecord();
    if (
      ![context.courseRepositoryId, context.organizationId, context.authenticatedUserId].every(
        positiveId
      )
    )
      throw new Error("Invalid trusted repository/organization/account identity.");
    this.repositoryId = context.courseRepositoryId;
    this.organizationId = context.organizationId;
    this.accountId = context.authenticatedUserId;
  }

  reconcile(
    signal = AbortSignal.timeout(TIMEOUT_MS)
  ): Promise<readonly CourseRepositoryPermissionOutcome[]> {
    const operation = this.queue.then(() => this.run(signal));
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async repository(signal: AbortSignal): Promise<Repository> {
    const userResponse = await this.client.getOrganizationScopeResponse(signal);
    if (object(checked(userResponse)).id !== this.accountId) return fail("session_mismatch");
    const value = object(
      checked(await this.client.getCourseRepositoryById(this.repositoryId, signal))
    );
    const owner = object(value.owner);
    if (value.id !== this.repositoryId || typeof value.node_id !== "string" || !value.node_id)
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
      id: this.repositoryId,
      nodeId: value.node_id,
      organizationId: this.organizationId,
      owner: login,
      name: segment(value.name)
    });
  }

  private sameLocator(before: Repository, after: Repository): void {
    if (
      before.nodeId !== after.nodeId ||
      before.owner !== after.owner ||
      before.name !== after.name
    )
      return fail("repository_changed_during_read");
  }

  private async associations(
    repo: Repository,
    signal: AbortSignal
  ): Promise<readonly Association[]> {
    const values = new Map<number, Association>();
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
        const association: Association = {
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
        this.sameLocator(repo, await this.repository(signal));
        return Object.freeze([...values.values()]);
      }
    }
    return fail("unexpected_response");
  }

  private async membership(
    identity: ManagedTeamIdentity,
    repo: Repository,
    signal: AbortSignal
  ): Promise<ManagedTeamOutcome> {
    const values = await this.dependencies.inspectTeamMemberships(repo.owner, signal);
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

  private async verifyTeam(
    identity: ManagedTeamIdentity,
    teamId: number,
    repo: Repository,
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

  private base(
    identity: ManagedTeamIdentity,
    desiredPermission: GitHubPermission,
    teamId?: number
  ): Omit<CourseRepositoryPermissionOutcome, "status" | "observedPermission"> {
    return {
      repositoryId: this.repositoryId,
      subject: "team",
      identity,
      ...(teamId === undefined ? {} : { teamId }),
      desiredPermission
    };
  }

  private async teamPermission(
    identity: ManagedTeamIdentity,
    desiredPermission: "admin" | "push" | "pull" | "none",
    signal: AbortSignal,
    expectedTeamId?: number
  ): Promise<CourseRepositoryPermissionOutcome> {
    let teamId = expectedTeamId;
    let observed: GitHubPermission | null = null;
    let attempted = false;
    try {
      const repo = await this.repository(signal);
      const membership = await this.membership(identity, repo, signal);
      teamId = membership.teamId;
      if (!positiveId(teamId) || (expectedTeamId !== undefined && teamId !== expectedTeamId))
        return fail("team_identity_changed");
      await this.verifyTeam(identity, teamId, repo, signal);
      const associations = await this.associations(repo, signal);
      if (
        findDuplicateManagedTeams(
          associations.map((value) => value.team),
          this.repositoryId
        ).some(
          (value) =>
            renderManagedTeamMetadata(value.identity) === renderManagedTeamMetadata(identity)
        )
      )
        return fail("duplicate_managed_team_identity");
      const current = associations.find((value) => value.team.id === teamId);
      if (
        current &&
        (current.team.description !== renderManagedTeamMetadata(identity) ||
          current.parentId !== null)
      )
        return fail("team_identity_changed");
      observed = current?.permission ?? "none";
      const pending = membership.status === "pending_organization_access";
      if (observed === desiredPermission)
        return Object.freeze({
          ...this.base(identity, desiredPermission, teamId),
          observedPermission: observed,
          status: pending ? "pending_organization_access" : "up_to_date"
        });
      if (desiredPermission === "none" && !(await this.cleanupSafe(repo, signal)))
        return fail("scoped_team_cleanup_deferred");
      // Inspect 7.3 again immediately before granting/reducing permissions; do not trust cached outcomes.
      const freshMembership = await this.membership(identity, repo, signal);
      if (freshMembership.teamId !== teamId) return fail("team_identity_changed");
      await this.verifyTeam(identity, teamId, repo, signal);
      const freshRepo = await this.repository(signal);
      this.sameLocator(repo, freshRepo);
      attempted = true;
      let mutationError: unknown;
      try {
        checked(
          await this.client.setCourseRepositoryTeamPermission(
            repo.organizationId,
            teamId,
            freshRepo.owner,
            freshRepo.name,
            desiredPermission,
            signal
          ),
          HTTP_NO_CONTENT
        );
      } catch (error) {
        mutationError = error;
      }
      const recoverySignal = signal.aborted ? AbortSignal.timeout(TIMEOUT_MS) : signal;
      const afterRepo = await this.repository(recoverySignal);
      await this.verifyTeam(identity, teamId, afterRepo, recoverySignal);
      const after = await this.associations(afterRepo, recoverySignal);
      const resulting = after.find((value) => value.team.id === teamId);
      if (resulting && resulting.team.description !== renderManagedTeamMetadata(identity))
        return fail("team_identity_changed");
      observed = resulting?.permission ?? "none";
      const verifiedMembership = await this.membership(identity, afterRepo, recoverySignal);
      if (verifiedMembership.teamId !== teamId) return fail("team_identity_changed");
      if (observed !== desiredPermission)
        return Object.freeze({
          ...this.base(identity, desiredPermission, teamId),
          observedPermission: observed,
          status: "needs_attention",
          reason: mutationError === undefined ? "permission_unverified" : reasonFor(mutationError)
        });
      return Object.freeze({
        ...this.base(identity, desiredPermission, teamId),
        observedPermission: observed,
        status:
          verifiedMembership.status === "pending_organization_access"
            ? "pending_organization_access"
            : "reconciled"
      });
    } catch (error) {
      return Object.freeze({
        ...this.base(identity, desiredPermission, teamId),
        observedPermission: attempted ? null : observed,
        status: "needs_attention",
        reason: reasonFor(error)
      });
    }
  }

  private async fallbackAccess(
    repo: Repository,
    signal: AbortSignal
  ): Promise<{ readonly login?: string; readonly incomplete?: CourseRepositoryPermissionOutcome }> {
    const id = this.fallback.github_user_id;
    const base = {
      repositoryId: this.repositoryId,
      subject: "fallback_administrator" as const,
      githubUserId: id,
      desiredPermission: "admin" as const,
      observedPermission: null
    };
    const values = (await this.dependencies.inspectOrganizationAccess(repo.owner, signal)).filter(
      (value) => value.githubUserId === id
    );
    const access = values[0];
    if (
      values.length !== 1 ||
      !access ||
      access.courseRepositoryId !== this.repositoryId ||
      access.organization.toLowerCase() !== repo.owner.toLowerCase()
    )
      return fail("incomplete_organization_access");
    if (access.state !== "active")
      return {
        incomplete: Object.freeze({
          ...base,
          status:
            access.state === "needs_attention" ? "needs_attention" : "pending_organization_access",
          reason:
            access.state === "needs_attention"
              ? access.reason
              : access.state === "pending_invitation"
                ? "organization_invitation_pending"
                : "organization_invitation_required"
        })
      };
    const user = await this.client.getUser(this.fallback.github_login);
    if (!user || !positiveId(user.id) || !isGithubUsername(user.username.toLowerCase()))
      return fail("account_lookup_failed");
    if (user.id !== id) return fail("identity_mismatch");
    return { login: user.username };
  }

  private async directFallbackPermission(
    repo: Repository,
    login: string,
    signal: AbortSignal
  ): Promise<GitHubPermission> {
    let cursor: string | null = null;
    const cursors = new Set<string>();
    let observed: GitHubPermission = "none";
    let matched = false;
    for (let page = 1; page <= PAGE_LIMIT; page += 1) {
      const response = object(
        checked(
          await this.client.getCourseFallbackPermissionPage(repo.nodeId, login, cursor, signal)
        )
      );
      if (response.errors !== undefined) return fail("unexpected_response");
      const node = object(object(response.data).node);
      if (
        node.databaseId !== this.repositoryId ||
        object(node.owner).databaseId !== this.organizationId
      )
        return fail("repository_identity_mismatch");
      const collaborators = object(node.collaborators);
      if (!Array.isArray(collaborators.edges) || collaborators.edges.length > PAGE_SIZE)
        return fail("unexpected_response");
      for (const input of collaborators.edges as unknown[]) {
        const edge = object(input);
        const user = object(edge.node);
        if (!positiveId(user.databaseId) || typeof user.login !== "string")
          return fail("unexpected_response");
        if (
          user.login.toLowerCase() === login.toLowerCase() &&
          user.databaseId !== this.fallback.github_user_id
        )
          return fail("identity_mismatch");
        if (user.databaseId !== this.fallback.github_user_id) continue;
        if (matched || !Array.isArray(edge.permissionSources)) return fail("unexpected_response");
        matched = true;
        const sources: GitHubPermission[] = [];
        for (const entry of edge.permissionSources as unknown[]) {
          const source = object(entry);
          if (object(source.organization).databaseId !== this.organizationId)
            return fail("identity_mismatch");
          const granter = object(source.source);
          if (granter.__typename !== "Repository") continue;
          if (granter.databaseId !== this.repositoryId) return fail("repository_identity_mismatch");
          const roles: Record<string, GitHubPermission | undefined> = {
            ADMIN: "admin",
            WRITE: "push",
            READ: "pull",
            MAINTAIN: "maintain",
            TRIAGE: "triage",
            NONE: "none"
          };
          if (typeof source.permission !== "string" || !roles[source.permission])
            return fail("unsupported_repository_permission");
          sources.push(permission(roles[source.permission]));
        }
        if (sources.length > 1) return fail("unexpected_response");
        observed = sources[0] ?? "none";
      }
      const info = object(collaborators.pageInfo);
      if (typeof info.hasNextPage !== "boolean") return fail("unexpected_response");
      if (!info.hasNextPage) return observed;
      if (typeof info.endCursor !== "string" || !info.endCursor || cursors.has(info.endCursor))
        return fail("unexpected_response");
      cursor = info.endCursor;
      cursors.add(cursor);
    }
    return fail("unexpected_response");
  }

  private async fallbackPermission(
    signal: AbortSignal
  ): Promise<CourseRepositoryPermissionOutcome> {
    const base = {
      repositoryId: this.repositoryId,
      subject: "fallback_administrator" as const,
      githubUserId: this.fallback.github_user_id,
      desiredPermission: "admin" as const
    };
    let observed: GitHubPermission | null = null;
    let attempted = false;
    try {
      const repo = await this.repository(signal);
      const access = await this.fallbackAccess(repo, signal);
      if (access.incomplete) return access.incomplete;
      if (!access.login) return fail("account_lookup_failed");
      observed = await this.directFallbackPermission(repo, access.login, signal);
      if (observed === "admin")
        return Object.freeze({ ...base, observedPermission: observed, status: "up_to_date" });
      const freshAccess = await this.fallbackAccess(repo, signal);
      if (freshAccess.incomplete) return freshAccess.incomplete;
      if (!freshAccess.login) return fail("account_lookup_failed");
      const freshRepo = await this.repository(signal);
      this.sameLocator(repo, freshRepo);
      attempted = true;
      let mutationError: unknown;
      try {
        checked(
          await this.client.setCourseFallbackPermission(
            freshRepo.owner,
            freshRepo.name,
            freshAccess.login,
            signal
          ),
          HTTP_NO_CONTENT
        );
      } catch (error) {
        mutationError = error;
      }
      const recoverySignal = signal.aborted ? AbortSignal.timeout(TIMEOUT_MS) : signal;
      const afterRepo = await this.repository(recoverySignal);
      observed = await this.directFallbackPermission(afterRepo, freshAccess.login, recoverySignal);
      const afterAccess = await this.fallbackAccess(afterRepo, recoverySignal);
      if (afterAccess.incomplete)
        return Object.freeze({ ...afterAccess.incomplete, observedPermission: observed });
      if (observed !== "admin")
        return Object.freeze({
          ...base,
          observedPermission: observed,
          status: "needs_attention",
          reason: mutationError === undefined ? "permission_unverified" : reasonFor(mutationError)
        });
      return Object.freeze({ ...base, observedPermission: observed, status: "reconciled" });
    } catch (error) {
      return Object.freeze({
        ...base,
        observedPermission: attempted ? null : observed,
        status: "needs_attention",
        reason: reasonFor(error)
      });
    }
  }

  private async cleanupSafe(repo: Repository, signal: AbortSignal): Promise<boolean> {
    for (const kind of COURSE_TEAM_KINDS) {
      const identity = createManagedTeamIdentity({ courseRepositoryId: this.repositoryId, kind });
      const membership = await this.membership(identity, repo, signal);
      if (membership.status === "pending_organization_access") return false;
      const teamId = membership.teamId;
      if (!positiveId(teamId)) return false;
      await this.verifyTeam(identity, teamId, repo, signal);
      if (
        (await this.associations(repo, signal)).find((value) => value.team.id === teamId)
          ?.permission !== courseTeamRepositoryPermission(identity)
      )
        return false;
    }
    const access = await this.fallbackAccess(repo, signal);
    return (
      !access.incomplete &&
      !!access.login &&
      (await this.directFallbackPermission(repo, access.login, signal)) === "admin"
    );
  }

  private async run(signal: AbortSignal): Promise<readonly CourseRepositoryPermissionOutcome[]> {
    const identities = COURSE_TEAM_KINDS.map((kind) =>
      createManagedTeamIdentity({ courseRepositoryId: this.repositoryId, kind })
    );
    try {
      const repo = await this.repository(signal);
      await this.associations(repo, signal);
      const results: CourseRepositoryPermissionOutcome[] = [];
      // Establish all intended access before considering any scoped-team permission removal.
      results.push(await this.fallbackPermission(signal));
      for (const identity of identities)
        results.push(
          await this.teamPermission(
            identity,
            courseTeamRepositoryPermission(identity) ?? "none",
            signal
          )
        );
      const currentRepo = await this.repository(signal);
      const associations = await this.associations(currentRepo, signal);
      for (const association of associations) {
        const classified = classifyManagedTeam(association.team, this.repositoryId);
        if (classified.classification === "managed_for_course") {
          if (courseTeamRepositoryPermission(classified.identity) === undefined)
            results.push(
              await this.teamPermission(classified.identity, "none", signal, association.team.id)
            );
        } else if (classified.classification !== "unmanaged") {
          results.push(
            Object.freeze({
              repositoryId: this.repositoryId,
              subject: "team",
              teamId: association.team.id,
              ...(classified.classification === "managed_for_other_course"
                ? { identity: classified.identity }
                : {}),
              desiredPermission: "none",
              observedPermission: association.permission,
              status: "needs_attention",
              reason:
                classified.classification === "managed_for_other_course"
                  ? "cross_course_repository_access"
                  : "unowned_repository_access"
            })
          );
        }
      }
      return Object.freeze(results);
    } catch (error) {
      return Object.freeze([
        {
          repositoryId: this.repositoryId,
          subject: "fallback_administrator",
          githubUserId: this.fallback.github_user_id,
          desiredPermission: "admin",
          observedPermission: null,
          status: "needs_attention",
          reason: reasonFor(error)
        },
        ...identities.map(
          (identity): CourseRepositoryPermissionOutcome =>
            Object.freeze({
              ...this.base(identity, courseTeamRepositoryPermission(identity) ?? "none"),
              observedPermission: null,
              status: "needs_attention",
              reason: reasonFor(error)
            })
        )
      ]);
    }
  }
}
