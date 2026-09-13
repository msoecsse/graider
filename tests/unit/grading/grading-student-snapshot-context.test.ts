import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTestGitSha } from "../../test-git-sha.js";
import { loadGradingStudentSnapshotContext } from "../../../src/grading/grading-student-snapshot-context.js";
import {
  createGradingStatePath,
  createInitialGradingState,
  saveGradingState
} from "../../../src/grading/grading-state.js";

const SHA = makeTestGitSha("a");
const roots: string[] = [];
const setup = (withRubric = true) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-snapshot-context-"));
  roots.push(root);
  const courseFolderPath = path.join(root, "course");
  fs.cpSync(path.resolve("tests/fixtures/roster/valid-course"), courseFolderPath, {
    recursive: true
  });
  if (withRubric)
    fs.appendFileSync(
      path.join(courseFolderPath, "terms/27s1/assignments/lab04/assignment.yml"),
      "\ngrading:\n  rubric:\n    - id: design\n      name: Design\n      points: 40\n    - id: correctness\n      name: Correctness\n      points: 60\n"
    );
  const request = {
    courseFolderPath,
    termCode: "27s1",
    assignmentSlug: "lab04",
    studentId: "jones",
    currentSubmissionCommitSha: SHA
  };
  const stateRequest = {
    courseRoot: courseFolderPath,
    termCode: "27s1",
    assignmentSlug: "lab04",
    studentId: "jones"
  };
  return { request, stateRequest };
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("grading student snapshot core context", () => {
  it("projects missing state at trusted HEAD without creating a file", () => {
    const { request, stateRequest } = setup();
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    expect(loadGradingStudentSnapshotContext(request)).toEqual({
      status: "success",
      studentId: "jones",
      gradingStatus: "not_started",
      appliedComments: [],
      manualAdjustments: [],
      grade: {
        pointsPossible: 100,
        totalScore: 100,
        categories: [
          {
            id: "design",
            name: "Design",
            pointsPossible: 40,
            score: 40,
            categorizedCommentAdjustmentTotal: 0,
            manualAdjustmentTotal: 0
          },
          {
            id: "correctness",
            name: "Correctness",
            pointsPossible: 60,
            score: 60,
            categorizedCommentAdjustmentTotal: 0,
            manualAdjustmentTotal: 0
          }
        ],
        uncategorizedCommentAdjustmentTotal: 0
      }
    });
    expect(fs.existsSync(statePath.value)).toBe(false);
  });

  it("uses an empty rubric when the assignment has no rubric", () => {
    const { request } = setup(false);
    expect(loadGradingStudentSnapshotContext(request)).toMatchObject({
      status: "success",
      gradingStatus: "not_started",
      grade: { pointsPossible: 0, totalScore: 0, categories: [] }
    });
  });

  it.each(["not_started", "in_progress", "complete", "published"] as const)(
    "returns existing %s state with canonical grade and order without modifying it",
    (gradingStatus) => {
      const { request, stateRequest } = setup();
      const created = createInitialGradingState("jones", SHA);
      if (created.status === "failure") throw new Error(created.message);
      saveGradingState(stateRequest, {
        ...created.value,
        status: gradingStatus,
        appliedComments: [
          {
            id: "anchored",
            sourceCommentId: "library-id",
            text: "Design feedback",
            deduction: -3,
            rubricCategoryId: "design",
            sourceLocation: { file: "src/Main.java", startLine: 2, endLine: 3 }
          },
          { id: "general", text: "General feedback", deduction: -2 }
        ],
        manualAdjustments: [
          { id: "manual", rubricCategoryId: "correctness", amount: -4, note: "Manual" }
        ],
        viewState: { scrollTop: 22, cursor: { file: "src/Main.java", line: 2, column: 1 } }
      });
      const statePath = createGradingStatePath(stateRequest);
      if (statePath.status === "failure") throw new Error(statePath.message);
      const before = fs.readFileSync(statePath.value, "utf8");
      expect(loadGradingStudentSnapshotContext(request)).toMatchObject({
        status: "success",
        studentId: "jones",
        gradingStatus,
        appliedComments: [{ id: "anchored" }, { id: "general" }],
        manualAdjustments: [{ id: "manual", note: "Manual" }],
        grade: {
          pointsPossible: 100,
          totalScore: 91,
          categories: [
            { id: "design", score: 37, categorizedCommentAdjustmentTotal: -3 },
            { id: "correctness", score: 56, manualAdjustmentTotal: -4 }
          ],
          uncategorizedCommentAdjustmentTotal: -2
        }
      });
      expect(loadGradingStudentSnapshotContext(request)).not.toHaveProperty("viewState");
      expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);
    }
  );

  it("returns typed state, submission, and rubric failures without writing", () => {
    const { request, stateRequest } = setup();
    const created = createInitialGradingState("jones", makeTestGitSha("b"));
    if (created.status === "failure") throw new Error(created.message);
    saveGradingState(stateRequest, created.value);
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    const before = fs.readFileSync(statePath.value, "utf8");
    expect(loadGradingStudentSnapshotContext(request)).toEqual({
      status: "submission_changed",
      studentId: "jones"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);

    fs.writeFileSync(statePath.value, "{bad", "utf8");
    expect(loadGradingStudentSnapshotContext(request)).toEqual({
      status: "grading_state_error",
      studentId: "jones",
      code: "invalid_grading_state_json"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe("{bad");

    saveGradingState(stateRequest, {
      ...created.value,
      submissionCommitSha: SHA,
      appliedComments: [
        { id: "unknown", text: "Unknown category", deduction: -1, rubricCategoryId: "removed" }
      ]
    });
    const mismatchBefore = fs.readFileSync(statePath.value, "utf8");
    expect(loadGradingStudentSnapshotContext(request)).toEqual({
      status: "grading_state_error",
      studentId: "jones",
      code: "rubric_category_mismatch"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(mismatchBefore);
  });
});
