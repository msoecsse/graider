// @vitest-environment node
import {
  describeGitIntegration as describe,
  GIT_INTEGRATION_TIMEOUT_MS,
  itGitIntegration,
  removeGitFixture
} from "./gitIntegrationFixtures";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import {
  fixtureGit as git,
  managedOperationalFixture,
  fixtureCourseYaml
} from "./managedOperationalFixtures";
import { loadManagedCatalog, saveEntry } from "./managedCourses";
import { ManagedCourseMutationGuard } from "./managedCourseMutationGuard";
import {
  createCourseMutationIpc,
  COURSE_ADMIN_CHANNELS,
  COURSE_MUTATION_CHANNELS
} from "./courseMutationIpc";
import { managedCourseOperation } from "./managedCourseOperationContext";
import { IPC_CHANNELS } from "./ipc";
import { saveStudentAccessPagesConfig } from "./studentAccessPagesConfigService";
import type { RemoteRepositoryReader } from "./githubRemoteRepositories";

const remote = vi.hoisted(() => ({ reader: null as RemoteRepositoryReader | null }));
vi.mock("./githubRemoteRepositories.js", async (original) => ({
  ...(await original<object>()),
  createRemoteRepositoryReader: () => remote.reader
}));
const roots: string[] = [];
const fixture = async () => {
  const f = await managedOperationalFixture();
  roots.push(f.root);
  remote.reader = f.reader;
  return f;
};
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const sender = (id = 1) =>
  Object.assign(new EventEmitter(), {
    id,
    send: vi.fn(),
    isDestroyed: () => false,
    reload: vi.fn()
  });
const adapter = (f: Awaited<ReturnType<typeof fixture>>) => {
  const handlers = new Map<string, Function>(),
    views = [sender(1), sender(2)];
  const ipc = createCourseMutationIpc(
    {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      }
    },
    () => f.guard,
    undefined,
    () => views as never
  );
  const call = (channel: string, request: unknown, view = views[0]) =>
    handlers.get(channel)!({ sender: view }, request);
  return { ipc, call, views };
};
const transact = async (
  f: Awaited<ReturnType<typeof fixture>>,
  mutate: (root: string) => Promise<{ status: "success"; diagnostics: never[] }>,
  expected = f.head
) =>
  f.guard.run("registered", f.legacy, "new_mutation", (context, input) =>
    f.guard.transaction(context, input, expected, (file) => file === "course.yml", mutate, vi.fn())
  );
const edit = async (root: string) => {
  fs.writeFileSync(
    path.join(root, "course.yml"),
    fixtureCourseYaml.replace("Original title", "Managed edit")
  );
  return { status: "success" as const, diagnostics: [] as never[] };
};

describe("managed operational-source cutover", () => {
  it("persists account/repository mode across synchronization and guard restart; never depends on the legacy copy again", async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    expect(loadManagedCatalog(f.root, 42).courses["20"]).toMatchObject({
      operationalSource: "managed",
      operationalFolderIds: ["registered"]
    });
    fs.writeFileSync(path.join(f.legacy, "unrelated.txt"), "keep");
    fs.writeFileSync(path.join(f.legacy, "course.yml"), "dirty legacy");
    const guard = new ManagedCourseMutationGuard(f.deps);
    await guard.read("registered", f.legacy, async (context) => {
      expect(context).toMatchObject({
        managed: true,
        courseFolderPath: f.cache,
        authoritativeCommit: f.head
      });
    });
    expect(guard.isManaged("registered")).toBe(true);
    fs.renameSync(f.legacy, `${f.legacy}-removed`);
    await guard.read("registered", f.legacy, async (context) =>
      expect(context?.courseFolderPath).toBe(f.cache)
    );
    Object.assign(f.course, { localFolderIds: [] });
    await guard.read("registered", f.legacy, async (context) =>
      expect(context?.courseFolderPath).toBe(f.cache)
    );
    f.switchAccount(43);
    expect(guard.isManaged("registered")).toBe(false);
    await expect(guard.read("registered", f.legacy, vi.fn())).rejects.toMatchObject({
      result: { reason: "authorization_required" }
    });
    expect(loadManagedCatalog(f.root, 43).courses["20"]?.operationalSource).toBeUndefined();
    f.switchAccount(null);
    await expect(guard.read("registered", f.legacy, vi.fn())).rejects.toThrow();
    f.switchAccount(42);
    expect(guard.isManaged("registered")).toBe(true);
  });
  itGitIntegration(
    "requires explicit 2.8 fast-forward before cutover, and can optionally update the legacy mirror after a managed publication",
    async () => {
      const f = await fixture();
      const next = await f.advance();
      await expect(f.guard.cutover("registered")).rejects.toMatchObject({
        result: { reason: "operational_source_updateable", action: "update_source" }
      });
      await f.guard.updateSource("registered");
      expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(next);
      await f.guard.cutover("registered");
      await transact(f, edit, next);
      expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(next);
      await f.guard.updateSource("registered");
      expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(
        await git(f.cache, ["rev-parse", "HEAD"])
      );
    }
  );
  it.each(["dirty", "staged", "untracked", "ahead", "diverged", "unsafe", "conflicted"])(
    "blocks %s legacy state without changing its evidence",
    async (kind) => {
      const f = await fixture();
      if (kind === "unsafe") fs.writeFileSync(path.join(f.legacy, ".git", "MERGE_HEAD"), f.head);
      else if (kind === "untracked") fs.writeFileSync(path.join(f.legacy, "notes.txt"), "keep");
      else if (kind === "conflicted") {
        await git(f.legacy, ["config", "user.name", "Fixture"]);
        await git(f.legacy, ["config", "user.email", "fixture@example.test"]);
        await git(f.legacy, ["checkout", "-b", "other"]);
        await edit(f.legacy);
        await git(f.legacy, ["commit", "-am", "Other"]);
        await git(f.legacy, ["checkout", "main"]);
        fs.writeFileSync(path.join(f.legacy, "course.yml"), "different");
        await git(f.legacy, ["commit", "-am", "Main"]);
        await import("dugite").then(({ exec }) => exec(["merge", "other"], f.legacy));
      } else {
        await edit(f.legacy);
        if (kind === "staged") await git(f.legacy, ["add", "course.yml"]);
        if (kind === "ahead" || kind === "diverged") {
          await git(f.legacy, ["config", "user.name", "Fixture"]);
          await git(f.legacy, ["config", "user.email", "fixture@example.test"]);
          await git(f.legacy, ["commit", "-am", "Unpublished"]);
          if (kind === "diverged") await f.advance();
        }
      }
      const before = await git(f.legacy, ["status", "--porcelain=v2", "--untracked-files=all"]);
      await expect(f.guard.cutover("registered")).rejects.toThrow();
      expect(await git(f.legacy, ["status", "--porcelain=v2", "--untracked-files=all"])).toBe(
        before
      );
      expect(f.guard.isManaged("registered")).toBe(false);
      expect(f.push).not.toHaveBeenCalled();
    }
  );
  it("rejects wrong repository/organization and remote-only registration", async () => {
    const f = await fixture();
    remote.reader = {
      ...f.reader,
      resolve: async () => ({ ...(await f.reader.resolveId(20))!, id: 99 })
    };
    await expect(f.guard.cutover("registered")).rejects.toMatchObject({
      result: { reason: "operational_source_mismatch" }
    });
    await expect(f.guard.cutover("remote-only")).rejects.toMatchObject({
      result: { reason: "remote_only_mutation_unavailable" }
    });
  });
});

describe("real bundled-Git managed publication transactions", () => {
  it("validates, commits with trusted author, OAuth-pushes, and leaves cache clean at pushed HEAD; legacy stays unchanged", async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    const result = await transact(f, async (root) => {
      expect(root).not.toBe(f.cache);
      expect(root).not.toBe(f.legacy);
      expect(await git(root, ["rev-parse", "HEAD"])).toBe(f.head);
      return edit(root);
    });
    expect(result).toMatchObject({
      status: "success",
      publication: { status: "success", refreshRequired: false }
    });
    const head = await git(f.remote, ["rev-parse", "main"]);
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
    expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(f.head);
    expect(fs.readFileSync(path.join(f.legacy, "course.yml"), "utf8")).toBe(fixtureCourseYaml);
    expect(f.authenticate).toHaveBeenCalledWith("oauth-fixture-secret");
    expect(f.push).toHaveBeenCalledOnce();
    expect(f.push.mock.calls[0][1].authentication).toBe(f.auth.authentication);
    expect(await git(f.cache, ["log", "-1", "--format=%ae"])).toBe(
      "42+faculty@users.noreply.github.com"
    );
    expect(fs.readdirSync(path.join(f.root, "managed-courses/42/.transactions"))).toEqual([]);
    expect(JSON.stringify(loadManagedCatalog(f.root, 42))).not.toContain("oauth-fixture-secret");
  });
  it.each([
    "invalid_course",
    "invalid_term",
    "invalid_assignment",
    "unexpected",
    "unrelated_staged",
    "unsafe_path"
  ])("rejects %s with no push and no active-cache write", async (kind) => {
    const f = await fixture();
    await f.guard.cutover("registered");
    await expect(
      transact(f, async (root) => {
        await edit(root);
        if (kind === "invalid_course")
          fs.writeFileSync(path.join(root, "course.yml"), "invalid: yes");
        if (kind === "invalid_term")
          fs.writeFileSync(path.join(root, "terms/27s1/term.yml"), "invalid: yes");
        if (kind === "invalid_assignment") {
          fs.mkdirSync(path.join(root, "terms/27s1/assignments/broken"), { recursive: true });
          fs.writeFileSync(
            path.join(root, "terms/27s1/assignments/broken/assignment.yml"),
            "invalid: yes"
          );
        }
        if (kind === "unexpected" || kind === "unrelated_staged") {
          fs.writeFileSync(path.join(root, "notes.txt"), "unrelated");
          if (kind === "unrelated_staged") await git(root, ["add", "notes.txt"]);
        }
        if (kind === "unsafe_path") fs.symlinkSync(f.legacy, path.join(root, "link"));
        return { status: "success", diagnostics: [] };
      })
    ).rejects.toMatchObject({ result: { reason: "publication_failed" } });
    expect(f.push).not.toHaveBeenCalled();
    expect(await git(f.remote, ["rev-parse", "main"])).toBe(f.head);
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(f.head);
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
  });
  it("rejects stale revision before cloning or domain writes; fresh reload permits retry", async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    const winner = await f.advance();
    const mutate = vi.fn(edit);
    await expect(transact(f, mutate)).rejects.toMatchObject({
      result: { reason: "remote_version_conflict" }
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(f.clone).not.toHaveBeenCalled();
    const current = await f.guard.read(
      "registered",
      f.legacy,
      async (context) => context!.authoritativeCommit
    );
    expect(current).toBe(winner);
    await transact(f, mutate, current);
    expect(mutate).toHaveBeenCalledOnce();
  });
  it("detects remote advance immediately before push with no push/merge/rebase", async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    let winner = "";
    await expect(
      transact(f, async (root) => {
        await edit(root);
        winner = await f.advance();
        return { status: "success", diagnostics: [] };
      })
    ).rejects.toMatchObject({ result: { reason: "remote_version_conflict" } });
    expect(f.push).not.toHaveBeenCalled();
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(winner);
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
  });
  it("non-force push loses safely to a real concurrent push after freshness check", async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    let winner = "";
    f.setOnPush(async () => {
      winner = await f.advance();
    });
    await expect(transact(f, edit)).rejects.toMatchObject({
      result: { reason: "remote_version_conflict" }
    });
    expect(f.push).toHaveBeenCalledOnce();
    expect(await git(f.remote, ["rev-parse", "main"])).toBe(winner);
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(winner);
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
  });
  it("server rejection preserves clean active source, with no local ahead state", async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    fs.writeFileSync(path.join(f.remote, "hooks/pre-receive"), "#!/bin/sh\nexit 1\n", {
      mode: 0o755
    });
    await expect(transact(f, edit)).rejects.toMatchObject({
      result: { reason: "publication_failed" }
    });
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(f.head);
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
  });
  it("records remote success when local activation fails and recovers on a subsequent synchronization without republishing", async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    f.setOnPush(async () => {
      f.failRefresh();
    });
    const result = await transact(f, edit);
    expect(result).toMatchObject({
      status: "success",
      publication: { status: "success", refreshRequired: true }
    });
    const head = await git(f.remote, ["rev-parse", "main"]);
    expect(head).not.toBe(f.head);
    expect(loadManagedCatalog(f.root, 42).courses["20"].lastPublication).toEqual({
      status: "refresh_required",
      commit: head
    });
    await f.guard.read("registered", f.legacy, async () => {});
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(head);
    expect(f.push).toHaveBeenCalledOnce();
  });
  it("allows an authorized operation to remove its own faculty assignment", async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    const result = await f.guard.run("registered", f.legacy, "new_mutation", (context, input) =>
      f.guard.transaction(
        context,
        input,
        f.head,
        (file) => file === "terms/27s1/term.yml",
        async (root) => {
          fs.writeFileSync(
            path.join(root, "terms/27s1/term.yml"),
            fs
              .readFileSync(path.join(root, "terms/27s1/term.yml"), "utf8")
              .replace("jones", "other")
          );
          return { status: "success", diagnostics: [] };
        },
        vi.fn()
      )
    );
    expect(result).toMatchObject({ publication: { status: "success", refreshRequired: false } });
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
    await expect(
      f.guard.run("registered", f.legacy, "new_mutation", vi.fn())
    ).rejects.toMatchObject({ result: { reason: "course_access_lost" } });
  });
  it("serializes transactions from the same base so only one can publish", async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    const results = await Promise.allSettled([transact(f, edit), transact(f, edit)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(f.push).toHaveBeenCalledOnce();
  });
});

describe("managed IPC routing and view read versions", () => {
  it("projects assignment/roster/comment/course reads to managed state and prevents path substitution", async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    const a = adapter(f);
    for (const channel of [
      IPC_CHANNELS.loadAssignmentSetupTerms,
      IPC_CHANNELS.getAssignmentForEdit,
      IPC_CHANNELS.loadRosterTerms,
      IPC_CHANNELS.getRosterForSection,
      IPC_CHANNELS.getAssignmentGroupConfig,
      IPC_CHANNELS.getStudentRepositoryAccessPageStatus,
      IPC_CHANNELS.loadGradingCommentLibrary
    ]) {
      a.ipc.handle(channel, (_event, request) => {
        expect(managedCourseOperation.getStore()?.courseFolderPath).toBe(f.cache);
        if (request.courseFolderPath) expect(request.courseFolderPath).toBe(f.cache);
        return { status: "success" };
      });
      expect(
        await a.call(channel, {
          courseFolderId: "registered",
          ...(channel === IPC_CHANNELS.loadGradingCommentLibrary
            ? {}
            : { courseFolderPath: f.legacy })
        })
      ).toMatchObject({ courseReadRevision: f.head });
      await expect(
        a.call(channel, { courseFolderId: "registered", courseFolderPath: f.writer })
      ).rejects.toMatchObject({ result: { reason: "operational_source_mismatch" } });
    }
  });
  it.each(
    COURSE_MUTATION_CHANNELS.filter(
      (c) => !COURSE_ADMIN_CHANNELS.includes(c) && c !== IPC_CHANNELS.publishCourseChanges
    )
  )("%s derives external operation configuration from managed state", async (channel) => {
    const f = await fixture();
    await f.guard.cutover("registered");
    const a = adapter(f);
    const handler = vi.fn((_e, request) => {
      expect(request.courseFolderPath).toBe(f.cache);
      return { status: "success" };
    });
    a.ipc.handle(channel, handler);
    await a.call(channel, { courseFolderId: "registered", courseFolderPath: f.legacy });
    expect(handler).toHaveBeenCalledOnce();
    expect(f.push).not.toHaveBeenCalled();
  });
  it("never calls legacy Publish Course Changes after cutover, and retains that path before cutover", async () => {
    const f = await fixture();
    const a = adapter(f),
      publish = vi.fn(() => ({ status: "success" }));
    a.ipc.handle(IPC_CHANNELS.publishCourseChanges, publish);
    await a.call(IPC_CHANNELS.publishCourseChanges, "registered");
    expect(publish).toHaveBeenCalledOnce();
    await f.guard.cutover("registered");
    publish.mockClear();
    expect(await a.call(IPC_CHANNELS.publishCourseChanges, "registered")).toMatchObject({
      status: "up_to_date"
    });
    expect(publish).not.toHaveBeenCalled();
  });
  it("publishes Pages config transactionally; invalidates siblings, rejects stale previews and preserves source paths", async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    const a = adapter(f);
    a.ipc.handle(IPC_CHANNELS.getAssignmentForEdit, () => ({ status: "success" }));
    await a.call(
      IPC_CHANNELS.getAssignmentForEdit,
      { courseFolderId: "registered", courseFolderPath: f.legacy },
      a.views[1]
    );
    a.ipc.handle(IPC_CHANNELS.saveStudentAccessPagesConfig, (_e, request) =>
      saveStudentAccessPagesConfig(request)
    );
    const result = await a.call(IPC_CHANNELS.saveStudentAccessPagesConfig, {
      courseFolderId: "registered",
      courseFolderPath: f.legacy,
      expectedCourseRevision: f.head,
      repository: "fixture/pages",
      baseUrl: "https://example.test",
      branch: "main"
    });
    expect(result).toMatchObject({ status: "success", publication: { status: "success" } });
    expect(a.views[1].send).toHaveBeenCalledWith(expect.any(String), {
      status: "view_invalidated"
    });
    const preview = vi.fn();
    a.ipc.handle(IPC_CHANNELS.previewRosterSave, preview);
    await expect(
      a.call(IPC_CHANNELS.previewRosterSave, {
        courseFolderId: "registered",
        courseFolderPath: f.legacy,
        expectedCourseRevision: f.head
      })
    ).rejects.toMatchObject({ result: { reason: "remote_version_conflict" } });
    expect(preview).not.toHaveBeenCalled();
  });
});

describe("course admin transaction inventory", () => {
  it.each(COURSE_ADMIN_CHANNELS)(
    "%s rejects missing read versions before domain work or clone",
    async (channel) => {
      const f = await fixture();
      await f.guard.cutover("registered");
      const a = adapter(f),
        write = vi.fn();
      a.ipc.handle(channel, write);
      await expect(
        a.call(channel, { courseFolderId: "registered", courseFolderPath: f.legacy })
      ).rejects.toMatchObject({ result: { reason: "remote_version_conflict" } });
      expect(write).not.toHaveBeenCalled();
      expect(f.clone).not.toHaveBeenCalled();
    }
  );
  itGitIntegration(
    "uses existing assignment create/edit/delete and roster validators in isolated transactions",
    async () => {
      const f = await fixture();
      await f.guard.cutover("registered");
      const { saveAssignmentSetup } = await import("./assignmentSetupService");
      const { getAssignmentForEdit, saveAssignmentEdit } = await import("./assignmentEditService");
      const { deleteAssignment } = await import("./assignmentDeleteService");
      const { saveRoster } = await import("./rosterManagerService");
      const { allowedCourseMutationPath } = await import("./courseMutationIpc");
      const run = async (
        channel: string,
        fields: Record<string, unknown>,
        mutate: (root: string) => unknown
      ) =>
        f.guard.run("registered", f.legacy, "new_mutation", async (context, input) =>
          f.guard.transaction(
            context,
            input,
            context.authoritativeCommit,
            (file) => allowedCourseMutationPath(channel, fields, file),
            async (root) => mutate(root),
            vi.fn()
          )
        );
      const setup = {
        courseFolderId: "registered",
        courseFolderPath: f.legacy,
        assignmentTitle: "Lab 1",
        assignmentSlug: "lab01",
        termCode: "27s1",
        sectionIds: ["001"],
        templateRepository: "",
        templateBranch: "",
        dueAt: "2027-06-15T23:59:00-05:00",
        gradingEnabled: false,
        points: null,
        facultyOwner: "jones",
        lmsAssignmentId: "",
        gradingCategory: "labs",
        requiredFiles: [],
        rubric: [],
        confirmed: true,
        replaceExisting: false
      };
      expect(
        await run(IPC_CHANNELS.saveAssignmentSetup, setup, (root) =>
          saveAssignmentSetup({ ...setup, courseFolderPath: root })
        )
      ).toMatchObject({ status: "success", publication: { status: "success" } });
      const file = "terms/27s1/assignments/lab01/assignment.yml";
      const original = getAssignmentForEdit(f.cache, file).model!;
      expect(
        await run(IPC_CHANNELS.saveAssignmentEdit, { assignmentFile: file }, (root) =>
          saveAssignmentEdit({
            ...original,
            courseFolderId: "registered",
            courseFolderPath: root,
            confirmed: true,
            lmsAssignmentId: original.lmsAssignmentId ?? "",
            assignmentTitle: "Updated title"
          })
        )
      ).toMatchObject({ status: "success", publication: { status: "success" } });
      expect(
        await run(IPC_CHANNELS.saveRoster, { termCode: "27s1", sectionId: "001" }, (root) =>
          saveRoster({
            courseFolderId: "registered",
            courseFolderPath: root,
            termCode: "27s1",
            sectionId: "001",
            rows: [
              { studentId: "s1", githubUsername: "student", section: "001", status: "active" }
            ],
            faculty: ["jones"],
            sourceKind: "manual_edit",
            confirmed: true
          })
        )
      ).toMatchObject({ status: "success", publication: { status: "success" } });
      expect(
        await run(IPC_CHANNELS.deleteAssignment, { assignmentFile: file }, (root) =>
          deleteAssignment({
            courseFolderId: "registered",
            courseFolderPath: root,
            assignmentFile: file,
            confirmed: true
          })
        )
      ).toMatchObject({ status: "success", publication: { status: "success" } });
      expect(f.push).toHaveBeenCalledTimes(4);
      expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
      expect(await git(f.legacy, ["rev-parse", "HEAD"])).toBe(f.head);
    }
  );
  it("rejects a dirty managed cache before cutover or mutation", async () => {
    const f = await fixture();
    fs.writeFileSync(path.join(f.cache, "untracked.txt"), "keep");
    await expect(f.guard.cutover("registered")).rejects.toMatchObject({
      result: { reason: "managed_cache_review_required" }
    });
    expect(f.push).not.toHaveBeenCalled();
  });
  it("does not publish after account switch during domain work", async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    await expect(
      transact(f, async (root) => {
        const result = await edit(root);
        f.switchAccount(43);
        return result;
      })
    ).rejects.toMatchObject({ result: { reason: "authorization_required" } });
    expect(f.push).not.toHaveBeenCalled();
    expect(await git(f.remote, ["rev-parse", "main"])).toBe(f.head);
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
  });
});

itGitIntegration(
  "invalidates open managed views when an independent synchronization observes a new authoritative revision",
  async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    const a = adapter(f);
    a.ipc.handle(IPC_CHANNELS.getAssignmentForEdit, () => ({ status: "success" }));
    await a.call(IPC_CHANNELS.getAssignmentForEdit, {
      courseFolderId: "registered",
      courseFolderPath: f.legacy
    });
    const winner = await f.advance();
    a.ipc.invalidateRevision(42, 20, winner);
    expect(a.views[0].send).toHaveBeenCalledWith(expect.any(String), {
      status: "view_invalidated"
    });
    const mutate = vi.fn();
    a.ipc.handle(IPC_CHANNELS.saveRoster, mutate);
    await expect(
      a.call(IPC_CHANNELS.saveRoster, {
        courseFolderId: "registered",
        courseFolderPath: f.legacy,
        expectedCourseRevision: winner
      })
    ).rejects.toMatchObject({ result: { reason: "view_refresh_required" } });
    expect(mutate).not.toHaveBeenCalled();
  }
);

itGitIntegration(
  "invalidates an editor's old account generation even when the repository SHA is unchanged",
  async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    const a = adapter(f);
    a.ipc.handle(IPC_CHANNELS.getAssignmentForEdit, () => ({ status: "success" }));
    await a.call(IPC_CHANNELS.getAssignmentForEdit, {
      courseFolderId: "registered",
      courseFolderPath: f.legacy
    });
    f.switchAccount(42);
    const mutate = vi.fn();
    a.ipc.handle(IPC_CHANNELS.saveRoster, mutate);
    await expect(
      a.call(IPC_CHANNELS.saveRoster, {
        courseFolderId: "registered",
        courseFolderPath: f.legacy,
        expectedCourseRevision: f.head
      })
    ).rejects.toMatchObject({ result: { reason: "view_refresh_required" } });
    expect(mutate).not.toHaveBeenCalled();
  }
);

itGitIntegration("rejects a renderer-selected managed path even before cutover", async () => {
  const f = await fixture(),
    read = vi.fn();
  await expect(f.guard.read("registered", f.cache, read)).rejects.toMatchObject({
    result: { reason: "operational_source_mismatch" }
  });
  expect(read).not.toHaveBeenCalled();
});

itGitIntegration(
  "uses managed state for another registration of the same cut-over repository and persists that binding",
  async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    Object.assign(f.course, { localFolderIds: ["registered", "second"] });
    const second = {
      ...f.deps.folders()[0],
      id: "second",
      path: path.join(f.root, "unavailable-external-copy")
    };
    const guard = new ManagedCourseMutationGuard({
      ...f.deps,
      folders: () => [...f.deps.folders(), second]
    });
    await guard.read("second", second.path, async (context) =>
      expect(context?.courseFolderPath).toBe(f.cache)
    );
    expect(loadManagedCatalog(f.root, 42).courses["20"].operationalFolderIds).toEqual([
      "registered",
      "second"
    ]);
  }
);

itGitIntegration(
  "recognizes server acceptance after a transport error without publishing twice",
  async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    f.setAfterPush(async () => {
      throw new Error("Connection closed after server accepted push");
    });
    expect(await transact(f, edit)).toMatchObject({
      status: "success",
      publication: { status: "success", refreshRequired: false }
    });
    expect(f.push).toHaveBeenCalledOnce();
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(
      await git(f.remote, ["rev-parse", "main"])
    );
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
  }
);

itGitIntegration(
  "can establish remote success through cache recovery when transaction outcome fetch fails",
  async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    f.setAfterPush(async () => {
      f.failTransactionFetches(1);
      throw new Error("Connection closed after push");
    });
    expect(await transact(f, edit)).toMatchObject({
      status: "success",
      publication: { status: "success", refreshRequired: false }
    });
    expect(f.push).toHaveBeenCalledOnce();
    expect(loadManagedCatalog(f.root, 42).courses["20"].lastPublication?.status).toBe("published");
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
  }
);

it.each(["notes.txt", ".graider/grading/comments.json"])(
  "rejects ignored transaction output %s instead of silently reporting publication",
  async (file) => {
    const f = await fixture();
    await f.guard.cutover("registered");
    fs.writeFileSync(path.join(f.writer, ".gitignore"), `${file}\n`);
    await git(f.writer, ["add", ".gitignore"]);
    await git(f.writer, ["commit", "-m", "Ignore fixture output"]);
    await git(f.writer, ["push", "origin", "main"]);
    const base = await git(f.remote, ["rev-parse", "main"]);
    await expect(
      f.guard.run("registered", f.legacy, "new_mutation", (context, input) =>
        f.guard.transaction(
          context,
          input,
          base,
          (changed) => changed === "course.yml" || changed === ".graider/grading/comments.json",
          async (root) => {
            if (file === "notes.txt") await edit(root);
            fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
            fs.writeFileSync(
              path.join(root, file),
              file === "notes.txt"
                ? "hidden side effect"
                : JSON.stringify({ schemaVersion: 1, comments: [] })
            );
            return { status: "success", diagnostics: [] };
          },
          vi.fn()
        )
      )
    ).rejects.toMatchObject({ result: { reason: "publication_failed" } });
    expect(f.push).not.toHaveBeenCalled();
    expect(await git(f.remote, ["rev-parse", "main"])).toBe(base);
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

itGitIntegration(
  "revalidates repository organization before publication after a network-waiting mutation",
  async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    await expect(
      transact(f, async (root) => {
        const result = await edit(root);
        remote.reader = {
          ...f.reader,
          resolveId: async () => ({ ...(await f.reader.resolveId(20))!, organizationId: 99 })
        };
        return result;
      })
    ).rejects.toMatchObject({ result: { reason: "organization_migration_required" } });
    expect(f.push).not.toHaveBeenCalled();
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(f.head);
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
  }
);

itGitIntegration(
  "keeps real grading-state writes outside the managed Git source across synchronization and course publication",
  async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    const backend = require(path.resolve("dist-electron/gradingStudentViewStateBackend.cjs")) as {
      saveGradingStudentViewStateContext(request: object): { status: string };
      loadGradingStudentViewStateContext(request: object): { status: string; viewState?: object };
    };
    const viewState = { scrollTop: 12, cursor: { file: "src/Main.java", line: 1, column: 1 } };
    const request = {
      courseFolderPath: f.cache,
      termCode: "27s1",
      assignmentSlug: "lab01",
      studentId: "s1",
      currentSubmissionCommitSha: "a".repeat(40),
      viewState
    };
    await f.guard.read("registered", f.legacy, async () =>
      expect(backend.saveGradingStudentViewStateContext(request)).toMatchObject({
        status: "success"
      })
    );
    expect(
      fs.existsSync(
        path.join(path.dirname(f.cache), "runtime/.graider/grading/27s1/lab01/state/s1.json")
      )
    ).toBe(true);
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
    await transact(f, edit);
    expect(backend.loadGradingStudentViewStateContext(request)).toMatchObject({
      status: "success",
      viewState
    });
    expect(await git(f.cache, ["status", "--porcelain"])).toBe("");
  }
);

itGitIntegration(
  "releases the managed queue before a native import chooser waits for user input",
  async () => {
    const f = await fixture();
    await f.guard.cutover("registered");
    const a = adapter(f);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
        enter = resolve;
      }),
      chosen = new Promise<void>((resolve) => {
        release = resolve;
      });
    a.ipc.handle(IPC_CHANNELS.chooseReviewImport, async (_event, request) => {
      expect(request.courseFolderPath).toBe(f.cache);
      enter();
      await chosen;
      return { status: "canceled" };
    });
    const choosing = a.call(IPC_CHANNELS.chooseReviewImport, {
      courseFolderId: "registered",
      courseFolderPath: f.legacy
    });
    await entered;
    try {
      await f.guard.read("registered", f.legacy, async (context) =>
        expect(context?.courseFolderPath).toBe(f.cache)
      );
    } finally {
      release();
    }
    await choosing;
  }
);

describe("managed-only course identity", () => {
  it("routes reads and transactional publication without registration or cutover, across restart and rename", async () => {
    const f = await fixture();
    f.deps.folders().splice(0);
    Object.assign(f.course, { localFolderIds: [] });
    const guard = new ManagedCourseMutationGuard(f.deps);
    const selector = guard.remoteSelectors()[0];
    expect(selector.id).toBe("managed-course:42:20");
    expect(selector.path).not.toBe(f.cache);
    await guard.read(selector.id, selector.path, async (context) => {
      expect(context).toMatchObject({
        managed: true,
        courseFolderPath: f.cache,
        authoritativeCommit: f.head
      });
    });
    await expect(guard.read(selector.id, f.cache, vi.fn())).rejects.toMatchObject({
      result: { reason: "operational_source_mismatch" }
    });
    await expect(
      guard.run(selector.id, selector.path, "new_mutation", (context, input) =>
        guard.transaction(context, input, "stale", () => true, edit, vi.fn())
      )
    ).rejects.toThrow();
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(f.head);
    await guard.run(selector.id, selector.path, "new_mutation", (context, input) =>
      guard.transaction(context, input, f.head, (file) => file === "course.yml", edit, vi.fn())
    );
    expect(fs.readFileSync(path.join(f.cache, "course.yml"), "utf8")).toContain("Managed edit");
    Object.assign(f.course, { name: "renamed", title: "Renamed" });
    expect(new ManagedCourseMutationGuard(f.deps).remoteSelectors()[0].id).toBe(selector.id);
    expect(f.deps.folders()).toEqual([]);
    expect(loadManagedCatalog(f.root, 42).courses["20"].operationalFolderIds ?? []).toEqual([]);
    f.switchAccount(43);
    await expect(guard.read(selector.id, selector.path, vi.fn())).rejects.toThrow();
  });
});

itGitIntegration(
  "projects managed-only assignment/roster/grading reads with exact revisions",
  async () => {
    const f = await fixture();
    f.deps.folders().splice(0);
    Object.assign(f.course, { localFolderIds: [] });
    const id = f.guard.remoteSelectors()[0].id;
    const a = adapter(f);
    for (const channel of [
      IPC_CHANNELS.getAssignmentDetail,
      IPC_CHANNELS.getRosterSectionSummaries,
      IPC_CHANNELS.prepareGradingWorkspace
    ]) {
      a.ipc.handle(channel, async (_event, request) => {
        const context = managedCourseOperation.getStore();
        expect(context?.courseFolderPath).toBe(f.cache);
        expect(request.courseFolderPath).toBe(f.cache);
        return { courseFolderPath: context?.courseFolderPath };
      });
      expect(await a.call(channel, { courseFolderId: id, courseFolderPath: id })).toMatchObject({
        courseFolderPath: id,
        courseReadRevision: f.head
      });
    }
    await expect(f.guard.read("managed-course:99:20", undefined, vi.fn())).rejects.toThrow();
    await expect(f.guard.read("managed-course:42:21", undefined, vi.fn())).rejects.toThrow();
  }
);
