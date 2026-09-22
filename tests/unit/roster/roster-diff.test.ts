import { describe, expect, it } from "vitest";
import { diffRosterRows, type RosterRecord } from "../../../src/roster/roster-diff.js";

const record = (overrides: Partial<RosterRecord> = {}): RosterRecord => ({
  studentId: "jones",
  githubUsername: "jjones",
  section: "001",
  status: "active",
  ...overrides
});

describe("roster diff", () => {
  it("marks a row present only in current as added", () => {
    const result = diffRosterRows([], [record()]);

    expect(result).toMatchObject({
      addedCount: 1,
      droppedCount: 0,
      changedCount: 0,
      unchangedCount: 0
    });
    expect(result.rows).toEqual([
      expect.objectContaining({ changeType: "added", studentId: "jones", baseline: null })
    ]);
  });

  it("marks a row present only in baseline as dropped, not ignored", () => {
    const result = diffRosterRows([record()], []);

    expect(result).toMatchObject({
      addedCount: 0,
      droppedCount: 1,
      changedCount: 0,
      unchangedCount: 0
    });
    expect(result.rows).toEqual([
      expect.objectContaining({ changeType: "dropped", studentId: "jones", current: null })
    ]);
  });

  it("marks an identical row as unchanged and excludes it from rows", () => {
    const result = diffRosterRows([record()], [record()]);

    expect(result).toMatchObject({
      addedCount: 0,
      droppedCount: 0,
      changedCount: 0,
      unchangedCount: 1
    });
    expect(result.rows).toEqual([]);
  });

  it("treats a status edit to 'dropped' as changed, not dropped", () => {
    const result = diffRosterRows([record({ status: "active" })], [record({ status: "dropped" })]);

    expect(result).toMatchObject({ addedCount: 0, droppedCount: 0, changedCount: 1 });
    expect(result.rows).toEqual([
      expect.objectContaining({ changeType: "changed", changedFields: ["status"] })
    ]);
  });

  it("reports every comparable field that differs", () => {
    const result = diffRosterRows(
      [record({ githubUsername: "old", section: "001" })],
      [record({ githubUsername: "new", section: "002" })]
    );

    expect(result.rows[0]?.changedFields).toEqual(["githubUsername", "section"]);
  });

  it("treats a student_id edit as one dropped row plus one added row", () => {
    const result = diffRosterRows(
      [record({ studentId: "jones" })],
      [record({ studentId: "jonesj" })]
    );

    expect(result).toMatchObject({ addedCount: 1, droppedCount: 1, changedCount: 0 });
  });

  it("returns zero changes for an empty baseline and an empty upload", () => {
    const result = diffRosterRows([], []);

    expect(result).toMatchObject({
      addedCount: 0,
      droppedCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      totalChangeCount: 0
    });
    expect(result.rows).toEqual([]);
  });

  it("produces zero changes for a no-op edit across multiple rows", () => {
    const baseline = [record({ studentId: "jones" }), record({ studentId: "patel" })];

    const result = diffRosterRows(baseline, [...baseline]);

    expect(result.totalChangeCount).toBe(0);
    expect(result.unchangedCount).toBe(2);
  });

  it("sums totalChangeCount as added + dropped + changed", () => {
    const baseline = [
      record({ studentId: "dropped-student" }),
      record({ studentId: "changed-student", section: "001" })
    ];
    const current = [
      record({ studentId: "added-student" }),
      record({ studentId: "changed-student", section: "002" })
    ];

    const result = diffRosterRows(baseline, current);

    expect(result).toMatchObject({ addedCount: 1, droppedCount: 1, changedCount: 1 });
    expect(result.totalChangeCount).toBe(3);
  });

  it("matches identity case-insensitively and after trimming", () => {
    const result = diffRosterRows(
      [record({ studentId: " Jones " })],
      [record({ studentId: "jones" })]
    );

    expect(result).toMatchObject({
      addedCount: 0,
      droppedCount: 0,
      changedCount: 0,
      unchangedCount: 1
    });
  });
});
