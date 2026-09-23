import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCommentLibraryPath,
  createReusableComment,
  createReusableCommentWithGeneratedId,
  deleteReusableComment,
  editReusableComment,
  getReusableComment,
  listReusableComments,
  loadCommentLibrary,
  searchReusableComments,
  type ReusableComment
} from "../../../src/grading/comment-library.js";
import {
  createInitialGradingState,
  loadGradingState,
  saveGradingState
} from "../../../src/grading/grading-state.js";

const roots: string[] = [];
const courseRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-comment-library-"));
  roots.push(root);
  return root;
};
const comment = (id: string): ReusableComment => ({
  id,
  title: `Title ${id}`,
  text: `Text ${id}`,
  defaultDeduction: 1,
  tags: ["style"]
});

afterEach(() => {
  roots.splice(0).forEach((root) => {
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("course comment library", () => {
  it("treats a missing library as empty and saves comments in append order", () => {
    const root = courseRoot();
    expect(loadCommentLibrary(root)).toMatchObject({ status: "success", value: { comments: [] } });
    expect(createReusableComment(root, comment("one"))).toMatchObject({ status: "success" });
    expect(createReusableComment(root, comment("two"))).toMatchObject({ status: "success" });
    expect(loadCommentLibrary(root)).toMatchObject({
      status: "success",
      value: { comments: [{ id: "one" }, { id: "two" }] }
    });
    expect(listReusableComments(root)).toMatchObject({
      status: "success",
      value: [{ id: "one" }, { id: "two" }]
    });
    expect(getReusableComment(root, "two")).toMatchObject({
      status: "success",
      value: { id: "two" }
    });
    expect(createCommentLibraryPath(root)).toContain(".graider");
  });

  it("rejects duplicate IDs and edits or deletes only the selected comment", () => {
    const root = courseRoot();
    createReusableComment(root, comment("one"));
    createReusableComment(root, comment("two"));
    expect(createReusableComment(root, comment("one"))).toMatchObject({
      status: "failure",
      code: "duplicate_comment_id"
    });
    expect(
      editReusableComment(root, "one", {
        title: " Changed ",
        text: "Updated text",
        defaultDeduction: 2.5,
        defaultRubricCategoryId: " design ",
        tags: [" style ", "", "style", "Review"]
      })
    ).toMatchObject({ status: "success" });
    expect(loadCommentLibrary(root)).toMatchObject({
      status: "success",
      value: {
        comments: [
          {
            id: "one",
            title: "Changed",
            text: "Updated text",
            defaultDeduction: 2.5,
            defaultRubricCategoryId: "design",
            tags: ["style", "Review"]
          },
          { id: "two", title: "Title two" }
        ]
      }
    });
    expect(deleteReusableComment(root, "one")).toMatchObject({ status: "success" });
    expect(loadCommentLibrary(root)).toMatchObject({
      status: "success",
      value: { comments: [{ id: "two" }] }
    });
    expect(deleteReusableComment(root, "missing")).toMatchObject({
      status: "not_found",
      code: "comment_not_found"
    });
  });

  it("validates required fields and normalizes tags", () => {
    const root = courseRoot();
    for (const invalid of [
      { ...comment(" ") },
      { ...comment("title"), title: " " },
      { ...comment("deduction"), defaultDeduction: Number.NaN },
      { ...comment("category"), defaultRubricCategoryId: " " }
    ])
      expect(createReusableComment(root, invalid)).toMatchObject({ status: "failure" });
  });

  it("canonicalizes tags case-insensitively while preserving first display casing and order", () => {
    const root = courseRoot();
    expect(
      createReusableComment(root, {
        ...comment("canonical-tags"),
        tags: [" Java ", "java", "JAVA", "Loops", " loops ", ""]
      })
    ).toMatchObject({ status: "success", value: { tags: ["Java", "Loops"] } });
    expect(
      editReusableComment(root, "canonical-tags", {
        ...comment("ignored"),
        tags: ["Testing", " testing ", "STYLE"]
      })
    ).toMatchObject({ status: "success", value: { tags: ["Testing", "STYLE"] } });
  });

  it("generates a trusted stable ID and normalizes canonical creation fields", () => {
    const root = courseRoot();
    expect(
      createReusableCommentWithGeneratedId(
        root,
        {
          title: "  Generated  ",
          text: "Feedback",
          defaultDeduction: -1,
          defaultRubricCategoryId: " arbitrary-category ",
          tags: [" style ", "style", "", "Review"]
        },
        () => "generated-id"
      )
    ).toEqual({
      status: "success",
      value: {
        id: "generated-id",
        title: "Generated",
        text: "Feedback",
        defaultDeduction: -1,
        defaultRubricCategoryId: "arbitrary-category",
        tags: ["style", "Review"]
      }
    });
    expect(loadCommentLibrary(root)).toMatchObject({
      status: "success",
      value: { comments: [{ id: "generated-id" }] }
    });
    const generated = createReusableCommentWithGeneratedId(root, comment("ignored"));
    expect(generated).toMatchObject({ status: "success" });
    if (generated.status !== "success") throw new Error(generated.message);
    expect(generated.value.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
  });

  it("reports malformed and unsupported files without replacing them", () => {
    const root = courseRoot();
    const libraryPath = createCommentLibraryPath(root);
    fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
    fs.writeFileSync(libraryPath, "{bad", "utf8");
    expect(loadCommentLibrary(root)).toMatchObject({
      status: "failure",
      code: "invalid_comment_library_json"
    });
    expect(createReusableComment(root, comment("one"))).toMatchObject({ status: "failure" });
    expect(fs.readFileSync(libraryPath, "utf8")).toBe("{bad");
    fs.writeFileSync(libraryPath, JSON.stringify({ schemaVersion: 999, comments: [] }), "utf8");
    expect(loadCommentLibrary(root)).toMatchObject({
      status: "failure",
      code: "unsupported_comment_library_schema_version"
    });
  });

  it("searches titles, text, and tags case-insensitively with AND tag filtering", () => {
    const comments: ReusableComment[] = [
      { ...comment("one"), title: "Loop design", text: "Use an index", tags: ["Java", "style"] },
      {
        ...comment("two"),
        title: "Tests",
        text: "Missing loop coverage",
        tags: ["java", "testing"]
      },
      { ...comment("three"), title: "Naming", text: "Use clearer variable names", tags: ["style"] }
    ];
    expect(searchReusableComments(comments, { query: "LOOP" }).map(({ id }) => id)).toEqual([
      "one",
      "two"
    ]);
    expect(searchReusableComments(comments, { query: "VARIABLE" }).map(({ id }) => id)).toEqual([
      "three"
    ]);
    expect(searchReusableComments(comments, { query: "TESTING" }).map(({ id }) => id)).toEqual([
      "two"
    ]);
    expect(
      searchReusableComments(comments, { tags: ["JAVA", "style"] }).map(({ id }) => id)
    ).toEqual(["one"]);
    expect(
      searchReusableComments(comments, { query: "loop", tags: ["java"] }).map(({ id }) => id)
    ).toEqual(["one", "two"]);
  });

  it("does not mutate applied-comment snapshots when library comments change", () => {
    const root = courseRoot();
    const request = { courseRoot: root, termCode: "27s1", assignmentSlug: "lab", studentId: "s1" };
    const state = createInitialGradingState("s1", "sha");
    if (state.status === "failure") throw new Error(state.message);
    saveGradingState(request, {
      ...state.value,
      appliedComments: [
        {
          id: "applied",
          sourceCommentId: "one",
          title: "Original title",
          text: "Snapshot",
          deduction: 3
        }
      ]
    });
    createReusableComment(root, comment("one"));
    editReusableComment(root, "one", { ...comment("replacement"), title: "Changed" });
    deleteReusableComment(root, "one");
    expect(loadGradingState(request)).toMatchObject({
      status: "success",
      value: {
        appliedComments: [
          { id: "applied", title: "Original title", text: "Snapshot", deduction: 3 }
        ]
      }
    });
  });
});
