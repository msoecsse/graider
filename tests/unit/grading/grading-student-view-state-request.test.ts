import { describe, expect, it } from "vitest";
import {
  isAddGradingStudentCommentRequest,
  isAddGradingStudentManualAdjustmentRequest,
  isDeleteGradingStudentCommentRequest,
  isDeleteGradingStudentManualAdjustmentRequest,
  isEditGradingStudentCommentRequest,
  isEditGradingStudentManualAdjustmentRequest,
  isGradingStudentViewStateRequest,
  isLoadGradingStudentSourceRequest,
  isSaveGradingStudentViewStateRequest
} from "../../../ui/electron/gradingStudentViewStateRequestValidation.js";
import { isPrepareGradingWorkspaceRequest } from "../../../ui/electron/gradingWorkspaceRequestValidation.js";

const identity = {
  courseFolderId: "course",
  courseFolderPath: "/registered/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "student"
};
const viewState = {
  scrollTop: 20,
  cursor: { file: "src/Main.java", line: 2, column: 3 }
};
const selection = {
  file: "src/Main.java",
  startLine: 2,
  startColumn: 3,
  endLine: 3,
  endColumn: 2
};
const GIT_SHA_LENGTH = 40;

describe("grading student view-state IPC request validation", () => {
  it("accepts only canonical identity and canonical viewState", () => {
    expect(isGradingStudentViewStateRequest(identity)).toBe(true);
    expect(isLoadGradingStudentSourceRequest(identity)).toBe(true);
    expect(isSaveGradingStudentViewStateRequest({ ...identity, viewState })).toBe(true);
    expect(
      isSaveGradingStudentViewStateRequest({
        ...identity,
        viewState: { ...viewState, selection }
      })
    ).toBe(true);
  });

  it("accepts only narrow applied-comment mutations", () => {
    const comment = { id: "comment", title: "Style", text: "Feedback", deduction: -1 };
    expect(isAddGradingStudentCommentRequest({ ...identity, comment })).toBe(true);
    expect(
      isEditGradingStudentCommentRequest({
        ...identity,
        commentId: "comment",
        replacement: { text: "Updated", deduction: -2 }
      })
    ).toBe(true);
    expect(isDeleteGradingStudentCommentRequest({ ...identity, commentId: "comment" })).toBe(true);
    for (const extra of [
      { repositoryPath: "/other/repository" },
      { githubUsername: "someone" },
      { submissionCommitSha: "b".repeat(GIT_SHA_LENGTH) },
      { gradingStatus: "published" },
      { gradingState: {} }
    ]) {
      expect(isAddGradingStudentCommentRequest({ ...identity, comment, ...extra })).toBe(false);
      expect(
        isEditGradingStudentCommentRequest({
          ...identity,
          commentId: "comment",
          replacement: { text: "Updated", deduction: -2 },
          ...extra
        })
      ).toBe(false);
      expect(
        isDeleteGradingStudentCommentRequest({ ...identity, commentId: "comment", ...extra })
      ).toBe(false);
    }
    expect(
      isAddGradingStudentCommentRequest({
        ...identity,
        comment: {
          ...comment,
          sourceLocation: { file: "/tmp/Main.java", startLine: 1, endLine: 1 }
        }
      })
    ).toBe(false);
  });

  it("accepts only narrow manual-adjustment mutations", () => {
    const adjustment = {
      id: "adjustment",
      rubricCategoryId: "design",
      amount: -1,
      note: "Manual deduction"
    };
    expect(isAddGradingStudentManualAdjustmentRequest({ ...identity, adjustment })).toBe(true);
    expect(
      isEditGradingStudentManualAdjustmentRequest({
        ...identity,
        adjustmentId: "adjustment",
        replacement: { rubricCategoryId: "correctness", amount: 2 }
      })
    ).toBe(true);
    expect(
      isDeleteGradingStudentManualAdjustmentRequest({
        ...identity,
        adjustmentId: "adjustment"
      })
    ).toBe(true);
    expect(
      isAddGradingStudentManualAdjustmentRequest({
        ...identity,
        adjustment: { ...adjustment, note: undefined }
      })
    ).toBe(true);
    for (const extra of [
      { repositoryPath: "/other/repository" },
      { githubUsername: "someone" },
      { facultyUsername: "faculty" },
      { submissionCommitSha: "b".repeat(GIT_SHA_LENGTH) },
      { gradingStatus: "published" },
      { rubric: [] },
      { totalScore: 99 },
      { gradingState: {} }
    ]) {
      expect(
        isAddGradingStudentManualAdjustmentRequest({ ...identity, adjustment, ...extra })
      ).toBe(false);
      expect(
        isEditGradingStudentManualAdjustmentRequest({
          ...identity,
          adjustmentId: "adjustment",
          replacement: { rubricCategoryId: "design", amount: -2 },
          ...extra
        })
      ).toBe(false);
      expect(
        isDeleteGradingStudentManualAdjustmentRequest({
          ...identity,
          adjustmentId: "adjustment",
          ...extra
        })
      ).toBe(false);
    }
    expect(
      isAddGradingStudentManualAdjustmentRequest({
        ...identity,
        adjustment: { ...adjustment, amount: Number.POSITIVE_INFINITY }
      })
    ).toBe(false);
    expect(
      isAddGradingStudentManualAdjustmentRequest({
        ...identity,
        adjustment: { ...adjustment, rubricCategoryId: " " }
      })
    ).toBe(false);
    expect(
      isEditGradingStudentManualAdjustmentRequest({
        ...identity,
        adjustmentId: "adjustment",
        replacement: { rubricCategoryId: "design", amount: -1, id: "replacement-id" }
      })
    ).toBe(false);
  });

  it("rejects renderer-supplied paths, GitHub identity, SHA, status, or arbitrary state", () => {
    for (const extra of [
      { repositoryPath: "/other/repository" },
      { githubUsername: "someone" },
      { repositoryName: "other" },
      { submissionCommitSha: "b".repeat(GIT_SHA_LENGTH) },
      { gradingStatus: "published" },
      { gradingState: {} }
    ]) {
      expect(isGradingStudentViewStateRequest({ ...identity, ...extra })).toBe(false);
      expect(isLoadGradingStudentSourceRequest({ ...identity, ...extra })).toBe(false);
      expect(isSaveGradingStudentViewStateRequest({ ...identity, viewState, ...extra })).toBe(
        false
      );
    }
  });

  it("strictly validates grading workspace preparation without accepting trusted-side fields", () => {
    const workspaceIdentity = {
      courseFolderId: identity.courseFolderId,
      courseFolderPath: identity.courseFolderPath,
      termCode: identity.termCode,
      assignmentSlug: identity.assignmentSlug
    };
    expect(isPrepareGradingWorkspaceRequest(workspaceIdentity)).toBe(true);
    expect(isPrepareGradingWorkspaceRequest({ ...workspaceIdentity, studentId: "student" })).toBe(
      false
    );
    expect(
      isPrepareGradingWorkspaceRequest({ ...workspaceIdentity, repositoryPath: "/tmp/x" })
    ).toBe(false);
    expect(isPrepareGradingWorkspaceRequest({ ...workspaceIdentity, termCode: " " })).toBe(false);
  });

  it("rejects malformed viewState at the IPC boundary", () => {
    expect(
      isSaveGradingStudentViewStateRequest({
        ...identity,
        viewState: { ...viewState, scrollTop: -1 }
      })
    ).toBe(false);
    expect(
      isSaveGradingStudentViewStateRequest({
        ...identity,
        viewState: { ...viewState, combinedLine: 10 }
      })
    ).toBe(false);
    expect(
      isSaveGradingStudentViewStateRequest({
        ...identity,
        viewState: { ...viewState, selection: { file: "src/Main.java", startLine: 2 } }
      })
    ).toBe(false);
  });
});
