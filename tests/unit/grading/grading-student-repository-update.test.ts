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
  // Keep host-wide ignore rules (notably .DS_Store) out of these fixtures.
  fs.writeFileSync(path.join(root, ".git/info/exclude"), "");
  git(root, "config", "core.excludesFile", path.join(root, ".git/info/exclude"));
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
  const update = () =>
    updateGradingStudentRepository(request, workspace, { expectedRepositoryRemote: () => remote });
  return { root, request, state, workspace, read, advance, student, local, sha, remote, update };
};
const rubric = [{ id: "code", name: "Code", points: 20 }];
const finderMetadata = Buffer.from("000000014275643100001000", "hex");

describe("authorized student repository update", () => {
  it.each([
    "managed",
    "externally pulled",
    "externally pulled then advanced again",
    "externally pulled with Finder metadata",
    "externally pulled with ignored files"
  ])(
    "%s: advances canonical SHA, preserves all grading, and conservatively maps anchors",
    async (mode) => {
      const f = await fixture();
      if (mode === "managed") {
        // Existing managed pull behavior retains nonoverlapping local feedback.
        fs.writeFileSync(path.join(f.local, "instructor-notes.txt"), "Local notes");
        fs.writeFileSync(path.join(f.local, "feedback.txt"), "Revised instructor report");
      }
      f.advance();
      if (mode !== "managed") {
        git(f.local, "pull");
        expect((await f.workspace.inspect()).workingTree).toEqual({
          trackedChanges: [],
          stagedChanges: [],
          untrackedPaths: [],
          conflicts: []
        });
        if (mode === "externally pulled with Finder metadata") {
          fs.mkdirSync(path.join(f.local, "src"));
          fs.writeFileSync(path.join(f.local, ".DS_Store"), finderMetadata);
          fs.writeFileSync(path.join(f.local, "src/.DS_Store"), finderMetadata);
          expect((await f.workspace.inspect()).workingTree.untrackedPaths).toEqual([
            ".DS_Store",
            "src/.DS_Store"
          ]);
        }
        if (mode === "externally pulled with ignored files") {
          fs.appendFileSync(path.join(f.local, ".git/info/exclude"), "\nignored-output/\n");
          fs.mkdirSync(path.join(f.local, "ignored-output"));
          fs.writeFileSync(path.join(f.local, "ignored-output/result.txt"), "build output");
        }
        expect(
          resolveGradingSubmissionContext({
            ...f.request,
            courseFolderPath: f.root,
            currentSubmissionCommitSha: git(f.local, "rev-parse", "HEAD")
          }).status
        ).toBe("submission_changed");
        expect(f.read()).toEqual(f.state);
        if (mode === "externally pulled then advanced again")
          f.advance(
            "remote advanced again\ninserted\nheader\nunique source\nrepeat\nrepeat\nfooter\n"
          );
      }
      const pull = vi.spyOn(f.workspace, "pullUpstream");
      const commit = vi.spyOn(f.workspace, "commit");
      expect(await f.update()).toEqual({
        status: "success"
      });
      expect(pull).toHaveBeenCalledExactlyOnceWith({
        expectedHead: f.sha,
        ...(mode === "managed" ? {} : { externalFastForward: { expectedRemote: f.remote } })
      });
      expect(commit).not.toHaveBeenCalled();
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
        sourceLocation: {
          startLine: mode === "externally pulled then advanced again" ? 4 : 3,
          endLine: mode === "externally pulled then advanced again" ? 4 : 3
        },
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
      if (mode === "externally pulled with Finder metadata") {
        expect(fs.readFileSync(path.join(f.local, ".DS_Store"))).toEqual(finderMetadata);
        expect(fs.readFileSync(path.join(f.local, "src/.DS_Store"))).toEqual(finderMetadata);
      }
      if (mode === "managed") {
        expect(fs.readFileSync(path.join(f.local, "feedback.txt"), "utf8")).toBe(
          "Revised instructor report"
        );
        expect(fs.readFileSync(path.join(f.local, "instructor-notes.txt"), "utf8")).toBe(
          "Local notes"
        );
      }
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
    }
  );

  it("leaves an up-to-date repository and grading state unchanged", async () => {
    const f = await fixture();
    expect((await f.workspace.inspect()).workingTree).toEqual({
      trackedChanges: [],
      stagedChanges: [],
      untrackedPaths: [],
      conflicts: []
    });
    expect(await updateGradingStudentRepository(f.request, f.workspace)).toEqual({
      status: "unchanged"
    });
    expect(f.read()).toEqual(f.state);
  });

  it.each([
    ["unstaged", "modified tracked files", "Main.java"],
    ["staged", "staged files", "Main.java"],
    ["untracked", "untracked files", "notes.txt"],
    ["feedback", "modified tracked files", "feedback.txt"],
    ["untracked feedback", "untracked files", "grading/report.html"],
    ["fake Finder file", "untracked files", ".DS_Store"],
    ["Finder symlink", "untracked files", ".DS_Store"],
    ["tracked Finder file", "modified tracked files", ".DS_Store"],
    ["staged Finder file", "staged files", ".DS_Store"]
  ])("blocks %s and reports its category and relative path", async (mode, category, file) => {
    const f = await fixture();
    if (mode === "tracked Finder file") {
      fs.writeFileSync(path.join(f.student, file), finderMetadata);
      git(f.student, "add", file);
      git(f.student, "commit", "-m", "Tracked Finder file");
      git(f.student, "push");
    }
    f.advance();
    git(f.local, "pull");
    fs.mkdirSync(path.dirname(path.join(f.local, file)), { recursive: true });
    if (mode === "Finder symlink") fs.symlinkSync("Main.java", path.join(f.local, file));
    else
      fs.writeFileSync(
        path.join(f.local, file),
        mode === "staged Finder file" ? finderMetadata : "local edits"
      );
    if (mode === "staged" || mode === "staged Finder file") git(f.local, "add", file);
    const head = await f.workspace.resolveHead();
    const before = git(f.local, "status", "--porcelain=v2");
    const result = await f.update();
    expect(result.status).toBe("submission_changed");
    expect(result.message).toContain(`${category}: ${JSON.stringify(file)}`);
    expect(result.message).not.toContain(f.local);
    expect(f.read()).toEqual(f.state);
    expect(await f.workspace.resolveHead()).toBe(head);
    expect(git(f.local, "status", "--porcelain=v2")).toBe(before);
  });

  it.each(["ahead", "behind"])(
    "adopts clean committed history with %s tracking metadata",
    async (relation) => {
      const f = await fixture();
      f.advance();
      git(f.local, "pull");
      if (relation === "ahead") {
        const branch = git(f.local, "branch", "--show-current");
        git(f.local, "update-ref", `refs/remotes/origin/${branch}`, f.sha);
      } else {
        f.advance("further student corrections\n");
        git(f.local, "fetch");
      }
      expect(await f.workspace.resolveHead()).not.toBe(f.sha);
      expect(await f.workspace.inspect()).toMatchObject({
        workingTree: { trackedChanges: [], stagedChanges: [], untrackedPaths: [], conflicts: [] },
        upstream: { relation }
      });
      expect(await f.update()).toEqual({ status: "success" });
      expect(f.read().submissionCommitSha).toBe(git(f.student, "rev-parse", "HEAD"));
    }
  );

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

  it.each(["dirty", "local-only", "divergent", "rewritten", "remote mismatch", "conflicted"])(
    "refuses unsafe external state: %s",
    async (mode) => {
      const f = await fixture();
      f.advance();
      git(f.local, "pull", "--ff-only");
      if (mode === "dirty") fs.writeFileSync(path.join(f.local, "notes.txt"), "unsaved");
      if (mode === "local-only" || mode === "divergent" || mode === "conflicted") {
        fs.writeFileSync(path.join(f.local, "Main.java"), "instructor changes\n");
        git(f.local, "commit", "-am", "Manual changes");
        if (mode !== "local-only") f.advance("different student changes\n");
        if (mode === "conflicted") {
          expect(() => git(f.local, "pull", "--no-rebase")).toThrow();
        }
      }
      if (mode === "rewritten") {
        git(f.local, "checkout", "--orphan", "replacement");
        git(f.local, "commit", "-m", "Unrelated history");
        git(
          f.local,
          "branch",
          "--set-upstream-to",
          "origin/" + git(f.student, "branch", "--show-current")
        );
      }
      if (mode === "remote mismatch") git(f.local, "remote", "set-url", "origin", f.student);
      const head = await f.workspace.resolveHead();
      const result = await f.update();
      expect(result.status).toBe(mode === "conflicted" ? "merge_conflict" : "submission_changed");
      expect(result.message).toEqual(expect.any(String));
      if (mode === "dirty") expect(result.message).toContain('untracked files: "notes.txt"');
      if (mode === "conflicted")
        expect(result.message).toContain('unmerged/conflicted files: "Main.java"');
      expect(f.read()).toEqual(f.state);
      expect(await f.workspace.resolveHead()).toBe(head);
      expect(
        resolveGradingSubmissionContext({
          ...f.request,
          courseFolderPath: f.root,
          currentSubmissionCommitSha: head
        }).status
      ).toBe("submission_changed");
    }
  );

  it("requires recorded repository identity before attempting recovery", async () => {
    const f = await fixture();
    f.advance();
    git(f.local, "pull", "--ff-only");
    const pull = vi.spyOn(f.workspace, "pullUpstream");
    expect((await updateGradingStudentRepository(f.request, f.workspace)).status).toBe(
      "submission_changed"
    );
    expect(pull).not.toHaveBeenCalled();
    expect(f.read()).toEqual(f.state);
  });

  it("derives the recovery remote from the persisted student repository mapping", async () => {
    const f = await fixture();
    f.advance();
    git(f.local, "pull", "--ff-only");
    const directory = path.join(f.root, "terms/27s1/manifests/lab1");
    fs.mkdirSync(directory, { recursive: true });
    const manifest = fs
      .readFileSync("tests/fixtures/manifest/valid-manifest/manifest.yml", "utf8")
      .replaceAll("lab04", "lab1")
      .replaceAll("student_id: jones", "student_id: ada");
    fs.writeFileSync(path.join(directory, "manifest.yml"), manifest);
    const pull = vi.spyOn(f.workspace, "pullUpstream").mockResolvedValue({ kind: "updated" });
    expect(await updateGradingStudentRepository(f.request, f.workspace)).toEqual({
      status: "success"
    });
    expect(pull).toHaveBeenCalledExactlyOnceWith({
      expectedHead: f.sha,
      externalFastForward: {
        expectedRemote: "https://github.com/example-org/27s1-se2030-lab1-seanjones.git"
      }
    });
    expect(f.read().submissionCommitSha).toBe(await f.workspace.resolveHead());
  });

  it("keeps the Git equality guard unless explicit external adoption is requested", async () => {
    const f = await fixture();
    f.advance();
    git(f.local, "pull", "--ff-only");
    await expect(f.workspace.pullUpstream({ expectedHead: f.sha })).rejects.toMatchObject({
      kind: "operation_rejected"
    });
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
