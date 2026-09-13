import {
  canonicalizeGradingEditorViewState,
  createInitialGradingState,
  loadGradingState,
  saveGradingState,
  type GradingEditorViewState,
  type GradingState,
  type GradingStatePathRequest
} from "./grading-state.js";
import { clearViewState, updateViewState } from "./grading-state-operations.js";

export interface GradingStudentViewStateContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha: string;
}

export interface SaveGradingStudentViewStateContextRequest extends GradingStudentViewStateContextRequest {
  readonly viewState: GradingEditorViewState;
}

export type GradingStudentViewStateContextResult =
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly submissionCommitSha: string;
      readonly gradingStatus: GradingState["status"];
      readonly viewState: GradingEditorViewState | null;
    }
  | { readonly status: "submission_changed"; readonly studentId: string }
  | { readonly status: "grading_state_error"; readonly studentId: string; readonly code: string };

const stateRequest = (request: GradingStudentViewStateContextRequest): GradingStatePathRequest => ({
  courseRoot: request.courseFolderPath,
  termCode: request.termCode,
  assignmentSlug: request.assignmentSlug,
  studentId: request.studentId
});

const stateError = (studentId: string, code: string): GradingStudentViewStateContextResult => ({
  status: "grading_state_error",
  studentId,
  code
});

const success = (studentId: string, state: GradingState): GradingStudentViewStateContextResult => ({
  status: "success",
  studentId,
  submissionCommitSha: state.submissionCommitSha,
  gradingStatus: state.status,
  viewState:
    state.viewState === undefined ? null : canonicalizeGradingEditorViewState(state.viewState)
});

const loadCurrentState = (
  request: GradingStudentViewStateContextRequest
):
  | { readonly status: "missing" }
  | { readonly status: "success"; readonly state: GradingState }
  | { readonly status: "failure"; readonly result: GradingStudentViewStateContextResult } => {
  const loaded = loadGradingState(stateRequest(request));
  if (loaded.status === "missing") return loaded;
  if (loaded.status === "failure")
    return {
      status: "failure",
      result: stateError(request.studentId, loaded.code)
    };
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

const initialState = (
  request: GradingStudentViewStateContextRequest
): GradingState | GradingStudentViewStateContextResult => {
  const created = createInitialGradingState(request.studentId, request.currentSubmissionCommitSha);
  return created.status === "success" ? created.value : stateError(request.studentId, created.code);
};

const isGradingState = (
  value: GradingState | GradingStudentViewStateContextResult
): value is GradingState => "schemaVersion" in value;

export const loadGradingStudentViewStateContext = (
  request: GradingStudentViewStateContextRequest
): GradingStudentViewStateContextResult => {
  const loaded = loadCurrentState(request);
  if (loaded.status === "failure") return loaded.result;
  if (loaded.status === "success") return success(request.studentId, loaded.state);
  const created = initialState(request);
  return isGradingState(created) ? success(request.studentId, created) : created;
};

export const saveGradingStudentViewStateContext = (
  request: SaveGradingStudentViewStateContextRequest
): GradingStudentViewStateContextResult => {
  const loaded = loadCurrentState(request);
  if (loaded.status === "failure") return loaded.result;
  const base = loaded.status === "success" ? loaded.state : initialState(request);
  if (!isGradingState(base)) return base;
  const updated = updateViewState(base, request.viewState);
  if (updated.status === "failure") return stateError(request.studentId, updated.code);
  const saved = saveGradingState(stateRequest(request), updated.value);
  return saved.status === "failure"
    ? stateError(request.studentId, saved.code)
    : success(request.studentId, updated.value);
};

export const clearGradingStudentViewStateContext = (
  request: GradingStudentViewStateContextRequest
): GradingStudentViewStateContextResult => {
  const loaded = loadCurrentState(request);
  if (loaded.status === "failure") return loaded.result;
  if (loaded.status === "missing") {
    const created = initialState(request);
    return isGradingState(created) ? success(request.studentId, created) : created;
  }
  const cleared = clearViewState(loaded.state);
  if (cleared.status === "failure") return stateError(request.studentId, cleared.code);
  const saved = saveGradingState(stateRequest(request), cleared.value);
  return saved.status === "failure"
    ? stateError(request.studentId, saved.code)
    : success(request.studentId, cleared.value);
};
