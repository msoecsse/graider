import { describe, expect, it, vi } from "vitest";
import { createGradingStudentCommitHistoryService } from "./gradingStudentCommitHistoryService.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const ANCHORED_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
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
const commits = [
  { sha: ANCHORED_SHA, committedAt: "2026-09-11T10:15:30Z", message: "Student message" }
];

describe("grading student commit-history Electron service", () => {
  it.each(["assigned faculty", "co-faculty"])(
    "allows %s and resolves repository/SHA before local history",
    async () => {
      const order: string[] = [];
      const resolveSubmission = vi.fn(() => {
        order.push("submission");
        return {
          status: "success" as const,
          value: { studentId: "ada", submissionCommitSha: ANCHORED_SHA }
        };
      });
      const readHistory = vi.fn(() => {
        order.push("history");
        return Promise.resolve({ status: "success" as const, commits });
      });
      const resolveRepository = vi.fn(() => {
        order.push("repository");
        return { status: "success" as const, localPath: "/trusted/local" };
      });
      const service = createGradingStudentCommitHistoryService({
        resolveFacultyScope: () => {
          order.push("authorize");
          return authorized;
        },
        resolveRepository,
        readHead: () => {
          order.push("head");
          return Promise.resolve({ status: "success" as const, submissionCommitSha: SHA });
        },
        loadBackend: () => ({ resolveGradingSubmissionContext: resolveSubmission }),
        readHistory
      });

      await expect(service(request)).resolves.toEqual({
        status: "success",
        studentId: "ada",
        submissionCommitSha: ANCHORED_SHA,
        commits
      });
      expect(order).toEqual(["authorize", "repository", "head", "submission", "history"]);
      expect(resolveRepository).toHaveBeenCalledWith(request);
      expect(resolveSubmission).toHaveBeenCalledWith({
        courseFolderPath: "/trusted/course",
        termCode: "27s1",
        assignmentSlug: "lab1",
        studentId: "ada",
        currentSubmissionCommitSha: SHA
      });
      expect(readHistory).toHaveBeenCalledWith("/trusted/local", ANCHORED_SHA);
    }
  );

  it("blocks unauthorized students before repository or Git access", async () => {
    const resolveRepository = vi.fn();
    const readHead = vi.fn();
    const loadBackend = vi.fn();
    const readHistory = vi.fn();
    const service = createGradingStudentCommitHistoryService({
      resolveFacultyScope: () => ({ ...authorized, students: [] }),
      resolveRepository,
      readHead,
      loadBackend,
      readHistory
    });
    await expect(service(request)).resolves.toEqual({ status: "student_not_accessible" });
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(readHead).not.toHaveBeenCalled();
    expect(loadBackend).not.toHaveBeenCalled();
    expect(readHistory).not.toHaveBeenCalled();
  });

  it("returns safe local repository/HEAD failures without cloning, fetching, or loading state", async () => {
    const readHead = vi.fn();
    const loadBackend = vi.fn();
    const readHistory = vi.fn();
    const missing = createGradingStudentCommitHistoryService({
      resolveFacultyScope: () => authorized,
      resolveRepository: () => ({ status: "repository_not_recorded" }),
      readHead,
      loadBackend,
      readHistory
    });
    await expect(missing(request)).resolves.toEqual({ status: "repository_not_recorded" });
    expect(readHead).not.toHaveBeenCalled();
    expect(loadBackend).not.toHaveBeenCalled();
    expect(readHistory).not.toHaveBeenCalled();

    const noHead = createGradingStudentCommitHistoryService({
      resolveFacultyScope: () => authorized,
      resolveRepository: () => ({ status: "success", localPath: "/trusted/local" }),
      readHead: () => Promise.resolve({ status: "submission_commit_unavailable" }),
      loadBackend,
      readHistory
    });
    await expect(noHead(request)).resolves.toEqual({ status: "submission_commit_unavailable" });
  });

  it("preserves submission_changed and never reads history for another SHA", async () => {
    const readHistory = vi.fn();
    const service = createGradingStudentCommitHistoryService({
      resolveFacultyScope: () => authorized,
      resolveRepository: () => ({ status: "success", localPath: "/trusted/local" }),
      readHead: () => Promise.resolve({ status: "success", submissionCommitSha: SHA }),
      loadBackend: () => ({
        resolveGradingSubmissionContext: () => ({ status: "submission_changed", studentId: "ada" })
      }),
      readHistory
    });
    await expect(service(request)).resolves.toEqual({
      status: "submission_changed",
      studentId: "ada"
    });
    expect(readHistory).not.toHaveBeenCalled();
  });

  it("whitelists commits and maps Git failures without paths, stderr, or commands", async () => {
    const base = {
      resolveFacultyScope: () => authorized,
      resolveRepository: () => ({ status: "success" as const, localPath: "/private/student" }),
      readHead: () => Promise.resolve({ status: "success" as const, submissionCommitSha: SHA }),
      loadBackend: () => ({
        resolveGradingSubmissionContext: () => ({
          status: "success" as const,
          value: { studentId: "ada", submissionCommitSha: SHA }
        })
      })
    };
    const service = createGradingStudentCommitHistoryService({
      ...base,
      readHistory: () =>
        Promise.resolve({
          status: "success",
          commits: [
            {
              ...commits[0],
              raw: "stderr /private/student",
              authorEmail: "unneeded@example.edu"
            }
          ]
        })
    });
    const result = await service(request);
    expect(result).toEqual({
      status: "success",
      studentId: "ada",
      submissionCommitSha: SHA,
      commits
    });
    expect(JSON.stringify(result)).not.toContain("/private/student");
    expect(JSON.stringify(result)).not.toContain("authorEmail");

    const failed = createGradingStudentCommitHistoryService({
      ...base,
      readHistory: () => Promise.resolve({ status: "commit_history_unavailable" })
    });
    await expect(failed(request)).resolves.toEqual({
      status: "commit_history_unavailable",
      studentId: "ada"
    });
  });
});
