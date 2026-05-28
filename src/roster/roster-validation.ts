import {
  DUPLICATE_GITHUB_USERNAME_CODE,
  DUPLICATE_STUDENT_ID_CODE,
  INVALID_GITHUB_USERNAME_CODE,
  INVALID_ROSTER_STATUS_CODE,
  MISSING_REQUIRED_COLUMN_CODE,
  MISSING_REQUIRED_VALUE_CODE,
  SECTION_MISMATCH_CODE,
  createConfigDiagnostic
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import {
  ROSTER_STATUS_ACTIVE,
  ROSTER_STATUS_DROPPED,
  ROSTER_STATUS_HOLD,
  type RosterStatus,
  type RosterStudent
} from "./roster-models.js";

export const STUDENT_ID_COLUMN = "student_id";
export const GITHUB_USERNAME_COLUMN = "github_username";
export const SECTION_COLUMN = "section";
export const STATUS_COLUMN = "status";

export const REQUIRED_ROSTER_COLUMNS = [
  STUDENT_ID_COLUMN,
  GITHUB_USERNAME_COLUMN,
  SECTION_COLUMN,
  STATUS_COLUMN
] as const;

const GITHUB_USERNAME_MAX_LENGTH = 39;
const FIRST_MATCH_INDEX = 0;
const SECOND_MATCH_INDEX = 1;
const VALID_ROSTER_STATUSES = [
  ROSTER_STATUS_ACTIVE,
  ROSTER_STATUS_DROPPED,
  ROSTER_STATUS_HOLD
] as const;
const GITHUB_USERNAME_PATTERN = /^[a-z0-9-]+$/;
const CONSECUTIVE_HYPHENS = "--";
const HYPHEN = "-";

export const isRosterStatus = (value: string): value is RosterStatus =>
  VALID_ROSTER_STATUSES.some((status) => status === value);

export const validateRequiredColumns = (
  rosterPath: string,
  headers: readonly string[]
): Diagnostic[] =>
  REQUIRED_ROSTER_COLUMNS.filter((column) => !headers.includes(column)).map((column) =>
    createConfigDiagnostic(
      MISSING_REQUIRED_COLUMN_CODE,
      `Roster is missing required column ${column}.`,
      {
        rosterPath,
        columnName: column
      }
    )
  );

export const createMissingRequiredValueDiagnostic = (
  rosterPath: string,
  rowNumber: number,
  columnName: string
): Diagnostic =>
  createConfigDiagnostic(
    MISSING_REQUIRED_VALUE_CODE,
    `Roster row ${String(rowNumber)} is missing required value ${columnName}.`,
    {
      rosterPath,
      rowNumber,
      columnName
    }
  );

export const validateRosterStatus = (
  rosterPath: string,
  rowNumber: number,
  status: string
): Diagnostic[] =>
  isRosterStatus(status)
    ? []
    : [
        createConfigDiagnostic(
          INVALID_ROSTER_STATUS_CODE,
          `Roster row ${String(rowNumber)} has invalid status ${status}.`,
          {
            rosterPath,
            rowNumber,
            status
          }
        )
      ];

export const validateRosterSection = (
  rosterPath: string,
  rowNumber: number,
  expectedSection: string,
  actualSection: string
): Diagnostic[] =>
  actualSection === expectedSection
    ? []
    : [
        createConfigDiagnostic(
          SECTION_MISMATCH_CODE,
          `Roster row ${String(rowNumber)} has section ${actualSection}; expected ${expectedSection}.`,
          {
            rosterPath,
            rowNumber,
            expectedSection,
            actualSection
          }
        )
      ];

export const validateGithubUsername = (
  rosterPath: string,
  rowNumber: number,
  githubUsername: string
): Diagnostic[] => {
  const isValid =
    githubUsername.length > 0 &&
    githubUsername.length <= GITHUB_USERNAME_MAX_LENGTH &&
    GITHUB_USERNAME_PATTERN.test(githubUsername) &&
    !githubUsername.startsWith(HYPHEN) &&
    !githubUsername.endsWith(HYPHEN) &&
    !githubUsername.includes(CONSECUTIVE_HYPHENS);

  return isValid
    ? []
    : [
        createConfigDiagnostic(
          INVALID_GITHUB_USERNAME_CODE,
          `Roster row ${String(rowNumber)} has invalid GitHub username ${githubUsername}.`,
          {
            rosterPath,
            rowNumber,
            githubUsername
          }
        )
      ];
};

const createDuplicateDiagnostic = (
  code: string,
  message: string,
  valueKey: string,
  matches: readonly RosterStudent[]
): Diagnostic => {
  const firstMatch = matches[FIRST_MATCH_INDEX];
  const secondMatch = matches[SECOND_MATCH_INDEX];

  return createConfigDiagnostic(code, message, {
    [valueKey]: firstMatch?.[valueKey === STUDENT_ID_COLUMN ? "studentId" : "githubUsername"],
    firstRosterPath: firstMatch?.rosterPath,
    firstRowNumber: firstMatch?.rowNumber,
    secondRosterPath: secondMatch?.rosterPath,
    secondRowNumber: secondMatch?.rowNumber
  });
};

const findDuplicateDiagnostics = (
  students: readonly RosterStudent[],
  getValue: (student: RosterStudent) => string,
  code: string,
  message: string,
  valueKey: string
): Diagnostic[] => {
  const grouped = new Map<string, RosterStudent[]>();

  for (const student of students) {
    grouped.set(getValue(student), [...(grouped.get(getValue(student)) ?? []), student]);
  }

  return [...grouped.values()]
    .filter((matches) => matches.length > SECOND_MATCH_INDEX)
    .map((matches) => createDuplicateDiagnostic(code, message, valueKey, matches));
};

export const validateRosterDuplicates = (students: readonly RosterStudent[]): Diagnostic[] => [
  ...findDuplicateDiagnostics(
    students,
    (student) => student.studentId,
    DUPLICATE_STUDENT_ID_CODE,
    "Duplicate student_id found in rosters.",
    STUDENT_ID_COLUMN
  ),
  ...findDuplicateDiagnostics(
    students,
    (student) => student.githubUsername,
    DUPLICATE_GITHUB_USERNAME_CODE,
    "Duplicate github_username found in rosters.",
    GITHUB_USERNAME_COLUMN
  )
];
