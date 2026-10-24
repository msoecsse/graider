// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapManagedCourse,
  managedCoursePath,
  loadManagedCatalog,
  inspectManagedCourse,
  MANAGED_BOOTSTRAP_CONCURRENCY,
  type ManagedBootstrapRequest
} from "./managedCourses.js";
import type { RemoteCourse } from "./remoteCourseTypes.js";
import type { CourseRepository } from "./githubRemoteRepositories.js";
import { GithubOAuthError } from "./githubOAuthCallback.js";
const courseYaml = `schema_version: 1
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

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const fixture = () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "graider-managed-test-"));
  roots.push(userData);
  const repo: CourseRepository = {
    id: 1342086585,
    nodeId: "R_1",
    organizationId: 10,
    owner: "csc1120",
    name: "renamed",
    fullName: "csc1120/renamed",
    url: "https://github.com/csc1120/renamed",
    defaultBranch: "master",
    visibility: "private",
    archived: false,
    disabled: false,
    topics: []
  };
  const course: RemoteCourse = {
    repositoryId: repo.id,
    nodeId: repo.nodeId,
    organizationId: 10,
    organizationLogin: "csc1120",
    name: "old",
    fullName: "csc1120/old",
    url: "https://github.com/csc1120/old",
    defaultBranch: "master",
    visibility: "private",
    archived: false,
    code: "csc1020",
    title: "Data Structures",
    schemaVersion: 1,
    discoveryHints: ["topic"],
    authorization: "authorized",
    localStatus: "remote_only",
    localFolderIds: [],
    diagnostics: []
  };
  const reader = {
    list: vi.fn(),
    search: vi.fn(),
    resolveId: vi.fn().mockResolvedValue(repo),
    resolve: vi.fn().mockResolvedValue(repo),
    file: vi
      .fn()
      .mockImplementation((_repo, file) =>
        Promise.resolve(file === "course.yml" ? courseYaml : termYaml)
      ),
    terms: vi.fn().mockResolvedValue(["27s1"])
  };
  const inspect = vi.fn().mockImplementation(() =>
    Promise.resolve({
      head: { kind: "attached", branch: "master", commit: "a".repeat(40) },
      workingTree: { trackedChanges: [], stagedChanges: [], untrackedPaths: [], conflicts: [] }
    })
  );
  const remoteUrl = vi.fn().mockResolvedValue(repo.url + ".git");
  const factory = {
    open: vi.fn().mockImplementation((root) => Promise.resolve({ root, inspect, remoteUrl })),
    clone: vi.fn().mockImplementation(async ({ destination }) => {
      fs.mkdirSync(path.join(destination, ".git"), { recursive: true });
      fs.writeFileSync(
        path.join(destination, ".git", "config"),
        '[remote "origin"]\nurl = ' + repo.url + ".git"
      );
      fs.writeFileSync(path.join(destination, "course.yml"), courseYaml);
      fs.mkdirSync(path.join(destination, "terms", "27s1"), { recursive: true });
      fs.writeFileSync(path.join(destination, "terms", "27s1", "term.yml"), termYaml);
    })
  };
  const controller = new AbortController();
  const revalidateSession = vi.fn().mockResolvedValue(true);
  const request: { -readonly [K in keyof ManagedBootstrapRequest]: ManagedBootstrapRequest[K] } = {
    userData,
    userId: 42,
    course,
    username: "jones",
    reader,
    signal: controller.signal,
    revalidateSession,
    authenticate: () => ({ factory, authentication: { id: "operation-context" } })
  };
  return {
    request,
    repo,
    reader,
    factory,
    inspect,
    remoteUrl,
    revalidateSession,
    controller,
    final: managedCoursePath(userData, 42, repo.id),
    run: () => bootstrapManagedCourse(request)
  };
};
describe("identity-scoped managed storage and catalog", () => {
  it("uses userData + immutable numeric identities exclusively", () => {
    const f = fixture();
    expect(f.final).toBe(
      path.join(f.request.userData, "managed-courses", "42", "1342086585", "repo")
    );
    expect(managedCoursePath(f.request.userData, 43, f.repo.id)).not.toBe(f.final);
    expect(managedCoursePath(f.request.userData, 42, f.repo.id)).toBe(f.final);
    expect(f.final).not.toMatch(/csc1120|renamed|Data Structures/);
  });
  it.each([NaN, Infinity, -1, 0, 1.2, Number.MAX_SAFE_INTEGER + 1, "../escape", "42/../../escape"])(
    "rejects unsafe identity %s",
    (id) => {
      expect(() => managedCoursePath("/tmp", id as number, 20)).toThrow();
      expect(() => managedCoursePath("/tmp", 42, id as number)).toThrow();
    }
  );
  it("loads empty catalog, persists validated entry, and keeps accounts separate", async () => {
    const f = fixture();
    expect(loadManagedCatalog(f.request.userData, 42).courses).toEqual({});
    expect((await f.run()).status).toBe("ready");
    const entry = loadManagedCatalog(f.request.userData, 42).courses[String(f.repo.id)];
    expect(entry).toMatchObject({
      userId: 42,
      repositoryId: f.repo.id,
      managedPath: f.final,
      name: "renamed",
      defaultBranch: "master",
      bootstrap: { status: "ready" }
    });
    expect(entry.lastValidatedAt).not.toBeNull();
    expect(loadManagedCatalog(f.request.userData, 43).courses).toEqual({});
    expect(JSON.stringify(entry)).not.toMatch(/token|secret|verifier|operation-context/);
  });
  it("does not blindly trust ready catalog when worktree disappears", async () => {
    const f = fixture();
    await f.run();
    fs.rmSync(f.final, { recursive: true });
    expect((await f.run()).status).toBe("ready");
    expect(f.factory.clone).toHaveBeenCalledTimes(2);
  });
  it("preserves corrupt catalog and blocks bootstrap", async () => {
    const f = fixture();
    loadManagedCatalog(f.request.userData, 42);
    const catalog = path.join(path.dirname(path.dirname(f.final)), "catalog.json");
    fs.writeFileSync(catalog, "{broken");
    expect((await f.run()).status).toBe("needs_attention");
    expect(fs.readFileSync(catalog, "utf8")).toBe("{broken");
    expect(f.factory.clone).not.toHaveBeenCalled();
  });
  it.each([
    "managed-courses",
    "managed-courses/42",
    "managed-courses/42/1342086585",
    "managed-courses/42/.bootstrap"
  ])("rejects symlink directory %s without deleting target", async (relative) => {
    const f = fixture();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "graider-outside-"));
    roots.push(outside);
    fs.writeFileSync(path.join(outside, "keep"), "keep");
    const link = path.join(f.request.userData, relative);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(outside, link);
    expect((await f.run()).status).toBe("needs_attention");
    expect(fs.readFileSync(path.join(outside, "keep"), "utf8")).toBe("keep");
    expect(f.factory.clone).not.toHaveBeenCalled();
  });
});
describe("revalidation and safe clone transaction", () => {
  it("re-resolves ID, clones current locator through authenticated semantic Git, promotes only after validation", async () => {
    const f = fixture();
    f.factory.clone.mockImplementationOnce(
      async ({ destination, remote, authentication, checkout }) => {
        expect(fs.existsSync(f.final)).toBe(false);
        expect(destination).toContain(".bootstrap/course-bootstrap-");
        expect(remote).toBe(f.repo.url + ".git");
        expect(authentication).toEqual({ id: "operation-context" });
        expect(checkout).toBe("default");
        fs.mkdirSync(path.join(destination, "terms", "27s1"), { recursive: true });
        fs.mkdirSync(path.join(destination, ".git"));
        fs.writeFileSync(path.join(destination, "course.yml"), courseYaml);
        fs.writeFileSync(path.join(destination, "terms", "27s1", "term.yml"), termYaml);
      }
    );
    expect((await f.run()).status).toBe("ready");
    expect(f.reader.resolveId).toHaveBeenCalledWith(f.repo.id);
    expect(f.revalidateSession).toHaveBeenCalledTimes(3);
    expect(fs.existsSync(path.join(f.final, "course.yml"))).toBe(true);
    expect(fs.readdirSync(path.join(path.dirname(path.dirname(f.final)), ".bootstrap"))).toEqual(
      []
    );
  });
  it("uses the latest ID-resolved locator when rename occurs during revalidation", async () => {
    const f = fixture();
    const renamed = {
      ...f.repo,
      name: "latest",
      fullName: "csc1120/latest",
      url: "https://github.com/csc1120/latest"
    };
    f.reader.resolveId.mockResolvedValueOnce(f.repo).mockResolvedValue(renamed);
    f.remoteUrl.mockResolvedValue(renamed.url + ".git");
    f.reader.resolve.mockResolvedValue(renamed);
    expect((await f.run()).status).toBe("ready");
    expect(f.factory.clone.mock.calls[0][0].remote).toBe(renamed.url + ".git");
    expect(fs.existsSync(f.final)).toBe(true);
  });
  it("reuses clean existing clone without clone/fetch/pull after rename", async () => {
    const f = fixture();
    await f.run();
    f.reader.resolveId.mockResolvedValue({ ...f.repo, name: "another-name" });
    expect((await f.run()).status).toBe("ready");
    expect(f.factory.clone).toHaveBeenCalledOnce();
    expect(f.factory.open).toHaveBeenLastCalledWith(f.final);
  });
  it.each(["not_authorized", "faculty_identity_required", "unavailable"] as const)(
    "never clones %s candidates",
    async (authorization) => {
      const f = fixture();
      f.request.course = { ...f.request.course, authorization };
      expect((await f.run()).status).toBe("needs_attention");
      expect(f.factory.clone).not.toHaveBeenCalled();
    }
  );
  it("rejects stale account or missing capabilities before cloning", async () => {
    const f = fixture();
    f.revalidateSession.mockResolvedValue(false);
    expect((await f.run()).status).toBe("needs_attention");
    expect(f.reader.resolveId).not.toHaveBeenCalled();
    expect(f.factory.clone).not.toHaveBeenCalled();
  });
  it("blocks organization transfer", async () => {
    const f = fixture();
    f.reader.resolveId.mockResolvedValue({ ...f.repo, organizationId: 99 });
    expect(await f.run()).toMatchObject({
      status: "needs_attention",
      diagnostic: expect.stringMatching(/migration/)
    });
    expect(f.factory.clone).not.toHaveBeenCalled();
  });
  it("blocks lost faculty authorization and invalid course metadata", async () => {
    const f = fixture();
    f.reader.file.mockResolvedValue("invalid: yaml");
    expect((await f.run()).status).toBe("needs_attention");
    expect(f.factory.clone).not.toHaveBeenCalled();
  });
  it("blocks lost faculty assignments", async () => {
    const f = fixture();
    f.request.username = "other";
    expect((await f.run()).status).toBe("needs_attention");
    expect(f.factory.clone).not.toHaveBeenCalled();
  });
  it.each(["ENOSPC", "EACCES", "EROFS", "network"])(
    "handles %s failure without final clone, leaks or leftover owned temporary",
    async (code) => {
      const f = fixture();
      f.factory.clone.mockRejectedValue(
        Object.assign(new Error("gho_SECRET https://token@github.com"), { code })
      );
      const result = await f.run();
      expect(result.status).toBe("failed");
      expect(result.retryable).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(/SECRET|token@/);
      if (code === "ENOSPC") expect(result.diagnostic).toMatch(/disk space/);
      if (code === "EACCES" || code === "EROFS") expect(result.diagnostic).toMatch(/permissions/);
      expect(fs.existsSync(f.final)).toBe(false);
      expect(fs.readdirSync(path.join(path.dirname(path.dirname(f.final)), ".bootstrap"))).toEqual(
        []
      );
    }
  );
  it.each([
    "network_unavailable",
    "rate_limited",
    "repository_inaccessible",
    "sso_required",
    "invalid_credential"
  ])("sanitizes scoped GitHub %s failure", async (code) => {
    const f = fixture();
    f.reader.resolveId.mockRejectedValue(new GithubOAuthError(code, "private token"));
    expect(await f.run()).toMatchObject({ status: "failed", retryable: true });
    expect(JSON.stringify(await f.run())).not.toContain("private token");
  });
  it("retries failed transport without restart", async () => {
    const f = fixture();
    f.factory.clone.mockRejectedValueOnce(new Error("offline"));
    expect((await f.run()).status).toBe("failed");
    expect((await f.run()).status).toBe("ready");
  });
  it("reports promotion failure without a canonical clone", async () => {
    const f = fixture();
    const rename = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw Object.assign(new Error(), { code: "ENOSPC" });
    });
    const result = await f.run();
    rename.mockRestore();
    expect(result.status).toBe("failed");
    expect(fs.existsSync(f.final)).toBe(false);
  });
  it("discards late account results and cleans only the owned temp", async () => {
    const f = fixture();
    const clone = f.factory.clone.getMockImplementation()!;
    f.factory.clone.mockImplementationOnce(async (input) => {
      await clone(input);
      f.controller.abort();
    });
    expect((await f.run()).status).toBe("failed");
    expect(fs.existsSync(f.final)).toBe(false);
  });
});
describe("existing destination and clone validation", () => {
  it("preserves unknown non-Git contents", async () => {
    const f = fixture();
    fs.mkdirSync(f.final, { recursive: true });
    fs.writeFileSync(path.join(f.final, "keep"), "keep");
    f.factory.open.mockRejectedValue(new Error("not git"));
    expect((await f.run()).status).toBe("needs_attention");
    expect(fs.readFileSync(path.join(f.final, "keep"), "utf8")).toBe("keep");
    expect(f.factory.clone).not.toHaveBeenCalled();
  });
  it.each([null, "https://token@github.com/org/repo.git", "file:///tmp/repo"])(
    "requires credential-free GitHub origin %s",
    async (origin) => {
      const f = fixture();
      f.remoteUrl.mockResolvedValue(origin);
      expect((await f.run()).status).toBe("needs_attention");
      expect(fs.existsSync(f.final)).toBe(false);
    }
  );
  it.each(["MERGE_HEAD", "rebase-merge", "commondir"])(
    "blocks unexpected Git state %s",
    async (name) => {
      const f = fixture();
      await f.run();
      fs.writeFileSync(path.join(f.final, ".git", name), "external-or-operation-state");
      expect((await f.run()).status).toBe("needs_attention");
      expect(f.factory.clone).toHaveBeenCalledOnce();
    }
  );
  it("rejects a .git file pointing outside managed storage", async () => {
    const f = fixture();
    await f.run();
    fs.rmSync(path.join(f.final, ".git"), { recursive: true });
    fs.writeFileSync(path.join(f.final, ".git"), "gitdir: /outside");
    expect((await f.run()).status).toBe("needs_attention");
    expect(f.factory.clone).toHaveBeenCalledOnce();
  });
  it("preserves known organization binding across discoveries", async () => {
    const f = fixture();
    await f.run();
    f.request.course = { ...f.request.course, organizationId: 99 };
    f.reader.resolveId.mockResolvedValue({ ...f.repo, organizationId: 99 });
    expect((await f.run()).status).toBe("needs_attention");
    expect(f.factory.clone).toHaveBeenCalledOnce();
    expect(
      loadManagedCatalog(f.request.userData, f.request.userId).courses[String(f.repo.id)]
        .organizationId
    ).toBe(10);
    expect((await f.run()).status).toBe("needs_attention");
  });
  it("wrong repository at canonical destination is preserved", async () => {
    const f = fixture();
    await f.run();
    f.reader.resolve.mockResolvedValue({ ...f.repo, id: 99 });
    expect((await f.run()).status).toBe("needs_attention");
    expect(fs.existsSync(f.final)).toBe(true);
    expect(f.factory.clone).toHaveBeenCalledOnce();
  });
  it.each(["trackedChanges", "stagedChanges", "untrackedPaths", "conflicts"])(
    "preserves cache with %s",
    async (field) => {
      const f = fixture();
      await f.run();
      const clean = await f.inspect();
      f.inspect.mockResolvedValue({
        ...clean,
        workingTree: { ...clean.workingTree, [field]: ["change"] }
      });
      expect((await f.run()).status).toBe("needs_attention");
      expect(fs.existsSync(f.final)).toBe(true);
      expect(f.factory.clone).toHaveBeenCalledOnce();
    }
  );
  it.each(["detached", "unborn"])("rejects %s HEAD", async (kind) => {
    const f = fixture();
    const clean = await f.inspect();
    f.inspect.mockResolvedValue({ ...clean, head: { kind } });
    expect((await f.run()).status).toBe("needs_attention");
    expect(fs.existsSync(f.final)).toBe(false);
  });
  it("rejects changed checked-out metadata using canonical validation", async () => {
    const f = fixture();
    const clone = f.factory.clone.getMockImplementation()!;
    f.factory.clone.mockImplementationOnce(async (input) => {
      await clone(input);
      fs.writeFileSync(
        path.join(input.destination, "course.yml"),
        courseYaml.replace("Data Structures", "Changed")
      );
    });
    expect((await f.run()).status).toBe("needs_attention");
    expect(fs.existsSync(f.final)).toBe(false);
  });
  it("read-only inspection resolves trusted IDs and exposes no paths", async () => {
    const f = fixture();
    const bootstrap = await f.run();
    const result = inspectManagedCourse(f.request.userData, f.request.userId, {
      ...f.request.course,
      bootstrap
    });
    expect(result).toMatchObject({ repositoryId: f.repo.id, code: "csc1020", terms: ["27s1"] });
    expect(JSON.stringify(result)).not.toContain(f.request.userData);
    expect(() =>
      inspectManagedCourse(f.request.userData, 99, { ...f.request.course, bootstrap })
    ).toThrow();
  });
  it("exposes no remote mutation, arbitrary clone IPC or legacy registry writes", () => {
    const source = fs.readFileSync("electron/managedCourses.ts", "utf8");
    expect(source).not.toMatch(
      /execFile|spawn\(|pushUpstream|createRepository|writeRepositoryFile|dispatchWorkflow|saveCourseRegistry|pullUpstream/
    );
    expect(fs.readFileSync("electron/githubOAuthTypes.ts", "utf8")).not.toMatch(
      /clone\(|destination|token:/
    );
  });
  it("bounds overlapping bootstraps globally and isolates failures", async () => {
    const fixtures = Array.from({ length: 6 }, fixture);
    let active = 0;
    let peak = 0;
    for (const [index, f] of fixtures.entries()) {
      f.request.userId = index + 50;
      const clone = f.factory.clone.getMockImplementation()!;
      f.factory.clone.mockImplementationOnce(async (input) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        if (index === 0) throw new Error("network");
        await clone(input);
      });
    }
    const results = await Promise.all(fixtures.map((f) => f.run()));
    expect(peak).toBe(MANAGED_BOOTSTRAP_CONCURRENCY);
    expect(results[0].status).toBe("failed");
    expect(results.slice(1).every((result) => result.status === "ready")).toBe(true);
  });
});
