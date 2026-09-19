import { loadGraiderConfig } from "../config/config-loader.js";
import { loadGradingState } from "./grading-state.js";

export interface GradingWorkspaceScopedStudent {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly section: string;
}

export type GradingWorkspaceStudentStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "published";

export interface GradingWorkspaceContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly students: readonly GradingWorkspaceScopedStudent[];
  readonly tolerateStudentStatusErrors?: false | undefined;
}

/**
 * Opts into per-student fault tolerance: a student whose grading-state file
 * cannot be read or parsed is reported with gradingStatus "unknown" instead
 * of aborting the whole call for every other student. The grading workspace
 * (the original caller) never sets this, so its behaviour and its narrower
 * result type are unchanged.
 */
export interface TolerantGradingWorkspaceContextRequest extends Omit<
  GradingWorkspaceContextRequest,
  "tolerateStudentStatusErrors"
> {
  readonly tolerateStudentStatusErrors: true;
}

interface GradingWorkspaceSuccessResult<Status extends string> {
  readonly status: "success";
  readonly assignment: {
    readonly termCode: string;
    readonly slug: string;
    readonly title: string;
  };
  readonly requiredFiles: readonly string[];
  readonly rubric: readonly {
    readonly id: string;
    readonly name: string;
    readonly points: number;
  }[];
  readonly students: readonly (GradingWorkspaceScopedStudent & {
    readonly gradingStatus: Status;
  })[];
}

export type GradingWorkspaceContextResult =
  | GradingWorkspaceSuccessResult<GradingWorkspaceStudentStatus>
  | { readonly status: "assignment_config_error" }
  | { readonly status: "grading_state_error"; readonly studentId: string; readonly code: string };

export type TolerantGradingWorkspaceContextResult =
  | GradingWorkspaceSuccessResult<GradingWorkspaceStudentStatus | "unknown">
  | { readonly status: "assignment_config_error" };

const assignmentFile = (termCode: string, assignmentSlug: string): string =>
  `terms/${termCode}/assignments/${assignmentSlug}/assignment.yml`;

type StudentGradingStatusOutcome =
  | { readonly status: "ok"; readonly gradingStatus: GradingWorkspaceStudentStatus }
  | { readonly status: "error"; readonly code: string };

const resolveStudentGradingStatusOutcome = (
  courseRoot: string,
  termCode: string,
  assignmentSlug: string,
  studentId: string
): StudentGradingStatusOutcome => {
  const state = loadGradingState({ courseRoot, termCode, assignmentSlug, studentId });
  if (state.status === "failure") return { status: "error", code: state.code };
  if (state.status === "success" && state.value.studentId !== studentId)
    return { status: "error", code: "grading_state_student_mismatch" };
  return {
    status: "ok",
    gradingStatus: state.status === "missing" ? "not_started" : state.value.status
  };
};

export function resolveGradingWorkspaceContext(
  request: TolerantGradingWorkspaceContextRequest
): TolerantGradingWorkspaceContextResult;
export function resolveGradingWorkspaceContext(
  request: GradingWorkspaceContextRequest
): GradingWorkspaceContextResult;
export function resolveGradingWorkspaceContext(
  request: GradingWorkspaceContextRequest | TolerantGradingWorkspaceContextRequest
): GradingWorkspaceContextResult | TolerantGradingWorkspaceContextResult {
  const config = loadGraiderConfig({
    cwd: request.courseFolderPath,
    assignmentFile: assignmentFile(request.termCode, request.assignmentSlug)
  });
  if (
    config.status === "failure" ||
    config.config.summary.termCode !== request.termCode ||
    config.config.summary.assignmentSlug !== request.assignmentSlug
  )
    return { status: "assignment_config_error" };

  const students = [] as (GradingWorkspaceScopedStudent & {
    readonly gradingStatus: GradingWorkspaceStudentStatus | "unknown";
  })[];
  for (const student of request.students) {
    const outcome = resolveStudentGradingStatusOutcome(
      config.config.summary.repoRoot,
      request.termCode,
      request.assignmentSlug,
      student.studentId
    );
    if (outcome.status === "error" && !request.tolerateStudentStatusErrors)
      return { status: "grading_state_error", studentId: student.studentId, code: outcome.code };
    students.push({
      ...student,
      gradingStatus: outcome.status === "ok" ? outcome.gradingStatus : "unknown"
    });
  }

  const grading = config.config.assignment.grading;
  return {
    status: "success",
    assignment: {
      termCode: request.termCode,
      slug: request.assignmentSlug,
      title: config.config.assignment.assignment.title
    },
    requiredFiles: grading?.required_files ?? [],
    rubric: grading?.rubric ?? [],
    students
  };
}
