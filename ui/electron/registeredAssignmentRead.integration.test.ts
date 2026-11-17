// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { managedOperationalFixture, fixtureGit as git } from "./managedOperationalFixtures.js";
import { removeGitFixture, GIT_INTEGRATION_TIMEOUT_MS } from "./gitIntegrationFixtures.js";
import { createCourseMutationIpc } from "./courseMutationIpc.js";
import {
  IPC_CHANNELS,
  type AssignmentDetailRequest,
  type AssignmentGroupConfigRequest,
  type AssignmentRepositoryDownloadRequest
} from "./ipc.js";
import { createManagedCourseProcessRunner } from "./managedCourseProcessRunner.js";
import { runAssignmentRepositoryDownload } from "./assignmentRepositoryDownloadRunner.js";
import { createGradingWorkspaceService } from "./gradingWorkspaceService.js";
import { createFacultyScopeService } from "./facultyScopeService.js";
import { getLocalSettingsPath, saveCurrentFacultyMsoeUsername } from "./localSettings.js";
import { parse, stringify } from "yaml";
import { createGradingStudentSourceService } from "./gradingStudentSourceService.js";
import {
  getLocalRepositoryLocatorPath,
  recordSuccessfulDownloadLocators
} from "./localRepositoryLocator.js";
import { getAssignmentDetail } from "./assignmentDetailRunner.js";
import { getAssignmentGroupConfig } from "./assignmentGroupConfigService.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { managedCourseOperation } from "./managedCourseOperationContext.js";
import { createRemoteRepositoryReader } from "./githubRemoteRepositories.js";

vi.mock("./githubRemoteRepositories.js", () => ({
  createRemoteRepositoryReader: vi.fn()
}));
const DOWNLOAD_GRADING_TIMEOUT_MS = 60_000;
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
const fixture = async (managed = false) => {
  const f = await managedOperationalFixture();
  roots.push(f.root);
  vi.mocked(createRemoteRepositoryReader).mockReturnValue(f.reader);
  addAssignment(f.writer, "lab01");
  const studentCount = 47;
  const students = Array.from({ length: studentCount }, (_, index) => ({
    studentId: `s${index}`,
    githubUsername: `student${index}`,
    repositoryName: `27s1-fixture101-lab01-student${index}`
  }));
  const rosters = path.join(f.writer, "terms", "27s1", "rosters");
  fs.mkdirSync(rosters, { recursive: true });
  fs.appendFileSync(
    path.join(f.writer, "terms", "27s1", "term.yml"),
    "    roster: rosters/section-001.csv\n"
  );
  fs.writeFileSync(
    path.join(rosters, "section-001.csv"),
    "student_id,github_username,section,status\n" +
      students.map((s) => `${s.studentId},${s.githubUsername},001,active\n`).join("")
  );
  const manifestContent = stringify({
    schema_version: 2,
    repository_mode: "individual",
    targets: students.map((s) => ({
      target_id: s.studentId,
      mode: "individual",
      repository_name: s.repositoryName,
      clone_url: `https://github.com/fixture/${s.repositoryName}.git`,
      section_ids: ["001"],
      student_ids: [s.studentId],
      github_usernames: [s.githubUsername],
      diagnostics: []
    })),
    student_mappings: students.map((s) => ({
      student_id: s.studentId,
      github_username: s.githubUsername,
      target_id: s.studentId,
      repository_name: s.repositoryName
    })),
    diagnostics: []
  });
  const base = await commit(f.writer);
  await git(f.writer, ["push", "origin", "main"]);
  for (const root of [f.cache, f.legacy]) await git(root, ["pull", "--ff-only"]);
  if (managed) Object.assign(f.course, { localFolderIds: [] });
  const selection = managed ? f.guard.remoteSelectors()[0]! : { id: "registered", path: f.legacy };
  const runtimeRoot = managed ? path.join(path.dirname(f.cache), "runtime") : f.legacy;
  const manifestPath = path.join(
    runtimeRoot,
    "terms",
    "27s1",
    "manifests",
    "lab01",
    "manifest.yml"
  );
  const writeManifest = (content = manifestContent) => {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, content);
  };
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
  // Only student clone transport is mocked; the download backend, manifest parsing,
  // IPC authorization and the source/runtime environment wrapper are production code.
  const studentRepository = path.join(f.root, "student-fixture");
  fs.mkdirSync(studentRepository);
  await git(studentRepository, ["init", "--initial-branch=main"]);
  fs.writeFileSync(path.join(studentRepository, "submission.txt"), "Existing student submission\n");
  await commit(studentRepository);
  const cloneScript = path.join(f.root, "download-fixture.mjs");
  fs.writeFileSync(
    cloneScript,
    `
    import fs from "node:fs";
    import { exec as git } from ${JSON.stringify(pathToFileURL(require.resolve("dugite")).href)};
    import { downloadAssignmentRepositories } from ${JSON.stringify(pathToFileURL(path.resolve("../src/repository-download/repository-download.ts")).href)};
    const input = JSON.parse(process.argv[2]);
    const result = await downloadAssignmentRepositories({ ...input, token: process.env.GRAIDER_GITHUB_TOKEN,
      dependencies: { git: { verifyAvailable: async () => {}, clone: async ({ destination }) => {
        const cloned = await git(["clone", "--no-hardlinks", ${JSON.stringify(studentRepository)}, destination], ${JSON.stringify(f.root)});
        if (cloned.exitCode !== 0) throw new Error("Local fixture clone failed");
        return { root: destination };
      } } }
    });
    process.stdout.write(JSON.stringify(result));
  `
  );
  const launches: Array<{ cwd?: string; source?: string; runtime?: string; command: string }> = [];
  const runner = createManagedCourseProcessRunner(async (input) => {
    const download = input.args[1] === "download-repositories";
    expect(input.cwd).toBe(download && !managed ? f.legacy : f.cache);
    if (!download) expect(input.env).not.toHaveProperty("GRAIDER_GITHUB_TOKEN");
    launches.push({
      cwd: input.cwd,
      source: input.env?.GRAIDER_MANAGED_COURSE_SOURCE,
      runtime: input.env?.GRAIDER_MANAGED_COURSE_RUNTIME,
      command: input.args[1]
    });
    const result = await promisify(execFile)(
      process.execPath,
      [
        "--import",
        pathToFileURL(require.resolve("tsx")).href,
        ...(download
          ? [
              cloneScript,
              JSON.stringify({
                cwd: input.cwd,
                assignmentFile: input.args[2],
                destination: input.args[4]
              })
            ]
          : [path.resolve("../src/cli/index.ts"), ...input.args])
      ],
      { cwd: input.cwd, env: input.env }
    );
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr, error: null };
  });
  ipc.handle(IPC_CHANNELS.getAssignmentDetail, (_event, request: AssignmentDetailRequest) =>
    getAssignmentDetail(request, { env: {}, runner })
  );
  ipc.handle(
    IPC_CHANNELS.downloadAssignmentRepositories,
    async (_event, request: AssignmentRepositoryDownloadRequest) => {
      const result = await runAssignmentRepositoryDownload(request, { runner, env: {} });
      recordSuccessfulDownloadLocators(
        getLocalRepositoryLocatorPath(f.root),
        {
          courseFolderId: request.courseFolderId,
          termCode: "27s1",
          assignmentSlug: "lab01"
        },
        result.targets ?? []
      );
      return result;
    }
  );
  saveCurrentFacultyMsoeUsername(getLocalSettingsPath(f.root), "jones");
  const resolveFacultyScope = createFacultyScopeService(
    require("../dist-electron/facultyScopeBackend.cjs")
  );
  const workspace = createGradingWorkspaceService({
    backend: require("../dist-electron/gradingWorkspaceBackend.cjs"),
    resolveFacultyScope
  });
  const source = createGradingStudentSourceService({
    resolveFacultyScope,
    loadBackend: () => require("../dist-electron/gradingStudentSourceBackend.cjs")
  });
  ipc.handle(IPC_CHANNELS.loadGradingStudentSource, (_event, request) =>
    source({ ...request, userDataPath: f.root })
  );
  ipc.handle(IPC_CHANNELS.prepareGradingWorkspace, (_event, request) =>
    workspace({ ...request, userDataPath: f.root })
  );
  const open = async (slug = "lab01", revision = base) => {
    const request = {
      courseFolderId: selection.id,
      courseFolderPath: selection.path,
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
    if (!managed)
      expect(sender.send).toHaveBeenCalledWith("graider-ui:course-mutation:notice", {
        status: "cached_course_read",
        commit: revision
      });
    return detail;
  };
  const call = (channel: string, fields: Record<string, unknown> = {}) =>
    invoke(channel, {
      courseFolderId: selection.id,
      courseFolderPath: selection.path,
      assignmentFile: assignmentFile("lab01"),
      ...fields
    });
  return {
    ...f,
    base,
    open,
    sender,
    call,
    ipc,
    manifestPath,
    runtimeRoot,
    writeManifest,
    students,
    studentCount,
    launches
  };
};

it.each([false, true])(
  "keeps grading available after a successful download of 47 submissions (managed=%s)",
  async (managed) => {
    const f = await fixture(managed);
    f.writeManifest();
    const destination = path.join(f.root, "submissions");
    expect(
      await f.call(IPC_CHANNELS.downloadAssignmentRepositories, { destination })
    ).toMatchObject({
      status: "success",
      totalTargets: f.studentCount,
      clonedCount: f.studentCount,
      failedCount: 0
    });
    const snapshot = () =>
      Object.fromEntries(
        fs
          .readdirSync(destination, { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => {
            const file = path.join(entry.parentPath, entry.name);
            return [
              path.relative(destination, file),
              createHash("sha256").update(fs.readFileSync(file)).digest("hex")
            ];
          })
      );
    const before = snapshot();
    const manifestBefore = fs.readFileSync(f.manifestPath, "utf8");
    const gradingNotes = path.join(f.runtimeRoot, ".graider", "grading", "local-notes.txt");
    fs.mkdirSync(path.dirname(gradingNotes), { recursive: true });
    fs.writeFileSync(gradingNotes, "Existing faculty grading notes");
    const sourceBefore = await git(f.legacy, ["status", "--porcelain"]);
    expect(
      fs.existsSync(path.join(f.cache, "terms", "27s1", "manifests", "lab01", "manifest.yml"))
    ).toBe(false);
    const downloadLaunch = f.launches.at(-1);
    expect(downloadLaunch).toMatchObject({
      cwd: managed ? f.cache : f.legacy,
      source: managed ? f.cache : undefined,
      runtime: managed ? path.join(path.dirname(f.cache), "runtime") : undefined
    });
    vi.mocked(createRemoteRepositoryReader).mockImplementation(() => {
      throw new Error("Offline");
    });
    const sync = vi.spyOn(f.deps.session, "withSynchronizedCourse");
    const authenticate = f.authenticate.mock.calls.length;
    for (const student of f.students.slice(0, 2)) {
      expect(await f.open()).toMatchObject({
        detail: {
          applyState: { status: "applied" },
          roster: { activeStudentCount: f.studentCount }
        }
      });
      expect(
        await f.call(IPC_CHANNELS.prepareGradingWorkspace, {
          termCode: "27s1",
          assignmentSlug: "lab01",
          studentId: student.studentId
        })
      ).toMatchObject({
        status: "success",
        students: expect.arrayContaining([
          expect.objectContaining({ studentId: student.studentId })
        ])
      });
    }
    for (const student of f.students.slice(0, 2)) {
      expect(
        await f.call(IPC_CHANNELS.loadGradingStudentSource, {
          termCode: "27s1",
          assignmentSlug: "lab01",
          studentId: student.studentId
        })
      ).toMatchObject({ status: "success", studentId: student.studentId });
    }
    expect(sync).not.toHaveBeenCalled();
    expect(f.authenticate).toHaveBeenCalledTimes(authenticate);
    expect(f.launches.filter((l) => l.command === "detail").every((l) => l.cwd === f.cache)).toBe(
      true
    );
    expect(fs.readFileSync(f.manifestPath, "utf8")).toBe(manifestBefore);
    expect(snapshot()).toEqual(before);
    expect(fs.readFileSync(gradingNotes, "utf8")).toBe("Existing faculty grading notes");
    expect(await git(f.legacy, ["status", "--porcelain"])).toBe(sourceBefore);
  },
  DOWNLOAD_GRADING_TIMEOUT_MS
);

it.each([false, true])(
  "retains partial Apply state through the guarded cached view and clears it after recovery (managed=%s)",
  async (managed) => {
    const f = await fixture(managed);
    f.writeManifest();
    const saved = parse(fs.readFileSync(f.manifestPath, "utf8")) as Record<string, unknown>;
    f.writeManifest(
      stringify({
        ...saved,
        diagnostics: [
          {
            code: "workflow_deployment_forbidden",
            severity: "error",
            message: "Workflow setup requires authorization.",
            context: {
              operationType: "ensure_managed_grading_workflow",
              workflowPath: ".github/workflows/grade.yml"
            }
          }
        ]
      })
    );
    const before = fs.readFileSync(f.manifestPath, "utf8");
    expect(await f.open()).toMatchObject({
      detail: { applyState: { status: "partially_applied" } }
    });
    expect(fs.readFileSync(f.manifestPath, "utf8")).toBe(before);
    f.writeManifest();
    expect(await f.open()).toMatchObject({ detail: { applyState: { status: "applied" } } });
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it.each([false, true])(
  "does not enable grading or download for missing or invalid runtime manifests (managed=%s)",
  async (managed) => {
    const f = await fixture(managed);
    const destination = path.join(f.root, "submissions");
    expect(await f.open()).toMatchObject({ detail: { applyState: { status: "not_applied" } } });
    expect(
      await f.call(IPC_CHANNELS.downloadAssignmentRepositories, { destination })
    ).toMatchObject({ status: "failure", clonedCount: 0 });
    f.writeManifest("invalid: manifest\n");
    expect(await f.open()).toMatchObject({ detail: { applyState: { status: "unknown" } } });
    expect(
      await f.call(IPC_CHANNELS.downloadAssignmentRepositories, { destination })
    ).toMatchObject({ status: "failure", clonedCount: 0 });
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.readFileSync(f.manifestPath, "utf8")).toBe("invalid: manifest\n");
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it.each(["unpublished", "dirty", "hidden-metadata", "source-ahead", "hardlink"] as const)(
  "does not trust a registered runtime manifest with %s source evidence",
  async (kind) => {
    const f = await fixture();
    f.writeManifest();
    if (kind === "hardlink") fs.linkSync(f.manifestPath, path.join(f.root, "manifest-link.yml"));
    else if (kind === "source-ahead") {
      await f.advance();
      await git(f.legacy, ["pull", "--ff-only"]);
    } else {
      const file = path.join(f.legacy, "course.yml");
      if (kind === "hidden-metadata")
        await git(f.legacy, ["update-index", "--assume-unchanged", "course.yml"]);
      fs.appendFileSync(file, "\n# local faculty metadata\n");
      if (kind === "unpublished")
        await git(f.legacy, [
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.test",
          "commit",
          "-am",
          "Unpublished"
        ]);
    }
    if (kind === "hardlink") await expect(f.open()).rejects.toThrow();
    else expect(await f.open()).toMatchObject({ detail: { applyState: { status: "unknown" } } });
    if (kind !== "hardlink")
      await expect(
        f.call(IPC_CHANNELS.prepareGradingWorkspace, { termCode: "27s1", assignmentSlug: "lab01" })
      ).rejects.toThrow();
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

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
    f.writeManifest();
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
