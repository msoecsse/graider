import { describe, expect, it } from "vitest";
import {
  sortGradingStudents,
  getStudentSort,
  rememberStudentSort,
  type StudentSortKey
} from "./studentSort";

const entries = [
  { studentId: "z", section: "10", firstName: "Amy", lastName: "Zed" },
  { studentId: "b", section: "2", firstName: "bob", lastName: "Able" },
  { studentId: "a", section: "2", firstName: "amy", lastName: "Able" },
  { studentId: "tie", section: "2", firstName: "Amy", lastName: "able" },
  { studentId: "missing", section: "" }
].map((student, index) => ({ student, index, status: "complete" }));

const ids = (key: StudentSortKey, direction: "ascending" | "descending") =>
  sortGradingStudents(entries, { key, direction }).map(({ student }) => student.studentId);

describe("grading student sorting", () => {
  it.each([
    ["section", "ascending", ["a", "tie", "b", "z", "missing"]],
    ["section", "descending", ["z", "b", "a", "tie", "missing"]],
    ["firstName", "ascending", ["a", "tie", "z", "b", "missing"]],
    ["firstName", "descending", ["b", "z", "a", "tie", "missing"]],
    ["lastName", "ascending", ["a", "tie", "b", "z", "missing"]],
    ["lastName", "descending", ["z", "b", "a", "tie", "missing"]]
  ] as const)(
    "%s %s uses natural/case-insensitive keys, secondary names, stable roster ties and missing-last",
    (key, direction, expected) => {
      expect(ids(key, direction)).toEqual(expected);
      expect(entries[0]?.student.studentId).toBe("z");
    }
  );
  it("keeps original order until explicitly sorted, including descending default", () => {
    expect(sortGradingStudents(entries, { key: "default", direction: "descending" })).toBe(entries);
  });
  it("handles missing individual name fields in either direction", () => {
    const rows = [
      { studentId: "no-first", section: "1", lastName: "Able" },
      { studentId: "no-last", section: "1", firstName: "Amy" },
      { studentId: "named", section: "1", firstName: "Amy", lastName: "Zed" }
    ].map((student, index) => ({ student, index, status: "not_started" }));
    for (const direction of ["ascending", "descending"] as const) {
      expect(
        sortGradingStudents(rows, { key: "firstName", direction }).map(
          ({ student }) => student.studentId
        )
      ).toEqual(["named", "no-last", "no-first"]);
      expect(
        sortGradingStudents(rows, { key: "lastName", direction }).at(-1)?.student.studentId
      ).toBe("no-last");
    }
  });
  it("remembers only an in-memory UI preference", () => {
    rememberStudentSort({ key: "section", direction: "descending" });
    expect(getStudentSort()).toEqual({ key: "section", direction: "descending" });
    rememberStudentSort({ key: "default", direction: "ascending" });
  });
});
