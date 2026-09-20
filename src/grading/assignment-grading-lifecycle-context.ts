import { loadGraiderConfig } from "../config/config-loader.js";
import { loadAssignmentRosters } from "../roster/roster-loader.js";
import { ROSTER_STATUS_ACTIVE } from "../roster/roster-models.js";
import {
  resolveGradingWorkspaceContext,
  type GradingWorkspaceStudentStatus
} from "./grading-workspace-context.js";

export interface AssignmentGradingLifecycleContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
}

export interface AssignmentGradingLifecycleStudentRow {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly section: string;
  readonly gradingStatus: GradingWorkspaceStudentStatus | "unknown";
  readonly score: number | null;
}

export type AssignmentGradingLifecycleContextResult =
  | {
      readonly status: "success";
      readonly students: readonly AssignmentGradingLifecycleStudentRow[];
      readonly totalStudentCount: number;
      readonly gradingDoneCount: number;
      readonly publishedCount: number;
      readonly unknownStatusCount: number;
      readonly pointsPossible: number;
    }
  | { readonly status: "assignment_config_error" };

const assignmentFile = (termCode: string, assignmentSlug: string): string =>
  `terms/${termCode}/assignments/${assignmentSlug}/assignment.yml`;

const GRADING_DONE_STATUSES: ReadonlySet<string> = new Set(["complete", "published"]);

/**
 * Returns per-student grading status and score rows, plus the
 * lifecycle-strip counts and the assignment's pointsPossible derived from
 * them, for an assignment. Uses the same assignment-wide, active-only
 * roster that assignment-detail-builder.ts already loads for
 * roster.activeStudentCount — not the faculty-scoped roster the grading
 * workspace uses — so the strip's "N of M" figures, and the student table
 * rows PR6b adds, agree with the rest of the page.
 */
export const resolveAssignmentGradingLifecycleContext = (
  request: AssignmentGradingLifecycleContextRequest
): AssignmentGradingLifecycleContextResult => {
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

  const roster = loadAssignmentRosters(config.config);
  const activeStudents = roster.students
    .filter((student) => student.status === ROSTER_STATUS_ACTIVE)
    .map((student) => ({
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section
    }));

  const workspaceResult = resolveGradingWorkspaceContext({
    courseFolderPath: request.courseFolderPath,
    termCode: request.termCode,
    assignmentSlug: request.assignmentSlug,
    students: activeStudents,
    tolerateStudentStatusErrors: true
  });

  if (workspaceResult.status !== "success") return { status: "assignment_config_error" };

  // Counts are derived from `students` below, the exact array being
  // returned, in the same statement — not recomputed separately — so a
  // future change to one cannot silently leave the other stale.
  const students: readonly AssignmentGradingLifecycleStudentRow[] = workspaceResult.students;

  // Same rubric, same total for every student, so it goes on the result
  // once rather than being repeated (and risking disagreement) per row.
  const pointsPossible = workspaceResult.rubric.reduce(
    (total, category) => total + category.points,
    0
  );

  return {
    status: "success",
    students,
    totalStudentCount: students.length,
    gradingDoneCount: students.filter((student) => GRADING_DONE_STATUSES.has(student.gradingStatus))
      .length,
    publishedCount: students.filter((student) => student.gradingStatus === "published").length,
    unknownStatusCount: students.filter((student) => student.gradingStatus === "unknown").length,
    pointsPossible
  };
};
