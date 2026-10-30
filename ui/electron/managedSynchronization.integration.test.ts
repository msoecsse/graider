import {
  requireSynchronizedCommit,
  validateOperationalCourseSource,
  ManagedCourseMutationGuard
} from "./managedCourseMutationGuard";
import { getProductionGitWorkspaceFactory } from "./gitWorkspaceReader";
import { publishCourseChanges } from "./coursePublishService";
import { localPublicationOptions } from "./gitPublicationFixtures";
// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec, resolveGitBinary } from "dugite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GithubOAuthSession } from "./githubOAuthSession";
import type { RemoteCourse } from "./remoteCourseTypes";
import type { RemoteRepositoryReader } from "./githubRemoteRepositories";

const remoteReader = vi.hoisted(() => ({ current: null as RemoteRepositoryReader | null }));

vi.mock("./githubRemoteRepositories.js", async (original) => ({
  ...(await original<object>()),
  createRemoteRepositoryReader: () =>
    remoteReader.current ?? {
      resolve: async () => ({ id: 20, organizationId: 10, defaultBranch: "main" })
    }
}));
import {
  synchronizeManagedCourse,
  managedCoursePath,
  inspectManagedCourse
} from "./managedCourses.js";
import type { ManagedSynchronizationRequest } from "./managedCourses.js";
import type {
  GitWorkspaceSynchronizer,
  AuthenticatedGitWorkspaceContext
} from "./gitWorkspaceReader.js";

interface Backend {
  createAuthenticatedDugiteGitWorkspace(
    token: string
  ): ReturnType<ManagedSynchronizationRequest["authenticate"]>;
}
const backend = require(path.resolve("dist-electron/dugiteGitWorkspaceBackend.cjs")) as Backend;
const roots: string[] = [];
const git = async (cwd: string, args: string[]): Promise<string> => {
  const result = await exec(args, cwd);
  if (result.exitCode !== 0) throw new Error(`Fixture Git operation failed: ${args[0]}`);
  return result.stdout.trim();
};
const courseYaml = `schema_version: 1
course:
  code: csc1120
  title: Original title
  repository: course
github:
  organization: fixture
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
`;
const fixture = async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider sync two clone "));
  roots.push(root);
  const remote = path.join(root, "remote.git");
  const writer = path.join(root, "clone-b");
  await git(root, ["init", "--bare", "--initial-branch=main", remote]);
  await git(root, ["clone", "--no-hardlinks", remote, writer]);
  await git(writer, ["config", "user.name", "Fixture"]);
  await git(writer, ["config", "user.email", "fixture@example.test"]);
  fs.mkdirSync(path.join(writer, "terms", "27s1"), { recursive: true });
  fs.writeFileSync(path.join(writer, "course.yml"), courseYaml);
  fs.writeFileSync(path.join(writer, "terms", "27s1", "term.yml"), termYaml);
  await git(writer, ["add", "."]);
  await git(writer, ["commit", "-m", "Initial course"]);
  await git(writer, ["push", "origin", "main"]);
  const cache = managedCoursePath(root, 42, 20);
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  await git(root, ["clone", "--no-hardlinks", remote, cache]);
  await git(cache, ["config", "user.name", "Fixture"]);
  await git(cache, ["config", "user.email", "fixture@example.test"]);
  const url = "https://github.com/fixture/course.git";
  await git(cache, ["remote", "set-url", "origin", url]);
  // Test-only transport redirect: real authenticated Dugite fetch reads a local bare fixture.
  await git(cache, ["config", `url.${remote}.insteadOf`, url]);
  const context = backend.createAuthenticatedDugiteGitWorkspace("fixture-secret-never-persist");
  const workspace = await context.factory.open(cache);
  const repository = {
    id: 20,
    nodeId: null,
    organizationId: 10,
    owner: "fixture",
    name: "course",
    fullName: "fixture/course",
    url: "https://github.com/fixture/course",
    defaultBranch: "main",
    visibility: "private" as const,
    archived: false,
    disabled: false,
    topics: []
  };
  const course = {
    repositoryId: 20,
    nodeId: null,
    organizationId: 10,
    organizationLogin: "fixture",
    name: "course",
    fullName: "fixture/course",
    url: repository.url,
    defaultBranch: "main",
    visibility: "private" as const,
    archived: false,
    code: "csc1120",
    title: "Original title",
    schemaVersion: 1,
    discoveryHints: [],
    authorization: "authorized" as const,
    localStatus: "remote_only" as const,
    localFolderIds: [],
    diagnostics: []
  };
  const controller = new AbortController();
  const request: ManagedSynchronizationRequest = {
    userData: root,
    userId: 42,
    course,
    username: "jones",
    signal: controller.signal,
    revalidateSession: async () => true,
    authenticate: () => context,
    onProgress: () => {},
    reader: {
      resolveId: async () => repository,
      resolve: async () => repository,
      list: async () => [repository],
      search: async () => ({ ids: [20], incomplete: false }),
      terms: async () => ["27s1"],
      file: async (_repo, file) => {
        const result = await exec(["show", `main:${file}`], remote);
        return result.exitCode === 0 ? result.stdout : null;
      }
    }
  };
  const advance = async (content = courseYaml.replace("Original title", "Updated remotely")) => {
    fs.writeFileSync(path.join(writer, "course.yml"), content);
    await git(writer, ["commit", "-am", "Remote course update"]);
    await git(writer, ["push", "origin", "main"]);
    return git(writer, ["rev-parse", "HEAD"]);
  };
  return {
    root,
    remote,
    writer,
    cache,
    workspace,
    request,
    context,
    advance,
    sync: () => synchronizeManagedCourse(request)
  };
};
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("bundled Git managed synchronization, real two-clone history", () => {
  it("rejects an unresolved authentication context without falling back to system credentials", async () => {
    const f = await fixture();
    const config = fs.readFileSync(path.join(f.cache, ".git", "config"), "utf8");
    await expect(
      f.workspace.fetchOrigin({ authentication: { id: "not-the-operation-context" } })
    ).rejects.toMatchObject({ kind: "authentication_failed" });
    expect(fs.readFileSync(path.join(f.cache, ".git", "config"), "utf8")).toBe(config);
  });
  it("reports a removed upstream ref as missing, preserving branch configuration", async () => {
    const f = await fixture();
    const before = fs.readFileSync(path.join(f.cache, ".git", "config"), "utf8");
    await git(f.cache, ["update-ref", "-d", "refs/remotes/origin/main"]);
    expect((await f.workspace.inspect()).upstream).toEqual({ kind: "missing" });
    expect(fs.readFileSync(path.join(f.cache, ".git", "config"), "utf8")).toBe(before);
  });
  it("refuses a canceled fast-forward after a successful fetch", async () => {
    const f = await fixture();
    const head = await git(f.cache, ["rev-parse", "HEAD"]);
    await f.advance();
    await f.workspace.fetchOrigin({ authentication: f.context.authentication });
    const controller = new AbortController();
    controller.abort();
    await expect(
      f.workspace.fastForwardUpstream({
        expectedHead: head,
        expectedBranch: "main",
        signal: controller.signal
      })
    ).rejects.toMatchObject({ kind: "operation_rejected" });
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(head);
  });
  it("fetch updates refs without files; fast-forward advances exactly to upstream without merge commits", async () => {
    const f = await fixture();
    const head = await git(f.cache, ["rev-parse", "HEAD"]);
    const target = await f.advance();
    await f.workspace.fetchOrigin({ authentication: f.context.authentication });
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(head);
    expect(fs.readFileSync(path.join(f.cache, "course.yml"), "utf8")).toContain("Original title");
    expect((await f.workspace.inspect()).upstream).toMatchObject({ relation: "behind", behind: 1 });
    await f.workspace.fastForwardUpstream({ expectedHead: head, expectedBranch: "main" });
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(target);
    expect(await git(f.cache, ["rev-list", "--merges", "HEAD"])).toBe("");
    expect((await f.workspace.inspect()).workingTree).toEqual({
      trackedChanges: [],
      stagedChanges: [],
      conflicts: [],
      untrackedPaths: []
    });
    expect(fs.readFileSync(path.join(f.cache, ".git", "config"), "utf8")).not.toMatch(
      /fixture-secret|AUTHORIZATION|extraHeader/
    );
    expect(await f.workspace.remoteUrl("origin")).toBe("https://github.com/fixture/course.git");
    expect(resolveGitBinary()).toContain("dugite");
  });
  it("synchronizes changed course/term/assignment metadata and reconstructs a missing catalog entry", async () => {
    const f = await fixture();
    fs.mkdirSync(path.join(f.writer, "terms", "27s1", "assignments", "lab1"), { recursive: true });
    fs.writeFileSync(
      path.join(f.writer, "terms", "27s1", "assignments", "lab1", "assignment.yml"),
      "schema_version: 1\nassignment:\n  slug: lab1\n  title: New assignment\n  type: individual\n  status: draft\nsections: ['001']\n"
    );
    await git(f.writer, ["add", "."]);
    const target = await f.advance();
    const result = await f.sync();
    expect(result.diagnostic).toBeNull();
    expect(result).toMatchObject({ status: "updated", currentCommit: target });
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(target);
    const metadata = inspectManagedCourse(f.root, 42, {
      ...f.request.course,
      bootstrap: { status: "ready", retryable: false, diagnostic: null }
    });
    expect(metadata.title).toBe("Updated remotely");
    expect(metadata.assignments).toEqual([
      expect.objectContaining({ slug: "lab1", title: "New assignment" })
    ]);
    expect((await f.sync()).status).toBe("up_to_date");
  });
  it.each(["dirty", "staged", "untracked", "operation"] as const)(
    "preserves real %s state in primitive and service",
    async (state) => {
      const f = await fixture();
      const head = await git(f.cache, ["rev-parse", "HEAD"]);
      if (state === "dirty" || state === "staged")
        fs.writeFileSync(path.join(f.cache, "course.yml"), "local evidence\n");
      if (state === "staged") await git(f.cache, ["add", "course.yml"]);
      if (state === "untracked")
        fs.writeFileSync(path.join(f.cache, "evidence.txt"), "local evidence\n");
      if (state === "operation")
        fs.writeFileSync(path.join(f.cache, ".git", "CHERRY_PICK_HEAD"), head);
      await f.advance();
      if (state !== "operation")
        await f.workspace.fetchOrigin({ authentication: f.context.authentication });
      const before = await git(f.cache, ["status", "--porcelain=v2", "-z"]);
      await expect(
        f.workspace.fastForwardUpstream({ expectedHead: head, expectedBranch: "main" })
      ).rejects.toMatchObject({ kind: "operation_rejected" });
      expect((await f.sync()).status).toBe("needs_attention");
      expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(head);
      expect(await git(f.cache, ["status", "--porcelain=v2", "-z"])).toBe(before);
      if (state === "untracked")
        expect(fs.readFileSync(path.join(f.cache, "evidence.txt"), "utf8")).toBe(
          "local evidence\n"
        );
    }
  );
  it.each([false, true])("preserves local commits, remote diverged=%s", async (diverged) => {
    const f = await fixture();
    fs.writeFileSync(path.join(f.cache, "local.txt"), "local commit evidence");
    await git(f.cache, ["add", "."]);
    await git(f.cache, ["commit", "-m", "Local evidence"]);
    const head = await git(f.cache, ["rev-parse", "HEAD"]);
    if (diverged) await f.advance();
    expect(await f.sync()).toMatchObject({
      status: "needs_attention",
      reason: diverged ? "diverged" : "local_ahead"
    });
    await expect(
      f.workspace.fastForwardUpstream({ expectedHead: head, expectedBranch: "main" })
    ).rejects.toMatchObject({ kind: "operation_rejected" });
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(f.cache, ["rev-list", "--merges", "HEAD"])).toBe("");
  });
  it("does not roll back invalid authoritative metadata consumed in a fetch/update race", async () => {
    const f = await fixture();
    await f.advance();
    const fetch = f.workspace.fetchOrigin.bind(f.workspace);
    const actualContext = f.request.authenticate;
    let target = "";
    const wrapper: GitWorkspaceSynchronizer = {
      fastForwardToCommit: f.workspace.fastForwardToCommit.bind(f.workspace),
      root: f.cache,
      inspect: () => f.workspace.inspect(),
      remoteUrl: () => f.workspace.remoteUrl("origin"),
      fetchOrigin: (request) => fetch(request),
      fastForwardUpstream: async (request) => {
        target = await f.advance("invalid: remote metadata\n");
        await fetch({ authentication: f.context.authentication });
        await f.workspace.fastForwardUpstream(request);
      }
    };
    const result = await synchronizeManagedCourse({
      ...f.request,
      authenticate: () => ({
        ...actualContext(),
        factory: {
          ...actualContext().factory,
          open: async () => wrapper,
          clone: actualContext().factory.clone
        }
      })
    });
    // A valid preflight cannot roll back an invalid authoritative commit fetched during the update.
    expect(result).toMatchObject({ status: "needs_attention", reason: "invalid_remote_metadata" });
    expect(await git(f.cache, ["rev-parse", "refs/remotes/origin/main"])).toBe(target);
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(target);
    expect(fs.readFileSync(path.join(f.cache, "course.yml"), "utf8")).toBe(
      "invalid: remote metadata\n"
    );
  });
});

// Phase 2.7: the oracle advances; the operational legacy worktree never does.
describe("pre-mutation oracle with real remote and separate legacy clone", () => {
  const operational = async (f: Awaited<ReturnType<typeof fixture>>) => {
    const root = path.join(f.root, "legacy");
    await git(f.root, ["clone", "--no-hardlinks", f.remote, root]);
    await git(root, ["config", "user.name", "Fixture"]);
    await git(root, ["config", "user.email", "fixture@example.test"]);
    await git(root, ["remote", "set-url", "origin", "https://github.com/fixture/course.git"]);
    await git(root, [
      "config",
      `url.${f.remote}.insteadOf`,
      "https://github.com/fixture/course.git"
    ]);
    return {
      root,
      course: f.request.course,
      factory: getProductionGitWorkspaceFactory(),
      resolveOrigin: async () => ({ id: 20, organizationId: 10 }),
      mode: "new_mutation" as const
    };
  };
  it("synchronizes the oracle before blocking stale legacy, with no target writes", async () => {
    const f = await fixture();
    const source = await operational(f);
    const initial = await git(source.root, ["rev-parse", "HEAD"]);
    const current = requireSynchronizedCommit(f.request.course, await f.sync());
    expect(await validateOperationalCourseSource({ ...source, authoritativeCommit: current })).toBe(
      initial
    );
    const advanced = await f.advance();
    const authoritativeCommit = requireSynchronizedCommit(f.request.course, await f.sync());
    expect(authoritativeCommit).toBe(advanced);
    await expect(
      validateOperationalCourseSource({ ...source, authoritativeCommit })
    ).rejects.toMatchObject({ result: { reason: "operational_source_stale" } });
    expect(await git(source.root, ["rev-parse", "HEAD"])).toBe(initial);
    expect(await git(source.root, ["status", "--porcelain"])).toBe("");
  });
  it("preserves failed publication and permits explicit retry, then accepts next mutation", async () => {
    const f = await fixture();
    const source = await operational(f);
    const authoritativeCommit = requireSynchronizedCommit(f.request.course, await f.sync());
    fs.writeFileSync(
      path.join(source.root, "course.yml"),
      courseYaml.replace("Original title", "Local title")
    );
    await expect(
      validateOperationalCourseSource({ ...source, authoritativeCommit })
    ).rejects.toThrow();
    await validateOperationalCourseSource({
      ...source,
      authoritativeCommit,
      mode: "publication_retry"
    });
    await git(source.root, ["commit", "-am", "Publish Graider course changes"]);
    // A failed push leaves this exact committed evidence recoverable.
    await expect(
      validateOperationalCourseSource({ ...source, authoritativeCommit })
    ).rejects.toThrow();
    await validateOperationalCourseSource({
      ...source,
      authoritativeCommit,
      mode: "publication_retry"
    });
    const publication = await publishCourseChanges(source.root, localPublicationOptions());
    expect(publication.status).toBe("success");
    const published = requireSynchronizedCommit(f.request.course, await f.sync());
    await expect(
      validateOperationalCourseSource({ ...source, authoritativeCommit: published })
    ).resolves.toBe(published);
  });
  it("blocks publication conflict and dirty cache without touching legacy or remote", async () => {
    const f = await fixture();
    const source = await operational(f);
    fs.writeFileSync(
      path.join(source.root, "course.yml"),
      courseYaml.replace("Original title", "Unpublished")
    );
    const advanced = await f.advance();
    const authoritativeCommit = requireSynchronizedCommit(f.request.course, await f.sync());
    await expect(
      validateOperationalCourseSource({ ...source, authoritativeCommit, mode: "publication_retry" })
    ).rejects.toThrow();
    expect(await git(f.remote, ["rev-parse", "main"])).toBe(advanced);
    fs.writeFileSync(path.join(f.cache, "notes.txt"), "preserve cache evidence");
    const sync = await f.sync();
    expect(() => requireSynchronizedCommit(f.request.course, sync)).toThrow();
    expect(sync.reason).toBe("local_changes");
    expect(fs.readFileSync(path.join(source.root, "course.yml"), "utf8")).toContain("Unpublished");
  });
});

/** The legacy source is faculty-owned; only the managed fixture supplies validated freshness. */
const legacyFixture = async () => {
  const f = await fixture();
  remoteReader.current = f.request.reader;
  const legacy = path.join(f.root, "legacy");
  await git(f.root, ["clone", "--no-hardlinks", f.remote, legacy]);
  await git(legacy, ["remote", "set-url", "origin", "https://github.com/fixture/course.git"]);
  await git(legacy, [
    "config",
    `url.${f.remote}.insteadOf`,
    "https://github.com/fixture/course.git"
  ]);
  await git(legacy, ["config", "user.name", "Fixture"]);
  await git(legacy, ["config", "user.email", "fixture@example.test"]);
  const original = await git(legacy, ["rev-parse", "HEAD"]);
  const course: RemoteCourse = {
    ...f.request.course,
    localFolderIds: ["legacy"],
    localStatus: "registered_local"
  };
  let authorized = true;
  let generation = 1;
  const session = {
    get mutationGeneration() {
      return generation;
    },
    getState: () => ({
      identity: authorized ? { id: 42 } : null,
      courseDiscovery: { userId: 42, courses: [course] }
    }),
    withSynchronizedCourse: vi.fn(async (_id, _user, operation) =>
      operation(
        {
          token: "fixture-private-token",
          userId: 42,
          course,
          signal: f.request.signal,
          revalidateSession: async () => authorized
        },
        await f.sync()
      )
    )
  } as unknown as GithubOAuthSession;
  const workspace = await f.context.factory.open(legacy);
  const fetchOrigin = workspace.fetchOrigin.bind(workspace);
  const fastForward = workspace.fastForwardToCommit.bind(workspace);
  const fetch = vi.spyOn(workspace, "fetchOrigin");
  const ff = vi.spyOn(workspace, "fastForwardToCommit");
  const authenticate = vi.fn(() => ({
    ...f.context,
    factory: { ...f.context.factory, open: async () => workspace, clone: f.context.factory.clone }
  }));
  const guard = new ManagedCourseMutationGuard({
    userData: f.root,
    session,
    username: () => "jones",
    folders: () => [
      {
        id: "legacy",
        path: legacy,
        displayAlias: null,
        lastOpenedAt: "",
        lastRefreshedAt: null,
        lastDashboardStatus: null
      }
    ],
    authenticate: authenticate as unknown as (token: string) => AuthenticatedGitWorkspaceContext
  });
  const invalidate = () => {
    authorized = false;
    generation++;
  };
  const snapshot = () => ({
    course: fs.readFileSync(path.join(legacy, "course.yml"), "utf8"),
    config: fs.readFileSync(path.join(legacy, ".git", "config"), "utf8")
  });
  return {
    ...f,
    legacy,
    original,
    workspace,
    fetch,
    ff,
    guard,
    authenticate,
    session,
    invalidate,
    snapshot,
    fetchOrigin,
    fastForward
  };
};

describe("safe legacy operational source synchronization with bundled Git", () => {
  it("already current: authenticated fetch, success, no rewrite or publication", async () => {
    const f = await legacyFixture();
    const before = f.snapshot();
    const reflog = await git(f.legacy, ["reflog", "--format=%H %gs"]);
    await f.guard.updateSource("legacy");
    expect(f.fetch).toHaveBeenCalledExactlyOnceWith({ authentication: f.context.authentication });
    expect(f.authenticate).toHaveBeenCalledWith("fixture-private-token");
    expect(f.ff).not.toHaveBeenCalled();
    expect(f.snapshot()).toEqual(before);
    expect(await git(f.legacy, ["reflog", "--format=%H %gs"])).toBe(reflog);
  });
  it("identifies clean behind source using managed history before legacy has fetched; update then fresh retry", async () => {
    const f = await legacyFixture();
    const target = await f.advance();
    const mutation = vi.fn(async () => {});
    await expect(f.guard.run("legacy", undefined, "new_mutation", mutation)).rejects.toMatchObject({
      result: {
        reason: "operational_source_updateable",
        action: "update_source",
        courseFolderId: "legacy"
      }
    });
    expect(f.fetch).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
    await f.guard.updateSource("legacy");
    expect(f.ff).toHaveBeenCalledExactlyOnceWith({
      expectedHead: f.original,
      expectedBranch: "main",
      targetCommit: target,
      signal: f.request.signal
    });
    expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(target);
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(target);
    expect(await git(f.legacy, ["rev-list", "--merges", "HEAD"])).toBe("");
    expect(await git(f.remote, ["rev-parse", "main"])).toBe(target);
    expect(f.snapshot().config).not.toMatch(/fixture-private-token|extraHeader/);
    expect(mutation).not.toHaveBeenCalled();
    await f.guard.run("legacy", undefined, "new_mutation", mutation);
    expect(mutation).toHaveBeenCalledOnce();
    expect(f.session.withSynchronizedCourse).toHaveBeenCalledTimes(3);
  });
  it("remote advancing during preparation cannot advance legacy beyond the managed validated commit", async () => {
    const f = await legacyFixture();
    const target = await f.advance();
    const fetch = f.fetchOrigin;
    let newer = "";
    f.fetch.mockImplementationOnce(async (request) => {
      newer = await f.advance(courseYaml.replace("Original title", "Even newer"));
      await fetch(request);
    });
    await f.guard.updateSource("legacy");
    expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(target);
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(target);
    expect(await git(f.legacy, ["rev-parse", "origin/main"])).toBe(newer);
    // A later update re-synchronizes managed state before proceeding to the next exact commit.
    await f.guard.updateSource("legacy");
    expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(newer);
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(newer);
  });
  it.each([
    "tracked",
    "staged",
    "untracked",
    "ahead",
    "diverged",
    "detached",
    "missing upstream",
    "wrong upstream",
    "wrong branch",
    "interrupted",
    "alternates",
    "external gitdir",
    "symlink",
    "conflict",
    "wrong origin"
  ])("preserves %s source without fetch or worktree writes", async (kind) => {
    const f = await legacyFixture();
    await f.advance();
    if (kind === "ahead") {
      await f.fetchOrigin({ authentication: f.context.authentication });
      await f.fastForward({
        expectedHead: f.original,
        expectedBranch: "main",
        targetCommit: await git(f.writer, ["rev-parse", "HEAD"])
      });
    }
    if (["tracked", "staged", "ahead", "diverged"].includes(kind)) {
      fs.writeFileSync(path.join(f.legacy, "course.yml"), "unpublished faculty work\n");
      if (kind === "staged") await git(f.legacy, ["add", "course.yml"]);
      if (kind === "ahead" || kind === "diverged")
        await git(f.legacy, ["commit", "-am", "Local publication"]);
    }
    if (kind === "untracked") fs.writeFileSync(path.join(f.legacy, "notes.txt"), "preserve me");
    if (kind === "detached") await git(f.legacy, ["checkout", "--detach"]);
    if (kind === "missing upstream") await git(f.legacy, ["branch", "--unset-upstream"]);
    if (kind === "wrong upstream") {
      await git(f.legacy, ["update-ref", "refs/remotes/origin/other", f.original]);
      await git(f.legacy, ["branch", "--set-upstream-to=origin/other"]);
    }
    if (kind === "wrong branch") await git(f.legacy, ["checkout", "-b", "other"]);
    if (kind === "interrupted")
      fs.writeFileSync(path.join(f.legacy, ".git", "CHERRY_PICK_HEAD"), f.original);
    if (kind === "alternates")
      fs.writeFileSync(
        path.join(f.legacy, ".git", "objects", "info", "alternates"),
        path.join(f.writer, ".git", "objects")
      );
    if (kind === "external gitdir") {
      fs.renameSync(path.join(f.legacy, ".git"), path.join(f.root, "external-git"));
      fs.writeFileSync(
        path.join(f.legacy, ".git"),
        `gitdir: ${path.join(f.root, "external-git")}\n`
      );
    }
    if (kind === "symlink")
      fs.symlinkSync(path.join(f.root, "missing"), path.join(f.legacy, "link"));
    if (kind === "wrong origin")
      await git(f.legacy, ["remote", "set-url", "origin", "https://example.test/foreign/course"]);
    if (kind === "conflict") {
      await git(f.legacy, ["checkout", "-b", "other"]);
      fs.writeFileSync(path.join(f.legacy, "course.yml"), "other\n");
      await git(f.legacy, ["commit", "-am", "Other"]);
      await git(f.legacy, ["checkout", "main"]);
      fs.writeFileSync(path.join(f.legacy, "course.yml"), "local\n");
      await git(f.legacy, ["commit", "-am", "Local"]);
      expect((await exec(["merge", "other"], f.legacy)).exitCode).toBe(1);
    }
    // Includes index, untracked files, operation markers and Git objects, not only course.yml.
    const tree = (directory: string): unknown =>
      fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => {
          const file = path.join(directory, entry.name);
          return [
            entry.name,
            entry.isSymbolicLink()
              ? fs.readlinkSync(file)
              : entry.isDirectory()
                ? tree(file)
                : fs.readFileSync(file).toString("base64")
          ];
        });
    const before = tree(f.legacy);
    await expect(f.guard.updateSource("legacy")).rejects.toThrow();
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.ff).not.toHaveBeenCalled();
    expect(tree(f.legacy)).toEqual(before);
  });
  it("refuses loss of authorization during fetch without changing the worktree", async () => {
    const f = await legacyFixture();
    await f.advance();
    const before = f.snapshot();
    f.fetch.mockImplementationOnce(async () => {
      f.invalidate();
    });
    await expect(f.guard.updateSource("legacy")).rejects.toThrow();
    expect(f.ff).not.toHaveBeenCalled();
    expect(f.snapshot()).toEqual(before);
    expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(f.original);
  });
  it("refuses an edit arriving during fetch", async () => {
    const f = await legacyFixture();
    await f.advance();
    const fetch = f.fetchOrigin;
    f.fetch.mockImplementationOnce(async (request) => {
      await fetch(request);
      fs.writeFileSync(path.join(f.legacy, "notes.txt"), "new unsaved evidence");
    });
    await expect(f.guard.updateSource("legacy")).rejects.toThrow();
    expect(f.ff).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(f.legacy, "notes.txt"), "utf8")).toBe("new unsaved evidence");
  });
});

it.each(["repository", "organization", "default branch", "metadata", "faculty"])(
  "revalidates %s after legacy fetch and preserves the worktree on refusal",
  async (change) => {
    const f = await legacyFixture();
    await f.advance();
    const before = f.snapshot();
    const fetch = f.fetchOrigin;
    f.fetch.mockImplementationOnce(async (request) => {
      await fetch(request);
      const reader = f.request.reader;
      remoteReader.current = {
        ...reader,
        resolve: async (owner, name) => {
          const repository = await reader.resolve(owner, name);
          if (!repository) return null;
          return {
            ...repository,
            id: change === "repository" ? 99 : repository.id,
            organizationId: change === "organization" ? 99 : repository.organizationId,
            defaultBranch: change === "default branch" ? "other" : repository.defaultBranch
          };
        },
        file: async (repository, file) =>
          change === "metadata"
            ? "invalid: metadata"
            : change === "faculty" && file.endsWith("term.yml")
              ? termYaml.replace("[jones]", "[other]")
              : reader.file(repository, file)
      };
    });
    await expect(f.guard.updateSource("legacy")).rejects.toThrow();
    expect(f.ff).not.toHaveBeenCalled();
    expect(f.snapshot()).toEqual(before);
    expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(f.original);
  }
);

it("serializes legacy update, a second update and mutation through the same per-course boundary", async () => {
  const f = await legacyFixture();
  await f.advance();
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const fetch = f.fetchOrigin;
  f.fetch.mockImplementationOnce(async (request) => {
    entered();
    await held;
    await fetch(request);
  });
  const first = f.guard.updateSource("legacy");
  await started;
  const second = f.guard.updateSource("legacy");
  const mutation = vi.fn(async () => {});
  const third = f.guard.run("legacy", undefined, "new_mutation", mutation);
  expect(f.session.withSynchronizedCourse).toHaveBeenCalledTimes(1);
  expect(mutation).not.toHaveBeenCalled();
  release();
  await Promise.all([first, second, third]);
  expect(f.ff).toHaveBeenCalledOnce();
  expect(f.fetch).toHaveBeenCalledTimes(2);
  expect(mutation).toHaveBeenCalledOnce();
});

it("uses OAuth HTTPS transport for a verified SSH origin without rewriting its configuration", async () => {
  const f = await legacyFixture();
  await git(f.legacy, ["remote", "set-url", "origin", "git@github.com:fixture/course.git"]);
  const config = fs.readFileSync(path.join(f.legacy, ".git", "config"), "utf8");
  const target = await f.advance();
  await f.guard.updateSource("legacy");
  expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(target);
  expect(fs.readFileSync(path.join(f.legacy, ".git", "config"), "utf8")).toBe(config);
});

it("fails completion if concurrent managed synchronization moved the oracle; never advances to that unselected commit", async () => {
  const f = await legacyFixture();
  const target = await f.advance();
  const ff = f.fastForward;
  let newer = "";
  f.ff.mockImplementationOnce(async (request) => {
    newer = await f.advance(courseYaml.replace("Original title", "Concurrent managed state"));
    await f.sync();
    await ff(request);
  });
  await expect(f.guard.updateSource("legacy")).rejects.toMatchObject({
    result: { reason: "operational_source_stale" }
  });
  expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(target);
  expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(newer);
});

it("source update excludes pending publication files and local commits; publication retry still recovers them", async () => {
  const f = await legacyFixture();
  fs.writeFileSync(
    path.join(f.legacy, "course.yml"),
    courseYaml.replace("Original title", "Unpublished faculty title")
  );
  const pending = f.snapshot();
  await expect(f.guard.updateSource("legacy")).rejects.toThrow();
  expect(f.snapshot()).toEqual(pending);
  await git(f.legacy, ["commit", "-am", "Publish Graider course changes"]);
  const committed = await git(f.legacy, ["rev-parse", "HEAD"]);
  await expect(f.guard.updateSource("legacy")).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.ff).not.toHaveBeenCalled();
  expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(committed);
  const publication = await f.guard.run("legacy", undefined, "publication_retry", async () =>
    publishCourseChanges(f.legacy, localPublicationOptions())
  );
  expect(publication.status).toBe("success");
  expect(await git(f.remote, ["rev-parse", "main"])).toBe(committed);
  const next = vi.fn(async () => {});
  await f.guard.run("legacy", undefined, "new_mutation", next);
  expect(next).toHaveBeenCalledOnce();
});

it("remote publication conflict blocks update and retry before any publication writes", async () => {
  const f = await legacyFixture();
  fs.writeFileSync(
    path.join(f.legacy, "course.yml"),
    courseYaml.replace("Original title", "Local unpublished title")
  );
  await git(f.legacy, ["commit", "-am", "Publish Graider course changes"]);
  const local = await git(f.legacy, ["rev-parse", "HEAD"]);
  const remote = await f.advance();
  const before = f.snapshot();
  await expect(f.guard.updateSource("legacy")).rejects.toThrow();
  const publish = vi.fn(async () => {});
  await expect(f.guard.run("legacy", undefined, "publication_retry", publish)).rejects.toThrow();
  expect(publish).not.toHaveBeenCalled();
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.ff).not.toHaveBeenCalled();
  expect(f.snapshot()).toEqual(before);
  expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(local);
  expect(await git(f.remote, ["rev-parse", "main"])).toBe(remote);
});
