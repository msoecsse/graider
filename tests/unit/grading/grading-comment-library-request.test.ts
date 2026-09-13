import { describe, expect, it } from "vitest";
import {
  isCreateGradingLibraryCommentRequest,
  isDeleteGradingLibraryCommentRequest,
  isEditGradingLibraryCommentRequest,
  isLoadGradingCommentLibraryRequest
} from "../../../ui/electron/gradingCommentLibraryRequestValidation.js";

const identity = { courseFolderId: "course-id", termCode: "27s1" };
const fields = { title: "Title", text: "Text", defaultDeduction: -1, tags: ["tag"] };

describe("grading comment library IPC request validation", () => {
  it("accepts narrow canonical requests", () => {
    expect(isLoadGradingCommentLibraryRequest(identity)).toBe(true);
    expect(isCreateGradingLibraryCommentRequest({ ...identity, comment: fields })).toBe(true);
    expect(
      isEditGradingLibraryCommentRequest({ ...identity, commentId: "id", replacement: fields })
    ).toBe(true);
    expect(isDeleteGradingLibraryCommentRequest({ ...identity, commentId: "id" })).toBe(true);
  });

  it("rejects paths, faculty identity, full libraries, IDs on create, and malformed identities", () => {
    for (const extra of [
      { courseFolderPath: "/untrusted/course" },
      { libraryPath: "/tmp/comments.json" },
      { facultyUsername: "faculty" },
      { githubUsername: "github" },
      { library: { schemaVersion: 1, comments: [] } }
    ]) {
      expect(isLoadGradingCommentLibraryRequest({ ...identity, ...extra })).toBe(false);
      expect(isCreateGradingLibraryCommentRequest({ ...identity, comment: fields, ...extra })).toBe(
        false
      );
      expect(
        isEditGradingLibraryCommentRequest({
          ...identity,
          commentId: "id",
          replacement: fields,
          ...extra
        })
      ).toBe(false);
      expect(isDeleteGradingLibraryCommentRequest({ ...identity, commentId: "id", ...extra })).toBe(
        false
      );
    }
    expect(
      isCreateGradingLibraryCommentRequest({ ...identity, comment: { id: "renderer", ...fields } })
    ).toBe(false);
    expect(isLoadGradingCommentLibraryRequest({ ...identity, termCode: "../../bad" })).toBe(false);
  });
});
