import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDugiteGitWorkspaceFactory } from "../../../src/git/dugite-git-workspace-context.js";
import {
  loadGradingState,
  saveGradingState,
  type GradingState
} from "../../../src/grading/grading-state.js";
import { updateGradingStudentRepository } from "../../../src/grading/grading-student-repository-update.js";
import { resolveGradingSubmissionContext } from "../../../src/grading/grading-submission-context.js";
import {
  calculateGrade,
  editAppliedComment
} from "../../../src/grading/grading-state-operations.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const git = (root: string, ...args: string[]): string =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
const identity = (root: string): void => {
  git(root, "config", "user.name", "Faculty");
  git(root, "config", "user.email", "faculty@example.test");
};
const fixture = async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-student-update-"));
  roots.push(root);
  const remote = path.join(root, "remote.git"),
    student = path.join(root, "student"),
    local = path.join(root, "instructor");
  git(root, "init", "--bare", remote);
  git(root, "clone", remote, student);
  identity(student);
  fs.writeFileSync(
    path.join(student, "Main.java"),
    "header\nunique source\nrepeat\nremoved\nfooter\n"
  );
  fs.writeFileSync(path.join(student, "feedback.txt"), "Original report");
  git(student, "add", ".");
  git(student, "commit", "-m", "Student submission");
  git(student, "push", "-u", "origin", "HEAD");
  git(root, "clone", remote, local);
  identity(local);
  const sha = git(local, "rev-parse", "HEAD");
  const request = { courseRoot: root, termCode: "27s1", assignmentSlug: "lab1", studentId: "ada" };
  const state: GradingState = {
    schemaVersion: 1,
    studentId: "ada",
    submissionCommitSha: sha,
    status: "published",
    appliedComments: [
      {
        id: "reusable",
        sourceCommentId: "library-1",
        text: "Source deduction",
        deduction: -2,
        rubricCategoryId: "code",
        sourceLocation: { file: "Main.java", startLine: 2, endLine: 2 }
      },
      {
        id: "ambiguous",
        text: "Keep ambiguous",
        deduction: -1,
        sourceLocation: { file: "Main.java", startLine: 3, endLine: 3 }
      },
      {
        id: "deleted",
        text: "Keep deleted",
        deduction: -1,
        sourceLocation: { file: "Main.java", startLine: 4, endLine: 4 }
      },
      { id: "automated", text: "Existing automated deduction", deduction: -3 }
    ],
    manualAdjustments: [
      { id: "score", rubricCategoryId: "code", amount: -1, note: "Instructor notes" }
    ],
    viewState: { scrollTop: 10, cursor: { file: "Main.java", line: 2, column: 1 } }
  };
  expect(saveGradingState(request, state).status).toBe("success");
  const workspace = await createDugiteGitWorkspaceFactory().open(local);
  const read = (): GradingState => {
    const result = loadGradingState(request);
    if (result.status !== "success") throw new Error(result.status);
    return result.value;
  };
  const advance = (text = "inserted\nheader\nunique source\nrepeat\nrepeat\nfooter\n"): void => {
    fs.writeFileSync(path.join(student, "Main.java"), text);
    git(student, "commit", "-am", "Student corrections");
    git(student, "push");
  };
  return { root, request, state, workspace, read, advance, student, local, sha };
};
const rubric = [{ id: "code", name: "Code", points: 20 }];

describe("authorized student repository update", () => {
  it("pulls remote corrections, advances canonical SHA, preserves all grading, and conservatively maps anchors", async () => {
    const f = await fixture();
    // Uncommitted instructor feedback is retained by a normal Git update.
    fs.writeFileSync(path.join(f.local, "instructor-notes.txt"), "Local notes");
    fs.writeFileSync(path.join(f.local, "feedback.txt"), "Revised instructor report");
    f.advance();
    const pull = vi.spyOn(f.workspace, "pullUpstream");
    expect(await updateGradingStudentRepository(f.request, f.workspace)).toEqual({
      status: "success"
    });
    expect(pull).toHaveBeenCalledExactlyOnceWith({ expectedHead: f.sha });
    const updated = f.read();
    expect(updated.submissionCommitSha).toBe(git(f.student, "rev-parse", "HEAD"));
    expect(updated.submissionCommitSha).toBe(await f.workspace.resolveHead());
    expect(updated.repositoryUpdates?.[0]?.previousSha).toBe(f.sha);
    expect(updated.repositoryUpdates?.[0]?.newSha).toBe(updated.submissionCommitSha);
    expect(updated.repositoryUpdates?.[0]?.updatedAt).toEqual(expect.any(String));
    expect(updated.updatedSinceGrading).toBe(true);
    expect(updated.status).toBe("published");
    expect(updated.manualAdjustments).toEqual(f.state.manualAdjustments);
    expect(updated.viewState).toEqual(f.state.viewState);
    expect(calculateGrade(updated, rubric)).toEqual(calculateGrade(f.state, rubric));
    for (const [index, comment] of updated.appliedComments.entries()) {
      const original = f.state.appliedComments[index];
      expect({
        id: comment.id,
        sourceCommentId: comment.sourceCommentId,
        text: comment.text,
        deduction: comment.deduction,
        rubricCategoryId: comment.rubricCategoryId
      }).toEqual({
        id: original?.id,
        sourceCommentId: original?.sourceCommentId,
        text: original?.text,
        deduction: original?.deduction,
        rubricCategoryId: original?.rubricCategoryId
      });
    }
    expect(updated.appliedComments[0]).toMatchObject({
      sourceLocation: { startLine: 3, endLine: 3 },
      sourceAnchor: {
        status: "relocated",
        originalCommitSha: f.sha,
        originalText: "unique source",
        originalLocation: { startLine: 2 }
      }
    });
    for (const index of [1, 2])
      expect(updated.appliedComments[index]).toMatchObject({
        sourceLocation: f.state.appliedComments[index]?.sourceLocation,
        sourceAnchor: { status: "stale", originalCommitSha: f.sha }
      });
    expect(updated.appliedComments[3]).toEqual(f.state.appliedComments[3]);
    expect(fs.readFileSync(path.join(f.local, "feedback.txt"), "utf8")).toBe(
      "Revised instructor report"
    );
    expect(fs.readFileSync(path.join(f.local, "instructor-notes.txt"), "utf8")).toBe("Local notes");
    expect(
      resolveGradingSubmissionContext({
        courseFolderPath: f.root,
        ...f.request,
        currentSubmissionCommitSha: updated.submissionCommitSha
      }).status
    ).toBe("success");
    // Stale context survives text-only edits until explicitly re-anchored.
    const edited = editAppliedComment(updated, "deleted", {
      text: "Revised feedback",
      deduction: -1,
      sourceLocation: updated.appliedComments[2]?.sourceLocation
    });
    expect(
      edited.status === "success" && edited.value.appliedComments[2]?.sourceAnchor?.status
    ).toBe("stale");
    f.advance("another insertion\ninserted\nheader\nunique source\nrepeat\nrepeat\nfooter\n");
    expect((await updateGradingStudentRepository(f.request, f.workspace)).status).toBe("success");
    expect(f.read().repositoryUpdates).toHaveLength(2);
    expect(f.read().appliedComments[0]?.sourceAnchor?.originalCommitSha).toBe(f.sha);
    expect(f.read().appliedComments[1]?.sourceAnchor?.status).toBe("stale");
  });

  it("leaves an up-to-date repository and grading state unchanged", async () => {
    const f = await fixture();
    expect(await updateGradingStudentRepository(f.request, f.workspace)).toEqual({
      status: "unchanged"
    });
    expect(f.read()).toEqual(f.state);
  });

  it("stops real merge conflicts with canonical SHA and grading work intact", async () => {
    const f = await fixture();
    fs.writeFileSync(path.join(f.local, "Main.java"), "instructor edits\n");
    git(f.local, "commit", "-am", "Instructor changes");
    const state = { ...f.state, submissionCommitSha: git(f.local, "rev-parse", "HEAD") };
    saveGradingState(f.request, state);
    f.advance("student edits\n");
    const result = await updateGradingStudentRepository(f.request, f.workspace);
    expect(result.status).toBe("merge_conflict");
    expect(result.message).toMatch(/manually/u);
    expect(f.read()).toEqual(state);
    expect(await f.workspace.resolveHead()).toBe(state.submissionCommitSha);
    expect((await f.workspace.inspect()).workingTree.conflicts).toHaveLength(1);
    expect(fs.readFileSync(path.join(f.local, "Main.java"), "utf8")).toContain("instructor edits");
  });

  it("continues rejecting external/manual commits and never adopts them via the update action", async () => {
    const f = await fixture();
    f.advance();
    git(f.local, "pull", "--no-rebase");
    const currentSubmissionCommitSha = git(f.local, "rev-parse", "HEAD");
    expect(
      resolveGradingSubmissionContext({
        ...f.request,
        courseFolderPath: f.root,
        currentSubmissionCommitSha
      }).status
    ).toBe("submission_changed");
    const pull = vi.spyOn(f.workspace, "pullUpstream");
    expect(await updateGradingStudentRepository(f.request, f.workspace)).toEqual({
      status: "submission_changed"
    });
    expect(pull).not.toHaveBeenCalled();
    expect(f.read()).toEqual(f.state);
  });

  it("does not overwrite grading edits made while Git is running", async () => {
    const f = await fixture();
    f.advance();
    const pull = f.workspace.pullUpstream.bind(f.workspace);
    vi.spyOn(f.workspace, "pullUpstream").mockImplementation(async () => {
      const result = await pull();
      saveGradingState(f.request, {
        ...f.state,
        manualAdjustments: [
          ...f.state.manualAdjustments,
          { id: "new", rubricCategoryId: "code", amount: 0, note: "Concurrent note" }
        ]
      });
      return result;
    });
    expect((await updateGradingStudentRepository(f.request, f.workspace)).status).toBe(
      "update_state_record_failed"
    );
    expect(f.read().submissionCommitSha).toBe(f.sha);
    expect(f.read().manualAdjustments[1]?.note).toBe("Concurrent note");
  });
});
