import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema } from "../config/config-schemas.js";
import { FacultyDirectory } from "../faculty/faculty-directory.js";
import { isGithubUsername } from "../roster/roster-validation.js";
import type { GitHubManagedTeamClient, GitHubOrganizationResponse } from "./github-client.js";
import type { GitHubTeam } from "./github-models.js";
import {
  buildDesiredTeamMemberships,
  managedTeamDisplayName,
  type DesiredTeamMembership
} from "./desired-team-membership.js";
import {
  facultyOrganizationAttentionReasonFor,
  requireOrganizationResponse,
  type FacultyOrganizationAttentionReason,
  type FacultyOrganizationAccess,
  type FacultyInvitationJournal,
  type FacultyOrganizationReconciler
} from "./faculty-organization-access.js";
import {
  classifyManagedTeam,
  findDuplicateManagedTeams,
  renderManagedTeamMetadata,
  type ManagedTeamIdentity,
  type ObservedManagedTeam
} from "./managed-team-identity.js";

const PAGE_SIZE = 100;
const PAGE_LIMIT = 1000;
const TIMEOUT_MS = 30_000;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;

export type TeamReconciliationReason =
  | FacultyOrganizationAttentionReason
  | "incomplete_organization_access"
  | "organization_invitation_pending"
  | "organization_invitation_required"
  | "duplicate_managed_team_identity"
  | "ambiguous_team_metadata"
  | "team_identity_changed"
  | "team_hierarchy_unsupported"
  | "team_name_conflict"
  | "team_creation_unverified"
  | "team_journal_unavailable"
  | "membership_unverified";
export type TeamReconciliationStatus =
  | "up_to_date"
  | "reconciled"
  | "pending_organization_access"
  | "needs_attention";
export interface FacultyTeamOutcome {
  readonly githubUserId: number;
  readonly desired: boolean;
  readonly observed: boolean | null;
  readonly status: TeamReconciliationStatus;
  readonly reason?: TeamReconciliationReason;
}
export interface ManagedTeamOutcome {
  readonly identity: ManagedTeamIdentity;
  readonly teamId?: number;
  readonly conflictingTeamIds?: readonly number[];
  readonly status: TeamReconciliationStatus;
  readonly reason?: TeamReconciliationReason;
  readonly faculty: readonly FacultyTeamOutcome[];
}

interface TeamResource extends GitHubTeam {
  readonly id: number;
  readonly parentId: number | null;
}
interface TeamMember {
  readonly id: number;
  readonly login: string;
}
interface Inventory {
  readonly teams: readonly TeamResource[];
}
interface Session {
  readonly organizationId: number;
  readonly canWrite: boolean;
}

class TeamError extends Error {
  constructor(
    readonly reason: TeamReconciliationReason,
    readonly conflictingTeamIds?: readonly number[]
  ) {
    super(reason);
  }
}
class SnapshotError extends TeamError {}
const fail = (reason: TeamReconciliationReason): never => {
  throw new TeamError(reason);
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("unexpected_response");
  return value as Record<string, unknown>;
};
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const reasonFor = (error: unknown): TeamReconciliationReason =>
  error instanceof TeamError ? error.reason : facultyOrganizationAttentionReasonFor(error);
const checked = (response: GitHubOrganizationResponse, status?: number): unknown => {
  requireOrganizationResponse(response, status);
  return response.data;
};
const member = (input: unknown): TeamMember => {
  const value = record(input);
  if (
    !positiveId(value.id) ||
    typeof value.login !== "string" ||
    !isGithubUsername(value.login.toLowerCase())
  )
    return fail("unexpected_response");
  if (value.inherited === true) return fail("team_hierarchy_unsupported");
  return Object.freeze({ id: value.id, login: value.login });
};

/**
 * Internal backend service only. Construct from metadata read from the selected canonical
 * course repository, the selected OAuth session, and that same session/course's 7.2
 * read service. The outer service enforces AuthorizationResolver and revision checks,
 * supplies the complete intended term set, serializes instances and invalidates stale
 * contexts. No renderer-provided organization, role, access result or team is trusted.
 */
export class ManagedTeamMembershipReconciler {
  private readonly course: RawCourseConfigV2;
  private readonly desired: readonly DesiredTeamMembership[];
  private readonly directory: FacultyDirectory;
  private readonly repositoryId: number;
  private readonly accountId: number;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly client: GitHubManagedTeamClient,
    context: {
      readonly course: RawCourseConfigV2;
      readonly terms: readonly RawTermConfigV2[];
      readonly courseRepositoryId: number;
      readonly authenticatedUserId: number;
    },
    private readonly organizationAccess: Pick<FacultyOrganizationReconciler, "inspect">,
    /** All calls are awaited. Production must commit this journal durably before POST. */
    private readonly creationJournal: FacultyInvitationJournal
  ) {
    this.course = rawCourseConfigV2Schema.parse(context.course);
    this.desired = buildDesiredTeamMemberships(
      this.course,
      context.terms,
      context.courseRepositoryId
    );
    this.directory = new FacultyDirectory(this.course);
    if (!positiveId(context.authenticatedUserId))
      throw new Error("Invalid authenticated account ID.");
    this.accountId = context.authenticatedUserId;
    this.repositoryId = context.courseRepositoryId;
  }

  /** Explicit backend operation; creates missing desired teams and reconciles only their membership. */
  reconcile(signal = AbortSignal.timeout(TIMEOUT_MS)): Promise<readonly ManagedTeamOutcome[]> {
    const operation = this.queue.then(() => this.run(signal));
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async session(signal: AbortSignal): Promise<Session> {
    const response = await this.client.getOrganizationScopeResponse(signal);
    if (member(checked(response)).id !== this.accountId) return fail("session_mismatch");
    const membership = record(
      checked(await this.client.getOrganizationMembership(this.course.github.organization, signal))
    );
    const org = record(membership.organization);
    if (
      !positiveId(org.id) ||
      typeof org.login !== "string" ||
      org.login.toLowerCase() !== this.course.github.organization.toLowerCase()
    )
      return fail("identity_mismatch");
    if (membership.user !== undefined && member(membership.user).id !== this.accountId)
      return fail("session_mismatch");
    // An owner can see secret teams too; a partial member-visible inventory cannot rule out duplicates.
    if (membership.state !== "active" || membership.role !== "admin")
      return fail("permission_denied");
    const scopes = new Headers(response.headers).get("x-oauth-scopes");
    return {
      organizationId: org.id,
      canWrite:
        scopes === null ||
        scopes.split(/[ ,]+/).some((scope) => ["write:org", "admin:org"].includes(scope))
    };
  }

  private async pages(
    read: (page: number) => Promise<GitHubOrganizationResponse>
  ): Promise<unknown[]> {
    const values: unknown[] = [];
    for (let page = 1; page <= PAGE_LIMIT; page += 1) {
      const response = await read(page);
      const data = checked(response);
      if (!Array.isArray(data) || data.length > PAGE_SIZE) return fail("unexpected_response");
      values.push(...(data as unknown[]));
      if (
        data.length < PAGE_SIZE &&
        !/rel="next"/.test(new Headers(response.headers).get("link") ?? "")
      )
        return values;
    }
    return fail("unexpected_response");
  }

  private team(input: unknown, organizationId: number): TeamResource {
    const value = record(input);
    if (
      !positiveId(value.id) ||
      typeof value.name !== "string" ||
      !value.name ||
      typeof value.slug !== "string" ||
      !value.slug ||
      (value.description !== null && typeof value.description !== "string")
    )
      return fail("unexpected_response");
    let parentId: number | null = null;
    if (value.parent !== null) {
      const parent = record(value.parent);
      if (!positiveId(parent.id)) return fail("unexpected_response");
      parentId = parent.id;
    }
    if (value.organization !== undefined) {
      const org = record(value.organization);
      if (
        org.id !== organizationId ||
        typeof org.login !== "string" ||
        org.login.toLowerCase() !== this.course.github.organization.toLowerCase()
      )
        return fail("identity_mismatch");
    }
    return Object.freeze({
      id: value.id,
      name: value.name,
      slug: value.slug,
      description: value.description,
      org: this.course.github.organization,
      parentId
    });
  }

  private async inventory(session: Session, signal: AbortSignal): Promise<Inventory> {
    const inputs = await this.pages((page) =>
      this.client.listManagedOrganizationTeamsPage(
        this.course.github.organization,
        page,
        PAGE_SIZE,
        signal
      )
    );
    const teams = new Map<number, TeamResource>();
    const slugs = new Map<string, number>();
    for (const input of inputs) {
      const team = this.team(input, session.organizationId);
      const previous = teams.get(team.id);
      if (
        (previous && JSON.stringify(previous) !== JSON.stringify(team)) ||
        (slugs.has(team.slug.toLowerCase()) && slugs.get(team.slug.toLowerCase()) !== team.id)
      )
        return fail("team_identity_changed");
      teams.set(team.id, team);
      slugs.set(team.slug.toLowerCase(), team.id);
    }
    return { teams: Object.freeze([...teams.values()]) };
  }

  private select(
    identity: ManagedTeamIdentity,
    inventory: Inventory
  ): ObservedManagedTeam | undefined {
    const key = renderManagedTeamMetadata(identity);
    const conflicts = findDuplicateManagedTeams(inventory.teams, this.repositoryId);
    const conflict = conflicts.find((value) => renderManagedTeamMetadata(value.identity) === key);
    if (conflict)
      throw new TeamError(
        "duplicate_managed_team_identity",
        Object.freeze(conflict.teams.map((value) => value.team.id))
      );
    let found: ObservedManagedTeam | undefined;
    for (const team of inventory.teams) {
      const classified = classifyManagedTeam(team, this.repositoryId);
      if (
        ["malformed_metadata", "unsupported_metadata_version", "invalid_team_resource"].includes(
          classified.classification
        )
      )
        return fail("ambiguous_team_metadata");
      if (
        classified.classification === "managed_for_course" &&
        renderManagedTeamMetadata(classified.identity) === key
      ) {
        if (team.parentId !== null || inventory.teams.some((other) => other.parentId === team.id))
          return fail("team_hierarchy_unsupported");
        found = classified;
      }
    }
    return found;
  }

  private async snapshot(
    identity: ManagedTeamIdentity,
    expectedTeamId: number,
    session: Session,
    signal: AbortSignal
  ): Promise<readonly TeamMember[]> {
    try {
      return await this.readSnapshot(identity, expectedTeamId, session, signal);
    } catch (error) {
      throw new SnapshotError(
        reasonFor(error),
        error instanceof TeamError ? error.conflictingTeamIds : undefined
      );
    }
  }

  private async readSnapshot(
    identity: ManagedTeamIdentity,
    expectedTeamId: number,
    session: Session,
    signal: AbortSignal
  ): Promise<readonly TeamMember[]> {
    const selected = this.select(identity, await this.inventory(session, signal));
    if (!selected || selected.team.id !== expectedTeamId) return fail("team_identity_changed");
    const resource = this.team(
      checked(await this.client.getManagedTeam(session.organizationId, expectedTeamId, signal)),
      session.organizationId
    );
    if (
      resource.id !== expectedTeamId ||
      resource.parentId !== null ||
      resource.description !== renderManagedTeamMetadata(identity)
    )
      return fail("team_identity_changed");
    const inputs = await this.pages((page) =>
      this.client.listManagedTeamMembersPage(
        session.organizationId,
        expectedTeamId,
        page,
        PAGE_SIZE,
        signal
      )
    );
    const members = new Map<number, TeamMember>();
    const logins = new Map<string, number>();
    for (const input of inputs) {
      const observed = member(input);
      const previous = members.get(observed.id);
      if (
        (previous && previous.login.toLowerCase() !== observed.login.toLowerCase()) ||
        (logins.has(observed.login.toLowerCase()) &&
          logins.get(observed.login.toLowerCase()) !== observed.id)
      )
        return fail("identity_mismatch");
      members.set(observed.id, observed);
      logins.set(observed.login.toLowerCase(), observed.id);
    }
    return Object.freeze([...members.values()]);
  }

  private async journal<T>(operation: () => T | Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      return fail("team_journal_unavailable");
    }
  }

  private async ensureTeam(
    desired: DesiredTeamMembership,
    session: Session,
    signal: AbortSignal
  ): Promise<{ readonly observed: ObservedManagedTeam; readonly created: boolean }> {
    const currentSession = await this.session(signal);
    if (currentSession.organizationId !== session.organizationId) return fail("identity_mismatch");
    const inventory = await this.inventory(session, signal);
    const selected = this.select(desired.identity, inventory);
    if (selected) return { observed: selected, created: false };
    const key = `managed-team-create:${String(session.organizationId)}:${renderManagedTeamMetadata(desired.identity)}`;
    if (await this.journal(() => this.creationJournal.has(key)))
      return fail("team_creation_unverified");
    const name = managedTeamDisplayName(desired.identity);
    const slug = name.toLowerCase().replace(/[^a-z\d]+/g, "-");
    if (
      inventory.teams.some(
        (team) => team.name.toLowerCase() === name.toLowerCase() || team.slug.toLowerCase() === slug
      )
    )
      return fail("team_name_conflict");
    if (!currentSession.canWrite) return fail("insufficient_scope");
    await this.journal(() => this.creationJournal.add(key));
    let mutationError: unknown;
    let createdId: unknown;
    try {
      const response = await this.client.createManagedTeam(
        this.course.github.organization,
        name,
        renderManagedTeamMetadata(desired.identity),
        signal
      );
      createdId = record(checked(response, HTTP_CREATED)).id;
    } catch (error) {
      mutationError = error;
    }
    const recoverySignal = signal.aborted ? AbortSignal.timeout(TIMEOUT_MS) : signal;
    const freshSession = await this.session(recoverySignal);
    if (freshSession.organizationId !== session.organizationId) return fail("identity_mismatch");
    const after = this.select(desired.identity, await this.inventory(freshSession, recoverySignal));
    if (!after) {
      if (mutationError !== undefined) throw new TeamError(reasonFor(mutationError));
      return fail("team_creation_unverified");
    }
    if (createdId !== undefined && (!positiveId(createdId) || createdId !== after.team.id))
      return fail("team_identity_changed");
    await this.journal(() => this.creationJournal.delete(key));
    return { observed: after, created: true };
  }

  private access(
    id: number,
    values: readonly FacultyOrganizationAccess[]
  ): FacultyTeamOutcome | undefined {
    const matches = values.filter((value) => value.githubUserId === id);
    const value = matches[0];
    const base = { githubUserId: id, desired: true, observed: null };
    if (
      matches.length !== 1 ||
      !value ||
      value.courseRepositoryId !== this.repositoryId ||
      value.organization.toLowerCase() !== this.course.github.organization.toLowerCase()
    )
      return { ...base, status: "needs_attention", reason: "incomplete_organization_access" };
    switch (value.state) {
      case "active":
        return undefined;
      case "pending_invitation":
        return {
          ...base,
          status: "pending_organization_access",
          reason: "organization_invitation_pending"
        };
      case "invitation_required":
        return {
          ...base,
          status: "pending_organization_access",
          reason: "organization_invitation_required"
        };
      case "needs_attention":
        return { ...base, status: "needs_attention", reason: value.reason };
    }
  }

  private async reconcileFaculty(
    desired: DesiredTeamMembership,
    teamId: number,
    candidate: TeamMember,
    present: boolean,
    session: Session,
    access: readonly FacultyOrganizationAccess[],
    signal: AbortSignal
  ): Promise<FacultyTeamOutcome> {
    const base = { githubUserId: candidate.id, desired: present };
    const members = await this.snapshot(desired.identity, teamId, session, signal);
    const observed = members.some((value) => value.id === candidate.id);
    if (present) {
      const dependency = this.access(candidate.id, access);
      if (dependency) return { ...dependency, observed };
    }
    try {
      const locator = present
        ? this.directory.resolveByGithubUserId(candidate.id)?.github_login
        : members.find((value) => value.id === candidate.id)?.login;
      if (observed === present) return { ...base, observed, status: "up_to_date" };
      if (!locator) return fail("account_lookup_failed");
      const resolved = await this.client.getUser(locator);
      if (
        !resolved ||
        !positiveId(resolved.id) ||
        !isGithubUsername(resolved.username.toLowerCase())
      )
        return fail("account_lookup_failed");
      if (resolved.id !== candidate.id) return fail("identity_mismatch");
      if (present) {
        const dependency = this.access(candidate.id, await this.organizationAccess.inspect(signal));
        if (dependency) return { ...dependency, observed };
      }
      const freshSession = await this.session(signal);
      if (freshSession.organizationId !== session.organizationId) return fail("identity_mismatch");
      if (!freshSession.canWrite) return fail("insufficient_scope");
      // Revalidate complete ownership/resource/membership immediately before each write.
      const before = await this.snapshot(desired.identity, teamId, freshSession, signal);
      if (before.some((value) => value.id === candidate.id) === present)
        return { ...base, observed: present, status: "up_to_date" };
      let mutationError: unknown;
      try {
        checked(
          await this.client.setManagedTeamMembership(
            session.organizationId,
            teamId,
            resolved.username,
            present,
            signal
          ),
          present ? undefined : HTTP_NO_CONTENT
        );
      } catch (error) {
        mutationError = error;
      }
      const recoverySignal = signal.aborted ? AbortSignal.timeout(TIMEOUT_MS) : signal;
      let after: readonly TeamMember[];
      try {
        const recoverySession = await this.session(recoverySignal);
        if (recoverySession.organizationId !== session.organizationId)
          return fail("identity_mismatch");
        after = await this.snapshot(desired.identity, teamId, recoverySession, recoverySignal);
      } catch (error) {
        throw new SnapshotError(
          reasonFor(error),
          error instanceof TeamError ? error.conflictingTeamIds : undefined
        );
      }
      const now = after.some((value) => value.id === candidate.id);
      if (now === present) return { ...base, observed: now, status: "reconciled" };
      return {
        ...base,
        observed: now,
        status: "needs_attention",
        reason: mutationError === undefined ? "membership_unverified" : reasonFor(mutationError)
      };
    } catch (error) {
      // Ownership/inventory failures stop the affected team; user-specific lookup/access failures do not.
      if (
        error instanceof SnapshotError ||
        (error instanceof TeamError &&
          [
            "team_identity_changed",
            "ambiguous_team_metadata",
            "duplicate_managed_team_identity",
            "team_hierarchy_unsupported"
          ].includes(error.reason))
      )
        throw error;
      return { ...base, observed, status: "needs_attention", reason: reasonFor(error) };
    }
  }

  private blocked(
    desired: DesiredTeamMembership,
    error: unknown,
    teamId?: number,
    faculty: readonly FacultyTeamOutcome[] = []
  ): ManagedTeamOutcome {
    const existing = new Set(faculty.map((value) => value.githubUserId));
    return Object.freeze({
      identity: desired.identity,
      ...(teamId === undefined ? {} : { teamId }),
      status: "needs_attention",
      reason: reasonFor(error),
      ...(error instanceof TeamError && error.conflictingTeamIds
        ? { conflictingTeamIds: error.conflictingTeamIds }
        : {}),
      faculty: Object.freeze([
        ...faculty,
        ...desired.githubUserIds
          .filter((id) => !existing.has(id))
          .map(
            (id): FacultyTeamOutcome =>
              Object.freeze({
                githubUserId: id,
                desired: true,
                observed: null,
                status: "needs_attention",
                reason: reasonFor(error)
              })
          )
      ])
    });
  }

  private async reconcileTeam(
    desired: DesiredTeamMembership,
    session: Session,
    access: readonly FacultyOrganizationAccess[],
    signal: AbortSignal
  ): Promise<ManagedTeamOutcome> {
    let teamId: number | undefined;
    const faculty: FacultyTeamOutcome[] = [];
    try {
      const { observed, created } = await this.ensureTeam(desired, session, signal);
      teamId = observed.team.id;
      const members = await this.snapshot(desired.identity, teamId, session, signal);
      const wanted = new Set(desired.githubUserIds);
      const candidates = [
        ...desired.githubUserIds.map((id) => ({ id, login: "" })),
        ...members.filter((value) => !wanted.has(value.id))
      ];
      for (const candidate of candidates) {
        try {
          faculty.push(
            Object.freeze(
              await this.reconcileFaculty(
                desired,
                teamId,
                candidate,
                wanted.has(candidate.id),
                session,
                access,
                signal
              )
            )
          );
        } catch (error) {
          faculty.push(
            Object.freeze({
              githubUserId: candidate.id,
              desired: wanted.has(candidate.id),
              observed: null,
              status: "needs_attention",
              reason: reasonFor(error)
            })
          );
          throw error;
        }
      }
      const finalMembers = await this.snapshot(desired.identity, teamId, session, signal);
      const finalIds = new Set(finalMembers.map((value) => value.id));
      for (let index = 0; index < faculty.length; index += 1) {
        const outcome = faculty[index];
        if (!outcome) continue;
        const observedNow = finalIds.has(outcome.githubUserId);
        faculty[index] = Object.freeze({
          ...outcome,
          observed: observedNow,
          ...(["up_to_date", "reconciled"].includes(outcome.status) &&
          observedNow !== outcome.desired
            ? { status: "needs_attention" as const, reason: "membership_unverified" as const }
            : {})
        });
      }
      const reported = new Set(faculty.map((value) => value.githubUserId));
      for (const extra of finalMembers.filter(
        (value) => !wanted.has(value.id) && !reported.has(value.id)
      )) {
        faculty.push(
          Object.freeze({
            githubUserId: extra.id,
            desired: false,
            observed: true,
            status: "needs_attention",
            reason: "membership_unverified"
          })
        );
      }
      const status = faculty.some((value) => value.status === "needs_attention")
        ? "needs_attention"
        : faculty.some((value) => value.status === "pending_organization_access")
          ? "pending_organization_access"
          : created || faculty.some((value) => value.status === "reconciled")
            ? "reconciled"
            : "up_to_date";
      return Object.freeze({
        identity: desired.identity,
        teamId,
        status,
        faculty: Object.freeze(faculty)
      });
    } catch (error) {
      return this.blocked(desired, error, teamId, faculty);
    }
  }

  private async run(signal: AbortSignal): Promise<readonly ManagedTeamOutcome[]> {
    try {
      const session = await this.session(signal);
      // Finish the complete inventory before allowing creation or membership writes anywhere.
      const inventory = await this.inventory(session, signal);
      const access = await this.organizationAccess.inspect(signal);
      const results: ManagedTeamOutcome[] = [];
      for (const desired of this.desired) {
        try {
          this.select(desired.identity, inventory);
        } catch (error) {
          results.push(this.blocked(desired, error));
          continue;
        }
        results.push(await this.reconcileTeam(desired, session, access, signal));
      }
      return Object.freeze(results);
    } catch (error) {
      return Object.freeze(this.desired.map((desired) => this.blocked(desired, error)));
    }
  }
}
