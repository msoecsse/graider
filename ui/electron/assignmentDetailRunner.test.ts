import { describe, expect, it, vi } from "vitest";
import type { ProcessRunResult, ProcessRunner } from "./commandRunner.js";
import { getAssignmentDetail, runAssignmentDetailCommand } from "./assignmentDetailRunner.js";
import type { AssignmentDetailJsonResponse, AssignmentDetailRequest } from "./ipc.js";
import { GITHUB_TOKEN_ENV_NAME } from "./tokenResolver.js";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const FIXED_REFRESH_DATE = new Date("2026-06-10T12:00:00.000Z");

const ASSIGNMENT_DETAIL_REQUEST: AssignmentDetailRequest = {
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
};

const createAssignmentDetailJson = (status: string = "success"): AssignmentDetailJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment detail",
  status,
  exitCode: status === "success" ? SUCCESS_EXIT_CODE : FAILURE_EXIT_CODE,
  diagnostics: [],
  course: { slug: "csc1120", title: "CSC1120", file: "course.yml" },
  term: { slug: "27s1", title: "Spring 2027", file: "terms/27s1/term.yml" },
  assignment: {
    slug: "lab02",
    title: "Lab 02",
    type: "individual",
    status: "active",
    file: ASSIGNMENT_DETAIL_REQUEST.assignmentFile
  },
  metadata: {
    facultyOwner: "professor",
    lmsAssignmentId: null,
    gradingCategory: "labs",
    points: 100
  },
  deadline: { dueAt: "2027-06-15T23:59:00+09:00", latePolicy: "standard" },
  sections: ["001"],
  roster: { sectionCount: 1, activeStudentCount: 3, totalStudentCount: 3 },
  template: {
    repository: "graider-sandbox/csc1120L2Template",
    branch: "main",
    status: "available",
    repositoryStatus: "available",
    branchStatus: "available"
  },
  grading: {
    enabled: true,
    mode: "custom-workflow",
    workflow: ".github/workflows/grade.yml",
    artifact: "grading-results",
    resultFile: "grading-results.json",
    workflowStatus: "available",
    workflowDispatch: "available"
  },
  studentReports: { enabled: false, mode: "disabled" },
  applyState: { status: "not_applied" },
  actions: {
    validate: { available: true, implemented: true },
    apply: { available: true, implemented: false },
    grade: { available: true, implemented: false },
    report: { available: true, implemented: false },
    publishStudentReports: { available: false, implemented: false },
    generateWorkflow: { available: true, implemented: false }
  }
});

const createProcessResult = (overrides: Partial<ProcessRunResult> = {}): ProcessRunResult => ({
  stdout: JSON.stringify(createAssignmentDetailJson()),
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

describe("assignmentDetailRunner", () => {
  it("runs graider assignment detail with argv array, course cwd, and token env", async () => {
    const runner = createRunner([createProcessResult()]);

    const result = await runAssignmentDetailCommand({
      request: ASSIGNMENT_DETAIL_REQUEST,
      token: "secret-token",
      runner,
      env: { PATH: "/bin" }
    });

    expect(result.status).toBe("success");
    expect(runner).toHaveBeenCalledWith({
      command: "graider",
      args: ["assignment", "detail", ASSIGNMENT_DETAIL_REQUEST.assignmentFile, "--json"],
      cwd: ASSIGNMENT_DETAIL_REQUEST.courseFolderPath,
      env: {
        PATH: "/bin",
        [GITHUB_TOKEN_ENV_NAME]: "secret-token"
      }
    });
  });

  it("returns assignment detail JSON from a nonzero partial-success exit", async () => {
    const detail = createAssignmentDetailJson("partial_success");
    const runner = createRunner([
      createProcessResult({
        stdout: JSON.stringify(detail),
        exitCode: FAILURE_EXIT_CODE
      })
    ]);

    const result = await runAssignmentDetailCommand({
      request: ASSIGNMENT_DETAIL_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("success");
    expect(result.detail).toEqual(detail);
    expect(result.error).toBeNull();
  });

  it("handles invalid assignment detail JSON safely", async () => {
    const runner = createRunner([createProcessResult({ stdout: "not json" })]);

    const result = await runAssignmentDetailCommand({
      request: ASSIGNMENT_DETAIL_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("invalid_assignment_detail_json");
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

    const result = await runAssignmentDetailCommand({
      request: ASSIGNMENT_DETAIL_REQUEST,
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

    const result = await runAssignmentDetailCommand({
      request: ASSIGNMENT_DETAIL_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.error?.stdoutSnippet).not.toContain("secret-token");
    expect(result.error?.stderrSnippet).not.toContain("secret-token");
  });

  it("falls back to local detail when token resolution is unavailable", async () => {
    const runner: ProcessRunner = vi.fn(async (request) =>
      request.command === "graider"
        ? createProcessResult()
        : createProcessResult({
            stdout: "",
            exitCode: null,
            error: { code: "ENOENT", message: "missing gh" }
          })
    );

    const result = await getAssignmentDetail(ASSIGNMENT_DETAIL_REQUEST, {
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
    expect(vi.mocked(runner).mock.calls).toContainEqual([
      {
        command: "graider",
        args: ["assignment", "detail", ASSIGNMENT_DETAIL_REQUEST.assignmentFile, "--json"],
        cwd: ASSIGNMENT_DETAIL_REQUEST.courseFolderPath,
        env: {}
      }
    ]);
  });
});
