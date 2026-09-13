import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTestGitSha } from "../../test-git-sha.js";
import {
  clearGradingStudentViewStateContext,
  loadGradingStudentViewStateContext,
  saveGradingStudentViewStateContext
} from "../../../src/grading/grading-student-view-state-context.js";
import {
  createGradingStatePath,
  createInitialGradingState,
  loadGradingState,
  saveGradingState,
  type GradingState
} from "../../../src/grading/grading-state.js";

const roots: string[] = [];
const viewState = {
  scrollTop: 90,
  cursor: { file: "src/Main.java", line: 4, column: 3 },
  selection: {
    file: "src/Main.java",
    startLine: 4,
    startColumn: 3,
    endLine: 5,
    endColumn: 2
  }
};
const cursorOnlyViewState = {
  scrollTop: 12,
  cursor: { file: "src/Main.java", line: 2, column: 1 }
};
const setup = () => {
  const courseFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), "graider-view-context-"));
  roots.push(courseFolderPath);
  return {
    courseFolderPath,
    termCode: "27s1",
    assignmentSlug: "lab1",
    studentId: "student",
    currentSubmissionCommitSha: makeTestGitSha("a")
  };
};
const stateFor = (status: GradingState["status"] = "not_started") => {
  const state = createInitialGradingState("student", makeTestGitSha("a"));
  if (state.status === "failure") throw new Error(state.message);
  return { ...state.value, status };
};
const stateRequest = (request: ReturnType<typeof setup>) => ({
  courseRoot: request.courseFolderPath,
  termCode: request.termCode,
  assignmentSlug: request.assignmentSlug,
  studentId: request.studentId
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("grading student view-state context", () => {
  it("loads missing state without writing and returns no viewState", () => {
    const request = setup();
    const pathResult = createGradingStatePath(stateRequest(request));
    if (pathResult.status === "failure") throw new Error(pathResult.message);

    expect(loadGradingStudentViewStateContext(request)).toEqual({
      status: "success",
      studentId: "student",
      submissionCommitSha: makeTestGitSha("a"),
      gradingStatus: "not_started",
      viewState: null
    });
    expect(fs.existsSync(pathResult.value)).toBe(false);
  });

  it("loads existing state with or without viewState", () => {
    const request = setup();
    expect(saveGradingState(stateRequest(request), stateFor("complete"))).toMatchObject({
      status: "success"
    });
    expect(loadGradingStudentViewStateContext(request)).toMatchObject({
      status: "success",
      gradingStatus: "complete",
      viewState: null
    });
    expect(saveGradingStudentViewStateContext({ ...request, viewState })).toMatchObject({
      status: "success"
    });
    expect(loadGradingStudentViewStateContext(request)).toMatchObject({
      status: "success",
      gradingStatus: "complete",
      viewState
    });
  });

  it("reports malformed state and submission mismatch without overwriting", () => {
    const malformed = setup();
    const malformedPath = createGradingStatePath(stateRequest(malformed));
    if (malformedPath.status === "failure") throw new Error(malformedPath.message);
    fs.mkdirSync(path.dirname(malformedPath.value), { recursive: true });
    fs.writeFileSync(malformedPath.value, "{bad", "utf8");
    const beforeMalformed = fs.readFileSync(malformedPath.value, "utf8");
    expect(loadGradingStudentViewStateContext(malformed)).toMatchObject({
      status: "grading_state_error",
      code: "invalid_grading_state_json"
    });
    expect(saveGradingStudentViewStateContext({ ...malformed, viewState })).toMatchObject({
      status: "grading_state_error",
      code: "invalid_grading_state_json"
    });
    expect(fs.readFileSync(malformedPath.value, "utf8")).toBe(beforeMalformed);

    const changed = setup();
    saveGradingState(stateRequest(changed), stateFor());
    const changedPath = createGradingStatePath(stateRequest(changed));
    if (changedPath.status === "failure") throw new Error(changedPath.message);
    const beforeChanged = fs.readFileSync(changedPath.value, "utf8");
    expect(
      loadGradingStudentViewStateContext({
        ...changed,
        currentSubmissionCommitSha: makeTestGitSha("b")
      })
    ).toEqual({ status: "submission_changed", studentId: "student" });
    expect(
      saveGradingStudentViewStateContext({
        ...changed,
        currentSubmissionCommitSha: makeTestGitSha("b"),
        viewState
      })
    ).toEqual({ status: "submission_changed", studentId: "student" });
    expect(
      clearGradingStudentViewStateContext({
        ...changed,
        currentSubmissionCommitSha: makeTestGitSha("b")
      })
    ).toEqual({ status: "submission_changed", studentId: "student" });
    expect(fs.readFileSync(changedPath.value, "utf8")).toBe(beforeChanged);
  });

  it("rejects a grading state whose canonical student identity does not match its file", () => {
    const request = setup();
    const statePath = createGradingStatePath(stateRequest(request));
    if (statePath.status === "failure") throw new Error(statePath.message);
    const mismatched = createInitialGradingState("other", request.currentSubmissionCommitSha);
    if (mismatched.status === "failure") throw new Error(mismatched.message);
    fs.mkdirSync(path.dirname(statePath.value), { recursive: true });
    fs.writeFileSync(statePath.value, `${JSON.stringify(mismatched.value, null, 2)}\n`, "utf8");
    const before = fs.readFileSync(statePath.value, "utf8");

    expect(loadGradingStudentViewStateContext(request)).toMatchObject({
      status: "grading_state_error",
      studentId: "student",
      code: "grading_state_student_mismatch"
    });
    expect(saveGradingStudentViewStateContext({ ...request, viewState })).toMatchObject({
      status: "grading_state_error",
      code: "grading_state_student_mismatch"
    });
    expect(clearGradingStudentViewStateContext(request)).toMatchObject({
      status: "grading_state_error",
      code: "grading_state_student_mismatch"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);
  });

  it("initializes missing state at current HEAD as not_started and round-trips viewState", () => {
    const request = setup();
    expect(saveGradingStudentViewStateContext({ ...request, viewState })).toMatchObject({
      status: "success",
      gradingStatus: "not_started",
      submissionCommitSha: makeTestGitSha("a"),
      viewState
    });
    expect(loadGradingState(stateRequest(request))).toMatchObject({
      status: "success",
      value: {
        studentId: "student",
        submissionCommitSha: makeTestGitSha("a"),
        status: "not_started",
        viewState
      }
    });
  });

  it("round-trips a cursor-only viewState without materializing selection", () => {
    const request = setup();
    expect(
      saveGradingStudentViewStateContext({ ...request, viewState: cursorOnlyViewState })
    ).toMatchObject({ status: "success", viewState: cursorOnlyViewState });
    const loaded = loadGradingStudentViewStateContext(request);
    expect(loaded).toMatchObject({ status: "success", viewState: cursorOnlyViewState });
    if (loaded.status !== "success" || loaded.viewState === null)
      throw new Error("Expected cursor-only view state");
    expect(loaded.viewState).not.toHaveProperty("selection");
  });

  it("preserves all unrelated state and every status when saving", () => {
    for (const status of ["not_started", "in_progress", "complete", "published"] as const) {
      const request = setup();
      const existing: GradingState = {
        ...stateFor(status),
        appliedComments: [{ id: "comment", text: "Keep", deduction: -1 }],
        manualAdjustments: [{ id: "adjustment", rubricCategoryId: "design", amount: 2 }]
      };
      saveGradingState(stateRequest(request), existing);
      expect(saveGradingStudentViewStateContext({ ...request, viewState })).toMatchObject({
        status: "success",
        gradingStatus: status
      });
      expect(loadGradingState(stateRequest(request))).toEqual({
        status: "success",
        value: { ...existing, viewState }
      });
    }
  });

  it("clears only viewState and treats missing state as a write-free no-op", () => {
    const missing = setup();
    const missingPath = createGradingStatePath(stateRequest(missing));
    if (missingPath.status === "failure") throw new Error(missingPath.message);
    expect(clearGradingStudentViewStateContext(missing)).toMatchObject({
      status: "success",
      viewState: null
    });
    expect(fs.existsSync(missingPath.value)).toBe(false);

    const existing = setup();
    saveGradingStudentViewStateContext({ ...existing, viewState });
    expect(clearGradingStudentViewStateContext(existing)).toMatchObject({
      status: "success",
      gradingStatus: "not_started",
      viewState: null
    });
    const loaded = loadGradingState(stateRequest(existing));
    expect(loaded).toMatchObject({ status: "success", value: { status: "not_started" } });
    if (loaded.status !== "success") throw new Error("Expected grading state");
    expect(loaded.value).not.toHaveProperty("viewState");
  });

  it("keeps student state files independent", () => {
    const first = setup();
    const second = { ...first, studentId: "other" };
    saveGradingStudentViewStateContext({ ...first, viewState });
    saveGradingStudentViewStateContext({
      ...second,
      viewState: { ...viewState, scrollTop: 400 }
    });
    expect(loadGradingState(stateRequest(first))).toMatchObject({
      status: "success",
      value: { viewState: { scrollTop: 90 } }
    });
    expect(loadGradingState(stateRequest(second))).toMatchObject({
      status: "success",
      value: { viewState: { scrollTop: 400 } }
    });
  });
});
