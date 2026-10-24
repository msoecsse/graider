// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapManagedCourse,
  synchronizeManagedCourse,
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
        fs.writeFileSync(
          path.join(destination, ".git", "config"),
          "[core]\nrepositoryformatversion = 0\n"
        );
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

describe("managed synchronization classification and preservation", () => {
  const ready = async (userId = 42) => {
    const f = fixture();
    f.request.userId = userId;
    await f.run();
    const clean = {
      ...(await f.inspect()),
      upstream: {
        kind: "configured",
        remote: "origin",
        branch: "origin/master",
        ahead: 0,
        behind: 0,
        relation: "current"
      }
    };
    f.inspect.mockResolvedValue(clean);
    const fetchOrigin = vi.fn().mockResolvedValue(undefined);
    const fastForwardUpstream = vi.fn().mockImplementation(async () => {
      f.inspect.mockResolvedValue(clean);
    });
    const onProgress = vi.fn();
    const open = vi.fn().mockImplementation((root) =>
      Promise.resolve({
        root,
        inspect: f.inspect,
        remoteUrl: f.remoteUrl,
        fetchOrigin,
        fastForwardUpstream
      })
    );
    const request = {
      ...f.request,
      onProgress,
      authenticate: () => ({ authentication: { id: "operation" }, factory: { ...f.factory, open } })
    };
    return {
      ...f,
      clean,
      request,
      fetchOrigin,
      fastForwardUpstream,
      onProgress,
      sync: () => synchronizeManagedCourse(request)
    };
  };
  it("bounds overlapping synchronization across different courses and isolates a failed fetch", async () => {
    const fixtures = await Promise.all(
      Array.from({ length: 5 }, (_value, index) => ready(index + 50))
    );
    let active = 0;
    let peak = 0;
    for (const [index, f] of fixtures.entries()) {
      f.fetchOrigin.mockImplementation(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        if (index === 0) throw new Error("offline");
      });
    }
    const results = await Promise.all(fixtures.map((f) => f.sync()));
    expect(peak).toBe(MANAGED_BOOTSTRAP_CONCURRENCY);
    expect(results[0].status).toBe("failed");
    expect(results.slice(1).every((result) => result.status === "up_to_date")).toBe(true);
  });
  it("retry reinspects local changes and only resumes synchronization after manual correction", async () => {
    const f = await ready();
    f.inspect.mockResolvedValue({
      ...f.clean,
      workingTree: { ...f.clean.workingTree, untrackedPaths: ["evidence"] }
    });
    expect((await f.sync()).reason).toBe("local_changes");
    expect((await f.sync()).reason).toBe("local_changes");
    expect(f.fastForwardUpstream).not.toHaveBeenCalled();
    f.inspect.mockResolvedValue(f.clean);
    expect((await f.sync()).status).toBe("up_to_date");
  });
  it("fetches current state, reports success without worktree update, and reuses schema-1 catalog", async () => {
    const f = await ready();
    expect(await f.sync()).toMatchObject({
      status: "up_to_date",
      currentCommit: "a".repeat(40),
      ahead: 0,
      behind: 0
    });
    expect(f.onProgress.mock.calls.map(([state]) => state.status)).toEqual([
      "checking",
      "fetching"
    ]);
    expect(f.fetchOrigin).toHaveBeenCalledWith({ authentication: { id: "operation" } });
    expect(f.fastForwardUpstream).not.toHaveBeenCalled();
    expect(loadManagedCatalog(f.request.userData, 42).schemaVersion).toBe(1);
    expect(f.factory.clone).toHaveBeenCalledOnce();
  });
  it("uses post-fetch relationship, then validates after fast-forward", async () => {
    const f = await ready();
    f.fetchOrigin.mockImplementation(async () => {
      f.inspect.mockResolvedValue({
        ...f.clean,
        upstream: { ...f.clean.upstream, behind: 2, relation: "behind" }
      });
    });
    expect((await f.sync()).status).toBe("updated");
    expect(f.fastForwardUpstream).toHaveBeenCalledWith({
      expectedHead: "a".repeat(40),
      expectedBranch: "master",
      signal: f.request.signal
    });
    expect(f.onProgress.mock.calls.map(([state]) => state.status)).toEqual([
      "checking",
      "fetching",
      "updating"
    ]);
  });
  it.each(["trackedChanges", "stagedChanges", "untrackedPaths", "conflicts"])(
    "fetches but preserves %s",
    async (field) => {
      const f = await ready();
      f.inspect.mockResolvedValue({
        ...f.clean,
        workingTree: { ...f.clean.workingTree, [field]: ["local"] }
      });
      expect(await f.sync()).toMatchObject({ status: "needs_attention", reason: "local_changes" });
      expect(f.fetchOrigin).toHaveBeenCalledOnce();
      expect(f.fastForwardUpstream).not.toHaveBeenCalled();
      expect(fs.existsSync(f.final)).toBe(true);
    }
  );
  it.each([
    ["ahead", 2, 0, "local_ahead"],
    ["diverged", 1, 2, "diverged"]
  ] as const)("preserves %s history", async (relation, ahead, behind, reason) => {
    const f = await ready();
    f.inspect.mockResolvedValue({
      ...f.clean,
      upstream: { ...f.clean.upstream, relation, ahead, behind }
    });
    expect(await f.sync()).toMatchObject({ status: "needs_attention", reason, ahead, behind });
    expect(f.fastForwardUpstream).not.toHaveBeenCalled();
  });
  it.each([
    ["head", { kind: "detached", commit: "a".repeat(40) }, "detached_head"],
    ["head", { kind: "attached", branch: "old", commit: "a".repeat(40) }, "default_branch_changed"],
    ["upstream", { kind: "missing" }, "upstream_missing"],
    [
      "upstream",
      { kind: "configured", remote: "other", branch: "other/master", relation: "current" },
      "upstream_missing"
    ]
  ])("preserves unexpected %s / %s", async (field, value, reason) => {
    const f = await ready();
    f.inspect.mockResolvedValue({ ...f.clean, [field as string]: value });
    expect(await f.sync()).toMatchObject({ status: "needs_attention", reason });
    expect(f.fastForwardUpstream).not.toHaveBeenCalled();
  });
  it.each([
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-merge",
    "rebase-apply",
    "sequencer",
    "BISECT_LOG",
    "commondir",
    "objects/info/alternates"
  ])("blocks fetch with %s", async (name) => {
    const f = await ready();
    const file = path.join(f.final, ".git", name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "preserve");
    expect((await f.sync()).status).toBe("needs_attention");
    expect(f.fetchOrigin).not.toHaveBeenCalled();
    expect(fs.readFileSync(file, "utf8")).toBe("preserve");
  });
  it("blocks organization transfer even when discovery accepts its new organization", async () => {
    const f = await ready();
    f.request.course = { ...f.request.course, organizationId: 99 };
    f.reader.resolveId.mockResolvedValue({ ...f.repo, organizationId: 99 });
    expect(await f.sync()).toMatchObject({ reason: "organization_transfer" });
    expect(f.fetchOrigin).not.toHaveBeenCalled();
  });
  it("rename reuses the canonical path and refreshes catalog locator", async () => {
    const f = await ready();
    f.reader.resolveId.mockResolvedValue({
      ...f.repo,
      name: "new-name",
      fullName: "csc1120/new-name"
    });
    expect((await f.sync()).status).toBe("up_to_date");
    expect(loadManagedCatalog(f.request.userData, 42).courses[String(f.repo.id)]).toMatchObject({
      name: "new-name",
      managedPath: f.final
    });
  });
  it("blocks wrong origin identity and symlinks before fetch", async () => {
    const f = await ready();
    f.reader.resolve.mockResolvedValue({ ...f.repo, id: 99 });
    expect((await f.sync()).status).toBe("needs_attention");
    expect(f.fetchOrigin).not.toHaveBeenCalled();
    f.reader.resolve.mockResolvedValue(f.repo);
    fs.symlinkSync(path.join(f.final, "course.yml"), path.join(f.final, "link"));
    expect((await f.sync()).status).toBe("needs_attention");
    expect(f.fetchOrigin).not.toHaveBeenCalled();
  });
  it("lost faculty authorization blocks fetch without deleting cache", async () => {
    const f = await ready();
    f.request.username = "unauthorized";
    expect(await f.sync()).toMatchObject({ reason: "authorization_lost" });
    expect(f.fetchOrigin).not.toHaveBeenCalled();
    expect(fs.existsSync(f.final)).toBe(true);
  });
  it.each([
    ["repository_inaccessible", "remote_unavailable"],
    ["network_unavailable", "network_failure"],
    ["rate_limited", "rate_limited"],
    ["invalid_credential", "authentication_failed"]
  ])("normalizes %s without leaking provider errors", async (code, reason) => {
    const f = await ready();
    f.reader.resolveId.mockRejectedValue(
      new GithubOAuthError(code, "SECRET /private/absolute/path")
    );
    expect(await f.sync()).toMatchObject({ status: "failed", reason, retryable: true });
    expect(JSON.stringify(await f.sync())).not.toMatch(/SECRET|absolute/);
    expect(fs.existsSync(f.final)).toBe(true);
  });
  it("reinspects a refused update without attempting recovery", async () => {
    const f = await ready();
    f.inspect.mockResolvedValue({
      ...f.clean,
      upstream: { ...f.clean.upstream, relation: "behind", behind: 1 }
    });
    f.fastForwardUpstream.mockImplementation(async () => {
      f.inspect.mockResolvedValue({
        ...f.clean,
        upstream: { ...f.clean.upstream, relation: "diverged", behind: 1, ahead: 1 }
      });
      throw new Error("race");
    });
    expect(await f.sync()).toMatchObject({ reason: "diverged" });
    expect(f.fastForwardUpstream).toHaveBeenCalledOnce();
  });
  it("keeps successfully updated remote state when local metadata is invalid", async () => {
    const f = await ready();
    f.inspect.mockResolvedValue({
      ...f.clean,
      upstream: { ...f.clean.upstream, relation: "behind", behind: 1 }
    });
    f.fastForwardUpstream.mockImplementation(async () => {
      fs.writeFileSync(path.join(f.final, "course.yml"), "invalid metadata");
      f.inspect.mockResolvedValue(f.clean);
    });
    expect(await f.sync()).toMatchObject({ reason: "invalid_remote_metadata" });
    expect(fs.readFileSync(path.join(f.final, "course.yml"), "utf8")).toBe("invalid metadata");
  });
  it("does not report success when the worktree changes during final authorization validation", async () => {
    const f = await ready();
    let checks = 0;
    f.revalidateSession.mockImplementation(async () => {
      checks += 1;
      if (checks === 3)
        f.inspect.mockResolvedValue({
          ...f.clean,
          workingTree: { ...f.clean.workingTree, stagedChanges: ["late local change"] }
        });
      return true;
    });
    expect(await f.sync()).toMatchObject({ status: "needs_attention", reason: "local_changes" });
  });
  it("returns newly validated metadata rather than stale discovery titles", async () => {
    const f = await ready();
    const changed = courseYaml.replace("Data Structures", "New synchronized title");
    fs.writeFileSync(path.join(f.final, "course.yml"), changed);
    f.reader.file.mockImplementation((_repo, file) =>
      Promise.resolve(file === "course.yml" ? changed : termYaml)
    );
    expect(await f.sync()).toMatchObject({
      status: "up_to_date",
      metadata: { code: "csc1020", title: "New synchronized title" }
    });
  });
  it("late aborted fetch cannot persist sync success", async () => {
    const f = await ready();
    const catalog = path.join(path.dirname(path.dirname(f.final)), "catalog.json");
    const previous = fs.readFileSync(catalog, "utf8");
    f.fetchOrigin.mockImplementation(async () => {
      f.controller.abort();
    });
    await f.sync();
    expect(fs.readFileSync(catalog, "utf8")).toBe(previous);
    expect(f.fastForwardUpstream).not.toHaveBeenCalled();
  });
  it("serializes overlapping bootstrap and synchronization for the same cache", async () => {
    const f = await ready();
    let finish!: () => void;
    f.fetchOrigin.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const first = f.sync();
    await vi.waitFor(() => expect(f.fetchOrigin).toHaveBeenCalledOnce());
    const second = bootstrapManagedCourse({ ...f.request, prepareSynchronization: true });
    const third = f.sync();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(f.fetchOrigin).toHaveBeenCalledOnce();
    finish();
    expect((await first).status).toBe("up_to_date");
    expect((await second).status).toBe("ready");
    expect((await third).status).toBe("up_to_date");
    expect(f.fetchOrigin).toHaveBeenCalledTimes(2);
  });
});

it("limits managed synchronization capability to inspection, authenticated fetch and fast-forward", () => {
  const source = fs.readFileSync("electron/managedCourses.ts", "utf8");
  const synchronize = source.slice(source.indexOf("const performSynchronization"));
  expect(synchronize).not.toMatch(
    /runGit|execFile|spawn\(|push|commit\(|reset|rebase|stash|clean\(|checkout|setInterval|setTimeout|fetch\(/
  );
  expect(source).not.toMatch(
    /studentRepos|studentRepositories|dispatchWorkflow|createRepository|setRepositoryTopics|updatePermission/
  );
  const reader = fs.readFileSync("electron/gitWorkspaceReader.ts", "utf8");
  const capability = reader.slice(
    reader.indexOf("export interface GitWorkspaceSynchronizer"),
    reader.indexOf("export interface GitWorkspaceWriter")
  );
  expect(capability).toContain("fetchOrigin");
  expect(capability).toContain("fastForwardUpstream");
  expect(capability).not.toMatch(/runGit|push|pull|reset|rebase|commit|stage/);
  expect(fs.readFileSync("electron/preload.ts", "utf8")).not.toMatch(
    /fetchOrigin|fastForwardUpstream|pullUpstream|runGit/
  );
});
