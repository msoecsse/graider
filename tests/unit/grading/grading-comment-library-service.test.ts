import { describe, expect, it, vi } from "vitest";
import { createGradingCommentLibraryService } from "../../../ui/electron/gradingCommentLibraryService.js";

const identity = {
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  userDataPath: "/trusted/user-data"
};
const authorizedScope = {
  status: "success" as const,
  sections: ["001"],
  students: [],
  errors: []
};

describe("grading comment library production service", () => {
  it("authorizes every operation before loading the core backend", () => {
    const loadBackend = vi.fn();
    for (const status of ["faculty_identity_required", "no_assigned_sections"] as const) {
      const service = createGradingCommentLibraryService({
        resolveFacultyScope: () => ({ status, sections: [], students: [], errors: [] }),
        loadBackend
      });
      expect(service.load(identity)).toEqual({ status });
      expect(service.create({ ...identity, comment: fields() })).toEqual({ status });
      expect(service.edit({ ...identity, commentId: "id", replacement: fields() })).toEqual({
        status
      });
      expect(service.delete({ ...identity, commentId: "id" })).toEqual({ status });
    }
    expect(loadBackend).not.toHaveBeenCalled();
  });

  it("passes only trusted course path and narrow mutation fields to core", () => {
    const backend = {
      loadGradingCommentLibraryContext: vi.fn(() => ({
        status: "success" as const,
        comments: [{ id: "existing", ...fields() }]
      })),
      createGradingLibraryCommentContext: vi.fn(() => ({
        status: "success" as const,
        comment: { id: "generated", ...fields() }
      })),
      editGradingLibraryCommentContext: vi.fn(() => ({
        status: "success" as const,
        comment: { id: "id", ...fields() }
      })),
      deleteGradingLibraryCommentContext: vi.fn(() => ({ status: "success" as const }))
    };
    const service = createGradingCommentLibraryService({
      resolveFacultyScope: () => authorizedScope,
      loadBackend: () => backend
    });
    expect(service.load(identity)).toMatchObject({
      status: "success",
      comments: [{ id: "existing" }]
    });
    expect(service.create({ ...identity, comment: fields() })).toMatchObject({ status: "success" });
    expect(service.edit({ ...identity, commentId: "id", replacement: fields() })).toMatchObject({
      status: "success"
    });
    expect(service.delete({ ...identity, commentId: "id" })).toEqual({ status: "success" });
    expect(backend.loadGradingCommentLibraryContext).toHaveBeenCalledWith({
      courseFolderPath: "/trusted/course"
    });
    expect(backend.createGradingLibraryCommentContext).toHaveBeenCalledWith({
      courseFolderPath: "/trusted/course",
      comment: fields()
    });
  });
});

const fields = () => ({
  title: "Title",
  text: "Text",
  defaultDeduction: -1,
  tags: ["style"]
});
