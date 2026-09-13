import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestGitSha } from "../../test-git-sha.js";
import { resolveFacultyScopeContext } from "../../../src/faculty/faculty-scope-context.js";
import {
  clearGradingStudentViewStateContext,
  loadGradingStudentViewStateContext,
  saveGradingStudentViewStateContext
} from "../../../src/grading/grading-student-view-state-context.js";
import {
  createGradingStatePath,
  createInitialGradingState,
  loadGradingState,
  saveGradingState
} from "../../../src/grading/grading-state.js";
import { createFacultyScopeService } from "../../../ui/electron/facultyScopeService.js";
import { createGradingStudentViewStateService } from "../../../ui/electron/gradingStudentViewStateService.js";
import {
  getLocalRepositoryLocatorPath,
  recordLocalRepository,
  resolveLocalStudentRepository
} from "../../../ui/electron/localRepositoryLocator.js";
import {
  getLocalSettingsPath,
  saveCurrentFacultyMsoeUsername
} from "../../../ui/electron/localSettings.js";

const SHA = makeTestGitSha("a");
const roots: string[] = [];
const fixture = path.resolve("tests/fixtures/roster/valid-course");
const viewState = {
  scrollTop: 25,
  cursor: { file: "src/Main.java", line: 2, column: 5 }
};
const viewStateWithSelection = {
  scrollTop: 25,
  cursor: { file: "src/Main.java", line: 2, column: 5 },
  selection: {
    file: "src/Main.java",
    startLine: 2,
    startColumn: 2,
    endLine: 2,
    endColumn: 5
  }
};
const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-view-service-"));
  roots.push(root);
  const courseFolderPath = path.join(root, "course");
  const userDataPath = path.join(root, "user-data");
  const repository = path.join(root, "repository");
  fs.cpSync(fixture, courseFolderPath, { recursive: true });
  fs.mkdirSync(repository, { recursive: true });
  const term = path.join(courseFolderPath, "terms/27s1/term.yml");
  fs.writeFileSync(
    term,
    fs
      .readFileSync(term, "utf8")
      .replace(
        "    roster: rosters/section-001.csv",
        "    roster: rosters/section-001.csv\n    faculty:\n      - jones"
      ),
    "utf8"
  );
  const request = {
    courseFolderId: "course",
    courseFolderPath,
    termCode: "27s1",
    assignmentSlug: "lab04",
    studentId: "jones",
    userDataPath
  };
  return { courseFolderPath, userDataPath, repository, request };
};
const backend = {
  loadGradingStudentViewStateContext,
  saveGradingStudentViewStateContext,
  clearGradingStudentViewStateContext
};
const service = () =>
  createGradingStudentViewStateService({
    resolveFacultyScope: createFacultyScopeService({ resolveFacultyScopeContext }),
    resolveRepository: (request) =>
      resolveLocalStudentRepository(getLocalRepositoryLocatorPath(request.userDataPath), request),
    readHead: () => Promise.resolve({ status: "success" as const, submissionCommitSha: SHA }),
    loadBackend: () => backend
  });
const authorizeAndLocate = (paths: ReturnType<typeof setup>) => {
  saveCurrentFacultyMsoeUsername(getLocalSettingsPath(paths.userDataPath), "jones");
  recordLocalRepository(getLocalRepositoryLocatorPath(paths.userDataPath), {
    ...paths.request,
    localPath: paths.repository
  });
};
const stateRequest = (paths: ReturnType<typeof setup>) => ({
  courseRoot: paths.courseFolderPath,
  termCode: paths.request.termCode,
  assignmentSlug: paths.request.assignmentSlug,
  studentId: paths.request.studentId
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("grading student view-state production service", () => {
  it("loads missing state without writing, then initializes it from trusted HEAD on save", async () => {
    const paths = setup();
    authorizeAndLocate(paths);
    const statePath = createGradingStatePath(stateRequest(paths));
    if (statePath.status === "failure") throw new Error(statePath.message);

    const loaded = await service().load(paths.request);
    expect(loaded).toMatchObject({
      status: "success",
      studentId: "jones",
      submissionCommitSha: SHA,
      gradingStatus: "not_started",
      viewState: null
    });
    expect(JSON.stringify(loaded)).not.toContain(paths.courseFolderPath);
    expect(JSON.stringify(loaded)).not.toContain(paths.repository);
    expect(fs.existsSync(statePath.value)).toBe(false);
    await expect(service().save({ ...paths.request, viewState })).resolves.toMatchObject({
      status: "success",
      gradingStatus: "not_started",
      viewState
    });
    expect(loadGradingState(stateRequest(paths))).toMatchObject({
      status: "success",
      value: { submissionCommitSha: SHA, status: "not_started", viewState }
    });
  });

  it("loads and clears existing viewState while preserving unrelated published state", async () => {
    const paths = setup();
    authorizeAndLocate(paths);
    const created = createInitialGradingState("jones", SHA);
    if (created.status === "failure") throw new Error(created.message);
    const existing = {
      ...created.value,
      status: "published" as const,
      appliedComments: [{ id: "comment", text: "Keep", deduction: -1 }],
      manualAdjustments: [{ id: "adjustment", rubricCategoryId: "design", amount: 1 }],
      viewState
    };
    saveGradingState(stateRequest(paths), existing);

    await expect(service().load(paths.request)).resolves.toMatchObject({
      status: "success",
      gradingStatus: "published",
      viewState
    });
    await expect(service().clear(paths.request)).resolves.toMatchObject({
      status: "success",
      gradingStatus: "published",
      viewState: null
    });
    expect(loadGradingState(stateRequest(paths))).toEqual({
      status: "success",
      value: {
        ...existing,
        viewState: undefined
      }
    });
  });

  it("preserves a valid same-file selection through the production service", async () => {
    const paths = setup();
    authorizeAndLocate(paths);

    await expect(
      service().save({ ...paths.request, viewState: viewStateWithSelection })
    ).resolves.toMatchObject({
      status: "success",
      viewState: viewStateWithSelection
    });
    await expect(service().load(paths.request)).resolves.toMatchObject({
      status: "success",
      viewState: viewStateWithSelection
    });
  });

  it("fails closed before locator, HEAD, state, or backend access", async () => {
    const paths = setup();
    const resolveRepository = vi.fn();
    const readHead = vi.fn();
    const loadBackend = vi.fn();
    const inaccessible = createGradingStudentViewStateService({
      resolveFacultyScope: () => ({
        status: "success",
        sections: ["001"],
        students: [],
        errors: []
      }),
      resolveRepository,
      readHead,
      loadBackend
    });
    await expect(inaccessible.load(paths.request)).resolves.toEqual({
      status: "student_not_accessible"
    });
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(readHead).not.toHaveBeenCalled();
    expect(loadBackend).not.toHaveBeenCalled();

    const identityRequired = createGradingStudentViewStateService({
      resolveFacultyScope: () => ({
        status: "faculty_identity_required",
        sections: [],
        students: [],
        errors: []
      }),
      resolveRepository,
      readHead,
      loadBackend
    });
    await expect(identityRequired.load(paths.request)).resolves.toEqual({
      status: "faculty_identity_required"
    });
    const noSections = createGradingStudentViewStateService({
      resolveFacultyScope: () => ({
        status: "no_assigned_sections",
        sections: [],
        students: [],
        errors: []
      }),
      resolveRepository,
      readHead,
      loadBackend
    });
    await expect(noSections.load(paths.request)).resolves.toEqual({
      status: "no_assigned_sections"
    });
  });

  it("propagates locator and local HEAD failures without exposing paths", async () => {
    const paths = setup();
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(paths.userDataPath), "jones");
    await expect(service().load(paths.request)).resolves.toEqual({
      status: "repository_not_recorded"
    });
    recordLocalRepository(getLocalRepositoryLocatorPath(paths.userDataPath), {
      ...paths.request,
      localPath: path.join(paths.repository, "gone")
    });
    await expect(service().load(paths.request)).resolves.toEqual({
      status: "repository_unavailable"
    });
    fs.writeFileSync(getLocalRepositoryLocatorPath(paths.userDataPath), "{bad", "utf8");
    await expect(service().load(paths.request)).resolves.toEqual({ status: "registry_error" });

    const headFailure = createGradingStudentViewStateService({
      resolveFacultyScope: () => ({
        status: "success",
        sections: ["001"],
        students: [{ studentId: "jones", githubUsername: "github", section: "001" }],
        errors: []
      }),
      resolveRepository: () => ({ status: "success", localPath: paths.repository }),
      readHead: () => Promise.resolve({ status: "submission_commit_unavailable" as const }),
      loadBackend: () => backend
    });
    const result = await headFailure.load(paths.request);
    expect(result).toEqual({ status: "submission_commit_unavailable" });
    expect(JSON.stringify(result)).not.toContain(paths.repository);
  });

  it("returns submission_changed and grading_state_error without overwriting state", async () => {
    const paths = setup();
    authorizeAndLocate(paths);
    const created = createInitialGradingState("jones", makeTestGitSha("b"));
    if (created.status === "failure") throw new Error(created.message);
    saveGradingState(stateRequest(paths), created.value);
    const statePath = createGradingStatePath(stateRequest(paths));
    if (statePath.status === "failure") throw new Error(statePath.message);
    const before = fs.readFileSync(statePath.value, "utf8");
    await expect(service().save({ ...paths.request, viewState })).resolves.toEqual({
      status: "submission_changed",
      studentId: "jones"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);

    fs.writeFileSync(statePath.value, "{bad", "utf8");
    await expect(service().save({ ...paths.request, viewState })).resolves.toMatchObject({
      status: "grading_state_error",
      code: "invalid_grading_state_json"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe("{bad");
  });
});
