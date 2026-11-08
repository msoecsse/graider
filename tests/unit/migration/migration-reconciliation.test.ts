import { describe, expect, it, vi } from "vitest";
import {
  reconciliationFixture,
  PUBLICATION,
  INTENDED,
  addLegacyGrant,
  LEGACY_TEAM_ID
} from "./migration-reconciliation-fixtures.js";
import {
  course,
  term,
  secondTerm,
  FALLBACK,
  COORDINATOR,
  FACULTY,
  FORMER,
  DIRECTORY_ONLY
} from "../github/team-membership-fixtures.js";
import {
  reconcilePublishedMigration,
  verifyPublishedMigrationAccess
} from "../../../src/migration/migration-reconciliation.js";
import {
  createReconciliationRecord,
  canRecoverMigration,
  reconciliationValue
} from "../../../src/migration/migration-reconciliation-state.js";
const OUTSIDER = 99999;
const STUDENT_REPOSITORY = 9002;
const UNRELATED_REPOSITORY = 9003;

describe("durable published migration composition", () => {
  it("independently rechecks external access and refuses drift without mutating GitHub or the shared audit", async () => {
    const f = reconciliationFixture();
    expect((await f.run()).status).toBe("ready");
    const audit = structuredClone(f.snapshot.record);
    const writes = f.writes.length;
    const permissions = f.client.teamPermissionWrites.length;
    const check = () =>
      verifyPublishedMigrationAccess({
        store: f.store,
        client: f.client,
        authenticatedUserId: f.client.accountId
      });
    expect((await check()).status).toBe("ready");
    f.client.repositoryGrants.get(f.course.course.repository_id)?.clear();
    expect((await check()).status).toBe("needs_attention");
    expect(f.client.teamPermissionWrites).toHaveLength(permissions);
    expect(f.writes).toHaveLength(writes);
    expect(f.snapshot.record).toEqual(audit);
  });
  it("reconciles access, teams, permissions and branch policy while retaining deferred history and audit after Ready", async () => {
    const f = reconciliationFixture();
    const result = await f.run();
    expect(result.status).toBe("ready");
    expect(result.published).toBe(true);
    expect(result.studentFacingReady).toBe(true);
    expect(f.snapshot.record?.binding.publication).toBe(PUBLICATION);
    expect(f.snapshot.record?.binding.source).toBe(f.snapshot.source);
    expect(f.snapshot.record?.history.length).toBeGreaterThan(0);
    expect(f.snapshot.metadata).toEqual(f.metadata);
    expect(f.metadata.deferred_work.length).toBeGreaterThan(0);
    const creates = f.client.teamsCreated.length;
    const permissions = f.client.teamPermissionWrites.length;
    const memberships = f.client.membershipWrites.length;
    const audit = structuredClone(f.snapshot.record);
    // A fresh service instance/machine uses only the shared authoritative store.
    expect(
      (
        await reconcilePublishedMigration({
          store: f.store,
          client: f.client,
          authenticatedUserId: f.client.accountId
        })
      ).status
    ).toBe("ready");
    expect(f.client.teamsCreated).toHaveLength(creates);
    expect(f.client.teamPermissionWrites).toHaveLength(permissions);
    expect(f.client.membershipWrites).toHaveLength(memberships);
    expect(f.snapshot.record).toEqual(audit);
  });

  it("reports pending required access without publication rollback and resumes after acceptance", async () => {
    const f = reconciliationFixture();
    f.client.organizationMembers.set(f.course.github.organization, []);
    expect((await f.run()).status).toBe("needs_attention");
    expect(f.client.invitationsCreated.length).toBeGreaterThan(0);
    const count = f.client.invitationsCreated.length;
    expect((await f.run()).studentFacingReady).toBe(false);
    expect(f.client.invitationsCreated).toHaveLength(count);
    f.client.organizationMembers.set(
      f.course.github.organization,
      f.course.faculty_directory.map((p) => ({ id: p.github_user_id, username: p.github_login }))
    );
    expect((await f.run()).status).toBe("ready");
    expect(f.snapshot.record?.history.some((entry) => entry.status === "needs_attention")).toBe(
      true
    );
    expect(f.snapshot.publication).toBe(PUBLICATION);
  });

  it("retains unknown team creations across restart and does not create again on absent observations", async () => {
    const f = reconciliationFixture();
    const create = vi
      .spyOn(f.client, "createManagedTeam")
      .mockRejectedValue(new Error("lost secret response"));
    const first = await f.run();
    expect(first.status).toBe("needs_attention");
    const count = create.mock.calls.length;
    expect(count).toBeGreaterThan(0);
    expect(f.snapshot.record?.guards.length).toBeGreaterThan(0);
    expect((await f.run()).status).toBe("needs_attention");
    expect(create).toHaveBeenCalledTimes(count);
    expect(JSON.stringify(f.snapshot.record)).not.toContain("secret response");
  });

  it("recovers accepted-but-lost team and branch creation from remote observation without duplicates", async () => {
    const f = reconciliationFixture();
    const create = f.client.createManagedTeam.bind(f.client);
    vi.spyOn(f.client, "createManagedTeam").mockImplementation(async (...args) => {
      await create(...args);
      throw new Error("lost response");
    });
    const branch = f.client.createManagedBranchRule.bind(f.client);
    vi.spyOn(f.client, "createManagedBranchRule").mockImplementation(async (...args) => {
      await branch(...args);
      throw new Error("lost response");
    });
    expect((await f.run()).status).toBe("ready");
    const count = f.client.teamsCreated.length;
    expect((await f.run()).status).toBe("ready");
    expect(f.client.teamsCreated).toHaveLength(count);
    expect(f.client.creations).toHaveLength(1);
    expect(f.snapshot.record?.guards).toEqual([]);
  });

  it("resolves durable team guards when a later run can finally observe accepted creations", async () => {
    const f = reconciliationFixture();
    const inventory = vi
      .spyOn(f.client, "listManagedOrganizationTeamsPage")
      .mockResolvedValue({ status: 200, headers: {}, data: [] });
    expect((await f.run()).status).toBe("needs_attention");
    const creates = f.client.teamsCreated.length;
    expect(creates).toBeGreaterThan(0);
    expect(f.snapshot.record?.guards.length).toBeGreaterThan(0);
    inventory.mockRestore();
    expect((await f.run()).status).toBe("ready");
    expect(f.snapshot.record?.guards).toEqual([]);
    expect(f.client.teamsCreated).toHaveLength(creates);
  });

  it("preserves independent completed work when branch verification fails", async () => {
    const f = reconciliationFixture();
    const branch = vi
      .spyOn(f.client, "getManagedBranchRulesPage")
      .mockRejectedValue(new Error("unavailable"));
    expect((await f.run()).status).toBe("needs_attention");
    const count = f.client.teamsCreated.length;
    expect(
      f.snapshot.record?.steps.some(
        (step) => step.step === "course_access" && step.status === "verified"
      )
    ).toBe(true);
    branch.mockRestore();
    expect((await f.run()).status).toBe("ready");
    expect(f.client.teamsCreated).toHaveLength(count);
  });

  it("refuses account invalidation before a GitHub mutation and keeps published v2", async () => {
    const f = reconciliationFixture();
    f.invalidate();
    expect((await f.run()).status).toBe("needs_attention");
    expect(f.client.teamsCreated).toEqual([]);
    expect(f.snapshot.publication).toBe(PUBLICATION);
  });

  it("persists a guard and then refuses account invalidation during the awaited write-ahead publication", async () => {
    const f = reconciliationFixture();
    const publish = f.store.publish.bind(f.store);
    vi.spyOn(f.store, "publish").mockImplementation(async (...args) => {
      const result = await publish(...args);
      if (args[1].guards.length) f.invalidate();
      return result;
    });
    expect((await f.run()).status).toBe("needs_attention");
    expect(f.snapshot.record?.guards.length).toBeGreaterThan(0);
    expect(f.client.teamsCreated).toEqual([]);
  });

  it("does not send a non-idempotent operation when durable journal publication fails", async () => {
    const f = reconciliationFixture();
    vi.spyOn(f.store, "publish").mockRejectedValue(new Error("Storage unavailable"));
    expect((await f.run()).studentFacingReady).toBe(false);
    expect(f.client.teamsCreated).toEqual([]);
    expect(f.client.invitationsCreated).toEqual([]);
    expect(f.client.creations).toEqual([]);
  });

  it("observes a lost invitation response and never duplicates that pending invitation", async () => {
    const f = reconciliationFixture();
    f.client.organizationMembers.clear();
    const invite = f.client.createOrganizationInvitation.bind(f.client);
    vi.spyOn(f.client, "createOrganizationInvitation").mockImplementation(async (...args) => {
      await invite(...args);
      throw new Error("Lost invitation response");
    });
    expect((await f.run()).status).toBe("needs_attention");
    const count = f.client.invitationsCreated.length;
    expect(count).toBeGreaterThan(0);
    expect((await f.run()).status).toBe("needs_attention");
    expect(f.client.invitationsCreated).toHaveLength(count);
  });

  it("establishes and verifies replacements before legacy cleanup while retaining the organization team and members", async () => {
    const f = reconciliationFixture();
    addLegacyGrant(f);
    const write = f.client.setCourseRepositoryTeamPermission.bind(f.client);
    vi.spyOn(f.client, "setCourseRepositoryTeamPermission").mockImplementation(async (...args) => {
      if (args[1] === LEGACY_TEAM_ID && args[4] === "none") {
        expect(
          f.snapshot.record?.steps.find((entry) => entry.step === "course_access")?.status
        ).toBe("verified");
        expect(f.client.membershipWrites.length).toBeGreaterThan(0);
      }
      return write(...args);
    });
    expect((await f.run()).status).toBe("ready");
    expect(f.client.repositoryGrants.get(f.course.course.repository_id)?.has(LEGACY_TEAM_ID)).toBe(
      false
    );
    expect(f.client.organizationTeams.some((team) => team.id === LEGACY_TEAM_ID)).toBe(true);
    expect(f.client.membershipWrites.some((entry) => entry.teamId === LEGACY_TEAM_ID)).toBe(false);
    const count = f.client.teamPermissionWrites.length;
    expect((await f.run()).status).toBe("ready");
    expect(f.client.teamPermissionWrites).toHaveLength(count);
  });

  it("keeps legacy access when required replacement access is pending", async () => {
    const f = reconciliationFixture();
    addLegacyGrant(f);
    f.client.organizationMembers.clear();
    expect((await f.run()).status).toBe("needs_attention");
    expect(f.client.repositoryGrants.get(f.course.course.repository_id)?.get(LEGACY_TEAM_ID)).toBe(
      "push"
    );
    expect(f.client.teamPermissionWrites.some((entry) => entry.teamId === LEGACY_TEAM_ID)).toBe(
      false
    );
  });

  it("reconciles proven student scope and branch policy while leaving unrelated repositories untouched", async () => {
    const f = reconciliationFixture();
    f.client.addPermissionRepository(
      STUDENT_REPOSITORY,
      f.course.github.organization,
      "verified-student"
    );
    f.client.addPermissionRepository(
      UNRELATED_REPOSITORY,
      f.course.github.organization,
      "unrelated"
    );
    f.client.defaultBranches.set(STUDENT_REPOSITORY, "submission");
    f.client.branches.set(STUDENT_REPOSITORY, new Set(["submission"]));
    f.setSnapshot({
      ...f.snapshot,
      targets: [
        {
          courseRepositoryId: f.course.course.repository_id,
          organizationId: f.client.organizationId,
          repositoryId: STUDENT_REPOSITORY,
          termCode: "27s1",
          sectionId: "001",
          sectionIds: ["001"],
          targetId: "student001",
          assignmentSlug: "lab04",
          mode: "individual"
        }
      ]
    });
    expect((await f.run()).status).toBe("ready");
    expect(
      f.client.teamPermissionWrites.some((entry) => entry.repositoryId === STUDENT_REPOSITORY)
    ).toBe(true);
    expect(
      f.client.teamPermissionWrites.some((entry) => entry.repositoryId === UNRELATED_REPOSITORY)
    ).toBe(false);
    expect(
      f.client.creations.some(
        (entry) => entry.repositoryId === STUDENT_REPOSITORY && entry.branch === "submission"
      )
    ).toBe(true);
  });

  it("refuses cross-section group evidence without any student-repository mutation", async () => {
    const f = reconciliationFixture();
    f.client.addPermissionRepository(
      STUDENT_REPOSITORY,
      f.course.github.organization,
      "ambiguous-group"
    );
    f.setSnapshot({
      ...f.snapshot,
      targets: [
        {
          courseRepositoryId: f.course.course.repository_id,
          organizationId: f.client.organizationId,
          repositoryId: STUDENT_REPOSITORY,
          termCode: "27s1",
          sectionId: "001",
          sectionIds: ["001", "002"],
          targetId: "group-one",
          assignmentSlug: "lab04",
          mode: "group"
        }
      ]
    });
    expect((await f.run()).status).toBe("needs_attention");
    expect(
      f.client.teamPermissionWrites.some((entry) => entry.repositoryId === STUDENT_REPOSITORY)
    ).toBe(false);
    expect(f.client.creations.some((entry) => entry.repositoryId === STUDENT_REPOSITORY)).toBe(
      false
    );
  });

  it("refuses an ordinary or unrelated account even with organization owner privileges", async () => {
    const f = reconciliationFixture();
    f.switchAccount(OUTSIDER);
    expect((await f.run()).status).toBe("needs_attention");
    expect(f.writes).toEqual([]);
    expect(f.client.teamsCreated).toEqual([]);
  });

  it("uses fresh authorized recovery identity while retaining the original reviewer solely as audit evidence", async () => {
    const f = reconciliationFixture();
    const original = f.metadata.source.authenticated_github_user_id;
    const replacement = reconciliationValue(
      f.course.faculty_directory.find((faculty) => faculty.github_user_id !== original)
    );
    f.course.fallback_administrator.github_user_id = replacement.github_user_id;
    f.switchAccount(replacement.github_user_id);
    expect((await f.run()).status).toBe("ready");
    expect(f.snapshot.metadata.source.authenticated_github_user_id).toBe(original);
    expect(
      f.snapshot.record?.history.every((event) => event.actor === replacement.github_user_id)
    ).toBe(true);
  });

  it("does not treat safely deferred findings as authority for an unproven student target", async () => {
    const f = reconciliationFixture();
    f.setSnapshot({ ...f.snapshot, targetAttention: ["required_student_scope_unverified"] });
    expect((await f.run()).status).toBe("needs_attention");
    expect(
      f.client.teamPermissionWrites.every(
        (write) => write.repositoryId === f.course.course.repository_id
      )
    ).toBe(true);
  });

  it("keeps Draft and zero-Active courses non-student-ready even after complete access verification", async () => {
    const f = reconciliationFixture();
    reconciliationValue(f.terms[0]).term.status = "draft";
    reconciliationValue(f.terms[0]).term.has_ever_been_active = false;
    expect((await f.run()).studentFacingReady).toBe(false);
  });

  it("binds initial durable audit state to exact source, checkpoint, publication and intended resources", () => {
    const f = reconciliationFixture();
    const record = createReconciliationRecord(f.snapshot);
    expect(record.binding).toMatchObject({
      source: f.snapshot.source,
      checkpoint: f.snapshot.checkpoint,
      publication: PUBLICATION,
      intendedFingerprint: INTENDED,
      repositoryId: f.course.course.repository_id,
      organizationId: f.client.organizationId
    });
    expect(record.guards).toEqual([]);
    expect(record.status).toBe("needs_attention");
  });
});

describe("approved recovery authority", () => {
  it("permits latest-created current coordinators and fallback, excluding older/current, ordinary, former and directory-only roles", () => {
    const selected = structuredClone(course);
    selected.course.term_creation_order = [term.term.code, secondTerm.term.code];
    const terms = [secondTerm, term];
    expect(canRecoverMigration(selected, terms, FALLBACK)).toBe(true);
    expect(canRecoverMigration(selected, terms, FACULTY)).toBe(true);
    for (const id of [COORDINATOR, FORMER, DIRECTORY_ONLY, OUTSIDER])
      expect(canRecoverMigration(selected, terms, id)).toBe(false);
  });
  it("uses explicit creation order and current identities, with fallback independent", () => {
    const f = reconciliationFixture();
    expect(
      canRecoverMigration(f.course, f.terms, f.course.fallback_administrator.github_user_id)
    ).toBe(true);
    expect(canRecoverMigration(f.course, f.terms, OUTSIDER)).toBe(false);
    const term = reconciliationValue(f.terms[0]);
    term.coordinators.former.push(...term.coordinators.current);
    term.coordinators.current = [];
    expect(canRecoverMigration(f.course, f.terms, OUTSIDER)).toBe(false);
  });
  it("permits only fallback with no terms", () => {
    const f = reconciliationFixture();
    f.course.course.term_creation_order = [];
    expect(canRecoverMigration(f.course, [], f.course.fallback_administrator.github_user_id)).toBe(
      true
    );
    expect(canRecoverMigration(f.course, [], OUTSIDER)).toBe(false);
  });
});
