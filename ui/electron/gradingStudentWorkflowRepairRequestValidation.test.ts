import { describe, expect, it } from "vitest";
import { isGradingStudentWorkflowRepairRequest } from "./gradingStudentViewStateRequestValidation.js";

const request = {
  courseFolderId: "course",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "ada",
  confirmed: true
};

describe("grading student workflow repair request validation", () => {
  it("accepts only trusted grading identity and confirmation", () => {
    expect(isGradingStudentWorkflowRepairRequest(request)).toBe(true);
    expect(isGradingStudentWorkflowRepairRequest({ ...request, confirmed: "yes" })).toBe(false);
    expect(isGradingStudentWorkflowRepairRequest({ ...request, owner: "attacker" })).toBe(false);
    expect(isGradingStudentWorkflowRepairRequest({ ...request, repo: "other" })).toBe(false);
    expect(isGradingStudentWorkflowRepairRequest({ ...request, defaultBranch: "evil" })).toBe(
      false
    );
    expect(isGradingStudentWorkflowRepairRequest({ ...request, grading: {} })).toBe(false);
    expect(
      isGradingStudentWorkflowRepairRequest({
        ...request,
        submissionCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })
    ).toBe(false);
  });
});
