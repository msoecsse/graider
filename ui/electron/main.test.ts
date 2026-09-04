import { describe, expect, it } from "vitest";
import { isRosterSaveRequest } from "./rosterRequestValidation.js";

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
});
