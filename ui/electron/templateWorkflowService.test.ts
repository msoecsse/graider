import { describe, expect, it, vi } from "vitest";
import type { ProcessRunner } from "./commandRunner";
import type { TemplateWorkflowRequest } from "./ipc";
import {
  getTemplateWorkflow,
  previewTemplateWorkflowSave,
  saveTemplateWorkflow
} from "./templateWorkflowService";

const request: TemplateWorkflowRequest = {
  templateRepository: "graider-sandbox/lab02-template",
  templateBranch: "main",
  workflowPath: ".github/workflows/grade.yml",
  gradingEnabled: true
};

const runner: ProcessRunner = vi.fn();

const response = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
});

describe("template workflow service", () => {
  it("fetches the configured branch and returns decoded workflow text without a token", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(response(200, {}))
      .mockResolvedValueOnce(
        response(200, {
          content: Buffer.from("name: Grade\n").toString("base64"),
          encoding: "base64",
          sha: "workflow-sha"
        })
      );

    const result = await getTemplateWorkflow(request, {
      runner,
      resolveToken: async () => ({ status: "success", token: "secret-token" }),
      fetchImplementation
    });

    expect(result).toMatchObject({ status: "success", content: "name: Grade\n", branch: "main" });
    expect(fetchImplementation.mock.calls[1]?.[0]).toContain("ref=main");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("uses the default workflow path and returns missing only after repository access succeeds", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(response(200, {}))
      .mockResolvedValueOnce(response(404, {}));
    const result = await getTemplateWorkflow(
      { ...request, workflowPath: null },
      {
        runner,
        resolveToken: async () => ({ status: "success", token: "secret-token" }),
        fetchImplementation
      }
    );

    expect(result.status).toBe("missing");
    expect(result.path).toBe(".github/workflows/grade.yml");
  });

  it("does not fetch when grading or template configuration is unavailable", async () => {
    const fetchImplementation = vi.fn();
    const disabled = await getTemplateWorkflow(
      { ...request, gradingEnabled: false },
      { runner, fetchImplementation }
    );
    const invalid = await getTemplateWorkflow(
      { ...request, templateRepository: "not-a-repository" },
      { runner, fetchImplementation }
    );

    expect(disabled.status).toBe("not_configured");
    expect(invalid.status).toBe("not_configured");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("returns auth and inaccessible repository diagnostics without mutation", async () => {
    const authRequired = await getTemplateWorkflow(request, {
      runner,
      resolveToken: async () => ({
        status: "failure",
        error: {
          code: "github_token_unavailable",
          message: "secret-token",
          exitCode: null,
          stderrSnippet: null,
          stdoutSnippet: null
        }
      })
    });
    const inaccessible = await getTemplateWorkflow(request, {
      runner,
      resolveToken: async () => ({ status: "success", token: "secret-token" }),
      fetchImplementation: vi.fn().mockResolvedValue(response(404, {}))
    });

    expect(authRequired.status).toBe("auth_required");
    expect(inaccessible.status).toBe("error");
    expect(JSON.stringify(authRequired)).not.toContain("secret-token");
  });

  it("previews and pushes an existing workflow with SHA and base64 content", async () => {
    const saveRequest = {
      ...request,
      assignmentSlug: "lab02",
      content: "name: Updated\n",
      loadedSha: "workflow-sha",
      confirmed: false
    };
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(response(200, {}))
      .mockResolvedValueOnce(
        response(200, {
          content: Buffer.from("name: Grade\n").toString("base64"),
          encoding: "base64",
          sha: "workflow-sha"
        })
      )
      .mockResolvedValueOnce(response(200, {}))
      .mockResolvedValueOnce(
        response(200, {
          content: Buffer.from("name: Grade\n").toString("base64"),
          encoding: "base64",
          sha: "workflow-sha"
        })
      )
      .mockResolvedValueOnce(
        response(200, { commit: { sha: "commit-sha", html_url: "https://github.com/commit-sha" } })
      );
    const options = {
      runner,
      resolveToken: async () => ({ status: "success" as const, token: "secret-token" }),
      fetchImplementation
    };

    expect((await previewTemplateWorkflowSave(saveRequest, options)).status).toBe("ready");
    const result = await saveTemplateWorkflow({ ...saveRequest, confirmed: true }, options);
    expect(result).toMatchObject({
      status: "success",
      operation: "update",
      commitSha: "commit-sha"
    });
    const put = fetchImplementation.mock.calls.at(-1);
    expect(put?.[1].method).toBe("PUT");
    expect(put?.[1].body).toContain(Buffer.from("name: Updated\n").toString("base64"));
    expect(put?.[1].body).toContain("workflow-sha");
  });

  it("handles create, no changes, and remote conflicts without pushing during preview", async () => {
    const saveRequest = {
      ...request,
      assignmentSlug: "lab02",
      content: "name: Grade\n",
      loadedSha: null,
      confirmed: false
    };
    const missingFetch = vi
      .fn()
      .mockResolvedValueOnce(response(200, {}))
      .mockResolvedValueOnce(response(404, {}));
    const options = {
      runner,
      resolveToken: async () => ({ status: "success" as const, token: "secret-token" }),
      fetchImplementation: missingFetch
    };
    expect((await previewTemplateWorkflowSave(saveRequest, options)).operation).toBe("create");
    expect(missingFetch).toHaveBeenCalledTimes(2);

    const noChanges = await previewTemplateWorkflowSave(
      { ...saveRequest, loadedSha: "sha" },
      {
        ...options,
        fetchImplementation: vi
          .fn()
          .mockResolvedValueOnce(response(200, {}))
          .mockResolvedValueOnce(
            response(200, {
              content: Buffer.from("name: Grade\n").toString("base64"),
              encoding: "base64",
              sha: "sha"
            })
          )
      }
    );
    expect(noChanges.status).toBe("no_changes");
    const conflict = await previewTemplateWorkflowSave(
      { ...saveRequest, loadedSha: "old-sha" },
      {
        ...options,
        fetchImplementation: vi
          .fn()
          .mockResolvedValueOnce(response(200, {}))
          .mockResolvedValueOnce(
            response(200, {
              content: Buffer.from("other").toString("base64"),
              encoding: "base64",
              sha: "new-sha"
            })
          )
      }
    );
    expect(conflict.status).toBe("conflict");
  });
});
