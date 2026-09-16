import { describe, expect, it, vi } from "vitest";
import { createGradingStudentWorkflowRepairService } from "./gradingStudentWorkflowRepairService.js";

const request = {
  courseFolderId: "course",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "ada",
  confirmed: true,
  userDataPath: "/trusted/user-data"
};
const authorized = {
  status: "success" as const,
  sections: ["001"],
  students: [{ studentId: "ada", githubUsername: "ada-gh", section: "001" }],
  errors: []
};
const prepared = {
  studentId: "ada",
  repository: { owner: "trusted-org", name: "lab1-ada" },
  grading: { enabled: true, preset: "java-junit-checkstyle" },
  submissionCommitSha: "0123456789abcdef0123456789abcdef01234567"
};
const ready = {
  status: "ready" as const,
  studentId: "ada",
  repositoryFullName: "trusted-org/lab1-ada"
};

describe("grading student workflow repair Electron service", () => {
  it("rejects an inaccessible student before preparing or mutating", async () => {
    const prepare = vi.fn();
    const execute = vi.fn();
    const service = createGradingStudentWorkflowRepairService({
      resolveFacultyScope: () => ({ ...authorized, students: [] }),
      resolveToken: vi.fn(),
      loadBackend: () => ({
        prepareGradingStudentWorkflowRepairContext: prepare,
        executePreparedGradingStudentWorkflowRepair: execute
      })
    });

    await expect(service(request)).resolves.toEqual({
      status: "student_not_accessible",
      studentId: "ada"
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["repository_not_recorded", "grading_not_eligible"] as const)(
    "returns safe %s preparation without resolving GitHub authentication",
    async (status) => {
      const resolveToken = vi.fn();
      const execute = vi.fn();
      const service = createGradingStudentWorkflowRepairService({
        resolveFacultyScope: () => authorized,
        resolveToken,
        loadBackend: () => ({
          prepareGradingStudentWorkflowRepairContext: () => ({ status, studentId: "ada" }),
          executePreparedGradingStudentWorkflowRepair: execute
        })
      });

      await expect(service(request)).resolves.toEqual({ status, studentId: "ada" });
      expect(resolveToken).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    }
  );

  it("passes trusted prepared context, token, and confirmation to the backend", async () => {
    const execute = vi.fn().mockResolvedValue(ready);
    const service = createGradingStudentWorkflowRepairService({
      resolveFacultyScope: () => authorized,
      resolveToken: () => Promise.resolve({ status: "success", token: "secret" }),
      loadBackend: () => ({
        prepareGradingStudentWorkflowRepairContext: () => ({ status: "success", value: prepared }),
        executePreparedGradingStudentWorkflowRepair: execute
      })
    });

    await expect(service({ ...request, confirmed: false })).resolves.toEqual(ready);
    expect(execute).toHaveBeenCalledWith(prepared, "secret", false);
  });
});
