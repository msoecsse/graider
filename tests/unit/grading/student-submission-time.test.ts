import { describe, expect, it, vi } from "vitest";
import { findStudentSubmissionTime } from "../../../src/grading/student-submission-time.js";
import type { GitWorkspaceReader, ObjectId, GitTreeEntry } from "../../../src/git/git-workspace.js";
import { makeTestGitSha } from "../../test-git-sha.js";

const INITIAL = makeTestGitSha("a") as ObjectId;
const STUDENT = makeTestGitSha("b") as ObjectId;
const REPORT = makeTestGitSha("c") as ObjectId;
const FOLLOW_UP = makeTestGitSha("d") as ObjectId;
const SUBMITTED = "2026-11-21T12:00:00-06:00";
const RESUBMITTED = "2026-11-23T15:00:00-06:00";
const paths = ["grading/report.html", "custom/feedback.html", ".github/workflows/graider.yml"];
const tree = (source: string, report = "old"): readonly GitTreeEntry[] =>
  [
    ["src/Main.java", source],
    ["grading/report.html", report],
    ["custom/feedback.html", report],
    [".github/workflows/graider.yml", report],
    [".graider/report.json", report]
  ].map(([file, blob]) => ({
    path: file as GitTreeEntry["path"],
    objectId: blob as ObjectId,
    mode: "100644",
    objectType: "blob"
  }));
const fixture = (head: ObjectId = REPORT) => {
  const revisions = [FOLLOW_UP, REPORT, STUDENT, INITIAL].slice(
    [FOLLOW_UP, REPORT, STUDENT, INITIAL].indexOf(head)
  );
  const trees = new Map([
    [INITIAL, tree("template")],
    [STUDENT, tree("student")],
    [REPORT, tree("student", "published")],
    [FOLLOW_UP, tree("resubmission", "published")]
  ]);
  const workspace = {
    listFirstParentCommitTrees: vi
      .fn()
      .mockResolvedValue(revisions.map((commit) => ({ commit, tree: commit }))),
    listTree: vi.fn((sha: ObjectId) => Promise.resolve(trees.get(sha) ?? [])),
    listCommits: vi.fn(({ anchor }: { anchor: ObjectId }) =>
      Promise.resolve([
        { id: anchor, committedAt: anchor === FOLLOW_UP ? RESUBMITTED : SUBMITTED, subject: "Work" }
      ])
    )
  };
  return { workspace, reader: workspace as unknown as GitWorkspaceReader };
};

describe("student submission time from local committed content", () => {
  it("ignores feedback-only HEAD and uses the last substantive student commit", async () => {
    const { reader, workspace } = fixture();
    await expect(findStudentSubmissionTime(reader, REPORT, paths)).resolves.toBe(SUBMITTED);
    expect(workspace.listCommits).toHaveBeenCalledWith({ anchor: STUDENT, maximumCount: 1 });
  });

  it("uses follow-up student work rather than the original submission", async () => {
    const { reader } = fixture(FOLLOW_UP);
    await expect(findStudentSubmissionTime(reader, FOLLOW_UP, paths)).resolves.toBe(RESUBMITTED);
  });

  it("does not invent a submission time from a template/root or incomplete history", async () => {
    const { reader } = fixture(INITIAL);
    await expect(findStudentSubmissionTime(reader, INITIAL, paths)).resolves.toBeNull();
  });

  it("treats binary identities, file modes, deletion, and unknown paths as student work", async () => {
    for (const entries of [
      tree("binary-change"),
      tree("student").map((entry) =>
        entry.path === "src/Main.java" ? { ...entry, mode: "100755" } : entry
      ),
      [],
      [
        ...tree("student"),
        ...tree("student")
          .slice(0, 1)
          .map((entry) => ({ ...entry, path: "other.txt" as GitTreeEntry["path"] }))
      ]
    ]) {
      const { reader, workspace } = fixture();
      workspace.listTree.mockImplementation((sha) =>
        Promise.resolve(sha === REPORT ? entries : tree("student"))
      );
      await expect(findStudentSubmissionTime(reader, REPORT, paths)).resolves.toBe(SUBMITTED);
      expect(workspace.listCommits).toHaveBeenCalledWith({ anchor: REPORT, maximumCount: 1 });
    }
  });

  it("returns unavailable for failed reads or invalid timestamps without falling back to HEAD", async () => {
    const failed = fixture();
    failed.workspace.listTree.mockRejectedValue(new Error("unavailable"));
    await expect(findStudentSubmissionTime(failed.reader, REPORT, paths)).resolves.toBeNull();
    const invalid = fixture();
    invalid.workspace.listCommits.mockResolvedValue([
      { id: STUDENT, committedAt: "invalid", subject: "Work" }
    ]);
    await expect(findStudentSubmissionTime(invalid.reader, REPORT, paths)).resolves.toBeNull();
  });
});
