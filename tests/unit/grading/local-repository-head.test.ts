import { describe, expect, it, vi } from "vitest";
import { makeTestGitSha } from "../../test-git-sha.js";
import { createLocalRepositoryHeadReader } from "../../../ui/electron/localRepositoryHead.js";

describe("local repository HEAD reader", () => {
  it("uses only local read-only rev-parse and returns a validated commit SHA", async () => {
    const submissionCommitSha = makeTestGitSha("a");
    const runGit = vi.fn().mockResolvedValue(`${submissionCommitSha}\n`);
    const readHead = createLocalRepositoryHeadReader(runGit);

    await expect(readHead("/trusted/repository")).resolves.toEqual({
      status: "success",
      submissionCommitSha
    });
    expect(runGit).toHaveBeenCalledWith("/trusted/repository", ["rev-parse", "--verify", "HEAD"]);
  });

  it("returns a typed safe failure for command errors or invalid output", async () => {
    const rejected = createLocalRepositoryHeadReader(vi.fn().mockRejectedValue(new Error("raw")));
    await expect(rejected("/private/path")).resolves.toEqual({
      status: "submission_commit_unavailable"
    });
    const malformed = createLocalRepositoryHeadReader(vi.fn().mockResolvedValue("not-a-sha"));
    await expect(malformed("/private/path")).resolves.toEqual({
      status: "submission_commit_unavailable"
    });
  });
});
