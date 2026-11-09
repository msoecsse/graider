// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { managedOperationalFixture, fixtureGit } from "./managedOperationalFixtures";
import { removeGitFixture, GIT_INTEGRATION_TIMEOUT_MS } from "./gitIntegrationFixtures";
import { createCourseMutationIpc } from "./courseMutationIpc";
import { IPC_CHANNELS } from "./ipc";
import { createGradingWorkspaceService } from "./gradingWorkspaceService";
import { createGradingStudentSourceService } from "./gradingStudentSourceService";
import { createGradingStudentSnapshotService } from "./gradingStudentSnapshotService";
import { createGradingStudentViewStateService } from "./gradingStudentViewStateService";
import { createGradingStudentCommentService } from "./gradingStudentCommentService";
import { createGradingStudentManualAdjustmentService } from "./gradingStudentManualAdjustmentService";
import { createGradingStudentCompleteService } from "./gradingStudentCompleteService";
import { managedCourseOperation } from "./managedCourseOperationContext";
import { createFacultyScopeService } from "./facultyScopeService";
import { getLocalSettingsPath, saveCurrentFacultyMsoeUsername } from "./localSettings";
import { measureGradingOperation, type GradingPerformanceSample } from "./gradingPerformance";
import type { RemoteRepositoryReader } from "./githubRemoteRepositories";

const remote = vi.hoisted(() => ({ reader: null as RemoteRepositoryReader | null }));
vi.mock("./githubRemoteRepositories.js", async (original) => ({
  ...(await original<object>()),
  createRemoteRepositoryReader: () => remote.reader
}));
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const fixture = async () => {
  const f = await managedOperationalFixture();
  roots.push(f.root);
  Object.assign(f.course, { localFolderIds: [] });
  remote.reader = f.reader;
  const requests = Object.values(f.reader).map((method) => vi.fn(method));
  Object.keys(f.reader).forEach((key, index) => {
    Object.assign(f.reader, { [key]: requests[index] });
  });
  const assignment = path.join(f.writer, "terms", "27s1", "assignments", "lab01");
  fs.mkdirSync(assignment, { recursive: true });
  fs.writeFileSync(
    path.join(assignment, "assignment.yml"),
    `schema_version: 1
assignment:
  slug: lab01
  title: Lab 1
  type: individual
  status: active
template:
  repository: fixture/template
  branch: main
sections: ["001"]
deadline:
  due_at: "2027-09-01T23:59:00-05:00"
  late_policy: standard
metadata:
  faculty_owner: jones
  lms_assignment_id: null
  grading_category: labs
  points: 100
grading:
  required_files: [Main.java]
  rubric:
    - id: design
      name: Design
      points: 100
`
  );
  fs.appendFileSync(
    path.join(f.writer, "terms", "27s1", "term.yml"),
    "    roster: rosters/001.csv\n"
  );
  const rosters = path.join(f.writer, "terms", "27s1", "rosters");
  fs.mkdirSync(rosters);
  fs.writeFileSync(
    path.join(rosters, "001.csv"),
    "student_id,github_username,section,status\ns1,student,001,active\n"
  );
  await fixtureGit(f.writer, ["add", "."]);
  await fixtureGit(f.writer, ["commit", "-m", "Grading fixture"]);
  await fixtureGit(f.writer, ["push", "origin", "main"]);
  await fixtureGit(f.cache, ["pull", "--ff-only"]);
  saveCurrentFacultyMsoeUsername(getLocalSettingsPath(f.root), "jones");
  // The student repository is deliberately separate from the course cache.
  const student = path.join(f.root, "student");
  await fixtureGit(f.root, ["init", "--initial-branch=main", student]);
  await fixtureGit(student, ["config", "user.name", "Fixture"]);
  await fixtureGit(student, ["config", "user.email", "fixture@example.test"]);
  fs.writeFileSync(path.join(student, "Main.java"), "class Main {}\n");
  await fixtureGit(student, ["add", "."]);
  await fixtureGit(student, ["commit", "-m", "Submission"]);
  const backend = (name: string) => require(path.resolve(`dist-electron/${name}Backend.cjs`));
  const resolveFacultyScope = createFacultyScopeService(backend("facultyScope"));
  const common = {
    resolveFacultyScope,
    resolveRepository: () => ({ status: "success" as const, localPath: student })
  };
  const workspace = createGradingWorkspaceService({
    resolveFacultyScope,
    backend: backend("gradingWorkspace")
  });
  const source = createGradingStudentSourceService({
    ...common,
    loadBackend: () => backend("gradingStudentSource")
  });
  const snapshot = createGradingStudentSnapshotService({
    ...common,
    loadBackend: () => backend("gradingStudentSnapshot")
  });
  const view = createGradingStudentViewStateService({
    ...common,
    loadBackend: () => backend("gradingStudentViewState")
  });
  const comment = createGradingStudentCommentService({
    ...common,
    loadBackend: () => backend("gradingStudentComment")
  });
  const adjustment = createGradingStudentManualAdjustmentService({
    ...common,
    loadBackend: () => backend("gradingStudentManualAdjustment")
  });
  const complete = createGradingStudentCompleteService({
    ...common,
    loadBackend: () => backend("gradingStudentComplete")
  });
  const handlers = new Map<string, Function>();
  const ipc = createCourseMutationIpc(
    {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      }
    },
    () => f.guard
  );
  for (const [channel, operation] of [
    [IPC_CHANNELS.prepareGradingWorkspace, workspace],
    [IPC_CHANNELS.loadGradingStudentSource, source],
    [IPC_CHANNELS.loadGradingStudentSnapshot, snapshot],
    [IPC_CHANNELS.saveGradingStudentViewState, view.save],
    [IPC_CHANNELS.addGradingStudentComment, comment.add],
    [IPC_CHANNELS.editGradingStudentComment, comment.edit],
    [IPC_CHANNELS.deleteGradingStudentComment, comment.delete],
    [IPC_CHANNELS.addGradingStudentManualAdjustment, adjustment.add],
    [IPC_CHANNELS.editGradingStudentManualAdjustment, adjustment.edit],
    [IPC_CHANNELS.deleteGradingStudentManualAdjustment, adjustment.delete],
    [IPC_CHANNELS.markGradingStudentComplete, complete],
    [IPC_CHANNELS.loadGradingStudentViewState, view.load],
    [IPC_CHANNELS.clearGradingStudentViewState, view.clear]
  ] as const)
    ipc.handle(channel, (_event, request) => operation({ ...request, userDataPath: f.root }));
  const sender = Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => false,
    send: vi.fn()
  });
  const selector = f.guard.remoteSelectors()[0];
  const request = {
    courseFolderId: selector.id,
    courseFolderPath: selector.path,
    termCode: "27s1",
    assignmentSlug: "lab01",
    studentId: "s1"
  };
  const samples: GradingPerformanceSample[] = [];
  const call = (channel: string, fields = {}) =>
    measureGradingOperation(
      channel,
      () => handlers.get(channel)!({ sender }, { ...request, ...fields }),
      (sample) => samples.push(sample)
    );
  requests.forEach((method) => method.mockClear());
  return {
    ...f,
    call,
    samples,
    requests,
    student,
    resolveFacultyScope,
    backend,
    request,
    viewState: { scrollTop: 12, cursor: { file: "Main.java", line: 1, column: 1 } }
  };
};

it(
  "measures the real IPC grading sequence using local Git and synthetic student data",
  async () => {
    const f = await fixture();
    await expect(f.call(IPC_CHANNELS.prepareGradingWorkspace)).resolves.toMatchObject({
      status: "success"
    });
    await expect(f.call(IPC_CHANNELS.loadGradingStudentSource)).resolves.toMatchObject({
      status: "success"
    });
    await expect(f.call(IPC_CHANNELS.loadGradingStudentSnapshot)).resolves.toMatchObject({
      status: "success"
    });
    const viewState = { scrollTop: 12, cursor: { file: "Main.java", line: 1, column: 1 } };
    await expect(
      f.call(IPC_CHANNELS.saveGradingStudentViewState, { viewState })
    ).resolves.toMatchObject({ status: "success" });
    await expect(
      f.call(IPC_CHANNELS.addGradingStudentComment, {
        comment: { id: "c1", text: "Feedback", deduction: -3 }
      })
    ).resolves.toMatchObject({ status: "success" });
    await expect(f.call(IPC_CHANNELS.loadGradingStudentSnapshot)).resolves.toMatchObject({
      status: "success",
      appliedComments: [{ id: "c1" }],
      grade: { totalScore: 97 }
    });
    expect(f.requests.every((method) => method.mock.calls.length === 0)).toBe(true);
    for (const sample of f.samples) {
      expect(sample.phases.synchronization?.count ?? 0).toBe(0);
      expect(sample.phases.fetch?.count ?? 0).toBe(0);
      expect(sample.phases.remote_authorization?.count ?? 0).toBe(0);
      expect(sample.phases.backend?.count).toBe(1);
      expect(sample.phases.cache_validation?.count).toBeGreaterThanOrEqual(2);
    }
    if (process.env.GRAIDER_GRADING_BENCHMARK === "1")
      process.stdout.write(
        `${JSON.stringify({ samples: f.samples, remoteReaderCalls: f.requests.reduce((sum, method) => sum + method.mock.calls.length, 0) })}\n`
      );
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it(
  "preserves comments, adjustments, view state and completion across concurrent runtime writes and rejects changed submissions",
  async () => {
    const f = await fixture();
    await f.call(IPC_CHANNELS.prepareGradingWorkspace);
    const writes = await Promise.all([
      f.call(IPC_CHANNELS.saveGradingStudentViewState, { viewState: f.viewState }),
      f.call(IPC_CHANNELS.addGradingStudentComment, {
        comment: { id: "c1", text: "Feedback", deduction: -3 }
      }),
      f.call(IPC_CHANNELS.addGradingStudentManualAdjustment, {
        adjustment: { id: "m1", rubricCategoryId: "design", amount: -2 }
      })
    ]);
    for (const result of writes) expect(result).toMatchObject({ status: "success" });
    await expect(f.call(IPC_CHANNELS.loadGradingStudentSnapshot)).resolves.toMatchObject({
      appliedComments: [{ id: "c1" }],
      manualAdjustments: [{ id: "m1" }],
      grade: { totalScore: 95 }
    });
    await expect(f.call(IPC_CHANNELS.loadGradingStudentViewState)).resolves.toMatchObject({
      viewState: f.viewState
    });
    await expect(f.call(IPC_CHANNELS.markGradingStudentComplete)).resolves.toMatchObject({
      status: "success",
      gradingStatus: "complete"
    });
    const stateFile = path.join(
      path.dirname(f.cache),
      "runtime",
      ".graider",
      "grading",
      "27s1",
      "lab01",
      "state",
      "s1.json"
    );
    const before = fs.readFileSync(stateFile, "utf8");
    fs.appendFileSync(path.join(f.student, "Main.java"), "// new submission\n");
    await fixtureGit(f.student, ["commit", "-am", "Changed submission"]);
    for (const [channel, fields] of [
      [IPC_CHANNELS.saveGradingStudentViewState, { viewState: f.viewState }],
      [
        IPC_CHANNELS.addGradingStudentComment,
        { comment: { id: "c2", text: "Stale", deduction: -5 } }
      ],
      [
        IPC_CHANNELS.editGradingStudentComment,
        { commentId: "c1", replacement: { text: "Stale", deduction: -1 } }
      ],
      [IPC_CHANNELS.deleteGradingStudentComment, { commentId: "c1" }],
      [
        IPC_CHANNELS.addGradingStudentManualAdjustment,
        { adjustment: { id: "m2", rubricCategoryId: "design", amount: -2 } }
      ],
      [
        IPC_CHANNELS.editGradingStudentManualAdjustment,
        { adjustmentId: "m1", replacement: { rubricCategoryId: "design", amount: -1 } }
      ],
      [IPC_CHANNELS.deleteGradingStudentManualAdjustment, { adjustmentId: "m1" }],
      [IPC_CHANNELS.clearGradingStudentViewState, {}],
      [IPC_CHANNELS.markGradingStudentComplete, {}]
    ] as const)
      await expect(f.call(channel, fields)).resolves.toMatchObject({
        status: "submission_changed"
      });
    expect(fs.readFileSync(stateFile, "utf8")).toBe(before);
    expect(await fixtureGit(f.cache, ["status", "--porcelain"])).toBe("");
    expect(f.requests.every((method) => method.mock.calls.length === 0)).toBe(true);
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it(
  "enforces faculty and student scope through the real local IPC handlers",
  async () => {
    const f = await fixture();
    await expect(
      f.call(IPC_CHANNELS.loadGradingStudentSnapshot, { studentId: "other-section" })
    ).resolves.toMatchObject({ status: "student_not_accessible" });
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(f.root), "unassigned");
    await expect(f.call(IPC_CHANNELS.prepareGradingWorkspace)).resolves.toMatchObject({
      status: "no_assigned_sections"
    });
    await expect(
      f.call(IPC_CHANNELS.addGradingStudentComment, {
        comment: { id: "c1", text: "Forbidden", deduction: -1 }
      })
    ).resolves.toMatchObject({ status: "no_assigned_sections" });
    expect(f.requests.every((method) => method.mock.calls.length === 0)).toBe(true);
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it.each(["account", "faculty", "metadata"])(
  "refuses backend writes if %s changes during awaited preparation",
  async (change) => {
    const f = await fixture();
    const write = vi.fn();
    const service = createGradingStudentViewStateService({
      resolveFacultyScope: f.resolveFacultyScope,
      resolveRepository: () => ({ status: "success", localPath: f.student }),
      readHead: async () => {
        if (change === "metadata")
          fs.appendFileSync(path.join(f.cache, "course.yml"), "\n# changed authority\n");
        if (change === "account") f.switchAccount(99);
        if (change === "faculty") Object.assign(f.deps, { username: () => "unassigned" });
        return { status: "success", submissionCommitSha: "a".repeat(40) };
      },
      loadBackend: () => ({ saveGradingStudentViewStateContext: write }) as never
    });
    await expect(
      f.guard.localGrading(
        f.request.courseFolderId,
        f.request.courseFolderPath,
        async (context) =>
          managedCourseOperation.run(context!, () =>
            service.save({
              ...f.request,
              courseFolderPath: f.cache,
              userDataPath: f.root,
              viewState: f.viewState
            })
          ),
        { channel: IPC_CHANNELS.saveGradingStudentViewState, fields: {} }
      )
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  },
  GIT_INTEGRATION_TIMEOUT_MS
);
