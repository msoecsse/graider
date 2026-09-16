import { describe, expect, it } from "vitest";
import { isAddGradingStudentCommentRequest } from "./gradingStudentViewStateRequestValidation.js";

const identity = {
  courseFolderId: "course",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "ada"
};

describe("grading student comment request validation", () => {
  it("requires a nonblank snapshot title for new comments and rejects unrelated fields", () => {
    const request = {
      ...identity,
      comment: { id: "comment", title: "Naming", text: "Use a clearer name.", deduction: -1 }
    };
    expect(isAddGradingStudentCommentRequest(request)).toBe(true);
    expect(
      isAddGradingStudentCommentRequest({
        ...identity,
        comment: { id: "comment", title: " ", text: "Use a clearer name.", deduction: -1 }
      })
    ).toBe(false);
    expect(isAddGradingStudentCommentRequest({ ...request, evidence: { status: "success" } })).toBe(
      false
    );
  });
});
