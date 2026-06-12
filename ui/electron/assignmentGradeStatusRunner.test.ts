import { describe, expect, it, vi } from "vitest";
import type { ProcessRunResult, ProcessRunner } from "./commandRunner.js";
import {
  getAssignmentGradeStatus,
  runAssignmentGradeStatusCommand
} from "./assignmentGradeStatusRunner.js";
import type { AssignmentGradeStatusJsonResponse, AssignmentGradeStatusRequest } from "./ipc.js";
import { GITHUB_TOKEN_ENV_NAME } from "./tokenResolver.js";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const PARTIAL_SUCCESS_EXIT_CODE = 2;
const FIXED_REFRESH_DATE = new Date("2026-06-10T12:00:00.000Z");

const GRADE_STATUS_REQUEST: AssignmentGradeStatusRequest = {
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
};

const createGradeStatusJson = (status: string = "success"): AssignmentGradeStatusJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment grade-status",
  status,
  exitCode:
    status === "success"
      ? SUCCESS_EXIT_CODE
      : status === "partial_success"
        ? PARTIAL_SUCCESS_EXIT_CODE
        : FAILURE_EXIT_CODE,
  diagnostics: [],
  assignment: { slug: "lab02", title: "Lab 02", file: GRADE_STATUS_REQUEST.assignmentFile },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: { sections: ["001"], sectionCount: 1, studentCount: 2, activeStudentCount: 2 },
  grading: {
    enabled: true,
    resolvedFrom: "course_default",
    mode: "custom-workflow",
    workflow: ".github/workflows/grade.yml",
    artifact: "grading-results",
    resultFile: "results.json",
    workflowRef: "main"
  },
  summary: {
    totalRepositories: 2,
    queued: 0,
    inProgress: 0,
    completed: 2,
    successful: 2,
    failed: 0,
    cancelled: 0,
    timedOut: 0,
    missing: 0,
    unknown: 0,
    blocked: 0,
    needsAttention: 0,
    readyForReport: true
  },
  repositories: [],
  actions: {}
});

const createProcessResult = (overrides: Partial<ProcessRunResult> = {}): ProcessRunResult => ({
  stdout: JSON.stringify(createGradeStatusJson()),
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

describe("assignmentGradeStatusRunner", () => {
  it("runs full grade-status with argv array, course cwd, and token env", async () => {
    const runner = createRunner([createProcessResult()]);

    const result = await runAssignmentGradeStatusCommand({
      request: GRADE_STATUS_REQUEST,
      token: "secret-token",
      runner,
      env: { PATH: "/bin" }
    });

    expect(result.status).toBe("success");
    expect(runner).toHaveBeenCalledWith({
      command: "graider",
      args: ["assignment", "grade-status", GRADE_STATUS_REQUEST.assignmentFile, "--json"],
      cwd: GRADE_STATUS_REQUEST.courseFolderPath,
      env: {
        PATH: "/bin",
        [GITHUB_TOKEN_ENV_NAME]: "secret-token"
      }
    });
  });

  it("uses --student for a single filtered student", async () => {
    const runner = createRunner([createProcessResult()]);

    await runAssignmentGradeStatusCommand({
      request: { ...GRADE_STATUS_REQUEST, studentIds: ["s001"] },
      token: "secret-token",
      runner
    });

    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [
          "assignment",
          "grade-status",
          GRADE_STATUS_REQUEST.assignmentFile,
          "--student",
          "s001",
          "--json"
        ]
      })
    );
  });

  it("uses --students csv for multiple filtered students", async () => {
    const runner = createRunner([createProcessResult()]);

    await runAssignmentGradeStatusCommand({
      request: { ...GRADE_STATUS_REQUEST, studentIds: ["s001", "s002"] },
      token: "secret-token",
      runner
    });

    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [
          "assignment",
          "grade-status",
          GRADE_STATUS_REQUEST.assignmentFile,
          "--students",
          "s001,s002",
          "--json"
        ]
      })
    );
  });

  it("returns partial-success grade status JSON as renderer success", async () => {
    const gradeStatus = createGradeStatusJson("partial_success");
    const runner = createRunner([
      createProcessResult({
        stdout: JSON.stringify(gradeStatus),
        exitCode: PARTIAL_SUCCESS_EXIT_CODE
      })
    ]);

    const result = await runAssignmentGradeStatusCommand({
      request: GRADE_STATUS_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("success");
    expect(result.gradeStatus).toEqual(gradeStatus);
  });

  it("handles invalid grade status JSON safely", async () => {
    const runner = createRunner([createProcessResult({ stdout: "not json" })]);

    const result = await runAssignmentGradeStatusCommand({
      request: GRADE_STATUS_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("invalid_assignment_grade_status_json");
  });

  it("reuses token resolver before running grade status", async () => {
    const runner = createRunner([
      createProcessResult({ stdout: " secret-token \n" }),
      createProcessResult()
    ]);

    const result = await getAssignmentGradeStatus(GRADE_STATUS_REQUEST, {
      runner,
      env: {},
      now: () => FIXED_REFRESH_DATE
    });

    expect(result.status).toBe("success");
    expect(result.refreshedAt).toBe(FIXED_REFRESH_DATE.toISOString());
    expect(runner).toHaveBeenNthCalledWith(1, {
      command: "gh",
      args: ["auth", "token"],
      env: {}
    });
    expect(runner).toHaveBeenNthCalledWith(2, {
      command: "graider",
      args: ["assignment", "grade-status", GRADE_STATUS_REQUEST.assignmentFile, "--json"],
      cwd: GRADE_STATUS_REQUEST.courseFolderPath,
      env: { [GITHUB_TOKEN_ENV_NAME]: "secret-token" }
    });
  });
});
