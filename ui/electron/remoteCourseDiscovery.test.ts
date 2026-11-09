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
import os from "node:os";
import path from "node:path";

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
    revision: vi.fn().mockResolvedValue("a".repeat(40)),
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
  it.each([2, 3])(
    "does not authorize v1 courses through schema %s term metadata",
    async (version) => {
      const f = fixture();
      const v2Term =
        termYaml
          .replace("schema_version: 1", `schema_version: ${version}`)
          .replace("term:\n", "term:\n  status: draft\n  has_ever_been_active: false\n")
          .replaceAll(
            "    faculty: [jones]",
            "    faculty:\n      current: [{github_user_id: 42}]\n      former: []"
          ) + "coordinators:\n  current: [{github_user_id: 42}]\n  former: []\n";
      f.reader.file.mockImplementation((_repo, metadataPath) =>
        Promise.resolve(metadataPath === "course.yml" ? courseYaml : v2Term)
      );
      expect((await f.run()).courses[0].authorization).toBe("unavailable");
    }
  );

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
    [courseYaml.replace("schema_version: 1", "schema_version: 2"), "invalid_metadata"],
    [
      courseYaml.replace("schema_version: 1", "schema_version: 2") +
        "faculty_directory:\n  - institutional_username: jones\n    github_user_id: 42\n    github_login: current-login\n    github_login_history: []\nfallback_administrator:\n  github_user_id: 42\n",
      "invalid_metadata"
    ],
    [courseYaml.replace("schema_version: 1", "schema_version: 3"), "unsupported_schema"],
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
    expect(f.reader.file).toHaveBeenCalledWith(
      expect.objectContaining({ id: 20 }),
      "course.yml",
      "a".repeat(40)
    );
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
  it.each(["exact", "alias", "nested", "sibling"])(
    "uses native exact-root identity for a registered %s path",
    async (kind) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-origin-root-"));
      const repo = path.join(root, "repo");
      const nested = path.join(repo, "nested");
      const sibling = path.join(root, "sibling");
      const alias = path.join(root, "alias");
      fs.mkdirSync(nested, { recursive: true });
      fs.mkdirSync(sibling);
      fs.symlinkSync(repo, alias, "dir");
      const remoteUrl = vi.fn().mockResolvedValue("git@github.com:csc1120/course.git");
      const factory = {
        open: vi.fn().mockResolvedValue({ root: await fs.promises.realpath(repo), remoteUrl })
      } as unknown as GitWorkspaceInspectionFactory;
      try {
        const folder = { exact: repo, alias, nested, sibling }[kind];
        const result = await inspectLocalCourseOrigins(
          [{ id: "local", path: folder } as CourseFolderRecord],
          factory
        );
        if (kind === "exact" || kind === "alias") {
          expect(result[0].origin).toEqual({ owner: "csc1120", name: "course" });
          expect(remoteUrl).toHaveBeenCalledExactlyOnceWith("origin");
        } else {
          expect(result[0].origin).toBeNull();
          expect(remoteUrl).not.toHaveBeenCalled();
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  );
});

it("rediscovers a cut-over registration by immutable catalog ID without consulting a legacy origin", async () => {
  const repository = repo(20, "unusual-repository-name");
  const reader: RemoteRepositoryReader = {
    revision: async () => "a".repeat(40),
    list: async () => [],
    search: async () => ({ ids: [], incomplete: false }),
    resolve: vi.fn(),
    resolveId: vi.fn(async () => repository),
    file: async (_repo, file) => (file === "course.yml" ? courseYaml : termYaml),
    terms: async () => ["27s1"]
  };
  const result = await discoverRemoteCourses({
    userId: 42,
    organizations: [org],
    username: "jones",
    locals: [],
    managedRegistrations: [{ repositoryId: 20, organizationId: 10, folderIds: ["registered"] }],
    reader
  });
  expect(result.courses).toHaveLength(1);
  expect(result.courses[0]).toMatchObject({
    repositoryId: 20,
    localFolderIds: ["registered"],
    localStatus: "registered_local"
  });
  expect(reader.resolveId).toHaveBeenCalledWith(20);
  expect(reader.resolve).not.toHaveBeenCalled();
});

it("measures targeted access independently of latency-injected student repository pagination", async () => {
  const STUDENT_COUNT = 1200;
  const PAGE_SIZE = 100;
  const NETWORK_LATENCY_MS = 10;
  const repositories = [
    repo(),
    ...Array.from({ length: STUDENT_COUNT }, (_, index) =>
      repo(index + 100, `27s1-csc1020-lab1-student-${index}`)
    )
  ];
  const otherOrg = { ...org, organizationId: 11, login: "csc2220" };
  const otherRepo = {
    ...repo(21),
    organizationId: 11,
    owner: otherOrg.login,
    name: otherOrg.login,
    fullName: `${otherOrg.login}/${otherOrg.login}`
  };
  const f = fixture(repositories);
  let requests = 0;
  const network = async <T>(value: T): Promise<T> => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, NETWORK_LATENCY_MS));
    return value;
  };
  f.reader.list.mockImplementation(async (login: string) => {
    const listed =
      login === org.login
        ? repositories
        : [
            otherRepo,
            ...repositories.slice(1).map((entry) => ({
              ...entry,
              organizationId: otherOrg.organizationId,
              owner: otherOrg.login
            }))
          ];
    for (let offset = 0; offset < listed.length; offset += PAGE_SIZE)
      await network(listed.slice(offset, offset + PAGE_SIZE));
    return listed;
  });
  f.reader.search.mockImplementation(() => network({ ids: [], incomplete: false }));
  f.reader.resolveId.mockImplementation((id: number) =>
    network(id === otherRepo.id ? otherRepo : repo())
  );
  f.reader.revision.mockImplementation(() => network("a".repeat(40)));
  f.reader.terms.mockImplementation(() => network(["27s1"]));
  f.reader.file.mockImplementation((_repo, name) =>
    network(
      name === "course.yml"
        ? courseYaml.replace("organization: csc1120", `organization: ${_repo.owner}`)
        : termYaml
    )
  );
  const request = {
    ...f.request,
    organizations: [org, otherOrg],
    managedRegistrations: [
      { repositoryId: 20, organizationId: 10, folderIds: ["registered"] },
      { repositoryId: 21, organizationId: 11, folderIds: ["other-course"] }
    ]
  };
  const before = performance.now();
  const discovered = await discoverRemoteCourses(request);
  expect(discovered.courses).toHaveLength(2);
  expect(discovered.courses.every((course) => course.authorization === "authorized")).toBe(true);
  const broadMs = performance.now() - before;
  const broadRequests = requests;
  requests = 0;
  f.reader.list.mockClear();
  f.reader.search.mockClear();
  const selected = performance.now();
  expect(
    (await discoverRemoteCourses({ ...request, organizations: [org], targeted: true })).courses[0]
  ).toMatchObject({
    authorization: "authorized",
    localFolderIds: ["registered"],
    schemaVersion: 1
  });
  const selectedMs = performance.now() - selected;
  expect(f.reader.list).not.toHaveBeenCalled();
  expect(f.reader.search).not.toHaveBeenCalled();
  expect(requests).toBeLessThan(broadRequests);
  console.info(
    "Course startup fixture measurement",
    JSON.stringify({
      students: STUDENT_COUNT,
      networkLatencyMs: NETWORK_LATENCY_MS,
      broadMs,
      selectedMs,
      broadRequests,
      selectedRequests: requests
    })
  );
});
