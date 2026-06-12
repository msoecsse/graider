import { describe, expect, it, vi } from "vitest";
import type { ProcessRunResult, ProcessRunner } from "./commandRunner.js";
import { getFacultyReport, runFacultyReportCommand } from "./facultyReportRunner.js";
import type { FacultyReportJsonResponse, FacultyReportRequest } from "./ipc.js";
import { GITHUB_TOKEN_ENV_NAME } from "./tokenResolver.js";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const PARTIAL_SUCCESS_EXIT_CODE = 2;
const FIXED_REFRESH_DATE = new Date("2026-06-10T12:00:00.000Z");

const FACULTY_REPORT_REQUEST: FacultyReportRequest = {
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
};

const createFacultyReportJson = (status: string = "success"): FacultyReportJsonResponse => ({
  schemaVersion: 1,
  commandName: "report",
  assignmentFile: FACULTY_REPORT_REQUEST.assignmentFile,
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
  generatedFiles: ["terms/27s1/reports/lab02/faculty-summary.json"],
  summary: {
    assignmentSlug: "lab02",
    courseCode: "csc1120",
    termCode: "27s1",
    studentCount: 2,
    passedCount: 1,
    failedCount: 1,
    reportFileCount: 3
  }
});

const createProcessResult = (overrides: Partial<ProcessRunResult> = {}): ProcessRunResult => ({
  stdout: JSON.stringify(createFacultyReportJson()),
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

describe("facultyReportRunner", () => {
  it("runs report with argv array, course cwd, and token env", async () => {
    const runner = createRunner([createProcessResult()]);

    const result = await runFacultyReportCommand({
      request: FACULTY_REPORT_REQUEST,
      token: "secret-token",
      runner,
      env: { PATH: "/bin" }
    });

    expect(result.status).toBe("success");
    expect(runner).toHaveBeenCalledWith({
      command: "graider",
      args: ["report", FACULTY_REPORT_REQUEST.assignmentFile, "--json"],
      cwd: FACULTY_REPORT_REQUEST.courseFolderPath,
      env: {
        PATH: "/bin",
        [GITHUB_TOKEN_ENV_NAME]: "secret-token"
      }
    });
  });

  it("does not add student publishing flags", async () => {
    const runner = createRunner([createProcessResult()]);

    await runFacultyReportCommand({
      request: FACULTY_REPORT_REQUEST,
      token: "secret-token",
      runner
    });

    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["report", FACULTY_REPORT_REQUEST.assignmentFile, "--json"]
      })
    );
  });

  it("returns partial-success report JSON as renderer success", async () => {
    const report = createFacultyReportJson("partial_success");
    const runner = createRunner([
      createProcessResult({
        stdout: JSON.stringify(report),
        exitCode: PARTIAL_SUCCESS_EXIT_CODE
      })
    ]);

    const result = await runFacultyReportCommand({
      request: FACULTY_REPORT_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("success");
    expect(result.report).toEqual(report);
  });

  it("handles invalid report JSON safely", async () => {
    const runner = createRunner([createProcessResult({ stdout: "not json" })]);

    const result = await runFacultyReportCommand({
      request: FACULTY_REPORT_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("invalid_faculty_report_json");
  });

  it("reuses token resolver before running report", async () => {
    const runner = createRunner([
      createProcessResult({ stdout: " secret-token \n" }),
      createProcessResult()
    ]);

    const result = await getFacultyReport(FACULTY_REPORT_REQUEST, {
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
      args: ["report", FACULTY_REPORT_REQUEST.assignmentFile, "--json"],
      cwd: FACULTY_REPORT_REQUEST.courseFolderPath,
      env: { [GITHUB_TOKEN_ENV_NAME]: "secret-token" }
    });
  });
});
