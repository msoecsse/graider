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

// Appended to the fixture's own copy of assignment.yml, not the checked-in
// fixture itself, which several other test files also load without a
// rubric. workflow, artifact, and result_file are required whenever
// grading is enabled, regardless of rubric -- config-validation.ts rejects
// enabled grading without them.
const CORRECTNESS_POINTS_POSSIBLE = 60;
const STYLE_POINTS_POSSIBLE = 40;
const RUBRIC_POINTS_POSSIBLE = CORRECTNESS_POINTS_POSSIBLE + STYLE_POINTS_POSSIBLE;
const CORRECTNESS_DEDUCTION = 10;
const SCORE_AFTER_CORRECTNESS_DEDUCTION = RUBRIC_POINTS_POSSIBLE - CORRECTNESS_DEDUCTION;

const RUBRIC_YAML =
  "grading:\n" +
  "  enabled: true\n" +
  "  workflow: .github/workflows/grade.yml\n" +
  "  artifact: grading-results\n" +
  "  result_file: grading-results.json\n" +
  "  rubric:\n" +
  "    - id: correctness\n" +
  "      name: Correctness\n" +
  "      points: " +
  String(CORRECTNESS_POINTS_POSSIBLE) +
  "\n" +
  "    - id: style\n" +
  "      name: Style\n" +
  "      points: " +
  String(STYLE_POINTS_POSSIBLE) +
  "\n";

const addRubricToCourse = (courseFolderPath: string): void => {
  fs.appendFileSync(
    path.join(courseFolderPath, "terms/27s1/assignments/lab04/assignment.yml"),
    RUBRIC_YAML,
    "utf8"
  );
};

const setGradingStatusWithManualAdjustments = (
  courseFolderPath: string,
  studentId: string,
  status: "in_progress" | "complete" | "published",
  manualAdjustments: readonly {
    readonly id: string;
    readonly rubricCategoryId: string;
    readonly amount: number;
  }[]
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
    { ...state.value, status, manualAdjustments: [...manualAdjustments] }
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

    // No rubric is configured on this fixture's assignment, so every
    // student who has a grading-state file at all nets a real,
    // zero-point total (0 of 0) rather than null -- only the missing
    // file (jones) is null. See the dedicated score tests below for
    // rubric-backed, nonzero, and calculateGrade-failure cases.
    expect(service()(requestFor(paths))).toEqual({
      status: "success",
      students: [
        {
          studentId: "jones",
          githubUsername: "seanjones",
          section: "001",
          gradingStatus: "not_started",
          score: null
        },
        {
          studentId: "smith",
          githubUsername: "janesmith",
          section: "001",
          gradingStatus: "in_progress",
          score: 0
        },
        {
          studentId: "lee",
          githubUsername: "alexlee",
          section: "002",
          gradingStatus: "complete",
          score: 0
        }
      ],
      totalStudentCount: 3,
      gradingDoneCount: 1,
      publishedCount: 0,
      unknownStatusCount: 0,
      pointsPossible: 0
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
          gradingStatus: "published",
          score: 0
        },
        {
          studentId: "smith",
          githubUsername: "janesmith",
          section: "001",
          gradingStatus: "not_started",
          score: null
        },
        {
          studentId: "lee",
          githubUsername: "alexlee",
          section: "002",
          gradingStatus: "not_started",
          score: null
        }
      ],
      totalStudentCount: 3,
      gradingDoneCount: 1,
      publishedCount: 1,
      unknownStatusCount: 0,
      pointsPossible: 0
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
          gradingStatus: "not_started",
          score: null
        },
        {
          studentId: "smith",
          githubUsername: "janesmith",
          section: "001",
          gradingStatus: "complete",
          score: 0
        },
        {
          studentId: "lee",
          githubUsername: "alexlee",
          section: "002",
          gradingStatus: "unknown",
          score: null
        }
      ],
      totalStudentCount: 3,
      gradingDoneCount: 1,
      publishedCount: 0,
      unknownStatusCount: 1,
      pointsPossible: 0
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

  it("carries the score for a graded student, computed from the rubric and manual adjustments", () => {
    const paths = createCourse();
    addRubricToCourse(paths.courseFolderPath);
    setGradingStatusWithManualAdjustments(paths.courseFolderPath, "smith", "complete", [
      { id: "adj1", rubricCategoryId: "correctness", amount: -CORRECTNESS_DEDUCTION }
    ]);

    const result = service()(requestFor(paths));
    if (result.status !== "success") throw new Error("expected success");

    const smithRow = result.students.find((student) => student.studentId === "smith");
    expect(smithRow?.score).toBe(SCORE_AFTER_CORRECTNESS_DEDUCTION);
  });

  it("reports null, not a score, for a student with no grading state at all", () => {
    const paths = createCourse();
    addRubricToCourse(paths.courseFolderPath);
    // jones has no grading-state file. See createCourse's roster comment.

    const result = service()(requestFor(paths));
    if (result.status !== "success") throw new Error("expected success");

    const jonesRow = result.students.find((student) => student.studentId === "jones");
    expect(jonesRow?.gradingStatus).toBe("not_started");
    expect(jonesRow?.score).toBeNull();
  });

  it("reports a genuinely zero score as 0, not null", () => {
    const paths = createCourse();
    addRubricToCourse(paths.courseFolderPath);
    setGradingStatusWithManualAdjustments(paths.courseFolderPath, "smith", "complete", [
      { id: "adj1", rubricCategoryId: "correctness", amount: -CORRECTNESS_POINTS_POSSIBLE },
      { id: "adj2", rubricCategoryId: "style", amount: -STYLE_POINTS_POSSIBLE }
    ]);

    const result = service()(requestFor(paths));
    if (result.status !== "success") throw new Error("expected success");

    const smithRow = result.students.find((student) => student.studentId === "smith");
    expect(smithRow?.score).toBe(0);
    expect(smithRow?.score).not.toBeNull();
  });

  it("reports null score when calculateGrade fails, without blanking the row or the rest of the roster", () => {
    const paths = createCourse();
    addRubricToCourse(paths.courseFolderPath);
    // smith's adjustment references a rubric category that does not exist
    // on this assignment's rubric -- calculateGrade fails for smith alone.
    setGradingStatusWithManualAdjustments(paths.courseFolderPath, "smith", "complete", [
      { id: "adj1", rubricCategoryId: "no-such-category", amount: -5 }
    ]);
    setGradingStatus(paths.courseFolderPath, "lee", "published");

    const result = service()(requestFor(paths));
    if (result.status !== "success") throw new Error("expected success");

    const smithRow = result.students.find((student) => student.studentId === "smith");
    const leeRow = result.students.find((student) => student.studentId === "lee");
    // smith's row keeps its real status; only the score is null.
    expect(smithRow?.gradingStatus).toBe("complete");
    expect(smithRow?.score).toBeNull();
    // lee is unaffected by smith's calculateGrade failure: no deductions,
    // so lee's score is the full points possible.
    expect(leeRow?.gradingStatus).toBe("published");
    expect(leeRow?.score).toBe(RUBRIC_POINTS_POSSIBLE);
    // Counts reflect the real statuses -- smith's score failure does not
    // push it into unknownStatusCount or drop it from gradingDoneCount.
    expect(result.gradingDoneCount).toBe(2);
    expect(result.publishedCount).toBe(1);
    expect(result.unknownStatusCount).toBe(0);
  });

  it("reports pointsPossible on the result matching the rubric, once, not per row", () => {
    const paths = createCourse();
    addRubricToCourse(paths.courseFolderPath);

    const result = service()(requestFor(paths));
    if (result.status !== "success") throw new Error("expected success");

    expect(result.pointsPossible).toBe(RUBRIC_POINTS_POSSIBLE);
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
