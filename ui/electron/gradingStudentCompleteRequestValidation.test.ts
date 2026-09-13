import { describe, expect, it } from "vitest";
import { isMarkGradingStudentCompleteRequest } from "./gradingStudentViewStateRequestValidation.js";

describe("mark grading student complete request validation", () => {
  it("accepts canonical identity and rejects renderer-supplied trust or lifecycle fields", () => {
    const identity = {
      courseFolderId: "course",
      courseFolderPath: "/trusted/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada"
    };
    expect(isMarkGradingStudentCompleteRequest(identity)).toBe(true);
    for (const extra of [
      { status: "published" },
      { submissionCommitSha: "a".repeat(40) },
      { repositoryPath: "/untrusted" },
      { githubUsername: "ada" },
      { facultyIdentity: "grader" },
      { gradingState: {} }
    ])
      expect(isMarkGradingStudentCompleteRequest({ ...identity, ...extra })).toBe(false);
  });
});
