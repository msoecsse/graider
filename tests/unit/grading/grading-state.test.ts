import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGradingStatePath,
  createInitialGradingState,
  loadGradingState,
  saveGradingState,
  type GradingState
} from "../../../src/grading/grading-state.js";

const roots: string[] = [];
const createRequest = (studentId = "student1") => {
  const courseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider-grading-state-"));
  roots.push(courseRoot);
  return { courseRoot, termCode: "27s1", assignmentSlug: "lab04", studentId };
};
const initial = (studentId = "student1"): GradingState => {
  const result = createInitialGradingState(studentId, "abc123");
  if (result.status === "failure") throw new Error(result.message);
  return result.value;
};

afterEach(() => {
  roots.splice(0).forEach((root) => {
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("grading state", () => {
  it("creates, saves, and reloads an initial assignment/student state", () => {
    const request = createRequest();
    expect(initial()).toMatchObject({
      status: "not_started",
      appliedComments: [],
      manualAdjustments: []
    });
    expect(saveGradingState(request, initial())).toMatchObject({ status: "success" });
    expect(loadGradingState(request)).toMatchObject({ status: "success", value: initial() });
  });

  it("keeps students independent and stores state under course-local assignment paths", () => {
    const first = createRequest("student1");
    const second = { ...first, studentId: "student2" };
    saveGradingState(first, initial("student1"));
    saveGradingState(second, { ...initial("student2"), status: "complete" });
    expect(loadGradingState(first)).toMatchObject({
      status: "success",
      value: { status: "not_started" }
    });
    expect(loadGradingState(second)).toMatchObject({
      status: "success",
      value: { status: "complete" }
    });
    const statePath = createGradingStatePath(first);
    expect(statePath.status).toBe("success");
    if (statePath.status !== "success") throw new Error("Expected grading-state path.");
    expect(statePath.value).toContain(".graider");
  });

  it("round-trips all statuses, comments, locations, and adjustments", () => {
    for (const status of ["not_started", "in_progress", "complete", "published"] as const) {
      const request = createRequest(status);
      const state: GradingState = {
        ...initial(status),
        status,
        appliedComments: [
          {
            id: "source",
            sourceCommentId: "library",
            text: "Fix this",
            deduction: 2,
            rubricCategoryId: "design",
            sourceLocation: { file: "src/A.java", startLine: 2, endLine: 4 }
          },
          { id: "general", text: "General", deduction: 1 }
        ],
        manualAdjustments: [
          { id: "adjustment", rubricCategoryId: "design", amount: -1, note: "Late" }
        ]
      };
      expect(saveGradingState(request, state)).toMatchObject({ status: "success" });
      expect(loadGradingState(request)).toMatchObject({ status: "success", value: state });
    }
  });

  it("loads legacy persisted comments without a title", () => {
    const request = createRequest();
    const statePath = createGradingStatePath(request);
    if (statePath.status === "failure") throw new Error(statePath.message);
    const legacyState = {
      ...initial(),
      appliedComments: [{ id: "legacy", text: "Existing feedback", deduction: -1 }]
    };
    fs.mkdirSync(path.dirname(statePath.value), { recursive: true });
    fs.writeFileSync(statePath.value, `${JSON.stringify(legacyState)}\n`, "utf8");

    expect(loadGradingState(request)).toMatchObject({
      status: "success",
      value: { appliedComments: [{ id: "legacy", text: "Existing feedback" }] }
    });
  });

  it("rejects invalid IDs, numeric values, duplicate IDs, and source ranges", () => {
    const request = createRequest();
    expect(
      saveGradingState(request, {
        ...initial(),
        appliedComments: [
          { id: "same", text: "a", deduction: 1 },
          { id: "same", text: "b", deduction: 1 }
        ]
      })
    ).toMatchObject({ status: "failure" });
    expect(
      saveGradingState(request, {
        ...initial(),
        manualAdjustments: [
          { id: "same", rubricCategoryId: "x", amount: 1 },
          { id: "same", rubricCategoryId: "x", amount: 1 }
        ]
      })
    ).toMatchObject({ status: "failure" });
    expect(
      saveGradingState(request, {
        ...initial(),
        appliedComments: [{ id: "a", text: "a", deduction: Number.NaN }]
      })
    ).toMatchObject({ status: "failure" });
    expect(
      saveGradingState(request, {
        ...initial(),
        appliedComments: [
          {
            id: "a",
            text: "a",
            deduction: 1,
            sourceLocation: { file: "A", startLine: 3, endLine: 2 }
          }
        ]
      })
    ).toMatchObject({ status: "failure" });
  });

  it("distinguishes missing, malformed, and unsupported state files without overwriting them", () => {
    const request = createRequest();
    expect(loadGradingState(request)).toEqual({ status: "missing" });
    const statePath = createGradingStatePath(request);
    if (statePath.status === "failure") throw new Error(statePath.message);
    fs.mkdirSync(path.dirname(statePath.value), { recursive: true });
    fs.writeFileSync(statePath.value, "{bad", "utf8");
    expect(loadGradingState(request)).toMatchObject({
      status: "failure",
      code: "invalid_grading_state_json"
    });
    fs.writeFileSync(statePath.value, JSON.stringify({ ...initial(), schemaVersion: 999 }), "utf8");
    expect(loadGradingState(request)).toMatchObject({
      status: "failure",
      code: "unsupported_grading_state_schema_version"
    });
  });
});
