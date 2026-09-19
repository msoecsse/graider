import { loadGraiderConfig } from "../config/config-loader.js";
import { loadAssignmentRosters } from "../roster/roster-loader.js";
import { ROSTER_STATUS_ACTIVE } from "../roster/roster-models.js";
import { resolveGradingWorkspaceContext } from "./grading-workspace-context.js";

export interface AssignmentGradingLifecycleContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
}

export type AssignmentGradingLifecycleContextResult =
  | {
      readonly status: "success";
      readonly totalStudentCount: number;
      readonly gradingDoneCount: number;
      readonly publishedCount: number;
      readonly unknownStatusCount: number;
    }
  | { readonly status: "assignment_config_error" };

const assignmentFile = (termCode: string, assignmentSlug: string): string =>
  `terms/${termCode}/assignments/${assignmentSlug}/assignment.yml`;

const GRADING_DONE_STATUSES: ReadonlySet<string> = new Set(["complete", "published"]);

/**
 * Aggregates grading-lifecycle counts for the assignment detail lifecycle
 * strip. Uses the same assignment-wide, active-only roster that
 * assignment-detail-builder.ts already loads for roster.activeStudentCount —
 * not the faculty-scoped roster the grading workspace uses — so the strip's
 * "N of M" figures agree with the rest of the page.
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

  return {
    status: "success",
    totalStudentCount: workspaceResult.students.length,
    gradingDoneCount: workspaceResult.students.filter((student) =>
      GRADING_DONE_STATUSES.has(student.gradingStatus)
    ).length,
    publishedCount: workspaceResult.students.filter(
      (student) => student.gradingStatus === "published"
    ).length,
    unknownStatusCount: workspaceResult.students.filter(
      (student) => student.gradingStatus === "unknown"
    ).length
  };
};
