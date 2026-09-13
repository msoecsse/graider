import { describe, expect, it } from "vitest";
import { filterReusableComments, listReusableCommentTags } from "./commentLibrarySearch";

const comments = [
  { id: "one", title: "Loop design", text: "Use an index", tags: ["Java", "style"] },
  { id: "two", title: "Tests", text: "Missing loop coverage", tags: ["java", "testing"] },
  { id: "three", title: "Naming", text: "Use clearer variables", tags: ["style"] }
];

describe("renderer reusable-comment filtering", () => {
  it("matches title, text, and tags case-insensitively in canonical order", () => {
    expect(filterReusableComments(comments, "LOOP").map(({ id }) => id)).toEqual(["one", "two"]);
    expect(filterReusableComments(comments, "VARIABLE").map(({ id }) => id)).toEqual(["three"]);
    expect(filterReusableComments(comments, "TESTING").map(({ id }) => id)).toEqual(["two"]);
  });

  it("combines query and multiple tags with canonical AND semantics", () => {
    expect(filterReusableComments(comments, "loop", ["JAVA", "style"]).map(({ id }) => id)).toEqual(
      ["one"]
    );
    expect(filterReusableComments(comments, "", ["style"]).map(({ id }) => id)).toEqual([
      "one",
      "three"
    ]);
    expect(listReusableCommentTags(comments)).toEqual(["Java", "style", "testing"]);
  });
});
