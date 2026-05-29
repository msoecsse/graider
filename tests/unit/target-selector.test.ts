import { describe, expect, it } from "vitest";
import { DiagnosticCode } from "../../src/diagnostics/error-catalog.js";
import {
  selectTargetStudents,
  validateTargetSelector,
  type TargetSelector
} from "../../src/core/target-selector.js";
import type { RosterStudent } from "../../src/roster/roster-models.js";

enum TargetSelectorTestNumber {
  FirstDataRow = 2,
  SecondDataRow = 3,
  ThirdDataRow = 4
}

const students: RosterStudent[] = [
  {
    studentId: "jones",
    githubUsername: "seanjones",
    section: "001",
    status: "active",
    rosterPath: "terms/27s1/rosters/section-001.csv",
    rowNumber: TargetSelectorTestNumber.FirstDataRow
  },
  {
    studentId: "smith",
    githubUsername: "janesmith",
    section: "001",
    status: "dropped",
    rosterPath: "terms/27s1/rosters/section-001.csv",
    rowNumber: TargetSelectorTestNumber.SecondDataRow
  },
  {
    studentId: "kim",
    githubUsername: "KimStudent",
    section: "002",
    status: "active",
    rosterPath: "terms/27s1/rosters/section-002.csv",
    rowNumber: TargetSelectorTestNumber.ThirdDataRow
  }
];

describe("target selector", () => {
  it("fails when no target selector is provided", () => {
    const result = validateTargetSelector({});

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.TargetSelectorMissing })
    ]);
  });

  it("fails when multiple target selectors are provided", () => {
    const result = validateTargetSelector({ all: true, section: "001" });

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.TargetSelectorAmbiguous })
    ]);
  });

  it("--all selects active students only", () => {
    const result = selectTargetStudents(students, { kind: "all" });

    expect(result.errors).toEqual([]);
    expect(result.students.map((student) => student.studentId)).toEqual(["jones", "kim"]);
  });

  it("--section preserves leading zeros and selects active students in that section", () => {
    const result = selectTargetStudents(students, { kind: "section", section: "001" });

    expect(result.errors).toEqual([]);
    expect(result.students.map((student) => student.studentId)).toEqual(["jones"]);
  });

  it("student ID matching uses normalized lowercase", () => {
    const result = validateTargetSelector({ studentId: "JONES" });

    expect(result.selector).toEqual({ kind: "student_id", studentId: "jones" });
  });

  it("GitHub username matching uses normalized lowercase", () => {
    const selector: TargetSelector = { kind: "github_username", githubUsername: "KIMSTUDENT" };
    const result = selectTargetStudents(students, selector);

    expect(result.errors).toEqual([]);
    expect(result.students.map((student) => student.studentId)).toEqual(["kim"]);
  });

  it("directly selected inactive student fails clearly", () => {
    const result = selectTargetStudents(students, { kind: "student_id", studentId: "smith" });

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.TargetStudentNotActive })
    ]);
  });

  it("selector with no matches fails clearly", () => {
    const result = selectTargetStudents(students, { kind: "section", section: "003" });

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.TargetMatchesNoStudents })
    ]);
  });
});
