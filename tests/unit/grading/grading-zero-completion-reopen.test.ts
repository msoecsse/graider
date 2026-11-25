import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestGitSha } from "../../test-git-sha.js";
import { markGradingStudentCompleteContext } from "../../../src/grading/grading-student-complete-context.js";
import { updateGradingStudentRepository } from "../../../src/grading/grading-student-repository-update.js";
import { calculateGrade } from "../../../src/grading/grading-state-operations.js";
import { checkGradingStudentReportPublicationEligibility } from "../../../src/grading/grading-student-report-publication-context.js";
import { buildSubmissionSourceModel } from "../../../src/grading/submission-source.js";
import { resolveGradingSubmissionContext } from "../../../src/grading/grading-submission-context.js";
import {
  createGradingStatePath,
  loadGradingState,
  saveGradingState,
  type GradingState
} from "../../../src/grading/grading-state.js";

const SHA = makeTestGitSha("a");
const NEW_SHA = makeTestGitSha("b");
const roots: string[] = [];
const rubric = [{ id: "code", name: "Code", points: 100 }];
const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-zero-reopen-"));
  roots.push(root);
  const request = {
    courseFolderPath: root,
    termCode: "27s1",
    assignmentSlug: "lab1",
    studentId: "ada",
    currentSubmissionCommitSha: SHA
  };
  const stateRequest = { ...request, courseRoot: root };
  const state: GradingState = {
    schemaVersion: 1,
    studentId: "ada",
    submissionCommitSha: SHA,
    status: "in_progress",
    appliedComments: [{ id: "keep", text: "Instructor feedback", deduction: 2 }],
    manualAdjustments: [{ id: "keep", rubricCategoryId: "code", amount: -3, note: "Keep note" }],
    viewState: { scrollTop: 10, cursor: { file: "Main.java", line: 1, column: 1 } }
  };
  expect(saveGradingState(stateRequest, state).status).toBe("success");
  const statePath = createGradingStatePath(stateRequest);
  if (statePath.status !== "success") throw new Error(statePath.message);
  const read = (): GradingState => {
    const loaded = loadGradingState(stateRequest);
    if (loaded.status !== "success") throw new Error("Expected saved state");
    return loaded.value;
  };
  const undo = (sha = SHA) =>
    markGradingStudentCompleteContext({
      ...request,
      currentSubmissionCommitSha: sha,
      undoZeroAndComplete: true
    });
  return { root, request, stateRequest, state, statePath: statePath.value, read, undo };
};
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("explicit undo of zero completion", () => {
  it.each(["complete", "published", "in_progress"] as const)(
    "reopens a marked %s record without changing feedback, adjustments, SHA or saved reports",
    (status) => {
      const f = setup();
      const otherRequest = { ...f.stateRequest, studentId: "grace" };
      const otherState = { ...f.state, studentId: "grace", status: "published" as const };
      saveGradingState(otherRequest, otherState);
      const before = { ...f.state, status, finalScoreOverride: 0 as const };
      saveGradingState(f.stateRequest, before);
      const report = path.join(f.root, "saved-report.html");
      fs.writeFileSync(report, "Instructor custom report — preserve exactly");
      expect(f.undo()).toEqual({
        status: "success",
        studentId: "ada",
        gradingStatus: "in_progress"
      });
      expect(f.read()).toEqual({ ...f.state, status: "in_progress" });
      expect(calculateGrade(f.read(), rubric)).toMatchObject({
        status: "success",
        value: { totalScore: 95 }
      });
      expect(checkGradingStudentReportPublicationEligibility(f.request).status).toBe(
        "grading_not_complete"
      );
      expect(fs.readFileSync(report, "utf8")).toBe("Instructor custom report — preserve exactly");
      expect(loadGradingState(otherRequest)).toEqual({ status: "success", value: otherState });
    }
  );

  it.each(["submission", "feedback"] as const)(
    "persists zero completion through a %s pull until explicitly undone",
    async (change) => {
      const f = setup();
      expect(markGradingStudentCompleteContext({ ...f.request, setScoreToZero: true }).status).toBe(
        "success"
      );
      expect(f.read()).toMatchObject({ status: "complete", finalScoreOverride: 0 });
      let head = SHA;
      const freshSource = "Fresh student correction\n";
      const sourceFile = path.join(f.root, "src", "Main.java");
      fs.mkdirSync(path.dirname(sourceFile));
      fs.writeFileSync(sourceFile, freshSource);
      const workspace = {
        resolveHead: vi.fn(() => Promise.resolve(head)),
        pullUpstream: vi.fn(() => {
          head = NEW_SHA;
          return Promise.resolve({ kind: "updated" as const });
        }),
        listTree: vi.fn((sha: string) =>
          Promise.resolve([
            { path: "Main.java", objectId: change === "submission" ? sha : SHA, mode: "100644" },
            { path: "grading/report.html", objectId: sha, mode: "100644" }
          ])
        ),
        readRevisionFile: vi.fn(() => Promise.resolve(freshSource))
      };
      expect(
        await updateGradingStudentRepository(f.stateRequest, workspace, {
          expectedRepositoryRemote: () => "https://github.com/test/ada.git"
        })
      ).toEqual({ status: "success" });
      const pulled = f.read();
      expect(pulled).toMatchObject({
        submissionCommitSha: NEW_SHA,
        finalScoreOverride: 0,
        status: change === "submission" ? "in_progress" : "complete",
        appliedComments: f.state.appliedComments,
        manualAdjustments: f.state.manualAdjustments
      });
      expect(calculateGrade(pulled, rubric)).toMatchObject({
        status: "success",
        value: { totalScore: 0 }
      });
      expect(f.undo(NEW_SHA)).toMatchObject({ status: "success", gradingStatus: "in_progress" });
      const withoutOverride = { ...pulled };
      delete withoutOverride.finalScoreOverride;
      expect(f.read()).toEqual({ ...withoutOverride, status: "in_progress" });
      expect(calculateGrade(f.read(), rubric)).toMatchObject({
        status: "success",
        value: { totalScore: 95 }
      });
      expect(await workspace.readRevisionFile()).toBe(freshSource);
      expect(await workspace.resolveHead()).toBe(NEW_SHA);
      expect(
        resolveGradingSubmissionContext({ ...f.request, currentSubmissionCommitSha: NEW_SHA })
      ).toEqual({
        status: "success",
        value: { studentId: "ada", submissionCommitSha: NEW_SHA }
      });
      expect(
        buildSubmissionSourceModel({ repositoryRoot: f.root, requiredFiles: ["Main.java"] })
      ).toMatchObject({
        status: "success",
        value: { sections: [{ file: "src/Main.java", status: "found", sourceText: freshSource }] }
      });
      expect(fs.readFileSync(sourceFile, "utf8")).toBe(freshSource);
      expect(checkGradingStudentReportPublicationEligibility(f.request).status).toBe(
        "grading_not_complete"
      );
    }
  );

  it("reports a failed atomic save and leaves the prior zero decision intact", () => {
    const f = setup();
    saveGradingState(f.stateRequest, { ...f.state, status: "complete", finalScoreOverride: 0 });
    const before = fs.readFileSync(f.statePath, "utf8");
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("Disk write failed");
    });
    expect(f.undo()).toMatchObject({
      status: "grading_state_error",
      code: "grading_state_write_failed"
    });
    expect(fs.readFileSync(f.statePath, "utf8")).toBe(before);
  });

  it.each(["complete", "published", "in_progress"] as const)(
    "refuses an unmarked %s record, including a legitimate calculated zero",
    (status) => {
      const f = setup();
      saveGradingState(f.stateRequest, {
        ...f.state,
        status,
        manualAdjustments: [{ id: "real-zero", rubricCategoryId: "code", amount: -98 }]
      });
      const before = fs.readFileSync(f.statePath, "utf8");
      expect(f.undo()).toMatchObject({
        status: "grading_state_error",
        code: "zero_score_override_missing"
      });
      expect(fs.readFileSync(f.statePath, "utf8")).toBe(before);
    }
  );

  it("refuses missing, malformed, wrong-student, mismatched SHA and conflicting actions without writes", () => {
    const f = setup();
    saveGradingState(f.stateRequest, { ...f.state, finalScoreOverride: 0 });
    const before = fs.readFileSync(f.statePath, "utf8");
    expect(f.undo(NEW_SHA).status).toBe("submission_changed");
    expect(
      markGradingStudentCompleteContext({
        ...f.request,
        undoZeroAndComplete: true,
        setScoreToZero: true
      }).status
    ).toBe("grading_state_error");
    expect(fs.readFileSync(f.statePath, "utf8")).toBe(before);
    fs.writeFileSync(
      f.statePath,
      JSON.stringify({ ...f.state, studentId: "other", finalScoreOverride: 0 })
    );
    expect(f.undo()).toMatchObject({
      status: "grading_state_error",
      code: "grading_state_student_mismatch"
    });
    fs.writeFileSync(f.statePath, "{invalid");
    expect(f.undo().status).toBe("grading_state_error");
    expect(fs.readFileSync(f.statePath, "utf8")).toBe("{invalid");
    fs.rmSync(f.statePath);
    expect(f.undo()).toMatchObject({
      status: "grading_state_error",
      code: "zero_score_override_missing"
    });
    expect(fs.existsSync(f.statePath)).toBe(false);
  });
});
