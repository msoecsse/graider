import { describe, expect, it, vi } from "vitest";
import { makeTestGitSha } from "../../test-git-sha.js";
import { createGradingStudentCommentService } from "../../../ui/electron/gradingStudentCommentService.js";

const request = {
  courseFolderId: "course",
  courseFolderPath: "/registered/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "student",
  userDataPath: "/user-data",
  comment: { id: "comment", text: "Feedback", deduction: -1 }
};

const trustedScope = () => ({
  status: "success" as const,
  sections: ["001"],
  students: [{ studentId: "student", githubUsername: "github", section: "001" }],
  errors: []
});

const trustedRepository = () => ({ status: "success" as const, localPath: "/trusted/repository" });

const trustedHead = () =>
  Promise.resolve({
    status: "success" as const,
    submissionCommitSha: makeTestGitSha("a")
  });

describe("grading student comment production service", () => {
  it("authorizes before repository, HEAD, or backend access", async () => {
    const resolveRepository = vi.fn();
    const readHead = vi.fn();
    const loadBackend = vi.fn();
    const service = createGradingStudentCommentService({
      resolveFacultyScope: () => ({
        status: "success",
        sections: ["001"],
        students: [],
        errors: []
      }),
      resolveRepository,
      readHead,
      loadBackend
    });
    await expect(service.add(request)).resolves.toEqual({ status: "student_not_accessible" });
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(readHead).not.toHaveBeenCalled();
    expect(loadBackend).not.toHaveBeenCalled();
  });

  it("propagates faculty and local trust failures without backend access", async () => {
    const backend = vi.fn();
    const identityRequired = createGradingStudentCommentService({
      resolveFacultyScope: () => ({
        status: "faculty_identity_required",
        sections: [],
        students: [],
        errors: []
      }),
      loadBackend: backend
    });
    await expect(identityRequired.add(request)).resolves.toEqual({
      status: "faculty_identity_required"
    });
    expect(backend).not.toHaveBeenCalled();

    const headFailure = createGradingStudentCommentService({
      resolveFacultyScope: () => ({
        status: "success",
        sections: ["001"],
        students: [{ studentId: "student", githubUsername: "github", section: "001" }],
        errors: []
      }),
      resolveRepository: () => ({ status: "success", localPath: "/trusted/repository" }),
      readHead: () => Promise.resolve({ status: "submission_commit_unavailable" as const }),
      loadBackend: backend
    });
    await expect(headFailure.add(request)).resolves.toEqual({
      status: "submission_commit_unavailable"
    });
    expect(backend).not.toHaveBeenCalled();
  });

  it("invokes the bundled add, edit, and delete contexts with positional mutation arguments", async () => {
    const addGradingStudentCommentContext = vi.fn(() => ({
      status: "success" as const,
      studentId: "student",
      gradingStatus: "in_progress" as const,
      appliedComments: [request.comment]
    }));
    const editGradingStudentCommentContext = vi.fn(() => ({
      status: "success" as const,
      studentId: "student",
      gradingStatus: "complete" as const,
      appliedComments: []
    }));
    const deleteGradingStudentCommentContext = vi.fn(() => ({
      status: "success" as const,
      studentId: "student",
      gradingStatus: "complete" as const,
      appliedComments: []
    }));
    const service = createGradingStudentCommentService({
      resolveFacultyScope: trustedScope,
      resolveRepository: trustedRepository,
      readHead: trustedHead,
      loadBackend: () => ({
        addGradingStudentCommentContext,
        editGradingStudentCommentContext,
        deleteGradingStudentCommentContext
      })
    });

    await expect(service.add(request)).resolves.toMatchObject({ status: "success" });
    await expect(
      service.edit({
        ...request,
        commentId: "comment",
        replacement: { text: "Updated feedback", deduction: -2 }
      })
    ).resolves.toMatchObject({ status: "success" });
    await expect(service.delete({ ...request, commentId: "comment" })).resolves.toMatchObject({
      status: "success"
    });

    const identity = {
      courseFolderPath: "/registered/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "student",
      currentSubmissionCommitSha: makeTestGitSha("a")
    };
    expect(addGradingStudentCommentContext).toHaveBeenCalledWith(identity, request.comment);
    expect(editGradingStudentCommentContext).toHaveBeenCalledWith(identity, "comment", {
      text: "Updated feedback",
      deduction: -2
    });
    expect(deleteGradingStudentCommentContext).toHaveBeenCalledWith(identity, "comment");
  });

  it("propagates typed bundled backend failures without reshaping them", async () => {
    const deleteGradingStudentCommentContext = vi.fn(() => ({
      status: "grading_state_error" as const,
      studentId: "student",
      code: "invalid_grading_state_json"
    }));
    const service = createGradingStudentCommentService({
      resolveFacultyScope: trustedScope,
      resolveRepository: trustedRepository,
      readHead: trustedHead,
      loadBackend: () => ({
        addGradingStudentCommentContext: vi.fn(),
        editGradingStudentCommentContext: vi.fn(),
        deleteGradingStudentCommentContext
      })
    });

    await expect(service.delete({ ...request, commentId: "comment" })).resolves.toEqual({
      status: "grading_state_error",
      studentId: "student",
      code: "invalid_grading_state_json"
    });
    expect(deleteGradingStudentCommentContext).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "student" }),
      "comment"
    );
  });
});
