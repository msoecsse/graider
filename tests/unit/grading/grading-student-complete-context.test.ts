import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTestGitSha } from "../../test-git-sha.js";
import { markGradingStudentCompleteContext } from "../../../src/grading/grading-student-complete-context.js";
import {
  createGradingStatePath,
  createInitialGradingState,
  loadGradingState,
  saveGradingState
} from "../../../src/grading/grading-state.js";

const SHA = makeTestGitSha("a");
const roots: string[] = [];

const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-complete-context-"));
  roots.push(root);
  const courseFolderPath = path.join(root, "course");
  fs.cpSync(path.resolve("tests/fixtures/roster/valid-course"), courseFolderPath, {
    recursive: true
  });
  const request = {
    courseFolderPath,
    termCode: "27s1",
    assignmentSlug: "lab04",
    studentId: "jones",
    currentSubmissionCommitSha: SHA
  };
  return {
    request,
    stateRequest: {
      courseRoot: courseFolderPath,
      termCode: "27s1",
      assignmentSlug: "lab04",
      studentId: "jones"
    }
  };
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("mark grading student complete context", () => {
  it("atomically creates a canonical complete state at the trusted HEAD without a score", () => {
    const { request, stateRequest } = setup();
    expect(markGradingStudentCompleteContext(request)).toEqual({
      status: "success",
      studentId: "jones",
      gradingStatus: "complete"
    });
    expect(loadGradingState(stateRequest)).toEqual({
      status: "success",
      value: {
        schemaVersion: 1,
        studentId: "jones",
        submissionCommitSha: SHA,
        status: "complete",
        appliedComments: [],
        manualAdjustments: []
      }
    });
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    const persisted = fs.readFileSync(statePath.value, "utf8");
    expect(persisted).not.toContain("totalScore");
    expect(persisted).not.toContain("pointsPossible");
  });

  it.each(["not_started", "in_progress", "complete"] as const)(
    "transitions %s to complete while preserving canonical state",
    (status) => {
      const { request, stateRequest } = setup();
      const initial = createInitialGradingState("jones", SHA);
      if (initial.status === "failure") throw new Error(initial.message);
      expect(
        saveGradingState(stateRequest, {
          ...initial.value,
          status,
          appliedComments: [{ id: "comment", text: "Keep", deduction: -2 }],
          manualAdjustments: [{ id: "adjustment", rubricCategoryId: "quality", amount: 1.5 }],
          viewState: { scrollTop: 4, cursor: { file: "src/Main.java", line: 1, column: 1 } }
        }).status
      ).toBe("success");
      expect(markGradingStudentCompleteContext(request)).toEqual({
        status: "success",
        studentId: "jones",
        gradingStatus: "complete"
      });
      const loaded = loadGradingState(stateRequest);
      if (loaded.status !== "success") throw new Error("Expected saved grading state.");
      expect(loaded.value).toMatchObject({
        submissionCommitSha: SHA,
        status: "complete",
        appliedComments: [{ id: "comment", text: "Keep", deduction: -2 }],
        manualAdjustments: [{ id: "adjustment", rubricCategoryId: "quality", amount: 1.5 }],
        viewState: { scrollTop: 4, cursor: { file: "src/Main.java", line: 1, column: 1 } }
      });
    }
  );

  it("preserves published state as a no-op and never downgrades publication", () => {
    const { request, stateRequest } = setup();
    const initial = createInitialGradingState("jones", SHA);
    if (initial.status === "failure") throw new Error(initial.message);
    saveGradingState(stateRequest, { ...initial.value, status: "published" });
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    const before = fs.readFileSync(statePath.value, "utf8");
    expect(markGradingStudentCompleteContext(request)).toEqual({
      status: "success",
      studentId: "jones",
      gradingStatus: "published"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);
  });

  it("does not overwrite mismatched or malformed state", () => {
    const { request, stateRequest } = setup();
    const initial = createInitialGradingState("jones", makeTestGitSha("b"));
    if (initial.status === "failure") throw new Error(initial.message);
    saveGradingState(stateRequest, initial.value);
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    const mismatchBefore = fs.readFileSync(statePath.value, "utf8");
    expect(markGradingStudentCompleteContext(request)).toEqual({
      status: "submission_changed",
      studentId: "jones"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(mismatchBefore);
    fs.writeFileSync(statePath.value, "{not json", "utf8");
    expect(markGradingStudentCompleteContext(request)).toMatchObject({
      status: "grading_state_error",
      studentId: "jones",
      code: "invalid_grading_state_json"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe("{not json");
  });

  it("rejects a grading state stored under the wrong canonical student identity", () => {
    const { request, stateRequest } = setup();
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    const other = createInitialGradingState("other", SHA);
    if (other.status === "failure") throw new Error(other.message);
    fs.mkdirSync(path.dirname(statePath.value), { recursive: true });
    fs.writeFileSync(statePath.value, `${JSON.stringify(other.value, null, 2)}\n`, "utf8");
    const before = fs.readFileSync(statePath.value, "utf8");

    expect(markGradingStudentCompleteContext(request)).toEqual({
      status: "grading_state_error",
      studentId: "jones",
      code: "grading_state_student_mismatch"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);
  });
});
