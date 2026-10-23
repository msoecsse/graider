import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadRecentGradingComments, recordRecentGradingComment } from "./recentGradingComments";
import { RECENT_COMMENT_LIMIT } from "./recentCommentLimit";
import { getLocalSettingsPath, saveCurrentFacultyMsoeUsername } from "./localSettings";
import { createGradingStudentCommentService } from "./gradingStudentCommentService";

const request = () => ({
  userDataPath: fs.mkdtempSync(path.join(os.tmpdir(), "graider-recent-")),
  courseFolderPath: "/course",
  termCode: "27s1",
  courseFolderId: "course",
  assignmentSlug: "lab",
  studentId: "ada"
});
describe("faculty-local reusable comment history", () => {
  it("persists only bounded IDs/times, keeps MRU order including reuse, and scopes faculty/course", () => {
    const identity = request();
    expect(loadRecentGradingComments(identity)).toEqual([]);
    const EXTRA_COMMENTS = 3;
    for (let index = 0; index < RECENT_COMMENT_LIMIT + EXTRA_COMMENTS; index += 1)
      recordRecentGradingComment(identity, `comment-${index}`);
    expect(loadRecentGradingComments(identity)).toHaveLength(RECENT_COMMENT_LIMIT);
    expect(loadRecentGradingComments(identity)[0]?.id).toBe(
      `comment-${RECENT_COMMENT_LIMIT + EXTRA_COMMENTS - 1}`
    );
    recordRecentGradingComment(identity, "comment-4");
    const reloaded = loadRecentGradingComments({ ...identity });
    expect(reloaded[0]).toEqual({ id: "comment-4", usedAt: expect.any(Number) });
    expect(new Set(reloaded.map((entry) => entry.id)).size).toBe(RECENT_COMMENT_LIMIT);
    expect(loadRecentGradingComments({ ...identity, courseFolderPath: "/other" })).toEqual([]);
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(identity.userDataPath), "other-faculty");
    expect(loadRecentGradingComments(identity)).toEqual([]);
    expect(fs.readdirSync(identity.userDataPath).sort()).toEqual([
      "local-settings.json",
      "recent-grading-comments"
    ]);
  });
  it("records successful library applications only; failures, edits and deletions leave recency alone", async () => {
    const identity = request();
    const success = {
      status: "success" as const,
      studentId: "ada",
      gradingStatus: "in_progress" as const,
      appliedComments: []
    };
    const add = vi.fn().mockReturnValue(success);
    const service = createGradingStudentCommentService({
      resolveFacultyScope: () => ({
        status: "success",
        sections: ["001"],
        students: [{ studentId: "ada", githubUsername: "ada", section: "001" }],
        errors: []
      }),
      resolveRepository: () => ({ status: "success", localPath: "/repo" }),
      readHead: async () => ({ status: "success", submissionCommitSha: "abc" }),
      loadBackend: () => ({
        addGradingStudentCommentContext: add,
        editGradingStudentCommentContext: () => success,
        deleteGradingStudentCommentContext: () => success
      })
    });
    const comment = { id: "applied", sourceCommentId: "library", text: "Feedback", deduction: 0 };
    await service.add({ ...identity, comment });
    expect(loadRecentGradingComments(identity).map((entry) => entry.id)).toEqual(["library"]);
    await service.edit({ ...identity, commentId: "applied", replacement: comment });
    await service.delete({ ...identity, commentId: "applied" });
    add.mockReturnValue({ status: "submission_changed", studentId: "ada" });
    await service.add({ ...identity, comment: { ...comment, sourceCommentId: "failed" } });
    expect(loadRecentGradingComments(identity).map((entry) => entry.id)).toEqual(["library"]);
  });
});

it("loads valid recent IDs with current definitions without publishing or modifying shared comments", async () => {
  const { createGradingCommentLibraryService } = await import("./gradingCommentLibraryService");
  const identity = request();
  const comments = [
    { id: "library", title: "Current title", text: "Current body", defaultDeduction: 0, tags: [] }
  ];
  const original = JSON.stringify(comments);
  const publish = vi.fn();
  recordRecentGradingComment(identity, "library");
  recordRecentGradingComment(identity, "deleted");
  const backend = {
    loadGradingCommentLibraryContext: () => ({ status: "success" as const, comments }),
    createGradingLibraryCommentContext: vi.fn(),
    editGradingLibraryCommentContext: vi.fn(),
    deleteGradingLibraryCommentContext: vi.fn()
  };
  const service = createGradingCommentLibraryService({
    resolveFacultyScope: () => ({ status: "success", sections: ["001"], students: [], errors: [] }),
    publishCourseChanges: publish,
    loadBackend: () => backend
  });
  expect(service.load(identity)).toEqual({
    status: "success",
    comments,
    recentCommentIds: ["library"]
  });
  expect(JSON.stringify(comments)).toBe(original);
  expect(publish).not.toHaveBeenCalled();
  expect(backend.editGradingLibraryCommentContext).not.toHaveBeenCalled();
  expect(loadRecentGradingComments(identity).map((entry) => entry.id)).toEqual([
    "deleted",
    "library"
  ]);
});
