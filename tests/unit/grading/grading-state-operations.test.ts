import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInitialGradingState,
  loadGradingState,
  saveGradingState,
  type GradingState
} from "../../../src/grading/grading-state.js";
import {
  addAppliedComment,
  addManualAdjustment,
  calculateGrade,
  deleteAppliedComment,
  deleteManualAdjustment,
  editAppliedComment,
  editManualAdjustment,
  markComplete,
  markPublished
} from "../../../src/grading/grading-state-operations.js";

const rubric = [
  { id: "correctness", name: "Correctness", points: 40 },
  { id: "design", name: "Design", points: 25 }
];
const initial = (): GradingState => {
  const result = createInitialGradingState("student", "sha");
  if (result.status === "failure") throw new Error(result.message);
  return result.value;
};
const value = <T>(result: { status: "success"; value: T } | { status: string }): T => {
  if (!("value" in result)) throw new Error("Expected success");
  return result.value;
};

describe("grading state operations", () => {
  it("derives ordered category and total scores without mutating state or rubric", () => {
    const state: GradingState = {
      ...initial(),
      appliedComments: [
        { id: "correctness-1", text: "a", deduction: -3, rubricCategoryId: "correctness" },
        { id: "correctness-2", text: "b", deduction: 2, rubricCategoryId: "correctness" },
        { id: "general", text: "c", deduction: -1 }
      ],
      manualAdjustments: [{ id: "design-adjustment", rubricCategoryId: "design", amount: -4 }]
    };
    const beforeState = structuredClone(state);
    const beforeRubric = structuredClone(rubric);
    expect(calculateGrade(state, rubric)).toEqual({
      status: "success",
      value: {
        pointsPossible: 65,
        totalScore: 59,
        uncategorizedCommentAdjustmentTotal: -1,
        categories: [
          {
            id: "correctness",
            name: "Correctness",
            pointsPossible: 40,
            score: 39,
            categorizedCommentAdjustmentTotal: -1,
            manualAdjustmentTotal: 0
          },
          {
            id: "design",
            name: "Design",
            pointsPossible: 25,
            score: 21,
            categorizedCommentAdjustmentTotal: 0,
            manualAdjustmentTotal: -4
          }
        ]
      }
    });
    expect(state).toEqual(beforeState);
    expect(rubric).toEqual(beforeRubric);
  });

  it("keeps full points for an empty state and does not clamp or round signed adjustments", () => {
    expect(calculateGrade(initial(), rubric)).toMatchObject({
      status: "success",
      value: { pointsPossible: 65, totalScore: 65 }
    });
    const state: GradingState = {
      ...initial(),
      appliedComments: [
        { id: "bonus", text: "bonus", deduction: 100.125, rubricCategoryId: "design" }
      ],
      manualAdjustments: [{ id: "zero", rubricCategoryId: "design", amount: 0 }]
    };
    expect(calculateGrade(state, rubric)).toMatchObject({
      status: "success",
      value: {
        totalScore: 165.125,
        categories: [
          { id: "correctness", score: 40 },
          { id: "design", score: 125.125 }
        ]
      }
    });
  });

  it("returns a typed mismatch for unknown comment or manual-adjustment rubric categories", () => {
    expect(
      calculateGrade(
        {
          ...initial(),
          appliedComments: [{ id: "bad", text: "x", deduction: -1, rubricCategoryId: "gone" }]
        },
        rubric
      )
    ).toMatchObject({ status: "failure", code: "rubric_category_mismatch" });
    expect(
      calculateGrade(
        { ...initial(), manualAdjustments: [{ id: "bad", rubricCategoryId: "gone", amount: -1 }] },
        rubric
      )
    ).toMatchObject({ status: "failure", code: "rubric_category_mismatch" });
  });

  it("adds, edits, removes categories from, and deletes applied comments with status transitions", () => {
    const added = value(
      addAppliedComment(initial(), {
        id: "comment",
        text: "Original",
        deduction: -2,
        rubricCategoryId: "design",
        sourceLocation: { file: "src/A.java", startLine: 2, endLine: 3 }
      })
    );
    expect(added.status).toBe("in_progress");
    const edited = value(
      editAppliedComment(added, "comment", {
        text: "Changed",
        deduction: -1,
        rubricCategoryId: undefined,
        sourceLocation: undefined
      })
    );
    expect(edited.appliedComments).toEqual([{ id: "comment", text: "Changed", deduction: -1 }]);
    expect(value(deleteAppliedComment(edited, "comment")).appliedComments).toEqual([]);
    expect(
      addAppliedComment(added, { id: "comment", text: "Duplicate", deduction: 0 })
    ).toMatchObject({
      status: "failure",
      code: "duplicate_applied_comment_id"
    });
    expect(editAppliedComment(added, "missing", { text: "x", deduction: 0 })).toMatchObject({
      status: "not_found"
    });
    expect(deleteAppliedComment(added, "missing")).toMatchObject({ status: "not_found" });
    expect(
      addAppliedComment(initial(), {
        id: "invalid",
        text: "x",
        deduction: Number.NaN,
        sourceLocation: { file: "A", startLine: 3, endLine: 2 }
      })
    ).toMatchObject({ status: "failure" });
  });

  it("adds, edits, and deletes manual adjustments with required transitions and validation", () => {
    const added = value(
      addManualAdjustment(initial(), { id: "adjust", rubricCategoryId: "design", amount: -2 })
    );
    expect(added.status).toBe("in_progress");
    const edited = value(
      editManualAdjustment(added, "adjust", {
        rubricCategoryId: "correctness",
        amount: 1.5,
        note: "Bonus"
      })
    );
    expect(edited.manualAdjustments).toEqual([
      { id: "adjust", rubricCategoryId: "correctness", amount: 1.5, note: "Bonus" }
    ]);
    expect(value(deleteManualAdjustment(edited, "adjust")).manualAdjustments).toEqual([]);
    expect(
      addManualAdjustment(added, { id: "adjust", rubricCategoryId: "design", amount: 0 })
    ).toMatchObject({
      status: "failure",
      code: "duplicate_manual_adjustment_id"
    });
    expect(
      editManualAdjustment(added, "missing", { rubricCategoryId: "design", amount: 0 })
    ).toMatchObject({ status: "not_found" });
    expect(deleteManualAdjustment(added, "missing")).toMatchObject({ status: "not_found" });
    expect(
      addManualAdjustment(initial(), {
        id: "invalid",
        rubricCategoryId: "design",
        amount: Number.POSITIVE_INFINITY
      })
    ).toMatchObject({ status: "failure" });
  });

  it("preserves complete, returns published mutations to complete, and explicitly marks statuses", () => {
    expect(
      value(
        addAppliedComment(
          { ...initial(), status: "complete" },
          { id: "x", text: "x", deduction: 0 }
        )
      ).status
    ).toBe("complete");
    expect(
      value(
        addManualAdjustment(
          { ...initial(), status: "published" },
          { id: "x", rubricCategoryId: "design", amount: 0 }
        )
      ).status
    ).toBe("complete");
    expect(value(markComplete(initial())).status).toBe("complete");
    expect(value(markPublished(initial())).status).toBe("published");
  });

  it("persists only canonical state after operations, never derived scores", () => {
    const courseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider-grading-operations-"));
    try {
      const request = { courseRoot, termCode: "27s1", assignmentSlug: "lab", studentId: "student" };
      const state = value(
        addAppliedComment(initial(), { id: "comment", text: "x", deduction: -2 })
      );
      expect(saveGradingState(request, state)).toMatchObject({ status: "success" });
      const loaded = loadGradingState(request);
      expect(loaded).toMatchObject({
        status: "success",
        value: { appliedComments: [{ id: "comment" }] }
      });
      if (loaded.status !== "success") throw new Error("Expected state");
      expect(loaded.value).not.toHaveProperty("totalScore");
      expect(loaded.value).not.toHaveProperty("pointsPossible");
      expect(loaded.value).not.toHaveProperty("categories");
    } finally {
      fs.rmSync(courseRoot, { recursive: true, force: true });
    }
  });
});
