import { loadGraiderConfig } from "../config/config-loader.js";
import {
  createInitialGradingState,
  loadGradingState,
  saveGradingState,
  type GradingState,
  type GradingStatePathRequest
} from "./grading-state.js";
import {
  addAppliedComment,
  deleteAppliedComment,
  editAppliedComment,
  type AppliedCommentUpdate
} from "./grading-state-operations.js";

export interface AppliedCommentInput {
  readonly id: string;
  readonly sourceCommentId?: string;
  readonly text: string;
  readonly deduction: number;
  readonly rubricCategoryId?: string;
  readonly sourceLocation?: {
    readonly file: string;
    readonly startLine: number;
    readonly endLine: number;
  };
}

export interface AppliedCommentContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha: string;
}

export type AppliedCommentContextResult =
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly gradingStatus: GradingState["status"];
      readonly appliedComments: GradingState["appliedComments"];
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

const stateRequest = (request: AppliedCommentContextRequest): GradingStatePathRequest => ({
  courseRoot: request.courseFolderPath,
  termCode: request.termCode,
  assignmentSlug: request.assignmentSlug,
  studentId: request.studentId
});

const stateError = (studentId: string, code: string): AppliedCommentContextResult => ({
  status: "grading_state_error",
  studentId,
  code
});

const success = (studentId: string, state: GradingState): AppliedCommentContextResult => ({
  status: "success",
  studentId,
  gradingStatus: state.status,
  appliedComments: state.appliedComments
});

const matchesRequiredSourceFile = (requiredFile: string, sourceFile: string): boolean =>
  requiredFile === sourceFile ||
  (!requiredFile.includes("/") &&
    !requiredFile.includes("\\") &&
    sourceFile.startsWith("src/") &&
    !sourceFile.startsWith("src/test/") &&
    sourceFile.split("/").pop() === requiredFile);

const validateCommentAgainstAssignment = (
  request: AppliedCommentContextRequest,
  comment: {
    readonly rubricCategoryId?: string | undefined;
    readonly sourceLocation?: AppliedCommentInput["sourceLocation"] | undefined;
  }
): AppliedCommentContextResult | undefined => {
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

  const grading = config.config.assignment.grading;
  const categoryIds = new Set((grading?.rubric ?? []).map((category) => category.id));
  if (comment.rubricCategoryId !== undefined && !categoryIds.has(comment.rubricCategoryId.trim()))
    return {
      status: "grading_state_error",
      studentId: request.studentId,
      code: "rubric_category_mismatch"
    };
  if (
    comment.sourceLocation !== undefined &&
    !(grading?.required_files ?? []).some((requiredFile) =>
      matchesRequiredSourceFile(requiredFile, comment.sourceLocation?.file.trim() ?? "")
    )
  )
    return {
      status: "grading_state_error",
      studentId: request.studentId,
      code: "source_location_mismatch"
    };
  return undefined;
};

const loadCurrent = (
  request: AppliedCommentContextRequest
):
  | { readonly status: "missing" }
  | { readonly status: "success"; readonly state: GradingState }
  | { readonly status: "failure"; readonly result: AppliedCommentContextResult } => {
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
  request: AppliedCommentContextRequest,
  state: GradingState
): AppliedCommentContextResult => {
  const saved = saveGradingState(stateRequest(request), state);
  return saved.status === "success"
    ? success(request.studentId, state)
    : stateError(request.studentId, saved.code);
};

export const addGradingStudentCommentContext = (
  request: AppliedCommentContextRequest,
  comment: AppliedCommentInput
): AppliedCommentContextResult => {
  const loaded = loadCurrent(request);
  if (loaded.status === "failure") return loaded.result;
  const invalidComment = validateCommentAgainstAssignment(request, comment);
  if (invalidComment !== undefined) return invalidComment;
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
  const updated = addAppliedComment(state, comment);
  return updated.status === "success"
    ? save(request, updated.value)
    : stateError(request.studentId, updated.code);
};

export const editGradingStudentCommentContext = (
  request: AppliedCommentContextRequest,
  commentId: string,
  replacement: AppliedCommentUpdate
): AppliedCommentContextResult => {
  const loaded = loadCurrent(request);
  if (loaded.status === "failure") return loaded.result;
  if (loaded.status === "missing")
    return { status: "not_found", studentId: request.studentId, code: "applied_comment_not_found" };
  const invalidComment = validateCommentAgainstAssignment(request, replacement);
  if (invalidComment !== undefined) return invalidComment;
  const updated = editAppliedComment(loaded.state, commentId, replacement);
  if (updated.status === "not_found")
    return { status: "not_found", studentId: request.studentId, code: updated.code };
  return updated.status === "success"
    ? save(request, updated.value)
    : stateError(request.studentId, updated.code);
};

export const deleteGradingStudentCommentContext = (
  request: AppliedCommentContextRequest,
  commentId: string
): AppliedCommentContextResult => {
  const loaded = loadCurrent(request);
  if (loaded.status === "failure") return loaded.result;
  if (loaded.status === "missing")
    return { status: "not_found", studentId: request.studentId, code: "applied_comment_not_found" };
  const updated = deleteAppliedComment(loaded.state, commentId);
  if (updated.status === "not_found")
    return { status: "not_found", studentId: request.studentId, code: updated.code };
  return updated.status === "success"
    ? save(request, updated.value)
    : stateError(request.studentId, updated.code);
};
