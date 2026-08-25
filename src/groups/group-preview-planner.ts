import path from "node:path";
import type { LoadedGraiderConfig } from "../config/config-models.js";
import { createConfigDiagnostic, createWarningDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { parseCsv } from "../io/csv.js";
import { readTextFile } from "../io/file-system.js";
import { generateRepositoryName } from "../planning/repo-name.js";
import { ROSTER_STATUS_ACTIVE, type RosterStudent } from "../roster/roster-models.js";

const GROUP_HEADERS = ["group_id", "student_id"] as const;
const SAFE_GROUP_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SAFE_GROUP_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/u;

export interface GroupApplyPreviewTarget {
  readonly targetId: string;
  readonly mode: "group";
  readonly groupId: string;
  readonly repositoryName: string;
  readonly sectionIds: string[];
  readonly studentIds: string[];
  readonly githubUsernames: string[];
  readonly plannedStudentPermission: "admin";
  readonly facultyTeam: string;
  readonly facultyTeamPermission: string;
  readonly graderTeam: string;
  readonly graderTeamPermission: string;
  readonly diagnostics: Diagnostic[];
}

export interface GroupApplyPreviewPlanResult {
  readonly targets: GroupApplyPreviewTarget[];
  readonly warnings: Diagnostic[];
  readonly errors: Diagnostic[];
}

const diagnostic = (code: string, message: string, context: Record<string, unknown>): Diagnostic =>
  createConfigDiagnostic(code, message, context);
const warning = (code: string, message: string, context: Record<string, unknown>): Diagnostic =>
  createWarningDiagnostic(code, message, context);

export const buildGroupApplyPreviewPlan = (
  config: LoadedGraiderConfig,
  students: readonly RosterStudent[]
): GroupApplyPreviewPlanResult => {
  const groupsFile = config.assignment.groups?.file ?? "groups.csv";
  const assignmentDirectory = path.dirname(
    path.resolve(config.summary.repoRoot, config.summary.assignmentRelativePath)
  );
  const groupsPath = path.resolve(assignmentDirectory, groupsFile);
  const baseContext = { assignmentFile: config.summary.assignmentConfigPath, groupsFile };

  if (!SAFE_GROUP_FILE.test(groupsFile) || path.dirname(groupsFile) !== ".") {
    return {
      targets: [],
      warnings: [],
      errors: [diagnostic("group_csv_invalid", "Group CSV file name is invalid.", baseContext)]
    };
  }
  if (path.relative(assignmentDirectory, groupsPath).startsWith("..")) {
    return {
      targets: [],
      warnings: [],
      errors: [
        diagnostic(
          "group_csv_invalid",
          "Group CSV path is outside the assignment directory.",
          baseContext
        )
      ]
    };
  }

  const file = readTextFile(groupsPath);
  if (file.status === "failure") {
    return {
      targets: [],
      warnings: [],
      errors: [
        diagnostic(
          "group_csv_missing",
          "Group CSV is missing for this group assignment.",
          baseContext
        )
      ]
    };
  }
  const document = parseCsv(file.content);
  if (
    document.headers.length !== GROUP_HEADERS.length ||
    document.headers.some((header, index) => header !== GROUP_HEADERS[index])
  ) {
    return {
      targets: [],
      warnings: [],
      errors: [
        diagnostic(
          "group_csv_invalid",
          "Group CSV must begin with group_id,student_id.",
          baseContext
        )
      ]
    };
  }

  const knownStudents = new Map(students.map((student) => [student.studentId, student]));
  const memberships = new Set<string>();
  const assigned = new Set<string>();
  const groups = new Map<string, RosterStudent[]>();
  const errors: Diagnostic[] = [];
  for (const row of document.rows) {
    const groupId = (row.values[0] ?? "").trim();
    const studentId = (row.values[1] ?? "").trim();
    const context = { ...baseContext, rowNumber: row.rowNumber, groupId, studentId };
    if (row.values.length !== 2 || groupId === "" || studentId === "") {
      errors.push(
        diagnostic(
          "group_csv_invalid",
          "Each group CSV row requires group_id and student_id.",
          context
        )
      );
      continue;
    }
    if (!SAFE_GROUP_ID.test(groupId)) {
      errors.push(
        diagnostic(
          "group_id_invalid",
          `Group ID ${groupId} is not safe for repository naming.`,
          context
        )
      );
      continue;
    }
    const membership = `${groupId}\u0000${studentId}`;
    if (memberships.has(membership)) {
      errors.push(
        diagnostic(
          "group_membership_duplicate",
          `Student ${studentId} is duplicated in group ${groupId}.`,
          context
        )
      );
      continue;
    }
    memberships.add(membership);
    if (assigned.has(studentId)) {
      errors.push(
        diagnostic(
          "group_student_multiple_groups",
          `Student ${studentId} appears in more than one group.`,
          context
        )
      );
      continue;
    }
    const student = knownStudents.get(studentId);
    if (student === undefined) {
      errors.push(
        diagnostic(
          "group_student_unknown",
          `Student ${studentId} is not in this assignment's selected sections.`,
          context
        )
      );
      continue;
    }
    if (student.status !== ROSTER_STATUS_ACTIVE) {
      errors.push(
        diagnostic(
          "group_student_inactive",
          `Student ${studentId} is ${student.status} and cannot be assigned to a group.`,
          context
        )
      );
      continue;
    }
    assigned.add(studentId);
    groups.set(groupId, [...(groups.get(groupId) ?? []), student]);
  }

  const targets: GroupApplyPreviewTarget[] = [];
  const names = new Map<string, string>();
  for (const [groupId, members] of groups) {
    const sectionIds = [...new Set(members.map((student) => student.section))];
    if (sectionIds.length !== 1) {
      errors.push(
        diagnostic(
          "group_cross_section",
          `Group ${groupId} contains students from more than one section.`,
          { ...baseContext, groupId, sectionIds }
        )
      );
      continue;
    }
    const repository = generateRepositoryName({
      pattern: config.course.github.repo_name_pattern,
      termCode: config.summary.termCode,
      courseCode: config.course.course.code,
      assignmentSlug: config.summary.assignmentSlug,
      githubUsername: groupId
    });
    if (repository.repositoryName === undefined || repository.errors.length > 0) {
      errors.push(...repository.errors);
      continue;
    }
    const existingGroup = names.get(repository.repositoryName);
    if (existingGroup !== undefined) {
      errors.push(
        diagnostic(
          "group_repository_name_collision",
          `Groups ${existingGroup} and ${groupId} resolve to the same repository name ${repository.repositoryName}.`,
          { ...baseContext, groupId, repositoryName: repository.repositoryName }
        )
      );
      continue;
    }
    names.set(repository.repositoryName, groupId);
    targets.push({
      targetId: groupId,
      mode: "group",
      groupId,
      repositoryName: repository.repositoryName,
      sectionIds,
      studentIds: members.map((student) => student.studentId),
      githubUsernames: members.map((student) => student.githubUsername),
      plannedStudentPermission: "admin",
      facultyTeam: config.course.github.faculty_team,
      facultyTeamPermission: config.course.github.faculty_permission,
      graderTeam: config.course.github.grader_team,
      graderTeamPermission: config.course.github.grader_permission,
      diagnostics: [...repository.warnings]
    });
  }
  if (targets.length === 0 && errors.length === 0)
    errors.push(
      diagnostic("group_csv_no_valid_groups", "Group CSV contains no valid groups.", baseContext)
    );
  const ungrouped = students.filter(
    (student) => student.status === ROSTER_STATUS_ACTIVE && !assigned.has(student.studentId)
  );
  const warnings =
    ungrouped.length === 0
      ? []
      : [
          warning(
            "group_students_ungrouped",
            `${String(ungrouped.length)} active student(s) in selected sections are not assigned to a group.`,
            { ...baseContext, studentIds: ungrouped.map((student) => student.studentId) }
          )
        ];
  return { targets, warnings, errors };
};
