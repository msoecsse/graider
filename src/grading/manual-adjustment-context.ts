import { loadGraiderConfig } from "../config/config-loader.js";
import {
  createInitialGradingState,
  loadGradingState,
  saveGradingState,
  type GradingState,
  type GradingStatePathRequest
} from "./grading-state.js";
import {
  addManualAdjustment,
  deleteManualAdjustment,
  editManualAdjustment,
  type ManualAdjustmentUpdate
} from "./grading-state-operations.js";

export interface ManualAdjustmentInput {
  readonly id: string;
  readonly rubricCategoryId: string;
  readonly amount: number;
  readonly note?: string;
}

export interface ManualAdjustmentContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha: string;
}

export type ManualAdjustmentContextResult =
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly gradingStatus: GradingState["status"];
      readonly manualAdjustments: GradingState["manualAdjustments"];
    }
  | { readonly status: "not_found"; readonly studentId: string; readonly code: string }
  | { readonly status: "submission_changed"; readonly studentId: string }
  | {
      readonly status: "grading_state_error" | "assignment_config_error";
      readonly studentId: string;
      readonly code: string;
    };

const assignmentFile = (termCode: string, assignmentSlug: string): string =>
  `terms/${termCode}/assignments/${assignmentSlug}/assignment.yml`;

const stateRequest = (request: ManualAdjustmentContextRequest): GradingStatePathRequest => ({
  courseRoot: request.courseFolderPath,
  termCode: request.termCode,
  assignmentSlug: request.assignmentSlug,
  studentId: request.studentId
});

const stateError = (studentId: string, code: string): ManualAdjustmentContextResult => ({
  status: "grading_state_error",
  studentId,
  code
});

const success = (studentId: string, state: GradingState): ManualAdjustmentContextResult => ({
  status: "success",
  studentId,
  gradingStatus: state.status,
  manualAdjustments: state.manualAdjustments
});

const validateCategoryAgainstAssignment = (
  request: ManualAdjustmentContextRequest,
  rubricCategoryId: string
): ManualAdjustmentContextResult | undefined => {
  const config = loadGraiderConfig({
    cwd: request.courseFolderPath,
    assignmentFile: assignmentFile(request.termCode, request.assignmentSlug)
  });
  if (
    config.status === "failure" ||
    config.config.summary.termCode !== request.termCode ||
    config.config.summary.assignmentSlug !== request.assignmentSlug
  )
    return {
      status: "assignment_config_error",
      studentId: request.studentId,
      code: "assignment_config_error"
    };

  const categoryIds = new Set(
    (config.config.assignment.grading?.rubric ?? []).map((category) => category.id)
  );
  return categoryIds.has(rubricCategoryId.trim())
    ? undefined
    : {
        status: "grading_state_error",
        studentId: request.studentId,
        code: "rubric_category_mismatch"
      };
};

const loadCurrent = (
  request: ManualAdjustmentContextRequest
):
  | { readonly status: "missing" }
  | { readonly status: "success"; readonly state: GradingState }
  | { readonly status: "failure"; readonly result: ManualAdjustmentContextResult } => {
  const loaded = loadGradingState(stateRequest(request));
  if (loaded.status === "missing") return loaded;
  if (loaded.status === "failure")
    return { status: "failure", result: stateError(request.studentId, loaded.code) };
  if (loaded.value.studentId !== request.studentId)
    return {
      status: "failure",
      result: stateError(request.studentId, "grading_state_student_mismatch")
    };
  if (loaded.value.submissionCommitSha !== request.currentSubmissionCommitSha)
    return {
      status: "failure",
      result: { status: "submission_changed", studentId: request.studentId }
    };
  return { status: "success", state: loaded.value };
};

const save = (
  request: ManualAdjustmentContextRequest,
  state: GradingState
): ManualAdjustmentContextResult => {
  const saved = saveGradingState(stateRequest(request), state);
  return saved.status === "success"
    ? success(request.studentId, state)
    : stateError(request.studentId, saved.code);
};

export const addGradingStudentManualAdjustmentContext = (
  request: ManualAdjustmentContextRequest,
  adjustment: ManualAdjustmentInput
): ManualAdjustmentContextResult => {
  const loaded = loadCurrent(request);
  if (loaded.status === "failure") return loaded.result;
  const invalidCategory = validateCategoryAgainstAssignment(request, adjustment.rubricCategoryId);
  if (invalidCategory !== undefined) return invalidCategory;
  let state: GradingState;
  if (loaded.status === "success") state = loaded.state;
  else {
    const initial = createInitialGradingState(
      request.studentId,
      request.currentSubmissionCommitSha
    );
    if (initial.status === "failure") return stateError(request.studentId, initial.code);
    state = initial.value;
  }
  const updated = addManualAdjustment(state, adjustment);
  return updated.status === "success"
    ? save(request, updated.value)
    : stateError(request.studentId, updated.code);
};

export const editGradingStudentManualAdjustmentContext = (
  request: ManualAdjustmentContextRequest,
  adjustmentId: string,
  replacement: ManualAdjustmentUpdate
): ManualAdjustmentContextResult => {
  const loaded = loadCurrent(request);
  if (loaded.status === "failure") return loaded.result;
  if (loaded.status === "missing")
    return {
      status: "not_found",
      studentId: request.studentId,
      code: "manual_adjustment_not_found"
    };
  const invalidCategory = validateCategoryAgainstAssignment(request, replacement.rubricCategoryId);
  if (invalidCategory !== undefined) return invalidCategory;
  const updated = editManualAdjustment(loaded.state, adjustmentId, {
    rubricCategoryId: replacement.rubricCategoryId,
    amount: replacement.amount,
    note: replacement.note
  });
  if (updated.status === "not_found")
    return { status: "not_found", studentId: request.studentId, code: updated.code };
  return updated.status === "success"
    ? save(request, updated.value)
    : stateError(request.studentId, updated.code);
};

export const deleteGradingStudentManualAdjustmentContext = (
  request: ManualAdjustmentContextRequest,
  adjustmentId: string
): ManualAdjustmentContextResult => {
  const loaded = loadCurrent(request);
  if (loaded.status === "failure") return loaded.result;
  if (loaded.status === "missing")
    return {
      status: "not_found",
      studentId: request.studentId,
      code: "manual_adjustment_not_found"
    };
  const updated = deleteManualAdjustment(loaded.state, adjustmentId);
  if (updated.status === "not_found")
    return { status: "not_found", studentId: request.studentId, code: updated.code };
  return updated.status === "success"
    ? save(request, updated.value)
    : stateError(request.studentId, updated.code);
};
