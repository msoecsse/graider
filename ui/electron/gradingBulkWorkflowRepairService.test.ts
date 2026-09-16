import { describe, expect, it, vi } from "vitest";
import { repairGradingWorkflowsForAssignment } from "./gradingBulkWorkflowRepairService.js";

const request = {
  courseFolderId: "course",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  userDataPath: "/trusted/user",
  confirmed: true
};
const scope = {
  status: "success" as const,
  sections: ["001"],
  students: [
    { studentId: "ada", githubUsername: "ada", section: "001" },
    { studentId: "ada-duplicate", githubUsername: "ada2", section: "001" },
    { studentId: "grace", githubUsername: "grace", section: "001" }
  ],
  errors: []
};
const prepared = (studentId: string, name: string) => ({
  status: "success" as const,
  value: {
    studentId,
    repository: { owner: "trusted-org", name },
    grading: { enabled: true },
    submissionCommitSha: "0123456789abcdef0123456789abcdef01234567"
  }
});

describe("bulk grading workflow repair", () => {
  it("keeps an existing canonical grading-state SHA and does not read local HEAD", async () => {
    const prepare = vi.fn(() => prepared("ada", "ada-repo"));
    const readLocalHead = vi.fn();
    const execute = vi.fn().mockResolvedValue({
      status: "success",
      result: {
        workflow: { status: "already_current" },
        dispatch: { status: "dispatched" },
        diagnostics: []
      }
    });
    await repairGradingWorkflowsForAssignment(request, {
      resolveFacultyScope: () => ({ ...scope, students: [scope.students[0]!] }),
      resolveToken: async () => ({ status: "success", token: "token" }),
      loadBackend: () => ({
        prepareGradingStudentWorkflowRepairContext: prepare,
        executePreparedGradingStudentWorkflowRepair: execute
      }),
      readLocalHead
    });
    expect(readLocalHead).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ submissionCommitSha: "0123456789abcdef0123456789abcdef01234567" }),
      "token",
      true
    );
  });

  it("does not prepare, write, or dispatch when unconfirmed", async () => {
    const loadBackend = vi.fn();
    await expect(
      repairGradingWorkflowsForAssignment(
        { ...request, confirmed: false },
        { resolveFacultyScope: () => scope, loadBackend }
      )
    ).resolves.toMatchObject({ status: "unconfirmed" });
    expect(loadBackend).not.toHaveBeenCalled();
  });

  it("deduplicates authoritative mappings and continues after a repository failure", async () => {
    const prepare = vi.fn(({ studentId }: { studentId: string }) =>
      studentId === "grace" ? prepared(studentId, "grace-repo") : prepared(studentId, "ada-repo")
    );
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ status: "github_operation_failed" })
      .mockResolvedValueOnce({
        status: "success",
        result: {
          workflow: { status: "already_current" },
          dispatch: { status: "dispatched" },
          diagnostics: []
        }
      });
    const result = await repairGradingWorkflowsForAssignment(request, {
      resolveFacultyScope: () => scope,
      resolveToken: async () => ({ status: "success", token: "token" }),
      loadBackend: () => ({
        prepareGradingStudentWorkflowRepairContext: prepare,
        executePreparedGradingStudentWorkflowRepair: execute
      })
    });
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: "success",
      counts: { total: 2, succeeded: 1, failed: 1, alreadyCurrent: 1, dispatched: 1 }
    });
  });

  it("uses trusted local HEAD only when no canonical grading submission is available", async () => {
    const localSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const prepare = vi.fn((input: { currentSubmissionCommitSha?: string }) =>
      input.currentSubmissionCommitSha === undefined
        ? { status: "submission_commit_unavailable" as const, studentId: "ada" }
        : {
            ...prepared("ada", "ada-repo"),
            value: {
              ...prepared("ada", "ada-repo").value,
              submissionCommitSha: input.currentSubmissionCommitSha
            }
          }
    );
    const execute = vi.fn().mockResolvedValue({
      status: "success",
      result: {
        workflow: { status: "created" },
        dispatch: { status: "dispatched" },
        diagnostics: []
      }
    });
    await repairGradingWorkflowsForAssignment(
      { ...request, confirmed: true },
      {
        resolveFacultyScope: () => ({ ...scope, students: [scope.students[0]!] }),
        resolveToken: async () => ({ status: "success", token: "token" }),
        loadBackend: () => ({
          prepareGradingStudentWorkflowRepairContext: prepare,
          executePreparedGradingStudentWorkflowRepair: execute
        }),
        resolveLocalRepository: () => ({ status: "success", localPath: "/trusted/local-repo" }),
        readLocalHead: async () => ({ status: "success", submissionCommitSha: localSha })
      }
    );
    expect(prepare).toHaveBeenLastCalledWith(
      expect.objectContaining({ currentSubmissionCommitSha: localSha })
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ submissionCommitSha: localSha }),
      "token",
      true
    );
  });
});
