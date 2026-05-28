import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";
import { loadAssignmentRosters } from "../../../src/roster/roster-loader.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/roster");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";

const loadRosterFixture = (fixtureName: string) => {
  const configResult = loadGraiderConfig({
    cwd: path.join(FIXTURE_ROOT, fixtureName),
    assignmentFile: ASSIGNMENT_FILE
  });

  if (configResult.status === "failure") {
    throw new Error(`Expected fixture ${fixtureName} to have valid config.`);
  }

  return loadAssignmentRosters(configResult.config);
};

const expectRosterError = (fixtureName: string, code: string): void => {
  const result = loadRosterFixture(fixtureName);

  expect(result.errors).toEqual([
    expect.objectContaining({
      code
    })
  ]);
};

describe("roster loading and validation", () => {
  it("TC-ROSTER-001 valid roster passes", () => {
    const result = loadRosterFixture("valid-course");

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.students).toHaveLength(4);
    expect(result.summary).toMatchObject({
      rosterFiles: ["terms/27s1/rosters/section-001.csv", "terms/27s1/rosters/section-002.csv"],
      studentCount: 4,
      activeStudentCount: 2,
      droppedStudentCount: 1,
      holdStudentCount: 1
    });
  });

  it("TC-ROSTER-002 missing required column fails", () => {
    expectRosterError("missing-column", "missing_required_column");
  });

  it("TC-ROSTER-003 missing required value fails", () => {
    expectRosterError("missing-value", "missing_required_value");
  });

  it("TC-ROSTER-004 invalid status fails", () => {
    expectRosterError("invalid-status", "invalid_roster_status");
  });

  it("TC-ROSTER-005 section mismatch fails", () => {
    expectRosterError("section-mismatch", "section_mismatch");
  });

  it("TC-ROSTER-006 duplicate student ID fails", () => {
    expectRosterError("duplicate-student-id", "duplicate_student_id");
  });

  it("TC-ROSTER-007 duplicate GitHub username fails", () => {
    expectRosterError("duplicate-github-username", "duplicate_github_username");
  });

  it("TC-ROSTER-008 uppercase student ID warns and normalizes", () => {
    const result = loadRosterFixture("normalization-warnings");

    expect(result.errors).toEqual([]);
    expect(result.students[0]?.studentId).toBe("jones");
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "student_id_normalized"
      }),
      expect.objectContaining({
        code: "github_username_normalized"
      }),
      expect.objectContaining({
        code: "roster_status_normalized"
      })
    ]);
  });

  it("TC-ROSTER-009 uppercase GitHub username warns and normalizes", () => {
    const result = loadRosterFixture("normalization-warnings");

    expect(result.errors).toEqual([]);
    expect(result.students[0]?.githubUsername).toBe("seanjones");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "github_username_normalized"
        })
      ])
    );
  });

  it("TC-ROSTER-010 invalid GitHub username syntax fails", () => {
    expectRosterError("invalid-github-username", "invalid_github_username");
  });
});
