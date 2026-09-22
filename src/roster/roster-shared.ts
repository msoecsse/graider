import type { Diagnostic } from "../diagnostics/diagnostic.js";
import {
  normalizeGithubUsername,
  normalizeRosterStatus,
  normalizeStudentId
} from "./roster-normalization.js";
import {
  GITHUB_USERNAME_COLUMN,
  REQUIRED_ROSTER_COLUMNS,
  SECTION_COLUMN,
  STATUS_COLUMN,
  STUDENT_ID_COLUMN,
  createMissingRequiredValueDiagnostic,
  validateGithubUsername,
  validateRequiredColumns,
  validateRosterSection,
  validateRosterStatus
} from "./roster-validation.js";
import {
  MISSING_ROSTER_COLUMN_INDEX,
  matchRosterColumnsByExactName,
  type RosterColumnIndexes,
  type RosterColumnMatcher
} from "./roster-column-matching.js";
import { parseRosterCsvText } from "./roster-shared-csv.js";
import type { RosterRecord } from "./roster-diff.js";

export type { RosterCsvDocument, RosterCsvRow } from "./roster-shared-csv.js";
export { parseRosterCsvText } from "./roster-shared-csv.js";
export {
  CANONICAL_ROSTER_FIELDS,
  MISSING_ROSTER_COLUMN_INDEX,
  matchRosterColumnsByExactName,
  type RosterCanonicalField,
  type RosterColumnIndexes,
  type RosterColumnMatcher
} from "./roster-column-matching.js";
export {
  diffRosterRows,
  type RosterDiffResult,
  type RosterRecord,
  type RosterRowChangeType,
  type RosterRowDiff
} from "./roster-diff.js";

const EMPTY_COUNT = 0;

export interface RosterCsvParseRequest {
  readonly content: string;
  readonly rosterPath: string;
  readonly expectedSection: string;
  readonly columnMatcher?: RosterColumnMatcher;
}

export interface RosterCsvParseResult {
  readonly records: readonly RosterRecord[];
  readonly warnings: readonly Diagnostic[];
  readonly errors: readonly Diagnostic[];
}

const getValue = (values: readonly string[], index: number): string =>
  index === MISSING_ROSTER_COLUMN_INDEX ? "" : (values[index] ?? "");

interface RawRosterRowValues {
  readonly rawStudentId: string;
  readonly rawGithubUsername: string;
  readonly rawSection: string;
  readonly rawStatus: string;
}

const readRawRowValues = (
  values: readonly string[],
  indexes: RosterColumnIndexes
): RawRosterRowValues => ({
  rawStudentId: getValue(values, indexes.studentId),
  rawGithubUsername: getValue(values, indexes.githubUsername),
  rawSection: getValue(values, indexes.section),
  rawStatus: getValue(values, indexes.status)
});

const getMissingValueErrors = (
  rosterPath: string,
  rowNumber: number,
  raw: RawRosterRowValues
): Diagnostic[] => {
  const valueByColumn: Record<string, string> = {
    [STUDENT_ID_COLUMN]: raw.rawStudentId,
    [GITHUB_USERNAME_COLUMN]: raw.rawGithubUsername,
    [SECTION_COLUMN]: raw.rawSection,
    [STATUS_COLUMN]: raw.rawStatus
  };

  return REQUIRED_ROSTER_COLUMNS.flatMap((column) =>
    (valueByColumn[column] ?? "").length === EMPTY_COUNT
      ? [createMissingRequiredValueDiagnostic(rosterPath, rowNumber, column)]
      : []
  );
};

// Parse + column-match + validate, combined. This deliberately reuses every
// rule in roster-validation.ts and roster-normalization.ts rather than
// reimplementing them -- only the row-by-row orchestration is new, because
// it is file-agnostic (it takes CSV text directly) where
// roster-loader.ts's equivalent loop is tied to reading a roster file off
// disk.
export const parseAndValidateRosterCsv = (request: RosterCsvParseRequest): RosterCsvParseResult => {
  const document = parseRosterCsvText(request.content);
  const missingColumnErrors = validateRequiredColumns(request.rosterPath, document.headers);

  if (missingColumnErrors.length > EMPTY_COUNT) {
    return { records: [], warnings: [], errors: missingColumnErrors };
  }

  const matcher = request.columnMatcher ?? matchRosterColumnsByExactName;
  const indexes = matcher(document.headers);
  const records: RosterRecord[] = [];
  const warnings: Diagnostic[] = [];
  const errors: Diagnostic[] = [];

  for (const row of document.rows) {
    const raw = readRawRowValues(row.values, indexes);
    const missingValueErrors = getMissingValueErrors(request.rosterPath, row.rowNumber, raw);

    if (missingValueErrors.length > EMPTY_COUNT) {
      errors.push(...missingValueErrors);
    } else {
      const rowContext = {
        rosterPath: request.rosterPath,
        rowNumber: row.rowNumber,
        expectedSection: request.expectedSection
      };
      const normalizedStudentId = normalizeStudentId(raw.rawStudentId, rowContext);
      const normalizedGithubUsername = normalizeGithubUsername(raw.rawGithubUsername, rowContext);
      const normalizedStatus = normalizeRosterStatus(raw.rawStatus, rowContext);
      const rowWarnings = [
        normalizedStudentId.warning,
        normalizedGithubUsername.warning,
        normalizedStatus.warning
      ].filter((warning): warning is Diagnostic => warning !== undefined);
      const rowErrors = [
        ...validateRosterStatus(request.rosterPath, row.rowNumber, normalizedStatus.value),
        ...validateRosterSection(
          request.rosterPath,
          row.rowNumber,
          request.expectedSection,
          raw.rawSection
        ),
        ...validateGithubUsername(request.rosterPath, row.rowNumber, normalizedGithubUsername.value)
      ];

      warnings.push(...rowWarnings);
      errors.push(...rowErrors);

      if (rowErrors.length === EMPTY_COUNT) {
        records.push({
          studentId: normalizedStudentId.value,
          githubUsername: normalizedGithubUsername.value,
          section: raw.rawSection,
          status: normalizedStatus.value
        });
      }
    }
  }

  return { records, warnings, errors };
};
