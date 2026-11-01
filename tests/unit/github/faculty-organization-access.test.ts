import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it, vi } from "vitest";
import {
  rawCourseConfigV2Schema,
  rawTermConfigV2Schema,
  OPERATIONAL_COURSE_SCHEMA_VERSION,
  OPERATIONAL_TERM_SCHEMA_VERSION
} from "../../../src/config/config-schemas.js";
import { FacultyDirectory } from "../../../src/faculty/faculty-directory.js";
import { TermCoordinators } from "../../../src/faculty/term-coordinators.js";
import { SectionFaculty } from "../../../src/faculty/section-faculty.js";
import { AuthorizationResolver } from "../../../src/faculty/authorization-resolver.js";
import { FakeFacultyOrganizationClient } from "../../../src/github/fake-faculty-organization-client.js";
import {
  FacultyOrganizationReconciler,
  classifyFacultyOrganizationAccess
} from "../../../src/github/faculty-organization-access.js";
import { GitHubClientError } from "../../../src/github/github-errors.js";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_ACCEPTED = 202;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_RATE_LIMITED = 429;
const HTTP_UNAVAILABLE = 503;
const OTHER_USER_ID = 999;

const course = rawCourseConfigV2Schema.parse(
  parse(readFileSync("tests/fixtures/config/schema-v2-course.yml", "utf8"))
);
const term = rawTermConfigV2Schema.parse(
  parse(readFileSync("tests/fixtures/config/schema-v2-term.yml", "utf8"))
);
const [first, second] = course.faculty_directory;
if (!first || !second) throw new Error("Two faculty fixtures required.");
const org = course.github.organization;
const identity = { id: first.github_user_id, username: first.github_login };
const pending = { id: 77, login: first.github_login, role: "direct_member" };
const response = (data: unknown, status = HTTP_OK, headers = {}) => ({ status, headers, data });
const fixture = (ledger = new Set<string>()) => {
  const client = new FakeFacultyOrganizationClient(
    course.faculty_directory.map((faculty) => ({
      id: faculty.github_user_id,
      username: faculty.github_login
    }))
  );
  const service = new FacultyOrganizationReconciler(
    client,
    { course, courseRepositoryId: 123, authenticatedUserId: client.accountId },
    ledger
  );
  return { client, service, ledger };
};

describe("faculty organization access classification", () => {
  it.each(["active", "pending_invitation", "invitation_required"] as const)(
    "classifies %s using immutable ID",
    async (state) => {
      const { client, service } = fixture();
      if (state === "active") client.organizationMembers.set(org, [identity]);
      if (state === "pending_invitation") client.organizationInvitations.set(org, [pending]);
      expect((await service.inspect())[0]).toMatchObject({
        state,
        githubUserId: first.github_user_id,
        courseRepositoryId: 123,
        organization: org
      });
      expect(client.invitationsCreated).toEqual([]);
    }
  );

  it("recognizes a renamed login by ID without rewriting metadata", async () => {
    const { client, service } = fixture();
    vi.spyOn(client, "getUser").mockResolvedValue({
      id: first.github_user_id,
      username: "renamed-login"
    });
    client.organizationMembers.set(org, [{ id: first.github_user_id, username: "renamed-login" }]);
    expect(await service.reconcile(first.github_user_id)).toMatchObject({ state: "active" });
    expect(first.github_login).toBe("Current-Login");
  });

  it("fails closed on a recycled login even when an inventory contains the intended ID", async () => {
    const { client, service } = fixture();
    vi.spyOn(client, "getUser").mockResolvedValue({
      id: OTHER_USER_ID,
      username: first.github_login
    });
    client.organizationMembers.set(org, [identity]);
    expect(await service.reconcile(first.github_user_id)).toMatchObject({
      state: "needs_attention",
      reason: "identity_mismatch"
    });
    expect(client.invitationsCreated).toHaveLength(0);
  });

  it("never falls back to institutional username or historical login", async () => {
    const { client, service } = fixture();
    const lookup = vi.spyOn(client, "getUser").mockResolvedValue(null);
    expect(await service.reconcile(first.github_user_id)).toMatchObject({
      state: "needs_attention",
      reason: "account_lookup_failed"
    });
    expect(lookup.mock.calls).toEqual([[first.github_login]]);
    expect(client.invitationsCreated).toHaveLength(0);
  });

  it("does not confuse invitation resource ID with invitee identity", async () => {
    const { client, service } = fixture();
    client.organizationInvitations.set(org, [
      { ...pending, id: first.github_user_id, login: second.github_login }
    ]);
    expect((await service.inspect())[0]?.state).toBe("invitation_required");
    expect((await service.inspect())[1]?.state).toBe("pending_invitation");
  });

  it.each([
    { id: 1, login: null, role: "direct_member" },
    { ...pending, role: "billing_manager" },
    { ...pending, invitee_id: OTHER_USER_ID }
  ])("fails safely on unresolved/conflicting invitation %j", async (invitation) => {
    const { client, service } = fixture();
    vi.spyOn(client, "listPendingOrganizationInvitationsPage").mockResolvedValue(
      response([invitation])
    );
    expect(await service.reconcile(first.github_user_id)).toMatchObject({
      state: "needs_attention"
    });
    expect(client.invitationsCreated).toHaveLength(0);
  });

  it.each([null, {}, [{ login: first.github_login }], [{ id: 0, login: "bad" }]])(
    "rejects malformed member inventory %j",
    async (data) => {
      const { client, service } = fixture();
      vi.spyOn(client, "listOrganizationMembersPage").mockResolvedValue(response(data));
      expect(await service.reconcile(first.github_user_id)).toMatchObject({
        state: "needs_attention",
        reason: "unexpected_response"
      });
    }
  );

  it("reads all member and invitation pages", async () => {
    const { client, service } = fixture();
    client.organizationMembers.set(org, [
      ...Array.from({ length: 100 }, (_, index) => ({
        id: index + 1,
        username: `user-${String(index)}`
      })),
      identity
    ]);
    const members = vi.spyOn(client, "listOrganizationMembersPage");
    const invites = vi.spyOn(client, "listPendingOrganizationInvitationsPage");
    client.organizationInvitations.set(
      org,
      Array.from({ length: 100 }, (_, index) => ({
        ...pending,
        id: index + 1,
        login: second.github_login
      }))
    );
    expect((await service.inspect())[0]?.state).toBe("active");
    expect(members.mock.calls.map((call) => call[1])).toEqual([1, 2]);
    expect(invites.mock.calls.map((call) => call[1])).toEqual([1, 2]);
  });

  it("continues classifying other faculty after an individual lookup fails", async () => {
    const { client, service } = fixture();
    vi.spyOn(client, "getUser").mockRejectedValueOnce(
      new GitHubClientError("network_error", "offline")
    );
    expect((await service.inspect()).map((value) => value.state)).toEqual([
      "needs_attention",
      "invitation_required"
    ]);
  });
});

describe("faculty organization invitation reconciliation", () => {
  it("does not send when recording a durable attempt fails", async () => {
    const { client } = fixture();
    const journal = {
      has: () => false,
      add: () => Promise.reject(new Error("disk unavailable")),
      delete: () => undefined
    };
    const service = new FacultyOrganizationReconciler(
      client,
      { course, courseRepositoryId: 123, authenticatedUserId: client.accountId },
      journal
    );
    expect(await service.reconcile(first.github_user_id)).toMatchObject({
      state: "needs_attention",
      reason: "invitation_journal_unavailable"
    });
    expect(client.invitationsCreated).toHaveLength(0);
  });
  it("awaits the journal before sending an invitation", async () => {
    const { client } = fixture();
    let recorded = false;
    const ledger = new Set<string>();
    const journal = {
      has: (key: string) => ledger.has(key),
      add: async (key: string) => {
        await Promise.resolve();
        ledger.add(key);
        recorded = true;
      },
      delete: (key: string) => ledger.delete(key)
    };
    const write = client.createOrganizationInvitation.bind(client);
    vi.spyOn(client, "createOrganizationInvitation").mockImplementation((organization, id) => {
      expect(recorded).toBe(true);
      return write(organization, id);
    });
    const service = new FacultyOrganizationReconciler(
      client,
      { course, courseRepositoryId: 123, authenticatedUserId: client.accountId },
      journal
    );
    expect((await service.reconcile(first.github_user_id)).state).toBe("pending_invitation");
  });

  it("retains uncertainty when a successful write exhausts the rate limit", async () => {
    const { client, service, ledger } = fixture();
    const write = vi
      .spyOn(client, "createOrganizationInvitation")
      .mockResolvedValue(response({}, HTTP_CREATED, { "x-ratelimit-remaining": "0" }));
    expect((await service.reconcile(first.github_user_id)).state).toBe("needs_attention");
    expect(ledger.size).toBe(1);
    expect((await service.reconcile(first.github_user_id)).state).toBe("needs_attention");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("rejects conflicting duplicate invitation resources", async () => {
    const { client, service } = fixture();
    client.organizationInvitations.set(org, [pending, { ...pending, login: second.github_login }]);
    expect(await service.reconcile(first.github_user_id)).toMatchObject({
      state: "needs_attention",
      reason: "identity_mismatch"
    });
    expect(client.invitationsCreated).toHaveLength(0);
  });

  it("rejects malformed user lookup results", async () => {
    const { client, service } = fixture();
    vi.spyOn(client, "getUser").mockResolvedValue({ username: "" });
    expect(await service.reconcile(first.github_user_id)).toMatchObject({
      state: "needs_attention",
      reason: "unexpected_response"
    });
    expect(client.invitationsCreated).toHaveLength(0);
  });
  it.each(["active", "pending_invitation"])("leaves %s unchanged", async (state) => {
    const { client, service } = fixture();
    if (state === "active") client.organizationMembers.set(org, [identity]);
    else client.organizationInvitations.set(org, [pending]);
    expect((await service.reconcile(first.github_user_id)).state).toBe(state);
    expect(client.invitationsCreated).toEqual([]);
  });

  it("invites exactly once by immutable ID, verifies pending, and serializes concurrent retries", async () => {
    const { client, service } = fixture();
    const reads = vi.spyOn(client, "listPendingOrganizationInvitationsPage");
    const outcomes = await Promise.all([
      service.reconcile(first.github_user_id),
      service.reconcile(first.github_user_id)
    ]);
    expect(outcomes.map((value) => value.state)).toEqual([
      "pending_invitation",
      "pending_invitation"
    ]);
    expect(client.invitationsCreated).toEqual([
      { organization: org, githubUserId: first.github_user_id }
    ]);
    expect(reads).toHaveBeenCalledTimes(3);
  });

  it("detects later acceptance without another invitation", async () => {
    const { client, service } = fixture();
    await service.reconcile(first.github_user_id);
    client.organizationInvitations.set(org, []);
    client.organizationMembers.set(org, [identity]);
    expect((await service.reconcile(first.github_user_id)).state).toBe("active");
    expect(client.invitationsCreated).toHaveLength(1);
  });

  it("observes immediate active membership after mutation", async () => {
    const { client, service } = fixture();
    vi.spyOn(client, "createOrganizationInvitation").mockImplementation(() => {
      client.organizationMembers.set(org, [identity]);
      return Promise.resolve(response({}, HTTP_CREATED));
    });
    expect((await service.reconcile(first.github_user_id)).state).toBe("active");
  });

  it.each(["active", "pending_invitation"])(
    "recovers a lost mutation response by observing %s",
    async (state) => {
      const { client, service } = fixture();
      const write = vi.spyOn(client, "createOrganizationInvitation").mockImplementation(() => {
        if (state === "active") client.organizationMembers.set(org, [identity]);
        else client.organizationInvitations.set(org, [pending]);
        return Promise.reject(
          new GitHubClientError("network_error", "connection lost after write")
        );
      });
      expect((await service.reconcile(first.github_user_id)).state).toBe(state);
      expect((await service.reconcile(first.github_user_id)).state).toBe(state);
      expect(write).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["transport", "unobservable_success"])(
    "never repeats an unresolved %s write, including service recreation",
    async (failure) => {
      const { client, service, ledger } = fixture();
      const write = vi.spyOn(client, "createOrganizationInvitation");
      if (failure === "transport")
        write.mockRejectedValue(new GitHubClientError("network_error", "offline"));
      else write.mockResolvedValue(response({}, HTTP_CREATED));
      expect((await service.reconcile(first.github_user_id)).state).toBe("needs_attention");
      const recreated = new FacultyOrganizationReconciler(
        client,
        { course, courseRepositoryId: 123, authenticatedUserId: client.accountId },
        ledger
      );
      expect(await recreated.reconcile(first.github_user_id)).toMatchObject({
        state: "needs_attention",
        reason: "invitation_unverified"
      });
      expect(write).toHaveBeenCalledTimes(1);
      client.organizationInvitations.set(org, [pending]);
      expect((await recreated.reconcile(first.github_user_id)).state).toBe("pending_invitation");
    }
  );

  it("keeps another faculty identity independent after a failed invitation", async () => {
    const { client, service } = fixture();
    vi.spyOn(client, "createOrganizationInvitation").mockRejectedValueOnce(
      new GitHubClientError("network_error", "offline")
    );
    expect((await service.reconcile(first.github_user_id)).state).toBe("needs_attention");
    expect((await service.reconcile(second.github_user_id)).state).toBe("pending_invitation");
  });
});

describe("trusted course, account and organization boundaries", () => {
  it("ignores membership and invitations in other organizations", async () => {
    const { client, service } = fixture();
    client.organizationMembers.set("other-org", [identity]);
    client.organizationInvitations.set("other-org", [pending]);
    expect((await service.reconcile(first.github_user_id)).state).toBe("pending_invitation");
    expect(client.invitationsCreated[0]?.organization).toBe(org);
  });

  it("pure classification rejects cross-organization inventory", () => {
    const faculty = new FacultyDirectory(course).resolveByGithubUserId(first.github_user_id);
    if (!faculty) throw new Error("Faculty fixture missing.");
    expect(
      classifyFacultyOrganizationAccess(
        faculty,
        identity,
        {
          organization: "other",
          members: [{ id: identity.id, login: identity.username }],
          invitations: [],
          unresolvedInvitations: false
        },
        org
      )
    ).toEqual({ state: "needs_attention", reason: "identity_mismatch" });
  });

  it("snapshots trusted context and accepts only a faculty ID in the operation", async () => {
    const input = structuredClone(course);
    const { client } = fixture();
    const service = new FacultyOrganizationReconciler(
      client,
      { course: input, courseRepositoryId: 123, authenticatedUserId: client.accountId },
      new Set()
    );
    input.github.organization = "attacker-org";
    const target = input.faculty_directory[0];
    if (!target) throw new Error("Faculty fixture missing.");
    target.github_user_id = OTHER_USER_ID;
    expect((await service.reconcile(first.github_user_id)).state).toBe("pending_invitation");
    expect(client.invitationsCreated).toEqual([
      { organization: org, githubUserId: first.github_user_id }
    ]);
    expect(await service.reconcile(OTHER_USER_ID)).toMatchObject({
      state: "needs_attention",
      reason: "unknown_faculty"
    });
  });

  it("fails closed after account switching", async () => {
    const { client, service } = fixture();
    client.accountId += 1;
    expect(await service.reconcile(first.github_user_id)).toMatchObject({
      state: "needs_attention",
      reason: "session_mismatch"
    });
    expect(client.invitationsCreated).toHaveLength(0);
  });
});

describe("GitHub capability and failure classification", () => {
  it("permits membership write scope without acquiring broader OAuth access", async () => {
    const { client, service } = fixture();
    client.scopes = "write:org";
    expect((await service.reconcile(first.github_user_id)).state).toBe("pending_invitation");
  });

  it.each([
    [HTTP_FORBIDDEN, { "x-github-sso": "required" }, {}, "sso_required"],
    [
      HTTP_FORBIDDEN,
      {},
      { message: "OAuth application restricted by organization" },
      "oauth_approval_required"
    ],
    [HTTP_RATE_LIMITED, {}, {}, "rate_limited"]
  ])("preserves write restriction %s %j", async (status, headers, data, reason) => {
    const { client, service } = fixture();
    vi.spyOn(client, "createOrganizationInvitation").mockResolvedValue(
      response(data, status, headers)
    );
    expect(await service.reconcile(first.github_user_id)).toMatchObject({
      state: "needs_attention",
      reason
    });
  });
  it.each([
    [HTTP_FORBIDDEN, {}, {}, "permission_denied"],
    [HTTP_FORBIDDEN, { "x-github-sso": "required; url=https://github.com" }, {}, "sso_required"],
    [
      HTTP_FORBIDDEN,
      {},
      { message: "OAuth App access restricted by organization" },
      "oauth_approval_required"
    ],
    [HTTP_RATE_LIMITED, {}, {}, "rate_limited"],
    [HTTP_FORBIDDEN, { "x-ratelimit-remaining": "0" }, {}, "rate_limited"],
    [HTTP_UNAUTHORIZED, {}, {}, "auth_failed"],
    [HTTP_NOT_FOUND, {}, {}, "authorization_required"],
    [HTTP_UNAVAILABLE, {}, {}, "network_error"],
    [HTTP_ACCEPTED, {}, {}, "unexpected_response"]
  ])("preserves read failure %s %j", async (status, headers, data, reason) => {
    const { client, service } = fixture();
    vi.spyOn(client, "listOrganizationMembersPage").mockResolvedValue(
      response(data, status, headers)
    );
    expect(await service.reconcile(first.github_user_id)).toMatchObject({
      state: "needs_attention",
      reason
    });
    expect(client.invitationsCreated).toHaveLength(0);
  });

  it("reports network failure without provider error text", async () => {
    const { client, service } = fixture();
    vi.spyOn(client, "listPendingOrganizationInvitationsPage").mockRejectedValue(
      new Error("secret_token")
    );
    const result = await service.reconcile(first.github_user_id);
    expect(result).toMatchObject({ state: "needs_attention", reason: "network_error" });
    expect(JSON.stringify(result)).not.toContain("secret_token");
  });

  it("read:org allows inspection but cannot invite; an active identity still requires no write privilege", async () => {
    const { client, service } = fixture();
    client.scopes = "repo, read:org";
    expect((await service.inspect())[0]?.state).toBe("invitation_required");
    expect(await service.reconcile(first.github_user_id)).toMatchObject({
      state: "needs_attention",
      reason: "insufficient_scope"
    });
    client.organizationMembers.set(org, [identity]);
    expect((await service.reconcile(first.github_user_id)).state).toBe("active");
    expect(client.invitationsCreated).toHaveLength(0);
  });

  it("requires organization owner capability", async () => {
    const { client, service } = fixture();
    client.role = "member";
    expect(await service.reconcile(first.github_user_id)).toMatchObject({
      state: "needs_attention",
      reason: "permission_denied"
    });
    expect(client.invitationsCreated).toHaveLength(0);
  });

  it("does not turn a rejected write into pending; recovery after permission repair is possible", async () => {
    const { client, service } = fixture();
    vi.spyOn(client, "createOrganizationInvitation").mockResolvedValueOnce(
      response({}, HTTP_FORBIDDEN)
    );
    expect(await service.reconcile(first.github_user_id)).toMatchObject({
      state: "needs_attention",
      reason: "permission_denied"
    });
    expect((await service.reconcile(first.github_user_id)).state).toBe("pending_invitation");
  });
});

describe("pending external access preserves v2 intent and v1 production gates", () => {
  it("does not infer course authorization from active organization access", async () => {
    const directoryOnly = {
      institutional_username: "unassigned",
      github_user_id: OTHER_USER_ID,
      github_login: "unassigned-login",
      github_login_history: []
    };
    const extendedCourse = {
      ...course,
      faculty_directory: [...course.faculty_directory, directoryOnly]
    };
    const client = new FakeFacultyOrganizationClient([
      { id: OTHER_USER_ID, username: directoryOnly.github_login }
    ]);
    client.organizationMembers.set(org, [
      { id: OTHER_USER_ID, username: directoryOnly.github_login }
    ]);
    const service = new FacultyOrganizationReconciler(
      client,
      { course: extendedCourse, courseRepositoryId: 123, authenticatedUserId: client.accountId },
      new Set()
    );
    expect((await service.reconcile(OTHER_USER_ID)).state).toBe("active");
    expect(
      new AuthorizationResolver(extendedCourse, term, OTHER_USER_ID).canViewSection("001").allowed
    ).toBe(false);
  });
  it("preserves directory, coordinator and section identities, roles, and metadata validity", async () => {
    const before = structuredClone({ course, term });
    const { client, service } = fixture();
    await service.reconcile(first.github_user_id);
    expect(rawCourseConfigV2Schema.parse(course)).toEqual(before.course);
    expect(rawTermConfigV2Schema.parse(term)).toEqual(before.term);
    expect(new FacultyDirectory(course).resolveByGithubUserId(first.github_user_id)).toEqual(first);
    expect(new TermCoordinators(course, term).isCurrentCoordinator(first.github_user_id)).toBe(
      true
    );
    expect(new SectionFaculty(course, term, "001").isCurrentFaculty(first.github_user_id)).toBe(
      true
    );
    expect(
      new AuthorizationResolver(course, term, first.github_user_id).canViewSection("001").allowed
    ).toBe(true);
    expect(client.mutations.teamPermissions).toEqual([]);
    expect(client.mutations.addedCollaborators).toEqual([]);
    expect(OPERATIONAL_COURSE_SCHEMA_VERSION).toBe(1);
    expect(OPERATIONAL_TERM_SCHEMA_VERSION).toBe(1);
  });
});
