import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestGitSha } from "../../test-git-sha.js";
import { resolveFacultyScopeContext } from "../../../src/faculty/faculty-scope-context.js";
import { loadGradingStudentSourceContext } from "../../../src/grading/grading-student-source-context.js";
import {
  createGradingStatePath,
  createInitialGradingState,
  saveGradingState
} from "../../../src/grading/grading-state.js";
import {
  getLocalRepositoryLocatorPath,
  recordLocalRepository,
  resolveLocalStudentRepository
} from "../../../ui/electron/localRepositoryLocator.js";
import { createGradingStudentSourceService } from "../../../ui/electron/gradingStudentSourceService.js";
import { createFacultyScopeService } from "../../../ui/electron/facultyScopeService.js";
import {
  getLocalSettingsPath,
  saveCurrentFacultyMsoeUsername
} from "../../../ui/electron/localSettings.js";

const roots: string[] = [];
const fixture = path.resolve("tests/fixtures/roster/valid-course");
const SUBMISSION_SHA = makeTestGitSha("a");
const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-source-service-"));
  roots.push(root);
  const course = path.join(root, "course");
  const userData = path.join(root, "user-data");
  const repository = path.join(root, "repository");
  fs.cpSync(fixture, course, { recursive: true });
  fs.mkdirSync(path.join(repository, "src"), { recursive: true });
  const term = path.join(course, "terms/27s1/term.yml");
  fs.writeFileSync(
    term,
    fs
      .readFileSync(term, "utf8")
      .replace(
        "    roster: rosters/section-001.csv",
        "    roster: rosters/section-001.csv\n    faculty:\n      - jones"
      )
  );
  const assignment = path.join(course, "terms/27s1/assignments/lab04/assignment.yml");
  fs.appendFileSync(
    assignment,
    '\ngrading:\n  required_files:\n    - "src/A.java"\n    - "src/Missing.java"\n'
  );
  const request = {
    courseFolderId: "course",
    courseFolderPath: course,
    termCode: "27s1",
    assignmentSlug: "lab04",
    studentId: "jones",
    userDataPath: userData
  };
  return { root, course, userData, repository, request };
};
const createService = () =>
  createGradingStudentSourceService({
    resolveFacultyScope: createFacultyScopeService({ resolveFacultyScopeContext }),
    resolveRepository: (request) =>
      resolveLocalStudentRepository(getLocalRepositoryLocatorPath(request.userDataPath), request),
    readHead: () =>
      Promise.resolve({ status: "success" as const, submissionCommitSha: SUBMISSION_SHA }),
    loadBackend: () => ({ loadGradingStudentSourceContext })
  });
const setRequiredFiles = (course: string, yaml: string): void => {
  const assignment = path.join(course, "terms/27s1/assignments/lab04/assignment.yml");
  fs.writeFileSync(
    assignment,
    fs
      .readFileSync(assignment, "utf8")
      .replace(/\ngrading:[\s\S]*$/u, `\ngrading:\n  required_files: ${yaml}\n`),
    "utf8"
  );
};
afterEach(() => {
  roots.splice(0).forEach((root) => {
    fs.rmSync(root, { recursive: true, force: true });
  });
});
describe("grading student source service", () => {
  it("authorizes faculty, resolves the trusted locator, and returns ordered source sections", async () => {
    const { userData, repository, request } = setup();
    fs.writeFileSync(path.join(repository, "src/A.java"), "one\ntwo");
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(userData), "jones");
    recordLocalRepository(getLocalRepositoryLocatorPath(userData), {
      ...request,
      localPath: repository
    });
    const locatorBefore = fs.readFileSync(getLocalRepositoryLocatorPath(userData), "utf8");
    const sourceBefore = fs.readFileSync(path.join(repository, "src/A.java"), "utf8");
    const result = await createService()(request);
    expect(result).toMatchObject({
      status: "success",
      studentId: "jones",
      combinedText: "one\ntwo",
      sections: [
        { file: "src/A.java", status: "found", combinedStartLine: 1 },
        { file: "src/Missing.java", status: "missing" }
      ]
    });
    expect(JSON.stringify(result)).not.toContain(repository);
    expect(fs.readFileSync(getLocalRepositoryLocatorPath(userData), "utf8")).toBe(locatorBefore);
    expect(fs.readFileSync(path.join(repository, "src/A.java"), "utf8")).toBe(sourceBefore);
    expect(fs.existsSync(path.join(request.courseFolderPath, ".graider"))).toBe(false);
  });
  it("fails closed before locator access for identity, assignment, and inaccessible students", async () => {
    const { request } = setup();
    await expect(createService()(request)).resolves.toMatchObject({
      status: "faculty_identity_required"
    });
    const { userData, request: second } = setup();
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(userData), "nobody");
    await expect(createService()(second)).resolves.toMatchObject({
      status: "no_assigned_sections"
    });
    const { userData: thirdData, request: third } = setup();
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(thirdData), "jones");
    await expect(createService()({ ...third, studentId: "patel" })).resolves.toEqual({
      status: "student_not_accessible"
    });
  });
  it("propagates locator outcomes without source reads", async () => {
    const { userData, repository, request } = setup();
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(userData), "jones");
    await expect(createService()(request)).resolves.toEqual({ status: "repository_not_recorded" });
    recordLocalRepository(getLocalRepositoryLocatorPath(userData), {
      ...request,
      localPath: path.join(repository, "gone")
    });
    await expect(createService()(request)).resolves.toEqual({ status: "repository_unavailable" });
    fs.writeFileSync(getLocalRepositoryLocatorPath(userData), "{bad");
    await expect(createService()(request)).resolves.toEqual({ status: "registry_error" });
  });
  it("authorizes before consulting the locator, Git, or backend", async () => {
    const resolveRepository = vi.fn();
    const readHead = vi.fn();
    const loadBackend = vi.fn();
    const request = setup().request;
    const service = createGradingStudentSourceService({
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
    await expect(service(request)).resolves.toEqual({ status: "student_not_accessible" });
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(readHead).not.toHaveBeenCalled();
    expect(loadBackend).not.toHaveBeenCalled();
  });
  it("returns a safe unavailable result when trusted local HEAD cannot be resolved", async () => {
    const { repository, request } = setup();
    const loadBackend = vi.fn();
    const service = createGradingStudentSourceService({
      resolveFacultyScope: () => ({
        status: "success",
        sections: ["001"],
        students: [{ studentId: "jones", githubUsername: "seanjones", section: "001" }],
        errors: []
      }),
      resolveRepository: () => ({ status: "success", localPath: repository }),
      readHead: () => Promise.resolve({ status: "submission_commit_unavailable" as const }),
      loadBackend
    });

    await expect(service(request)).resolves.toEqual({
      status: "submission_commit_unavailable"
    });
    expect(loadBackend).not.toHaveBeenCalled();
  });
  it("returns a valid empty model when canonical required files are empty", async () => {
    const { course, userData, repository, request } = setup();
    setRequiredFiles(course, "[]");
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(userData), "jones");
    recordLocalRepository(getLocalRepositoryLocatorPath(userData), {
      ...request,
      localPath: repository
    });
    await expect(createService()(request)).resolves.toMatchObject({
      status: "success",
      combinedText: "",
      sections: [],
      syntheticCombinedLines: []
    });
  });
  it("preserves typed unsafe and unreadable source failures", async () => {
    const unsafe = setup();
    setRequiredFiles(unsafe.course, '["../secret"]');
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(unsafe.userData), "jones");
    recordLocalRepository(getLocalRepositoryLocatorPath(unsafe.userData), {
      ...unsafe.request,
      localPath: unsafe.repository
    });
    await expect(createService()(unsafe.request)).resolves.toEqual({
      status: "source_error",
      code: "unsafe_required_file_path"
    });
    const unreadable = setup();
    fs.mkdirSync(path.join(unreadable.repository, "src/A.java"));
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(unreadable.userData), "jones");
    recordLocalRepository(getLocalRepositoryLocatorPath(unreadable.userData), {
      ...unreadable.request,
      localPath: unreadable.repository
    });
    await expect(createService()(unreadable.request)).resolves.toEqual({
      status: "source_error",
      code: "required_file_not_regular"
    });
  });

  it("anchors source to the canonical grading submission and never follows a changed HEAD", async () => {
    const { course, userData, repository, request } = setup();
    fs.writeFileSync(path.join(repository, "src/A.java"), "newer working tree");
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(userData), "jones");
    recordLocalRepository(getLocalRepositoryLocatorPath(userData), {
      ...request,
      localPath: repository
    });
    const stateRequest = {
      courseRoot: course,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId: request.studentId
    };
    const initial = createInitialGradingState(request.studentId, SUBMISSION_SHA);
    if (initial.status === "failure") throw new Error(initial.message);
    expect(saveGradingState(stateRequest, initial.value)).toMatchObject({ status: "success" });
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    const stateBefore = fs.readFileSync(statePath.value, "utf8");
    const sourceBefore = fs.readFileSync(path.join(repository, "src/A.java"), "utf8");

    const result = await createGradingStudentSourceService({
      resolveFacultyScope: createFacultyScopeService({ resolveFacultyScopeContext }),
      resolveRepository: (value) =>
        resolveLocalStudentRepository(getLocalRepositoryLocatorPath(value.userDataPath), value),
      readHead: () =>
        Promise.resolve({
          status: "success",
          submissionCommitSha: makeTestGitSha("b")
        }),
      loadBackend: () => ({ loadGradingStudentSourceContext })
    })(request);

    expect(result).toEqual({ status: "submission_changed", studentId: "jones" });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(stateBefore);
    expect(fs.readFileSync(path.join(repository, "src/A.java"), "utf8")).toBe(sourceBefore);
  });
});
