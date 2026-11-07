import { describe, expect, it, vi } from "vitest";
import { inventoryLegacyGraders } from "../../../src/migration/legacy-grader-inventory.js";
import { validateMigrationReview } from "../../../src/migration/migration-review-validation.js";
import type { CourseMigrationAnalysisData } from "../../../src/migration/migration-models.js";
import type { MigrationReviewResultData } from "../../../src/migration/migration-review-models.js";
import { completeSubmission, reviewFixture } from "./migration-review-fixtures.js";
import {
  addManifest,
  fixture,
  ORGANIZATION_ID,
  REPOSITORY_ID,
  USER_ID
} from "./migration-fixtures.js";

const TEAM_ID = 900;
const OTHER_ID = 901;
const STUDENT_REPOSITORY_ID = 101;
const PAGE_SIZE = 100;
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const ASSOCIATION_ID_BASE = 2000;
const SECOND_STUDENT_REPOSITORY_ID = STUDENT_REPOSITORY_ID + 1;
const response = (data: unknown, status = HTTP_OK, headers = {}) => ({ status, data, headers });
const team = (id = TEAM_ID, slug = "graders") => ({
  id,
  slug,
  name: slug,
  description: null,
  parent: null,
  organization: { id: ORGANIZATION_ID, login: "example-org" }
});
const setup = (input = fixture()) => {
  const context = reviewFixture(input);
  const analysis = structuredClone(context.analysis) as CourseMigrationAnalysisData;
  const review = structuredClone(
    validateMigrationReview(context, completeSubmission(context))
  ) as MigrationReviewResultData;
  const client = {
    getOrganizationScopeResponse: vi.fn(() => Promise.resolve(response({ id: USER_ID }))),
    getOrganizationMembership: vi.fn(() =>
      Promise.resolve(
        response({
          organization: { id: ORGANIZATION_ID, login: "example-org" },
          user: { id: USER_ID },
          state: "active",
          role: "admin"
        })
      )
    ),
    listManagedOrganizationTeamsPage: vi.fn(() =>
      Promise.resolve(response([team(), team(OTHER_ID, "graders-old")]))
    ),
    getManagedTeam: vi.fn(() => Promise.resolve(response(team()))),
    listManagedTeamMembersPage: vi.fn(() =>
      Promise.resolve(
        response([
          { id: OTHER_ID, login: "current-login" },
          { id: USER_ID, login: "someone" }
        ])
      )
    ),
    getCourseRepositoryById: vi.fn((id: number) =>
      Promise.resolve(
        response({
          id,
          node_id: `repo-${String(id)}`,
          name:
            id === REPOSITORY_ID
              ? "se2030-graider"
              : id === STUDENT_REPOSITORY_ID
                ? "repo-001"
                : "repo-002",
          owner: { id: ORGANIZATION_ID, login: "example-org", type: "Organization" }
        })
      )
    ),
    listCourseRepositoryTeamsPage: vi.fn(() =>
      Promise.resolve(
        response([
          { ...team(), permission: "maintain" },
          { ...team(OTHER_ID, "unrelated"), permission: "pull" }
        ])
      )
    ),
    createManagedTeam: vi.fn(),
    setManagedTeamMembership: vi.fn(),
    setCourseRepositoryTeamPermission: vi.fn(),
    writeRepositoryFile: vi.fn(),
    conditionalWriteRepositoryFile: vi.fn()
  };
  const run = () => inventoryLegacyGraders(analysis, review, client, new AbortController().signal);
  return { analysis, review, client, run };
};
const codes = (result: Awaited<ReturnType<ReturnType<typeof setup>["run"]>>) =>
  result.findings.map((f) => f.code);
const frozen = (value: unknown): void => {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(frozen);
  }
};

describe("read-only legacy grader inventory", () => {
  it("returns no debt without any provider calls", async () => {
    const f = setup();
    f.analysis.grader.evidence = [];
    const config = f.analysis.courseConfigurationEvidence?.value;
    if (config) {
      delete config.github.grader_team;
      delete config.github.grader_permission;
    }
    f.review.graderDebtPresent = false;
    expect(await f.run()).toMatchObject({
      status: "not_applicable",
      publicationReady: false,
      candidate: null
    });
    Object.values(f.client).forEach((method) => {
      expect(method).not.toHaveBeenCalled();
    });
  });
  it("binds exact source, resolves only the exact legacy locator and inventories members and grants", async () => {
    const f = setup();
    const result = await f.run();
    expect(result.status).toBe("ready");
    expect(result.source).toMatchObject({
      ...f.review.source,
      organizationId: ORGANIZATION_ID,
      organizationLogin: "example-org"
    });
    expect(result.candidate).toMatchObject({
      classification: "legacy_candidate",
      teamId: TEAM_ID,
      slug: "graders",
      membershipComplete: true,
      members: [
        { id: USER_ID, login: "someone" },
        { id: OTHER_ID, login: "current-login" }
      ]
    });
    expect(result.repositories[0]).toMatchObject({
      repositoryId: REPOSITORY_ID,
      associationsComplete: true,
      associations: [
        { teamId: TEAM_ID, legacyCandidate: true, permission: "maintain" },
        { teamId: OTHER_ID, legacyCandidate: false }
      ]
    });
    expect(f.client.getManagedTeam).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      TEAM_ID,
      expect.any(AbortSignal)
    );
    expect(result).not.toHaveProperty("facultyDirectory");
    for (const method of [
      f.client.createManagedTeam,
      f.client.setManagedTeamMembership,
      f.client.setCourseRepositoryTeamPermission,
      f.client.writeRepositoryFile,
      f.client.conditionalWriteRepositoryFile
    ])
      expect(method).not.toHaveBeenCalled();
  });
  it.each(["repositoryId", "sourceCommitSha", "reportId", "authenticatedGithubUserId"] as const)(
    "rejects mismatched %s before reads",
    async (key) => {
      const f = setup();
      Object.assign(f.review.source, { [key]: "wrong" });
      expect(codes(await f.run())).toContain("review_binding_invalid");
      expect(f.client.getOrganizationScopeResponse).not.toHaveBeenCalled();
    }
  );
  it.each(["incomplete", "stale", "blocked"] as const)(
    "requires completed review: %s",
    async (status) => {
      const f = setup();
      f.review.status = status;
      expect(codes(await f.run())).toContain("review_not_authorized");
    }
  );
  it.each([
    { teams: [] },
    { teams: [team(OTHER_ID, "graders-old")] },
    { teams: [team(OTHER_ID, "Graders")] }
  ])("does not adopt unrelated teams: %j", async ({ teams }) => {
    const f = setup();
    f.client.listManagedOrganizationTeamsPage.mockResolvedValue(response(teams));
    expect(codes(await f.run())).toContain("team_missing");
    expect(f.client.getManagedTeam).not.toHaveBeenCalled();
    expect(f.client.listManagedTeamMembersPage).not.toHaveBeenCalled();
  });
  it("rejects ambiguous exact slug claims", async () => {
    const f = setup();
    f.client.listManagedOrganizationTeamsPage.mockResolvedValue(response([team(), team(OTHER_ID)]));
    expect(codes(await f.run())).toContain("team_ambiguous");
    expect(f.client.listManagedTeamMembersPage).not.toHaveBeenCalled();
  });
  it.each([
    response(team(OTHER_ID)),
    response({ ...team(), id: "900" }),
    response({ ...team(), organization: { id: OTHER_ID, login: "example-org" } }),
    response(team(), HTTP_FORBIDDEN)
  ])("rejects numeric/team organization identity or access failure: %j", async (value) => {
    const f = setup();
    f.client.getManagedTeam.mockResolvedValue(value);
    expect((await f.run()).status).toBe("blocked");
    expect(f.client.listManagedTeamMembersPage).not.toHaveBeenCalled();
  });
  it("rejects account or organization mismatch", async () => {
    const f = setup();
    f.client.getOrganizationScopeResponse.mockResolvedValue(response({ id: OTHER_ID }));
    expect(codes(await f.run())).toContain("account_identity_conflict");
    const g = setup();
    g.client.getOrganizationMembership.mockResolvedValue(
      response({
        organization: { id: OTHER_ID, login: "example-org" },
        user: { id: USER_ID },
        state: "active",
        role: "admin"
      })
    );
    expect(codes(await g.run())).toContain("organization_identity_conflict");
  });
  it("requires numeric organization binding", async () => {
    const f = setup();
    delete f.analysis.source.organizationId;
    expect(codes(await f.run())).toContain("organization_identity_conflict");
    expect(f.client.getOrganizationScopeResponse).not.toHaveBeenCalled();
  });
  it("requires organization binding even when no grader debt remains", async () => {
    const f = setup();
    f.analysis.grader.evidence = [];
    const config = f.analysis.courseConfigurationEvidence?.value;
    if (!config) throw new Error("Missing config");
    delete config.github.grader_team;
    delete config.github.grader_permission;
    f.review.graderDebtPresent = false;
    delete f.analysis.source.organizationId;
    expect(codes(await f.run())).toContain("organization_identity_conflict");
    expect(f.client.getOrganizationScopeResponse).not.toHaveBeenCalled();
  });
  it("reads every membership and association page, including Link-driven short pages", async () => {
    const f = setup();
    f.client.listManagedTeamMembersPage
      .mockResolvedValueOnce(
        response([{ id: OTHER_ID, login: "current-login" }], HTTP_OK, {
          link: '<next>; rel="next"'
        })
      )
      .mockResolvedValueOnce(response([{ id: USER_ID, login: "someone" }]));
    f.client.listCourseRepositoryTeamsPage
      .mockResolvedValueOnce(
        response(
          Array.from({ length: PAGE_SIZE }, (_, index) => ({
            ...team(ASSOCIATION_ID_BASE + index, `team-${String(index)}`),
            permission: "pull"
          }))
        )
      )
      .mockResolvedValueOnce(response([{ ...team(), permission: "maintain" }]));
    const result = await f.run();
    expect(result.status).toBe("ready");
    expect(result.candidate?.members).toHaveLength(2);
    expect(result.repositories[0]?.associations).toHaveLength(PAGE_SIZE + 1);
    expect(f.client.listManagedTeamMembersPage).toHaveBeenCalledTimes(2);
    expect(f.client.listCourseRepositoryTeamsPage).toHaveBeenCalledTimes(2);
  });
  it("marks failed later pagination incomplete and redacts transport errors", async () => {
    const f = setup();
    f.client.listManagedTeamMembersPage
      .mockResolvedValueOnce(response([], HTTP_OK, { link: '<next>; rel="next"' }))
      .mockRejectedValueOnce(new Error("secret-token"));
    const result = await f.run();
    expect(codes(result)).toContain("observation_incomplete");
    expect(result.candidate?.membershipComplete).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
  it("rejects conflicting member IDs/logins and repeated pages", async () => {
    const f = setup();
    f.client.listManagedTeamMembersPage.mockResolvedValue(
      response([
        { id: USER_ID, login: "one" },
        { id: OTHER_ID, login: "one" }
      ])
    );
    expect(codes(await f.run())).toContain("member_identity_conflict");
    const g = setup();
    g.client.listManagedTeamMembersPage.mockResolvedValue(
      response([{ id: USER_ID, login: "one" }], HTTP_OK, { link: '<next>; rel="next"' })
    );
    expect(codes(await g.run())).toContain("observation_incomplete");
  });
  it("correlates source/runtime evidence and inventories proven student repositories", async () => {
    const input = fixture();
    addManifest(input);
    input.runtime = {
      coverage: "machine_local",
      files: {
        ...Object.fromEntries(
          Object.entries(input.sourceFiles).filter(([p]) => p.includes("/manifests/"))
        )
      }
    };
    const f = setup(input);
    const result = await f.run();
    expect(result.repositories.map((r) => r.repositoryId)).toEqual([
      STUDENT_REPOSITORY_ID,
      SECOND_STUDENT_REPOSITORY_ID,
      REPOSITORY_ID
    ]);
    expect(result.repositories[0]?.evidence.map((e) => e.provenance)).toEqual([
      "runtime",
      "source"
    ]);
    expect(result.evidence.some((e) => e.provenance === "manifest-runtime")).toBe(true);
    expect(codes(result)).toContain("runtime_coverage_unknown");
  });
  it("reports missing repository IDs and runtime-only identities without resolving by name", async () => {
    const input = fixture();
    addManifest(input);
    const f = setup(input);
    const manifest = f.analysis.assignments[0]?.manifests.find((m) => m.provenance === "source");
    if (!manifest?.repositories[0]) throw new Error("Missing manifest");
    manifest.repositories[0].repositoryId = null;
    const runtime = structuredClone(manifest);
    runtime.provenance = "runtime";
    if (runtime.repositories[0]) runtime.repositories[0].repositoryId = OTHER_ID;
    f.analysis.assignments[0]?.manifests.push(runtime);
    const result = await f.run();
    expect(codes(result)).toContain("repository_identity_unresolved");
    expect(codes(result)).toContain("runtime_repository_unproven");
    expect(f.client.getCourseRepositoryById.mock.calls.some(([id]) => id === OTHER_ID)).toBe(false);
  });
  it("reports contradictory team/permission and repository evidence", async () => {
    const input = fixture();
    addManifest(input);
    const f = setup(input);
    f.analysis.grader.evidence.push({
      location: "runtime",
      provenance: "manifest-runtime",
      team: "other-team",
      permission: "push",
      classification: "derived"
    });
    const manifest = f.analysis.assignments[0]?.manifests.find((m) => m.provenance === "source");
    if (!manifest?.repositories[0]) throw new Error("Missing manifest");
    manifest.repositories.push({ ...manifest.repositories[0], repositoryId: OTHER_ID });
    const result = await f.run();
    expect(codes(result)).toContain("grader_evidence_conflict");
    expect(codes(result)).toContain("repository_identity_conflict");
  });
  it("rejects repository identity/organization changes and grant team ID conflicts", async () => {
    const f = setup();
    f.client.getCourseRepositoryById.mockImplementation(() =>
      Promise.resolve(response({ id: OTHER_ID }))
    );
    expect(codes(await f.run())).toContain("repository_identity_conflict");
    const g = setup();
    g.client.listCourseRepositoryTeamsPage.mockResolvedValue(
      response([{ ...team(OTHER_ID), permission: "push" }])
    );
    expect(codes(await g.run())).toContain("team_identity_conflict");
  });
  it("is deterministic, deeply frozen and detached from caller inputs", async () => {
    const f = setup();
    const before = structuredClone(f.analysis);
    const first = await f.run();
    f.client.listManagedOrganizationTeamsPage.mockResolvedValue(
      response([team(OTHER_ID, "graders-old"), team()])
    );
    f.client.listManagedTeamMembersPage.mockResolvedValue(
      response([
        { id: USER_ID, login: "someone" },
        { id: OTHER_ID, login: "current-login" }
      ])
    );
    f.client.listCourseRepositoryTeamsPage.mockResolvedValue(
      response([
        { ...team(OTHER_ID, "unrelated"), permission: "pull" },
        { ...team(), permission: "maintain" }
      ])
    );
    expect(await f.run()).toEqual(first);
    frozen(first);
    expect(f.analysis).toEqual(before);
    expect(Object.isFrozen(f.analysis)).toBe(false);
    f.analysis.grader.evidence.splice(0);
    expect(first.evidence).not.toHaveLength(0);
  });
  it("does not select a candidate before organization-team pagination is complete", async () => {
    const f = setup();
    f.client.listManagedOrganizationTeamsPage
      .mockResolvedValueOnce(response([team()], HTTP_OK, { link: '<next>; rel="next"' }))
      .mockResolvedValueOnce(response([team(OTHER_ID)]));
    expect(codes(await f.run())).toContain("team_ambiguous");
    expect(f.client.getManagedTeam).not.toHaveBeenCalled();
    const g = setup();
    g.client.listManagedOrganizationTeamsPage.mockResolvedValue(
      response([team()], HTTP_OK, { link: '<next>; rel="next"' })
    );
    expect(codes(await g.run())).toContain("observation_incomplete");
    expect(g.client.listManagedTeamMembersPage).not.toHaveBeenCalled();
  });
  it("requires numeric IDs even on an exact team locator", async () => {
    const f = setup();
    f.client.listManagedOrganizationTeamsPage.mockResolvedValue(
      response([{ ...team(), id: "900" }])
    );
    expect((await f.run()).status).toBe("blocked");
    expect(f.client.getManagedTeam).not.toHaveBeenCalled();
  });
  it("does not resolve manifest-only team locators or guess a missing configured team", async () => {
    const input = fixture();
    addManifest(input);
    const f = setup(input);
    const config = f.analysis.courseConfigurationEvidence?.value;
    if (!config) throw new Error("Missing config");
    delete config.github.grader_team;
    expect(codes(await f.run())).toContain("team_locator_unresolved");
    expect(f.client.listManagedOrganizationTeamsPage).not.toHaveBeenCalled();
  });
  it("marks grant pagination failure incomplete and preserves the repository evidence", async () => {
    const f = setup();
    f.client.listCourseRepositoryTeamsPage
      .mockResolvedValueOnce(
        response([{ ...team(), permission: "maintain" }], HTTP_OK, { link: '<next>; rel="next"' })
      )
      .mockRejectedValueOnce(new Error("private transport details"));
    const result = await f.run();
    expect(result.repositories[0]).toMatchObject({
      repositoryId: REPOSITORY_ID,
      associationsComplete: false,
      associations: []
    });
    expect(codes(result)).toContain("observation_incomplete");
  });
  it("reports differences between observed grants and historical manifest permissions", async () => {
    const input = fixture();
    addManifest(input);
    const f = setup(input);
    f.client.listCourseRepositoryTeamsPage.mockResolvedValue(
      response([{ ...team(), permission: "pull" }])
    );
    expect(codes(await f.run())).toContain("grant_evidence_mismatch");
  });
  it("does not accept contradictory custom role or hierarchy evidence", async () => {
    const f = setup();
    f.client.listCourseRepositoryTeamsPage.mockResolvedValue(
      response([{ ...team(), permission: "push", role_name: "custom-admin" }])
    );
    expect(codes(await f.run())).toContain("observation_incomplete");
    const g = setup();
    g.client.listCourseRepositoryTeamsPage.mockResolvedValue(
      response([{ ...team(), permission: "push", parent: { id: "900" } }])
    );
    expect(codes(await g.run())).toContain("team_identity_conflict");
  });
  it("invalidates completeness if team or account changes before the read finishes", async () => {
    const f = setup();
    f.client.getManagedTeam
      .mockResolvedValueOnce(response(team()))
      .mockResolvedValueOnce(response(team()))
      .mockResolvedValueOnce(response(team(OTHER_ID)));
    const changedTeam = await f.run();
    expect(codes(changedTeam)).toContain("team_identity_conflict");
    expect(changedTeam.candidate?.membershipComplete).toBe(false);
    expect(changedTeam.repositories[0]?.associationsComplete).toBe(false);
    const g = setup();
    g.client.getOrganizationScopeResponse
      .mockResolvedValueOnce(response({ id: USER_ID }))
      .mockResolvedValueOnce(response({ id: OTHER_ID }));
    expect(codes(await g.run())).toContain("account_identity_conflict");
  });
  it("detects a repository transfer or rename during association pagination", async () => {
    const f = setup();
    const original = await f.client.getCourseRepositoryById(REPOSITORY_ID);
    const originalData = original.data as Record<string, unknown>;
    f.client.getCourseRepositoryById
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(response({ ...originalData, name: "renamed" }));
    const result = await f.run();
    expect(codes(result)).toContain("repository_identity_conflict");
    expect(result.repositories[0]?.associationsComplete).toBe(false);
    const g = setup();
    g.client.getCourseRepositoryById.mockResolvedValue(
      response({
        ...originalData,
        owner: { id: OTHER_ID, login: "example-org", type: "Organization" }
      })
    );
    expect(codes(await g.run())).toContain("repository_identity_conflict");
  });
  it("captures inputs before awaiting a provider read", async () => {
    const f = setup();
    f.client.getOrganizationScopeResponse.mockImplementation(() => {
      f.analysis.source.organizationLogin = "retargeted";
      Object.assign(f.review.source, { repositoryId: OTHER_ID });
      return Promise.resolve(response({ id: USER_ID }));
    });
    const result = await f.run();
    expect(result.status).toBe("ready");
    expect(result.source.organizationLogin).toBe("example-org");
    expect(f.client.listManagedOrganizationTeamsPage).toHaveBeenCalledWith(
      "example-org",
      1,
      PAGE_SIZE,
      expect.any(AbortSignal)
    );
  });
  it("preserves orphan manifests and unresolved target identity evidence", async () => {
    const input = fixture();
    addManifest(input);
    const f = setup(input);
    const manifest = f.analysis.assignments[0]?.manifests.find((m) => m.provenance === "source");
    if (!manifest) throw new Error("Missing manifest");
    f.analysis.unassignedManifests.push({
      ...structuredClone(manifest),
      location: "orphan/manifest.yml",
      state: "invalid",
      targets: [
        {
          targetId: "group",
          sectionIds: [],
          studentIds: [],
          repositoryName: "group-repository",
          lifecycle: null
        }
      ]
    });
    const result = await f.run();
    expect(codes(result)).toContain("manifest_evidence_incomplete");
    expect(result.repositoryEvidence).toContainEqual({
      provenance: "source",
      location: "orphan/manifest.yml",
      repositoryId: null,
      repositoryName: "group-repository"
    });
    expect(codes(result)).toContain("repository_identity_unresolved");
  });
});
