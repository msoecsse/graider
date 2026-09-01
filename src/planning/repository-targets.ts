import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { generateRepositoryName } from "./repo-name.js";
import type { LoadedGraiderConfig } from "../config/config-models.js";
import type { RosterStudent } from "../roster/roster-models.js";

export interface ApplyRepositoryTarget {
  readonly targetId: string;
  readonly mode: "individual" | "group";
  readonly repositoryName: string;
  readonly sectionIds: readonly string[];
  readonly studentIds: readonly string[];
  readonly githubUsernames: readonly string[];
  readonly primaryStudentId?: string;
  readonly groupId?: string;
  readonly plannedStudentPermission: "admin";
  readonly facultyTeamPermission: string;
  readonly graderTeamPermission?: string;
  readonly diagnostics: readonly Diagnostic[];
}

export const createIndividualRepositoryTarget = (
  config: LoadedGraiderConfig,
  student: RosterStudent
): ApplyRepositoryTarget => {
  const name = generateRepositoryName({
    pattern: config.course.github.repo_name_pattern,
    termCode: config.summary.termCode,
    courseCode: config.course.course.code,
    assignmentSlug: config.summary.assignmentSlug,
    githubUsername: student.githubUsername
  });
  return {
    targetId: student.studentId,
    mode: "individual",
    repositoryName: name.repositoryName ?? "",
    sectionIds: [student.section],
    studentIds: [student.studentId],
    githubUsernames: [student.githubUsername],
    primaryStudentId: student.studentId,
    plannedStudentPermission: "admin",
    facultyTeamPermission: config.course.github.faculty_permission,
    ...(config.course.github.grader_permission === undefined
      ? {}
      : { graderTeamPermission: config.course.github.grader_permission }),
    diagnostics: [...name.warnings, ...name.errors]
  };
};
