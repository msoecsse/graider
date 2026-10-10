import type { GitHubClient } from "./githubClientProvider.js";
import { describe, expect, it, vi } from "vitest";
import { createGradingStudentWorkflowRepairService } from "./gradingStudentWorkflowRepairService.js";

const client = {} as GitHubClient;
const provideClient = vi.fn(() => client);

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
      provideClient,
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
        provideClient,
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
      provideClient,
      resolveFacultyScope: () => authorized,
      resolveToken: () => Promise.resolve({ status: "success", token: "secret" }),
      loadBackend: () => ({
        prepareGradingStudentWorkflowRepairContext: () => ({ status: "success", value: prepared }),
        executePreparedGradingStudentWorkflowRepair: execute
      })
    });

    await expect(service({ ...request, confirmed: false })).resolves.toEqual(ready);
    expect(provideClient).toHaveBeenCalledExactlyOnceWith("secret");
    expect(execute).toHaveBeenCalledWith(prepared, client, false);
    expect(execute.mock.calls[0]?.[1]).toBe(client);
  });

  it("falls back to trusted local HEAD for replace and run before resolving GitHub authentication", async () => {
    const localSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const retriedPrepared = { ...prepared, submissionCommitSha: localSha };
    const prepare = vi.fn((input: { currentSubmissionCommitSha?: string }) =>
      input.currentSubmissionCommitSha === undefined
        ? { status: "submission_commit_unavailable" as const, studentId: "ada" }
        : { status: "success" as const, value: retriedPrepared }
    );
    const resolveToken = vi.fn(async () => ({ status: "success" as const, token: "secret" }));
    const execute = vi.fn().mockResolvedValue(ready);
    const resolveLocalRepository = vi.fn(() => ({
      status: "success" as const,
      localPath: "/trusted/local-repository"
    }));
    const readLocalHead = vi.fn(async () => ({
      status: "success" as const,
      submissionCommitSha: localSha
    }));
    const service = createGradingStudentWorkflowRepairService({
      provideClient,
      resolveFacultyScope: () => authorized,
      resolveToken,
      loadBackend: () => ({
        prepareGradingStudentWorkflowRepairContext: prepare,
        executePreparedGradingStudentWorkflowRepair: execute
      }),
      resolveLocalRepository,
      readLocalHead
    });

    await expect(service({ ...request, runAfterReplacement: true })).resolves.toEqual(ready);
    expect(resolveLocalRepository).toHaveBeenCalledWith(
      "/trusted/user-data/student-repository-locators.json",
      {
        courseFolderId: "course",
        termCode: "27s1",
        assignmentSlug: "lab1",
        studentId: "ada"
      }
    );
    expect(readLocalHead).toHaveBeenCalledWith("/trusted/local-repository");
    expect(prepare).toHaveBeenLastCalledWith({
      courseFolderPath: "/trusted/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada",
      runAfterReplacement: true,
      currentSubmissionCommitSha: localSha
    });
    expect(resolveToken).toHaveBeenCalledTimes(1);
    expect(prepare.mock.invocationCallOrder[1]).toBeLessThan(
      resolveToken.mock.invocationCallOrder[0]
    );
    expect(execute).toHaveBeenCalledWith(retriedPrepared, client, true);
  });

  it("keeps replacement-only independent of local HEAD and submission SHA", async () => {
    const prepare = vi.fn(() => ({
      status: "success" as const,
      value: { ...prepared, submissionCommitSha: undefined }
    }));
    const resolveLocalRepository = vi.fn();
    const readLocalHead = vi.fn();
    const execute = vi.fn().mockResolvedValue(ready);
    const service = createGradingStudentWorkflowRepairService({
      provideClient,
      resolveFacultyScope: () => authorized,
      resolveToken: async () => ({ status: "success", token: "secret" }),
      loadBackend: () => ({
        prepareGradingStudentWorkflowRepairContext: prepare,
        executePreparedGradingStudentWorkflowRepair: execute
      }),
      resolveLocalRepository,
      readLocalHead
    });

    await expect(service({ ...request, runAfterReplacement: false })).resolves.toEqual(ready);
    expect(prepare).toHaveBeenCalledWith({
      courseFolderPath: "/trusted/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada",
      runAfterReplacement: false
    });
    expect(resolveLocalRepository).not.toHaveBeenCalled();
    expect(readLocalHead).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      { ...prepared, submissionCommitSha: undefined },
      client,
      true,
      {},
      false
    );
  });

  it.each(["repository_not_recorded", "repository_unavailable", "registry_error"] as const)(
    "returns local fallback %s without resolving GitHub authentication or mutating",
    async (status) => {
      const resolveToken = vi.fn();
      const execute = vi.fn();
      const service = createGradingStudentWorkflowRepairService({
        provideClient,
        resolveFacultyScope: () => authorized,
        resolveToken,
        loadBackend: () => ({
          prepareGradingStudentWorkflowRepairContext: () => ({
            status: "submission_commit_unavailable",
            studentId: "ada"
          }),
          executePreparedGradingStudentWorkflowRepair: execute
        }),
        resolveLocalRepository: () => ({ status }),
        readLocalHead: vi.fn()
      });

      await expect(service({ ...request, runAfterReplacement: true })).resolves.toEqual({
        status,
        studentId: "ada"
      });
      expect(resolveToken).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    }
  );

  it("returns submission_commit_unavailable when trusted local HEAD cannot be verified", async () => {
    const resolveToken = vi.fn();
    const execute = vi.fn();
    const service = createGradingStudentWorkflowRepairService({
      provideClient,
      resolveFacultyScope: () => authorized,
      resolveToken,
      loadBackend: () => ({
        prepareGradingStudentWorkflowRepairContext: () => ({
          status: "submission_commit_unavailable",
          studentId: "ada"
        }),
        executePreparedGradingStudentWorkflowRepair: execute
      }),
      resolveLocalRepository: () => ({ status: "success", localPath: "/trusted/local-repository" }),
      readLocalHead: async () => ({ status: "submission_commit_unavailable" })
    });

    await expect(service({ ...request, runAfterReplacement: true })).resolves.toEqual({
      status: "submission_commit_unavailable",
      studentId: "ada"
    });
    expect(resolveToken).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it("does not construct or forward a client after authentication failure", async () => {
    const provideClient = vi.fn();
    const execute = vi.fn();
    const service = createGradingStudentWorkflowRepairService({
      resolveFacultyScope: () => authorized,
      provideClient,
      resolveToken: async () => ({
        status: "failure",
        error: {
          code: "github_token_unavailable",
          message: "Sign in.",
          exitCode: null,
          stderrSnippet: null,
          stdoutSnippet: null
        }
      }),
      loadBackend: () => ({
        prepareGradingStudentWorkflowRepairContext: () => ({ status: "success", value: prepared }),
        executePreparedGradingStudentWorkflowRepair: execute
      })
    });
    await expect(service(request)).resolves.toMatchObject({ status: "github_auth_unavailable" });
    expect(provideClient).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
