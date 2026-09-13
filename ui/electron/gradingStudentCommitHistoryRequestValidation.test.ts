import { describe, expect, it } from "vitest";
import { isLoadGradingStudentCommitHistoryRequest } from "./gradingStudentViewStateRequestValidation.js";

describe("load grading student commit-history request validation", () => {
  it("accepts only canonical grading student identity", () => {
    const identity = {
      courseFolderId: "course",
      courseFolderPath: "/registered/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada"
    };
    expect(isLoadGradingStudentCommitHistoryRequest(identity)).toBe(true);
    for (const extra of [
      { repositoryPath: "/attacker/repository" },
      { localPath: "/attacker/repository" },
      { revision: "HEAD" },
      { submissionCommitSha: "a".repeat(40) },
      { branch: "attacker" },
      { maxCount: 1000 },
      { gitArguments: ["--all"] },
      { author: "attacker" },
      { unknown: true }
    ])
      expect(isLoadGradingStudentCommitHistoryRequest({ ...identity, ...extra })).toBe(false);
  });
});
