import { describe, expect, it } from "vitest";
import { isLoadGradingStudentEvidenceRequest } from "./gradingStudentViewStateRequestValidation.js";

describe("load grading student evidence request validation", () => {
  it("accepts only canonical grading student identity", () => {
    const identity = {
      courseFolderId: "course",
      courseFolderPath: "/registered/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada"
    };
    expect(isLoadGradingStudentEvidenceRequest(identity)).toBe(true);
    for (const extra of [
      { owner: "attacker" },
      { repo: "other" },
      { submissionCommitSha: "a".repeat(40) },
      { workflow: ".github/workflows/other.yml" },
      { workflowPath: ".github/workflows/other.yml" },
      { artifact: "other" },
      { artifactName: "other" },
      { runId: 10 },
      { runAttempt: 2 },
      { localPath: "/attacker/repository" },
      { grading: { enabled: true } },
      { gradingStatus: "published" },
      { token: "secret" },
      { unknown: true }
    ])
      expect(isLoadGradingStudentEvidenceRequest({ ...identity, ...extra })).toBe(false);
  });
});
