import {
  GITHUB_USERNAME_COLUMN,
  SECTION_COLUMN,
  STATUS_COLUMN,
  STUDENT_ID_COLUMN
} from "./roster-validation.js";

export const MISSING_ROSTER_COLUMN_INDEX = -1;

export const CANONICAL_ROSTER_FIELDS = [
  "studentId",
  "githubUsername",
  "section",
  "status"
] as const;

export type RosterCanonicalField = (typeof CANONICAL_ROSTER_FIELDS)[number];

export type RosterColumnIndexes = Record<RosterCanonicalField, number>;

// The seam item 33 needs: a RosterColumnMatcher maps a roster's actual CSV
// headers to Graider's four canonical fields. This module ships only the
// exact-name matcher below, which reproduces the header lookup already used
// by src/roster/roster-loader.ts (order-independent, tolerant of extra
// unrecognized columns such as the legacy email/first_name/last_name
// header set). Item 33's best-effort/user-editable mapping is a second
// RosterColumnMatcher implementation plugged in later; nothing about parse,
// validate, or diff needs to change to add it.
export type RosterColumnMatcher = (headers: readonly string[]) => RosterColumnIndexes;

const CANONICAL_HEADER_NAME: Record<RosterCanonicalField, string> = {
  studentId: STUDENT_ID_COLUMN,
  githubUsername: GITHUB_USERNAME_COLUMN,
  section: SECTION_COLUMN,
  status: STATUS_COLUMN
};

export const matchRosterColumnsByExactName: RosterColumnMatcher = (headers) =>
  Object.fromEntries(
    CANONICAL_ROSTER_FIELDS.map((field) => [field, headers.indexOf(CANONICAL_HEADER_NAME[field])])
  ) as RosterColumnIndexes;
