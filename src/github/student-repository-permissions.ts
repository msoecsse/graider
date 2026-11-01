import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import type { GitHubManagedTeamClient } from "./github-client.js";
import type { GitHubPermission, GitHubTeam } from "./github-models.js";
import {
  classifyManagedTeam,
  createManagedTeamIdentity,
  findDuplicateManagedTeams,
  renderManagedTeamMetadata,
  type ManagedTeamIdentity
} from "./managed-team-identity.js";
import type { TeamReconciliationStatus } from "./managed-team-reconciliation.js";
import {
  RepositoryTeamPermissionBoundary,
  checked,
  object,
  positiveId,
  reasonFor,
  type RepositoryPermissionReason,
  type PermissionRepository,
  type RepositoryTeamPermissionClient,
  type RepositoryTeamMembershipReader
} from "./repository-team-permission-boundary.js";
import {
  validateStudentRepositoryTargets,
  type TrustedStudentRepositoryTarget,
  type StudentTargetValidation,
  type StudentTargetReason
} from "./student-repository-target.js";

const TIMEOUT_MS = 30_000;
const PAGE_SIZE = 100;
const PAGE_LIMIT = 1000;
const HTTP_NO_CONTENT = 204;
export type StudentRepositoryPermissionClient = RepositoryTeamPermissionClient &
  Pick<GitHubManagedTeamClient, "listManagedOrganizationTeamsPage">;
export type StudentPermissionReason =
  | RepositoryPermissionReason
  | StudentTargetReason
  | "desired_student_grants_incomplete";
export interface StudentTeamPermissionOutcome {
  readonly identity?: ManagedTeamIdentity;
  readonly teamId?: number;
  readonly desiredPermission: "admin" | "pull" | "none";
  readonly observedPermission: GitHubPermission | null;
  readonly status: TeamReconciliationStatus;
  readonly reason?: StudentPermissionReason;
}
export interface StudentRepositoryPermissionOutcome {
  readonly repositoryId: number | null;
  readonly termCode: string | null;
  readonly sectionId: string | null;
  readonly targetId: string | null;
  readonly status: TeamReconciliationStatus;
  readonly reason?: StudentPermissionReason;
  readonly teams: readonly StudentTeamPermissionOutcome[];
}
export interface DesiredStudentTeamGrant {
  readonly identity: ManagedTeamIdentity;
  readonly permission: "admin" | "pull";
}

/** Four independent role sources, including intentional historical read. No fallback/course-wide insertion. */
export const desiredStudentTeamGrants = (
  courseRepositoryId: number,
  termCode: string,
  sectionId: string
): readonly DesiredStudentTeamGrant[] =>
  Object.freeze(
    [
      { kind: "term-current-coordinators", permission: "admin" },
      { kind: "section-current-faculty", permission: "admin" },
      { kind: "term-former-coordinators", permission: "pull" },
      { kind: "section-former-faculty", permission: "pull" }
    ].map((value) =>
      Object.freeze({
        identity: createManagedTeamIdentity({
          courseRepositoryId,
          termCode,
          kind: value.kind,
          ...(value.kind.startsWith("section-") ? { sectionId } : {})
        }),
        permission: value.permission as "admin" | "pull"
      })
    )
  );

class StudentPermissionError extends Error {
  constructor(readonly reason: StudentPermissionReason) {
    super(reason);
  }
}
const fail = (reason: StudentPermissionReason): never => {
  throw new StudentPermissionError(reason);
};
const studentReasonFor = (error: unknown): StudentPermissionReason =>
  error instanceof StudentPermissionError ? error.reason : reasonFor(error);

/**
 * Backend only: context and ID→scope mappings must come from authorized, revision-bound
 * Graider state, never renderer names/sections/slugs. The outer service binds the same
 * OAuth session, canonical course/organization IDs, complete v2 term state and 7.3 reader,
 * retains its durable creation journal, serializes operations and invalidates stale context.
 * This class has no collaborator, invitation, team-creation or membership mutation capability.
 */
export class StudentRepositoryPermissionReconciler {
  private readonly boundary: RepositoryTeamPermissionBoundary;
  private readonly targets: readonly StudentTargetValidation[];
  private readonly scopes = new Set<string>();
  private readonly courseId: number;
  private readonly organizationId: number;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly client: StudentRepositoryPermissionClient,
    context: {
      readonly course: RawCourseConfigV2;
      readonly terms: readonly RawTermConfigV2[];
      readonly courseRepositoryId: number;
      readonly organizationId: number;
      readonly authenticatedUserId: number;
      readonly targets: readonly unknown[];
    },
    inspectMemberships: RepositoryTeamMembershipReader
  ) {
    rawCourseConfigV2Schema.parse(context.course);
    this.boundary = new RepositoryTeamPermissionBoundary(client, context, inspectMemberships);
    this.courseId = context.courseRepositoryId;
    this.organizationId = context.organizationId;
    const codes = new Set<string>();
    for (const input of context.terms) {
      const term = rawTermConfigV2Schema.parse(input);
      if (codes.has(term.term.code)) throw new Error("Duplicate supplied term scope.");
      codes.add(term.term.code);
      for (const section of term.sections) {
        const key = JSON.stringify([term.term.code, section.id]);
        if (this.scopes.has(key)) throw new Error("Duplicate supplied section scope.");
        this.scopes.add(key);
      }
    }
    this.targets = validateStudentRepositoryTargets(context.targets).map((value) =>
      value.status === "ready" ? this.validateContext(value.target) : value
    );
  }

  private validateContext(target: TrustedStudentRepositoryTarget): StudentTargetValidation {
    const reason =
      target.courseRepositoryId !== this.courseId || target.organizationId !== this.organizationId
        ? "target_context_mismatch"
        : target.repositoryId === this.courseId
          ? "course_repository_is_not_student_target"
          : !this.scopes.has(JSON.stringify([target.termCode, target.sectionId]))
            ? "unknown_target_scope"
            : undefined;
    return reason
      ? Object.freeze({
          status: "needs_attention",
          repositoryId: target.repositoryId,
          termCode: target.termCode,
          sectionId: target.sectionId,
          targetId: target.targetId,
          reason
        })
      : { status: "ready", target };
  }

  reconcile(
    signal = AbortSignal.timeout(TIMEOUT_MS)
  ): Promise<readonly StudentRepositoryPermissionOutcome[]> {
    const operation = this.queue.then(() => this.run(signal));
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async repository(
    target: TrustedStudentRepositoryTarget,
    signal: AbortSignal
  ): Promise<PermissionRepository> {
    // Course transfer/session changes invalidate student operations too.
    await this.boundary.repository(this.courseId, signal);
    return this.boundary.repository(target.repositoryId, signal);
  }

  /** Removal needs complete ownership inventory, including obsolete identities outside supplied terms. */
  private async removalOwnership(
    identity: ManagedTeamIdentity,
    teamId: number,
    repo: PermissionRepository,
    signal: AbortSignal
  ): Promise<void> {
    const teams = new Map<number, GitHubTeam>();
    const parents = new Map<number, number | null>();
    const slugs = new Map<string, number>();
    let complete = false;
    for (let page = 1; page <= PAGE_LIMIT; page += 1) {
      const response = await this.client.listManagedOrganizationTeamsPage(
        repo.owner,
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
          typeof value.slug !== "string" ||
          !value.slug ||
          (value.description !== null && typeof value.description !== "string")
        )
          return fail("unexpected_response");
        const parentId = value.parent === null ? null : object(value.parent).id;
        if (parentId !== null && !positiveId(parentId)) return fail("unexpected_response");
        const team: GitHubTeam = {
          id: value.id,
          org: repo.owner,
          name: value.name,
          slug: value.slug,
          description: value.description
        };
        const previous = teams.get(value.id);
        if (
          (previous &&
            (JSON.stringify(previous) !== JSON.stringify(team) ||
              parents.get(value.id) !== parentId)) ||
          (slugs.has(value.slug) && slugs.get(value.slug) !== value.id)
        )
          return fail("team_identity_changed");
        teams.set(value.id, team);
        parents.set(value.id, parentId);
        slugs.set(value.slug, value.id);
      }
      if (
        data.length < PAGE_SIZE &&
        !/rel="next"/.test(new Headers(response.headers).get("link") ?? "")
      ) {
        complete = true;
        break;
      }
    }
    if (!complete) return fail("unexpected_response");
    const key = renderManagedTeamMetadata(identity);
    if (
      findDuplicateManagedTeams([...teams.values()], this.courseId).some(
        (value) => renderManagedTeamMetadata(value.identity) === key
      )
    )
      return fail("duplicate_managed_team_identity");
    const selected = teams.get(teamId);
    if (
      !selected ||
      selected.description !== key ||
      parents.get(teamId) !== null ||
      [...parents.values()].some((id) => id === teamId)
    )
      return fail("team_identity_changed");
    const observed = classifyManagedTeam(selected, this.courseId);
    if (
      observed.classification !== "managed_for_course" ||
      renderManagedTeamMetadata(observed.identity) !== key
    )
      return fail("team_identity_changed");
    await this.boundary.verifyTeam(identity, teamId, repo, signal);
  }

  private async replacementsSafe(
    target: TrustedStudentRepositoryTarget,
    repo: PermissionRepository,
    signal: AbortSignal
  ): Promise<void> {
    const associations = await this.boundary.associations(repo, signal);
    if (
      findDuplicateManagedTeams(
        associations.map((value) => value.team),
        this.courseId
      ).length > 0
    )
      return fail("duplicate_managed_team_identity");
    for (const grant of desiredStudentTeamGrants(
      this.courseId,
      target.termCode,
      target.sectionId
    )) {
      const outcome = await this.boundary.membership(grant.identity, repo, signal);
      if (!positiveId(outcome.teamId)) return fail("desired_student_grants_incomplete");
      await this.boundary.verifyTeam(grant.identity, outcome.teamId, repo, signal);
      const observed = associations.find((value) => value.team.id === outcome.teamId);
      if (
        !observed ||
        observed.parentId !== null ||
        observed.team.description !== renderManagedTeamMetadata(grant.identity) ||
        observed.permission !== grant.permission
      )
        return fail("desired_student_grants_incomplete");
    }
  }

  private async grant(
    target: TrustedStudentRepositoryTarget,
    identity: ManagedTeamIdentity,
    desired: "admin" | "pull" | "none",
    signal: AbortSignal,
    expectedTeamId?: number
  ): Promise<StudentTeamPermissionOutcome> {
    let teamId = expectedTeamId;
    let observed: GitHubPermission | null = null;
    let attempted = false;
    try {
      const repo = await this.repository(target, signal);
      let pending = false;
      if (desired === "none") {
        if (!positiveId(teamId)) return fail("team_identity_changed");
        await this.replacementsSafe(target, repo, signal);
        await this.removalOwnership(identity, teamId, repo, signal);
      } else {
        const membership = await this.boundary.membership(identity, repo, signal);
        teamId = membership.teamId;
        pending = membership.status === "pending_organization_access";
        if (!positiveId(teamId)) return fail("team_identity_changed");
        await this.boundary.verifyTeam(identity, teamId, repo, signal);
      }
      const associations = await this.boundary.associations(repo, signal);
      if (
        findDuplicateManagedTeams(
          associations.map((value) => value.team),
          this.courseId
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
      if (observed === desired)
        return Object.freeze({
          identity,
          teamId,
          desiredPermission: desired,
          observedPermission: observed,
          status: pending ? "pending_organization_access" : "up_to_date"
        });
      if (!positiveId(teamId)) return fail("team_identity_changed");
      if (desired === "none") {
        // Pending replacements are safe; wrong-section grants must not linger solely because of Pending.
        await this.replacementsSafe(target, repo, signal);
        await this.removalOwnership(identity, teamId, repo, signal);
      } else {
        const fresh = await this.boundary.membership(identity, repo, signal);
        if (fresh.teamId !== teamId) return fail("team_identity_changed");
        await this.boundary.verifyTeam(identity, teamId, repo, signal);
      }
      const freshRepo = await this.repository(target, signal);
      this.boundary.sameLocator(repo, freshRepo);
      attempted = true;
      let mutationError: unknown;
      try {
        checked(
          await this.client.setCourseRepositoryTeamPermission(
            repo.organizationId,
            teamId,
            freshRepo.owner,
            freshRepo.name,
            desired,
            signal
          ),
          HTTP_NO_CONTENT
        );
      } catch (error) {
        mutationError = error;
      }
      const recoverySignal = signal.aborted ? AbortSignal.timeout(TIMEOUT_MS) : signal;
      const afterRepo = await this.repository(target, recoverySignal);
      const after = await this.boundary.associations(afterRepo, recoverySignal);
      await this.boundary.verifyTeam(identity, teamId, afterRepo, recoverySignal);
      const resulting = after.find((value) => value.team.id === teamId);
      if (
        resulting &&
        (resulting.team.description !== renderManagedTeamMetadata(identity) ||
          resulting.parentId !== null)
      )
        return fail("team_identity_changed");
      observed = resulting?.permission ?? "none";
      if (desired !== "none") {
        const verified = await this.boundary.membership(identity, afterRepo, recoverySignal);
        if (verified.teamId !== teamId) return fail("team_identity_changed");
        pending = verified.status === "pending_organization_access";
      } else {
        await this.removalOwnership(identity, teamId, afterRepo, recoverySignal);
      }
      if (observed !== desired)
        return Object.freeze({
          identity,
          teamId,
          desiredPermission: desired,
          observedPermission: observed,
          status: "needs_attention",
          reason:
            mutationError === undefined ? "permission_unverified" : studentReasonFor(mutationError)
        });
      return Object.freeze({
        identity,
        teamId,
        desiredPermission: desired,
        observedPermission: observed,
        status: pending ? "pending_organization_access" : "reconciled"
      });
    } catch (error) {
      return Object.freeze({
        identity,
        ...(teamId === undefined ? {} : { teamId }),
        desiredPermission: desired,
        observedPermission: attempted ? null : observed,
        status: "needs_attention",
        reason: studentReasonFor(error)
      });
    }
  }

  private async reconcileTarget(
    target: TrustedStudentRepositoryTarget,
    signal: AbortSignal
  ): Promise<StudentRepositoryPermissionOutcome> {
    const teams: StudentTeamPermissionOutcome[] = [];
    try {
      const repo = await this.repository(target, signal);
      await this.boundary.associations(repo, signal);
      const desired = desiredStudentTeamGrants(this.courseId, target.termCode, target.sectionId);
      const wanted = new Set(desired.map((value) => renderManagedTeamMetadata(value.identity)));
      for (const value of desired)
        teams.push(await this.grant(target, value.identity, value.permission, signal));
      const afterRepo = await this.repository(target, signal);
      const associations = await this.boundary.associations(afterRepo, signal);
      for (const association of associations) {
        const classified = classifyManagedTeam(association.team, this.courseId);
        if (
          classified.classification === "managed_for_course" &&
          !wanted.has(renderManagedTeamMetadata(classified.identity))
        )
          teams.push(
            await this.grant(target, classified.identity, "none", signal, association.team.id)
          );
        else if (
          classified.classification !== "unmanaged" &&
          classified.classification !== "managed_for_course"
        )
          teams.push(
            Object.freeze({
              ...(classified.classification === "managed_for_other_course"
                ? { identity: classified.identity }
                : {}),
              teamId: association.team.id,
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
      const status = teams.some((value) => value.status === "needs_attention")
        ? "needs_attention"
        : teams.some((value) => value.status === "pending_organization_access")
          ? "pending_organization_access"
          : teams.some((value) => value.status === "reconciled")
            ? "reconciled"
            : "up_to_date";
      return Object.freeze({
        repositoryId: target.repositoryId,
        termCode: target.termCode,
        sectionId: target.sectionId,
        targetId: target.targetId,
        status,
        teams: Object.freeze(teams)
      });
    } catch (error) {
      return Object.freeze({
        repositoryId: target.repositoryId,
        termCode: target.termCode,
        sectionId: target.sectionId,
        targetId: target.targetId,
        status: "needs_attention",
        reason: studentReasonFor(error),
        teams: Object.freeze(teams)
      });
    }
  }

  private async run(signal: AbortSignal): Promise<readonly StudentRepositoryPermissionOutcome[]> {
    const results: StudentRepositoryPermissionOutcome[] = [];
    for (const value of this.targets)
      results.push(
        value.status === "ready"
          ? await this.reconcileTarget(value.target, signal)
          : Object.freeze({ ...value, teams: Object.freeze([]) })
      );
    return Object.freeze(results);
  }
}
