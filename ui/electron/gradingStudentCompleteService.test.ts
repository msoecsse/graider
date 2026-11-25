import { describe, expect, it, vi } from "vitest";
import * as authorization from "./managedCourseOperationContext.js";
import {
  createGradingStudentCompleteService,
  type MarkGradingStudentCompleteRequest
} from "./gradingStudentCompleteService.js";

const request: MarkGradingStudentCompleteRequest = {
  courseFolderId: "course",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "ada",
  userDataPath: "/trusted/user-data"
};
const scope = { status: "success" as const, students: [{ studentId: "ada", section: "001" }] };

describe("grading student complete service", () => {
  it.each(["submission_changed", "authorization_changed"])(
    "refuses undo after async %s revalidation",
    async (failure) => {
      const backend = vi.fn();
      const revalidate = vi.spyOn(authorization, "revalidateGradingSubmission");
      if (failure === "submission_changed") revalidate.mockResolvedValueOnce(false);
      else revalidate.mockRejectedValueOnce(new Error("Authorization changed"));
      const service = createGradingStudentCompleteService({
        resolveFacultyScope: vi.fn().mockReturnValue(scope),
        resolveRepository: vi.fn().mockReturnValue({ status: "success", localPath: "/repo/ada" }),
        readHead: vi
          .fn()
          .mockResolvedValue({ status: "success", submissionCommitSha: "a".repeat(40) }),
        loadBackend: backend
      });
      if (failure === "submission_changed")
        await expect(service({ ...request, undoZeroAndComplete: true })).resolves.toEqual({
          status: "submission_changed",
          studentId: "ada"
        });
      else
        await expect(service({ ...request, undoZeroAndComplete: true })).rejects.toThrow(
          "Authorization changed"
        );
      expect(backend).not.toHaveBeenCalled();
    }
  );

  it("authorizes before resolving the trusted repository and sends only trusted HEAD context", async () => {
    const resolveRepository = vi
      .fn()
      .mockReturnValue({ status: "success", localPath: "/repo/ada" });
    const readHead = vi
      .fn()
      .mockResolvedValue({ status: "success", submissionCommitSha: "a".repeat(40) });
    const mark = vi
      .fn()
      .mockReturnValue({ status: "success", studentId: "ada", gradingStatus: "complete" });
    const service = createGradingStudentCompleteService({
      resolveFacultyScope: vi.fn().mockReturnValue(scope),
      resolveRepository,
      readHead,
      loadBackend: () => ({ markGradingStudentCompleteContext: mark })
    });
    await expect(service(request)).resolves.toEqual({
      status: "success",
      studentId: "ada",
      gradingStatus: "complete"
    });
    await service({ ...request, setScoreToZero: true });
    expect(mark).toHaveBeenLastCalledWith({
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId: request.studentId,
      currentSubmissionCommitSha: "a".repeat(40),
      setScoreToZero: true
    });
    await service({ ...request, undoZeroAndComplete: true });
    expect(mark).toHaveBeenLastCalledWith({
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId: request.studentId,
      currentSubmissionCommitSha: "a".repeat(40),
      undoZeroAndComplete: true
    });
    expect(resolveRepository).toHaveBeenCalledWith(request);
    expect(readHead).toHaveBeenCalledWith("/repo/ada");
    expect(mark).toHaveBeenCalledWith({
      courseFolderPath: "/trusted/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada",
      currentSubmissionCommitSha: "a".repeat(40)
    });
  });

  it.each([false, true])(
    "fails closed for inaccessible students before repository or HEAD access (undo: %s)",
    async (undoZeroAndComplete) => {
      const resolveRepository = vi.fn();
      const readHead = vi.fn();
      const service = createGradingStudentCompleteService({
        resolveFacultyScope: vi.fn().mockReturnValue({ status: "success", students: [] }),
        resolveRepository,
        readHead,
        loadBackend: vi.fn()
      });
      await expect(service({ ...request, undoZeroAndComplete })).resolves.toEqual({
        status: "student_not_accessible"
      });
      expect(resolveRepository).not.toHaveBeenCalled();
      expect(readHead).not.toHaveBeenCalled();
    }
  );

  it("returns repository and HEAD failures without backend access", async () => {
    for (const failure of ["repository_not_recorded", "repository_unavailable"] as const) {
      const backend = vi.fn();
      const service = createGradingStudentCompleteService({
        resolveFacultyScope: vi.fn().mockReturnValue(scope),
        resolveRepository: vi.fn().mockReturnValue({ status: failure }),
        readHead: vi.fn(),
        loadBackend: backend
      });
      await expect(service(request)).resolves.toEqual({ status: failure });
      expect(backend).not.toHaveBeenCalled();
    }
    const backend = vi.fn();
    const service = createGradingStudentCompleteService({
      resolveFacultyScope: vi.fn().mockReturnValue(scope),
      resolveRepository: vi.fn().mockReturnValue({ status: "success", localPath: "/repo/ada" }),
      readHead: vi.fn().mockResolvedValue({ status: "submission_commit_unavailable" }),
      loadBackend: backend
    });
    await expect(service(request)).resolves.toEqual({ status: "submission_commit_unavailable" });
    expect(backend).not.toHaveBeenCalled();
  });
});
