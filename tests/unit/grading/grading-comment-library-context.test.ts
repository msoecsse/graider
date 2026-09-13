import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGradingLibraryCommentContext,
  deleteGradingLibraryCommentContext,
  editGradingLibraryCommentContext,
  loadGradingCommentLibraryContext
} from "../../../src/grading/grading-comment-library-context.js";
import {
  createCommentLibraryPath,
  createReusableComment
} from "../../../src/grading/comment-library.js";

const roots: string[] = [];
const courseRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-library-context-"));
  roots.push(root);
  return root;
};
const fields = (title: string) => ({
  title,
  text: `${title} text`,
  defaultDeduction: -1,
  tags: ["style"]
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("grading comment library core context", () => {
  it("loads missing as empty and performs ordered create/edit/delete through canonical CRUD", () => {
    const courseFolderPath = courseRoot();
    expect(loadGradingCommentLibraryContext({ courseFolderPath })).toEqual({
      status: "success",
      comments: []
    });
    expect(
      createGradingLibraryCommentContext(
        { courseFolderPath, comment: fields(" First ") },
        () => "one"
      )
    ).toMatchObject({ status: "success", comment: { id: "one", title: "First" } });
    createReusableComment(courseFolderPath, { id: "two", ...fields("Second") });
    expect(
      editGradingLibraryCommentContext({
        courseFolderPath,
        commentId: "one",
        replacement: {
          title: "Changed",
          text: "Changed text",
          defaultDeduction: -2,
          defaultRubricCategoryId: "future-rubric-category",
          tags: [" review ", "review"]
        }
      })
    ).toMatchObject({
      status: "success",
      comment: { id: "one", defaultRubricCategoryId: "future-rubric-category", tags: ["review"] }
    });
    expect(loadGradingCommentLibraryContext({ courseFolderPath })).toMatchObject({
      status: "success",
      comments: [{ id: "one" }, { id: "two" }]
    });
    expect(deleteGradingLibraryCommentContext({ courseFolderPath, commentId: "one" })).toEqual({
      status: "success"
    });
    expect(loadGradingCommentLibraryContext({ courseFolderPath })).toMatchObject({
      status: "success",
      comments: [{ id: "two" }]
    });
  });

  it("returns not_found and preserves malformed files on failed mutations", () => {
    const courseFolderPath = courseRoot();
    expect(
      editGradingLibraryCommentContext({
        courseFolderPath,
        commentId: "missing",
        replacement: fields("Missing")
      })
    ).toEqual({ status: "not_found", code: "comment_not_found" });
    expect(deleteGradingLibraryCommentContext({ courseFolderPath, commentId: "missing" })).toEqual({
      status: "not_found",
      code: "comment_not_found"
    });
    const libraryPath = createCommentLibraryPath(courseFolderPath);
    fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
    fs.writeFileSync(libraryPath, "{bad", "utf8");
    expect(loadGradingCommentLibraryContext({ courseFolderPath })).toEqual({
      status: "failure",
      code: "invalid_comment_library_json"
    });
    expect(
      createGradingLibraryCommentContext({ courseFolderPath, comment: fields("No overwrite") })
    ).toMatchObject({ status: "failure", code: "invalid_comment_library_json" });
    expect(fs.readFileSync(libraryPath, "utf8")).toBe("{bad");
  });
});
