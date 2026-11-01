import { describe, expect, it, vi } from "vitest";
import {
  CourseRepositoryPermissionReconciler,
  courseTeamRepositoryPermission
} from "../../../src/github/course-repository-permissions.js";
import { FakeCoursePermissionClient } from "../../../src/github/fake-course-permission-client.js";
import { FacultyOrganizationReconciler } from "../../../src/github/faculty-organization-access.js";
import { ManagedTeamMembershipReconciler } from "../../../src/github/managed-team-reconciliation.js";
import { renderManagedTeamMetadata } from "../../../src/github/managed-team-identity.js";
import {
  OPERATIONAL_COURSE_SCHEMA_VERSION,
  OPERATIONAL_TERM_SCHEMA_VERSION
} from "../../../src/config/config-schemas.js";
import {
  fixture as membershipFixture,
  course as fixtureCourse,
  term,
  users,
  REPOSITORY_ID,
  OTHER_REPOSITORY_ID,
  FACULTY,
  FORMER,
  COORDINATOR,
  FALLBACK,
  OUTSIDER,
  PAGE_SIZE,
  HTTP_FORBIDDEN,
  response
} from "./team-membership-fixtures.js";

const HTTP_NO_CONTENT = 204;

const fixture = (fallbackId = FALLBACK) => {
  const source = membershipFixture();
  const course = structuredClone(fixtureCourse);
  course.fallback_administrator.github_user_id = fallbackId;
  const client = new FakeCoursePermissionClient(users);
  client.organizationTeams.push(...structuredClone(source.client.organizationTeams));
  client.organizationMembers.set(client.repository.owner.login, [...users]);
  for (const desired of source.plan) {
    const team = client.organizationTeams.find(
      (value) => value.description === renderManagedTeamMetadata(desired.identity)
    );
    if (!team) throw new Error("Test team required.");
    client.members.set(
      team.id,
      users.filter((value) => desired.githubUserIds.includes(value.id))
    );
  }
  const context = {
    course,
    courseRepositoryId: REPOSITORY_ID,
    organizationId: client.organizationId,
    authenticatedUserId: client.accountId
  };
  const journal = new Set<string>();
  const runtime = (organization: string) => {
    const currentCourse = { ...course, github: { ...course.github, organization } };
    const access = new FacultyOrganizationReconciler(
      client,
      { ...context, course: currentCourse },
      new Set()
    );
    const membership = new ManagedTeamMembershipReconciler(
      client,
      { ...context, course: currentCourse, terms: [term] },
      access,
      journal
    );
    return { access, membership };
  };
  const dependencies = {
    inspectTeamMemberships: vi.fn((organization: string, signal: AbortSignal) =>
      runtime(organization).membership.inspect(signal)
    ),
    inspectOrganizationAccess: vi.fn((organization: string, signal: AbortSignal) =>
      runtime(organization).access.inspect(signal)
    )
  };
  const service = new CourseRepositoryPermissionReconciler(client, context, dependencies);
  const correct = () => {
    for (const desired of source.plan) {
      const permission = courseTeamRepositoryPermission(desired.identity);
      if (permission)
        client.repositoryTeamPermissions.set(
          source.target(desired.identity.kind).team.id,
          permission
        );
    }
    client.directCollaboratorPermissions.set(fallbackId, "admin");
  };
  return { client, service, dependencies, context, course, target: source.target, correct };
};

describe("course/admin team repository permissions", () => {
  it("assigns coordinator admin, faculty push, historical pull; term/section teams gain nothing", async () => {
    const f = fixture();
    const outcomes = await f.service.reconcile();
    for (const [kind, permission] of [
      ["course-current-coordinators", "admin"],
      ["course-write", "push"],
      ["course-read", "pull"]
    ] as const) {
      const { team } = f.target(kind);
      expect(f.client.repositoryTeamPermissions.get(team.id)).toBe(permission);
      expect(outcomes).toContainEqual(
        expect.objectContaining({
          repositoryId: REPOSITORY_ID,
          teamId: team.id,
          desiredPermission: permission,
          observedPermission: permission,
          status: "reconciled"
        })
      );
    }
    expect(f.client.repositoryTeamPermissions.size).toBe(3);
    expect(f.client.teamsCreated).toEqual([]);
    expect(f.client.membershipWrites).toEqual([]);
    expect(f.client.invitationsCreated).toEqual([]);
    expect(OPERATIONAL_COURSE_SCHEMA_VERSION).toBe(1);
    expect(OPERATIONAL_TERM_SCHEMA_VERSION).toBe(1);
  });

  it("already exact permissions and a complete rerun produce no writes", async () => {
    const f = fixture();
    f.correct();
    expect((await f.service.reconcile()).every((value) => value.status === "up_to_date")).toBe(
      true
    );
    expect(f.client.teamPermissionWrites).toEqual([]);
    expect(f.client.fallbackPermissionWrites).toEqual([]);
    const fresh = fixture();
    await fresh.service.reconcile();
    const count = fresh.client.teamPermissionWrites.length;
    await fresh.service.reconcile();
    expect(fresh.client.teamPermissionWrites).toHaveLength(count);
    expect(fresh.client.fallbackPermissionWrites).toHaveLength(1);
  });

  it("upgrades lower access and reduces excessive access exactly, including maintain", async () => {
    const f = fixture();
    f.client.repositoryTeamPermissions.set(f.target("course-current-coordinators").team.id, "pull");
    f.client.repositoryTeamPermissions.set(f.target("course-write").team.id, "maintain");
    f.client.repositoryTeamPermissions.set(f.target("course-read").team.id, "admin");
    await f.service.reconcile();
    expect(
      f.client.repositoryTeamPermissions.get(f.target("course-current-coordinators").team.id)
    ).toBe("admin");
    expect(f.client.repositoryTeamPermissions.get(f.target("course-write").team.id)).toBe("push");
    expect(f.client.repositoryTeamPermissions.get(f.target("course-read").team.id)).toBe("pull");
  });

  it("successful HTTP writes alone do not establish permissions", async () => {
    const f = fixture();
    vi.spyOn(f.client, "setCourseRepositoryTeamPermission").mockResolvedValue(
      response(null, HTTP_NO_CONTENT)
    );
    expect(
      (await f.service.reconcile())
        .filter((value) => value.subject === "team")
        .every(
          (value) => value.status === "needs_attention" && value.reason === "permission_unverified"
        )
    ).toBe(true);
  });

  it("a lost permission-write response is recovered through remote observation", async () => {
    const f = fixture();
    const write = f.client.setCourseRepositoryTeamPermission.bind(f.client);
    vi.spyOn(f.client, "setCourseRepositoryTeamPermission").mockImplementation(async (...args) => {
      await write(...args);
      throw new Error("secret lost response");
    });
    const results = await f.service.reconcile();
    expect(results.every((value) => value.status === "reconciled")).toBe(true);
    expect(JSON.stringify(results)).not.toContain("secret");
  });

  it("a failed write with unchanged remote state needs attention and can be explicitly retried", async () => {
    const f = fixture();
    vi.spyOn(f.client, "setCourseRepositoryTeamPermission").mockRejectedValueOnce(
      new Error("network unavailable")
    );
    expect(
      (await f.service.reconcile()).some(
        (value) => value.status === "needs_attention" && value.reason === "network_error"
      )
    ).toBe(true);
    expect(
      (await f.service.reconcile()).every((value) =>
        ["reconciled", "up_to_date"].includes(value.status)
      )
    ).toBe(true);
  });

  it("Pending faculty permit safe team permission without team membership writes", async () => {
    const f = fixture();
    const org = f.client.repository.owner.login;
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
    const result = (await f.service.reconcile()).find(
      (value) => value.identity?.kind === "course-write"
    );
    expect(result).toMatchObject({
      desiredPermission: "push",
      observedPermission: "push",
      status: "pending_organization_access"
    });
    expect(f.client.membershipWrites).toEqual([]);
    expect(f.client.invitationsCreated).toEqual([]);
  });

  it("unsafe 7.3 membership blocks new/changed permission without weakening other teams", async () => {
    const f = fixture();
    const { team } = f.target("course-write");
    f.client.members.get(team.id)?.push({ id: OUTSIDER, username: "outsider" });
    const result = (await f.service.reconcile()).find(
      (value) => value.identity?.kind === "course-write"
    );
    expect(result?.status).toBe("needs_attention");
    expect(f.client.teamPermissionWrites.every((value) => value.teamId !== team.id)).toBe(true);
    expect(
      f.client.repositoryTeamPermissions.get(f.target("course-current-coordinators").team.id)
    ).toBe("admin");
  });

  it("a fabricated Pending result with an observed unauthorized extra does not authorize a grant", async () => {
    const f = fixture();
    const inspect = f.dependencies.inspectTeamMemberships.getMockImplementation();
    if (!inspect) throw new Error("Inspector required.");
    f.dependencies.inspectTeamMemberships.mockImplementation(async (...args) =>
      (await inspect(...args)).map((value) =>
        value.identity.kind === "course-write"
          ? {
              ...value,
              status: "pending_organization_access",
              faculty: [
                { githubUserId: OUTSIDER, desired: false, observed: true, status: "up_to_date" }
              ]
            }
          : value
      )
    );
    expect(
      (await f.service.reconcile()).find((value) => value.identity?.kind === "course-write")?.reason
    ).toBe("unsafe_team_membership");
    expect(f.client.repositoryTeamPermissions.has(f.target("course-write").team.id)).toBe(false);
  });
});

describe("fallback administration stays independent", () => {
  it("fallback-only identity gets direct admin without entering a managed team", async () => {
    const f = fixture();
    const before = structuredClone(f.course);
    const results = await f.service.reconcile();
    expect(results.find((value) => value.subject === "fallback_administrator")).toMatchObject({
      githubUserId: FALLBACK,
      observedPermission: "admin",
      status: "reconciled"
    });
    expect(f.client.directCollaboratorPermissions.get(FALLBACK)).toBe("admin");
    expect([...f.client.members.values()].flat().some((value) => value.id === FALLBACK)).toBe(
      false
    );
    expect(f.course).toEqual(before);
  });

  it.each([COORDINATOR, FACULTY, FORMER])(
    "fallback %s retains independent admin even with another role",
    async (id) => {
      const f = fixture(id);
      f.client.fallbackTeamSources.add(id);
      await f.service.reconcile();
      expect(f.client.directCollaboratorPermissions.get(id)).toBe("admin");
      expect(f.client.fallbackPermissionWrites).toHaveLength(1);
      expect(f.client.repositoryTeamPermissions.get(f.target("course-write").team.id)).toBe("push");
    }
  );

  it.each(["pending_invitation", "invitation_required", "needs_attention"] as const)(
    "fallback %s does not bypass organization access",
    async (state) => {
      const f = fixture();
      f.dependencies.inspectOrganizationAccess.mockResolvedValue([
        {
          githubUserId: FALLBACK,
          courseRepositoryId: REPOSITORY_ID,
          organization: f.client.repository.owner.login,
          ...(state === "pending_invitation"
            ? { state, invitationId: 1 }
            : state === "needs_attention"
              ? { state, reason: "sso_required" }
              : { state })
        }
      ]);
      expect(
        (await f.service.reconcile()).find((value) => value.subject === "fallback_administrator")
          ?.status
      ).toBe(state === "needs_attention" ? "needs_attention" : "pending_organization_access");
      expect(f.client.fallbackPermissionWrites).toEqual([]);
    }
  );

  it("a recycled current fallback login fails closed with no historical/institutional fallback", async () => {
    const f = fixture();
    const get = f.client.getUser.bind(f.client);
    const spy = vi
      .spyOn(f.client, "getUser")
      .mockImplementation((login) =>
        login === `faculty-${String(FALLBACK)}`
          ? Promise.resolve({ id: OUTSIDER, username: login })
          : get(login)
      );
    expect(
      (await f.service.reconcile()).find((value) => value.subject === "fallback_administrator")
        ?.reason
    ).toBe("identity_mismatch");
    expect(f.client.fallbackPermissionWrites).toEqual([]);
    expect(
      spy.mock.calls.every(
        ([login]) => !login.startsWith("historical-") && !login.startsWith("institution-")
      )
    ).toBe(true);
  });

  it("never removes former fallback or arbitrary direct collaborator grants", async () => {
    const f = fixture();
    f.client.directCollaboratorPermissions.set(OUTSIDER, "admin");
    f.client.directCollaboratorPermissions.set(FACULTY, "admin");
    await f.service.reconcile();
    expect(f.client.directCollaboratorPermissions.get(OUTSIDER)).toBe("admin");
    expect(f.client.directCollaboratorPermissions.get(FACULTY)).toBe("admin");
  });

  it.each(["lost_response", "unverified"])(
    "verifies fallback %s writes remotely",
    async (failure) => {
      const f = fixture();
      const write = f.client.setCourseFallbackPermission.bind(f.client);
      vi.spyOn(f.client, "setCourseFallbackPermission").mockImplementation(async (...args) => {
        if (failure === "lost_response") {
          await write(...args);
          throw new Error("response lost");
        }
        return response(null, HTTP_NO_CONTENT);
      });
      expect(
        (await f.service.reconcile()).find((value) => value.subject === "fallback_administrator")
          ?.status
      ).toBe(failure === "lost_response" ? "reconciled" : "needs_attention");
    }
  );
});

describe("owned scoped-team drift and unowned access boundaries", () => {
  it("removes proven term/section grants after all course-wide and fallback access is exact", async () => {
    const f = fixture();
    const ids = [
      f.target("term-current-coordinators").team.id,
      f.target("section-current-faculty", "001").team.id
    ];
    ids.forEach((id) => f.client.repositoryTeamPermissions.set(id, "admin"));
    const results = await f.service.reconcile();
    for (const id of ids) {
      expect(f.client.repositoryTeamPermissions.has(id)).toBe(false);
      expect(results).toContainEqual(
        expect.objectContaining({
          teamId: id,
          desiredPermission: "none",
          observedPermission: "none",
          status: "reconciled"
        })
      );
    }
  });

  it("defers scoped-team removal when fallback access remains incomplete", async () => {
    const f = fixture();
    const { team } = f.target("section-current-faculty", "001");
    f.client.repositoryTeamPermissions.set(team.id, "admin");
    f.client.organizationMembers.set(
      f.client.repository.owner.login,
      users.filter((value) => value.id !== FALLBACK)
    );
    expect((await f.service.reconcile()).find((value) => value.teamId === team.id)?.reason).toBe(
      "scoped_team_cleanup_deferred"
    );
    expect(f.client.repositoryTeamPermissions.get(team.id)).toBe("admin");
  });

  it("never mutates other-course, name-matching unmanaged, legacy faculty or grader associations", async () => {
    const f = fixture();
    const { desired, team } = f.target("course-write");
    const descriptions = [
      renderManagedTeamMetadata({ ...desired.identity, courseRepositoryId: OTHER_REPOSITORY_ID }),
      null,
      null,
      null
    ];
    descriptions.forEach((description, index) => {
      const id = OUTSIDER + index;
      f.client.organizationTeams.push({
        id,
        org: f.client.repository.owner.login,
        name: index === 1 ? team.name : index === 2 ? "faculty" : "graders",
        slug: `foreign-${String(index)}`,
        description
      });
      f.client.repositoryTeamPermissions.set(id, "admin");
    });
    const results = await f.service.reconcile();
    expect(results).toContainEqual(
      expect.objectContaining({
        teamId: OUTSIDER,
        reason: "cross_course_repository_access",
        status: "needs_attention"
      })
    );
    expect(f.client.teamPermissionWrites.every((value) => value.teamId < OUTSIDER)).toBe(true);
    descriptions.forEach((_, index) => {
      expect(f.client.repositoryTeamPermissions.get(OUTSIDER + index)).toBe("admin");
    });
  });

  it.each(["malformed graider-team:", "graider-team:v99:{}"])(
    "malformed/unsupported metadata cannot establish authority: %s",
    async (description) => {
      const f = fixture();
      const { team } = f.target("course-write");
      const current = f.client.organizationTeams.find((value) => value.id === team.id);
      if (!current) throw new Error("Team required.");
      current.description = description;
      f.client.repositoryTeamPermissions.set(team.id, "admin");
      await f.service.reconcile();
      expect(f.client.teamPermissionWrites).toEqual([]);
    }
  );
});

describe("canonical repository and complete read boundaries", () => {
  it("7.3 inspect is read-only and independently reports missing teams", async () => {
    const f = membershipFixture();
    f.seedCorrect();
    const { team } = f.target("course-write");
    f.client.organizationTeams.splice(f.client.organizationTeams.indexOf(team), 1);
    expect(
      (await f.service.inspect()).find((value) => value.identity.kind === "course-write")?.status
    ).toBe("needs_attention");
    expect(
      (await f.service.inspect()).find((value) => value.identity.kind === "course-read")?.status
    ).toBe("up_to_date");
    expect(f.client.teamsCreated).toEqual([]);
    expect(f.client.membershipWrites).toEqual([]);
  });

  it("duplicate managed claims cannot receive permission", async () => {
    const f = fixture();
    const { team } = f.target("course-write");
    f.client.organizationTeams.push({ ...team, id: OUTSIDER, slug: "duplicate-course-write" });
    expect(
      (await f.service.reconcile()).find((value) => value.identity?.kind === "course-write")?.reason
    ).toBe("duplicate_managed_team_identity");
    expect(
      f.client.teamPermissionWrites.every(
        (value) => value.teamId !== team.id && value.teamId !== OUTSIDER
      )
    ).toBe(true);
  });

  it("fully paginates permission sources and checks immutable fallback identity", async () => {
    const f = fixture();
    const read = f.client.getCourseFallbackPermissionPage.bind(f.client);
    const first = response({
      data: {
        node: {
          databaseId: REPOSITORY_ID,
          owner: { databaseId: f.client.organizationId },
          collaborators: { edges: [], pageInfo: { hasNextPage: true, endCursor: "second" } }
        }
      }
    });
    const spy = vi
      .spyOn(f.client, "getCourseFallbackPermissionPage")
      .mockResolvedValueOnce(first)
      .mockImplementation((id, login) => read(id, login));
    await f.service.reconcile();
    expect(spy.mock.calls.some((call) => (call as readonly unknown[])[2] === "second")).toBe(true);
    expect(f.client.directCollaboratorPermissions.get(FALLBACK)).toBe("admin");
  });

  it.each(["partial_graphql", "wrong_repository", "wrong_granter"])(
    "untrusted fallback source %s never creates an admin grant",
    async (failure) => {
      const f = fixture();
      const data = {
        data: {
          node: {
            databaseId: failure === "wrong_repository" ? OTHER_REPOSITORY_ID : REPOSITORY_ID,
            owner: { databaseId: f.client.organizationId },
            collaborators: {
              edges:
                failure === "wrong_granter"
                  ? [
                      {
                        node: { databaseId: FALLBACK, login: `faculty-${String(FALLBACK)}` },
                        permissionSources: [
                          {
                            organization: { databaseId: f.client.organizationId },
                            permission: "ADMIN",
                            source: { __typename: "Repository", databaseId: OTHER_REPOSITORY_ID }
                          }
                        ]
                      }
                    ]
                  : [],
              pageInfo: { hasNextPage: false }
            }
          }
        },
        ...(failure === "partial_graphql" ? { errors: [{ message: "private provider body" }] } : {})
      };
      vi.spyOn(f.client, "getCourseFallbackPermissionPage").mockResolvedValue(response(data));
      const result = (await f.service.reconcile()).find(
        (value) => value.subject === "fallback_administrator"
      );
      expect(result?.status).toBe("needs_attention");
      expect(JSON.stringify(result)).not.toContain("private provider");
      expect(f.client.fallbackPermissionWrites).toEqual([]);
    }
  );

  it("stable fallback ID accepts the current renamed login", async () => {
    const f = fixture();
    const get = f.client.getUser.bind(f.client);
    vi.spyOn(f.client, "getUser").mockImplementation((login) =>
      ["renamed-fallback", `faculty-${String(FALLBACK)}`].includes(login)
        ? Promise.resolve({ id: FALLBACK, username: "renamed-fallback" })
        : get(login)
    );
    expect(
      (await f.service.reconcile()).find((value) => value.subject === "fallback_administrator")
        ?.status
    ).toBe("reconciled");
    expect(f.client.fallbackPermissionWrites[0]?.login).toBe("renamed-fallback");
  });

  it("ambiguous scoped-team permission DELETE recovers by reread", async () => {
    const f = fixture();
    const { team } = f.target("section-current-faculty", "001");
    f.client.repositoryTeamPermissions.set(team.id, "admin");
    const write = f.client.setCourseRepositoryTeamPermission.bind(f.client);
    vi.spyOn(f.client, "setCourseRepositoryTeamPermission").mockImplementation(async (...args) => {
      await write(...args);
      if (args[4] === "none") throw new Error("lost DELETE response");
      return response(null, HTTP_NO_CONTENT);
    });
    expect((await f.service.reconcile()).find((value) => value.teamId === team.id)).toMatchObject({
      status: "reconciled",
      observedPermission: "none"
    });
  });

  it("unverified DELETE leaves typed attention instead of declaring access removed", async () => {
    const f = fixture();
    const { team } = f.target("section-current-faculty", "001");
    f.client.repositoryTeamPermissions.set(team.id, "admin");
    const write = f.client.setCourseRepositoryTeamPermission.bind(f.client);
    vi.spyOn(f.client, "setCourseRepositoryTeamPermission").mockImplementation((...args) =>
      args[4] === "none" ? Promise.resolve(response(null, HTTP_NO_CONTENT)) : write(...args)
    );
    expect((await f.service.reconcile()).find((value) => value.teamId === team.id)).toMatchObject({
      status: "needs_attention",
      observedPermission: "admin",
      reason: "permission_unverified"
    });
  });

  it("post-mutation transfer cannot be reported as success", async () => {
    const f = fixture();
    const write = f.client.setCourseRepositoryTeamPermission.bind(f.client);
    vi.spyOn(f.client, "setCourseRepositoryTeamPermission").mockImplementation(async (...args) => {
      const result = await write(...args);
      f.client.repository.owner.id += 1;
      return result;
    });
    expect(
      (await f.service.reconcile()).every(
        (value) => value.status === "needs_attention" && value.observedPermission === null
      )
    ).toBe(true);
  });

  it("unsupported custom repository roles fail closed", async () => {
    const f = fixture();
    const { team } = f.target("course-write");
    vi.spyOn(f.client, "listCourseRepositoryTeamsPage").mockResolvedValue(
      response([{ ...team, parent: null, permission: "push", role_name: "custom-elevated-role" }])
    );
    expect(
      (await f.service.reconcile()).every(
        (value) => value.reason === "unsupported_repository_permission"
      )
    ).toBe(true);
    expect(f.client.teamPermissionWrites).toEqual([]);
  });
  it("repository and organization renames preserve immutable identity and refresh every locator", async () => {
    const f = fixture();
    f.client.repository.name = "renamed-admin";
    f.client.repository.owner.login = "renamed-org";
    f.client.organizationTeams.forEach((value) => {
      value.org = "renamed-org";
    });
    f.client.organizationMembers.set("renamed-org", users);
    expect((await f.service.reconcile()).every((value) => value.status === "reconciled")).toBe(
      true
    );
    expect(
      f.client.teamPermissionWrites.every(
        (value) => value.owner === "renamed-org" && value.repo === "renamed-admin"
      )
    ).toBe(true);
    expect(f.client.fallbackPermissionWrites[0]).toMatchObject({
      owner: "renamed-org",
      repo: "renamed-admin"
    });
  });

  it.each(["transfer", "wrong_id", "account", "non_admin"])(
    "blocks %s before mutation",
    async (failure) => {
      const f = fixture();
      if (failure === "transfer") f.client.repository.owner.id += 1;
      if (failure === "wrong_id") f.client.repository.id += 1;
      if (failure === "account") f.client.accountId += 1;
      if (failure === "non_admin") f.client.repository.permissions.admin = false;
      expect(
        (await f.service.reconcile()).every((value) => value.status === "needs_attention")
      ).toBe(true);
      expect(f.client.teamPermissionWrites).toEqual([]);
      expect(f.client.fallbackPermissionWrites).toEqual([]);
    }
  );

  it("an alias rename during permission inventory cannot redirect a mutation", async () => {
    const f = fixture();
    const list = f.client.listCourseRepositoryTeamsPage.bind(f.client);
    vi.spyOn(f.client, "listCourseRepositoryTeamsPage").mockImplementation(async (...args) => {
      const result = await list(...args);
      f.client.repository.name = "changed-during-read";
      return result;
    });
    expect(
      (await f.service.reconcile()).every(
        (value) => value.reason === "repository_changed_during_read"
      )
    ).toBe(true);
    expect(f.client.teamPermissionWrites).toEqual([]);
  });

  it("fully paginates repository team associations", async () => {
    const f = fixture();
    for (let index = 0; index <= PAGE_SIZE; index += 1) {
      const id = OUTSIDER + index;
      f.client.organizationTeams.push({
        id,
        org: f.client.repository.owner.login,
        name: `unmanaged-${String(index)}`,
        slug: `unmanaged-${String(index)}`,
        description: null
      });
      f.client.repositoryTeamPermissions.set(id, "pull");
    }
    const read = vi.spyOn(f.client, "listCourseRepositoryTeamsPage");
    await f.service.reconcile();
    expect(read.mock.calls.some((call) => call[2] === 2)).toBe(true);
  });

  it("forbidden/incomplete permission inventory blocks all mutations", async () => {
    const f = fixture();
    vi.spyOn(f.client, "listCourseRepositoryTeamsPage").mockResolvedValue(
      response({}, HTTP_FORBIDDEN)
    );
    expect(
      (await f.service.reconcile()).every((value) => value.reason === "permission_denied")
    ).toBe(true);
    expect(f.client.teamPermissionWrites).toEqual([]);
    expect(f.client.fallbackPermissionWrites).toEqual([]);
  });
});
