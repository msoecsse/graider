import fs from "node:fs";
import { FakeStudentPermissionClient } from "../../../src/github/fake-student-permission-client.js";
import { planAssignmentMigration } from "../../../src/migration/assignment-migration-planner.js";
import { reviewFixture, completeSubmission } from "./migration-review-fixtures.js";
import { validateMigrationReview } from "../../../src/migration/migration-review-validation.js";
import { describe, expect, it, vi } from "vitest";
import { LegacyGraderReconciler } from "../../../src/migration/legacy-grader-reconciliation.js";
import { FakeCoursePermissionClient } from "../../../src/github/fake-course-permission-client.js";
import { course, term, users, fixture, REPOSITORY_ID } from "../github/team-membership-fixtures.js";
import { renderManagedTeamMetadata } from "../../../src/github/managed-team-identity.js";
import type { GraderRemovalPlanData } from "../../../src/migration/grader-removal-models.js";
import type { PublishedGraderContext } from "../../../src/migration/legacy-grader-reconciliation.js";

const LAST_ITEM = -1;
const LEGACY_ID = 9000;
const OTHER_ID = 9002;
const SHA_LENGTH = 40;
const setup = () => {
  const source = fixture();
  const client = new FakeCoursePermissionClient(users);
  client.organizationTeams.push(
    ...structuredClone(source.client.organizationTeams),
    {
      org: client.repository.owner.login,
      id: LEGACY_ID,
      name: "legacy",
      slug: "graders",
      description: null,
      parentId: null
    },
    {
      org: client.repository.owner.login,
      id: OTHER_ID,
      name: "unrelated",
      slug: "other",
      description: null,
      parentId: null
    }
  );
  client.organizationMembers.set(client.repository.owner.login, [...users]);
  for (const desired of source.plan) {
    const team = client.organizationTeams.find(
      (t) => t.description === renderManagedTeamMetadata(desired.identity)
    );
    if (!team) throw new Error("Missing team");
    client.members.set(
      team.id,
      users.filter((u) => desired.githubUserIds.includes(u.id))
    );
  }
  client.repositoryTeamPermissions.set(LEGACY_ID, "push");
  client.repositoryTeamPermissions.set(OTHER_ID, "pull");
  client.directCollaboratorPermissions.set(course.fallback_administrator.github_user_id, "admin");
  const publishedCourse = structuredClone(course);
  publishedCourse.course.term_creation_order = [term.term.code];
  const state: PublishedGraderContext = {
    courseRepositoryId: REPOSITORY_ID,
    organizationId: client.organizationId,
    authenticatedUserId: client.accountId,
    sessionId: "session",
    authorized: true,
    publishedRevision: "b".repeat(SHA_LENGTH),
    course: publishedCourse,
    terms: [structuredClone(term)],
    targets: []
  };
  const reviewedTerms = [
    {
      termCode: term.term.code,
      currentCoordinatorGithubUserIds: term.coordinators.current.map((f) => f.github_user_id),
      status: term.term.status,
      hasEverBeenActive: term.term.has_ever_been_active,
      sections: term.sections.map((s) => ({
        sectionId: s.id,
        currentFacultyGithubUserIds: s.faculty.current.map((f) => f.github_user_id)
      }))
    }
  ];
  const inventory = {
    kind: "schema-v1-legacy-grader-inventory" as const,
    status: "ready" as const,
    publicationReady: false as const,
    source: {
      repositoryId: REPOSITORY_ID,
      organizationId: client.organizationId,
      sourceCommitSha: "a".repeat(SHA_LENGTH),
      authenticatedGithubUserId: client.accountId,
      reportId: "report",
      repositoryName: client.repository.name,
      organizationLogin: client.repository.owner.login
    },
    runtimeCoverage: "not_applicable" as const,
    evidence: [],
    repositoryEvidence: [],
    candidate: {
      classification: "legacy_candidate" as const,
      organizationId: client.organizationId,
      organizationLogin: client.repository.owner.login,
      slug: "graders",
      teamId: LEGACY_ID,
      membershipComplete: true,
      members: []
    },
    repositories: [
      {
        repositoryId: REPOSITORY_ID,
        owner: client.repository.owner.login,
        name: client.repository.name,
        evidence: [],
        associationsComplete: true,
        associations: [
          {
            teamId: LEGACY_ID,
            slug: "graders",
            permission: "push" as const,
            parentId: null,
            legacyCandidate: true
          }
        ]
      }
    ],
    findings: []
  };
  const replacement = {
    facultyDirectory: course.faculty_directory,
    terms: reviewedTerms,
    fallbackAdministratorGithubUserId: course.fallback_administrator.github_user_id,
    memberDecisions: []
  };
  const plan = {
    kind: "schema-v1-grader-removal-plan",
    status: "ready",
    publicationReady: false,
    source: inventory.source,
    persistedCleanup: {
      courseFields: ["grader_team", "grader_permission"],
      manifestPermissionFields: ["grader_team"],
      desiredAuthorizationRole: "faculty_only"
    },
    facultyTerms: reviewedTerms,
    findings: [],
    reconciliation: {
      phase: "after_publication",
      deleteTeam: false,
      deleteMemberships: false,
      grants: [
        {
          organizationId: client.organizationId,
          teamId: LEGACY_ID,
          repositoryId: REPOSITORY_ID,
          observedPermission: "push",
          requires: "published_v2_and_verified_managed_replacement_access",
          replacement
        }
      ]
    },
    audit: {
      inventory,
      evidence: [],
      accessReview: {
        kind: "schema-v1-grader-access-review",
        status: "complete",
        publicationReady: false,
        inventoryId: "receipt",
        source: inventory.source,
        decisions: [],
        terms: reviewedTerms,
        facultyDirectory: course.faculty_directory,
        missingMemberIds: [],
        errors: []
      },
      assignmentPlan: planAssignmentMigration(
        reviewFixture().analysis,
        validateMigrationReview(reviewFixture(), completeSubmission(reviewFixture()))
      )
    }
  } as GraderRemovalPlanData;
  const readPublished = vi.fn(() => Promise.resolve(structuredClone(state)));
  const organizationAccess: {
    inspect: ReturnType<
      typeof vi.fn<
        import("../../../src/github/faculty-organization-access.js").FacultyOrganizationReconciler["inspect"]
      >
    >;
  } = {
    inspect: vi.fn(() =>
      Promise.resolve(
        course.faculty_directory.map((f) => ({
          githubUserId: f.github_user_id,
          state: "active" as const,
          courseRepositoryId: REPOSITORY_ID,
          organization: client.repository.owner.login
        }))
      )
    )
  };
  const service = () =>
    new LegacyGraderReconciler(client, state, plan, {
      readPublished,
      organizationAccess,
      creationJournal: new Set()
    });
  return { client, state, plan, readPublished, organizationAccess, service };
};
describe("post-publication legacy grader reconciliation", () => {
  it("establishes replacements first, removes only the numeric legacy grant, then performs no writes on rerun", async () => {
    const f = setup();
    const service = f.service();
    expect((await service.reconcile()).targets[0]?.status).toBe("removed");
    expect(f.client.teamPermissionWrites.at(LAST_ITEM)).toMatchObject({
      teamId: LEGACY_ID,
      permission: "none"
    });
    expect(f.client.repositoryTeamPermissions.get(OTHER_ID)).toBe("pull");
    expect(f.client.organizationTeams.some((t) => t.id === LEGACY_ID)).toBe(true);
    const count = f.client.teamPermissionWrites.length;
    expect((await service.reconcile()).targets[0]?.status).toBe("already_absent");
    expect(f.client.teamPermissionWrites).toHaveLength(count);
    expect(f.client.fallbackPermissionWrites).toEqual([]);
  });
  it.each([
    "publishedRevision",
    "sessionId",
    "organizationId",
    "authenticatedUserId",
    "authorized"
  ] as const)("refuses changed %s before writes", async (key) => {
    const f = setup();
    const service = f.service();
    f.state[key] = (
      typeof f.state[key] === "number"
        ? OTHER_ID
        : typeof f.state[key] === "boolean"
          ? false
          : "stale"
    ) as never;
    expect((await service.reconcile()).targets[0]?.status).toBe("needs_attention");
    expect(f.client.teamPermissionWrites).toEqual([]);
  });
  it("refuses changed roles and pending memberships", async () => {
    const f = setup();
    const service = f.service();
    f.state.terms = [];
    expect((await service.reconcile()).targets[0]?.status).toBe("needs_attention");
    expect(f.client.teamPermissionWrites).toEqual([]);
  });
  it("verifies a lost mutation response remotely and never blindly retries", async () => {
    const f = setup();
    const original = f.client.setCourseRepositoryTeamPermission.bind(f.client);
    vi.spyOn(f.client, "setCourseRepositoryTeamPermission").mockImplementation(async (...args) => {
      const result = await original(...args);
      if (args[4] === "none") throw new Error("lost response");
      return result;
    });
    const service = f.service();
    expect((await service.reconcile()).targets[0]?.status).toBe("removed");
    expect((await service.reconcile()).targets[0]?.status).toBe("already_absent");
  });
  it.each(["team_id", "organization", "permission", "metadata", "hierarchy"])(
    "refuses changed legacy %s",
    async (change) => {
      const f = setup();
      const team = f.client.organizationTeams.find((t) => t.id === LEGACY_ID);
      if (!team) throw new Error("Missing legacy team");
      if (change === "team_id") team.id = OTHER_ID;
      if (change === "organization") team.org = "other-org";
      if (change === "permission") f.client.repositoryTeamPermissions.set(LEGACY_ID, "admin");
      if (change === "metadata") team.description = "unreviewed ownership";
      if (change === "hierarchy") team.parentId = OTHER_ID;
      expect((await f.service().reconcile()).status).toBe("needs_attention");
      expect(f.client.teamPermissionWrites).toEqual([]);
    }
  );
  it("does not remove legacy access while replacement organization access is pending", async () => {
    const f = setup();
    f.organizationAccess.inspect.mockImplementation(() =>
      Promise.resolve(
        course.faculty_directory.map((v) => ({
          githubUserId: v.github_user_id,
          courseRepositoryId: REPOSITORY_ID,
          organization: f.client.repository.owner.login,
          state: "pending_invitation" as const,
          invitationId: OTHER_ID
        }))
      )
    );
    expect((await f.service().reconcile()).status).toBe("needs_attention");
    expect(f.client.repositoryTeamPermissions.get(LEGACY_ID)).toBe("push");
  });
  it("requires existing fallback access without changing any collaborator", async () => {
    const f = setup();
    f.client.directCollaboratorPermissions.clear();
    expect((await f.service().reconcile()).status).toBe("needs_attention");
    expect(f.client.fallbackPermissionWrites).toEqual([]);
    expect(f.client.repositoryTeamPermissions.get(LEGACY_ID)).toBe("push");
  });
  it("preserves independent success and reports unresolved targets without rollback", async () => {
    const f = setup();
    const first = f.plan.reconciliation.grants[0];
    if (!first) throw new Error("Missing grant");
    f.plan.reconciliation.grants.push({ ...first, repositoryId: OTHER_ID });
    const result = await f.service().reconcile();
    expect(result.targets.map((t) => t.status)).toEqual(["removed", "needs_attention"]);
    expect(result.manualCleanupTeamIds).toEqual([]);
    expect(f.client.repositoryTeamPermissions.has(LEGACY_ID)).toBe(false);
  });
  it("rechecks published authority after replacement writes", async () => {
    const f = setup();
    const original = f.client.setCourseRepositoryTeamPermission.bind(f.client);
    vi.spyOn(f.client, "setCourseRepositoryTeamPermission").mockImplementation(async (...args) => {
      const result = await original(...args);
      f.state.publishedRevision = "c".repeat(SHA_LENGTH);
      return result;
    });
    expect((await f.service().reconcile()).status).toBe("needs_attention");
    expect(f.client.repositoryTeamPermissions.get(LEGACY_ID)).toBe("push");
  });
  it("leaves an unverified failed removal pending and rereads before another attempt", async () => {
    const f = setup();
    const original = f.client.setCourseRepositoryTeamPermission.bind(f.client);
    const write = vi
      .spyOn(f.client, "setCourseRepositoryTeamPermission")
      .mockImplementation((...args) =>
        args[4] === "none" ? Promise.reject(new Error("unknown outcome")) : original(...args)
      );
    const service = f.service();
    expect((await service.reconcile()).status).toBe("needs_attention");
    expect(write.mock.calls.filter((c) => c[4] === "none")).toHaveLength(1);
    f.client.repositoryTeamPermissions.delete(LEGACY_ID);
    expect((await service.reconcile()).targets[0]?.status).toBe("already_absent");
    expect(write.mock.calls.filter((c) => c[4] === "none")).toHaveLength(1);
  });
  it("observes successful removal even if the caller is interrupted after the write", async () => {
    const f = setup();
    const abort = new AbortController();
    const original = f.client.setCourseRepositoryTeamPermission.bind(f.client);
    vi.spyOn(f.client, "setCourseRepositoryTeamPermission").mockImplementation(async (...args) => {
      const response = await original(...args);
      if (args[4] === "none") abort.abort();
      return response;
    });
    expect((await f.service().reconcile(abort.signal)).targets[0]?.status).toBe("removed");
    expect(f.client.membershipWrites.some((w) => w.teamId === LEGACY_ID)).toBe(false);
  });
  it("reconciles a source-bound student repository with Phase 7 permissions", async () => {
    const f = setup();
    const client = new FakeStudentPermissionClient(users);
    client.organizationTeams.push(...structuredClone(f.client.organizationTeams));
    client.organizationMembers.set(f.client.repository.owner.login, [...users]);
    for (const [id, members] of f.client.members) client.members.set(id, structuredClone(members));
    const STUDENT_ID = 700;
    client.addPermissionRepository(
      REPOSITORY_ID,
      f.client.repository.owner.login,
      f.client.repository.name
    );
    client.addPermissionRepository(STUDENT_ID, f.client.repository.owner.login, "student-repo");
    client.repositoryGrants.get(STUDENT_ID)?.set(LEGACY_ID, "push");
    const state = {
      ...f.state,
      targets: [
        {
          courseRepositoryId: REPOSITORY_ID,
          organizationId: client.organizationId,
          repositoryId: STUDENT_ID,
          termCode: term.term.code,
          sectionId: "001",
          assignmentSlug: "lab",
          targetId: "student",
          mode: "individual" as const,
          sectionIds: ["001"]
        }
      ]
    };
    const first = f.plan.reconciliation.grants[0];
    const original = f.plan.audit.inventory.repositories[0];
    if (!first || !original) throw new Error("Missing target");
    const plan = {
      ...f.plan,
      reconciliation: {
        ...f.plan.reconciliation,
        grants: [{ ...first, repositoryId: STUDENT_ID }]
      },
      audit: {
        ...f.plan.audit,
        inventory: {
          ...f.plan.audit.inventory,
          repositories: [{ ...original, repositoryId: STUDENT_ID, name: "student-repo" }]
        }
      }
    };
    const transport = Object.assign(client, {
      getCourseFallbackPermissionPage: f.client.getCourseFallbackPermissionPage.bind(f.client),
      setCourseFallbackPermission: f.client.setCourseFallbackPermission.bind(f.client)
    });
    const service = new LegacyGraderReconciler(transport, state, plan, {
      readPublished: () => Promise.resolve(state),
      organizationAccess: f.organizationAccess,
      creationJournal: new Set()
    });
    expect((await service.reconcile()).targets[0]?.status).toBe("removed");
    expect(client.teamPermissionWrites.filter((w) => w.permission === "none")).toEqual([
      expect.objectContaining({ repositoryId: STUDENT_ID, teamId: LEGACY_ID })
    ]);
    expect((await service.reconcile()).targets[0]?.status).toBe("already_absent");
  });
  it("has no production imports or IPC wiring", () => {
    for (const file of [
      "src/cli/index.ts",
      "ui/electron/migrationReviewService.ts",
      "ui/electron/migrationReviewIpc.ts"
    ]) {
      expect(fs.readFileSync(file, "utf8")).not.toMatch(
        /legacy-grader-reconciliation|LegacyGraderReconciler/
      );
    }
  });
  it.each(["membership", "child", "incomplete_read"])(
    "blocks ambiguous legacy %s",
    async (ambiguity) => {
      const f = setup();
      if (ambiguity === "membership")
        f.client.members.set(
          LEGACY_ID,
          [users[0]].filter((u): u is NonNullable<typeof u> => u !== undefined)
        );
      if (ambiguity === "child") {
        const team = f.client.organizationTeams.find((t) => t.id === OTHER_ID);
        if (!team) throw new Error("Missing team");
        team.parentId = LEGACY_ID;
      }
      if (ambiguity === "incomplete_read")
        vi.spyOn(f.client, "listManagedTeamMembersPage").mockRejectedValue(
          new Error("read failed")
        );
      expect((await f.service().reconcile()).status).toBe("needs_attention");
      expect(f.client.teamPermissionWrites).toEqual([]);
    }
  );
});
