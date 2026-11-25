import { describe, expect, it, vi } from "vitest";
import { createAssignmentRepositoryUpdateService } from "./assignmentRepositoryUpdateService.js";

const request = {
  courseFolderId: "course",
  courseFolderPath: "/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  userDataPath: "/user"
};
const scope = (studentIds = ["ada", "grace", "linus"]) => ({
  status: "success" as const,
  sections: ["001"],
  students: studentIds.map((studentId) => ({
    studentId,
    githubUsername: studentId,
    section: "001"
  })),
  errors: []
});

describe("assignment repository pull", () => {
  it("waits for each student's update before starting the next", async () => {
    let release!: (value: { status: string }) => void;
    const updateStudent = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ status: string }>((resolve) => {
            release = resolve;
          })
      )
      .mockResolvedValue({ status: "unchanged" });
    const pending = createAssignmentRepositoryUpdateService({
      resolveFacultyScope: () => scope(["ada", "grace"]),
      updateStudent
    })(request);
    expect(updateStudent).toHaveBeenCalledTimes(1);
    release({ status: "unchanged" });
    await expect(pending).resolves.toMatchObject({ counts: { unchanged: 2 } });
    expect(updateStudent).toHaveBeenCalledTimes(2);
  });

  it("runs trusted updates sequentially, continues failures and reports every scoped member", async () => {
    const updateStudent = vi
      .fn()
      .mockResolvedValueOnce({ status: "success" })
      .mockRejectedValueOnce(new Error("secret transport diagnostic"))
      .mockResolvedValueOnce({ status: "repository_not_recorded" });
    const progress = vi.fn();
    const update = createAssignmentRepositoryUpdateService({
      resolveFacultyScope: () => scope(),
      updateStudent
    });
    const result = await update(request, progress);
    expect(updateStudent.mock.calls.map(([value]) => value.studentId)).toEqual([
      "ada",
      "grace",
      "linus"
    ]);
    expect(result.counts).toEqual({
      total: 3,
      updated: 1,
      unchanged: 0,
      failure: 1,
      notDownloaded: 1
    });
    expect(result.results.map((row) => row.outcome)).toEqual([
      "updated",
      "failure",
      "not_downloaded"
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(progress.mock.calls.map(([value]) => value.completed)).toEqual([0, 1, 2, 3]);
    expect(result.results[1]?.message).toMatch(/retry/i);
  });

  it("rejects overlapping batches across service instances and releases ownership after completion", async () => {
    let release!: (value: { status: string }) => void;
    const updateStudent = vi.fn(
      () =>
        new Promise<{ status: string }>((resolve) => {
          release = resolve;
        })
    );
    const dependencies = { resolveFacultyScope: () => scope(["ada"]), updateStudent };
    const first = createAssignmentRepositoryUpdateService(dependencies)(request);
    await expect(
      createAssignmentRepositoryUpdateService(dependencies)(request)
    ).resolves.toMatchObject({ status: "already_running" });
    await expect(
      createAssignmentRepositoryUpdateService(dependencies)({
        ...request,
        courseFolderId: "same-source-alias"
      })
    ).resolves.toMatchObject({ status: "already_running" });
    release({ status: "unchanged" });
    await expect(first).resolves.toMatchObject({ counts: { unchanged: 1 } });
    await expect(
      createAssignmentRepositoryUpdateService({
        ...dependencies,
        updateStudent: vi.fn().mockResolvedValue({ status: "unchanged" })
      })(request)
    ).resolves.toMatchObject({ status: "success" });
  });

  it("keeps shared repository members separate so each grading state is reconciled by the trusted service", async () => {
    const updateStudent = vi.fn().mockResolvedValue({ status: "success" });
    const result = await createAssignmentRepositoryUpdateService({
      resolveFacultyScope: () => scope(["ada", "grace", "ada"]),
      updateStudent
    })(request, () => {
      throw new Error("view closed");
    });
    expect(updateStudent).toHaveBeenCalledTimes(2);
    expect(result.results.map((row) => row.studentId)).toEqual(["ada", "grace"]);
  });

  it("does no work when faculty scope is unavailable", async () => {
    const updateStudent = vi.fn();
    const result = await createAssignmentRepositoryUpdateService({
      resolveFacultyScope: () => ({ ...scope(), status: "faculty_identity_required" }),
      updateStudent
    })(request);
    expect(result.status).toBe("faculty_identity_required");
    expect(updateStudent).not.toHaveBeenCalled();
  });

  it("releases ownership when resolving faculty scope throws", async () => {
    await expect(
      createAssignmentRepositoryUpdateService({
        resolveFacultyScope: () => {
          throw new Error("unreadable roster");
        },
        updateStudent: vi.fn()
      })(request)
    ).rejects.toThrow("unreadable roster");
    await expect(
      createAssignmentRepositoryUpdateService({
        resolveFacultyScope: () => scope([]),
        updateStudent: vi.fn()
      })(request)
    ).resolves.toMatchObject({ status: "success", counts: { total: 0 } });
  });
});
