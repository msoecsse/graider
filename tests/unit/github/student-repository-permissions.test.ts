import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Manifest } from "../../../src/manifest/manifest-models.js";
import type { GitHubPermission } from "../../../src/github/github-models.js";
import {
  StudentRepositoryPermissionReconciler,
  desiredStudentTeamGrants
} from "../../../src/github/student-repository-permissions.js";
import {
  studentTargetsFromManifest,
  validateStudentRepositoryTarget,
  validateStudentRepositoryTargets
} from "../../../src/github/student-repository-target.js";
import { FakeStudentPermissionClient } from "../../../src/github/fake-student-permission-client.js";
import { FacultyOrganizationReconciler } from "../../../src/github/faculty-organization-access.js";
import { ManagedTeamMembershipReconciler } from "../../../src/github/managed-team-reconciliation.js";
import { renderManagedTeamMetadata } from "../../../src/github/managed-team-identity.js";
import {
  OPERATIONAL_COURSE_SCHEMA_VERSION,
  OPERATIONAL_TERM_SCHEMA_VERSION
} from "../../../src/config/config-schemas.js";
import {
  fixture as membershipFixture,
  course,
  term,
  secondTerm,
  users,
  org,
  FACULTY,
  COORDINATOR,
  FALLBACK,
  OUTSIDER,
  REPOSITORY_ID,
  OTHER_REPOSITORY_ID,
  PAGE_SIZE,
  HTTP_FORBIDDEN,
  response
} from "./team-membership-fixtures.js";

const STUDENT_REPOSITORY_ID = OTHER_REPOSITORY_ID;
const GROUP_REPOSITORY_ID = OTHER_REPOSITORY_ID + 1;
const HTTP_NO_CONTENT = 204;
const target = (repositoryId = STUDENT_REPOSITORY_ID, sectionId = "001") => ({
  repositoryId,
  courseRepositoryId: REPOSITORY_ID,
  organizationId: 200,
  termCode: "27s1",
  sectionId,
  sectionIds: [sectionId],
  mode: "individual" as const,
  assignmentSlug: "lab01",
  targetId: `student-${String(repositoryId)}`
});
const fixture = (targets: readonly unknown[] = [target()]) => {
  const source = membershipFixture([term, secondTerm]);
  const client = new FakeStudentPermissionClient(users);
  client.organizationTeams.push(...structuredClone(source.client.organizationTeams));
  client.organizationMembers.set(org, [...users]);
  for (const id of [REPOSITORY_ID, STUDENT_REPOSITORY_ID, GROUP_REPOSITORY_ID])
    client.addPermissionRepository(id, org, `arbitrary-name-${String(id)}`);
  for (const desired of source.plan) {
    const team = client.organizationTeams.find(
      (value) => value.description === renderManagedTeamMetadata(desired.identity)
    );
    if (!team) throw new Error("Team fixture required.");
    client.members.set(
      team.id,
      users.filter((value) => desired.githubUserIds.includes(value.id))
    );
  }
  const context = {
    course,
    terms: [term, secondTerm],
    courseRepositoryId: REPOSITORY_ID,
    organizationId: client.organizationId,
    authenticatedUserId: client.accountId,
    targets
  };
  const journal = new Set<string>();
  const inspect = vi.fn((organization: string, signal: AbortSignal) => {
    const currentCourse = { ...course, github: { ...course.github, organization } };
    const access = new FacultyOrganizationReconciler(
      client,
      { ...context, course: currentCourse },
      new Set()
    );
    return new ManagedTeamMembershipReconciler(
      client,
      { ...context, course: currentCourse },
      access,
      journal
    ).inspect(signal);
  });
  const service = new StudentRepositoryPermissionReconciler(client, context, inspect);
  const correct = (repositoryId = STUDENT_REPOSITORY_ID) => {
    for (const grant of desiredStudentTeamGrants(REPOSITORY_ID, "27s1", "001")) {
      const team = client.organizationTeams.find(
        (value) => value.description === renderManagedTeamMetadata(grant.identity)
      );
      if (!team) throw new Error("Team required.");
      client.repositoryGrants.get(repositoryId)?.set(team.id, grant.permission);
    }
  };
  return { source, client, context, inspect, service, correct, targetTeam: source.target };
};

describe("trusted student repository targets", () => {
  it("requires an immutable ID and never authorizes by a plausible repository name", async () => {
    const input = {
      ...target(),
      repositoryId: undefined,
      repositoryName: "27s1-course-lab01-student"
    };
    expect(validateStudentRepositoryTarget(input)).toMatchObject({
      status: "needs_attention",
      reason: "immutable_repository_id_required"
    });
    const f = fixture([input]);
    expect((await f.service.reconcile())[0]?.status).toBe("needs_attention");
    expect(f.client.repositoryIdReads).toEqual([]);
    expect(f.client.teamPermissionWrites).toEqual([]);
  });

  it("accepts single-section group evidence and rejects cross-section groups", async () => {
    const group = { ...target(), mode: "group", targetId: "group:g1" };
    expect(validateStudentRepositoryTarget(group).status).toBe("ready");
    const f = fixture([{ ...group, sectionIds: ["001", "002"] }]);
    expect((await f.service.reconcile())[0]?.reason).toBe("cross_section_repository_target");
    expect(f.client.teamPermissionWrites).toEqual([]);
  });

  it.each(["duplicate", "section", "term", "assignment", "reverse"])(
    "blocks duplicate/conflicting %s mappings before remote mutation",
    async (kind) => {
      const first = target();
      const second =
        kind === "section"
          ? { ...target(), sectionId: "002", sectionIds: ["002"] }
          : kind === "term"
            ? { ...target(), termCode: "27s2" }
            : kind === "assignment"
              ? { ...target(), assignmentSlug: "lab02" }
              : kind === "reverse"
                ? { ...target(), repositoryId: GROUP_REPOSITORY_ID }
                : target();
      const f = fixture([first, second]);
      expect(
        (await f.service.reconcile()).every((value) => value.status === "needs_attention")
      ).toBe(true);
      expect(f.client.repositoryIdReads).toEqual([]);
      expect(f.client.teamPermissionWrites).toEqual([]);
    }
  );

  it("an invalid conflicting row cannot authorize the otherwise valid row", () => {
    const outcomes = validateStudentRepositoryTargets([target(), { ...target(), mode: "invalid" }]);
    expect(outcomes.every((value) => value.status === "needs_attention")).toBe(true);
  });

  it.each(["course", "organization", "unknown_section", "unknown_term", "admin_repository"])(
    "rejects wrong %s context",
    async (kind) => {
      const input = {
        ...target(),
        ...(kind === "course"
          ? { courseRepositoryId: REPOSITORY_ID + 1 }
          : kind === "organization"
            ? { organizationId: REPOSITORY_ID }
            : kind === "unknown_section"
              ? { sectionId: "003", sectionIds: ["003"] }
              : kind === "unknown_term"
                ? { termCode: "28s1" }
                : { repositoryId: REPOSITORY_ID })
      };
      const f = fixture([input]);
      expect((await f.service.reconcile())[0]?.status).toBe("needs_attention");
      expect(f.client.repositoryIdReads).toEqual([]);
    }
  );

  it("snapshots targets so caller mutations cannot change authorized section or ID", async () => {
    const input = target();
    const f = fixture([input]);
    input.repositoryId = REPOSITORY_ID;
    input.sectionId = "002";
    expect((await f.service.reconcile())[0]).toMatchObject({
      repositoryId: STUDENT_REPOSITORY_ID,
      sectionId: "001",
      status: "reconciled"
    });
    expect(
      f.client.teamPermissionWrites.every((value) => value.repositoryId === STUDENT_REPOSITORY_ID)
    ).toBe(true);
  });

  it("uses persisted individual manifest ID/section and refuses ID-less or group-name evidence", () => {
    const manifest = {
      repositoryMode: "individual",
      assignment: { termCode: "27s1", assignmentSlug: "lab01" },
      repositories: [
        {
          studentId: "s1",
          section: "001",
          repository: { id: STUDENT_REPOSITORY_ID, name: "wrong-name-002" }
        }
      ]
    } as unknown as Manifest;
    const context = { courseRepositoryId: REPOSITORY_ID, organizationId: 200 };
    expect(studentTargetsFromManifest(manifest, context)[0]).toMatchObject({
      status: "ready",
      target: { repositoryId: STUDENT_REPOSITORY_ID, sectionId: "001" }
    });
    const missing = structuredClone(manifest);
    const record = missing.repositories[0];
    if (!record) throw new Error("Record required.");
    delete record.repository.id;
    expect(studentTargetsFromManifest(missing, context)[0]).toMatchObject({
      reason: "immutable_repository_id_required"
    });
    const group = {
      ...manifest,
      repositoryMode: "group",
      targets: [
        {
          targetId: "group:g1",
          mode: "group",
          sectionIds: ["001"],
          repositoryName: "known-group-repo"
        }
      ]
    } as unknown as Manifest;
    expect(studentTargetsFromManifest(group, context)[0]).toMatchObject({
      status: "needs_attention",
      repositoryId: null,
      reason: "immutable_repository_id_required"
    });
  });
});

describe("four exact student-repository faculty grants", () => {
  it("assigns independent current admin and historical pull, with no course-wide/fallback grant", async () => {
    const f = fixture();
    const result = (await f.service.reconcile())[0];
    expect(result?.status).toBe("reconciled");
    expect(
      result?.teams.map((value) => [
        value.identity?.kind,
        value.desiredPermission,
        value.observedPermission
      ])
    ).toEqual([
      ["term-current-coordinators", "admin", "admin"],
      ["section-current-faculty", "admin", "admin"],
      ["term-former-coordinators", "pull", "pull"],
      ["section-former-faculty", "pull", "pull"]
    ]);
    expect(f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.size).toBe(4);
    expect(
      f.client.teamPermissionWrites.some(
        (value) => value.teamId === f.targetTeam("course-current-coordinators").team.id
      )
    ).toBe(false);
    expect([...f.client.members.values()].flat().some((value) => value.id === FALLBACK)).toBe(
      false
    );
    expect(f.client.membershipWrites).toEqual([]);
    expect(f.client.teamsCreated).toEqual([]);
    expect(OPERATIONAL_COURSE_SCHEMA_VERSION).toBe(1);
    expect(OPERATIONAL_TERM_SCHEMA_VERSION).toBe(1);
  });

  it("individual and group repositories receive the same exact scope policy", async () => {
    const f = fixture([
      target(),
      { ...target(GROUP_REPOSITORY_ID), mode: "group", targetId: "group:g1" }
    ]);
    expect((await f.service.reconcile()).every((value) => value.status === "reconciled")).toBe(
      true
    );
    expect([...(f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID) ?? [])]).toEqual([
      ...(f.client.repositoryGrants.get(GROUP_REPOSITORY_ID) ?? [])
    ]);
  });

  it("multiple role sources retain strongest effective admin without collapsing historical grants", async () => {
    const f = fixture();
    const modified = structuredClone(term);
    modified.coordinators.current.push({ github_user_id: FACULTY });
    modified.coordinators.former = [];
    const section = modified.sections[0];
    if (!section) throw new Error("Section required.");
    section.faculty.former.push({ github_user_id: COORDINATOR });
    const source = membershipFixture([modified, secondTerm]);
    f.client.members.clear();
    for (const desired of source.plan) {
      const team = f.client.organizationTeams.find(
        (value) => value.description === renderManagedTeamMetadata(desired.identity)
      );
      if (!team) throw new Error("Team required.");
      f.client.members.set(
        team.id,
        users.filter((value) => desired.githubUserIds.includes(value.id))
      );
    }
    const access = new FacultyOrganizationReconciler(f.client, f.context, new Set());
    const reader = new ManagedTeamMembershipReconciler(
      f.client,
      { ...f.context, terms: [modified, secondTerm] },
      access,
      new Set()
    );
    const service = new StudentRepositoryPermissionReconciler(
      f.client,
      { ...f.context, terms: [modified, secondTerm] },
      (_, signal) => reader.inspect(signal)
    );
    expect((await service.reconcile())[0]?.status).toBe("reconciled");
    expect(
      f.client.repositoryGrants
        .get(STUDENT_REPOSITORY_ID)
        ?.get(f.targetTeam("term-current-coordinators").team.id)
    ).toBe("admin");
    expect(
      f.client.repositoryGrants
        .get(STUDENT_REPOSITORY_ID)
        ?.get(f.targetTeam("section-former-faculty", "001").team.id)
    ).toBe("pull");
  });

  it("upgrades lower current access and reduces excessive historical access exactly", async () => {
    const f = fixture();
    f.client.repositoryGrants
      .get(STUDENT_REPOSITORY_ID)
      ?.set(f.targetTeam("term-current-coordinators").team.id, "push");
    f.client.repositoryGrants
      .get(STUDENT_REPOSITORY_ID)
      ?.set(f.targetTeam("section-former-faculty", "001").team.id, "maintain");
    await f.service.reconcile();
    expect(
      f.client.repositoryGrants
        .get(STUDENT_REPOSITORY_ID)
        ?.get(f.targetTeam("term-current-coordinators").team.id)
    ).toBe("admin");
    expect(
      f.client.repositoryGrants
        .get(STUDENT_REPOSITORY_ID)
        ?.get(f.targetTeam("section-former-faculty", "001").team.id)
    ).toBe("pull");
  });

  it("exact grants and idempotent rerun produce no additional writes", async () => {
    const f = fixture();
    f.correct();
    expect((await f.service.reconcile())[0]?.status).toBe("up_to_date");
    expect(f.client.teamPermissionWrites).toEqual([]);
    const fresh = fixture();
    await fresh.service.reconcile();
    const count = fresh.client.teamPermissionWrites.length;
    expect((await fresh.service.reconcile())[0]?.status).toBe("up_to_date");
    expect(fresh.client.teamPermissionWrites).toHaveLength(count);
  });
});

describe("7.3 dependency and owned drift removal", () => {
  it("safe Pending still grants correct faculty access and removes wrong-section grants", async () => {
    const f = fixture();
    f.client.organizationMembers.set(
      org,
      users.filter((value) => value.id !== FACULTY)
    );
    f.client.organizationInvitations.set(org, [
      { id: 1, login: `faculty-${String(FACULTY)}`, role: "direct_member" }
    ]);
    for (const [id, members] of f.client.members)
      f.client.members.set(
        id,
        members.filter((value) => value.id !== FACULTY)
      );
    const wrong = f.targetTeam("section-current-faculty", "002").team.id;
    f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.set(wrong, "admin");
    const result = (await f.service.reconcile())[0];
    expect(result?.status).toBe("pending_organization_access");
    expect(result?.teams).toContainEqual(
      expect.objectContaining({
        teamId: wrong,
        desiredPermission: "none",
        observedPermission: "none",
        status: "reconciled"
      })
    );
    expect(
      f.client.repositoryGrants
        .get(STUDENT_REPOSITORY_ID)
        ?.get(f.targetTeam("section-current-faculty", "001").team.id)
    ).toBe("admin");
    expect(f.client.membershipWrites).toEqual([]);
    expect(f.client.invitationsCreated).toEqual([]);
  });

  it.each(["unsafe", "missing", "duplicate"])(
    "%s desired team blocks its grant and destructive cleanup",
    async (kind) => {
      const f = fixture();
      const { team } = f.targetTeam("section-current-faculty", "001");
      const wrong = f.targetTeam("section-current-faculty", "002").team.id;
      f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.set(wrong, "admin");
      if (kind === "unsafe")
        f.client.members.get(team.id)?.push({ id: OUTSIDER, username: "outsider" });
      if (kind === "missing") {
        const index = f.client.organizationTeams.findIndex((value) => value.id === team.id);
        f.client.organizationTeams.splice(index, 1);
      }
      if (kind === "duplicate")
        f.client.organizationTeams.push({ ...team, id: OUTSIDER, slug: "duplicate-claim" });
      const result = (await f.service.reconcile())[0];
      expect(result?.status).toBe("needs_attention");
      expect(
        f.client.teamPermissionWrites.every(
          (value) => value.teamId !== team.id && value.permission !== "none"
        )
      ).toBe(true);
      expect(f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.get(wrong)).toBe("admin");
      expect(f.client.teamsCreated).toEqual([]);
    }
  );

  it("removes selected-course grants from other sections, terms and course-wide teams; retains historical read", async () => {
    const f = fixture();
    const wrong = [
      f.targetTeam("section-current-faculty", "002").team.id,
      f.targetTeam("term-current-coordinators", undefined, "27s2").team.id,
      f.targetTeam("course-write").team.id
    ];
    wrong.forEach((id) => f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.set(id, "admin"));
    const result = (await f.service.reconcile())[0];
    expect(result?.status).toBe("reconciled");
    wrong.forEach((id) => {
      expect(f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.has(id)).toBe(false);
    });
    expect(
      f.client.repositoryGrants
        .get(STUDENT_REPOSITORY_ID)
        ?.get(f.targetTeam("term-former-coordinators").team.id)
    ).toBe("pull");
    expect(
      f.client.repositoryGrants
        .get(STUDENT_REPOSITORY_ID)
        ?.get(f.targetTeam("section-former-faculty", "001").team.id)
    ).toBe("pull");
  });

  it("can remove a proven obsolete selected-course scope without recalculating its membership", async () => {
    const f = fixture();
    const identity = {
      courseRepositoryId: REPOSITORY_ID,
      kind: "section-current-faculty" as const,
      termCode: "26s1",
      sectionId: "obsolete"
    };
    f.client.organizationTeams.push({
      id: OUTSIDER,
      org,
      name: "obsolete",
      slug: "obsolete",
      description: renderManagedTeamMetadata(identity)
    });
    f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.set(OUTSIDER, "admin");
    expect((await f.service.reconcile())[0]?.status).toBe("reconciled");
    expect(f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.has(OUTSIDER)).toBe(false);
    expect(f.client.membershipWrites).toEqual([]);
  });

  it("unmanaged, legacy, grader and other-course grants remain untouched; foreign ownership is surfaced", async () => {
    const f = fixture();
    const { team, desired } = f.targetTeam("course-write");
    const claims = [
      null,
      null,
      null,
      renderManagedTeamMetadata({ ...desired.identity, courseRepositoryId: REPOSITORY_ID + 1 })
    ];
    const names = [team.name, "faculty", "graders", "foreign-course"];
    claims.forEach((description, index) => {
      const id = OUTSIDER + index;
      f.client.organizationTeams.push({
        id,
        org,
        name: names[index] ?? "legacy",
        slug: `unowned-${String(index)}`,
        description
      });
      f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.set(id, "admin");
    });
    const result = (await f.service.reconcile())[0];
    expect(result?.teams).toContainEqual(
      expect.objectContaining({
        reason: "cross_course_repository_access",
        status: "needs_attention"
      })
    );
    claims.forEach((_, index) => {
      expect(f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.get(OUTSIDER + index)).toBe(
        "admin"
      );
    });
    expect(f.client.teamPermissionWrites.every((value) => value.teamId < OUTSIDER)).toBe(true);
  });

  it.each(["broken graider-team:", "graider-team:v99:{}"])(
    "does not adopt or delete %s",
    async (description) => {
      const f = fixture();
      f.client.organizationTeams.push({
        id: OUTSIDER,
        org,
        name: "unknown",
        slug: "unknown",
        description
      });
      f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.set(OUTSIDER, "admin");
      expect((await f.service.reconcile())[0]?.status).toBe("needs_attention");
      expect(f.client.teamPermissionWrites).toEqual([]);
    }
  );

  it("preserves all direct individual/group student and arbitrary collaborator grants", async () => {
    const f = fixture([
      target(),
      { ...target(GROUP_REPOSITORY_ID), mode: "group", targetId: "group:g1" }
    ]);
    const direct = new Map<number, GitHubPermission>([
      [FACULTY, "admin"],
      [OUTSIDER, "admin"],
      [FALLBACK, "pull"]
    ]);
    f.client.directGrants.set(STUDENT_REPOSITORY_ID, direct);
    f.client.directGrants.set(GROUP_REPOSITORY_ID, new Map(direct));
    const before = structuredClone(f.client.directGrants);
    await f.service.reconcile();
    expect(f.client.directGrants).toEqual(before);
    expect(f.client.mutations.addedCollaborators).toEqual([]);
    expect(f.client.mutations.removedCollaborators).toEqual([]);
  });
});

describe("canonical repository snapshots and partial reconciliation", () => {
  it("conflicting rows do not block a separate valid target", async () => {
    const f = fixture([
      target(),
      { ...target(), sectionId: "002", sectionIds: ["002"] },
      target(GROUP_REPOSITORY_ID)
    ]);
    expect((await f.service.reconcile()).map((value) => value.status)).toEqual([
      "needs_attention",
      "needs_attention",
      "reconciled"
    ]);
    expect(
      f.client.teamPermissionWrites.every((value) => value.repositoryId === GROUP_REPOSITORY_ID)
    ).toBe(true);
  });

  it("student reconciliation remains disconnected from production v1 workflows", () => {
    for (const file of [
      "src/execution/apply-executor.ts",
      "src/groups/group-target-executor.ts",
      "ui/electron/main.ts",
      "ui/electron/githubOAuthSession.ts",
      "ui/electron/courseSetupService.ts",
      "src/faculty/faculty-scope-resolver.ts"
    ])
      expect(readFileSync(file, "utf8")).not.toMatch(
        /StudentRepositoryPermissionReconciler|studentTargetsFromManifest/
      );
    expect(readFileSync("src/groups/group-target-executor.ts", "utf8")).toContain(
      "input.githubClient.addCollaborator"
    );
    expect(readFileSync("src/execution/apply-executor.ts", "utf8")).toContain(
      "input.githubClient.addTeamPermission"
    );
  });
  it("repository and organization renames preserve IDs and refresh all mutation locators", async () => {
    const f = fixture();
    const student = f.client.permissionRepositories.get(STUDENT_REPOSITORY_ID);
    if (!student) throw new Error("Repository required.");
    student.name = "renamed-arbitrary-repository";
    for (const value of f.client.permissionRepositories.values()) value.owner.login = "renamed-org";
    for (const team of f.client.organizationTeams) team.org = "renamed-org";
    f.client.organizationMembers.set("renamed-org", users);
    expect((await f.service.reconcile())[0]?.status).toBe("reconciled");
    expect(
      f.client.teamPermissionWrites.every(
        (value) => value.owner === "renamed-org" && value.repo === "renamed-arbitrary-repository"
      )
    ).toBe(true);
  });

  it.each(["transfer", "wrong_id", "course_transfer", "account"])(
    "blocks %s before writes",
    async (failure) => {
      const f = fixture();
      const resource = f.client.permissionRepositories.get(
        failure === "course_transfer" ? REPOSITORY_ID : STUDENT_REPOSITORY_ID
      );
      if (!resource) throw new Error("Repository required.");
      if (failure === "transfer" || failure === "course_transfer") resource.owner.id += 1;
      if (failure === "wrong_id") resource.id += 1;
      if (failure === "account") f.client.accountId += 1;
      expect((await f.service.reconcile())[0]?.status).toBe("needs_attention");
      expect(f.client.teamPermissionWrites).toEqual([]);
    }
  );

  it("one missing repository does not block an independent repository", async () => {
    const f = fixture([target(), target(GROUP_REPOSITORY_ID)]);
    f.client.permissionRepositories.delete(STUDENT_REPOSITORY_ID);
    const outcomes = await f.service.reconcile();
    expect(outcomes.map((value) => value.status)).toEqual(["needs_attention", "reconciled"]);
    expect(
      f.client.teamPermissionWrites.every((value) => value.repositoryId === GROUP_REPOSITORY_ID)
    ).toBe(true);
  });

  it("incomplete association inventory blocks all writes for that repository only", async () => {
    const f = fixture([target(), target(GROUP_REPOSITORY_ID)]);
    const read = f.client.listCourseRepositoryTeamsPage.bind(f.client);
    const badName = f.client.permissionRepositories.get(STUDENT_REPOSITORY_ID)?.name;
    vi.spyOn(f.client, "listCourseRepositoryTeamsPage").mockImplementation(
      (owner, repo, page, perPage) =>
        repo === badName
          ? Promise.resolve(response({}, HTTP_FORBIDDEN))
          : read(owner, repo, page, perPage)
    );
    expect((await f.service.reconcile()).map((value) => value.status)).toEqual([
      "needs_attention",
      "reconciled"
    ]);
    expect(
      f.client.teamPermissionWrites.every((value) => value.repositoryId === GROUP_REPOSITORY_ID)
    ).toBe(true);
  });

  it("rename during a locator-based read cannot redirect a write", async () => {
    const f = fixture();
    const read = f.client.listCourseRepositoryTeamsPage.bind(f.client);
    const student = f.client.permissionRepositories.get(STUDENT_REPOSITORY_ID);
    if (!student) throw new Error("Repository required.");
    vi.spyOn(f.client, "listCourseRepositoryTeamsPage").mockImplementation(async (...args) => {
      const result = await read(...args);
      student.name = "renamed-during-read";
      return result;
    });
    expect((await f.service.reconcile())[0]?.reason).toBe("repository_changed_during_read");
    expect(f.client.teamPermissionWrites).toEqual([]);
  });

  it("fully paginates association and ownership snapshots before cleanup", async () => {
    const f = fixture();
    for (let index = 0; index <= PAGE_SIZE; index += 1) {
      const id = OUTSIDER + index;
      f.client.organizationTeams.push({
        id,
        org,
        name: `unmanaged-${String(index)}`,
        slug: `unmanaged-${String(index)}`,
        description: null
      });
      f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.set(id, "pull");
    }
    const wrong = f.targetTeam("course-write").team.id;
    f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.set(wrong, "admin");
    const associations = vi.spyOn(f.client, "listCourseRepositoryTeamsPage");
    const ownership = vi.spyOn(f.client, "listManagedOrganizationTeamsPage");
    expect((await f.service.reconcile())[0]?.status).toBe("reconciled");
    expect(associations.mock.calls.some((call) => call[2] === 2)).toBe(true);
    expect(ownership.mock.calls.some((call) => call[1] === 2)).toBe(true);
    expect(f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.has(wrong)).toBe(false);
  });

  it.each(["PUT", "DELETE"])(
    "recovers ambiguous %s only through reread and reruns idempotently",
    async (method) => {
      const f = fixture();
      if (method === "DELETE") {
        f.correct();
        f.client.repositoryGrants
          .get(STUDENT_REPOSITORY_ID)
          ?.set(f.targetTeam("course-write").team.id, "admin");
      }
      const write = f.client.setCourseRepositoryTeamPermission.bind(f.client);
      const spy = vi
        .spyOn(f.client, "setCourseRepositoryTeamPermission")
        .mockImplementation(async (...args) => {
          const result = await write(...args);
          if ((args[4] === "none") === (method === "DELETE"))
            throw new Error("secret token response lost after mutation");
          return result;
        });
      const result = await f.service.reconcile();
      expect(result[0]?.status).toBe("reconciled");
      expect(JSON.stringify(result)).not.toContain("secret token");
      const count = spy.mock.calls.length;
      expect((await f.service.reconcile())[0]?.status).toBe("up_to_date");
      expect(spy).toHaveBeenCalledTimes(count);
    }
  );

  it.each(["PUT", "DELETE"])("an HTTP-success-only %s remains Needs attention", async (method) => {
    const f = fixture();
    if (method === "DELETE") {
      f.correct();
      f.client.repositoryGrants
        .get(STUDENT_REPOSITORY_ID)
        ?.set(f.targetTeam("course-write").team.id, "admin");
    }
    const write = f.client.setCourseRepositoryTeamPermission.bind(f.client);
    vi.spyOn(f.client, "setCourseRepositoryTeamPermission").mockImplementation((...args) =>
      (args[4] === "none") === (method === "DELETE")
        ? Promise.resolve(response(null, HTTP_NO_CONTENT))
        : write(...args)
    );
    const result = (await f.service.reconcile())[0];
    expect(result?.status).toBe("needs_attention");
    expect(result?.teams).toContainEqual(
      expect.objectContaining({ reason: "permission_unverified" })
    );
  });

  it("an ambiguous failed PUT can be explicitly retried only after fresh drift observation", async () => {
    const f = fixture();
    vi.spyOn(f.client, "setCourseRepositoryTeamPermission").mockRejectedValueOnce(
      new Error("network failure")
    );
    expect((await f.service.reconcile())[0]?.status).toBe("needs_attention");
    expect((await f.service.reconcile())[0]?.status).toBe("reconciled");
  });

  it("numeric team mismatch cannot redirect permission to another resource", async () => {
    const f = fixture();
    const selected = f.targetTeam("section-current-faculty", "001").team.id;
    const get = f.client.getManagedTeam.bind(f.client);
    vi.spyOn(f.client, "getManagedTeam").mockImplementation(async (organizationId, id) => {
      const result = await get(organizationId, id);
      return id === selected
        ? { ...result, data: { ...(result.data as object), id: OUTSIDER } }
        : result;
    });
    expect((await f.service.reconcile())[0]?.status).toBe("needs_attention");
    expect(
      f.client.teamPermissionWrites.every(
        (value) => value.teamId !== selected && value.permission !== "none"
      )
    ).toBe(true);
  });

  it("obsolete duplicate claims block cleanup rather than picking a resource", async () => {
    const f = fixture();
    const identity = {
      courseRepositoryId: REPOSITORY_ID,
      termCode: "26s1",
      kind: "term-current-coordinators" as const
    };
    for (const index of [0, 1])
      f.client.organizationTeams.push({
        id: OUTSIDER + index,
        org,
        name: "obsolete",
        slug: `obsolete-${String(index)}`,
        description: renderManagedTeamMetadata(identity)
      });
    f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.set(OUTSIDER, "admin");
    const result = (await f.service.reconcile())[0];
    expect(result?.teams).toContainEqual(
      expect.objectContaining({ teamId: OUTSIDER, reason: "duplicate_managed_team_identity" })
    );
    expect(f.client.repositoryGrants.get(STUDENT_REPOSITORY_ID)?.get(OUTSIDER)).toBe("admin");
  });
});
