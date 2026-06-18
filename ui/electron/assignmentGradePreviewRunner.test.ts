import { describe, expect, it, vi } from "vitest";
import type { ProcessRunResult, ProcessRunner } from "./commandRunner.js";
import {
  getAssignmentGradePreview,
  runAssignmentGradePreviewCommand
} from "./assignmentGradePreviewRunner.js";
import type { AssignmentGradePreviewJsonResponse, AssignmentGradePreviewRequest } from "./ipc.js";
import { GITHUB_TOKEN_ENV_NAME } from "./tokenResolver.js";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const FIXED_REFRESH_DATE = new Date("2026-06-10T12:00:00.000Z");

const GRADE_PREVIEW_REQUEST: AssignmentGradePreviewRequest = {
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
};

const createGradePreviewJson = (
  status: string = "success"
): AssignmentGradePreviewJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment grade-preview",
  status,
  exitCode: status === "success" ? SUCCESS_EXIT_CODE : FAILURE_EXIT_CODE,
  diagnostics: [],
  assignment: {
    slug: "lab02",
    title: "Lab 02",
    file: GRADE_PREVIEW_REQUEST.assignmentFile,
    status: "active"
  },
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
    workflowDispatch: "available",
    workflowRef: "main"
  },
  plan: {
    summary: {
      wouldDispatch: 1,
      wouldSkip: 1,
      blocked: 0,
      unknown: 0
    },
    repositories: []
  },
  files: {
    assignmentFile: GRADE_PREVIEW_REQUEST.assignmentFile,
    manifestFile: "terms/27s1/manifests/lab02/manifest.yml",
    workflowFile: ".github/workflows/grade.yml"
  },
  actions: {
    grade: {
      available: true,
      implemented: false,
      previewOnly: true
    }
  }
});

const createProcessResult = (overrides: Partial<ProcessRunResult> = {}): ProcessRunResult => ({
  stdout: JSON.stringify(createGradePreviewJson()),
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

describe("assignmentGradePreviewRunner", () => {
  it("runs graider assignment grade-preview with argv array, course cwd, and token env", async () => {
    const runner = createRunner([createProcessResult()]);

    const result = await runAssignmentGradePreviewCommand({
      request: GRADE_PREVIEW_REQUEST,
      token: "secret-token",
      runner,
      env: { PATH: "/bin" }
    });

    expect(result.status).toBe("success");
    expect(runner).toHaveBeenCalledWith({
      command: "graider",
      args: ["assignment", "grade-preview", GRADE_PREVIEW_REQUEST.assignmentFile, "--json"],
      cwd: GRADE_PREVIEW_REQUEST.courseFolderPath,
      env: {
        PATH: "/bin",
        [GITHUB_TOKEN_ENV_NAME]: "secret-token"
      }
    });
  });

  it("returns grade preview JSON from a nonzero partial-success exit", async () => {
    const preview = createGradePreviewJson("partial_success");
    const runner = createRunner([
      createProcessResult({
        stdout: JSON.stringify(preview),
        exitCode: FAILURE_EXIT_CODE
      })
    ]);

    const result = await runAssignmentGradePreviewCommand({
      request: GRADE_PREVIEW_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("success");
    expect(result.preview).toEqual(preview);
    expect(result.error).toBeNull();
  });

  it("handles invalid grade preview JSON safely", async () => {
    const runner = createRunner([createProcessResult({ stdout: "not json" })]);

    const result = await runAssignmentGradePreviewCommand({
      request: GRADE_PREVIEW_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("invalid_assignment_grade_preview_json");
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

    const result = await runAssignmentGradePreviewCommand({
      request: GRADE_PREVIEW_REQUEST,
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

    const result = await runAssignmentGradePreviewCommand({
      request: GRADE_PREVIEW_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.error?.stdoutSnippet).not.toContain("secret-token");
    expect(result.error?.stderrSnippet).not.toContain("secret-token");
  });

  it("falls back to local preview when token resolution is unavailable", async () => {
    const runner: ProcessRunner = vi.fn(async (request) =>
      request.command === "graider"
        ? createProcessResult()
        : createProcessResult({
            stdout: "",
            exitCode: null,
            error: { code: "ENOENT", message: "missing gh" }
          })
    );

    const result = await getAssignmentGradePreview(GRADE_PREVIEW_REQUEST, {
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
        args: ["assignment", "grade-preview", GRADE_PREVIEW_REQUEST.assignmentFile, "--json"],
        cwd: GRADE_PREVIEW_REQUEST.courseFolderPath,
        env: {}
      }
    ]);
  });
});
