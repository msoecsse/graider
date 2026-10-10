import { describe, expect, it, vi } from "vitest";
import type { GitHubClient } from "./githubClientProvider.js";
import { replaceTemplateManagedWorkflow } from "./templateManagedWorkflowReplacementService.js";

const request = {
  courseFolderId: "course",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab",
  confirmed: true,
  previewFingerprint: "observed"
};
const client = {} as GitHubClient;
const setup = () => {
  const prepared = { repository: "trusted" };
  const backend = {
    prepareTemplateManagedWorkflowReplacement: vi.fn(() => ({
      status: "success",
      value: prepared
    })),
    previewPreparedTemplateManagedWorkflowReplacement: vi
      .fn()
      .mockResolvedValue({ status: "ready" }),
    installPreparedTemplateManagedWorkflowReplacement: vi
      .fn()
      .mockResolvedValue({ status: "success" })
  };
  const provideClient = vi.fn(() => client);
  const dependencies = {
    loadBackend: () => backend,
    provideClient,
    resolveToken: vi.fn().mockResolvedValue({ status: "success", token: "resolved-secret" })
  };
  return { backend, prepared, dependencies };
};

describe("template workflow replacement composition", () => {
  it.each([true, false])("forwards the exact client for confirmed=%s", async (confirmed) => {
    const { backend, prepared, dependencies } = setup();
    await replaceTemplateManagedWorkflow({ ...request, confirmed }, dependencies);
    expect(dependencies.provideClient).toHaveBeenCalledExactlyOnceWith("resolved-secret");
    const remote = confirmed
      ? backend.installPreparedTemplateManagedWorkflowReplacement
      : backend.previewPreparedTemplateManagedWorkflowReplacement;
    expect(remote.mock.calls[0]?.[1]).toBe(client);
    if (confirmed)
      expect(
        backend.installPreparedTemplateManagedWorkflowReplacement
      ).toHaveBeenCalledExactlyOnceWith(prepared, client, true, {}, "observed");
    else
      expect(
        backend.previewPreparedTemplateManagedWorkflowReplacement
      ).toHaveBeenCalledExactlyOnceWith(prepared, client);
  });

  it("does not construct a client or execute remote work after authentication failure", async () => {
    const { backend, dependencies } = setup();
    dependencies.resolveToken.mockResolvedValue({ status: "failure" });
    await expect(replaceTemplateManagedWorkflow(request, dependencies)).resolves.toEqual({
      status: "github_auth_unavailable"
    });
    expect(dependencies.provideClient).not.toHaveBeenCalled();
    expect(backend.previewPreparedTemplateManagedWorkflowReplacement).not.toHaveBeenCalled();
    expect(backend.installPreparedTemplateManagedWorkflowReplacement).not.toHaveBeenCalled();
  });
});
