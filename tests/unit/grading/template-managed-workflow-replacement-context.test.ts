import { describe, expect, it, vi } from "vitest";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import {
  previewPreparedTemplateManagedWorkflowReplacement,
  installPreparedTemplateManagedWorkflowReplacement
} from "../../../src/grading/template-managed-workflow-replacement-context.js";

const prepared = {
  owner: "course",
  name: "template",
  branch: "configured-main",
  grading: {
    enabled: true as const,
    mode: "preset" as const,
    preset: "java-junit-checkstyle" as const,
    workflow: ".github/workflows/grade.yml",
    artifact: "grading-results",
    result_file: "grading-results.json"
  }
};
const repository = {
  id: 1,
  owner: "course",
  name: "template",
  fullName: "course/template",
  private: true,
  archived: false,
  defaultBranch: "main",
  htmlUrl: "https://github.com/course/template"
};

describe("template workflow replacement trusted context", () => {
  it("forwards the supplied client and configured branch to preview and install", async () => {
    const client = new FakeGitHubClient({ repositories: [repository] });
    const preview = vi.fn().mockResolvedValue({ contentFingerprint: "observed" });
    const install = vi.fn().mockResolvedValue({ workflow: { status: "stale" } });
    await expect(
      previewPreparedTemplateManagedWorkflowReplacement(prepared, client, { preview })
    ).resolves.toEqual({ status: "ready", preview: { contentFingerprint: "observed" } });
    expect(preview).toHaveBeenCalledExactlyOnceWith({
      githubClient: client,
      repository: { owner: "course", name: "template", defaultBranch: "configured-main" },
      grading: prepared.grading
    });
    await expect(
      installPreparedTemplateManagedWorkflowReplacement(
        prepared,
        client,
        true,
        { install },
        "expected"
      )
    ).resolves.toMatchObject({ status: "success", result: { workflow: { status: "stale" } } });
    expect(install).toHaveBeenCalledExactlyOnceWith({
      githubClient: client,
      repository: { owner: "course", name: "template", defaultBranch: "configured-main" },
      grading: prepared.grading,
      confirmed: true,
      expectedContentFingerprint: "expected"
    });
  });

  it("preserves safe repository and operation failures", async () => {
    const client = new FakeGitHubClient();
    const install = vi.fn();
    await expect(
      installPreparedTemplateManagedWorkflowReplacement(prepared, client, false, { install })
    ).resolves.toEqual({ status: "repository_unavailable" });
    expect(install).not.toHaveBeenCalled();
    vi.spyOn(client, "getRepository").mockRejectedValue(new Error("private detail"));
    await expect(
      previewPreparedTemplateManagedWorkflowReplacement(prepared, client)
    ).resolves.toEqual({ status: "github_operation_failed" });
  });
});
