import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGradingStatePath,
  createInitialGradingState,
  loadGradingState,
  saveGradingState,
  validateGradingState,
  type GradingEditorViewState,
  type GradingState
} from "../../../src/grading/grading-state.js";
import { clearViewState, updateViewState } from "../../../src/grading/grading-state-operations.js";

const roots: string[] = [];
const initial = (status: GradingState["status"] = "not_started"): GradingState => {
  const result = createInitialGradingState("student", "commit-sha");
  if (result.status === "failure") throw new Error(result.message);
  return { ...result.value, status };
};
const value = <T>(result: { status: "success"; value: T } | { status: string }): T => {
  if (!("value" in result)) throw new Error("Expected success");
  return result.value;
};
const viewState = (overrides: Partial<GradingEditorViewState> = {}): GradingEditorViewState => ({
  scrollTop: 123.5,
  cursor: { file: "src/Main.java", line: 8, column: 4 },
  ...overrides
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("grading editor view state", () => {
  it("keeps legacy schema-version-one state without viewState valid", () => {
    expect(validateGradingState(initial())).toEqual({ status: "success", value: initial() });
    expect(initial()).not.toHaveProperty("viewState");
  });

  it("round-trips canonical cursor, scroll, and same-file selection state", () => {
    const courseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider-view-state-"));
    roots.push(courseRoot);
    const request = {
      courseRoot,
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "student"
    };
    const state = value(
      updateViewState(
        initial(),
        viewState({
          selection: {
            file: "src/Main.java",
            startLine: 8,
            startColumn: 4,
            endLine: 10,
            endColumn: 2
          }
        })
      )
    );

    expect(saveGradingState(request, state)).toMatchObject({ status: "success" });
    expect(loadGradingState(request)).toEqual({ status: "success", value: state });
    const statePath = createGradingStatePath(request);
    if (statePath.status === "failure") throw new Error(statePath.message);
    const persisted = fs.readFileSync(statePath.value, "utf8");
    expect(persisted).not.toMatch(/monaco|modelUri|combinedLine|repositoryRoot/iu);
    expect(persisted).not.toContain(courseRoot);
  });

  it("rejects negative/nonfinite scroll and blank/absolute source files", () => {
    for (const invalid of [
      viewState({ scrollTop: -1 }),
      viewState({ scrollTop: Number.NaN }),
      viewState({ scrollTop: Number.POSITIVE_INFINITY }),
      viewState({ cursor: { file: "  ", line: 1, column: 1 } }),
      viewState({ cursor: { file: "/tmp/Main.java", line: 1, column: 1 } }),
      viewState({ cursor: { file: "C:\\student\\Main.java", line: 1, column: 1 } })
    ]) {
      expect(validateGradingState({ ...initial(), viewState: invalid })).toMatchObject({
        status: "failure",
        code: "invalid_grading_state"
      });
    }
  });

  it("rejects invalid cursor and selection lines, columns, and ordering", () => {
    for (const invalid of [
      viewState({ cursor: { file: "Main.java", line: 0, column: 1 } }),
      viewState({ cursor: { file: "Main.java", line: 1, column: 0 } }),
      viewState({
        selection: {
          file: "Main.java",
          startLine: 4,
          startColumn: 1,
          endLine: 3,
          endColumn: 1
        }
      }),
      viewState({
        selection: {
          file: "Main.java",
          startLine: 4,
          startColumn: 3,
          endLine: 4,
          endColumn: 2
        }
      })
    ]) {
      expect(validateGradingState({ ...initial(), viewState: invalid })).toMatchObject({
        status: "failure"
      });
    }
  });

  it("rejects cross-file and Monaco-specific selection representations", () => {
    expect(
      validateGradingState({
        ...initial(),
        viewState: {
          ...viewState(),
          selection: {
            file: "src/A.java",
            endFile: "src/B.java",
            startLine: 1,
            startColumn: 1,
            endLine: 2,
            endColumn: 1
          }
        }
      })
    ).toMatchObject({ status: "failure", code: "invalid_grading_state" });
    expect(
      validateGradingState({
        ...initial(),
        viewState: { ...viewState(), combinedLine: 12, monacoViewState: {} }
      })
    ).toMatchObject({ status: "failure", code: "invalid_grading_state" });
  });

  it("updates only viewState without mutation and preserves all four statuses", () => {
    for (const status of ["not_started", "in_progress", "complete", "published"] as const) {
      const state: GradingState = {
        ...initial(status),
        appliedComments: [{ id: "comment", text: "Keep", deduction: -1 }],
        manualAdjustments: [{ id: "adjustment", rubricCategoryId: "design", amount: 2 }]
      };
      const before = structuredClone(state);
      const updated = value(updateViewState(state, viewState()));
      expect(state).toEqual(before);
      expect(updated).toEqual({ ...before, viewState: viewState() });
      expect(updated.status).toBe(status);
    }
  });

  it("clears only viewState and leaves status unchanged", () => {
    const state = value(updateViewState(initial("published"), viewState()));
    const cleared = value(clearViewState(state));
    expect(cleared).not.toHaveProperty("viewState");
    expect(cleared).toEqual(initial("published"));
    expect(state).toHaveProperty("viewState");
  });
});
