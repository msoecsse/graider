import {
  createInitialGradingState,
  loadGradingState,
  saveGradingState,
  type GradingState,
  type GradingStatePathRequest
} from "./grading-state.js";
import { markComplete } from "./grading-state-operations.js";

export interface GradingStudentCompleteContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha: string;
}

export type GradingStudentCompleteContextResult =
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly gradingStatus: GradingState["status"];
    }
  | { readonly status: "submission_changed"; readonly studentId: string }
  | { readonly status: "grading_state_error"; readonly studentId: string; readonly code: string };

const stateRequest = (request: GradingStudentCompleteContextRequest): GradingStatePathRequest => ({
  courseRoot: request.courseFolderPath,
  termCode: request.termCode,
  assignmentSlug: request.assignmentSlug,
  studentId: request.studentId
});

const stateError = (studentId: string, code: string): GradingStudentCompleteContextResult => ({
  status: "grading_state_error",
  studentId,
  code
});

const success = (studentId: string, state: GradingState): GradingStudentCompleteContextResult => ({
  status: "success",
  studentId,
  gradingStatus: state.status
});

export const markGradingStudentCompleteContext = (
  request: GradingStudentCompleteContextRequest
): GradingStudentCompleteContextResult => {
  const loaded = loadGradingState(stateRequest(request));
  if (loaded.status === "failure") return stateError(request.studentId, loaded.code);
  if (loaded.status === "success" && loaded.value.studentId !== request.studentId)
    return stateError(request.studentId, "grading_state_student_mismatch");
  if (
    loaded.status === "success" &&
    loaded.value.submissionCommitSha !== request.currentSubmissionCommitSha
  )
    return { status: "submission_changed", studentId: request.studentId };

  let current: GradingState;
  if (loaded.status === "success") current = loaded.value;
  else {
    const initial = createInitialGradingState(
      request.studentId,
      request.currentSubmissionCommitSha
    );
    if (initial.status === "failure") return stateError(request.studentId, initial.code);
    current = initial.value;
  }

  // Publishing is a stronger lifecycle state. Explicitly completing an already published record
  // is a no-op; feedback mutations continue to use their canonical published -> complete behavior.
  if (current.status === "published") return success(request.studentId, current);

  const completed = markComplete(current);
  if (completed.status === "failure") return stateError(request.studentId, completed.code);
  const saved = saveGradingState(stateRequest(request), completed.value);
  return saved.status === "success"
    ? success(request.studentId, completed.value)
    : stateError(request.studentId, saved.code);
};
