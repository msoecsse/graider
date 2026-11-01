import { describe, expect, it, vi } from "vitest";
import { ManagedTeamMembershipReconciler } from "../../../src/github/managed-team-reconciliation.js";
import { FacultyOrganizationReconciler } from "../../../src/github/faculty-organization-access.js";
import { SectionFaculty } from "../../../src/faculty/section-faculty.js";
import { renderManagedTeamMetadata } from "../../../src/github/managed-team-identity.js";
import {
  OPERATIONAL_COURSE_SCHEMA_VERSION,
  OPERATIONAL_TERM_SCHEMA_VERSION
} from "../../../src/config/config-schemas.js";
import {
  fixture,
  course,
  term,
  users,
  org,
  FACULTY,
  FORMER,
  COORDINATOR,
  OUTSIDER,
  OTHER_REPOSITORY_ID,
  HTTP_CREATED,
  HTTP_FORBIDDEN,
  PAGE_SIZE,
  response
} from "./team-membership-fixtures.js";

describe("verified managed team membership reconciliation", () => {
  it("adds active desired faculty, removes extras only from managed teams, and reruns without writes", async () => {
    const f = fixture();
    const { team } = f.target("section-current-faculty", "001");
    f.client.members.set(
      team.id,
      users.filter((value) => value.id === OUTSIDER)
    );
    const outcomes = await f.service.reconcile();
    expect(
      outcomes.every((value) => value.status === "reconciled" || value.status === "up_to_date")
    ).toBe(true);
    expect(f.client.members.get(team.id)?.map((value) => value.id)).toEqual([FACULTY]);
    expect(f.client.membershipWrites).toContainEqual({
      organizationId: f.client.organizationId,
      teamId: team.id,
      username: "outsider",
      present: false
    });
    const count = f.client.membershipWrites.length;
    expect((await f.service.reconcile()).every((value) => value.status === "up_to_date")).toBe(
      true
    );
    expect(f.client.membershipWrites).toHaveLength(count);
    expect(f.client.teamsCreated).toHaveLength(0);
    expect(f.client.invitationsCreated).toHaveLength(0);
    expect(f.client.mutations.teamPermissions).toEqual([]);
    expect(OPERATIONAL_COURSE_SCHEMA_VERSION).toBe(1);
    expect(OPERATIONAL_TERM_SCHEMA_VERSION).toBe(1);
  });

  it("performs no mutation when membership is already correct", async () => {
    const f = fixture();
    f.seedCorrect();
    expect((await f.service.reconcile()).every((value) => value.status === "up_to_date")).toBe(
      true
    );
    expect(f.client.membershipWrites).toEqual([]);
  });

  it.each(["pending_invitation", "invitation_required", "needs_attention"] as const)(
    "does not mutate desired faculty with %s access",
    async (state) => {
      const f = fixture();
      f.access.inspect.mockResolvedValue(
        f.accesses.map((value) =>
          value.githubUserId === FACULTY
            ? {
                ...value,
                ...(state === "pending_invitation"
                  ? { state, invitationId: 1 }
                  : state === "needs_attention"
                    ? { state, reason: "sso_required" as const }
                    : { state })
              }
            : value
        )
      );
      const outcomes = await f.service.reconcile();
      const target = outcomes.find(
        (value) =>
          value.identity.kind === "section-current-faculty" &&
          "sectionId" in value.identity &&
          value.identity.sectionId === "001"
      );
      expect(target?.faculty).toContainEqual(
        expect.objectContaining({
          githubUserId: FACULTY,
          status: state === "needs_attention" ? "needs_attention" : "pending_organization_access"
        })
      );
      expect(
        f.client.membershipWrites.every((value) => value.username !== `faculty-${String(FACULTY)}`)
      ).toBe(true);
      expect(
        f.client.membershipWrites.some(
          (value) => value.username === `faculty-${String(COORDINATOR)}`
        )
      ).toBe(true);
      expect(f.client.invitationsCreated).toEqual([]);
    }
  );

  it("consumes the actual 7.2 read service and preserves pending metadata roles", async () => {
    const f = fixture();
    f.client.organizationMembers.set(
      org,
      users.filter((value) => value.id !== FACULTY)
    );
    f.client.organizationInvitations.set(org, [
      { id: 1, login: `faculty-${String(FACULTY)}`, role: "direct_member" }
    ]);
    const access = new FacultyOrganizationReconciler(f.client, f.context, new Set());
    const service = new ManagedTeamMembershipReconciler(f.client, f.context, access, new Set());
    const before = structuredClone({ course, term });
    expect(
      (await service.reconcile()).some((value) => value.status === "pending_organization_access")
    ).toBe(true);
    expect(
      f.client.membershipWrites.every((value) => value.username !== `faculty-${String(FACULTY)}`)
    ).toBe(true);
    expect({ course, term }).toEqual(before);
    expect(new SectionFaculty(course, term, "001").isCurrentFaculty(FACULTY)).toBe(true);
  });

  it("allows active faculty and extra-member removal beside a pending faculty identity", async () => {
    const extended = structuredClone(term);
    const section = extended.sections[0];
    if (!section) throw new Error("Section required.");
    section.faculty.current.push({ github_user_id: COORDINATOR });
    const f = fixture([extended]);
    f.access.inspect.mockResolvedValue(
      f.accesses.map((value) =>
        value.githubUserId === FACULTY
          ? { ...value, state: "pending_invitation", invitationId: 1 }
          : value
      )
    );
    const { team } = f.target("section-current-faculty", "001");
    f.client.members.set(
      team.id,
      users.filter((value) => value.id === OUTSIDER)
    );
    const result = (await f.service.reconcile()).find((value) => value.teamId === team.id);
    expect(result?.status).toBe("pending_organization_access");
    expect(f.client.members.get(team.id)?.map((value) => value.id)).toEqual([COORDINATOR]);
  });

  it("current → former → restored current moves section and strongest course-wide membership", async () => {
    const f = fixture();
    await f.service.reconcile();
    const former = new SectionFaculty(course, term, "001").removeCurrentFaculty(FACULTY);
    const service = new ManagedTeamMembershipReconciler(
      f.client,
      { ...f.context, terms: [former] },
      f.access,
      f.journal
    );
    await service.reconcile();
    expect(
      f.client.members
        .get(f.target("section-current-faculty", "001").team.id)
        ?.some((value) => value.id === FACULTY)
    ).toBe(false);
    expect(
      f.client.members
        .get(f.target("section-former-faculty", "001").team.id)
        ?.some((value) => value.id === FACULTY)
    ).toBe(true);
    expect(
      f.client.members.get(f.target("course-write").team.id)?.some((value) => value.id === FACULTY)
    ).toBe(false);
    expect(
      f.client.members.get(f.target("course-read").team.id)?.some((value) => value.id === FACULTY)
    ).toBe(true);
    const restored = new SectionFaculty(course, former, "001").restoreFormerFaculty(FACULTY);
    await new ManagedTeamMembershipReconciler(
      f.client,
      { ...f.context, terms: [restored] },
      f.access,
      f.journal
    ).reconcile();
    expect(
      f.client.members.get(f.target("course-write").team.id)?.some((value) => value.id === FACULTY)
    ).toBe(true);
    expect(
      f.client.members.get(f.target("course-read").team.id)?.some((value) => value.id === FACULTY)
    ).toBe(false);
  });

  it("uses a verified renamed login with stable ID and never historical/institutional fallback", async () => {
    const f = fixture();
    const lookup = f.client.getUser.bind(f.client);
    const calls = vi
      .spyOn(f.client, "getUser")
      .mockImplementation((login) =>
        login === `faculty-${String(FACULTY)}` || login === "renamed-faculty"
          ? Promise.resolve({ id: FACULTY, username: "renamed-faculty" })
          : lookup(login)
      );
    await f.service.reconcile();
    expect(f.client.membershipWrites.some((value) => value.username === "renamed-faculty")).toBe(
      true
    );
    expect(
      calls.mock.calls.every(
        ([login]) => !login.startsWith("institution-") && !login.startsWith("historical-")
      )
    ).toBe(true);
  });

  it("recycled login fails closed independently of another faculty", async () => {
    const f = fixture();
    const lookup = f.client.getUser.bind(f.client);
    vi.spyOn(f.client, "getUser").mockImplementation((login) =>
      login === `faculty-${String(FACULTY)}`
        ? Promise.resolve({ id: OUTSIDER, username: login })
        : lookup(login)
    );
    const results = await f.service.reconcile();
    expect(results.flatMap((value) => value.faculty)).toContainEqual(
      expect.objectContaining({ githubUserId: FACULTY, reason: "identity_mismatch" })
    );
    expect(
      f.client.membershipWrites.every((value) => value.username !== `faculty-${String(FACULTY)}`)
    ).toBe(true);
    expect(
      f.client.membershipWrites.some((value) => value.username === `faculty-${String(FORMER)}`)
    ).toBe(true);
  });

  it.each(["add", "remove"])(
    "recovers an ambiguous %s by rereading immutable member IDs",
    async (action) => {
      const f = fixture();
      const { team } = f.target("section-current-faculty", "001");
      if (action === "remove") {
        f.seedCorrect();
        f.client.members.get(team.id)?.push({ id: OUTSIDER, username: "outsider" });
      }
      const write = f.client.setManagedTeamMembership.bind(f.client);
      const spy = vi
        .spyOn(f.client, "setManagedTeamMembership")
        .mockImplementation(async (...args) => {
          const result = await write(...args);
          if (args[1] === team.id) throw new Error("lost response after write");
          return result;
        });
      const result = (await f.service.reconcile()).find((value) => value.teamId === team.id);
      expect(result?.status).toBe("reconciled");
      const count = spy.mock.calls.length;
      await f.service.reconcile();
      expect(spy).toHaveBeenCalledTimes(count);
    }
  );

  it("unobserved membership mutation is never reported as success", async () => {
    const f = fixture();
    vi.spyOn(f.client, "setManagedTeamMembership").mockResolvedValue(response({ state: "active" }));
    expect((await f.service.reconcile()).flatMap((value) => value.faculty)).toContainEqual(
      expect.objectContaining({
        status: "needs_attention",
        reason: "membership_unverified",
        observed: false
      })
    );
  });

  it("final verification reports drift that appeared after the initial candidate inventory", async () => {
    const f = fixture();
    const { team } = f.target("section-current-faculty", "001");
    const write = f.client.setManagedTeamMembership.bind(f.client);
    vi.spyOn(f.client, "setManagedTeamMembership").mockImplementation(async (...args) => {
      const result = await write(...args);
      if (args[1] === team.id)
        f.client.members.get(team.id)?.push({ id: OUTSIDER, username: "outsider" });
      return result;
    });
    const result = (await f.service.reconcile()).find((value) => value.teamId === team.id);
    expect(result?.status).toBe("needs_attention");
    expect(result?.faculty).toContainEqual(
      expect.objectContaining({
        githubUserId: OUTSIDER,
        desired: false,
        observed: true,
        reason: "membership_unverified"
      })
    );
  });

  it("a failed post-mutation session verification reports unknown membership and stops the team", async () => {
    const f = fixture();
    const { team } = f.target("section-current-faculty", "001");
    const write = f.client.setManagedTeamMembership.bind(f.client);
    vi.spyOn(f.client, "setManagedTeamMembership").mockImplementation(async (...args) => {
      const result = await write(...args);
      if (args[1] === team.id) f.client.accountId += 1;
      return result;
    });
    const result = (await f.service.reconcile()).find((value) => value.teamId === team.id);
    expect(result).toMatchObject({ status: "needs_attention", reason: "session_mismatch" });
    expect(result?.faculty).toContainEqual(
      expect.objectContaining({ githubUserId: FACULTY, observed: null, status: "needs_attention" })
    );
  });
});

describe("managed team ownership and inventory barriers", () => {
  it("stops writes for a team when a later preflight membership read fails", async () => {
    const extended = structuredClone(term);
    const section = extended.sections[0];
    if (!section) throw new Error("Section required.");
    section.faculty.current.push({ github_user_id: COORDINATOR });
    const f = fixture([extended]);
    const { team } = f.target("section-current-faculty", "001");
    let reads = 0;
    const read = f.client.listManagedTeamMembersPage.bind(f.client);
    vi.spyOn(f.client, "listManagedTeamMembersPage").mockImplementation(
      (organizationId, teamId, page, perPage) => {
        if (teamId === team.id) {
          reads += 1;
          if (reads === 3) return Promise.reject(new Error("connection lost during preflight"));
        }
        return read(organizationId, teamId, page, perPage);
      }
    );
    expect((await f.service.reconcile()).find((value) => value.teamId === team.id)?.status).toBe(
      "needs_attention"
    );
    expect(f.client.membershipWrites.every((value) => value.teamId !== team.id)).toBe(true);
  });

  it("detects a new duplicate claim between the initial inventory and mutation", async () => {
    const f = fixture();
    const { team } = f.target("section-current-faculty", "001");
    const get = f.client.getManagedTeam.bind(f.client);
    let injected = false;
    vi.spyOn(f.client, "getManagedTeam").mockImplementation((organizationId, teamId) => {
      if (teamId === team.id && !injected) {
        injected = true;
        f.client.organizationTeams.push({ ...team, id: OUTSIDER, slug: "new-duplicate" });
      }
      return get(organizationId, teamId);
    });
    const result = (await f.service.reconcile()).find((value) => value.teamId === team.id);
    expect(result?.reason).toBe("duplicate_managed_team_identity");
    expect(f.client.membershipWrites.every((value) => value.teamId !== team.id)).toBe(true);
  });

  it("does not remove an extra member using a recycled login", async () => {
    const f = fixture();
    f.seedCorrect();
    const { team } = f.target("course-write");
    f.client.members.get(team.id)?.push({ id: OUTSIDER, username: "outsider" });
    const lookup = f.client.getUser.bind(f.client);
    vi.spyOn(f.client, "getUser").mockImplementation((login) =>
      login === "outsider" ? Promise.resolve({ id: FACULTY, username: "outsider" }) : lookup(login)
    );
    const result = (await f.service.reconcile()).find((value) => value.teamId === team.id);
    expect(result?.faculty).toContainEqual(
      expect.objectContaining({ githubUserId: OUTSIDER, reason: "identity_mismatch" })
    );
    expect(f.client.membershipWrites).toEqual([]);
  });

  it("refreshes organization access before adding rather than trusting stale Active state", async () => {
    const f = fixture();
    f.access.inspect
      .mockResolvedValueOnce(f.accesses)
      .mockResolvedValue(
        f.accesses.map((value) => ({ ...value, state: "pending_invitation", invitationId: 1 }))
      );
    expect(
      (await f.service.reconcile()).some((value) => value.status === "pending_organization_access")
    ).toBe(true);
    expect(f.client.membershipWrites).toEqual([]);
  });

  it.each(["account", "organization", "scope", "visibility"])(
    "fails safely on %s boundary/capability change",
    async (boundary) => {
      const f = fixture();
      if (boundary === "account") f.client.accountId += 1;
      if (boundary === "organization")
        vi.spyOn(f.client, "getOrganizationMembership").mockResolvedValue(
          response({
            state: "active",
            role: "admin",
            organization: { id: f.client.organizationId, login: "other-org" }
          })
        );
      if (boundary === "scope") f.client.scopes = "read:org repo";
      if (boundary === "visibility") f.client.role = "member";
      expect(
        (await f.service.reconcile()).every(
          (value) => value.status === "needs_attention" || value.status === "up_to_date"
        )
      ).toBe(true);
      expect(f.client.membershipWrites).toEqual([]);
      expect(f.client.teamsCreated).toEqual([]);
    }
  );
  it("blocks a duplicate logical identity, reports every resource, and reconciles independent teams", async () => {
    const f = fixture();
    const { team } = f.target("section-current-faculty", "001");
    f.client.organizationTeams.push({
      ...team,
      id: OUTSIDER,
      slug: "duplicate",
      name: "Duplicate"
    });
    const result = (await f.service.reconcile()).find(
      (value) =>
        value.identity.kind === "section-current-faculty" &&
        "sectionId" in value.identity &&
        value.identity.sectionId === "001"
    );
    expect(result).toMatchObject({
      status: "needs_attention",
      reason: "duplicate_managed_team_identity",
      conflictingTeamIds: [team.id, OUTSIDER]
    });
    expect(
      f.client.membershipWrites.every(
        (value) => value.teamId !== team.id && value.teamId !== OUTSIDER
      )
    ).toBe(true);
    expect(f.client.membershipWrites.length).toBeGreaterThan(0);
  });

  it("never modifies other-course, unmanaged, legacy faculty or historical grader teams", async () => {
    const f = fixture();
    const { team, desired } = f.target("course-write");
    const descriptions = [
      renderManagedTeamMetadata({ ...desired.identity, courseRepositoryId: OTHER_REPOSITORY_ID }),
      null,
      null,
      null
    ];
    const names = [team.name, "unrelated", "faculty", "graders"];
    const foreignIds = descriptions.map((description, index) => {
      const id = OUTSIDER + index;
      f.client.organizationTeams.push({
        id,
        org,
        name: names[index] ?? "faculty",
        slug: `foreign-${String(index)}`,
        description
      });
      f.client.members.set(id, users);
      return id;
    });
    await f.service.reconcile();
    expect(f.client.membershipWrites.every((value) => !foreignIds.includes(value.teamId))).toBe(
      true
    );
    for (const id of foreignIds) expect(f.client.members.get(id)).toEqual(users);
  });

  it.each(["graider-team:v2:{}", "contains graider-team: broken"])(
    "blocks opaque ownership ambiguity %s without adopting it",
    async (description) => {
      const f = fixture();
      f.client.organizationTeams.push({
        id: OUTSIDER,
        org,
        name: "opaque",
        slug: "opaque",
        description
      });
      expect(
        (await f.service.reconcile()).every((value) => value.reason === "ambiguous_team_metadata")
      ).toBe(true);
      expect(f.client.membershipWrites).toEqual([]);
      expect(f.client.teamsCreated).toEqual([]);
    }
  );

  it("paginates complete team and member inventories before mutation", async () => {
    const f = fixture();
    f.seedCorrect();
    const { team } = f.target("course-write");
    const additional = Array.from({ length: PAGE_SIZE }, (_, index) => ({
      id: OUTSIDER + index,
      org,
      name: `other-${String(index)}`,
      slug: `other-${String(index)}`,
      description: null
    }));
    f.client.organizationTeams.push(...additional);
    const list = vi.spyOn(f.client, "listManagedOrganizationTeamsPage");
    const memberRead = vi.spyOn(f.client, "listManagedTeamMembersPage");
    f.client.members.set(
      team.id,
      Array.from({ length: PAGE_SIZE + 1 }, (_, index) => ({
        id: OUTSIDER + index,
        username: `extra-${String(index)}`
      }))
    );
    // Extra-account lookup fails independently, preserving the complete observed inventory.
    await f.service.reconcile();
    expect(list.mock.calls.some((call) => call[1] === 2)).toBe(true);
    expect(memberRead.mock.calls.some((call) => call[2] === 2)).toBe(true);
  });

  it("incomplete inventory blocks every write", async () => {
    const f = fixture();
    vi.spyOn(f.client, "listManagedOrganizationTeamsPage").mockResolvedValue(
      response({}, HTTP_FORBIDDEN)
    );
    expect((await f.service.reconcile()).every((value) => value.status === "needs_attention")).toBe(
      true
    );
    expect(f.client.membershipWrites).toEqual([]);
    expect(f.client.teamsCreated).toEqual([]);
  });

  it("unreadable membership blocks the affected team", async () => {
    const f = fixture();
    const { team } = f.target("section-current-faculty", "001");
    const read = f.client.listManagedTeamMembersPage.bind(f.client);
    vi.spyOn(f.client, "listManagedTeamMembersPage").mockImplementation(
      (organizationId, teamId, page, perPage) =>
        teamId === team.id
          ? Promise.resolve(response({}, HTTP_FORBIDDEN))
          : read(organizationId, teamId, page, perPage)
    );
    expect((await f.service.reconcile()).find((value) => value.teamId === team.id)?.status).toBe(
      "needs_attention"
    );
    expect(f.client.membershipWrites.every((value) => value.teamId !== team.id)).toBe(true);
  });

  it("a numeric team resource mismatch cannot redirect a membership write", async () => {
    const f = fixture();
    const { team } = f.target("section-current-faculty", "001");
    const read = f.client.getManagedTeam.bind(f.client);
    vi.spyOn(f.client, "getManagedTeam").mockImplementation(async (organizationId, teamId) => {
      const result = await read(organizationId, teamId);
      return teamId === team.id
        ? { ...result, data: { ...(result.data as object), id: OUTSIDER } }
        : result;
    });
    expect((await f.service.reconcile()).find((value) => value.teamId === team.id)?.reason).toBe(
      "team_identity_changed"
    );
    expect(f.client.membershipWrites.every((value) => value.teamId !== team.id)).toBe(true);
  });

  it("existing renamed team names/slugs do not change numeric resource authority", async () => {
    const f = fixture();
    const { team } = f.target("course-write");
    team.name = "Human readable renamed team";
    team.slug = "completely-renamed";
    await f.service.reconcile();
    expect(f.client.membershipWrites.some((value) => value.teamId === team.id)).toBe(true);
    expect(f.client.teamsCreated).toEqual([]);
  });

  it("nested team inheritance is not reconciled as direct membership", async () => {
    const f = fixture();
    const { team } = f.target("course-write");
    f.client.organizationTeams.push({
      id: OUTSIDER,
      org,
      name: "child",
      slug: "child",
      description: null,
      parentId: team.id
    });
    expect(
      (await f.service.reconcile()).find((value) => value.identity.kind === "course-write")?.reason
    ).toBe("team_hierarchy_unsupported");
    expect(f.client.membershipWrites.every((value) => value.teamId !== team.id)).toBe(true);
  });

  it("rejects organization-access results bound to another course", async () => {
    const f = fixture();
    f.access.inspect.mockResolvedValue(
      f.accesses.map((value) => ({ ...value, courseRepositoryId: OTHER_REPOSITORY_ID }))
    );
    expect(
      (await f.service.reconcile())
        .flatMap((value) => value.faculty)
        .every((value) => value.reason === "incomplete_organization_access")
    ).toBe(true);
    expect(f.client.membershipWrites).toEqual([]);
  });
});

describe("safe missing managed-team creation", () => {
  it("awaits journal durability before creation and does not send if journaling fails", async () => {
    const f = fixture();
    const { team } = f.target("course-write");
    f.client.organizationTeams.splice(f.client.organizationTeams.indexOf(team), 1);
    let recorded = false;
    const journal = {
      has: () => false,
      add: async () => {
        await Promise.resolve();
        recorded = true;
      },
      delete: () => undefined
    };
    const create = f.client.createManagedTeam.bind(f.client);
    vi.spyOn(f.client, "createManagedTeam").mockImplementation((...args) => {
      expect(recorded).toBe(true);
      return create(...args);
    });
    const service = new ManagedTeamMembershipReconciler(f.client, f.context, f.access, journal);
    expect(
      (await service.reconcile()).find((value) => value.identity.kind === "course-write")?.status
    ).toBe("reconciled");
    const added = f.client.organizationTeams.find(
      (value) => value.description === team.description
    );
    if (!added) throw new Error("Created team required.");
    f.client.organizationTeams.splice(f.client.organizationTeams.indexOf(added), 1);
    const unavailable = { ...journal, add: () => Promise.reject(new Error("disk unavailable")) };
    const blocked = new ManagedTeamMembershipReconciler(f.client, f.context, f.access, unavailable);
    expect(
      (await blocked.reconcile()).find((value) => value.identity.kind === "course-write")?.reason
    ).toBe("team_journal_unavailable");
    expect(f.client.teamsCreated).toHaveLength(1);
  });

  it("retains uncertain creation across account changes and scrubs provider error bodies", async () => {
    const f = fixture();
    const { team } = f.target("course-write");
    f.client.organizationTeams.splice(f.client.organizationTeams.indexOf(team), 1);
    const create = vi
      .spyOn(f.client, "createManagedTeam")
      .mockRejectedValue(new Error("secret_token provider body"));
    const result = await f.service.reconcile();
    expect(JSON.stringify(result)).not.toContain("secret_token");
    f.client.accountId += 1;
    const service = new ManagedTeamMembershipReconciler(
      f.client,
      { ...f.context, authenticatedUserId: f.client.accountId },
      f.access,
      f.journal
    );
    expect(
      (await service.reconcile()).find((value) => value.identity.kind === "course-write")?.reason
    ).toBe("team_creation_unverified");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("creates the canonical metadata marker and verifies numeric resource before membership", async () => {
    const f = fixture();
    const { team, desired } = f.target("course-write");
    f.client.organizationTeams.splice(f.client.organizationTeams.indexOf(team), 1);
    const get = vi.spyOn(f.client, "getManagedTeam");
    await f.service.reconcile();
    const created = f.client.teamsCreated[0];
    expect(created?.description).toBe(renderManagedTeamMetadata(desired.identity));
    expect(get.mock.calls.some((call) => call[1] === created?.id)).toBe(true);
    expect(f.client.membershipWrites.some((value) => value.teamId === created?.id)).toBe(true);
    await f.service.reconcile();
    expect(f.client.teamsCreated).toHaveLength(1);
  });

  it("recovers ambiguous creation by recognizing exactly one matching remote team", async () => {
    const f = fixture();
    const { team } = f.target("course-write");
    f.client.organizationTeams.splice(f.client.organizationTeams.indexOf(team), 1);
    const create = f.client.createManagedTeam.bind(f.client);
    vi.spyOn(f.client, "createManagedTeam").mockImplementation(async (...args) => {
      await create(...args);
      throw new Error("response lost");
    });
    const result = (await f.service.reconcile()).find(
      (value) => value.identity.kind === "course-write"
    );
    expect(result?.status).toBe("reconciled");
    await f.service.reconcile();
    expect(f.client.teamsCreated).toHaveLength(1);
  });

  it.each(["transport", "unobserved_success"])(
    "journals %s creation and forbids automatic repetition after service recreation",
    async (kind) => {
      const f = fixture();
      const { team } = f.target("course-write");
      f.client.organizationTeams.splice(f.client.organizationTeams.indexOf(team), 1);
      const create = vi.spyOn(f.client, "createManagedTeam");
      if (kind === "transport") create.mockRejectedValue(new Error("response lost"));
      else create.mockResolvedValue(response({}, HTTP_CREATED));
      expect(
        (await f.service.reconcile()).find((value) => value.identity.kind === "course-write")
          ?.status
      ).toBe("needs_attention");
      const recreated = new ManagedTeamMembershipReconciler(
        f.client,
        f.context,
        f.access,
        f.journal
      );
      expect(
        (await recreated.reconcile()).find((value) => value.identity.kind === "course-write")
          ?.reason
      ).toBe("team_creation_unverified");
      expect(create).toHaveBeenCalledTimes(1);
    }
  );

  it("never adopts a colliding unmanaged display name", async () => {
    const f = fixture();
    const { team } = f.target("course-write");
    team.description = null;
    expect(
      (await f.service.reconcile()).find((value) => value.identity.kind === "course-write")?.reason
    ).toBe("team_name_conflict");
    expect(f.client.teamsCreated).toEqual([]);
    expect(f.client.membershipWrites.every((value) => value.teamId !== team.id)).toBe(true);
  });

  it("multiple claims observed after ambiguous creation do not select a winner", async () => {
    const f = fixture();
    const { team } = f.target("course-write");
    f.client.organizationTeams.splice(f.client.organizationTeams.indexOf(team), 1);
    vi.spyOn(f.client, "createManagedTeam").mockImplementation(() => {
      f.client.organizationTeams.push(team, { ...team, id: OUTSIDER, slug: "duplicate" });
      return Promise.reject(new Error("lost response"));
    });
    expect(
      (await f.service.reconcile()).find((value) => value.identity.kind === "course-write")?.reason
    ).toBe("duplicate_managed_team_identity");
    expect(
      f.client.membershipWrites.every(
        (value) => value.teamId !== team.id && value.teamId !== OUTSIDER
      )
    ).toBe(true);
  });
});
