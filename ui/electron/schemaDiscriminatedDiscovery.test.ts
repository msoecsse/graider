// @vitest-environment node
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { discoverRemoteCourses, loadMetadata } from "./remoteCourseDiscovery.js";
import type { CourseRepository, RemoteRepositoryReader } from "./githubRemoteRepositories.js";
import { schemaTwoCourse, schemaTwoTerm, metadataYaml } from "./schemaDiscriminatedFixtures.js";

const revision = "a".repeat(40);
const repository = (id = 20, organizationId = 10, owner = "fixture"): CourseRepository => ({
  id,
  organizationId,
  owner,
  name: "course-admin",
  fullName: `${owner}/course-admin`,
  url: `https://github.com/${owner}/course-admin`,
  nodeId: null,
  defaultBranch: "main",
  visibility: "private",
  archived: false,
  disabled: false,
  topics: ["graider-course"]
});
const fixture = () => {
  const repos = [repository(), repository(21, 11, "legacy")];
  const v1Course = fs
    .readFileSync("../tests/fixtures/config/valid-course/course.yml", "utf8")
    .replaceAll("example-org", "legacy");
  const v1Term = `schema_version: 1\nterm:\n  code: 27s1\n  academic_year: 2027\n  semester: 1\n  display_name: Legacy\nsections:\n  - id: '001'\n    faculty: [jones]\n`;
  const reader = {
    revision: vi.fn().mockResolvedValue(revision),
    list: async (org: string) => repos.filter((repo) => repo.owner === org),
    resolveId: async (id: number) => repos.find((repo) => repo.id === id) ?? null,
    resolve: async () => null,
    search: async () => ({ ids: [], incomplete: false }),
    terms: vi.fn().mockResolvedValue(["27s1"]),
    file: vi.fn(async (repo: CourseRepository, file: string, _revision?: string) =>
      repo.id === 20
        ? metadataYaml(file === "course.yml" ? schemaTwoCourse() : schemaTwoTerm())
        : file === "course.yml"
          ? v1Course
          : v1Term
    )
  } satisfies RemoteRepositoryReader;
  const request = {
    userId: 42,
    username: "jones" as string | null,
    locals: [],
    reader,
    organizations: repos.map((repo) => ({
      organizationId: repo.organizationId,
      login: repo.owner,
      membershipState: "active" as const,
      membershipRole: "member" as const,
      directMembership: true,
      accessStatus: "accessible" as const,
      accessDiagnostic: "ok"
    }))
  };
  return { reader, request };
};

describe("mixed schema discovery at authoritative revisions", () => {
  it("discovers Schema 1 and 2 with independent authorization anchors", async () => {
    const f = fixture();
    const result = await discoverRemoteCourses(f.request);
    expect(result.courses).toEqual([
      expect.objectContaining({ repositoryId: 20, schemaVersion: 2, authorization: "authorized" }),
      expect.objectContaining({ repositoryId: 21, schemaVersion: 1, authorization: "authorized" })
    ]);
    expect(f.reader.file.mock.calls.every((call) => call[2] === revision)).toBe(true);
    f.request.username = null;
    expect(
      (await discoverRemoteCourses(f.request)).courses.map((course) => course.authorization)
    ).toEqual(["authorized", "faculty_identity_required"]);
  });
  it("never falls back to a matching local username for Schema 2", async () => {
    const f = fixture();
    const result = await discoverRemoteCourses({ ...f.request, userId: 999 });
    expect(result.courses.find((course) => course.schemaVersion === 2)?.authorization).toBe(
      "not_authorized"
    );
    expect(result.courses.find((course) => course.schemaVersion === 1)?.authorization).toBe(
      "authorized"
    );
  });
  it.each([null, [1]])(
    "preserves Schema 1 when v2 operational compatibility is %j",
    async (support) => {
      const f = fixture();
      const backend = loadMetadata();
      const result = await discoverRemoteCourses({
        ...f.request,
        metadata: {
          ...backend,
          inspectCourse: (text) => {
            const parsed = backend.inspectCourse(text);
            return parsed.status === "valid" && parsed.schemaVersion === 2
              ? backend.inspectCourse(text, support)
              : backend.inspectCourse(text, [1]);
          }
        }
      });
      expect(result.courses.map((course) => course.schemaVersion)).toEqual([1]);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ repositoryId: 20, status: "client_incompatible" })
      );
    }
  );
  it("refuses a Schema 1 read whose authoritative revision changed to Schema 2", async () => {
    const f = fixture();
    f.reader.revision.mockResolvedValueOnce(revision).mockResolvedValue("b".repeat(40));
    const result = await discoverRemoteCourses(f.request);
    expect(result.courses.some((course) => course.repositoryId === 20)).toBe(false);
  });
  it("requires a known fresh revision instead of trusting cached metadata", async () => {
    const f = fixture();
    f.reader.revision.mockRejectedValue(new Error("unavailable"));
    expect((await discoverRemoteCourses(f.request)).courses).toEqual([]);
    expect(f.reader.file).not.toHaveBeenCalled();
  });
  it("immediately rediscovers v2 without consulting a stale local registration", async () => {
    const f = fixture();
    const result = await discoverRemoteCourses({
      ...f.request,
      managedRegistrations: [{ repositoryId: 20, organizationId: 10, folderIds: ["legacy-folder"] }]
    });
    expect(result.courses[0]).toMatchObject({
      schemaVersion: 2,
      authorization: "authorized",
      localFolderIds: ["legacy-folder"]
    });
  });
  it("retains a trusted local-folder refusal when an incompatible course cannot enter discovery", async () => {
    const f = fixture();
    const backend = loadMetadata();
    const result = await discoverRemoteCourses({
      ...f.request,
      locals: [{ folderId: "legacy-folder", origin: { owner: "fixture", name: "course-admin" } }],
      reader: { ...f.reader, resolve: async () => repository() },
      metadata: { ...backend, inspectCourse: (text) => backend.inspectCourse(text, [1]) }
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        repositoryId: 20,
        status: "client_incompatible",
        localFolderIds: ["legacy-folder"]
      })
    );
  });
});
