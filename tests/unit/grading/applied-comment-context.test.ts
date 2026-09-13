import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTestGitSha } from "../../test-git-sha.js";
import {
  addGradingStudentCommentContext,
  deleteGradingStudentCommentContext,
  editGradingStudentCommentContext
} from "../../../src/grading/applied-comment-context.js";
import {
  createGradingStatePath,
  createInitialGradingState,
  loadGradingState,
  saveGradingState
} from "../../../src/grading/grading-state.js";

const SHA = makeTestGitSha("a");
const roots: string[] = [];
const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-comment-context-"));
  roots.push(root);
  const courseFolderPath = path.join(root, "course");
  fs.cpSync(path.resolve("tests/fixtures/roster/valid-course"), courseFolderPath, {
    recursive: true
  });
  const assignment = path.join(courseFolderPath, "terms/27s1/assignments/lab04/assignment.yml");
  fs.appendFileSync(
    assignment,
    "\ngrading:\n  required_files:\n    - src/Main.java\n  rubric:\n    - id: design\n      name: Design\n      points: 10\n"
  );
  const request = {
    courseFolderPath,
    termCode: "27s1",
    assignmentSlug: "lab04",
    studentId: "jones",
    currentSubmissionCommitSha: SHA
  };
  return {
    request,
    stateRequest: {
      courseRoot: courseFolderPath,
      termCode: "27s1",
      assignmentSlug: "lab04",
      studentId: "jones"
    }
  };
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("applied grading comment context", () => {
  it("creates state from trusted HEAD, preserves snapshots, and validates rubric/source configuration", () => {
    const { request, stateRequest } = setup();
    expect(
      addGradingStudentCommentContext(request, {
        id: "library-snapshot",
        sourceCommentId: "library-id",
        text: "Use a clearer name.",
        deduction: -2,
        rubricCategoryId: "design",
        sourceLocation: { file: "src/Main.java", startLine: 3, endLine: 4 }
      })
    ).toMatchObject({ status: "success", gradingStatus: "in_progress" });
    expect(loadGradingState(stateRequest)).toMatchObject({
      status: "success",
      value: {
        submissionCommitSha: SHA,
        appliedComments: [
          { id: "library-snapshot", sourceCommentId: "library-id", text: "Use a clearer name." }
        ]
      }
    });
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    const before = fs.readFileSync(statePath.value, "utf8");
    expect(
      addGradingStudentCommentContext(request, {
        id: "bad-category",
        text: "Nope",
        deduction: -1,
        rubricCategoryId: "unknown"
      })
    ).toMatchObject({ status: "grading_state_error", code: "rubric_category_mismatch" });
    expect(
      addGradingStudentCommentContext(request, {
        id: "bad-file",
        text: "Nope",
        deduction: -1,
        sourceLocation: { file: "/tmp/Main.java", startLine: 1, endLine: 1 }
      })
    ).toMatchObject({ status: "grading_state_error" });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);
  });

  it("edits and deletes exactly one comment while preserving state and published transition", () => {
    const { request, stateRequest } = setup();
    const created = createInitialGradingState("jones", SHA);
    if (created.status === "failure") throw new Error(created.message);
    saveGradingState(stateRequest, {
      ...created.value,
      status: "published",
      appliedComments: [
        { id: "edit", text: "Old", deduction: -1 },
        { id: "other", text: "Keep", deduction: -2 }
      ],
      manualAdjustments: [{ id: "manual", rubricCategoryId: "design", amount: -1 }],
      viewState: { scrollTop: 1, cursor: { file: "src/Main.java", line: 1, column: 1 } }
    });
    expect(
      editGradingStudentCommentContext(request, "edit", {
        text: "New",
        deduction: -3,
        rubricCategoryId: "design",
        sourceLocation: { file: "src/Main.java", startLine: 2, endLine: 2 }
      })
    ).toMatchObject({ status: "success", gradingStatus: "complete" });
    expect(
      editGradingStudentCommentContext(request, "edit", { text: "General", deduction: -2 })
    ).toMatchObject({ status: "success" });
    const afterRemoval = loadGradingState(stateRequest);
    if (afterRemoval.status !== "success") throw new Error("Expected grading state.");
    expect(afterRemoval.value.appliedComments).toContainEqual({
      id: "edit",
      text: "General",
      deduction: -2
    });
    expect(afterRemoval.value.appliedComments[0]).not.toHaveProperty("rubricCategoryId");
    expect(afterRemoval.value.appliedComments[0]).not.toHaveProperty("sourceLocation");
    expect(deleteGradingStudentCommentContext(request, "edit")).toMatchObject({
      status: "success"
    });
    expect(loadGradingState(stateRequest)).toMatchObject({
      status: "success",
      value: {
        status: "complete",
        appliedComments: [{ id: "other" }],
        manualAdjustments: [{ id: "manual" }],
        viewState: { scrollTop: 1 }
      }
    });
  });

  it("accepts the resolved student source path for a bare required filename", () => {
    const { request } = setup();
    const assignment = path.join(
      request.courseFolderPath,
      "terms/27s1/assignments/lab04/assignment.yml"
    );
    fs.writeFileSync(
      assignment,
      fs.readFileSync(assignment, "utf8").replace("src/Main.java", "Color.java"),
      "utf8"
    );
    expect(
      addGradingStudentCommentContext(request, {
        id: "resolved-source",
        text: "Use the resolved source identity.",
        deduction: -1,
        sourceLocation: { file: "src/jones/Color.java", startLine: 1, endLine: 1 }
      })
    ).toMatchObject({ status: "success" });
  });

  it("does not create or overwrite state on not found, changed submission, or malformed state", () => {
    const { request, stateRequest } = setup();
    expect(
      editGradingStudentCommentContext(request, "missing", { text: "x", deduction: -1 })
    ).toMatchObject({
      status: "not_found"
    });
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    expect(fs.existsSync(statePath.value)).toBe(false);
    const created = createInitialGradingState("jones", makeTestGitSha("b"));
    if (created.status === "failure") throw new Error(created.message);
    saveGradingState(stateRequest, created.value);
    const before = fs.readFileSync(statePath.value, "utf8");
    expect(
      addGradingStudentCommentContext(request, { id: "x", text: "x", deduction: -1 })
    ).toMatchObject({
      status: "submission_changed"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);
    fs.writeFileSync(statePath.value, "{bad", "utf8");
    expect(deleteGradingStudentCommentContext(request, "x")).toMatchObject({
      status: "grading_state_error",
      code: "invalid_grading_state_json"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe("{bad");
  });

  it("rejects mutation when the persisted grading state belongs to another student", () => {
    const { request, stateRequest } = setup();
    const statePath = createGradingStatePath(stateRequest);
    if (statePath.status === "failure") throw new Error(statePath.message);
    const other = createInitialGradingState("other", SHA);
    if (other.status === "failure") throw new Error(other.message);
    fs.mkdirSync(path.dirname(statePath.value), { recursive: true });
    fs.writeFileSync(statePath.value, `${JSON.stringify(other.value, null, 2)}\n`, "utf8");
    const before = fs.readFileSync(statePath.value, "utf8");

    expect(
      addGradingStudentCommentContext(request, {
        id: "comment",
        text: "Must not apply",
        deduction: -1
      })
    ).toMatchObject({
      status: "grading_state_error",
      code: "grading_state_student_mismatch"
    });
    expect(fs.readFileSync(statePath.value, "utf8")).toBe(before);
  });
});
