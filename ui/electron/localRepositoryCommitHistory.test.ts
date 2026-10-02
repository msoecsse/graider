import { describe, expect, it, vi } from "vitest";
import type { GitWorkspaceReader, GitWorkspaceReaderFactory } from "./gitWorkspaceReader.js";
import {
  createLocalRepositoryCommitHistoryReader,
  MAX_GRADING_COMMIT_HISTORY_COUNT
} from "./localRepositoryCommitHistory.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const OLDER_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const createFactory = (workspace: Partial<GitWorkspaceReader>) => {
  const completeWorkspace: GitWorkspaceReader = {
    root: "/trusted/repository",
    resolveHead: vi.fn(),
    resolveRevision: vi.fn().mockResolvedValue(SHA),
    listCommits: vi.fn().mockResolvedValue([]),
    ...workspace
  };
  const factory: GitWorkspaceReaderFactory = { open: vi.fn().mockResolvedValue(completeWorkspace) };
  return { factory, workspace: completeWorkspace };
};

describe("local repository commit-history reader", () => {
  it("verifies an exact revision and requests a newest-to-oldest maximum-10 history", async () => {
    const { factory, workspace } = createFactory({
      listCommits: vi.fn().mockResolvedValue([
        { id: SHA, committedAt: "2026-09-11T10:15:30-05:00", subject: "Latest subject" },
        { id: OLDER_SHA, committedAt: "2026-09-10T09:00:00-05:00", subject: "Older subject" }
      ])
    });
    await expect(
      createLocalRepositoryCommitHistoryReader(factory)("/trusted/repository", SHA)
    ).resolves.toEqual({
      status: "success",
      commits: [
        { sha: SHA, committedAt: "2026-09-11T10:15:30-05:00", message: "Latest subject" },
        { sha: OLDER_SHA, committedAt: "2026-09-10T09:00:00-05:00", message: "Older subject" }
      ]
    });
    expect(MAX_GRADING_COMMIT_HISTORY_COUNT).toBe(10);
    expect(factory.open).toHaveBeenCalledWith("/trusted/repository");
    expect(workspace.resolveRevision).toHaveBeenCalledWith(SHA);
    expect(workspace.listCommits).toHaveBeenCalledWith({ anchor: SHA, maximumCount: 10 });
  });

  it("preserves shell/HTML subject text as inert DTO text and strips controls", async () => {
    const subject = "$(touch /tmp/nope) <script>alert(1)</script> \u001b[31mred\u001b[0m";
    const { factory } = createFactory({
      listCommits: vi
        .fn()
        .mockResolvedValue([{ id: SHA, committedAt: "2026-09-11T10:15:30Z", subject }])
    });
    await expect(
      createLocalRepositoryCommitHistoryReader(factory)("/trusted/repo", SHA)
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
  });

  it("never returns more than the fixed compact history count", async () => {
    const records = Array.from({ length: 11 }, (_, index) => ({
      id: index === 0 ? SHA : index.toString(16).padStart(40, "0"),
      committedAt: "2026-09-11T10:15:30Z",
      subject: `Commit ${String(index)}`
    }));
    const { factory } = createFactory({ listCommits: vi.fn().mockResolvedValue(records) });
    const result = await createLocalRepositoryCommitHistoryReader(factory)("/trusted/repo", SHA);
    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.commits).toHaveLength(10);
  });

  it("maps unavailable revisions separately from history failures", async () => {
    const missing = createFactory({
      resolveRevision: vi.fn().mockRejectedValue(new Error("raw stderr /private/path"))
    });
    await expect(
      createLocalRepositoryCommitHistoryReader(missing.factory)("/private/path", SHA)
    ).resolves.toEqual({ status: "submission_commit_unavailable" });

    const failedHistory = createFactory({
      listCommits: vi.fn().mockRejectedValue(new Error("raw stderr"))
    });
    await expect(
      createLocalRepositoryCommitHistoryReader(failedHistory.factory)("/private/path", SHA)
    ).resolves.toEqual({ status: "commit_history_unavailable" });
  });

  it("rejects malformed or empty structured history", async () => {
    const malformed = createFactory({
      listCommits: vi
        .fn()
        .mockResolvedValue([{ id: "not-a-sha", committedAt: "not-a-date", subject: "Subject" }])
    });
    await expect(
      createLocalRepositoryCommitHistoryReader(malformed.factory)("/trusted/repo", SHA)
    ).resolves.toEqual({ status: "commit_history_unavailable" });
    const empty = createFactory({ listCommits: vi.fn().mockResolvedValue([]) });
    await expect(
      createLocalRepositoryCommitHistoryReader(empty.factory)("/trusted/repo", SHA)
    ).resolves.toEqual({ status: "commit_history_unavailable" });
  });

  it("rejects renderer-like revision strings before opening a workspace", async () => {
    const { factory } = createFactory({});
    await expect(
      createLocalRepositoryCommitHistoryReader(factory)("/trusted/repo", "HEAD --all")
    ).resolves.toEqual({ status: "submission_commit_unavailable" });
    expect(factory.open).not.toHaveBeenCalled();
  });

  it("rejects history whose first entry is not the verified anchor", async () => {
    const { factory } = createFactory({
      listCommits: vi
        .fn()
        .mockResolvedValue([
          { id: OLDER_SHA, committedAt: "2026-09-10T09:00:00Z", subject: "Wrong anchor" }
        ])
    });
    await expect(
      createLocalRepositoryCommitHistoryReader(factory)("/trusted/repo", SHA)
    ).resolves.toEqual({ status: "commit_history_unavailable" });
  });
});
