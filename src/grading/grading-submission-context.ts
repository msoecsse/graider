import {
  loadGradingState,
  type GradingStatePathRequest,
  type LoadGradingStateResult
} from "./grading-state.js";

export interface GradingSubmissionContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha?: string | undefined;
}

export type GradingSubmissionContextResult =
  | {
      readonly status: "success";
      readonly value: { readonly studentId: string; readonly submissionCommitSha: string };
    }
  | { readonly status: "submission_changed"; readonly studentId: string }
  | {
      readonly status: "grading_state_error";
      readonly studentId: string;
      readonly code: string;
    }
  | { readonly status: "missing_submission_commit" }
  | { readonly status: "submission_commit_unavailable" };

export interface GradingSubmissionContextDependencies {
  readonly loadState: (request: GradingStatePathRequest) => LoadGradingStateResult;
}

const stateRequest = (request: GradingSubmissionContextRequest): GradingStatePathRequest => ({
  courseRoot: request.courseFolderPath,
  termCode: request.termCode,
  assignmentSlug: request.assignmentSlug,
  studentId: request.studentId
});

export const resolveGradingSubmissionContext = (
  request: GradingSubmissionContextRequest,
  overrides: Partial<GradingSubmissionContextDependencies> = {},
  options: { readonly deferMissingSubmissionCommit?: boolean } = {}
): GradingSubmissionContextResult => {
  const loaded = (overrides.loadState ?? loadGradingState)(stateRequest(request));
  if (loaded.status === "failure")
    return { status: "grading_state_error", studentId: request.studentId, code: loaded.code };
  if (loaded.status === "success") {
    if (loaded.value.studentId !== request.studentId)
      return {
        status: "grading_state_error",
        studentId: request.studentId,
        code: "grading_state_student_mismatch"
      };
    if (
      request.currentSubmissionCommitSha !== undefined &&
      loaded.value.submissionCommitSha !== request.currentSubmissionCommitSha
    )
      return { status: "submission_changed", studentId: request.studentId };
    return {
      status: "success",
      value: { studentId: request.studentId, submissionCommitSha: loaded.value.submissionCommitSha }
    };
  }
  return request.currentSubmissionCommitSha === undefined
    ? options.deferMissingSubmissionCommit === true
      ? { status: "missing_submission_commit" }
      : { status: "submission_commit_unavailable" }
    : {
        status: "success",
        value: {
          studentId: request.studentId,
          submissionCommitSha: request.currentSubmissionCommitSha
        }
      };
};

export const gradingStudentCommitHistoryBackend = { resolveGradingSubmissionContext };
