import { describe, expect, it, vi } from "vitest";
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

  it("fails closed for inaccessible students before repository or HEAD access", async () => {
    const resolveRepository = vi.fn();
    const readHead = vi.fn();
    const service = createGradingStudentCompleteService({
      resolveFacultyScope: vi.fn().mockReturnValue({ status: "success", students: [] }),
      resolveRepository,
      readHead,
      loadBackend: vi.fn()
    });
    await expect(service(request)).resolves.toEqual({ status: "student_not_accessible" });
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(readHead).not.toHaveBeenCalled();
  });

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
