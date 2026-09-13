import type { RawAssignmentConfig } from "../config/config-models.js";
import {
  validateGradingState,
  type GradingEditorViewState,
  type GradingState,
  type GradingStateResult
} from "./grading-state.js";

export type RubricCategory = NonNullable<
  NonNullable<RawAssignmentConfig["grading"]>["rubric"]
>[number];
type AppliedComment = GradingState["appliedComments"][number];
type ManualAdjustment = GradingState["manualAdjustments"][number];

export interface AppliedCommentUpdate {
  readonly text: string;
  readonly deduction: number;
  readonly rubricCategoryId?: string | undefined;
  readonly sourceLocation?: AppliedComment["sourceLocation"] | undefined;
}

export interface ManualAdjustmentUpdate {
  readonly rubricCategoryId: string;
  readonly amount: number;
  readonly note?: string | undefined;
}

export interface RubricCategoryScore {
  readonly id: string;
  readonly name: string;
  readonly pointsPossible: number;
  readonly score: number;
  readonly categorizedCommentAdjustmentTotal: number;
  readonly manualAdjustmentTotal: number;
}

export interface GradeCalculation {
  readonly pointsPossible: number;
  readonly totalScore: number;
  readonly categories: readonly RubricCategoryScore[];
  readonly uncategorizedCommentAdjustmentTotal: number;
}

export type GradingStateOperationResult<T> =
  | GradingStateResult<T>
  | { readonly status: "not_found"; readonly code: string; readonly message: string };

const mutationStatus = (status: GradingState["status"]): GradingState["status"] => {
  if (status === "not_started") return "in_progress";
  if (status === "published") return "complete";
  return status;
};

const validatedMutation = (state: GradingState): GradingStateResult<GradingState> =>
  validateGradingState({ ...state, status: mutationStatus(state.status) });

const notFound = (
  kind: "applied comment" | "manual adjustment"
): GradingStateOperationResult<never> => ({
  status: "not_found",
  code: `${kind.replace(" ", "_")}_not_found`,
  message: `${String(kind[0]?.toUpperCase())}${kind.slice(1)} was not found.`
});

export const addAppliedComment = (
  state: GradingState,
  comment: AppliedComment
): GradingStateResult<GradingState> => {
  if (state.appliedComments.some(({ id }) => id === comment.id.trim()))
    return {
      status: "failure",
      code: "duplicate_applied_comment_id",
      message: "Applied comment IDs must be unique."
    };
  return validatedMutation({ ...state, appliedComments: [...state.appliedComments, comment] });
};

export const editAppliedComment = (
  state: GradingState,
  id: string,
  update: AppliedCommentUpdate
): GradingStateOperationResult<GradingState> => {
  const commentId = id.trim();
  const existing = state.appliedComments.find((comment) => comment.id === commentId);
  if (existing === undefined) return notFound("applied comment");
  const replacement: AppliedComment = {
    id: existing.id,
    ...(existing.sourceCommentId === undefined
      ? {}
      : { sourceCommentId: existing.sourceCommentId }),
    text: update.text,
    deduction: update.deduction,
    ...(update.rubricCategoryId === undefined ? {} : { rubricCategoryId: update.rubricCategoryId }),
    ...(update.sourceLocation === undefined ? {} : { sourceLocation: update.sourceLocation })
  };
  return validatedMutation({
    ...state,
    appliedComments: state.appliedComments.map((comment) =>
      comment.id === commentId ? replacement : comment
    )
  });
};

export const deleteAppliedComment = (
  state: GradingState,
  id: string
): GradingStateOperationResult<GradingState> => {
  const commentId = id.trim();
  if (!state.appliedComments.some((comment) => comment.id === commentId))
    return notFound("applied comment");
  return validatedMutation({
    ...state,
    appliedComments: state.appliedComments.filter((comment) => comment.id !== commentId)
  });
};

export const addManualAdjustment = (
  state: GradingState,
  adjustment: ManualAdjustment
): GradingStateResult<GradingState> => {
  if (state.manualAdjustments.some(({ id }) => id === adjustment.id.trim()))
    return {
      status: "failure",
      code: "duplicate_manual_adjustment_id",
      message: "Manual adjustment IDs must be unique."
    };
  return validatedMutation({
    ...state,
    manualAdjustments: [...state.manualAdjustments, adjustment]
  });
};

export const editManualAdjustment = (
  state: GradingState,
  id: string,
  update: ManualAdjustmentUpdate
): GradingStateOperationResult<GradingState> => {
  const adjustmentId = id.trim();
  const existing = state.manualAdjustments.find((adjustment) => adjustment.id === adjustmentId);
  if (existing === undefined) return notFound("manual adjustment");
  return validatedMutation({
    ...state,
    manualAdjustments: state.manualAdjustments.map((adjustment) =>
      adjustment.id === adjustmentId ? { ...existing, ...update } : adjustment
    )
  });
};

export const deleteManualAdjustment = (
  state: GradingState,
  id: string
): GradingStateOperationResult<GradingState> => {
  const adjustmentId = id.trim();
  if (!state.manualAdjustments.some((adjustment) => adjustment.id === adjustmentId))
    return notFound("manual adjustment");
  return validatedMutation({
    ...state,
    manualAdjustments: state.manualAdjustments.filter(
      (adjustment) => adjustment.id !== adjustmentId
    )
  });
};

export const markComplete = (state: GradingState): GradingStateResult<GradingState> =>
  validateGradingState({ ...state, status: "complete" });

export const markPublished = (state: GradingState): GradingStateResult<GradingState> =>
  validateGradingState({ ...state, status: "published" });

export const updateViewState = (
  state: GradingState,
  viewState: GradingEditorViewState
): GradingStateResult<GradingState> => validateGradingState({ ...state, viewState });

export const clearViewState = (state: GradingState): GradingStateResult<GradingState> => {
  const stateWithoutView = { ...state };
  delete stateWithoutView.viewState;
  return validateGradingState(stateWithoutView);
};

export const calculateGrade = (
  state: GradingState,
  rubric: readonly RubricCategory[]
): GradingStateResult<GradeCalculation> => {
  const categoryIds = new Set(rubric.map((category) => category.id));
  const unknownComment = state.appliedComments.find(
    (comment) =>
      comment.rubricCategoryId !== undefined && !categoryIds.has(comment.rubricCategoryId)
  );
  const unknownAdjustment = state.manualAdjustments.find(
    (adjustment) => !categoryIds.has(adjustment.rubricCategoryId)
  );
  if (unknownComment !== undefined || unknownAdjustment !== undefined)
    return {
      status: "failure",
      code: "rubric_category_mismatch",
      message: "Grading state references a rubric category that does not exist."
    };

  const categories = rubric.map((category) => {
    const categorizedCommentAdjustmentTotal = state.appliedComments
      .filter((comment) => comment.rubricCategoryId === category.id)
      .reduce((total, comment) => total + comment.deduction, 0);
    const manualAdjustmentTotal = state.manualAdjustments
      .filter((adjustment) => adjustment.rubricCategoryId === category.id)
      .reduce((total, adjustment) => total + adjustment.amount, 0);
    return {
      id: category.id,
      name: category.name,
      pointsPossible: category.points,
      score: category.points + categorizedCommentAdjustmentTotal + manualAdjustmentTotal,
      categorizedCommentAdjustmentTotal,
      manualAdjustmentTotal
    };
  });
  const uncategorizedCommentAdjustmentTotal = state.appliedComments
    .filter((comment) => comment.rubricCategoryId === undefined)
    .reduce((total, comment) => total + comment.deduction, 0);
  return {
    status: "success",
    value: {
      pointsPossible: rubric.reduce((total, category) => total + category.points, 0),
      totalScore:
        categories.reduce((total, category) => total + category.score, 0) +
        uncategorizedCommentAdjustmentTotal,
      categories,
      uncategorizedCommentAdjustmentTotal
    }
  };
};
