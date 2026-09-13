import { describe, expect, it } from "vitest";
import { isBulkPublishGradingStudentReportsRequest } from "./gradingBulkReportPublicationRequestValidation.js";

const request = {
  courseFolderId: "course",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentIds: ["ada", "grace"]
};

describe("bulk grading report publication request validation", () => {
  it("accepts a nonempty unique canonical student selection", () => {
    expect(isBulkPublishGradingStudentReportsRequest(request)).toBe(true);
  });

  it.each([
    { studentIds: [] },
    { studentIds: ["ada", "ada"] },
    { studentIds: ["ada", ""] },
    { studentIds: "ada" },
    { reportPath: "grading/report.html" },
    { html: "<!doctype html>" },
    { repository: "attacker/repo" },
    { submissionCommitSha: "a".repeat(40) },
    { status: "complete" },
    { score: 100 },
    { evidence: {} },
    { history: [] },
    { workflow: "grade.yml" },
    { gitArguments: ["--all"] },
    { token: "secret" }
  ])("rejects invalid or additional fields: %j", (extra) => {
    expect(isBulkPublishGradingStudentReportsRequest({ ...request, ...extra })).toBe(false);
  });
});
