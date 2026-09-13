import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addGradingStudentManualAdjustmentContext,
  deleteGradingStudentManualAdjustmentContext,
  editGradingStudentManualAdjustmentContext
} from "../../../src/grading/manual-adjustment-context.js";
import {
  createGradingStatePath,
  createInitialGradingState,
  loadGradingState,
  saveGradingState
} from "../../../src/grading/grading-state.js";

const GIT_SHA_LENGTH = 40;
const SHA = "a".repeat(GIT_SHA_LENGTH);
const roots: string[] = [];

const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-adjustment-context-"));
  roots.push(root);
  const courseFolderPath = path.join(root, "course");
  fs.cpSync(path.resolve("tests/fixtures/roster/valid-course"), courseFolderPath, {
    recursive: true
  });
  const assignment = path.join(courseFolderPath, "terms/27s1/assignments/lab04/assignment.yml");
  fs.appendFileSync(
    assignment,
    "\ngrading:\n  rubric:\n    - id: design\n      name: Design\n      points: 10\n    - id: correctness\n      name: Correctness\n      points: 20\n"
  );
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

describe("manual rubric adjustment context", () => {
  it("creates canonical state at trusted HEAD and accepts signed amounts and optional notes", () => {
    const { request, stateRequest } = setup();
    expect(
      addGradingStudentManualAdjustmentContext(request, {
        id: "positive",
        rubricCategoryId: "design",
        amount: 2,
        note: "Restored credit"
      })
    ).toEqual({
      status: "success",
      studentId: "jones",
      gradingStatus: "in_progress",
      manualAdjustments: [
        {
          id: "positive",
          rubricCategoryId: "design",
          amount: 2,
          note: "Restored credit"
        }
      ]
    });
    expect(
      addGradingStudentManualAdjustmentContext(request, {
        id: "negative",
        rubricCategoryId: "correctness",
        amount: -1.5
      })
    ).toMatchObject({ status: "success", gradingStatus: "in_progress" });
    expect(loadGradingState(stateRequest)).toEqual({
      status: "success",
      value: {
        schemaVersion: 1,
        studentId: "jones",
        submissionCommitSha: SHA,
        status: "in_progress",
        appliedComments: [],
        manualAdjustments: [
          {
            id: "positive",
            rubricCategoryId: "design",
            amount: 2,
            note: "Restored credit"
          },
          { id: "negative", rubricCategoryId: "correctness", amount: -1.5 }
        ]
      }
    });
    const persisted = JSON.stringify((loadGradingState(stateRequest) as { value: unknown }).value);
    expect(persisted).not.toContain("totalScore");
    expect(persisted).not.toContain("pointsPossible");
    const current = loadGradingState(stateRequest);
    if (current.status !== "success") throw new Error("Expected grading state.");
    saveGradingState(stateRequest, { ...current.value, status: "published" });
    expect(
      addGradingStudentManualAdjustmentContext(request, {
        id: "published-add",
        rubricCategoryId: "design",
        amount: 1
      })
    ).toMatchObject({ status: "success", gradingStatus: "complete" });
    expect(
      addGradingStudentManualAdjustmentContext(request, {
        id: "complete-add",
        rubricCategoryId: "design",
        amount: -1
      })
    ).toMatchObject({ status: "success", gradingStatus: "complete" });
  });

  it("rejects invalid categories and duplicate IDs without changing existing grading data", () => {
    const { request, stateRequest } = setup();
    const created = createInitialGradingState("jones", SHA);
    if (created.status === "failure") throw new Error(created.message);
    expect(
      saveGradingState(stateRequest, {
        ...created.value,
        appliedComments: [{ id: "comment", text: "Keep", deduction: -1 }],
        viewState: {
          scrollTop: 12,
          cursor: { file: "src/Main.java", line: 3, column: 2 }
        },
        manualAdjustments: [{ id: "existing", rubricCategoryId: "design", amount: -1 }]
      }).status
    ).toBe("success");
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    const before = fs.readFileSync(statePath.value, "utf8");
    expect(
      addGradingStudentManualAdjustmentContext(request, {
        id: "unknown",
        rubricCategoryId: "missing",
        amount: -2
      })
    ).toMatchObject({ status: "grading_state_error", code: "rubric_category_mismatch" });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);
    expect(
      addGradingStudentManualAdjustmentContext(request, {
        id: "existing",
        rubricCategoryId: "design",
        amount: -3
      })
    ).toMatchObject({ status: "grading_state_error", code: "duplicate_manual_adjustment_id" });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);
    expect(
      editGradingStudentManualAdjustmentContext(request, "missing", {
        rubricCategoryId: "design",
        amount: -2
      })
    ).toMatchObject({ status: "not_found", code: "manual_adjustment_not_found" });
    expect(deleteGradingStudentManualAdjustmentContext(request, "missing")).toMatchObject({
      status: "not_found",
      code: "manual_adjustment_not_found"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);
    const assignmentPath = path.join(
      request.courseFolderPath,
      "terms/27s1/assignments/lab04/assignment.yml"
    );
    const assignmentContent = fs.readFileSync(assignmentPath, "utf8");
    fs.writeFileSync(assignmentPath, assignmentContent.split("\ngrading:")[0] ?? "", "utf8");
    expect(
      editGradingStudentManualAdjustmentContext(request, "existing", {
        rubricCategoryId: "design",
        amount: -2
      })
    ).toMatchObject({ status: "grading_state_error", code: "rubric_category_mismatch" });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);
  });

  it("edits and deletes exactly one adjustment while preserving unrelated state and canonical status", () => {
    const { request, stateRequest } = setup();
    const created = createInitialGradingState("jones", SHA);
    if (created.status === "failure") throw new Error(created.message);
    saveGradingState(stateRequest, {
      ...created.value,
      status: "published",
      appliedComments: [{ id: "comment", text: "Keep", deduction: -1 }],
      manualAdjustments: [
        { id: "edit", rubricCategoryId: "design", amount: -2, note: "Old" },
        { id: "other", rubricCategoryId: "correctness", amount: 1 }
      ],
      viewState: { scrollTop: 4, cursor: { file: "src/Main.java", line: 1, column: 1 } }
    });
    const otherStateRequest = { ...stateRequest, studentId: "smith" };
    const other = createInitialGradingState("smith", SHA);
    if (other.status === "failure") throw new Error(other.message);
    saveGradingState(otherStateRequest, {
      ...other.value,
      manualAdjustments: [{ id: "other-student", rubricCategoryId: "design", amount: -9 }]
    });
    expect(
      editGradingStudentManualAdjustmentContext(request, "edit", {
        rubricCategoryId: "correctness",
        amount: -4,
        note: "Changed"
      })
    ).toMatchObject({ status: "success", gradingStatus: "complete" });
    expect(
      editGradingStudentManualAdjustmentContext(request, "edit", {
        rubricCategoryId: "correctness",
        amount: 0.5
      })
    ).toMatchObject({ status: "success", gradingStatus: "complete" });
    const edited = loadGradingState(stateRequest);
    if (edited.status !== "success") throw new Error("Expected grading state.");
    expect(edited.value.manualAdjustments).toEqual([
      { id: "edit", rubricCategoryId: "correctness", amount: 0.5 },
      { id: "other", rubricCategoryId: "correctness", amount: 1 }
    ]);
    expect(edited.value.appliedComments).toEqual([{ id: "comment", text: "Keep", deduction: -1 }]);
    expect(edited.value.viewState).toMatchObject({ scrollTop: 4 });
    saveGradingState(stateRequest, { ...edited.value, status: "published" });
    expect(deleteGradingStudentManualAdjustmentContext(request, "edit")).toMatchObject({
      status: "success",
      gradingStatus: "complete",
      manualAdjustments: [{ id: "other" }]
    });
    expect(deleteGradingStudentManualAdjustmentContext(request, "other")).toMatchObject({
      status: "success",
      gradingStatus: "complete",
      manualAdjustments: []
    });
    expect(loadGradingState(otherStateRequest)).toMatchObject({
      status: "success",
      value: {
        studentId: "smith",
        manualAdjustments: [{ id: "other-student", amount: -9 }]
      }
    });
  });

  it("does not create or overwrite state for not-found, changed-submission, or malformed-state failures", () => {
    const { request, stateRequest } = setup();
    expect(
      editGradingStudentManualAdjustmentContext(request, "missing", {
        rubricCategoryId: "design",
        amount: -1
      })
    ).toMatchObject({ status: "not_found", code: "manual_adjustment_not_found" });
    expect(deleteGradingStudentManualAdjustmentContext(request, "missing")).toMatchObject({
      status: "not_found"
    });
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    expect(fs.existsSync(statePath.value)).toBe(false);

    const changed = createInitialGradingState("jones", "b".repeat(GIT_SHA_LENGTH));
    if (changed.status === "failure") throw new Error(changed.message);
    saveGradingState(stateRequest, changed.value);
    const before = fs.readFileSync(statePath.value, "utf8");
    expect(
      addGradingStudentManualAdjustmentContext(request, {
        id: "adjustment",
        rubricCategoryId: "design",
        amount: -1
      })
    ).toMatchObject({ status: "submission_changed" });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);

    fs.writeFileSync(statePath.value, "{malformed", "utf8");
    expect(deleteGradingStudentManualAdjustmentContext(request, "adjustment")).toMatchObject({
      status: "grading_state_error",
      code: "invalid_grading_state_json"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe("{malformed");
  });

  it("rejects mutation when the persisted grading state belongs to another student", () => {
    const { request, stateRequest } = setup();
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    const other = createInitialGradingState("other", SHA);
    if (other.status === "failure") throw new Error(other.message);
    fs.mkdirSync(path.dirname(statePath.value), { recursive: true });
    fs.writeFileSync(statePath.value, `${JSON.stringify(other.value, null, 2)}\n`, "utf8");
    const before = fs.readFileSync(statePath.value, "utf8");

    expect(
      addGradingStudentManualAdjustmentContext(request, {
        id: "adjustment",
        rubricCategoryId: "design",
        amount: -1
      })
    ).toMatchObject({
      status: "grading_state_error",
      code: "grading_state_student_mismatch"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);
  });
});
