import { describe, expect, it, vi } from "vitest";
import { createGradingStudentManualAdjustmentService } from "../../../ui/electron/gradingStudentManualAdjustmentService.js";

const baseRequest = {
  courseFolderId: "course",
  courseFolderPath: "/registered/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "student",
  userDataPath: "/user-data"
};
const GIT_SHA_LENGTH = 40;
const SHA = "a".repeat(GIT_SHA_LENGTH);

const facultyScope = () => ({
  status: "success" as const,
  sections: ["001"],
  students: [{ studentId: "student", githubUsername: "github", section: "001" }],
  errors: []
});

describe("grading student manual-adjustment production service", () => {
  it("authorizes student access before repository, HEAD, or backend access", async () => {
    const resolveRepository = vi.fn();
    const readHead = vi.fn();
    const loadBackend = vi.fn();
    const service = createGradingStudentManualAdjustmentService({
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
    await expect(
      service.add({
        ...baseRequest,
        adjustment: { id: "adjustment", rubricCategoryId: "design", amount: -1 }
      })
    ).resolves.toEqual({ status: "student_not_accessible" });
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(readHead).not.toHaveBeenCalled();
    expect(loadBackend).not.toHaveBeenCalled();
  });

  it("preserves faculty, locator, and HEAD failures without loading the backend", async () => {
    const loadBackend = vi.fn();
    for (const status of [
      "faculty_identity_required",
      "no_assigned_sections",
      "roster_error",
      "term_config_error"
    ] as const) {
      const facultyFailure = createGradingStudentManualAdjustmentService({
        resolveFacultyScope: () => ({ status, sections: [], students: [], errors: [] }),
        loadBackend
      });
      await expect(
        facultyFailure.delete({ ...baseRequest, adjustmentId: "adjustment" })
      ).resolves.toEqual({ status });
    }

    for (const status of [
      "repository_not_recorded",
      "repository_unavailable",
      "registry_error"
    ] as const) {
      const repositoryFailure = createGradingStudentManualAdjustmentService({
        resolveFacultyScope: facultyScope,
        resolveRepository: () => ({ status }),
        loadBackend
      });
      await expect(
        repositoryFailure.edit({
          ...baseRequest,
          adjustmentId: "adjustment",
          replacement: { rubricCategoryId: "design", amount: 1 }
        })
      ).resolves.toEqual({ status });
    }

    const unavailableHead = createGradingStudentManualAdjustmentService({
      resolveFacultyScope: facultyScope,
      resolveRepository: () => ({ status: "success", localPath: "/trusted/repository" }),
      readHead: () => Promise.resolve({ status: "submission_commit_unavailable" }),
      loadBackend
    });
    await expect(
      unavailableHead.add({
        ...baseRequest,
        adjustment: { id: "adjustment", rubricCategoryId: "design", amount: -1 }
      })
    ).resolves.toEqual({ status: "submission_commit_unavailable" });
    expect(loadBackend).not.toHaveBeenCalled();
  });

  it("dispatches narrow mutations with only the trusted local HEAD added", async () => {
    const backend = {
      addGradingStudentManualAdjustmentContext: vi.fn().mockReturnValue({
        status: "success",
        studentId: "student",
        gradingStatus: "in_progress",
        manualAdjustments: []
      }),
      editGradingStudentManualAdjustmentContext: vi.fn().mockReturnValue({
        status: "success",
        studentId: "student",
        gradingStatus: "complete",
        manualAdjustments: []
      }),
      deleteGradingStudentManualAdjustmentContext: vi.fn().mockReturnValue({
        status: "success",
        studentId: "student",
        gradingStatus: "complete",
        manualAdjustments: []
      })
    };
    const service = createGradingStudentManualAdjustmentService({
      resolveFacultyScope: facultyScope,
      resolveRepository: () => ({ status: "success", localPath: "/trusted/repository" }),
      readHead: () => Promise.resolve({ status: "success", submissionCommitSha: SHA }),
      loadBackend: () => backend
    });
    const adjustment = {
      id: "adjustment",
      rubricCategoryId: "design",
      amount: -1,
      note: "Manual deduction"
    };
    const added = await service.add({ ...baseRequest, adjustment });
    await service.edit({
      ...baseRequest,
      adjustmentId: "adjustment",
      replacement: { rubricCategoryId: "correctness", amount: 2 }
    });
    await service.delete({ ...baseRequest, adjustmentId: "adjustment" });

    expect(added).toEqual({
      status: "success",
      studentId: "student",
      gradingStatus: "in_progress",
      manualAdjustments: []
    });
    expect(added).not.toHaveProperty("submissionCommitSha");
    expect(added).not.toHaveProperty("repositoryPath");

    const trustedIdentity = {
      courseFolderPath: "/registered/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "student",
      currentSubmissionCommitSha: SHA
    };
    expect(backend.addGradingStudentManualAdjustmentContext).toHaveBeenCalledWith(
      trustedIdentity,
      adjustment
    );
    expect(backend.editGradingStudentManualAdjustmentContext).toHaveBeenCalledWith(
      trustedIdentity,
      "adjustment",
      { rubricCategoryId: "correctness", amount: 2 }
    );
    expect(backend.deleteGradingStudentManualAdjustmentContext).toHaveBeenCalledWith(
      trustedIdentity,
      "adjustment"
    );
  });
});
