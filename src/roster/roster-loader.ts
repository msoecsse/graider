import path from "node:path";
import type { LoadedGraiderConfig } from "../config/config-models.js";
import { toForwardSlashPath } from "../core/paths.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { parseCsv } from "../io/csv.js";
import { readTextFile } from "../io/file-system.js";
import {
  normalizeGithubUsername,
  normalizeRosterStatus,
  normalizeStudentId
} from "./roster-normalization.js";
import {
  ROSTER_STATUS_ACTIVE,
  ROSTER_STATUS_DROPPED,
  ROSTER_STATUS_HOLD,
  type RosterLoadResult,
  type RosterSectionSource,
  type RosterStudent,
  type RosterSummary
} from "./roster-models.js";
import {
  GITHUB_USERNAME_COLUMN,
  REQUIRED_ROSTER_COLUMNS,
  SECTION_COLUMN,
  STATUS_COLUMN,
  STUDENT_ID_COLUMN,
  createMissingRequiredValueDiagnostic,
  isRosterStatus,
  validateGithubUsername,
  validateRequiredColumns,
  validateRosterDuplicates,
  validateRosterSection,
  validateRosterStatus
} from "./roster-validation.js";

const EMPTY_COUNT = 0;
const TERM_DIRECTORY_DEPTH = 2;
const MISSING_COLUMN_INDEX = -1;

interface RosterColumnIndexes {
  studentId: number;
  githubUsername: number;
  section: number;
  status: number;
}

const createEmptySummary = (rosterFiles: string[]): RosterSummary => ({
  rosterFiles,
  studentCount: EMPTY_COUNT,
  activeStudentCount: EMPTY_COUNT,
  droppedStudentCount: EMPTY_COUNT,
  holdStudentCount: EMPTY_COUNT
});

const createSummary = (
  rosterFiles: string[],
  students: readonly RosterStudent[]
): RosterSummary => ({
  rosterFiles,
  studentCount: students.length,
  activeStudentCount: students.filter((student) => student.status === ROSTER_STATUS_ACTIVE).length,
  droppedStudentCount: students.filter((student) => student.status === ROSTER_STATUS_DROPPED)
    .length,
  holdStudentCount: students.filter((student) => student.status === ROSTER_STATUS_HOLD).length
});

const getTermDirectory = (termConfigPath: string): string =>
  termConfigPath.split("/").slice(EMPTY_COUNT, TERM_DIRECTORY_DEPTH).join("/");

const getSectionSources = (config: LoadedGraiderConfig): RosterSectionSource[] => {
  const termDirectory = getTermDirectory(config.summary.termConfigPath);
  const sectionsById = new Map(
    config.term.sections.flatMap((section) =>
      section.roster === undefined
        ? []
        : [[section.id, toForwardSlashPath(path.posix.join(termDirectory, section.roster))]]
    )
  );

  return config.assignment.sections.flatMap((sectionId) => {
    const rosterPath = sectionsById.get(sectionId);
    return rosterPath === undefined ? [] : [{ sectionId, rosterPath }];
  });
};

const getColumnIndexes = (headers: readonly string[]): RosterColumnIndexes => ({
  studentId: headers.indexOf(STUDENT_ID_COLUMN),
  githubUsername: headers.indexOf(GITHUB_USERNAME_COLUMN),
  section: headers.indexOf(SECTION_COLUMN),
  status: headers.indexOf(STATUS_COLUMN)
});

const getValue = (values: readonly string[], index: number): string =>
  index === MISSING_COLUMN_INDEX ? "" : (values[index] ?? "").trim();

const createContext = (
  rosterPath: string,
  rowNumber: number,
  expectedSection: string
): Record<string, unknown> => ({
  rosterPath,
  rowNumber,
  expectedSection
});

const loadSectionRoster = (
  repoRoot: string,
  source: RosterSectionSource
): {
  students: RosterStudent[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
} => {
  const fileResult = readTextFile(path.join(repoRoot, source.rosterPath));

  if (fileResult.status === "failure") {
    return {
      students: [],
      warnings: [],
      errors: [fileResult.diagnostic]
    };
  }

  const document = parseCsv(fileResult.content);
  const missingColumnErrors = validateRequiredColumns(source.rosterPath, document.headers);

  if (missingColumnErrors.length > EMPTY_COUNT) {
    return {
      students: [],
      warnings: [],
      errors: missingColumnErrors
    };
  }

  const indexes = getColumnIndexes(document.headers);
  const students: RosterStudent[] = [];
  const warnings: Diagnostic[] = [];
  const errors: Diagnostic[] = [];

  for (const row of document.rows) {
    const rawStudentId = getValue(row.values, indexes.studentId);
    const rawGithubUsername = getValue(row.values, indexes.githubUsername);
    const rawSection = getValue(row.values, indexes.section);
    const rawStatus = getValue(row.values, indexes.status);
    const rowContext = createContext(source.rosterPath, row.rowNumber, source.sectionId);
    const missingValueErrors = REQUIRED_ROSTER_COLUMNS.flatMap((column) => {
      const valueByColumn = {
        [STUDENT_ID_COLUMN]: rawStudentId,
        [GITHUB_USERNAME_COLUMN]: rawGithubUsername,
        [SECTION_COLUMN]: rawSection,
        [STATUS_COLUMN]: rawStatus
      };

      return valueByColumn[column].length === EMPTY_COUNT
        ? [createMissingRequiredValueDiagnostic(source.rosterPath, row.rowNumber, column)]
        : [];
    });

    if (missingValueErrors.length > EMPTY_COUNT) {
      errors.push(...missingValueErrors);
    } else {
      const normalizedStudentId = normalizeStudentId(rawStudentId, rowContext);
      const normalizedGithubUsername = normalizeGithubUsername(rawGithubUsername, rowContext);
      const normalizedStatus = normalizeRosterStatus(rawStatus, rowContext);
      const rowWarnings = [
        normalizedStudentId.warning,
        normalizedGithubUsername.warning,
        normalizedStatus.warning
      ].filter((warning): warning is Diagnostic => warning !== undefined);
      const rowErrors = [
        ...validateRosterStatus(source.rosterPath, row.rowNumber, normalizedStatus.value),
        ...validateRosterSection(source.rosterPath, row.rowNumber, source.sectionId, rawSection),
        ...validateGithubUsername(source.rosterPath, row.rowNumber, normalizedGithubUsername.value)
      ];

      warnings.push(...rowWarnings);
      errors.push(...rowErrors);

      if (rowErrors.length === EMPTY_COUNT && isRosterStatus(normalizedStatus.value)) {
        students.push({
          studentId: normalizedStudentId.value,
          githubUsername: normalizedGithubUsername.value,
          section: rawSection,
          status: normalizedStatus.value,
          rosterPath: source.rosterPath,
          rowNumber: row.rowNumber
        });
      }
    }
  }

  return {
    students,
    warnings,
    errors
  };
};

export const loadAssignmentRosters = (config: LoadedGraiderConfig): RosterLoadResult => {
  const sources = getSectionSources(config);
  const rosterFiles = sources.map((source) => source.rosterPath);
  const loadedSections = sources.map((source) =>
    loadSectionRoster(config.summary.repoRoot, source)
  );
  const students = loadedSections.flatMap((section) => section.students);
  const warnings = loadedSections.flatMap((section) => section.warnings);
  const errors = [
    ...loadedSections.flatMap((section) => section.errors),
    ...validateRosterDuplicates(students)
  ];

  return {
    students,
    warnings,
    errors,
    summary:
      errors.length > EMPTY_COUNT
        ? createEmptySummary(rosterFiles)
        : createSummary(rosterFiles, students)
  };
};
