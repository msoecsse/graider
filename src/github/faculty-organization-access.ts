import type { RawCourseConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema } from "../config/config-schemas.js";
import { FacultyDirectory, type FacultyDirectoryRecord } from "../faculty/faculty-directory.js";
import type {
  GitHubFacultyOrganizationClient,
  GitHubOrganizationResponse
} from "./github-client.js";
import { GitHubClientError, type GitHubErrorKind } from "./github-errors.js";
import { isGithubUsername } from "../roster/roster-validation.js";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_RATE_LIMITED = 429;
const HTTP_SERVER_ERROR = 500;
const PAGE_SIZE = 100;
const TIMEOUT_MS = 30_000;

export type FacultyOrganizationAttentionReason =
  | GitHubErrorKind
  | "identity_mismatch"
  | "account_lookup_failed"
  | "session_mismatch"
  | "unknown_faculty"
  | "insufficient_scope"
  | "sso_required"
  | "oauth_approval_required"
  | "authorization_required"
  | "unexpected_response"
  | "unresolved_invitation"
  | "invitation_journal_unavailable"
  | "invitation_unverified";

export type FacultyOrganizationState =
  | { readonly state: "active" }
  | { readonly state: "pending_invitation"; readonly invitationId: number }
  | { readonly state: "invitation_required" }
  | { readonly state: "needs_attention"; readonly reason: FacultyOrganizationAttentionReason };

export type FacultyOrganizationAccess = FacultyOrganizationState & {
  readonly githubUserId: number;
  readonly courseRepositoryId: number;
  readonly organization: string;
};

interface ObservedUser {
  readonly id: number;
  readonly login: string;
}
interface ObservedInvitation {
  readonly id: number;
  readonly userId: number;
  readonly role: string;
}
export interface FacultyOrganizationInventory {
  readonly organization: string;
  readonly members: readonly ObservedUser[];
  readonly invitations: readonly ObservedInvitation[];
  readonly unresolvedInvitations: boolean;
}

/** Set<string> works for tests; production can supply asynchronous durable storage. */
export interface FacultyInvitationJournal {
  has(key: string): boolean | Promise<boolean>;
  add(key: string): unknown;
  delete(key: string): unknown;
}

class AccessError extends Error {
  constructor(readonly reason: FacultyOrganizationAttentionReason) {
    super(reason);
  }
}
const fail = (reason: FacultyOrganizationAttentionReason): never => {
  throw new AccessError(reason);
};
const record = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return fail("unexpected_response");
  return input as Record<string, unknown>;
};
const positiveId = (input: unknown): input is number =>
  typeof input === "number" && Number.isSafeInteger(input) && input > 0;
const user = (input: unknown): ObservedUser => {
  const value = record(input);
  if (
    !positiveId(value.id) ||
    typeof value.login !== "string" ||
    !isGithubUsername(value.login.toLowerCase())
  )
    return fail("unexpected_response");
  return Object.freeze({ id: value.id, login: value.login });
};

/** Same status/header evidence conventions as Phase 2 organization discovery. No raw provider text escapes. */
export const requireOrganizationResponse = (
  response: GitHubOrganizationResponse,
  expected = HTTP_OK
): void => {
  const headers = new Headers(response.headers);
  const body =
    response.data && typeof response.data === "object"
      ? (response.data as Record<string, unknown>)
      : {};
  const message = typeof body.message === "string" ? body.message : "";
  if (response.status === HTTP_UNAUTHORIZED) return fail("auth_failed");
  if (
    response.status === HTTP_RATE_LIMITED ||
    headers.get("x-ratelimit-remaining") === "0" ||
    headers.has("retry-after") ||
    /secondary rate limit|API rate limit exceeded/i.test(message)
  )
    return fail("rate_limited");
  if (/^required\b/i.test(headers.get("x-github-sso") ?? "")) return fail("sso_required");
  if (
    /OAuth (App|application).*restric|third.party.*(restric|approv)|organization.*OAuth.*(restric|approv)/i.test(
      message
    )
  )
    return fail("oauth_approval_required");
  if (response.status === HTTP_FORBIDDEN) return fail("permission_denied");
  if (response.status === HTTP_NOT_FOUND) return fail("authorization_required");
  if (response.status >= HTTP_SERVER_ERROR) return fail("network_error");
  if (response.status !== expected) return fail("unexpected_response");
};

const reasonFor = (error: unknown): FacultyOrganizationAttentionReason => {
  if (error instanceof AccessError) return error.reason;
  if (error instanceof GitHubClientError) return error.kind;
  return "network_error";
};

/** Pure classification. Directory identity remains authoritative; access grants no modeled course role. */
export const classifyFacultyOrganizationAccess = (
  faculty: FacultyDirectoryRecord,
  resolvedUser: { readonly id?: number; readonly username: string } | null,
  inventory: FacultyOrganizationInventory,
  selectedOrganization: string
): FacultyOrganizationState => {
  if (inventory.organization.toLowerCase() !== selectedOrganization.toLowerCase())
    return { state: "needs_attention", reason: "identity_mismatch" };
  if (!resolvedUser) return { state: "needs_attention", reason: "account_lookup_failed" };
  if (!positiveId(resolvedUser.id) || !isGithubUsername(resolvedUser.username.toLowerCase()))
    return { state: "needs_attention", reason: "unexpected_response" };
  if (resolvedUser.id !== faculty.github_user_id)
    return { state: "needs_attention", reason: "identity_mismatch" };
  if (
    inventory.members.some(
      (member) =>
        member.login.toLowerCase() === resolvedUser.username.toLowerCase() &&
        member.id !== faculty.github_user_id
    )
  )
    return { state: "needs_attention", reason: "identity_mismatch" };
  if (inventory.members.some((member) => member.id === faculty.github_user_id))
    return { state: "active" };
  const invitations = inventory.invitations.filter(
    (invitation) => invitation.userId === faculty.github_user_id
  );
  if (
    invitations.length > 1 ||
    invitations.some((invitation) => !["direct_member", "admin"].includes(invitation.role))
  )
    return { state: "needs_attention", reason: "unresolved_invitation" };
  if (invitations[0]) return { state: "pending_invitation", invitationId: invitations[0].id };
  if (inventory.unresolvedInvitations)
    return { state: "needs_attention", reason: "unresolved_invitation" };
  return { state: "invitation_required" };
};

/**
 * Backend-only, one instance per selected authenticated session/course. The trusted
 * caller must supply canonical repository ID, validated metadata read from that
 * repository, and its organization, and enforce course mutation authorization.
 * Never construct from renderer-provided course/org/account fields. Invalidate on
 * account/session/course changes. No production/IPC entry point exists in Slice 7.2.
 */
export class FacultyOrganizationReconciler {
  private readonly course: RawCourseConfigV2;
  private readonly directory: FacultyDirectory;
  private readonly organization: string;
  private readonly repositoryId: number;
  private readonly accountId: number;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly client: GitHubFacultyOrganizationClient,
    context: {
      readonly course: RawCourseConfigV2;
      readonly courseRepositoryId: number;
      readonly authenticatedUserId: number;
    },
    /** Retain across service recreation. Production wiring must provide durable storage for unresolved writes. */
    private readonly uncertainInvitations: FacultyInvitationJournal
  ) {
    this.course = rawCourseConfigV2Schema.parse(context.course);
    if (!positiveId(context.courseRepositoryId) || !positiveId(context.authenticatedUserId))
      throw new Error("Invalid selected course/account identity.");
    this.repositoryId = context.courseRepositoryId;
    this.accountId = context.authenticatedUserId;
    this.organization = this.course.github.organization;
    this.directory = new FacultyDirectory(this.course);
  }

  private result(id: number, state: FacultyOrganizationState): FacultyOrganizationAccess {
    return Object.freeze({
      githubUserId: id,
      courseRepositoryId: this.repositoryId,
      organization: this.organization,
      ...state
    });
  }

  private async journal<T>(operation: () => T | Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      return fail("invitation_journal_unavailable");
    }
  }

  private async session(signal: AbortSignal): Promise<GitHubOrganizationResponse> {
    const response = await this.client.getOrganizationScopeResponse(signal);
    requireOrganizationResponse(response);
    if (user(response.data).id !== this.accountId) return fail("session_mismatch");
    const membership = await this.client.getOrganizationMembership(this.organization, signal);
    requireOrganizationResponse(membership);
    const value = record(membership.data);
    const org = record(value.organization);
    if (value.user !== undefined && user(value.user).id !== this.accountId)
      return fail("session_mismatch");
    if (
      typeof org.login !== "string" ||
      org.login.toLowerCase() !== this.organization.toLowerCase() ||
      value.state !== "active" ||
      !["admin", "member"].includes(String(value.role))
    )
      return fail("authorization_required");
    return { ...response, data: value };
  }

  private async pages(
    read: (page: number) => Promise<GitHubOrganizationResponse>
  ): Promise<unknown[]> {
    const values: unknown[] = [];
    const pageLimit = 1000;
    for (let page = 1; page <= pageLimit; page += 1) {
      const response = await read(page);
      requireOrganizationResponse(response);
      if (!Array.isArray(response.data)) return fail("unexpected_response");
      values.push(...(response.data as unknown[]));
      // Continue on a full page even when a proxy omits Link; never follow a supplied URL.
      if (
        response.data.length < PAGE_SIZE &&
        !/rel="next"/.test(new Headers(response.headers).get("link") ?? "")
      )
        return values;
    }
    return fail("unexpected_response");
  }

  private async inventory(signal: AbortSignal): Promise<FacultyOrganizationInventory> {
    const members = (
      await this.pages((page) =>
        this.client.listOrganizationMembersPage(this.organization, page, PAGE_SIZE, signal)
      )
    ).map(user);
    const pending = await this.pages((page) =>
      this.client.listPendingOrganizationInvitationsPage(this.organization, page, PAGE_SIZE, signal)
    );
    const invitations: ObservedInvitation[] = [];
    let unresolvedInvitations = false;
    const seen = new Map<number, string>();
    for (const input of pending) {
      const value = record(input);
      if (!positiveId(value.id) || typeof value.role !== "string")
        return fail("unexpected_response");
      const claim = JSON.stringify([value.login, value.role, value.invitee_id]);
      if (seen.has(value.id)) {
        if (seen.get(value.id) !== claim) return fail("identity_mismatch");
        continue;
      }
      seen.set(value.id, claim);
      // Invitation ID is NOT invitee user ID. Email-only invitations cannot be safely matched.
      if (value.login === null) {
        unresolvedInvitations = true;
        continue;
      }
      if (typeof value.login !== "string" || !value.login) return fail("unexpected_response");
      const resolved = await this.client.getUser(value.login);
      if (!resolved || !positiveId(resolved.id)) {
        unresolvedInvitations = true;
        continue;
      }
      if (value.invitee_id !== undefined && value.invitee_id !== resolved.id)
        return fail("identity_mismatch");
      invitations.push(Object.freeze({ id: value.id, userId: resolved.id, role: value.role }));
    }
    return Object.freeze({
      organization: this.organization,
      members: Object.freeze(members),
      invitations: Object.freeze(invitations),
      unresolvedInvitations
    });
  }

  /** Reads fresh inventory once, classifying identities independently. Never sends invitations. */
  async inspect(
    signal = AbortSignal.timeout(TIMEOUT_MS)
  ): Promise<readonly FacultyOrganizationAccess[]> {
    try {
      await this.session(signal);
      const inventory = await this.inventory(signal);
      const results: FacultyOrganizationAccess[] = [];
      for (const faculty of this.course.faculty_directory) {
        try {
          results.push(
            this.result(
              faculty.github_user_id,
              classifyFacultyOrganizationAccess(
                faculty,
                await this.client.getUser(faculty.github_login),
                inventory,
                this.organization
              )
            )
          );
        } catch (error) {
          results.push(
            this.result(faculty.github_user_id, {
              state: "needs_attention",
              reason: reasonFor(error)
            })
          );
        }
      }
      return Object.freeze(results);
    } catch (error) {
      return Object.freeze(
        this.course.faculty_directory.map((faculty) =>
          this.result(faculty.github_user_id, {
            state: "needs_attention",
            reason: reasonFor(error)
          })
        )
      );
    }
  }

  /** Only immutable faculty ID is accepted. Organization/account/course cannot be overridden. */
  reconcile(
    githubUserId: number,
    signal = AbortSignal.timeout(TIMEOUT_MS)
  ): Promise<FacultyOrganizationAccess> {
    const operation = this.queue.then(() => this.reconcileOne(githubUserId, signal));
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async reconcileOne(id: number, signal: AbortSignal): Promise<FacultyOrganizationAccess> {
    const faculty = this.directory.resolveByGithubUserId(id);
    if (!faculty) return this.result(id, { state: "needs_attention", reason: "unknown_faculty" });
    const key = `${String(this.accountId)}:${String(this.repositoryId)}:${this.organization.toLowerCase()}:${String(id)}`;
    try {
      const session = await this.session(signal);
      const observe = async (): Promise<FacultyOrganizationState> =>
        classifyFacultyOrganizationAccess(
          faculty,
          await this.client.getUser(faculty.github_login),
          await this.inventory(signal),
          this.organization
        );
      const before = await observe();
      if (before.state !== "invitation_required") {
        if (before.state === "active" || before.state === "pending_invitation")
          await this.journal(() => this.uncertainInvitations.delete(key));
        return this.result(id, before);
      }
      if (await this.journal(() => this.uncertainInvitations.has(key)))
        return this.result(id, { state: "needs_attention", reason: "invitation_unverified" });
      const scopes = new Headers(session.headers).get("x-oauth-scopes");
      if (
        scopes !== null &&
        !scopes.split(/[ ,]+/).some((scope) => ["write:org", "admin:org"].includes(scope))
      )
        return fail("insufficient_scope");
      if (record(session.data).role !== "admin") return fail("permission_denied");
      // Mark before sending. A later read, never another POST, resolves uncertainty.
      await this.journal(() => this.uncertainInvitations.add(key));
      let mutationError: FacultyOrganizationAttentionReason | undefined;
      let mutationResponse: GitHubOrganizationResponse | undefined;
      try {
        mutationResponse = await this.client.createOrganizationInvitation(
          this.organization,
          id,
          signal
        );
        requireOrganizationResponse(mutationResponse, HTTP_CREATED);
      } catch (error) {
        mutationError = reasonFor(error);
        // Only explicit rejected HTTP responses establish that GitHub did not accept a write.
        if (
          mutationResponse &&
          [HTTP_UNAUTHORIZED, HTTP_FORBIDDEN, HTTP_NOT_FOUND, HTTP_RATE_LIMITED].includes(
            mutationResponse.status
          )
        )
          await this.journal(() => this.uncertainInvitations.delete(key));
      }
      // Refresh session as well as observable state; a cancelled transport gets a bounded recovery read.
      const recoverySignal = signal.aborted ? AbortSignal.timeout(TIMEOUT_MS) : signal;
      try {
        await this.session(recoverySignal);
        const after = classifyFacultyOrganizationAccess(
          faculty,
          await this.client.getUser(faculty.github_login),
          await this.inventory(recoverySignal),
          this.organization
        );
        if (after.state === "active" || after.state === "pending_invitation") {
          await this.journal(() => this.uncertainInvitations.delete(key));
          return this.result(id, after);
        }
        if (after.state === "needs_attention") return this.result(id, after);
      } catch (error) {
        return this.result(id, {
          state: "needs_attention",
          reason: mutationError ?? reasonFor(error)
        });
      }
      return this.result(id, {
        state: "needs_attention",
        reason: mutationError ?? "invitation_unverified"
      });
    } catch (error) {
      return this.result(id, { state: "needs_attention", reason: reasonFor(error) });
    }
  }
}
