import { describe, expect, it, vi } from "vitest";
import {
  createLocalRepositoryCommitHistoryReader,
  MAX_GRADING_COMMIT_HISTORY_COUNT
} from "./localRepositoryCommitHistory.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const OLDER_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("local repository commit-history reader", () => {
  it("verifies and explicitly anchors a newest-to-oldest, maximum-10 machine-format log", async () => {
    const runGit = vi
      .fn()
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(
        `${SHA}\0${"2026-09-11T10:15:30-05:00"}\0Latest subject\0\n${OLDER_SHA}\0${"2026-09-10T09:00:00-05:00"}\0Older subject\0\n`
      );
    const read = createLocalRepositoryCommitHistoryReader(runGit);

    await expect(read("/trusted/repository", SHA)).resolves.toEqual({
      status: "success",
      commits: [
        { sha: SHA, committedAt: "2026-09-11T10:15:30-05:00", message: "Latest subject" },
        { sha: OLDER_SHA, committedAt: "2026-09-10T09:00:00-05:00", message: "Older subject" }
      ]
    });
    expect(MAX_GRADING_COMMIT_HISTORY_COUNT).toBe(10);
    expect(runGit).toHaveBeenNthCalledWith(1, "/trusted/repository", [
      "cat-file",
      "-e",
      `${SHA}^{commit}`
    ]);
    expect(runGit).toHaveBeenNthCalledWith(2, "/trusted/repository", [
      "log",
      "--max-count=10",
      "--format=%H%x00%cI%x00%s%x00",
      SHA,
      "--"
    ]);
  });

  it("uses the commit subject and preserves shell/HTML text as inert DTO text", async () => {
    const message = "$(touch /tmp/nope) <script>alert(1)</script> \u001b[31mred\u001b[0m";
    const runGit = vi
      .fn()
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(`${SHA}\u00002026-09-11T10:15:30Z\u0000${message}\u0000\n`);
    await expect(
      createLocalRepositoryCommitHistoryReader(runGit)("/trusted/repo", SHA)
    ).resolves.toEqual({
      status: "success",
      commits: [
        {
          sha: SHA,
          committedAt: "2026-09-11T10:15:30Z",
          message: "$(touch /tmp/nope) <script>alert(1)</script> red"
        }
      ]
    });
    expect(runGit).toHaveBeenCalledTimes(2);
  });

  it("never returns more than the fixed compact history count", async () => {
    const records = Array.from({ length: 11 }, (_, index) => {
      const sha = index === 0 ? SHA : index.toString(16).padStart(40, "0");
      return `${sha}\u00002026-09-11T10:15:30Z\u0000Commit ${index}\u0000\n`;
    }).join("");
    const runGit = vi.fn().mockResolvedValueOnce("").mockResolvedValueOnce(records);
    const result = await createLocalRepositoryCommitHistoryReader(runGit)("/trusted/repo", SHA);
    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.commits).toHaveLength(10);
  });

  it("maps invalid or missing revisions separately from log/parsing failures", async () => {
    const missing = createLocalRepositoryCommitHistoryReader(
      vi.fn().mockRejectedValue(new Error("raw stderr /private/path"))
    );
    await expect(missing("/private/path", SHA)).resolves.toEqual({
      status: "submission_commit_unavailable"
    });

    const logFailure = createLocalRepositoryCommitHistoryReader(
      vi.fn().mockResolvedValueOnce("").mockRejectedValueOnce(new Error("raw stderr"))
    );
    await expect(logFailure("/private/path", SHA)).resolves.toEqual({
      status: "commit_history_unavailable"
    });

    const malformed = createLocalRepositoryCommitHistoryReader(
      vi.fn().mockResolvedValueOnce("").mockResolvedValueOnce("not structured output")
    );
    await expect(malformed("/private/path", SHA)).resolves.toEqual({
      status: "commit_history_unavailable"
    });
  });

  it("rejects renderer-like revision strings before Git and does not manufacture empty history", async () => {
    const runGit = vi.fn();
    await expect(
      createLocalRepositoryCommitHistoryReader(runGit)("/trusted/repo", "HEAD --all")
    ).resolves.toEqual({ status: "submission_commit_unavailable" });
    expect(runGit).not.toHaveBeenCalled();

    const empty = vi.fn().mockResolvedValueOnce("").mockResolvedValueOnce("");
    await expect(
      createLocalRepositoryCommitHistoryReader(empty)("/trusted/repo", SHA)
    ).resolves.toEqual({
      status: "commit_history_unavailable"
    });
  });
});
