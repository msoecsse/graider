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
    const resolveToken = vi.fn(async () => ({ status: "success" as const, token: "secret-token" }));
    const service = createAssignmentTemplateSyncService(load, resolveToken);
    expect(load).not.toHaveBeenCalled();
    expect(await service.prepare(request)).toMatchObject({ available: true, repositoryCount: 2 });
    expect(backend.prepare).toHaveBeenCalledExactlyOnceWith(request);
    expect(backend.execute).not.toHaveBeenCalled();
    const execution = { ...request, confirmed: true };
    const result = await service.execute(execution);
    expect(result).toEqual({ status: "success", outcomes: [] });
    expect(resolveToken).toHaveBeenCalledTimes(1);
    expect(backend.execute).toHaveBeenCalledExactlyOnceWith({
      ...execution,
      resolvedGithubToken: "secret-token"
    });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("preserves confirmation and github_token_required without exposing authentication data", async () => {
    const backend: AssignmentTemplateSyncService = {
      prepare: vi.fn(),
      execute: vi.fn(async () => ({
        status: "failure" as const,
        outcomes: [],
        blocker: { code: "confirmation_required", message: "Confirm first." }
      }))
    };
    const resolveToken = vi.fn(async () => ({
      status: "failure" as const,
      error: {
        code: "github_cli_auth_failed",
        message: "Sign in with GitHub CLI.",
        exitCode: 1,
        stderrSnippet: null,
        stdoutSnippet: null
      }
    }));
    const service = createAssignmentTemplateSyncService(() => backend, resolveToken);

    expect(await service.execute({ ...request, confirmed: false })).toMatchObject({
      blocker: { code: "confirmation_required" }
    });
    expect(resolveToken).not.toHaveBeenCalled();

    const result = await service.execute({ ...request, confirmed: true });
    expect(result).toMatchObject({
      status: "failure",
      blocker: { code: "github_token_required" }
    });
    expect(backend.execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/secret-token|credential-value|stderr|stdout/iu);
  });
});
