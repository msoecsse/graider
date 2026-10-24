import {
  ManagedReconciliationService,
  fingerprintManagedCache,
  LOCAL_COMMIT_REVIEW_LIMIT,
  resolvePreservedCopy,
  latestPreservedCopy,
  preservedRecoveryState,
  STALE_PLAN_MESSAGE
} from "./managedReconciliation.js";
import type { ReconciliationRequest } from "./managedReconciliation.js";
// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec, resolveGitBinary } from "dugite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { synchronizeManagedCourse, managedCoursePath } from "./managedCourses.js";
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
  const clone = vi.fn(async ({ destination }: { destination: string }) => {
    await git(root, ["clone", "--no-hardlinks", remote, destination]);
    await git(destination, ["remote", "set-url", "origin", url]);
    await git(destination, ["config", `url.${remote}.insteadOf`, url]);
  });
  const request: ReconciliationRequest = {
    sessionGeneration: 1,
    onReconciliationProgress: vi.fn(),
    userData: root,
    userId: 42,
    course,
    username: "jones",
    signal: controller.signal,
    revalidateSession: async () => true,
    authenticate: () => ({
      ...context,
      factory: { open: context.factory.open.bind(context.factory), clone }
    }),
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
    clone,
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

const reviewed = async (f: Awaited<ReturnType<typeof fixture>>) => {
  const service = new ManagedReconciliationService();
  const plan = await service.plan(f.request);
  expect(plan.status, JSON.stringify(plan)).toBe("review_required");
  expect(plan.planId).toBeDefined();
  return { service, plan, apply: () => service.apply(f.request, plan.planId!, true) };
};
const recoveryPath = (f: Awaited<ReturnType<typeof fixture>>, id: string) =>
  resolvePreservedCopy(f.root, 42, 20, id);
const dirty = (f: Awaited<ReturnType<typeof fixture>>) =>
  fs.appendFileSync(path.join(f.cache, "course.yml"), "# local evidence\n");
describe("managed-cache reconciliation with real bundled Git", () => {
  it("prepares before preservation, retains all worktree/index/history, promotes clean authoritative state", async () => {
    const f = await fixture();
    dirty(f);
    fs.writeFileSync(path.join(f.cache, "untracked.bin"), Buffer.from([0, 1, 255]));
    await git(f.cache, ["add", "course.yml"]);
    fs.appendFileSync(path.join(f.cache, "course.yml"), "# worktree differs from index\n");
    const index = fs.readFileSync(path.join(f.cache, ".git", "index"));
    const refs = await git(f.remote, ["show-ref"]);
    const r = await reviewed(f);
    expect(r.plan.evidence?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "Staged", path: "course.yml" }),
        expect.objectContaining({ category: "Modified", path: "course.yml" }),
        expect.objectContaining({ category: "Untracked", path: "untracked.bin" })
      ])
    );
    f.clone.mockImplementationOnce(async ({ destination }) => {
      expect(fs.existsSync(path.join(f.cache, "untracked.bin"))).toBe(true);
      await git(f.root, ["clone", "--no-hardlinks", f.remote, destination]);
      await git(destination, [
        "remote",
        "set-url",
        "origin",
        "https://github.com/fixture/course.git"
      ]);
      await git(destination, [
        "config",
        `url.${f.remote}.insteadOf`,
        "https://github.com/fixture/course.git"
      ]);
    });
    const result = await r.apply();
    expect(result.status, JSON.stringify(result)).toBe("completed");
    expect(f.request.onReconciliationProgress).toHaveBeenCalledWith(
      expect.objectContaining({ status: "preserving_existing" })
    );
    expect(f.request.onReconciliationProgress).toHaveBeenCalledWith(
      expect.objectContaining({ status: "activating_replacement" })
    );
    const preserved = recoveryPath(f, result.recoveryId!);
    expect(fs.readFileSync(path.join(preserved, "course.yml"), "utf8")).toContain(
      "worktree differs"
    );
    expect(fs.readFileSync(path.join(preserved, ".git", "index"))).toEqual(index);
    expect(fs.readFileSync(path.join(preserved, "untracked.bin"))).toEqual(
      Buffer.from([0, 1, 255])
    );
    expect(fs.readFileSync(path.join(f.cache, "course.yml"), "utf8")).toBe(courseYaml);
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
    expect(await git(f.remote, ["show-ref"])).toBe(refs);
    expect(latestPreservedCopy(f.root, 42, 20)).toBe(result.recoveryId);
    expect(() => resolvePreservedCopy(f.root, 43, 20, result.recoveryId!)).toThrow();
    expect(() => resolvePreservedCopy(f.root, 42, 20, "../repo")).toThrow();
    const manifest = JSON.parse(
      fs.readFileSync(path.join(path.dirname(preserved), "manifest.json"), "utf8")
    );
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      completion: "completed",
      userId: 42,
      repositoryId: 20
    });
    expect(Object.keys(manifest).sort()).toEqual(
      [
        "schemaVersion",
        "recoveryId",
        "createdAt",
        "userId",
        "repositoryId",
        "organizationId",
        "organizationLogin",
        "name",
        "fullName",
        "reason",
        "originalStatus",
        "changedPathCounts",
        "evidence",
        "replacementCommit",
        "completion"
      ].sort()
    );
    expect(JSON.stringify(manifest)).not.toMatch(
      /fixture-secret|AUTHORIZATION|extraHeader|managed-courses|https:/
    );
    expect(JSON.stringify(r.plan)).not.toContain(f.root);
    expect((await f.sync()).status).toBe("up_to_date");
  });
  it.each([
    "tracked",
    "staged",
    "untracked",
    "detached",
    "missing-upstream",
    "wrong-upstream",
    "default-branch",
    "ahead",
    "diverged",
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-merge",
    "rebase-apply",
    "sequencer",
    "BISECT_LOG"
  ])("reviews and preserves %s", async (kind) => {
    const f = await fixture();
    const head = await git(f.cache, ["rev-parse", "HEAD"]);
    if (kind === "tracked" || kind === "staged") dirty(f);
    if (kind === "staged") await git(f.cache, ["add", "course.yml"]);
    if (kind === "untracked") fs.writeFileSync(path.join(f.cache, "local.txt"), "evidence");
    if (kind === "detached") await git(f.cache, ["checkout", "--detach", "HEAD"]);
    if (kind === "missing-upstream") await git(f.cache, ["branch", "--unset-upstream"]);
    if (kind === "wrong-upstream") await git(f.cache, ["config", "branch.main.remote", "."]);
    if (kind === "default-branch") {
      await git(f.writer, ["checkout", "-b", "next"]);
      await git(f.writer, ["push", "origin", "next"]);
      await git(f.remote, ["symbolic-ref", "HEAD", "refs/heads/next"]);
      const original = await f.request.reader.resolveId(20);
      Object.assign(f.request.reader, {
        resolveId: async () => ({ ...original!, defaultBranch: "next" })
      });
      Object.assign(f.request.reader, {
        resolve: async () => ({ ...original!, defaultBranch: "next" })
      });
    }
    if (kind === "ahead" || kind === "diverged") {
      dirty(f);
      await git(f.cache, ["commit", "-am", "Local evidence"]);
      if (kind === "diverged") {
        await f.advance();
        await f.workspace.fetchOrigin({ authentication: f.context.authentication });
      }
    }
    if (["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "BISECT_LOG"].includes(kind))
      fs.writeFileSync(path.join(f.cache, ".git", kind), head + "\n");
    if (["rebase-merge", "rebase-apply", "sequencer"].includes(kind)) {
      fs.mkdirSync(path.join(f.cache, ".git", kind));
      fs.writeFileSync(path.join(f.cache, ".git", kind, "evidence"), "operation state");
    }
    const oldHead = await git(f.cache, ["rev-parse", "HEAD"]);
    const r = await reviewed(f);
    if (kind === "ahead" || kind === "diverged")
      expect(r.plan.evidence?.localCommits).toMatchObject({
        count: 1,
        commits: [expect.objectContaining({ subject: "Local evidence" })]
      });
    const result = await r.apply();
    expect(result.status, JSON.stringify(result)).toBe("completed");
    const preserved = recoveryPath(f, result.recoveryId!);
    expect(await git(preserved, ["rev-parse", "HEAD"])).toBe(oldHead);
    if (r.plan.evidence?.operations.length)
      expect(fs.existsSync(path.join(preserved, ".git", kind))).toBe(true);
    expect((await f.workspace.inspect()).head).toMatchObject({
      kind: "attached",
      branch: kind === "default-branch" ? "next" : "main"
    });
  });
  it("bounds local-only commits using fixed semantic Git input", async () => {
    const f = await fixture();
    for (let index = 0; index < LOCAL_COMMIT_REVIEW_LIMIT + 2; index += 1) {
      dirty(f);
      await git(f.cache, ["commit", "-am", `Local ${index}`]);
    }
    const r = await reviewed(f);
    expect(r.plan.evidence?.localCommits.count).toBe(LOCAL_COMMIT_REVIEW_LIMIT + 2);
    expect(r.plan.evidence?.localCommits.commits).toHaveLength(LOCAL_COMMIT_REVIEW_LIMIT);
  });
  it.each(["same-path-content", "new-path", "operation", "index", "account"])(
    "rejects stale %s without cloning or moving",
    async (kind) => {
      const f = await fixture();
      dirty(f);
      const r = await reviewed(f);
      if (kind === "same-path-content") dirty(f);
      if (kind === "new-path") fs.writeFileSync(path.join(f.cache, "new.txt"), "new");
      if (kind === "operation")
        fs.writeFileSync(
          path.join(f.cache, ".git", "MERGE_HEAD"),
          await git(f.cache, ["rev-parse", "HEAD"])
        );
      if (kind === "index") await git(f.cache, ["add", "course.yml"]);
      const result =
        kind === "account"
          ? await r.service.apply({ ...f.request, sessionGeneration: 2 }, r.plan.planId!, true)
          : await r.apply();
      expect(result).toMatchObject({ status: "stale_plan", diagnostic: STALE_PLAN_MESSAGE });
      expect(f.clone).not.toHaveBeenCalled();
      expect(fs.existsSync(f.cache)).toBe(true);
    }
  );
  it.each(["clone-failure", "validation-failure", "changed-during-clone", "cancel"])(
    "leaves old cache untouched for %s",
    async (kind) => {
      const f = await fixture();
      dirty(f);
      const original = fs.readFileSync(path.join(f.cache, "course.yml"));
      const r = await reviewed(f);
      const normal = f.clone.getMockImplementation()!;
      f.clone.mockImplementationOnce(async (input) => {
        if (kind === "clone-failure") throw new Error("transport failed");
        await normal(input);
        if (kind === "validation-failure")
          fs.writeFileSync(path.join(input.destination, "course.yml"), "invalid");
        if (kind === "changed-during-clone")
          fs.writeFileSync(path.join(f.cache, "later"), "changed");
        if (kind === "cancel") f.request.signal.addEventListener("unused", () => {});
      });
      let appliedRequest = f.request;
      if (kind === "cancel") {
        const controller = new AbortController();
        controller.abort();
        appliedRequest = { ...f.request, signal: controller.signal };
      }
      const result = await r.service
        .apply(appliedRequest, r.plan.planId!, true)
        .catch(() => ({ status: "failed" }));
      expect(result.status).not.toBe("completed");
      expect(fs.readFileSync(path.join(f.cache, "course.yml"))).toEqual(original);
      expect(latestPreservedCopy(f.root, 42, 20)).toBeUndefined();
    }
  );
  it.each(["symlink", "gitdir", "alternates", "commondir", "hardlink", "worktree-config"])(
    "requires manual review for %s",
    async (kind) => {
      const f = await fixture();
      dirty(f);
      if (kind === "symlink") fs.symlinkSync(f.writer, path.join(f.cache, "external"));
      if (kind === "gitdir") {
        fs.renameSync(path.join(f.cache, ".git"), path.join(f.root, "outside.git"));
        fs.writeFileSync(path.join(f.cache, ".git"), `gitdir: ${path.join(f.root, "outside.git")}`);
      }
      if (kind === "alternates")
        fs.writeFileSync(
          path.join(f.cache, ".git", "objects", "info", "alternates"),
          path.join(f.writer, ".git", "objects")
        );
      if (kind === "commondir") fs.writeFileSync(path.join(f.cache, ".git", "commondir"), f.writer);
      if (kind === "hardlink")
        fs.linkSync(path.join(f.cache, "course.yml"), path.join(f.root, "linked"));
      if (kind === "worktree-config")
        fs.appendFileSync(
          path.join(f.cache, ".git", "config"),
          `\n[core]\nworktree = ${f.writer}\n`
        );
      const result = await new ManagedReconciliationService().plan(f.request);
      expect(result).toMatchObject({ status: "manual_review_required", eligible: false });
      expect(f.clone).not.toHaveBeenCalled();
    }
  );
  it.each(["organization", "authorization", "metadata", "network", "rate-limit"])(
    "does not rebuild remote/auth failures: %s",
    async (kind) => {
      const f = await fixture();
      dirty(f);
      if (kind === "organization") {
        const repo = await f.request.reader.resolveId(20);
        Object.assign(f.request.reader, {
          resolveId: async () => ({ ...repo!, organizationId: 99 })
        });
      }
      if (kind === "authorization")
        Object.assign(f.request, { revalidateSession: async () => false });
      if (kind === "metadata") Object.assign(f.request.reader, { file: async () => "invalid" });
      if (kind === "network" || kind === "rate-limit") {
        const { GithubOAuthError } = await import("./githubOAuthCallback.js");
        Object.assign(f.request.reader, {
          resolveId: async () => {
            throw new GithubOAuthError(
              kind === "network" ? "network_unavailable" : "rate_limited",
              "Retry remote access"
            );
          }
        });
      }
      const result = await new ManagedReconciliationService().plan(f.request);
      expect(result.eligible).toBe(false);
      expect(f.clone).not.toHaveBeenCalled();
      if (kind === "network" || kind === "rate-limit") expect(result.retryable).toBe(true);
    }
  );
  it("fingerprints ignored content and Git state", async () => {
    const f = await fixture();
    const before = fingerprintManagedCache(f.root, f.cache, {});
    fs.writeFileSync(path.join(f.cache, ".git", "local-evidence"), "important");
    expect(fingerprintManagedCache(f.root, f.cache, {})).not.toBe(before);
  });
});

describe("reconciliation transaction failures and realistic operation state", () => {
  it.each(["preserve", "promote", "rollback", "manifest"])(
    "preserves evidence across %s failure",
    async (kind) => {
      const f = await fixture();
      dirty(f);
      const original = fs.readFileSync(path.join(f.cache, "course.yml"));
      const r = await reviewed(f);
      const rename = fs.renameSync;
      const write = fs.writeFileSync;
      const renameSpy = vi.spyOn(fs, "renameSync").mockImplementation((source, target) => {
        const from = String(source);
        const to = String(target);
        const preserving = from === f.cache && to.includes(".recovery");
        const promoting = from.includes(".reconcile") && to === f.cache;
        const rollingBack = from.includes(".recovery") && to === f.cache;
        if (
          (kind === "preserve" && preserving) ||
          (["promote", "rollback"].includes(kind) && promoting) ||
          (kind === "rollback" && rollingBack)
        )
          throw Object.assign(new Error("injected storage failure"), { code: "EACCES" });
        return rename(source, target);
      });
      const writeSpy = vi
        .spyOn(fs, "writeFileSync")
        .mockImplementation((file, data, ...options) => {
          if (
            kind === "manifest" &&
            String(file).includes("manifest-") &&
            String(data).includes('"completion": "replacement_active"')
          )
            throw Object.assign(new Error("manifest failure"), { code: "ENOSPC" });
          return write(file, data, ...options);
        });
      let outcome;
      try {
        outcome = await r.apply();
      } finally {
        renameSpy.mockRestore();
        writeSpy.mockRestore();
      }
      expect(outcome.status).not.toBe("completed");
      if (kind === "preserve" || kind === "promote")
        expect(fs.readFileSync(path.join(f.cache, "course.yml"))).toEqual(original);
      if (kind === "rollback" || kind === "manifest") {
        expect(outcome.status).toBe("manual_review_required");
        expect(preservedRecoveryState(f.root, 42, 20, outcome.recoveryId!).status).toBe(
          "manual_review_required"
        );
        const preserved = recoveryPath(f, outcome.recoveryId!);
        expect(fs.readFileSync(path.join(preserved, "course.yml"))).toEqual(original);
        expect(fs.existsSync(f.cache)).toBe(kind !== "rollback");
      }
      if (kind === "promote") {
        const root = path.join(f.root, "managed-courses", "42", ".recovery", "20");
        const record = JSON.parse(
          fs.readFileSync(path.join(root, fs.readdirSync(root)[0]!, "manifest.json"), "utf8")
        );
        expect(record.completion).toBe("rollback_restored");
      }
    }
  );
  it("keeps replacement active when final remote metadata becomes invalid", async () => {
    const f = await fixture();
    dirty(f);
    const r = await reviewed(f);
    Object.assign(f.request, {
      onProgress: (state: { status: string }) => {
        if (state.status === "checking")
          Object.assign(f.request.reader, { file: async () => "invalid" });
      }
    });
    const outcome = await r.apply();
    expect(outcome.status).toBe("failed");
    expect(outcome.reason).toBe("invalid_remote_metadata");
    expect(fs.readFileSync(path.join(f.cache, "course.yml"), "utf8")).toBe(courseYaml);
    expect(
      fs.readFileSync(path.join(recoveryPath(f, outcome.recoveryId!), "course.yml"), "utf8")
    ).toContain("local evidence");
  });
  it("preserves a proven self-contained wrong repository at the canonical location", async () => {
    const f = await fixture();
    await git(f.cache, ["remote", "set-url", "origin", "https://github.com/fixture/other.git"]);
    const repository = await f.request.reader.resolveId(20);
    Object.assign(f.request.reader, {
      resolve: async (_owner: string, name: string) =>
        name === "other" ? { ...repository!, id: 21, name: "other" } : repository
    });
    const r = await reviewed(f);
    expect(r.plan.reason).toBe("wrong_repository");
    expect(r.plan.diagnostic).toBe("This managed location contains a different Git repository.");
    const result = await r.apply();
    expect(result.status).toBe("completed");
    expect(await git(recoveryPath(f, result.recoveryId!), ["remote", "get-url", "origin"])).toBe(
      "https://github.com/fixture/other.git"
    );
    expect(await f.workspace.remoteUrl("origin")).toBe("https://github.com/fixture/course.git");
  });
  it.each(["merge", "rebase"])(
    "preserves realistic interrupted %s with conflicts",
    async (operation) => {
      const f = await fixture();
      dirty(f);
      await git(f.cache, ["commit", "-am", "Local conflicting history"]);
      await f.advance(courseYaml + "# remote conflicting history\n");
      await f.workspace.fetchOrigin({ authentication: f.context.authentication });
      const conflict = await exec(
        operation === "merge" ? ["merge", "origin/main"] : ["rebase", "origin/main"],
        f.cache
      );
      expect(conflict.exitCode).not.toBe(0);
      const r = await reviewed(f);
      expect(r.plan.reason).toBe("interrupted_operation");
      expect(r.plan.evidence?.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: "Conflict", path: "course.yml" })
        ])
      );
      const index = fs.readFileSync(path.join(f.cache, ".git", "index"));
      const outcome = await r.apply();
      expect(outcome.status, JSON.stringify(outcome)).toBe("completed");
      const preserved = recoveryPath(f, outcome.recoveryId!);
      expect(fs.readFileSync(path.join(preserved, ".git", "index"))).toEqual(index);
      expect(fs.readFileSync(path.join(preserved, "course.yml"), "utf8")).toContain("<<<<<<<");
      expect(
        fs.existsSync(
          path.join(preserved, ".git", operation === "merge" ? "MERGE_HEAD" : "rebase-merge")
        )
      ).toBe(true);
      expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
    }
  );
  it("does not activate without explicit confirmation or an opaque owned plan", async () => {
    const f = await fixture();
    dirty(f);
    const r = await reviewed(f);
    expect((await r.service.apply(f.request, r.plan.planId!, false)).status).toBe("stale_plan");
    expect((await r.service.apply(f.request, "../arbitrary", true)).status).toBe("stale_plan");
    expect((await r.service.apply({ ...f.request, userId: 99 }, r.plan.planId!, true)).status).toBe(
      "stale_plan"
    );
    expect(f.clone).not.toHaveBeenCalled();
  });
});

it("cancellation during cloning waits for clone completion and leaves old state untouched", async () => {
  const f = await fixture();
  dirty(f);
  const r = await reviewed(f);
  const controller = new AbortController();
  const clone = f.clone.getMockImplementation()!;
  f.clone.mockImplementationOnce(async (input) => {
    await clone(input);
    controller.abort();
  });
  const result = await r.service.apply(
    { ...f.request, signal: controller.signal },
    r.plan.planId!,
    true
  );
  expect(result.status).not.toBe("completed");
  expect(f.clone).toHaveBeenCalledOnce();
  expect(fs.readFileSync(path.join(f.cache, "course.yml"), "utf8")).toContain("local evidence");
  expect(latestPreservedCopy(f.root, 42, 20)).toBeUndefined();
});
it("reviews normalized added/deleted/renamed paths and excludes Git internals", async () => {
  const f = await fixture();
  fs.mkdirSync(path.join(f.cache, "notes"));
  fs.writeFileSync(path.join(f.cache, "notes", "new.txt"), "local notes");
  await git(f.cache, ["add", "notes/new.txt"]);
  await git(f.cache, ["mv", "course.yml", "renamed-course.yml"]);
  fs.unlinkSync(path.join(f.cache, "terms", "27s1", "term.yml"));
  const r = await reviewed(f);
  expect(r.plan.evidence?.files).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ category: "Added", path: "notes/new.txt" }),
      expect.objectContaining({ category: "Deleted", path: "terms/27s1/term.yml" }),
      expect.objectContaining({
        category: "Renamed",
        path: "renamed-course.yml",
        originalPath: "course.yml"
      })
    ])
  );
  expect(
    r.plan.evidence?.files.every(
      (file) =>
        !file.path.startsWith("/") && !file.path.startsWith(".git/") && !file.path.includes("\\")
    )
  ).toBe(true);
});
