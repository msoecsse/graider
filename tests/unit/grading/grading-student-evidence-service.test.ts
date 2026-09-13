import { describe, expect, it, vi } from "vitest";
import { createGradingStudentEvidenceService } from "../../../ui/electron/gradingStudentEvidenceService.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const request = {
  courseFolderId: "course",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "ada",
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
  submissionCommitSha: SHA,
  repository: { owner: "trusted-org", repo: "lab1-ada" },
  grading: { enabled: true, mode: "preset", preset: "java-junit-checkstyle" }
};
const evidence = {
  metadata: {
    schemaVersion: 1 as const,
    submissionCommitSha: SHA,
    workflowRunId: "10",
    workflowRunAttempt: "2",
    compile: { outcome: "success" as const },
    junit: { outcome: "failure" as const },
    checkstyle: { outcome: "success" as const }
  },
  junit: {
    available: true,
    outcome: "failure" as const,
    summary: { total: 2, passed: 1, failed: 1, errors: 0, skipped: 0 },
    failures: [{ name: "fails", kind: "failure" as const, message: "expected" }]
  },
  checkstyle: {
    available: true,
    outcome: "success" as const,
    violationCount: 0,
    violations: []
  }
};

describe("grading student evidence Electron service", () => {
  it("authorizes before trusted repository/HEAD preparation and token/client retrieval", async () => {
    const order: string[] = [];
    const prepare = vi.fn(() => {
      order.push("prepare");
      return { status: "success" as const, value: prepared };
    });
    const retrieve = vi.fn(() => {
      order.push("retrieve");
      return Promise.resolve({
        status: "success" as const,
        value: { runId: 10, runAttempt: 2, artifactId: 20, evidence }
      });
    });
    const service = createGradingStudentEvidenceService({
      resolveFacultyScope: () => {
        order.push("authorize");
        return authorized;
      },
      resolveRepository: () => {
        order.push("repository");
        return { status: "success", localPath: "/trusted/local" };
      },
      readHead: () => {
        order.push("head");
        return Promise.resolve({ status: "success" as const, submissionCommitSha: SHA });
      },
      resolveToken: () => {
        order.push("token");
        return Promise.resolve({ status: "success" as const, token: "secret" });
      },
      loadBackend: () => ({
        prepareGradingStudentEvidenceContext: prepare,
        retrievePreparedGradingStudentEvidence: retrieve
      })
    });
    await expect(service(request)).resolves.toEqual({
      status: "success",
      studentId: "ada",
      submissionCommitSha: SHA,
      runId: 10,
      runAttempt: 2,
      evidence
    });
    expect(order).toEqual(["authorize", "repository", "head", "prepare", "token", "retrieve"]);
    expect(prepare).toHaveBeenCalledWith({
      courseFolderPath: "/trusted/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada",
      currentSubmissionCommitSha: SHA
    });
    expect(retrieve).toHaveBeenCalledWith(prepared, "secret");
  });

  it("allows assigned co-faculty and blocks inaccessible students before all repository/Actions work", async () => {
    const resolveRepository = vi.fn();
    const resolveToken = vi.fn();
    const loadBackend = vi.fn();
    const service = createGradingStudentEvidenceService({
      resolveFacultyScope: () => ({ ...authorized, students: [] }),
      resolveRepository,
      readHead: vi.fn(),
      resolveToken,
      loadBackend
    });
    await expect(service(request)).resolves.toEqual({ status: "student_not_accessible" });
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(resolveToken).not.toHaveBeenCalled();
    expect(loadBackend).not.toHaveBeenCalled();
  });

  it("does not resolve a token for ineligible grading and preserves local/state failures", async () => {
    const resolveToken = vi.fn();
    const backend = {
      prepareGradingStudentEvidenceContext: vi.fn().mockReturnValue({
        status: "not_applicable",
        studentId: "ada"
      }),
      retrievePreparedGradingStudentEvidence: vi.fn()
    };
    const service = createGradingStudentEvidenceService({
      resolveFacultyScope: () => authorized,
      resolveRepository: () => ({ status: "success", localPath: "/trusted/local" }),
      readHead: () => Promise.resolve({ status: "success", submissionCommitSha: SHA }),
      resolveToken,
      loadBackend: () => backend
    });
    await expect(service(request)).resolves.toEqual({ status: "not_applicable", studentId: "ada" });
    expect(resolveToken).not.toHaveBeenCalled();
    expect(backend.retrievePreparedGradingStudentEvidence).not.toHaveBeenCalled();

    const changed = createGradingStudentEvidenceService({
      resolveFacultyScope: () => authorized,
      resolveRepository: () => ({ status: "success", localPath: "/trusted/local" }),
      readHead: () => Promise.resolve({ status: "success", submissionCommitSha: SHA }),
      resolveToken,
      loadBackend: () => ({
        ...backend,
        prepareGradingStudentEvidenceContext: () => ({
          status: "submission_changed",
          studentId: "ada"
        })
      })
    });
    await expect(changed(request)).resolves.toEqual({
      status: "submission_changed",
      studentId: "ada"
    });
  });

  it("uses a persisted submission anchor when the local repository is unavailable", async () => {
    const prepare = vi.fn().mockReturnValue({ status: "success", value: prepared });
    const retrieve = vi.fn().mockResolvedValue({
      status: "success",
      value: { runId: 10, runAttempt: 2, artifactId: 20, evidence }
    });
    const readHead = vi.fn();
    const service = createGradingStudentEvidenceService({
      resolveFacultyScope: () => authorized,
      resolveRepository: () => ({ status: "repository_not_recorded" }),
      readHead,
      resolveToken: () => Promise.resolve({ status: "success", token: "secret" }),
      loadBackend: () => ({
        prepareGradingStudentEvidenceContext: prepare,
        retrievePreparedGradingStudentEvidence: retrieve
      })
    });

    await expect(service(request)).resolves.toMatchObject({
      status: "success",
      submissionCommitSha: SHA
    });
    expect(readHead).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledWith({
      courseFolderPath: "/trusted/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada"
    });
  });

  it("maps token and Slice 39 failures without exposing raw details", async () => {
    const base = {
      resolveFacultyScope: () => authorized,
      resolveRepository: () => ({ status: "success" as const, localPath: "/trusted/local" }),
      readHead: () => Promise.resolve({ status: "success" as const, submissionCommitSha: SHA })
    };
    const noToken = createGradingStudentEvidenceService({
      ...base,
      resolveToken: () =>
        Promise.resolve({
          status: "failure",
          error: {
            code: "github_token_unavailable",
            message: "secret detail",
            exitCode: null,
            stderrSnippet: null,
            stdoutSnippet: null
          }
        }),
      loadBackend: () => ({
        prepareGradingStudentEvidenceContext: () => ({ status: "success", value: prepared }),
        retrievePreparedGradingStudentEvidence: vi.fn()
      })
    });
    await expect(noToken(request)).resolves.toEqual({ status: "github_auth_unavailable" });

    const denied = createGradingStudentEvidenceService({
      ...base,
      resolveToken: () => Promise.resolve({ status: "success" as const, token: "secret" }),
      loadBackend: () => ({
        prepareGradingStudentEvidenceContext: () => ({ status: "success", value: prepared }),
        retrievePreparedGradingStudentEvidence: () =>
          Promise.resolve({
            status: "failure",
            error: { code: "actions_forbidden" }
          })
      })
    });
    await expect(denied(request)).resolves.toEqual({
      status: "evidence_error",
      studentId: "ada",
      code: "actions_forbidden"
    });
  });

  it("whitelists the renderer DTO and maps unexpected retrieval exceptions safely", async () => {
    const base = {
      resolveFacultyScope: () => authorized,
      resolveRepository: () => ({ status: "success" as const, localPath: "/trusted/local" }),
      readHead: () => Promise.resolve({ status: "success" as const, submissionCommitSha: SHA }),
      resolveToken: () => Promise.resolve({ status: "success" as const, token: "secret" })
    };
    const withUnexpectedPayload = createGradingStudentEvidenceService({
      ...base,
      loadBackend: () => ({
        prepareGradingStudentEvidenceContext: () => ({ status: "success", value: prepared }),
        retrievePreparedGradingStudentEvidence: () =>
          Promise.resolve({
            status: "success",
            value: {
              runId: 10,
              runAttempt: 2,
              artifactId: 20,
              evidence: { ...evidence, rawXml: "<secret />", zipBytes: new Uint8Array([1]) }
            }
          })
      })
    });
    const result = await withUnexpectedPayload(request);
    expect(result).toMatchObject({ status: "success", studentId: "ada" });
    expect(JSON.stringify(result)).not.toContain("rawXml");
    expect(JSON.stringify(result)).not.toContain("zipBytes");
    expect(result).not.toHaveProperty("artifactId");
    expect(result).not.toHaveProperty("repository");

    const throwing = createGradingStudentEvidenceService({
      ...base,
      loadBackend: () => ({
        prepareGradingStudentEvidenceContext: () => ({ status: "success", value: prepared }),
        retrievePreparedGradingStudentEvidence: () =>
          Promise.reject(new Error("raw GitHub or parser detail"))
      })
    });
    await expect(throwing(request)).resolves.toEqual({
      status: "evidence_error",
      studentId: "ada",
      code: "evidence_retrieval_failed"
    });
  });
});
