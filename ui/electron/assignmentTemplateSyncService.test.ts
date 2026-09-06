import { describe, expect, it, vi } from "vitest";
import {
  createAssignmentTemplateSyncService,
  type AssignmentTemplateSyncService
} from "./assignmentTemplateSyncService.js";

const request = {
  courseFolderId: "course",
  courseFolderPath: "/courses/cs",
  assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
};

describe("assignment template-sync Electron service", () => {
  it("lazily loads its main-process backend and passes only assignment identity for prepare", async () => {
    const backend: AssignmentTemplateSyncService = {
      prepare: vi.fn(async () => ({
        available: true,
        repositoryCount: 2,
        templateRepository: "course/template",
        recordedTemplateRevision: "baseline"
      })),
      execute: vi.fn(async () => ({ status: "success" as const, outcomes: [] }))
    };
    const load = vi.fn(() => backend);
    const service = createAssignmentTemplateSyncService(load);
    expect(load).not.toHaveBeenCalled();
    expect(await service.prepare(request)).toMatchObject({ available: true, repositoryCount: 2 });
    expect(backend.prepare).toHaveBeenCalledExactlyOnceWith(request);
    expect(backend.execute).not.toHaveBeenCalled();
    const execution = { ...request, confirmed: true };
    expect(await service.execute(execution)).toEqual({ status: "success", outcomes: [] });
    expect(backend.execute).toHaveBeenCalledExactlyOnceWith(execution);
  });
});
