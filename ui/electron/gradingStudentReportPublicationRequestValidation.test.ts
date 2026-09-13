import { describe, expect, it } from "vitest";
import { isPublishGradingStudentReportRequest } from "./gradingStudentViewStateRequestValidation.js";

describe("publish grading student report request validation", () => {
  it("accepts only canonical grading identity", () => {
    const identity = {
      courseFolderId: "course",
      courseFolderPath: "/trusted/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada"
    };
    expect(isPublishGradingStudentReportRequest(identity)).toBe(true);
    for (const extra of [
      { html: "<p>attacker</p>" },
      { reportPath: "../../source.java" },
      { owner: "attacker" },
      { repo: "other" },
      { repository: { owner: "attacker", repo: "other" } },
      { submissionCommitSha: "a".repeat(40) },
      { score: 100 },
      { status: "published" },
      { evidence: {} },
      { commitHistory: [] },
      { workflowRunId: 1 },
      { artifactName: "other" },
      { commitMessage: "attacker" },
      { token: "secret" },
      { unknown: true }
    ])
      expect(isPublishGradingStudentReportRequest({ ...identity, ...extra })).toBe(false);
  });
});
