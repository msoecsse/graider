// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  discoverRemoteCourses,
  inspectLocalCourseOrigins,
  parseGithubOrigin,
  DISCOVERY_CONCURRENCY
} from "./remoteCourseDiscovery.js";
import type { CourseRepository, RemoteRepositoryReader } from "./githubRemoteRepositories.js";
import type { GithubOrganization } from "./githubOAuthTypes.js";
import { GithubOAuthError } from "./githubOAuthCallback.js";
import type { GitWorkspaceInspectionFactory } from "./gitWorkspaceReader.js";
import type { CourseFolderRecord } from "./ipc.js";
import fs from "node:fs";

const org: GithubOrganization = {
  organizationId: 10,
  login: "csc1120",
  membershipState: "active",
  membershipRole: "member",
  directMembership: true,
  accessStatus: "accessible",
  accessDiagnostic: "ok"
};
const repo = (id = 20, name = "csc1120", topics: string[] = []): CourseRepository => ({
  id,
  nodeId: `R_${id}`,
  organizationId: 10,
  owner: "csc1120",
  name,
  fullName: `csc1120/${name}`,
  url: `https://github.com/csc1120/${name}`,
  defaultBranch: "main",
  visibility: "private",
  archived: false,
  disabled: false,
  topics
});
export const courseYaml = `schema_version: 1
course:
  code: csc1020
  title: Data Structures
  repository: csc1020
github:
  organization: csc1120
  repository_visibility: private
  repo_name_pattern: "{term}-{course}-{assignment}-{github_username}"
  student_permission: admin
  faculty_team: faculty
  faculty_permission: admin
defaults:
  timezone: America/Chicago
  assignment_type: individual
reports:
  formats: [markdown]
`;
const termYaml = `schema_version: 1
term:
  code: 27s1
  academic_year: 2027
  semester: 1
  display_name: Fall
sections:
  - id: "001"
    faculty: [jones]
  - id: "002"
    faculty: [jones]
`;
const fixture = (repositories = [repo()]) => {
  const reader = {
    list: vi.fn().mockResolvedValue(repositories),
    search: vi.fn().mockResolvedValue({ ids: [], incomplete: false }),
    resolveId: vi.fn().mockResolvedValue(repositories[0]),
    resolve: vi.fn().mockResolvedValue(repositories[0]),
    file: vi
      .fn()
      .mockImplementation((_repo: CourseRepository, path: string) =>
        Promise.resolve(path === "course.yml" ? courseYaml : termYaml)
      ),
    terms: vi.fn().mockResolvedValue(["27s1"])
  } satisfies RemoteRepositoryReader;
  const request = {
    userId: 42,
    organizations: [org],
    username: "jones" as string | null,
    locals: [],
    reader
  };
  return { reader, request, run: () => discoverRemoteCourses(request) };
};
describe("trusted read-only remote course discovery", () => {
  it.each([[[]], [["graider-course"]]])(
    "validates topic and legacy candidates %j with canonical ID and v1 logical repository semantics",
    async (topics) => {
      const f = fixture([repo(20, "csc1120", topics)]);
      const result = await f.run();
      expect(result.courses).toHaveLength(1);
      expect(result.courses[0]).toMatchObject({
        repositoryId: 20,
        code: "csc1020",
        title: "Data Structures",
        authorization: "authorized",
        localStatus: "remote_only",
        schemaVersion: 1
      });
      expect(f.reader.file.mock.calls.map((call) => call[1])).toEqual([
        "course.yml",
        "terms/27s1/term.yml"
      ]);
      expect(f.reader.file.mock.calls.filter((call) => call[1] === "course.yml")).toHaveLength(1);
    }
  );
  it.each([
    "pending",
    "oauth_approval_required",
    "sso_required",
    "forbidden",
    "network_unavailable"
  ] as const)("skips %s organization input", async (accessStatus) => {
    const f = fixture();
    f.request.organizations = [{ ...org, accessStatus }];
    expect((await f.run()).courses).toEqual([]);
    expect(f.reader.list).not.toHaveBeenCalled();
  });
  it("skips pending membership even with inconsistent accessible access status", async () => {
    const f = fixture();
    f.request.organizations = [{ ...org, membershipState: "pending" }];
    await f.run();
    expect(f.reader.list).not.toHaveBeenCalled();
  });
  it("retains valid identity-required candidates without substituting GitHub login", async () => {
    const f = fixture();
    f.request.username = null;
    expect((await f.run()).courses[0].authorization).toBe("faculty_identity_required");
    expect(f.reader.terms).not.toHaveBeenCalled();
  });
  it("does not authorize readable repositories without assigned MSOE sections", async () => {
    const f = fixture();
    f.request.username = "octocat";
    expect((await f.run()).courses[0].authorization).toBe("not_authorized");
  });
  it.each([
    [null, "missing_metadata"],
    ["course: [invalid", "invalid_metadata"],
    [courseYaml.replace("schema_version: 1", "schema_version: 2"), "unsupported_schema"],
    [courseYaml.replace("organization: csc1120", "organization: other"), "migration_required"],
    [courseYaml.replace("  repository: csc1020\n", ""), "invalid_metadata"],
    [
      courseYaml.replace("student_permission: admin", "student_permission: write"),
      "invalid_metadata"
    ]
  ])(
    "rejects invalid root metadata as %s / %s using canonical validation",
    async (content, status) => {
      const f = fixture([repo(20, "tagged", ["graider-course"])]);
      f.reader.file.mockResolvedValue(content);
      const result = await f.run();
      expect(result.courses).toHaveLength(0);
      expect(result.diagnostics[0].status).toBe(status);
    }
  );
  it("uses search only as a hint and always verifies root course metadata", async () => {
    const f = fixture([repo(20, "historical-custom-name")]);
    f.reader.search.mockResolvedValue({ ids: [20], incomplete: false });
    expect((await f.run()).courses[0].discoveryHints).toContain("code_search");
    expect(f.reader.file).toHaveBeenCalledWith(expect.objectContaining({ id: 20 }), "course.yml");
  });
  it("reports ambiguity even if only one candidate authorizes the faculty", async () => {
    const f = fixture([repo(), repo(21, "other-admin", ["graider-course"])]);
    expect(await f.run()).toMatchObject({
      courses: [],
      diagnostics: [expect.objectContaining({ status: "ambiguous" })]
    });
  });
  it("resolves old local origin by ID after a rename without duplicate course records", async () => {
    const f = fixture([repo(20, "renamed", ["graider-course"])]);
    const result = await discoverRemoteCourses({
      ...f.request,
      locals: [{ folderId: "local", origin: { owner: "csc1120", name: "old" } }]
    });
    expect(f.reader.resolve).toHaveBeenCalledWith("csc1120", "old");
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]).toMatchObject({
      repositoryId: 20,
      name: "renamed",
      localStatus: "registered_local",
      localFolderIds: ["local"]
    });
  });
  it.each([
    [null, "local_unverified"],
    [{ owner: "csc1120", name: "wrong" }, "local_origin_mismatch"]
  ] as const)(
    "reports a local origin attention state without claiming identity",
    async (origin, localStatus) => {
      const f = fixture();
      f.reader.resolve.mockResolvedValue(repo(99, "wrong"));
      f.reader.file.mockImplementation((candidate, metadataPath) =>
        Promise.resolve(
          candidate.id === 99 ? null : metadataPath === "course.yml" ? courseYaml : termYaml
        )
      );
      const result = await discoverRemoteCourses({
        ...f.request,
        locals: [
          {
            folderId: "local",
            origin,
            configuredCourse: { organization: "csc1120", code: "csc1020" }
          }
        ]
      });
      expect(result.courses[0]).toMatchObject({ localStatus, localFolderIds: [] });
    }
  );
  it("keeps archived repository metadata distinct from Graider lifecycle", async () => {
    const f = fixture([{ ...repo(), archived: true }]);
    expect((await f.run()).courses[0]).toMatchObject({
      archived: true,
      authorization: "authorized"
    });
  });
  it("preserves successful courses on scoped organization and search failures", async () => {
    const f = fixture();
    f.request.organizations = [{ ...org, organizationId: 11, login: "other" }, org];
    f.reader.list.mockRejectedValueOnce(new GithubOAuthError("rate_limited", "Wait and retry."));
    const result = await f.run();
    expect(result.status).toBe("partial_failure");
    expect(result.courses).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ organizationId: 11, status: "rate_limited" });
  });
  it("does not turn incomplete faculty metadata into not-authorized", async () => {
    const f = fixture();
    f.reader.terms.mockRejectedValue(new Error("private token"));
    const result = await f.run();
    expect(result.courses[0].authorization).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("private token");
  });
  it("large org filters 1500 student repositories before contents reads and bounds workers", async () => {
    const students = Array.from({ length: 1500 }, (_, index) =>
      repo(index + 100, `27s1-csc1020-lab01-student${index}`)
    );
    const candidates = Array.from({ length: 12 }, (_, index) =>
      repo(index + 2000, `tagged-${index}`, ["graider-course"])
    );
    const f = fixture([...students, ...candidates]);
    let active = 0;
    let peak = 0;
    f.reader.file.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return null;
    });
    const result = await f.run();
    expect(peak).toBeLessThanOrEqual(DISCOVERY_CONCURRENCY);
    expect(f.reader.file).toHaveBeenCalledTimes(candidates.length);
    expect(JSON.stringify(result)).not.toContain("student0");
  });
  it("has only read operations in the discovery dependency and no generic file IPC", () => {
    const source = fs.readFileSync("electron/remoteCourseDiscovery.ts", "utf8");
    expect(source).not.toMatch(
      /provideGithubClient|\.octokit|\.pushUpstream|\.createRepository|\.writeRepositoryFile|\.dispatchWorkflow/
    );
    const ipc = fs.readFileSync("electron/githubOAuthTypes.ts", "utf8");
    expect(ipc).not.toMatch(/getCourseMetadataPath|readRepositoryFile|token:/);
  });
});
describe("read-only local origin verification", () => {
  it.each([
    "https://github.com/csc1120/course.git",
    "git@github.com:csc1120/course.git",
    "ssh://git@github.com/csc1120/course.git"
  ])("accepts exact GitHub origin %s", (origin) =>
    expect(parseGithubOrigin(origin)).toEqual({ owner: "csc1120", name: "course" })
  );
  it.each([
    "https://token@github.com/org/repo",
    "https://github.com.evil/org/repo",
    "https://github.com/org/repo?token=x",
    "file:///tmp/course",
    "https://github.com/org/.."
  ])("rejects unsafe origin %s", (origin) => expect(parseGithubOrigin(origin)).toBeNull());
  it("uses bundled Git inspection only and rejects enclosing roots", async () => {
    const remoteUrl = vi.fn().mockResolvedValue("git@github.com:csc1120/course.git");
    const factory = {
      open: vi.fn().mockResolvedValue({ root: "/tmp/enclosing", remoteUrl })
    } as unknown as GitWorkspaceInspectionFactory;
    const result = await inspectLocalCourseOrigins(
      [{ id: "local", path: "/tmp/enclosing/nested" } as CourseFolderRecord],
      factory
    );
    expect(result[0].origin).toBeNull();
    expect(remoteUrl).not.toHaveBeenCalled();
  });
});
