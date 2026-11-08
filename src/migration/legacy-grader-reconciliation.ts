import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import type {
  GitHubCoursePermissionClient,
  GitHubManagedTeamClient
} from "../github/github-client.js";
import { ManagedTeamMembershipReconciler } from "../github/managed-team-reconciliation.js";
import type {
  FacultyInvitationJournal,
  FacultyOrganizationReconciler
} from "../github/faculty-organization-access.js";
import {
  courseTeamRepositoryPermission,
  CourseRepositoryPermissionReconciler
} from "../github/course-repository-permissions.js";
import {
  desiredStudentTeamGrants,
  StudentRepositoryPermissionReconciler
} from "../github/student-repository-permissions.js";
import type { TrustedStudentRepositoryTarget } from "../github/student-repository-target.js";
import { buildDesiredTeamMemberships } from "../github/desired-team-membership.js";
import { buildLifecycleTeamMemberships } from "../github/lifecycle-team-membership.js";
import { CourseLifecycleAuthorizationResolver } from "../faculty/course-lifecycle-authorization-resolver.js";
import type { LegacyRecoveryPlan } from "./migration-recovery-plan.js";
import type { Immutable } from "./migration-models.js";
import {
  RepositoryTeamPermissionBoundary,
  checked,
  object,
  positiveId,
  type PermissionRepository
} from "../github/repository-team-permission-boundary.js";

import type { GraderRemovalPlan } from "./grader-removal-models.js";
import { freeze, isSha, stableJson, compare } from "./migration-evidence.js";

const TIMEOUT_MS = 30_000;
const HTTP_NO_CONTENT = 204;
const PAGE_SIZE = 100;
const PAGE_LIMIT = 1000;
export interface PublishedGraderContext {
  courseRepositoryId: number;
  organizationId: number;
  authenticatedUserId: number;
  sessionId: string;
  authorized: boolean;
  publishedRevision: string;
  course: RawCourseConfigV2;
  terms: readonly RawTermConfigV2[];
  targets: readonly TrustedStudentRepositoryTarget[];
}
export interface LegacyGraderDependencies {
  /** Trusted backend read: synchronize authoritative published v2 and recheck current
   * session generation/authorization. Never return working-tree or renderer state.
   * Caller serializes this capability with all other course/session mutations.
   */
  readPublished(signal: AbortSignal): Promise<PublishedGraderContext>;
  organizationAccess: Pick<FacultyOrganizationReconciler, "inspect">;
  creationJournal: FacultyInvitationJournal;
  /** Main-only #31 recovery: the stored reviewer is evidence, while the executing role is fresh. */
  recovery?: { readonly reviewedGithubUserId: number };
}
export interface LegacyGraderTargetOutcome {
  repositoryId: number;
  teamId: number;
  status: "removed" | "already_absent" | "needs_attention";
  reason?:
    | "context_changed"
    | "replacement_unverified"
    | "identity_unverified"
    | "removal_unverified";
}
type Grant = GraderRemovalPlan["reconciliation"]["grants"][number];
const same = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);
const canonicalRoleSets = (value: unknown): unknown => {
  if (Array.isArray(value))
    return value.map(canonicalRoleSets).sort((a, b) => compare(stableJson(a), stableJson(b)));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        canonicalRoleSets(entry)
      ])
    );
  return value;
};
const successful = (value: { readonly status: string }): boolean =>
  ["up_to_date", "reconciled"].includes(value.status);
function refuse(): never {
  throw new Error("Unverified legacy reconciliation boundary.");
}

/** Unwired backend capability. No journaled outcome substitutes for fresh remote proof.
 * Detached trusted inputs and a per-instance queue prevent caller mutation/overlap.
 * Never creates invitations, changes collaborators, or deletes teams/members of the legacy team.
 */
export class LegacyGraderReconciler {
  private readonly context: PublishedGraderContext;
  private readonly plan: GraderRemovalPlan | Immutable<LegacyRecoveryPlan>;
  private readonly boundary: RepositoryTeamPermissionBoundary;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly client: GitHubCoursePermissionClient & GitHubManagedTeamClient,
    context: PublishedGraderContext,
    plan: GraderRemovalPlan | Immutable<LegacyRecoveryPlan>,
    private readonly dependencies: LegacyGraderDependencies
  ) {
    this.context = structuredClone(context);
    this.plan = freeze(structuredClone(plan));
    this.boundary = new RepositoryTeamPermissionBoundary(client, context, () =>
      Promise.resolve([])
    );
  }
  reconcile(signal = AbortSignal.timeout(TIMEOUT_MS)) {
    const operation = this.queue.then(() => this.run(signal));
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  private sameRoles(left: unknown, right: unknown): boolean {
    return this.dependencies.recovery
      ? same(canonicalRoleSets(left), canonicalRoleSets(right))
      : same(left, right);
  }
  private async current(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const observed = await this.dependencies.readPublished(signal);
    if (
      !observed.authorized ||
      !observed.sessionId ||
      !isSha(observed.publishedRevision) ||
      !same(observed, this.context)
    )
      refuse();
    const { course, terms } = this.context;
    rawCourseConfigV2Schema.parse(course);
    terms.forEach((t) => rawTermConfigV2Schema.parse(t));
    const access = this.plan.audit.accessReview;
    const source = this.plan.audit.inventory.source;
    if (
      Object.entries(this.plan.source).some(
        ([key, value]) => source[key as keyof typeof source] !== value
      )
    )
      refuse();
    if (
      !this.context.authorized ||
      !["ready", "needs_attention"].includes(this.plan.status) ||
      this.plan.audit.accessReview.status !== "complete" ||
      !same(this.plan.audit.accessReview.source, this.plan.audit.inventory.source) ||
      !this.plan.persistedCleanup ||
      this.plan.source.repositoryId !== this.context.courseRepositoryId ||
      this.plan.source.authenticatedGithubUserId !==
        (this.dependencies.recovery?.reviewedGithubUserId ?? this.context.authenticatedUserId) ||
      !this.sameRoles(course.faculty_directory, access.facultyDirectory) ||
      !this.sameRoles(this.plan.facultyTerms, access.terms) ||
      !same(
        this.dependencies.recovery
          ? [...course.course.term_creation_order].sort()
          : course.course.term_creation_order,
        this.dependencies.recovery
          ? terms.map((t) => t.term.code).sort()
          : terms.map((t) => t.term.code)
      )
    )
      refuse();
    if (
      this.dependencies.recovery &&
      !new CourseLifecycleAuthorizationResolver(
        course,
        terms,
        this.context.authenticatedUserId
      ).getAuthority().allowed
    )
      refuse();
    const projected = terms.map((t) => ({
      termCode: t.term.code,
      currentCoordinatorGithubUserIds: t.coordinators.current.map((f) => f.github_user_id),
      status: t.term.status,
      hasEverBeenActive: t.term.has_ever_been_active,
      sections: t.sections.map((s) => ({
        sectionId: s.id,
        currentFacultyGithubUserIds: s.faculty.current.map((f) => f.github_user_id)
      }))
    }));
    if (!this.sameRoles(projected, this.plan.facultyTerms)) refuse();
    // Phase 7 validates all role references, including former relationships.
    buildDesiredTeamMemberships(course, terms, this.context.courseRepositoryId);
    const repo = await this.boundary.repository(this.context.courseRepositoryId, signal);
    if (repo.owner.toLowerCase() !== course.github.organization.toLowerCase()) refuse();
  }
  private validateGrant(grant: Grant): void {
    const candidate = this.plan.audit.inventory.candidate;
    const observed = this.plan.audit.inventory.repositories.filter(
      (r) => r.repositoryId === grant.repositoryId
    );
    const repo = observed[0];
    if (
      !positiveId(grant.teamId) ||
      !positiveId(grant.repositoryId) ||
      grant.organizationId !== this.context.organizationId ||
      this.plan.audit.inventory.status !== "ready" ||
      !candidate ||
      candidate.teamId !== grant.teamId ||
      candidate.organizationId !== grant.organizationId ||
      !candidate.membershipComplete ||
      this.plan.audit.inventory.findings.length > 0 ||
      observed.length !== 1 ||
      !repo?.associationsComplete ||
      !repo.associations.some(
        (a) =>
          a.teamId === grant.teamId &&
          a.legacyCandidate &&
          a.permission === grant.observedPermission &&
          a.parentId === null &&
          a.slug === candidate.slug
      ) ||
      !this.sameRoles(grant.replacement.facultyDirectory, this.context.course.faculty_directory) ||
      !this.sameRoles(grant.replacement.terms, this.plan.facultyTerms) ||
      grant.replacement.fallbackAdministratorGithubUserId !==
        this.context.course.fallback_administrator.github_user_id ||
      !same(grant.replacement.memberDecisions, this.plan.audit.accessReview.decisions) ||
      this.plan.reconciliation.grants.filter(
        (g) => g.repositoryId === grant.repositoryId && g.teamId === grant.teamId
      ).length !== 1
    )
      refuse();
  }
  private async legacyOwnership(grant: Grant, signal: AbortSignal): Promise<void> {
    const candidate = this.plan.audit.inventory.candidate;
    if (!candidate) refuse();
    const teams = new Map<number, Record<string, unknown>>();
    let complete = false;
    for (let page = 1; page <= PAGE_LIMIT && !complete; page += 1) {
      const response = await this.client.listManagedOrganizationTeamsPage(
        candidate.organizationLogin,
        page,
        PAGE_SIZE,
        signal
      );
      const rows = checked(response);
      if (!Array.isArray(rows) || rows.length > PAGE_SIZE) refuse();
      for (const row of rows as unknown[]) {
        const t = object(row);
        if (!positiveId(t.id) || teams.has(t.id)) refuse();
        teams.set(t.id, t);
      }
      complete =
        rows.length < PAGE_SIZE &&
        !/rel="next"/.test(new Headers(response.headers).get("link") ?? "");
    }
    if (
      !complete ||
      !teams.has(grant.teamId) ||
      [...teams.values()].some(
        (t) =>
          (t.id !== grant.teamId && t.slug === candidate.slug) ||
          (t.parent !== null && object(t.parent).id === grant.teamId)
      )
    )
      refuse();
    const members = new Map<number, string>();
    complete = false;
    for (let page = 1; page <= PAGE_LIMIT && !complete; page += 1) {
      const response = await this.client.listManagedTeamMembersPage(
        grant.organizationId,
        grant.teamId,
        page,
        PAGE_SIZE,
        signal
      );
      const rows = checked(response);
      if (!Array.isArray(rows) || rows.length > PAGE_SIZE) refuse();
      for (const row of rows as unknown[]) {
        const member = object(row);
        if (!positiveId(member.id) || typeof member.login !== "string" || members.has(member.id))
          refuse();
        members.set(member.id, member.login);
      }
      complete =
        rows.length < PAGE_SIZE &&
        !/rel="next"/.test(new Headers(response.headers).get("link") ?? "");
    }
    const expected = candidate.members.map((m) => [m.id, m.login]);
    if (!complete || !same([...members].sort(), expected.sort())) refuse();
  }
  private async legacy(
    grant: Grant,
    signal: AbortSignal
  ): Promise<{ repo: PermissionRepository; absent: boolean }> {
    await this.current(signal);
    this.validateGrant(grant);
    const repo = await this.boundary.repository(grant.repositoryId, signal);
    const expected = this.plan.audit.inventory.repositories.find(
      (r) => r.repositoryId === grant.repositoryId
    );
    if (repo.owner !== expected?.owner || repo.name !== expected.name) refuse();
    const candidate = this.plan.audit.inventory.candidate;
    const team = object(
      checked(await this.client.getManagedTeam(grant.organizationId, grant.teamId, signal))
    );
    const org = object(team.organization);
    // Legacy teams are explicitly reviewed exceptions, never adopt another managed identity.
    if (
      team.id !== grant.teamId ||
      org.id !== grant.organizationId ||
      org.login !== repo.owner ||
      team.slug !== candidate?.slug ||
      team.parent !== null ||
      (team.description !== null && team.description !== "")
    )
      refuse();
    await this.legacyOwnership(grant, signal);
    const associations = await this.boundary.associations(repo, signal);
    const grantNow = associations.find((a) => a.team.id === grant.teamId);
    if (
      grantNow &&
      (grantNow.permission !== grant.observedPermission ||
        grantNow.team.slug !== team.slug ||
        grantNow.parentId !== null ||
        grantNow.team.description !== team.description)
    )
      refuse();
    return { repo, absent: grantNow === undefined };
  }
  private async replacements(grant: Grant, signal: AbortSignal): Promise<void> {
    const c = this.context;
    const memberships = new ManagedTeamMembershipReconciler(
      this.client,
      c,
      this.dependencies.organizationAccess,
      this.dependencies.creationJournal,
      this.dependencies.recovery ? "term-lifecycle" : "all-terms"
    );
    const outcomes = await memberships.reconcile(signal);
    if (!outcomes.every(successful)) refuse();
    await this.current(signal);
    const inspect = () => memberships.inspect(signal);
    // Deliberately withhold collaborator mutation from the existing course reconciler.
    const client: GitHubCoursePermissionClient = {
      getOrganizationScopeResponse: (s) => this.client.getOrganizationScopeResponse(s),
      getOrganizationMembership: (o, s) => this.client.getOrganizationMembership(o, s),
      getUser: (u) => this.client.getUser(u),
      getManagedTeam: (o, t, s) => this.client.getManagedTeam(o, t, s),
      getCourseRepositoryById: (r, s) => this.client.getCourseRepositoryById(r, s),
      listCourseRepositoryTeamsPage: (o, r, p, n, s) =>
        this.client.listCourseRepositoryTeamsPage(o, r, p, n, s),
      setCourseRepositoryTeamPermission: (o, t, u, r, p, s) =>
        p === "none"
          ? Promise.reject(new Error("Managed cleanup deferred"))
          : this.client.setCourseRepositoryTeamPermission(o, t, u, r, p, s),
      getCourseFallbackPermissionPage: (r, l, p, s) =>
        this.client.getCourseFallbackPermissionPage(r, l, p, s),
      setCourseFallbackPermission: () =>
        Promise.reject(new Error("Collaborator changes are outside legacy cleanup"))
    };
    if (grant.repositoryId === c.courseRepositoryId) {
      const permissions = new CourseRepositoryPermissionReconciler(client, c, {
        inspectTeamMemberships: inspect,
        inspectOrganizationAccess: (_o, s) => this.dependencies.organizationAccess.inspect(s)
      });
      const results = await permissions.reconcile(signal);
      if (results.length === 0 || !results.every(successful)) refuse();
    } else {
      const targets = c.targets.filter((t) => t.repositoryId === grant.repositoryId);
      if (targets.length !== 1) refuse();
      const permissions = new StudentRepositoryPermissionReconciler(
        {
          ...client,
          listManagedOrganizationTeamsPage: (o, p, n, s) =>
            this.client.listManagedOrganizationTeamsPage(o, p, n, s)
        },
        { ...c, targets },
        inspect
      );
      const results = await permissions.reconcile(signal);
      if (results.length !== 1 || !results.every(successful)) refuse();
    }
    // Fresh membership observation, never a successful mutation response alone.
    const fresh = await memberships.inspect(signal);
    if (fresh.length !== outcomes.length || !fresh.every(successful)) refuse();
    const desired = (
      this.dependencies.recovery ? buildLifecycleTeamMemberships : buildDesiredTeamMemberships
    )(c.course, c.terms, c.courseRepositoryId);
    if (
      !desired.every((d) =>
        fresh.some(
          (f) =>
            same(f.identity, d.identity) &&
            positiveId(f.teamId) &&
            same(
              f.faculty
                .filter((v) => v.desired && v.observed)
                .map((v) => v.githubUserId)
                .sort(),
              [...d.githubUserIds].sort()
            )
        )
      )
    )
      refuse();
  }
  private async verifyReplacementGrants(
    grant: Grant,
    repo: PermissionRepository,
    signal: AbortSignal
  ): Promise<void> {
    const c = this.context;
    const membership = new ManagedTeamMembershipReconciler(
      this.client,
      c,
      this.dependencies.organizationAccess,
      this.dependencies.creationJournal,
      this.dependencies.recovery ? "term-lifecycle" : "all-terms"
    );
    const observed = await membership.inspect(signal);
    if (!observed.every(successful)) refuse();
    const scopes = c.targets.filter((t) => t.repositoryId === grant.repositoryId);
    const desired =
      grant.repositoryId === c.courseRepositoryId
        ? (this.dependencies.recovery
            ? buildLifecycleTeamMemberships
            : buildDesiredTeamMemberships)(c.course, c.terms, c.courseRepositoryId).flatMap((d) => {
            const permission = courseTeamRepositoryPermission(d.identity);
            return permission ? [{ identity: d.identity, permission }] : [];
          })
        : scopes.flatMap((t) =>
            desiredStudentTeamGrants(c.courseRepositoryId, t.termCode, t.sectionId)
          );
    if (desired.length === 0) refuse();
    const associations = await this.boundary.associations(repo, signal);
    for (const d of desired) {
      const team = observed.find((t) => same(t.identity, d.identity));
      if (
        !team ||
        !positiveId(team.teamId) ||
        !associations.some((a) => a.team.id === team.teamId && a.permission === d.permission)
      )
        refuse();
      await this.boundary.verifyTeam(d.identity, team.teamId, repo, signal);
    }
    await this.current(signal);
  }

  private async run(signal: AbortSignal) {
    const targets: LegacyGraderTargetOutcome[] = [];
    try {
      await this.current(signal);
    } catch {
      return freeze({
        status: "needs_attention" as const,
        targets: this.plan.reconciliation.grants.map((g) => ({
          repositoryId: g.repositoryId,
          teamId: g.teamId,
          status: "needs_attention" as const,
          reason: "context_changed" as const
        })),
        manualCleanupTeamIds: [] as number[]
      });
    }

    for (const grant of this.plan.reconciliation.grants) {
      let reason: LegacyGraderTargetOutcome["reason"] = "context_changed";
      try {
        await this.current(signal);
        this.validateGrant(grant);
        reason = "identity_unverified";
        const before = await this.legacy(grant, signal);
        if (before.absent) {
          reason = "replacement_unverified";
          await this.replacements(grant, signal);
          await this.verifyReplacementGrants(grant, before.repo, signal);
          targets.push({
            repositoryId: grant.repositoryId,
            teamId: grant.teamId,
            status: "already_absent"
          });
        } else {
          reason = "replacement_unverified";
          await this.replacements(grant, signal);
          reason = "identity_unverified";
          const fresh = await this.legacy(grant, signal);
          this.boundary.sameLocator(before.repo, fresh.repo);
          await this.verifyReplacementGrants(grant, fresh.repo, signal);
          const final = await this.legacy(grant, signal);
          this.boundary.sameLocator(fresh.repo, final.repo);
          if (!final.absent) {
            reason = "removal_unverified";
            try {
              checked(
                await this.client.setCourseRepositoryTeamPermission(
                  grant.organizationId,
                  grant.teamId,
                  fresh.repo.owner,
                  fresh.repo.name,
                  "none",
                  signal
                ),
                HTTP_NO_CONTENT
              );
            } catch {
              /* Always observe after an attempted mutation; never retry here. */
            }
          }
          // Recovery must be possible after cancellation/lost response, but never authorize another write.
          const recovery = signal.aborted ? AbortSignal.timeout(TIMEOUT_MS) : signal;
          const after = await this.legacy(grant, recovery);
          if (!after.absent) refuse();
          targets.push({
            repositoryId: grant.repositoryId,
            teamId: grant.teamId,
            status: "removed"
          });
        }
      } catch {
        targets.push({
          repositoryId: grant.repositoryId,
          teamId: grant.teamId,
          status: "needs_attention",
          reason
        });
      }
    }
    return freeze({
      status: targets.some((t) => t.status === "needs_attention")
        ? ("needs_attention" as const)
        : ("complete" as const),
      targets,
      manualCleanupTeamIds:
        targets.length > 0 &&
        targets.every((t) => t.status !== "needs_attention") &&
        this.plan.audit.inventory.status === "ready" &&
        this.plan.audit.inventory.repositories.every((r) =>
          r.associations
            .filter((a) => a.legacyCandidate)
            .every((a) =>
              targets.some(
                (t) =>
                  t.repositoryId === r.repositoryId &&
                  t.teamId === a.teamId &&
                  t.status !== "needs_attention"
              )
            )
        )
          ? [...new Set(targets.map((t) => t.teamId))]
          : []
    });
  }
}
