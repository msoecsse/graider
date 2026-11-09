// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { managedOperationalFixture, fixtureGit } from "./managedOperationalFixtures";
import { removeGitFixture, GIT_INTEGRATION_TIMEOUT_MS } from "./gitIntegrationFixtures";
import { createCourseMutationIpc } from "./courseMutationIpc";
import { IPC_CHANNELS } from "./ipc";
import { getAssignmentDetail } from "./assignmentDetailRunner";
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
import {
  measureGradingOperation,
  measureGradingPhase,
  type GradingPerformanceSample
} from "./gradingPerformance";
import { getProductionGitWorkspaceFactory } from "./gitWorkspaceReader";
import { createGradingStudentEvidenceService } from "./gradingStudentEvidenceService";
import { GithubOAuthSession } from "./githubOAuthSession";
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
import { createGradingStudentCommitHistoryService } from "./gradingStudentCommitHistoryService";

const REALISTIC_ROSTER_SIZE = 120;
const REALISTIC_ASSIGNMENT_COUNT = 24;
const NETWORK_DELAY_MS = 80;
const LOCAL_ACTION_BUDGET_MS = 2000;
const REALISTIC_WORKLOAD_TIMEOUT_MS = GIT_INTEGRATION_TIMEOUT_MS * 3;
const fixture = async (mode: "managed" | "legacy" = "managed", realistic = false) => {
  const f = await managedOperationalFixture();
  roots.push(f.root);
  if (mode === "managed") Object.assign(f.course, { localFolderIds: [] });
  remote.reader = f.reader;
  const factory = getProductionGitWorkspaceFactory();
  const openCourseWorkspace = vi.fn(factory.open.bind(factory));
  Object.assign(f.deps, {
    factory: { inspect: factory.inspect.bind(factory), open: openCourseWorkspace }
  });
  const requests = Object.values(f.reader).map((method) =>
    vi.fn((...args: unknown[]) =>
      measureGradingPhase("remote_request", async () => {
        if (realistic) await new Promise((resolve) => setTimeout(resolve, NETWORK_DELAY_MS));
        return Reflect.apply(method, f.reader, args);
      })
    )
  );
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
  if (realistic) {
    fs.appendFileSync(
      path.join(rosters, "001.csv"),
      Array.from(
        { length: REALISTIC_ROSTER_SIZE - 1 },
        (_, index) => `s${index + 2},student${index + 2},001,active\n`
      ).join("")
    );
    for (let index = 1; index < REALISTIC_ASSIGNMENT_COUNT; index++) {
      const extra = path.join(path.dirname(assignment), `lab${index + 1}`);
      fs.cpSync(assignment, extra, { recursive: true });
      for (let file = 0; file < REALISTIC_ASSIGNMENT_COUNT; file++)
        fs.writeFileSync(path.join(extra, `rubric-${file}.md`), "Assignment material\n");
    }
  }
  await fixtureGit(f.writer, ["add", "."]);
  await fixtureGit(f.writer, ["commit", "-m", "Grading fixture"]);
  await fixtureGit(f.writer, ["push", "origin", "main"]);
  await fixtureGit(f.cache, ["pull", "--ff-only"]);
  await fixtureGit(f.legacy, ["pull", "--ff-only"]);
  saveCurrentFacultyMsoeUsername(getLocalSettingsPath(f.root), "jones");
  // The student repository is deliberately separate from the course cache.
  const student = path.join(f.root, "student");
  await fixtureGit(f.root, ["init", "--initial-branch=main", student]);
  await fixtureGit(student, ["config", "user.name", "Fixture"]);
  await fixtureGit(student, ["config", "user.email", "fixture@example.test"]);
  fs.writeFileSync(path.join(student, "Main.java"), "class Main {}\n");
  await fixtureGit(student, ["add", "."]);
  await fixtureGit(student, ["commit", "-m", "Submission"]);
  if (realistic) {
    for (let index = 2; index <= REALISTIC_ROSTER_SIZE; index++)
      fs.cpSync(student, path.join(f.root, `student-${index}`), { recursive: true });
  }
  const backend = (name: string) => require(path.resolve(`dist-electron/${name}Backend.cjs`));
  const resolveFacultyScope = createFacultyScopeService(backend("facultyScope"));
  const common = {
    resolveFacultyScope,
    resolveRepository: ({ studentId }: { studentId: string }) => ({
      status: "success" as const,
      localPath: studentId === "s1" ? student : path.join(f.root, `student-${studentId.slice(1)}`)
    })
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
  let evidenceOperation: () => Promise<unknown> = async () => ({
    status: "not_applicable",
    studentId: "s1"
  });
  const history = createGradingStudentCommitHistoryService({ ...common });
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
    [IPC_CHANNELS.loadGradingStudentCommitHistory, history],
    [IPC_CHANNELS.loadGradingStudentEvidence, () => evidenceOperation()],
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
  const selector = mode === "managed" ? f.guard.remoteSelectors()[0] : f.deps.folders()[0];
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
    sender,
    ipc,
    handlers,
    setEvidenceOperation: (operation: typeof evidenceOperation) => {
      evidenceOperation = operation;
    },
    call,
    samples,
    requests,
    openCourseWorkspace,
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

it.each(["managed", "legacy"] as const)(
  "%s preserves comments, adjustments, view state and completion across concurrent runtime writes and rejects changed submissions",
  async (mode) => {
    const f = await fixture(mode);
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
      ...(mode === "managed" ? [path.dirname(f.cache), "runtime"] : [f.legacy]),
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

it.each(
  (["managed", "legacy"] as const).flatMap((mode) =>
    ["account", "signout", "faculty", "metadata"].map((change) => ({ mode, change }))
  )
)(
  "$mode refuses backend writes if $change changes during awaited preparation",
  async ({ mode, change }) => {
    const f = await fixture(mode);
    const write = vi.fn();
    const service = createGradingStudentViewStateService({
      resolveFacultyScope: f.resolveFacultyScope,
      resolveRepository: () => ({ status: "success", localPath: f.student }),
      readHead: async () => {
        if (change === "metadata")
          fs.appendFileSync(path.join(f.cache, "course.yml"), "\n# changed authority\n");
        if (change === "account") f.switchAccount(99);
        if (change === "signout") f.switchAccount(null);
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

const WORKLOAD_STUDENTS = 3;
it.each(["managed", "legacy"] as const)(
  "profiles %s grading with 120 student repositories, 24 assignments and delayed remote calls",
  async (mode) => {
    const f = await fixture(mode, true);
    expect(
      await f.handlers.get(IPC_CHANNELS.getCourseOperationalMode)!(
        { sender: f.sender },
        f.request.courseFolderId
      )
    ).toBe(mode);
    await expect(f.call(IPC_CHANNELS.prepareGradingWorkspace)).resolves.toMatchObject({
      status: "success"
    });
    for (let index = 1; index <= WORKLOAD_STUDENTS; index++) {
      const fields = { studentId: `s${index}` };
      await Promise.all([
        f.call(IPC_CHANNELS.loadGradingStudentSource, fields),
        f.call(IPC_CHANNELS.loadGradingStudentSnapshot, fields),
        f.call(IPC_CHANNELS.loadGradingStudentViewState, fields),
        f.call(IPC_CHANNELS.loadGradingStudentCommitHistory, fields)
      ]);
      await f.call(IPC_CHANNELS.addGradingStudentComment, {
        ...fields,
        comment: { id: "c1", text: "Feedback", deduction: -3 }
      });
      await f.call(IPC_CHANNELS.saveGradingStudentViewState, { ...fields, viewState: f.viewState });
      await expect(f.call(IPC_CHANNELS.markGradingStudentComplete, fields)).resolves.toMatchObject({
        status: "success",
        gradingStatus: "complete"
      });
      await expect(f.call(IPC_CHANNELS.loadGradingStudentSnapshot, fields)).resolves.toMatchObject({
        grade: { totalScore: 97 }
      });
    }
    if (process.env.GRAIDER_GRADING_BENCHMARK === "1")
      process.stdout.write(
        `${JSON.stringify({ mode, rosterSize: REALISTIC_ROSTER_SIZE, samples: f.samples, remoteReaderCalls: f.requests.reduce((sum, method) => sum + method.mock.calls.length, 0) })}\n`
      );
    expect(f.requests.every((method) => method.mock.calls.length === 0)).toBe(true);
    expect(f.openCourseWorkspace).toHaveBeenCalledTimes(
      f.samples.reduce((count, sample) => count + (sample.phases.cache_validation?.count ?? 0), 0) *
        (mode === "legacy" ? 2 : 1)
    );
    for (const sample of f.samples) {
      expect(sample.durationMs, `${mode}:${sample.channel}`).toBeLessThan(LOCAL_ACTION_BUDGET_MS);
      expect(sample.source).toBe(mode);
      expect(sample.operation).toMatch(/^local_/u);
      const mutates = [
        IPC_CHANNELS.addGradingStudentComment,
        IPC_CHANNELS.saveGradingStudentViewState,
        IPC_CHANNELS.markGradingStudentComplete
      ].includes(sample.channel as never);
      const validationCount = mutates ? 3 : 2;
      expect(sample.phases.cache_validation?.count).toBe(validationCount);
      expect(sample.phases.local_git_validation?.count).toBe(
        validationCount * (mode === "legacy" ? 2 : 1)
      );
      expect(sample.phases.committed_metadata?.count).toBe(2);
      expect(sample.phases.remote_request?.count ?? 0).toBe(0);
    }
  },
  REALISTIC_WORKLOAD_TIMEOUT_MS
);

it.each(["managed", "legacy"] as const)(
  "%s evidence cannot block primary reads or local writes",
  async (mode) => {
    const f = await fixture(mode);
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const provideClient = vi.fn(() => ({}) as import("./githubClientProvider").GitHubClient);
    const evidenceService = createGradingStudentEvidenceService({
      resolveFacultyScope: f.resolveFacultyScope,
      resolveRepository: () => ({ status: "success", localPath: f.student }),
      provideClient,
      loadBackend: () => ({
        prepareGradingStudentEvidenceContext: () => ({
          status: "success",
          value: {
            studentId: "s1",
            submissionCommitSha: "a".repeat(40),
            repository: { owner: "fixture", repo: "student" },
            grading: { enabled: true, mode: "preset", preset: "java-junit-checkstyle" }
          }
        }),
        retrievePreparedGradingStudentEvidence: async () => {
          entered();
          await held;
          return { status: "not_applicable" };
        }
      })
    });
    f.ipc.handle(IPC_CHANNELS.loadGradingStudentEvidence, (_event, request) =>
      evidenceService({ ...request, userDataPath: f.root })
    );
    const evidence = f.call(IPC_CHANNELS.loadGradingStudentEvidence);
    await started;
    try {
      await expect(f.call(IPC_CHANNELS.prepareGradingWorkspace)).resolves.toMatchObject({
        status: "success"
      });
      await expect(f.call(IPC_CHANNELS.loadGradingStudentSource)).resolves.toMatchObject({
        status: "success"
      });
      await expect(
        f.call(IPC_CHANNELS.addGradingStudentComment, {
          comment: { id: "c1", text: "Feedback", deduction: -3 }
        })
      ).resolves.toMatchObject({ status: "success" });
      await expect(
        f.call(IPC_CHANNELS.saveGradingStudentViewState, { viewState: f.viewState })
      ).resolves.toMatchObject({ status: "success" });
      await expect(f.call(IPC_CHANNELS.markGradingStudentComplete)).resolves.toMatchObject({
        status: "success"
      });
      await expect(f.call(IPC_CHANNELS.loadGradingStudentSnapshot)).resolves.toMatchObject({
        grade: { totalScore: 97 }
      });
      expect(f.requests.every((method) => method.mock.calls.length === 0)).toBe(true);
      expect(provideClient).toHaveBeenCalledExactlyOnceWith("oauth-fixture-secret");
    } finally {
      release();
      await evidence;
    }
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it(
  "joins restoration and discovery for concurrent registered legacy startup IPC instead of producing the exact false sign-in warning",
  async () => {
    const f = await fixture("legacy");
    let restore!: () => void;
    let discover!: () => void;
    const loadingCredential = new Promise<void>((resolve) => {
      restore = resolve;
    });
    const discovering = new Promise<void>((resolve) => {
      discover = resolve;
    });
    const discoverCourses = vi.fn(async () => {
      await discovering;
      return {
        status: "ready" as const,
        userId: 42,
        discoveredAt: null,
        courses: [f.course],
        diagnostics: []
      };
    });
    const session = new GithubOAuthSession({
      store: {
        load: async () => {
          await loadingCredential;
          return "fixture-token";
        },
        save: async () => {},
        delete: async () => {}
      },
      network: {
        verifyAccount: async () => ({
          identity: { id: 42, login: "faculty", name: null },
          scopes: ["repo", "read:org"],
          repositoryCapability: true,
          organizationCapability: true
        }),
        discoverOrganizations: async () => ({
          status: "ready",
          organizations: [],
          message: null,
          stale: false
        }),
        exchange: async () => "fixture-token"
      },
      discoverCourses,
      secret: () => "fixture-secret",
      openBrowser: async () => {}
    });
    Object.assign(f.deps, { session });
    f.ipc.handle(IPC_CHANNELS.refreshDashboard, () =>
      f.guard.read("registered", f.legacy, async () => ({ status: "success" }))
    );
    const restoring = session.restore();
    const operations = [
      f.call(IPC_CHANNELS.refreshDashboard),
      f.call(IPC_CHANNELS.loadGradingStudentSnapshot),
      f.call(IPC_CHANNELS.prepareGradingWorkspace)
    ];
    restore();
    await restoring;
    await vi.waitFor(() => expect(discoverCourses).toHaveBeenCalledOnce());
    expect(session.getState().status).toBe("signed_in");
    expect(f.samples).toHaveLength(0);
    discover();
    for (const result of await Promise.all(operations))
      expect(result).toMatchObject({ status: "success" });
    expect(f.sender.send.mock.calls.flat()).not.toContainEqual(
      expect.objectContaining({
        message: "Sign in and refresh authoritative course access before opening this repository."
      })
    );
    session.shutdown();
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it.each(["managed", "legacy"] as const)(
  "%s rejects a submission changed during course revalidation before writing",
  async (mode) => {
    const f = await fixture(mode);
    const write = vi.fn();
    let reads = 0;
    const service = createGradingStudentViewStateService({
      resolveFacultyScope: f.resolveFacultyScope,
      resolveRepository: () => ({ status: "success", localPath: f.student }),
      readHead: async () => ({
        status: "success",
        submissionCommitSha: ++reads === 1 ? "a".repeat(40) : "b".repeat(40)
      }),
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
              courseFolderPath: context!.courseFolderPath,
              userDataPath: f.root,
              viewState: f.viewState
            })
          ),
        { channel: IPC_CHANNELS.saveGradingStudentViewState, fields: {} }
      )
    ).resolves.toMatchObject({ status: "submission_changed" });
    expect(write).not.toHaveBeenCalled();
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it.each(["origin", "revision", "metadata", "registration"])(
  "rejects changed legacy %s without migration or remote grading work",
  async (change) => {
    const f = await fixture("legacy");
    const courseBytes = fs.readFileSync(path.join(f.legacy, "course.yml"), "utf8");
    if (change === "origin")
      await fixtureGit(f.legacy, [
        "remote",
        "set-url",
        "origin",
        "https://github.com/other/course.git"
      ]);
    if (change === "revision") {
      fs.writeFileSync(path.join(f.legacy, "note.txt"), "Changed");
      await fixtureGit(f.legacy, ["add", "."]);
      await fixtureGit(f.legacy, [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "-m",
        "Changed source"
      ]);
    }
    if (change === "metadata") {
      await fixtureGit(f.legacy, ["update-index", "--assume-unchanged", "course.yml"]);
      fs.appendFileSync(path.join(f.legacy, "course.yml"), "\n# Hidden edit\n");
    }
    if (change === "registration") Object.assign(f.course, { localFolderIds: [] });
    await expect(f.call(IPC_CHANNELS.markGradingStudentComplete)).rejects.toThrow();
    expect(f.guard.isManaged("registered")).toBe(false);
    if (change !== "metadata")
      expect(fs.readFileSync(path.join(f.legacy, "course.yml"), "utf8")).toBe(courseBytes);
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it.each(["managed", "legacy"] as const)(
  "%s report preview and publication still require remote source authorization",
  async (mode) => {
    const f = await fixture(mode);
    await f.call(IPC_CHANNELS.prepareGradingWorkspace);
    const preview = vi.fn();
    const publish = vi.fn();
    f.ipc.handle(IPC_CHANNELS.previewGradingStudentReport, preview);
    f.ipc.handle(IPC_CHANNELS.publishGradingStudentReport, publish);
    Object.assign(f.reader, { resolveId: vi.fn(async () => null) });
    await expect(f.call(IPC_CHANNELS.previewGradingStudentReport)).rejects.toThrow();
    await expect(f.call(IPC_CHANNELS.publishGradingStudentReport)).rejects.toThrow();
    expect(preview).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  },
  GIT_INTEGRATION_TIMEOUT_MS
);

it(
  "keeps verified Schema 1 local grading and comment saves independent of skipped remote readiness",
  async () => {
    const f = await fixture("legacy");
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({
        schemaVersion: 1,
        commandName: "assignment detail",
        status: "partial_success",
        exitCode: 0,
        sections: [],
        diagnostics: [
          { code: "github_token_required", severity: "error", message: "GitHub token required" }
        ]
      }),
      stderr: "",
      exitCode: 0,
      error: null
    }));
    f.ipc.handle(IPC_CHANNELS.getAssignmentDetail, (_event, request) =>
      getAssignmentDetail(request, { runner, env: {} })
    );
    await expect(
      f.call(IPC_CHANNELS.getAssignmentDetail, {
        assignmentFile: "terms/27s1/assignments/lab01/assignment.yml"
      })
    ).resolves.toMatchObject({
      detail: { diagnostics: [{ code: "remote_readiness_not_checked", severity: "info" }] }
    });
    expect(runner).toHaveBeenCalledOnce();
    await expect(f.call(IPC_CHANNELS.prepareGradingWorkspace)).resolves.toMatchObject({
      status: "success"
    });
    await expect(
      f.call(IPC_CHANNELS.addGradingStudentComment, {
        comment: { id: "hotfix", text: "Feedback", deduction: -3 }
      })
    ).resolves.toMatchObject({ status: "success" });
    expect(f.requests.every((method) => method.mock.calls.length === 0)).toBe(true);
    f.switchAccount(null);
    await expect(f.call(IPC_CHANNELS.prepareGradingWorkspace)).rejects.toThrow();
    await expect(
      f.call(IPC_CHANNELS.addGradingStudentComment, {
        comment: { id: "denied", text: "Denied", deduction: -3 }
      })
    ).rejects.toThrow();
  },
  GIT_INTEGRATION_TIMEOUT_MS
);
