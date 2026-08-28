import { describe, expect, it, vi } from "vitest";
import type { ProcessRunResult, ProcessRunner } from "./commandRunner.js";
import { gradeAssignment, runAssignmentGradeCommand } from "./assignmentGradeRunner.js";
import type { AssignmentGradeJsonResponse, AssignmentGradeRequest } from "./ipc.js";
import { GITHUB_TOKEN_ENV_NAME } from "./tokenResolver.js";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const PARTIAL_SUCCESS_EXIT_CODE = 2;
const FIXED_DISPATCH_DATE = new Date("2026-06-10T12:00:00.000Z");

const GRADE_REQUEST: AssignmentGradeRequest = {
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
};

const createGradeJson = (status: string = "success"): AssignmentGradeJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment grade",
  assignmentFile: GRADE_REQUEST.assignmentFile,
  status,
  exitCode:
    status === "success"
      ? SUCCESS_EXIT_CODE
      : status === "partial_success"
        ? PARTIAL_SUCCESS_EXIT_CODE
        : FAILURE_EXIT_CODE,
  diagnostics: [],
  warnings: [],
  errors: [],
  generatedFiles: [],
  summary: {
    assignmentSlug: "lab02",
    gradingEnabled: true,
    targetsSelected: 2,
    dispatchAttempted: 2,
    dispatchSucceeded: 2,
    dispatchFailed: 0,
    skipped: 0
  }
});

const createProcessResult = (overrides: Partial<ProcessRunResult> = {}): ProcessRunResult => ({
  stdout: JSON.stringify(createGradeJson()),
  stderr: "",
  exitCode: SUCCESS_EXIT_CODE,
  error: null,
  ...overrides
});

const createRunner = (results: readonly ProcessRunResult[]): ProcessRunner => {
  let index = 0;

  return vi.fn(async () => {
    const result = results[index] ?? results[results.length - 1];
    index += 1;

    if (result === undefined) {
      throw new Error("Expected a fake process result.");
    }

    return result;
  });
};

describe("assignmentGradeRunner", () => {
  it("runs graider assignment grade with argv array, course cwd, --all, and token env", async () => {
    const runner = createRunner([createProcessResult()]);

    const result = await runAssignmentGradeCommand({
      request: GRADE_REQUEST,
      token: "secret-token",
      runner,
      env: { PATH: "/bin" }
    });

    expect(result.status).toBe("success");
    expect(runner).toHaveBeenCalledWith({
      command: "graider",
      args: ["assignment", "grade", GRADE_REQUEST.assignmentFile, "--json", "--all"],
      cwd: GRADE_REQUEST.courseFolderPath,
      env: {
        PATH: "/bin",
        [GITHUB_TOKEN_ENV_NAME]: "secret-token"
      }
    });
  });

  it("returns grade JSON from a nonzero partial-success exit", async () => {
    const grade = createGradeJson("partial_success");
    const runner = createRunner([
      createProcessResult({
        stdout: JSON.stringify(grade),
        exitCode: PARTIAL_SUCCESS_EXIT_CODE
      })
    ]);

    const result = await runAssignmentGradeCommand({
      request: GRADE_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("success");
    expect(result.grade).toEqual(grade);
    expect(result.error).toBeNull();
  });

  it("returns failure grade JSON for command failures with usable output", async () => {
    const grade = createGradeJson("failure");
    const runner = createRunner([
      createProcessResult({
        stdout: JSON.stringify(grade),
        exitCode: FAILURE_EXIT_CODE
      })
    ]);

    const result = await runAssignmentGradeCommand({
      request: GRADE_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.grade).toEqual(grade);
    expect(result.error).toBeNull();
  });

  it("handles invalid grade JSON safely", async () => {
    const runner = createRunner([createProcessResult({ stdout: "not json" })]);

    const result = await runAssignmentGradeCommand({
      request: GRADE_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("invalid_assignment_grade_json");
    expect(result.error?.stdoutSnippet).toBe("not json");
  });

  it("handles missing graider CLI safely", async () => {
    const runner = createRunner([
      createProcessResult({
        stdout: "",
        exitCode: null,
        error: { code: "ENOENT", message: "spawn graider ENOENT" }
      })
    ]);

    const result = await runAssignmentGradeCommand({
      request: GRADE_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("graider_cli_not_found");
  });

  it("redacts token values from command snippets", async () => {
    const runner = createRunner([
      createProcessResult({
        stdout: "bad secret-token output",
        stderr: "bad secret-token error",
        exitCode: FAILURE_EXIT_CODE
      })
    ]);

    const result = await runAssignmentGradeCommand({
      request: GRADE_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.error?.stdoutSnippet).not.toContain("secret-token");
    expect(result.error?.stderrSnippet).not.toContain("secret-token");
  });

  it("reuses token resolver before running grade dispatch", async () => {
    const runner = createRunner([
      createProcessResult({ stdout: " secret-token \n" }),
      createProcessResult()
    ]);

    const result = await gradeAssignment(GRADE_REQUEST, {
      runner,
      env: {},
      now: () => FIXED_DISPATCH_DATE
    });

    expect(result.status).toBe("success");
    expect(result.dispatchedAt).toBe(FIXED_DISPATCH_DATE.toISOString());
    expect(runner).toHaveBeenNthCalledWith(1, {
      command: "gh",
      args: ["auth", "token"],
      env: {}
    });
    expect(runner).toHaveBeenNthCalledWith(2, {
      command: "graider",
      args: ["assignment", "grade", GRADE_REQUEST.assignmentFile, "--json", "--all"],
      cwd: GRADE_REQUEST.courseFolderPath,
      env: { [GITHUB_TOKEN_ENV_NAME]: "secret-token" }
    });
  });
});
