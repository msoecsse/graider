import { describe, expect, it, vi } from "vitest";
import type { GitHubClient } from "./githubClientProvider.js";
type GitHubRepositoryFileReadResult = Awaited<ReturnType<GitHubClient["readRepositoryFile"]>>;
import type { ProcessRunner } from "./commandRunner";
import type { TemplateWorkflowRequest, TemplateWorkflowSaveRequest } from "./ipc";
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
const draft: TemplateWorkflowSaveRequest = {
  ...request,
  assignmentSlug: "lab02",
  content: "name: Updated\n",
  loadedSha: "old-sha",
  confirmed: true
};
const token = "secret-token";
const conflictMessage =
  "The workflow changed in the template repository after it was loaded. Reload the workflow before saving.";
const authMessage = "GitHub authentication is required. Run gh auth login, then refresh.";
const runner: ProcessRunner = vi.fn();
const found = (blobSha = "old-sha", content = "name: Grade\n"): GitHubRepositoryFileReadResult => ({
  status: "found",
  file: { content, blobSha }
});
const setup = () => {
  const getRepository = vi.fn<GitHubClient["getRepository"]>().mockResolvedValue({
    owner: "graider-sandbox",
    name: "lab02-template",
    fullName: request.templateRepository!,
    id: 1,
    private: true,
    archived: false,
    defaultBranch: "main",
    htmlUrl: "https://github.com/graider-sandbox/lab02-template"
  });
  const read = vi.fn<GitHubClient["readRepositoryFile"]>().mockResolvedValue(found());
  const write = vi.fn<GitHubClient["conditionalWriteRepositoryFile"]>().mockResolvedValue({
    status: "written",
    path: request.workflowPath!,
    commitSha: "commit-sha",
    commitUrl: "https://github.com/graider-sandbox/lab02-template/commit/commit-sha"
  });
  const upsert = vi.fn<GitHubClient["writeRepositoryFile"]>();
  const methods: Pick<
    GitHubClient,
    | "getRepository"
    | "readRepositoryFile"
    | "conditionalWriteRepositoryFile"
    | "writeRepositoryFile"
  > = {
    getRepository,
    readRepositoryFile: read,
    conditionalWriteRepositoryFile: write,
    writeRepositoryFile: upsert
  };
  const client = methods as GitHubClient;
  const resolveToken = vi.fn(async () => ({ status: "success" as const, token }));
  const provideClient = vi.fn(() => client);
  return {
    client,
    getRepository,
    read,
    write,
    upsert,
    resolveToken,
    provideClient,
    options: { runner, resolveToken, provideClient }
  };
};
const safeError = (kind: string) =>
  Object.assign(new Error(`${token} raw API body https://api.github.com/internal`), {
    name: "GitHubClientError",
    kind
  });
const expectSafe = (result: unknown) => {
  expect(JSON.stringify(result)).not.toContain(token);
  expect(JSON.stringify(result)).not.toContain("https://api.github.com");
  expect(JSON.stringify(result)).not.toContain("raw API body");
};

describe("template workflow service", () => {
  it("uses the exact provider client and resolved token to read configured content and blob SHA", async () => {
    const context = setup();
    const result = await getTemplateWorkflow(request, context.options);
    expect(result).toEqual({
      status: "success",
      repository: request.templateRepository,
      branch: "main",
      path: request.workflowPath,
      content: "name: Grade\n",
      sha: "old-sha",
      diagnostics: []
    });
    expect(context.resolveToken).toHaveBeenCalledTimes(1);
    expect(context.provideClient).toHaveBeenCalledExactlyOnceWith(token);
    expect(context.getRepository).toHaveBeenCalledExactlyOnceWith(
      "graider-sandbox",
      "lab02-template"
    );
    expect(context.read).toHaveBeenCalledExactlyOnceWith(
      "graider-sandbox",
      "lab02-template",
      request.workflowPath,
      "main"
    );
    expect(context.write).not.toHaveBeenCalled();
    expectSafe(result);
  });

  it("retains default path, branch trimming, and missing diagnostic", async () => {
    const context = setup();
    context.read.mockResolvedValue({ status: "missing" });
    const result = await getTemplateWorkflow(
      { ...request, workflowPath: null, templateBranch: " main " },
      context.options
    );
    expect(result).toMatchObject({
      status: "missing",
      path: ".github/workflows/grade.yml",
      diagnostics: [
        {
          message:
            "No .github/workflows/grade.yml was found in the template repository on this branch."
        }
      ]
    });
    expect(context.read).toHaveBeenCalledExactlyOnceWith(
      "graider-sandbox",
      "lab02-template",
      ".github/workflows/grade.yml",
      "main"
    );
    expectSafe(result);
  });

  it.each([{ gradingEnabled: false }, { templateRepository: "invalid" }, { templateBranch: " " }])(
    "validates %j locally for every public operation before auth/client work",
    async (invalid) => {
      const context = setup();
      const results = [
        await getTemplateWorkflow({ ...request, ...invalid }, context.options),
        await previewTemplateWorkflowSave({ ...draft, ...invalid }, context.options),
        await saveTemplateWorkflow({ ...draft, ...invalid }, context.options)
      ];
      for (const result of results) {
        expect(result.status).toBe("not_configured");
        expectSafe(result);
      }
      expect(context.resolveToken).not.toHaveBeenCalled();
      expect(context.provideClient).not.toHaveBeenCalled();
    }
  );

  it("rejects blank drafts before authentication for preview and save", async () => {
    const context = setup();
    for (const operation of [previewTemplateWorkflowSave, saveTemplateWorkflow]) {
      const result = await operation({ ...draft, content: " \n" }, context.options);
      expect(result).toMatchObject({
        status: "error",
        diagnostics: [{ message: "Workflow content cannot be blank." }]
      });
      expectSafe(result);
    }
    expect(context.resolveToken).not.toHaveBeenCalled();
    expect(context.provideClient).not.toHaveBeenCalled();
  });

  it("projects authentication acquisition failure without constructing a client", async () => {
    const context = setup();
    const options = {
      ...context.options,
      resolveToken: vi.fn(async () => ({
        status: "failure" as const,
        error: {
          code: "github_token_unavailable",
          message: token,
          exitCode: null,
          stderrSnippet: null,
          stdoutSnippet: null
        }
      }))
    };
    for (const operation of [
      getTemplateWorkflow,
      previewTemplateWorkflowSave,
      saveTemplateWorkflow
    ]) {
      const result = await operation(draft, options);
      expect(result).toMatchObject({
        status: "auth_required",
        diagnostics: [{ message: authMessage }]
      });
      expectSafe(result);
    }
    expect(options.resolveToken).toHaveBeenCalledTimes(3);
    expect(context.provideClient).not.toHaveBeenCalled();
  });

  it("retains inaccessible repository distinction and skips file read", async () => {
    const context = setup();
    context.getRepository.mockResolvedValue(null);
    const result = await getTemplateWorkflow(request, context.options);
    expect(result).toMatchObject({
      status: "error",
      diagnostics: [{ message: "The template repository could not be accessed." }]
    });
    expect(context.read).not.toHaveBeenCalled();
    expectSafe(result);
  });

  it("projects unsupported file response", async () => {
    const context = setup();
    context.read.mockResolvedValue({ status: "unsupported" });
    const result = await getTemplateWorkflow(request, context.options);
    expect(result).toMatchObject({
      status: "error",
      diagnostics: [{ message: "GitHub returned workflow content in an unsupported format." }]
    });
    expectSafe(result);
  });

  it.each([
    "auth_missing",
    "auth_failed",
    "permission_denied",
    "rate_limited",
    "api_error",
    "network_error",
    "timeout",
    "unknown"
  ])(
    "safely projects repository, file and write %s failures across constructor boundaries",
    async (kind) => {
      const auth = ["auth_missing", "auth_failed", "permission_denied"].includes(kind);
      const network = ["network_error", "timeout", "unknown"].includes(kind);
      for (const stage of ["repository", "file", "write"] as const) {
        const context = setup();
        const failure = safeError(kind);
        if (stage === "repository") context.getRepository.mockRejectedValue(failure);
        if (stage === "file") context.read.mockRejectedValue(failure);
        if (stage === "write") context.write.mockRejectedValue(failure);
        const result = await saveTemplateWorkflow(draft, context.options);
        const message = network
          ? `Unable to reach GitHub to ${stage === "write" ? "push" : "fetch"} the grade workflow.`
          : stage === "repository"
            ? "The template repository could not be accessed."
            : stage === "file"
              ? "Unable to fetch the grade workflow file."
              : "Unable to push the grade workflow.";
        expect(result).toMatchObject({
          status: auth ? "auth_required" : "error",
          diagnostics: [{ message }],
          commitSha: null,
          commitUrl: null
        });
        expectSafe(result);
      }
    }
  );

  it("projects provider construction failures safely", async () => {
    const context = setup();
    context.provideClient.mockImplementation(() => {
      throw new Error(token);
    });
    const result = await getTemplateWorkflow(request, context.options);
    expect(result).toMatchObject({
      status: "error",
      diagnostics: [{ message: "Unable to reach GitHub to fetch the grade workflow." }]
    });
    expectSafe(result);
  });

  it.each([previewTemplateWorkflowSave, saveTemplateWorkflow])(
    "uses one token and client for preview/save",
    async (operation) => {
      const context = setup();
      const result = await operation(draft, context.options);
      expect(result.status).toBe(operation === saveTemplateWorkflow ? "success" : "ready");
      expect(context.resolveToken).toHaveBeenCalledTimes(1);
      expect(context.provideClient).toHaveBeenCalledExactlyOnceWith(token);
      expect(context.read).toHaveBeenCalledTimes(1);
      expect(context.upsert).not.toHaveBeenCalled();
      expectSafe(result);
    }
  );

  it("saves update using original expected SHA and domain commit metadata", async () => {
    const context = setup();
    const result = await saveTemplateWorkflow(draft, context.options);
    expect(context.write).toHaveBeenCalledExactlyOnceWith({
      owner: "graider-sandbox",
      repo: "lab02-template",
      path: request.workflowPath,
      branch: "main",
      content: draft.content,
      message: "Update grading workflow for lab02",
      expectedBlobSha: "old-sha"
    });
    expect(result).toEqual({
      status: "success",
      operation: "update",
      repository: request.templateRepository,
      branch: "main",
      path: request.workflowPath,
      commitMessage: "Update grading workflow for lab02",
      commitSha: "commit-sha",
      commitUrl: "https://github.com/graider-sandbox/lab02-template/commit/commit-sha",
      diagnostics: []
    });
    expectSafe(result);
  });

  it("saves expected absent create and preserves null domain commit URL", async () => {
    const context = setup();
    context.read.mockResolvedValue({ status: "missing" });
    context.write.mockResolvedValue({
      status: "written",
      path: request.workflowPath!,
      commitSha: "commit-sha",
      commitUrl: null
    });
    const result = await saveTemplateWorkflow({ ...draft, loadedSha: null }, context.options);
    expect(result).toMatchObject({ status: "success", operation: "create", commitUrl: null });
    expect(context.write.mock.calls[0]?.[0].expectedBlobSha).toBeNull();
    expectSafe(result);
  });

  it.each([
    {
      title: "update stale before preview",
      loadedSha: "old-sha",
      remote: found("new-sha"),
      operation: "update"
    },
    { title: "create stale before preview", loadedSha: null, remote: found(), operation: "update" },
    {
      title: "loaded file deleted before preview",
      loadedSha: "old-sha",
      remote: { status: "missing" } as GitHubRepositoryFileReadResult,
      operation: "create"
    }
  ])("rejects $title without conditional write", async ({ loadedSha, remote, operation }) => {
    const context = setup();
    context.read.mockResolvedValue(remote);
    const result = await saveTemplateWorkflow({ ...draft, loadedSha }, context.options);
    expect(result).toMatchObject({
      status: "conflict",
      operation,
      diagnostics: [{ message: conflictMessage }],
      commitSha: null,
      commitUrl: null
    });
    expect(context.write).not.toHaveBeenCalled();
    expectSafe(result);
  });

  it.each([
    {
      title: "update race after preview",
      loadedSha: "old-sha",
      remote: found(),
      operation: "update"
    },
    {
      title: "create race after preview",
      loadedSha: null,
      remote: { status: "missing" } as GitHubRepositoryFileReadResult,
      operation: "create"
    }
  ])("preserves $title via conditional host conflict", async ({ loadedSha, remote, operation }) => {
    const context = setup();
    context.read.mockResolvedValue(remote);
    context.write.mockResolvedValue({ status: "conflict" });
    const result = await saveTemplateWorkflow({ ...draft, loadedSha }, context.options);
    expect(result).toMatchObject({
      status: "conflict",
      operation,
      diagnostics: [{ message: conflictMessage }],
      commitSha: null,
      commitUrl: null
    });
    expect(context.write).toHaveBeenCalledTimes(1);
    expect(context.write.mock.calls[0]?.[0].expectedBlobSha).toBe(loadedSha);
    expect(context.read).toHaveBeenCalledTimes(1);
    expectSafe(result);
  });

  it("retains no_changes precedence over stale SHA and never writes", async () => {
    const context = setup();
    context.read.mockResolvedValue(found("new-sha", draft.content));
    const result = await saveTemplateWorkflow(draft, context.options);
    expect(result).toMatchObject({
      status: "no_changes",
      operation: "update",
      diagnostics: [{ message: "No workflow changes to save." }]
    });
    expect(context.write).not.toHaveBeenCalled();
    expectSafe(result);
  });

  it("does not write unconfirmed saves or public previews", async () => {
    const context = setup();
    expect(
      (await saveTemplateWorkflow({ ...draft, confirmed: false }, context.options)).status
    ).toBe("ready");
    expect((await previewTemplateWorkflowSave(draft, context.options)).status).toBe("ready");
    expect(context.write).not.toHaveBeenCalled();
  });
});
