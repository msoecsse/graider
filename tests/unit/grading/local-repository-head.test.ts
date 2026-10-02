import { describe, expect, it, vi } from "vitest";
import { makeTestGitSha } from "../../test-git-sha.js";
import type { GitWorkspaceReaderFactory } from "../../../ui/electron/gitWorkspaceReader.js";
import { createLocalRepositoryHeadReader } from "../../../ui/electron/localRepositoryHead.js";

describe("local repository HEAD reader", () => {
  it("opens the repository and semantically resolves a validated HEAD commit", async () => {
    const submissionCommitSha = makeTestGitSha("a");
    const workspace = {
      root: "/trusted/repository",
      resolveHead: vi.fn().mockResolvedValue(submissionCommitSha),
      resolveRevision: vi.fn(),
      listCommits: vi.fn()
    };
    const open = vi.fn().mockResolvedValue(workspace);
    const factory: GitWorkspaceReaderFactory = { open };
    const readHead = createLocalRepositoryHeadReader(factory);

    await expect(readHead("/trusted/repository")).resolves.toEqual({
      status: "success",
      submissionCommitSha
    });
    expect(open).toHaveBeenCalledWith("/trusted/repository");
    expect(workspace.resolveHead).toHaveBeenCalledOnce();
  });

  it("returns a typed safe failure for engine errors or invalid output", async () => {
    const unavailableFactory: GitWorkspaceReaderFactory = {
      open: vi.fn().mockRejectedValue(new Error("raw stderr /private/path"))
    };
    const rejected = createLocalRepositoryHeadReader(unavailableFactory);
    await expect(rejected("/private/path")).resolves.toEqual({
      status: "submission_commit_unavailable"
    });
    const malformedFactory: GitWorkspaceReaderFactory = {
      open: vi.fn().mockResolvedValue({
        root: "/private/path",
        resolveHead: vi.fn().mockResolvedValue("not-a-sha"),
        resolveRevision: vi.fn(),
        listCommits: vi.fn()
      })
    };
    const malformed = createLocalRepositoryHeadReader(malformedFactory);
    await expect(malformed("/private/path")).resolves.toEqual({
      status: "submission_commit_unavailable"
    });
  });
});
