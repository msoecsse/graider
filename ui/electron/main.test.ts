import { describe, expect, it } from "vitest";
import { isRosterSaveRequest, isRosterSectionSummariesRequest } from "./rosterRequestValidation.js";

describe("isRosterSaveRequest", () => {
  it("accepts a manual student using the canonical roster row shape", () => {
    expect(
      isRosterSaveRequest({
        courseFolderId: "course-folder-test",
        courseFolderPath: "/tmp/course",
        termCode: "27s1",
        sectionId: "001",
        rows: [
          {
            studentId: "S001",
            githubUsername: "octocat",
            section: "001",
            status: "active"
          }
        ],
        confirmed: false
      })
    ).toBe(true);
  });

  it("accepts only narrow source-kind intent and rejects forged provenance", () => {
    const base = {
      courseFolderId: "course-folder-test",
      courseFolderPath: "/tmp/course",
      termCode: "27s1",
      sectionId: "001",
      rows: [],
      confirmed: false
    };
    expect(isRosterSaveRequest({ ...base, sourceKind: "csv_upload" })).toBe(true);
    expect(isRosterSaveRequest({ ...base, sourceKind: "manual_edit" })).toBe(true);
    expect(isRosterSaveRequest(base)).toBe(true);
    expect(isRosterSaveRequest({ ...base, sourceKind: "canvas" })).toBe(false);
    expect(
      isRosterSaveRequest({
        ...base,
        source: { kind: "csv_upload", updatedAt: "2026-09-22T22:00:00.000Z", updatedBy: "x" }
      })
    ).toBe(false);
    expect(isRosterSaveRequest({ ...base, updatedAt: "2026-09-22T22:00:00.000Z" })).toBe(false);
    expect(isRosterSaveRequest({ ...base, updatedBy: "attacker" })).toBe(false);
  });
});

describe("isRosterSectionSummariesRequest", () => {
  it("requires a narrow course and term identity", () => {
    expect(
      isRosterSectionSummariesRequest({
        courseFolderId: "course-folder-test",
        courseFolderPath: "/tmp/course",
        termCode: "27s1"
      })
    ).toBe(true);
    expect(isRosterSectionSummariesRequest({ courseFolderId: "course", termCode: "27s1" })).toBe(
      false
    );
  });
});
