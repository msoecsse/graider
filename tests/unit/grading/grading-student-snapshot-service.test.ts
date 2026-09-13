import { describe, expect, it, vi } from "vitest";
import { makeTestGitSha } from "../../test-git-sha.js";
import { createGradingStudentSnapshotService } from "../../../ui/electron/gradingStudentSnapshotService.js";

const SHA = makeTestGitSha("a");
const request = {
  courseFolderId: "course",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab04",
  studentId: "jones",
  userDataPath: "/trusted/user-data"
};

describe("grading student snapshot production service", () => {
  it("rejects inaccessible faculty before repository, HEAD, or state access", async () => {
    const resolveRepository = vi.fn();
    const readHead = vi.fn();
    const loadBackend = vi.fn();
    const inaccessible = createGradingStudentSnapshotService({
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
    await expect(inaccessible(request)).resolves.toEqual({ status: "student_not_accessible" });
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(readHead).not.toHaveBeenCalled();
    expect(loadBackend).not.toHaveBeenCalled();

    const identityRequired = createGradingStudentSnapshotService({
      resolveFacultyScope: () => ({
        status: "faculty_identity_required",
        sections: [],
        students: [],
        errors: []
      }),
      resolveRepository,
      readHead,
      loadBackend
    });
    await expect(identityRequired(request)).resolves.toEqual({
      status: "faculty_identity_required"
    });
    expect(resolveRepository).not.toHaveBeenCalled();
  });

  it("propagates locator/HEAD failures and passes only trusted HEAD to core", async () => {
    const authorized = () => ({
      status: "success" as const,
      sections: ["001"],
      students: [{ studentId: "jones", githubUsername: "github", section: "001" }],
      errors: []
    });
    const missing = createGradingStudentSnapshotService({
      resolveFacultyScope: authorized,
      resolveRepository: () => ({ status: "repository_not_recorded" })
    });
    await expect(missing(request)).resolves.toEqual({ status: "repository_not_recorded" });

    const headFailure = createGradingStudentSnapshotService({
      resolveFacultyScope: authorized,
      resolveRepository: () => ({ status: "success", localPath: "/trusted/repository" }),
      readHead: () => Promise.resolve({ status: "submission_commit_unavailable" as const })
    });
    await expect(headFailure(request)).resolves.toEqual({
      status: "submission_commit_unavailable"
    });

    const loadContext = vi.fn(() => ({
      status: "success" as const,
      studentId: "jones",
      gradingStatus: "not_started" as const,
      appliedComments: [],
      manualAdjustments: [],
      grade: {
        pointsPossible: 0,
        totalScore: 0,
        categories: [],
        uncategorizedCommentAdjustmentTotal: 0
      }
    }));
    const backend = vi.fn(() => ({ loadGradingStudentSnapshotContext: loadContext }));
    const success = createGradingStudentSnapshotService({
      resolveFacultyScope: authorized,
      resolveRepository: () => ({ status: "success", localPath: "/trusted/repository" }),
      readHead: () => Promise.resolve({ status: "success" as const, submissionCommitSha: SHA }),
      loadBackend: backend
    });
    await expect(success(request)).resolves.toMatchObject({ status: "success" });
    expect(loadContext).toHaveBeenCalledWith({
      courseFolderPath: "/trusted/course",
      termCode: "27s1",
      assignmentSlug: "lab04",
      studentId: "jones",
      currentSubmissionCommitSha: SHA
    });
  });
});
