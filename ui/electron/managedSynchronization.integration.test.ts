import {
  requireSynchronizedCommit,
  validateOperationalCourseSource
} from "./managedCourseMutationGuard";
import { getProductionGitWorkspaceFactory } from "./gitWorkspaceReader";
import { publishCourseChanges } from "./coursePublishService";
import { localPublicationOptions } from "./gitPublicationFixtures";
// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec, resolveGitBinary } from "dugite";
import { afterEach, describe, expect, it } from "vitest";
import {
  synchronizeManagedCourse,
  managedCoursePath,
  inspectManagedCourse
} from "./managedCourses.js";
import type { ManagedSynchronizationRequest } from "./managedCourses.js";
import type { GitWorkspaceSynchronizer } from "./gitWorkspaceReader.js";

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
