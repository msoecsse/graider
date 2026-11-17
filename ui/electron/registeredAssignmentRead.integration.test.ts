// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { managedOperationalFixture, fixtureGit as git } from "./managedOperationalFixtures.js";
import { removeGitFixture, GIT_INTEGRATION_TIMEOUT_MS } from "./gitIntegrationFixtures.js";
import { createCourseMutationIpc } from "./courseMutationIpc.js";
import {
  IPC_CHANNELS,
  type AssignmentDetailRequest,
  type AssignmentGroupConfigRequest
} from "./ipc.js";
import { getAssignmentDetail } from "./assignmentDetailRunner.js";
import { getAssignmentGroupConfig } from "./assignmentGroupConfigService.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { managedCourseOperation } from "./managedCourseOperationContext.js";
import { createRemoteRepositoryReader } from "./githubRemoteRepositories.js";

vi.mock("./githubRemoteRepositories.js", () => ({
  createRemoteRepositoryReader: vi.fn()
}));
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const assignmentFile = (slug: string) => `terms/27s1/assignments/${slug}/assignment.yml`;
const addAssignment = (root: string, slug: string) => {
  const file = path.join(root, assignmentFile(slug));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `schema_version: 1\nassignment:\n  slug: ${slug}\n  title: ${slug}\n  type: individual\n  status: active\nsections: ["001"]\n`
  );
};
const commit = async (root: string) => {
  await git(root, ["add", "."]);
  await git(root, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "commit",
    "-m",
    "Assignment"
  ]);
  return git(root, ["rev-parse", "HEAD"]);
};
const fixture = async () => {
  const f = await managedOperationalFixture();
  roots.push(f.root);
  vi.mocked(createRemoteRepositoryReader).mockReturnValue(f.reader);
  addAssignment(f.writer, "lab01");
  const base = await commit(f.writer);
  await git(f.writer, ["push", "origin", "main"]);
  for (const root of [f.cache, f.legacy]) await git(root, ["pull", "--ff-only"]);
  type InvokeHandler = Parameters<Parameters<typeof createCourseMutationIpc>[0]["handle"]>[1];
  const handlers = new Map<string, (request: unknown) => unknown>();
  const sender = Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => false,
    send: vi.fn()
  });
  const ipc = createCourseMutationIpc(
    {
      handle: (channel, handler) => {
        handlers.set(
          channel,
          (request) =>
            handler({ sender } as unknown as Parameters<InvokeHandler>[0], request) as unknown
        );
      }
    },
    () => f.guard
  );
  const invoke = (channel: string, request: unknown): Promise<unknown> => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`Missing handler: ${channel}`);
    return Promise.resolve(handler(request));
  };
  ipc.handle(
    IPC_CHANNELS.getAssignmentGroupConfig,
    (_event, request: AssignmentGroupConfigRequest) => getAssignmentGroupConfig(request)
  );
  // Exercise the real IPC adapter, runner, and CLI process with no GitHub credentials.
  ipc.handle(IPC_CHANNELS.getAssignmentDetail, (_event, request: AssignmentDetailRequest) =>
    getAssignmentDetail(request, {
      env: {},
      runner: async (input) => {
        expect(input.cwd).toBe(f.cache);
        expect(input.env).not.toHaveProperty("GRAIDER_GITHUB_TOKEN");
        const result = await promisify(execFile)(
          process.execPath,
          ["--import", require.resolve("tsx"), path.resolve("../src/cli/index.ts"), ...input.args],
          { cwd: input.cwd, env: input.env }
        );
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr, error: null };
      }
    })
  );
  const open = async (slug = "lab01", revision = base) => {
    const request = {
      courseFolderId: "registered",
      courseFolderPath: f.legacy,
      assignmentFile: assignmentFile(slug)
    };
    const detail = await invoke(IPC_CHANNELS.getAssignmentDetail, request);
    expect(detail).toMatchObject({
      status: "success",
      courseReadRevision: revision,
      courseReadRevisionSource: "local_cache",
      detail: { assignment: { slug } }
    });
    expect(await invoke(IPC_CHANNELS.getAssignmentGroupConfig, request)).toMatchObject({
      status: "ready",
      courseReadRevision: revision
    });
    expect(sender.send).toHaveBeenCalledWith("graider-ui:course-mutation:notice", {
      status: "cached_course_read",
      commit: revision
    });
    return detail;
  };
  const call = (channel: string, fields: Record<string, unknown> = {}) =>
    invoke(channel, {
      courseFolderId: "registered",
      courseFolderPath: f.legacy,
      assignmentFile: assignmentFile("lab01"),
      ...fields
    });
  return { ...f, base, open, sender, call, ipc };
};

it(
  "opens every cached assignment with cache A/source B/GitHub B, then refreshes and opens the published addition without restart",
  async () => {
    const f = await fixture();
    addAssignment(f.writer, "lab12");
    const published = await commit(f.writer);
    await git(f.writer, ["push", "origin", "main"]);
    await git(f.legacy, ["pull", "--ff-only"]);
    const untracked = path.join(f.legacy, "terms", "27s1", "assignments", "lab12", "manifest.json");
    fs.writeFileSync(untracked, "faculty grading work");
    fs.mkdirSync(path.join(f.legacy, ".idea"));
    fs.writeFileSync(path.join(f.legacy, ".idea", "workspace.xml"), "IDE work");
    const before = await git(f.legacy, ["status", "--porcelain"]);
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(f.base);
    await f.open();
    // Dashboard source selection uses the same cached metadata route.
    await f.guard.read(
      "registered",
      f.legacy,
      (context) => {
        if (!context) throw new Error("Missing verified context");
        expect(context.courseFolderPath).toBe(f.cache);
        expect(fs.existsSync(path.join(context.courseFolderPath, assignmentFile("lab01")))).toBe(
          true
        );
        return Promise.resolve();
      },
      { channel: IPC_CHANNELS.refreshCourseDisplay, fields: {} }
    );
    // The synchronized refresh/preview boundary observes remote B rather than diagnosing
    // the descendant of cache A as unpublished. No actual provisioning is performed.
    await f.guard.run("registered", f.legacy, "read", (context) => {
      expect(context.authoritativeCommit).toBe(published);
      return Promise.resolve();
    });
    await f.open("lab01", published);
    await f.open("lab12", published);
    const mutate = vi.fn();
    await f.guard.run("registered", f.legacy, "new_mutation", mutate);
    expect(mutate).toHaveBeenCalledOnce();
    expect(fs.readFileSync(untracked, "utf8")).toBe("faculty grading work");
    expect(await git(f.legacy, ["status", "--porcelain"])).toBe(before);
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it.each(["unpublished", "dirty", "untracked", "behind", "diverged"] as const)(
  "reads only cache for %s registered work and preserves write checks",
  async (kind) => {
    const f = await fixture();
    const file = path.join(f.legacy, assignmentFile("lab01"));
    if (["unpublished", "dirty", "diverged"].includes(kind))
      fs.appendFileSync(file, "\n# local work\n");
    if (kind === "unpublished" || kind === "diverged") await commit(f.legacy);
    if (kind === "untracked") addAssignment(f.legacy, "local-only");
    if (kind === "behind" || kind === "diverged") {
      addAssignment(f.writer, "remote-only");
      await commit(f.writer);
      await git(f.writer, ["push", "origin", "main"]);
    }
    const before = await git(f.legacy, ["status", "--porcelain"]);
    const bytes = fs.readFileSync(file, "utf8");
    await f.open();
    const mutate = vi.fn();
    if (kind === "behind") {
      // Clean behind sources remain eligible for the existing guarded fast-forward.
      await f.guard.run("registered", f.legacy, "new_mutation", mutate);
      expect(mutate).toHaveBeenCalledOnce();
    } else {
      await expect(f.guard.run("registered", f.legacy, "new_mutation", mutate)).rejects.toThrow();
      expect(mutate).not.toHaveBeenCalled();
    }
    expect(fs.readFileSync(file, "utf8")).toBe(bytes);
    expect(await git(f.legacy, ["status", "--porcelain"])).toBe(before);
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it.each(["origin", "unauthorized", "cache-origin"] as const)(
  "blocks %s through assignment IPC",
  async (invalid) => {
    const f = await fixture();
    if (invalid === "unauthorized") Object.assign(f.course, { authorization: "not_authorized" });
    else
      await git(invalid === "origin" ? f.legacy : f.cache, [
        "remote",
        "set-url",
        "origin",
        "https://github.com/other/course.git"
      ]);
    await expect(f.open()).rejects.toThrow();
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it(
  "publishes a legacy assignment, synchronizes, and reopens both assignments through the existing guard",
  async () => {
    const f = await fixture();
    addAssignment(f.legacy, "lab12");
    const published = await commit(f.legacy);
    await f.guard.run("registered", f.legacy, "publication_retry", async () => {
      await git(f.legacy, ["push", "origin", "main"]);
    });
    await f.guard.run("registered", f.legacy, "read", async () => {});
    await f.open("lab01", published);
    await f.open("lab12", published);
    expect(managedCourseOperation.getStore()).toBeUndefined();
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it(
  "rejects a stale cached view before Apply, then permits Apply after a freshly authorized Preview",
  async () => {
    const f = await fixture();
    await f.open();
    const apply = vi.fn(() => ({ status: "success" }));
    f.ipc.handle(IPC_CHANNELS.applyAssignment, apply);
    f.ipc.handle(IPC_CHANNELS.getAssignmentApplyPreview, () => ({ status: "success" }));
    const published = await f.advance();
    await git(f.legacy, ["pull", "--ff-only"]);
    await expect(f.call(IPC_CHANNELS.applyAssignment)).rejects.toMatchObject({
      result: { reason: "view_refresh_required" }
    });
    expect(apply).not.toHaveBeenCalled();
    // No handler provisions repositories: this verifies the real authorization and IPC routing.
    await expect(f.call(IPC_CHANNELS.getAssignmentApplyPreview)).resolves.toMatchObject({
      status: "success"
    });
    await expect(f.call(IPC_CHANNELS.applyAssignment)).resolves.toMatchObject({
      status: "success"
    });
    expect(apply).toHaveBeenCalledOnce();
    await f.open("lab01", published);
  },
  GIT_INTEGRATION_TIMEOUT_MS
);
