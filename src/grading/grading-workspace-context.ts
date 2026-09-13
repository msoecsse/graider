import { loadGraiderConfig } from "../config/config-loader.js";
import { loadGradingState } from "./grading-state.js";

export interface GradingWorkspaceScopedStudent {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly section: string;
}

export interface GradingWorkspaceContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly students: readonly GradingWorkspaceScopedStudent[];
}

export type GradingWorkspaceContextResult =
  | {
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
        readonly gradingStatus: "not_started" | "in_progress" | "complete" | "published";
      })[];
    }
  | { readonly status: "assignment_config_error" }
  | { readonly status: "grading_state_error"; readonly studentId: string; readonly code: string };

const assignmentFile = (termCode: string, assignmentSlug: string): string =>
  `terms/${termCode}/assignments/${assignmentSlug}/assignment.yml`;

export const resolveGradingWorkspaceContext = (
  request: GradingWorkspaceContextRequest
): GradingWorkspaceContextResult => {
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
    readonly gradingStatus: "not_started" | "in_progress" | "complete" | "published";
  })[];
  for (const student of request.students) {
    const state = loadGradingState({
      courseRoot: config.config.summary.repoRoot,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId: student.studentId
    });
    if (state.status === "failure")
      return { status: "grading_state_error", studentId: student.studentId, code: state.code };
    if (state.status === "success" && state.value.studentId !== student.studentId)
      return {
        status: "grading_state_error",
        studentId: student.studentId,
        code: "grading_state_student_mismatch"
      };
    students.push({
      ...student,
      gradingStatus: state.status === "missing" ? "not_started" : state.value.status
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
};
