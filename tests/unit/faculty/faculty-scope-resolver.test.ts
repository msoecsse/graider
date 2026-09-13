import { describe, expect, it } from "vitest";
import { resolveFacultyScope } from "../../../src/faculty/faculty-scope-resolver.js";
import type { RosterLoadResult } from "../../../src/roster/roster-models.js";

const roster = (students: RosterLoadResult["students"]): RosterLoadResult => ({
  students,
  warnings: [],
  errors: [],
  summary: {
    rosterFiles: [],
    studentCount: students.length,
    activeStudentCount: students.filter((s) => s.status === "active").length,
    droppedStudentCount: 0,
    holdStudentCount: 0
  }
});
const student = (studentId: string, section: string, status: "active" | "dropped" = "active") => ({
  studentId,
  githubUsername: `${studentId}hub`,
  section,
  status,
  rosterPath: "rosters/x.csv",
  rowNumber: 2
});

describe("faculty scope resolver", () => {
  const sections = [
    { id: "001", faculty: ["jones", "smith"] },
    { id: "002", faculty: ["jones"] },
    { id: "003", faculty: ["lee"] }
  ];
  const loaded = roster([
    student("s1", "001"),
    student("s2", "002"),
    student("s3", "003"),
    student("drop", "001", "dropped")
  ]);
  it("fails closed when identity is unset or no sections match", () => {
    expect(resolveFacultyScope(null, sections, loaded)).toMatchObject({
      status: "faculty_identity_required",
      students: []
    });
    expect(resolveFacultyScope("none", sections, loaded)).toMatchObject({
      status: "no_assigned_sections",
      students: []
    });
  });
  it("scopes active students by faculty section assignments", () => {
    expect(resolveFacultyScope("jones", sections, loaded)).toMatchObject({
      status: "success",
      sections: ["001", "002"],
      students: [
        { studentId: "s1", section: "001" },
        { studentId: "s2", section: "002" }
      ]
    });
    expect(resolveFacultyScope("smith", sections, loaded).students).toEqual([
      { studentId: "s1", githubUsername: "s1hub", section: "001" }
    ]);
  });
  it("deduplicates students and preserves roster conflicts", () => {
    expect(
      resolveFacultyScope("jones", sections, roster([student("s1", "001"), student("s1", "002")]))
        .students
    ).toHaveLength(1);
    expect(
      resolveFacultyScope("jones", sections, {
        ...loaded,
        errors: [
          { code: "duplicate_student_id", severity: "error", message: "duplicate", context: {} }
        ]
      }).status
    ).toBe("roster_error");
  });
});
