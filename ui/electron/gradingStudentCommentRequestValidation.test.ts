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
  it("accepts a title, body, or both and rejects empty content", () => {
    const request = {
      ...identity,
      comment: { id: "comment", title: "Naming", text: "Use a clearer name.", deduction: -1 }
    };
    expect(isAddGradingStudentCommentRequest(request)).toBe(true);
    for (const comment of [
      { id: "title", title: "Naming", text: "Feedback", deduction: -1 },
      { id: "title-only", title: "Naming", text: "", deduction: -1 },
      { id: "body-only", text: "Feedback", deduction: -1 }
    ])
      expect(isAddGradingStudentCommentRequest({ ...identity, comment })).toBe(true);
    for (const comment of [
      { id: "empty", title: "", text: "", deduction: -1 },
      { id: "whitespace", title: "  \n", text: " \t ", deduction: -1 },
      { id: "missing-content", text: "", deduction: -1 }
    ])
      expect(isAddGradingStudentCommentRequest({ ...identity, comment })).toBe(false);
    expect(isAddGradingStudentCommentRequest({ ...request, evidence: { status: "success" } })).toBe(
      false
    );
  });
});

it("accepts an untitled duplicate only with a valid source identity and rejects forged metadata", () => {
  const request = {
    ...identity,
    duplicateOfCommentId: "original",
    comment: { id: "copy", text: "", deduction: 0 }
  };
  expect(isAddGradingStudentCommentRequest(request)).toBe(true);
  expect(isAddGradingStudentCommentRequest({ ...request, duplicateOfCommentId: " " })).toBe(false);
  expect(isAddGradingStudentCommentRequest({ ...request, duplicateOfCommentId: undefined })).toBe(
    false
  );
  expect(
    isAddGradingStudentCommentRequest({
      ...request,
      comment: { ...request.comment, sourceAnchor: { status: "stale" } }
    })
  ).toBe(false);
  expect(
    isAddGradingStudentCommentRequest({
      ...identity,
      comment: { id: "tags", title: "Naming", text: "Body", deduction: 1, tags: ["design"] }
    })
  ).toBe(true);
  expect(
    isAddGradingStudentCommentRequest({
      ...identity,
      comment: { id: "tags", title: "Naming", text: "Body", deduction: 1, tags: [42] }
    })
  ).toBe(false);
});
