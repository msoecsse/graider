import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAssignmentGradingLifecycleContext } from "../../../src/grading/assignment-grading-lifecycle-context.js";
import {
  createGradingStatePath,
  createInitialGradingState,
  saveGradingState
} from "../../../src/grading/grading-state.js";
import { createAssignmentGradingLifecycleService } from "../../../ui/electron/assignmentGradingLifecycleService.js";

const roots: string[] = [];
const fixture = path.resolve("tests/fixtures/roster/valid-course");

const TERM_CODE = "27s1";
const ASSIGNMENT_SLUG = "lab04";

const createCourse = (): { courseFolderPath: string } => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-grading-lifecycle-"));
  roots.push(root);
  const courseFolderPath = path.join(root, "course");
  fs.cpSync(fixture, courseFolderPath, { recursive: true });
  // Three active students across two sections, plus one dropped student who
  // must be excluded, so gradingStatus buckets are unambiguous.
  fs.writeFileSync(
    path.join(courseFolderPath, "terms/27s1/rosters/section-001.csv"),
    "student_id,github_username,section,status\n" +
      "jones,seanjones,001,active\n" +
      "smith,janesmith,001,active\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(courseFolderPath, "terms/27s1/rosters/section-002.csv"),
    "student_id,github_username,section,status\n" +
      "lee,alexlee,002,active\n" +
      "patel,mayapatel,002,dropped\n",
    "utf8"
  );
  return { courseFolderPath };
};

const requestFor = (paths: { courseFolderPath: string }) => ({
  ...paths,
  courseFolderId: "course-1",
  termCode: TERM_CODE,
  assignmentSlug: ASSIGNMENT_SLUG
});

const service = () =>
  createAssignmentGradingLifecycleService({
    backend: { resolveAssignmentGradingLifecycleContext }
  });

const setGradingStatus = (
  courseFolderPath: string,
  studentId: string,
  status: "in_progress" | "complete" | "published"
): void => {
  const state = createInitialGradingState(studentId, "sha");
  if (state.status === "failure") throw new Error(state.message);
  saveGradingState(
    {
      courseRoot: courseFolderPath,
      termCode: TERM_CODE,
      assignmentSlug: ASSIGNMENT_SLUG,
      studentId
    },
    { ...state.value, status }
  );
};

afterEach(() => {
  roots.splice(0).forEach((root) => {
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("assignment grading lifecycle aggregation", () => {
  it("derives counts from each gradingStatus value across the assignment-wide roster", () => {
    const paths = createCourse();
    setGradingStatus(paths.courseFolderPath, "smith", "in_progress");
    setGradingStatus(paths.courseFolderPath, "lee", "complete");
    // jones has no grading-state file at all, which resolves to not_started.
    // patel is dropped in the roster and must not be counted at all.

    expect(service()(requestFor(paths))).toEqual({
      status: "success",
      students: [
        {
          studentId: "jones",
          githubUsername: "seanjones",
          section: "001",
          gradingStatus: "not_started"
        },
        {
          studentId: "smith",
          githubUsername: "janesmith",
          section: "001",
          gradingStatus: "in_progress"
        },
        { studentId: "lee", githubUsername: "alexlee", section: "002", gradingStatus: "complete" }
      ],
      totalStudentCount: 3,
      gradingDoneCount: 1,
      publishedCount: 0,
      unknownStatusCount: 0
    });
  });

  it("counts a published student toward both gradingDoneCount and publishedCount", () => {
    const paths = createCourse();
    setGradingStatus(paths.courseFolderPath, "jones", "published");

    expect(service()(requestFor(paths))).toEqual({
      status: "success",
      students: [
        {
          studentId: "jones",
          githubUsername: "seanjones",
          section: "001",
          gradingStatus: "published"
        },
        {
          studentId: "smith",
          githubUsername: "janesmith",
          section: "001",
          gradingStatus: "not_started"
        },
        {
          studentId: "lee",
          githubUsername: "alexlee",
          section: "002",
          gradingStatus: "not_started"
        }
      ],
      totalStudentCount: 3,
      gradingDoneCount: 1,
      publishedCount: 1,
      unknownStatusCount: 0
    });
  });

  it("reports an unreadable grading-state file as unknown instead of failing the whole call", () => {
    const paths = createCourse();
    setGradingStatus(paths.courseFolderPath, "smith", "complete");
    const statePath = createGradingStatePath({
      courseRoot: paths.courseFolderPath,
      termCode: TERM_CODE,
      assignmentSlug: ASSIGNMENT_SLUG,
      studentId: "lee"
    });
    if (statePath.status === "failure") throw new Error(statePath.message);
    fs.mkdirSync(path.dirname(statePath.value), { recursive: true });
    fs.writeFileSync(statePath.value, "{bad", "utf8");

    expect(service()(requestFor(paths))).toEqual({
      status: "success",
      students: [
        {
          studentId: "jones",
          githubUsername: "seanjones",
          section: "001",
          gradingStatus: "not_started"
        },
        {
          studentId: "smith",
          githubUsername: "janesmith",
          section: "001",
          gradingStatus: "complete"
        },
        { studentId: "lee", githubUsername: "alexlee", section: "002", gradingStatus: "unknown" }
      ],
      totalStudentCount: 3,
      gradingDoneCount: 1,
      publishedCount: 0,
      unknownStatusCount: 1
    });
  });

  it("returns a row for every gradingStatus value, including unknown", () => {
    const paths = createCourse();
    setGradingStatus(paths.courseFolderPath, "smith", "in_progress");
    setGradingStatus(paths.courseFolderPath, "lee", "published");
    const statePath = createGradingStatePath({
      courseRoot: paths.courseFolderPath,
      termCode: TERM_CODE,
      assignmentSlug: ASSIGNMENT_SLUG,
      studentId: "jones"
    });
    if (statePath.status === "failure") throw new Error(statePath.message);
    fs.mkdirSync(path.dirname(statePath.value), { recursive: true });
    fs.writeFileSync(statePath.value, "{bad", "utf8");

    const result = service()(requestFor(paths));
    if (result.status !== "success") throw new Error("expected success");

    expect(result.students.map((student) => student.gradingStatus).sort()).toEqual(
      ["in_progress", "published", "unknown"].sort()
    );
  });

  it("derives its counts from the rows it returns, and cannot disagree with them", () => {
    const paths = createCourse();
    setGradingStatus(paths.courseFolderPath, "smith", "complete");
    setGradingStatus(paths.courseFolderPath, "lee", "published");

    const result = service()(requestFor(paths));
    if (result.status !== "success") throw new Error("expected success");

    const expectedGradingDone = result.students.filter(
      (student) => student.gradingStatus === "complete" || student.gradingStatus === "published"
    ).length;
    const expectedPublished = result.students.filter(
      (student) => student.gradingStatus === "published"
    ).length;
    const expectedUnknown = result.students.filter(
      (student) => student.gradingStatus === "unknown"
    ).length;

    expect(result.totalStudentCount).toBe(result.students.length);
    expect(result.gradingDoneCount).toBe(expectedGradingDone);
    expect(result.publishedCount).toBe(expectedPublished);
    expect(result.unknownStatusCount).toBe(expectedUnknown);
  });

  it("uses the assignment-wide roster rather than a faculty-scoped subset", () => {
    // No faculty identity or local settings are configured at all. If this
    // resolved its roster through resolveFacultyScope, as the grading
    // workspace does, it would fail with faculty_identity_required. It must
    // still return every active student across every section.
    const paths = createCourse();

    expect(service()(requestFor(paths))).toMatchObject({
      status: "success",
      totalStudentCount: 3
    });
  });

  it("reports assignment_config_error for a mismatched assignment identity", () => {
    const paths = createCourse();

    expect(service()({ ...requestFor(paths), assignmentSlug: "not-a-real-assignment" })).toEqual({
      status: "assignment_config_error"
    });
  });
});
