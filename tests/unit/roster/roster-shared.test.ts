import { describe, expect, it } from "vitest";
import { parseAndValidateRosterCsv } from "../../../src/roster/roster-shared.js";
import type { RosterColumnMatcher } from "../../../src/roster/roster-column-matching.js";

const ROSTER_PATH = "terms/27s1/rosters/section-001.csv";
const SECTION = "001";
const CANONICAL_HEADER = "student_id,github_username,section,status";

describe("parseAndValidateRosterCsv", () => {
  it("parses a valid roster into records with no diagnostics", () => {
    const content = `${CANONICAL_HEADER}\njones,jjones,001,active\npatel,rpatel,001,dropped\n`;

    const result = parseAndValidateRosterCsv({
      content,
      rosterPath: ROSTER_PATH,
      expectedSection: SECTION
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.records).toEqual([
      { studentId: "jones", githubUsername: "jjones", section: "001", status: "active" },
      { studentId: "patel", githubUsername: "rpatel", section: "001", status: "dropped" }
    ]);
  });

  it("reuses validateRequiredColumns for a missing column", () => {
    const content = "student_id,github_username,status\njones,jjones,active\n";

    const result = parseAndValidateRosterCsv({
      content,
      rosterPath: ROSTER_PATH,
      expectedSection: SECTION
    });

    expect(result.records).toEqual([]);
    expect(result.errors).toEqual([expect.objectContaining({ code: "missing_required_column" })]);
  });

  it("reuses createMissingRequiredValueDiagnostic for a missing required value", () => {
    const content = `${CANONICAL_HEADER}\n,jjones,001,active\n`;

    const result = parseAndValidateRosterCsv({
      content,
      rosterPath: ROSTER_PATH,
      expectedSection: SECTION
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: "missing_required_value" })]);
  });

  it("reuses validateRosterStatus for an invalid status", () => {
    const content = `${CANONICAL_HEADER}\njones,jjones,001,graduated\n`;

    const result = parseAndValidateRosterCsv({
      content,
      rosterPath: ROSTER_PATH,
      expectedSection: SECTION
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: "invalid_roster_status" })]);
  });

  it("reuses validateRosterSection for a section mismatch", () => {
    const content = `${CANONICAL_HEADER}\njones,jjones,002,active\n`;

    const result = parseAndValidateRosterCsv({
      content,
      rosterPath: ROSTER_PATH,
      expectedSection: SECTION
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: "section_mismatch" })]);
  });

  it("reuses validateGithubUsername for an invalid GitHub username", () => {
    const content = `${CANONICAL_HEADER}\njones,-bad-,001,active\n`;

    const result = parseAndValidateRosterCsv({
      content,
      rosterPath: ROSTER_PATH,
      expectedSection: SECTION
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: "invalid_github_username" })]);
  });

  it("reuses normalizeStudentId and warns on an uppercase student_id", () => {
    const content = `${CANONICAL_HEADER}\nJONES,jjones,001,active\n`;

    const result = parseAndValidateRosterCsv({
      content,
      rosterPath: ROSTER_PATH,
      expectedSection: SECTION
    });

    expect(result.errors).toEqual([]);
    expect(result.records[0]?.studentId).toBe("jones");
    expect(result.warnings).toEqual([expect.objectContaining({ code: "student_id_normalized" })]);
  });

  it("accepts a legacy header with extra columns via the default column matcher", () => {
    const content =
      "student_id,github_username,email,first_name,last_name,section,status\njones,jjones,jones@example.edu,Jones,Smith,001,active\n";

    const result = parseAndValidateRosterCsv({
      content,
      rosterPath: ROSTER_PATH,
      expectedSection: SECTION
    });

    expect(result.errors).toEqual([]);
    expect(result.records).toEqual([
      { studentId: "jones", githubUsername: "jjones", section: "001", status: "active" }
    ]);
  });

  it("uses a supplied columnMatcher instead of the default, proving the seam", () => {
    const content = `${CANONICAL_HEADER}\njones,jjones,001,active\n`;
    const swappedFieldsMatcher: RosterColumnMatcher = () => ({
      studentId: 1,
      githubUsername: 0,
      section: 2,
      status: 3
    });

    const result = parseAndValidateRosterCsv({
      content,
      rosterPath: ROSTER_PATH,
      expectedSection: SECTION,
      columnMatcher: swappedFieldsMatcher
    });

    expect(result.errors).toEqual([]);
    expect(result.records[0]).toEqual({
      studentId: "jjones",
      githubUsername: "jones",
      section: "001",
      status: "active"
    });
  });
});
