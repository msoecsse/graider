import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGradingLibraryCommentContext,
  deleteGradingLibraryCommentContext,
  editGradingLibraryCommentContext,
  loadGradingCommentLibraryContext
} from "../../../src/grading/grading-comment-library-context.js";
import { createGradingCommentLibraryService } from "../../../ui/electron/gradingCommentLibraryService.js";

const roots: string[] = [];
const courseRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-library-service-"));
  roots.push(root);
  return root;
};
const identity = (courseFolderPath: string) => ({
  courseFolderPath,
  termCode: "27s1",
  userDataPath: "/trusted/user-data"
});
const authorizedScope = {
  status: "success" as const,
  sections: ["001"],
  students: [],
  errors: []
};
const backend = {
  loadGradingCommentLibraryContext,
  createGradingLibraryCommentContext,
  editGradingLibraryCommentContext,
  deleteGradingLibraryCommentContext
};
const publicationSuccess = () => ({
  status: "success" as const,
  diagnostics: [],
  commitMessage: "Publish Graider course changes"
});
const git = (root: string, arguments_: readonly string[]): string =>
  execFileSync("git", arguments_, { cwd: root, encoding: "utf8" }).trim();
const initializeGitCourse = (root: string) => {
  fs.writeFileSync(path.join(root, "course.yml"), "course:\n  code: CSC1120\n", "utf8");
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Test User"]);
  git(root, ["add", "course.yml"]);
  git(root, ["commit", "-m", "Initial"]);
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("grading comment library production service", () => {
  it("authorizes every operation before loading the core backend or publishing", async () => {
    const loadBackend = vi.fn();
    const publishCourseChanges = vi.fn();
    for (const status of ["faculty_identity_required", "no_assigned_sections"] as const) {
      const request = identity("/trusted/course");
      const service = createGradingCommentLibraryService({
        resolveFacultyScope: () => ({ status, sections: [], students: [], errors: [] }),
        loadBackend,
        publishCourseChanges
      });
      expect(service.load(request)).toEqual({ status });
      expect(await service.create({ ...request, comment: fields() })).toEqual({ status });
      expect(await service.edit({ ...request, commentId: "id", replacement: fields() })).toEqual({
        status
      });
      expect(await service.delete({ ...request, commentId: "id" })).toEqual({ status });
    }
    expect(loadBackend).not.toHaveBeenCalled();
    expect(publishCourseChanges).not.toHaveBeenCalled();
  });

  it("keeps loading read-only and publishes create, edit, and delete exactly once", async () => {
    const courseFolderPath = courseRoot();
    const request = identity(courseFolderPath);
    const publishCourseChanges = vi.fn().mockResolvedValue(publicationSuccess());
    const service = createGradingCommentLibraryService({
      resolveFacultyScope: () => authorizedScope,
      loadBackend: () => backend,
      publishCourseChanges
    });

    expect(service.load(request)).toEqual({ status: "success", comments: [] });
    expect(publishCourseChanges).not.toHaveBeenCalled();

    const created = await service.create({ ...request, comment: fields() });
    expect(created).toMatchObject({
      status: "success",
      comment: { title: "Title" },
      publication: { status: "success" }
    });
    if (created.status !== "success" || !("comment" in created))
      throw new Error("Expected created reusable comment.");

    const edited = await service.edit({
      ...request,
      commentId: created.comment.id,
      replacement: { ...fields(), title: "Edited" }
    });
    expect(edited).toMatchObject({
      status: "success",
      comment: { id: created.comment.id, title: "Edited" },
      publication: { status: "success" }
    });

    const deleted = await service.delete({ ...request, commentId: created.comment.id });
    expect(deleted).toMatchObject({
      status: "success",
      publication: { status: "success" }
    });
    expect(service.load(request)).toEqual({ status: "success", comments: [] });
    expect(publishCourseChanges).toHaveBeenCalledTimes(3);
    expect(publishCourseChanges).toHaveBeenNthCalledWith(1, courseFolderPath);
    expect(publishCourseChanges).toHaveBeenNthCalledWith(2, courseFolderPath);
    expect(publishCourseChanges).toHaveBeenNthCalledWith(3, courseFolderPath);
  });

  it("retains local failure semantics without invoking publication", async () => {
    const courseFolderPath = courseRoot();
    const publishCourseChanges = vi.fn();
    const service = createGradingCommentLibraryService({
      resolveFacultyScope: () => authorizedScope,
      loadBackend: () => backend,
      publishCourseChanges
    });

    const result = await service.edit({
      ...identity(courseFolderPath),
      commentId: "missing",
      replacement: fields()
    });

    expect(result).toEqual({ status: "not_found", code: "comment_not_found" });
    expect(result).not.toHaveProperty("publication");
    expect(publishCourseChanges).not.toHaveBeenCalled();
  });

  it("keeps a created comment durable and reports partial success when publication fails", async () => {
    const courseFolderPath = courseRoot();
    const publishCourseChanges = vi.fn().mockResolvedValue({
      status: "failure",
      diagnostics: [{ message: "Unable to push course changes." }],
      commitMessage: null
    });
    const service = createGradingCommentLibraryService({
      resolveFacultyScope: () => authorizedScope,
      loadBackend: () => backend,
      publishCourseChanges
    });

    const result = await service.create({
      ...identity(courseFolderPath),
      comment: fields()
    });

    expect(result).toMatchObject({
      status: "success",
      comment: { title: "Title" },
      publication: { status: "failure" }
    });
    if (result.status !== "success") throw new Error("Expected local mutation success.");
    expect(result.diagnostics.map((item) => item.message).join(" ")).toMatch(
      /saved locally.*Publish Course Changes/u
    );
    expect(loadGradingCommentLibraryContext({ courseFolderPath })).toMatchObject({
      status: "success",
      comments: [{ title: "Title" }]
    });
  });

  it("returns local success with retry guidance when the course has no upstream", async () => {
    const courseFolderPath = courseRoot();
    initializeGitCourse(courseFolderPath);
    const service = createGradingCommentLibraryService({
      resolveFacultyScope: () => authorizedScope,
      loadBackend: () => backend
    });

    const result = await service.create({
      ...identity(courseFolderPath),
      comment: fields()
    });

    expect(result).toMatchObject({
      status: "success",
      comment: { title: "Title" },
      publication: { status: "failure" }
    });
    if (result.status !== "success") throw new Error("Expected local mutation success.");
    expect(result.diagnostics.map((item) => item.message).join(" ")).toMatch(
      /upstream.*saved locally.*Publish Course Changes/u
    );
    expect(loadGradingCommentLibraryContext({ courseFolderPath })).toMatchObject({
      status: "success",
      comments: [{ title: "Title" }]
    });
  });
});

const fields = () => ({
  title: "Title",
  text: "Text",
  defaultDeduction: -1,
  tags: ["style"]
});
