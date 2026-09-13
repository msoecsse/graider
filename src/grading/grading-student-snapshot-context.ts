import { loadGraiderConfig } from "../config/config-loader.js";
import {
  createInitialGradingState,
  loadGradingState,
  type GradingState,
  type GradingStatePathRequest
} from "./grading-state.js";
import {
  projectGradingStudent,
  type GradingStudentProjection
} from "./grading-student-projection.js";

export interface GradingStudentSnapshotContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha: string;
}

export type GradingStudentSnapshotContextResult =
  | ({ readonly status: "success" } & GradingStudentProjection)
  | { readonly status: "submission_changed"; readonly studentId: string }
  | {
      readonly status: "grading_state_error" | "assignment_config_error";
      readonly studentId: string;
      readonly code: string;
    };

const assignmentFile = (termCode: string, assignmentSlug: string): string =>
  `terms/${termCode}/assignments/${assignmentSlug}/assignment.yml`;

const stateRequest = (request: GradingStudentSnapshotContextRequest): GradingStatePathRequest => ({
  courseRoot: request.courseFolderPath,
  termCode: request.termCode,
  assignmentSlug: request.assignmentSlug,
  studentId: request.studentId
});

const stateError = (studentId: string, code: string): GradingStudentSnapshotContextResult => ({
  status: "grading_state_error",
  studentId,
  code
});

export const loadGradingStudentSnapshotContext = (
  request: GradingStudentSnapshotContextRequest
): GradingStudentSnapshotContextResult => {
  const loaded = loadGradingState(stateRequest(request));
  let state: GradingState;
  if (loaded.status === "failure") return stateError(request.studentId, loaded.code);
  if (loaded.status === "success") {
    if (loaded.value.studentId !== request.studentId)
      return stateError(request.studentId, "grading_state_student_mismatch");
    if (loaded.value.submissionCommitSha !== request.currentSubmissionCommitSha)
      return { status: "submission_changed", studentId: request.studentId };
    state = loaded.value;
  } else {
    const initial = createInitialGradingState(
      request.studentId,
      request.currentSubmissionCommitSha
    );
    if (initial.status === "failure") return stateError(request.studentId, initial.code);
    state = initial.value;
  }

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

  const projected = projectGradingStudent(state, config.config.assignment.grading?.rubric ?? []);
  return projected.status === "failure"
    ? stateError(request.studentId, projected.code)
    : { status: "success", ...projected.value };
};
