import { describe, expect, it } from "vitest";
import {
  MISSING_ROSTER_COLUMN_INDEX,
  matchRosterColumnsByExactName
} from "../../../src/roster/roster-column-matching.js";

describe("roster column matching (exact-name matcher)", () => {
  it("matches canonical headers regardless of order", () => {
    const indexes = matchRosterColumnsByExactName([
      "status",
      "student_id",
      "section",
      "github_username"
    ]);

    expect(indexes).toEqual({
      studentId: 1,
      githubUsername: 3,
      section: 2,
      status: 0
    });
  });

  it("ignores unrecognized extra columns, such as the legacy header set", () => {
    const indexes = matchRosterColumnsByExactName([
      "student_id",
      "github_username",
      "email",
      "first_name",
      "last_name",
      "section",
      "status"
    ]);

    expect(indexes).toEqual({
      studentId: 0,
      githubUsername: 1,
      section: 5,
      status: 6
    });
  });

  it("returns the missing-column sentinel for a canonical field with no matching header", () => {
    const indexes = matchRosterColumnsByExactName(["student_id", "github_username", "section"]);

    expect(indexes.status).toBe(MISSING_ROSTER_COLUMN_INDEX);
  });
});
