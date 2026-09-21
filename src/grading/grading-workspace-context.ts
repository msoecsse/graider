import { loadGraiderConfig } from "../config/config-loader.js";
import { loadGradingState, type GradingState } from "./grading-state.js";
import { calculateGrade, type RubricCategory } from "./grading-state-operations.js";

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

interface GradingWorkspaceSuccessResult<
  Status extends string,
  StudentRow extends GradingWorkspaceScopedStudent & {
    readonly gradingStatus: Status;
  } = GradingWorkspaceScopedStudent & { readonly gradingStatus: Status }
> {
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
  readonly students: readonly StudentRow[];
}

export type GradingWorkspaceContextResult =
  | GradingWorkspaceSuccessResult<GradingWorkspaceStudentStatus>
  | { readonly status: "assignment_config_error" }
  | { readonly status: "grading_state_error"; readonly studentId: string; readonly code: string };

/**
 * The lifecycle context (the only caller that sets
 * tolerateStudentStatusErrors) also needs each student's score, for the
 * student table's Grade column -- see assignment-grading-lifecycle-context.ts.
 * That is expressed only here, not on GradingWorkspaceContextResult: the
 * grading workspace never asked for a score, so its result type -- and its
 * actual returned objects, not just their declared type -- gain nothing.
 */
export type TolerantGradingWorkspaceContextResult =
  | GradingWorkspaceSuccessResult<
      GradingWorkspaceStudentStatus | "unknown",
      GradingWorkspaceScopedStudent & {
        readonly gradingStatus: GradingWorkspaceStudentStatus | "unknown";
        readonly score: number | null;
      }
    >
  | { readonly status: "assignment_config_error" };

const assignmentFile = (termCode: string, assignmentSlug: string): string =>
  `terms/${termCode}/assignments/${assignmentSlug}/assignment.yml`;

type StudentGradingStatusOutcome =
  | {
      readonly status: "ok";
      readonly gradingStatus: GradingWorkspaceStudentStatus;
      readonly score: number | null;
    }
  | { readonly status: "error"; readonly code: string };

// A student whose applied comments or manual adjustments reference a
// rubric category that no longer exists fails calculateGrade. That must not
// blank the row or fail the whole call (the same per-student tolerance
// established for status below) -- it just means no score for that student.
const resolveStudentScore = (
  state: GradingState,
  rubric: readonly RubricCategory[]
): number | null => {
  const calculation = calculateGrade(state, rubric);
  return calculation.status === "success" ? calculation.value.totalScore : null;
};

const resolveStudentGradingStatusOutcome = (
  courseRoot: string,
  termCode: string,
  assignmentSlug: string,
  studentId: string,
  rubric: readonly RubricCategory[]
): StudentGradingStatusOutcome => {
  const state = loadGradingState({ courseRoot, termCode, assignmentSlug, studentId });
  if (state.status === "failure") return { status: "error", code: state.code };
  if (state.status === "success" && state.value.studentId !== studentId)
    return { status: "error", code: "grading_state_student_mismatch" };
  return {
    status: "ok",
    gradingStatus: state.status === "missing" ? "not_started" : state.value.status,
    // No grading state file yet -> not started -> no score, distinct from
    // a real score of zero. Computed here (state and rubric are already in
    // hand) whether or not the caller ends up using it -- cheap, and the
    // tolerant branch below is the only one that keeps it.
    score: state.status === "success" ? resolveStudentScore(state.value, rubric) : null
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

  const grading = config.config.assignment.grading;
  const rubric = grading?.rubric ?? [];
  const assignment = {
    termCode: request.termCode,
    slug: request.assignmentSlug,
    title: config.config.assignment.assignment.title
  };
  const requiredFiles = grading?.required_files ?? [];
  const resolveOutcome = (studentId: string): StudentGradingStatusOutcome =>
    resolveStudentGradingStatusOutcome(
      config.config.summary.repoRoot,
      request.termCode,
      request.assignmentSlug,
      studentId,
      rubric
    );

  if (request.tolerateStudentStatusErrors) {
    const students: (GradingWorkspaceScopedStudent & {
      readonly gradingStatus: GradingWorkspaceStudentStatus | "unknown";
      readonly score: number | null;
    })[] = [];
    for (const student of request.students) {
      const outcome = resolveOutcome(student.studentId);
      students.push({
        ...student,
        gradingStatus: outcome.status === "ok" ? outcome.gradingStatus : "unknown",
        score: outcome.status === "ok" ? outcome.score : null
      });
    }
    return { status: "success", assignment, requiredFiles, rubric, students };
  }

  const students: (GradingWorkspaceScopedStudent & {
    readonly gradingStatus: GradingWorkspaceStudentStatus;
  })[] = [];
  for (const student of request.students) {
    const outcome = resolveOutcome(student.studentId);
    if (outcome.status === "error")
      return { status: "grading_state_error", studentId: student.studentId, code: outcome.code };
    students.push({ ...student, gradingStatus: outcome.gradingStatus });
  }
  return { status: "success", assignment, requiredFiles, rubric, students };
}
