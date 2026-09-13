import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTestGitSha } from "../../test-git-sha.js";
import { resolveFacultyScopeContext } from "../../../src/faculty/faculty-scope-context.js";
import { resolveGradingWorkspaceContext } from "../../../src/grading/grading-workspace-context.js";
import {
  createGradingStatePath,
  createInitialGradingState,
  saveGradingState
} from "../../../src/grading/grading-state.js";
import { createFacultyScopeService } from "../../../ui/electron/facultyScopeService.js";
import { createGradingWorkspaceService } from "../../../ui/electron/gradingWorkspaceService.js";
import {
  getLocalSettingsPath,
  saveCurrentFacultyMsoeUsername
} from "../../../ui/electron/localSettings.js";

const roots: string[] = [];
const fixture = path.resolve("tests/fixtures/roster/valid-course");
const createCourse = (): { courseFolderPath: string; userDataPath: string } => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-grading-workspace-"));
  roots.push(root);
  const courseFolderPath = path.join(root, "course");
  const userDataPath = path.join(root, "user-data");
  fs.cpSync(fixture, courseFolderPath, { recursive: true });
  fs.writeFileSync(
    path.join(courseFolderPath, "terms/27s1/term.yml"),
    fs
      .readFileSync(path.join(courseFolderPath, "terms/27s1/term.yml"), "utf8")
      .replace(
        "    roster: rosters/section-001.csv",
        "    roster: rosters/section-001.csv\n    faculty:\n      - jones"
      )
      .replace(
        "    roster: rosters/section-002.csv",
        "    roster: rosters/section-002.csv\n    faculty:\n      - jones\n      - smith"
      ),
    "utf8"
  );
  fs.appendFileSync(
    path.join(courseFolderPath, "terms/27s1/assignments/lab04/assignment.yml"),
    '\ngrading:\n  required_files:\n    - "src/A.java"\n    - "src/B.java"\n  rubric:\n    - id: correctness\n      name: Correctness\n      points: 40\n    - id: design\n      name: Design\n      points: 25\n',
    "utf8"
  );
  return { courseFolderPath, userDataPath };
};
const service = () =>
  createGradingWorkspaceService({
    resolveFacultyScope: createFacultyScopeService({ resolveFacultyScopeContext }),
    backend: { resolveGradingWorkspaceContext }
  });
const requestFor = (paths: { courseFolderPath: string; userDataPath: string }) => ({
  ...paths,
  termCode: "27s1",
  assignmentSlug: "lab04"
});

afterEach(() => {
  roots.splice(0).forEach((root) => {
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("grading workspace preparation", () => {
  it("uses faculty scope and returns assignment configuration and persisted statuses without paths", () => {
    const paths = createCourse();
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(paths.userDataPath), "jones");
    const state = createInitialGradingState("jones", "sha");
    if (state.status === "failure") throw new Error(state.message);
    saveGradingState(
      {
        courseRoot: paths.courseFolderPath,
        termCode: "27s1",
        assignmentSlug: "lab04",
        studentId: "jones"
      },
      { ...state.value, status: "complete" }
    );
    const missingPath = createGradingStatePath({
      courseRoot: paths.courseFolderPath,
      termCode: "27s1",
      assignmentSlug: "lab04",
      studentId: "patel"
    });
    if (missingPath.status === "failure") throw new Error(missingPath.message);

    const result = service()(requestFor(paths));
    expect(result).toMatchObject({
      status: "success",
      assignment: { termCode: "27s1", slug: "lab04", title: "Lab 04" },
      requiredFiles: ["src/A.java", "src/B.java"],
      rubric: [{ id: "correctness" }, { id: "design" }],
      students: [
        {
          studentId: "jones",
          githubUsername: "seanjones",
          section: "001",
          gradingStatus: "complete"
        },
        {
          studentId: "patel",
          githubUsername: "mayapatel",
          section: "002",
          gradingStatus: "not_started"
        }
      ]
    });
    expect(fs.existsSync(missingPath.value)).toBe(false);
    expect(JSON.stringify(result)).not.toContain(paths.courseFolderPath);
  });

  it("preserves fail-closed faculty and roster outcomes", () => {
    const paths = createCourse();
    expect(service()(requestFor(paths))).toMatchObject({ status: "faculty_identity_required" });
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(paths.userDataPath), "nobody");
    expect(service()(requestFor(paths))).toMatchObject({ status: "no_assigned_sections" });
    fs.writeFileSync(
      path.join(paths.courseFolderPath, "terms/27s1/rosters/section-001.csv"),
      "student_id,github_username,section,status\njones,seanjones,002,active\n",
      "utf8"
    );
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(paths.userDataPath), "jones");
    expect(service()(requestFor(paths))).toMatchObject({ status: "roster_error" });
  });

  it("returns empty configuration for a legacy assignment and reports malformed state safely", () => {
    const paths = createCourse();
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(paths.userDataPath), "jones");
    const assignmentPath = path.join(
      paths.courseFolderPath,
      "terms/27s1/assignments/lab04/assignment.yml"
    );
    fs.writeFileSync(
      assignmentPath,
      fs.readFileSync(assignmentPath, "utf8").replace(/\ngrading:[\s\S]*$/u, "\n"),
      "utf8"
    );
    expect(service()(requestFor(paths))).toMatchObject({
      status: "success",
      requiredFiles: [],
      rubric: []
    });
    const statePath = createGradingStatePath({
      courseRoot: paths.courseFolderPath,
      termCode: "27s1",
      assignmentSlug: "lab04",
      studentId: "jones"
    });
    if (statePath.status === "failure") throw new Error(statePath.message);
    fs.mkdirSync(path.dirname(statePath.value), { recursive: true });
    fs.writeFileSync(statePath.value, "{bad", "utf8");
    expect(service()(requestFor(paths))).toMatchObject({
      status: "grading_state_error",
      studentId: "jones",
      code: "invalid_grading_state_json"
    });
  });

  it("fails closed when a grading state file belongs to another student", () => {
    const paths = createCourse();
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(paths.userDataPath), "jones");
    const statePath = createGradingStatePath({
      courseRoot: paths.courseFolderPath,
      termCode: "27s1",
      assignmentSlug: "lab04",
      studentId: "jones"
    });
    if (statePath.status === "failure") throw new Error(statePath.message);
    const other = createInitialGradingState("other", makeTestGitSha("a"));
    if (other.status === "failure") throw new Error(other.message);
    fs.mkdirSync(path.dirname(statePath.value), { recursive: true });
    fs.writeFileSync(statePath.value, `${JSON.stringify(other.value, null, 2)}\n`, "utf8");

    expect(service()(requestFor(paths))).toEqual({
      status: "grading_state_error",
      studentId: "jones",
      code: "grading_state_student_mismatch"
    });
  });
});
