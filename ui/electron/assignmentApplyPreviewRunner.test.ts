import { describe, expect, it, vi } from "vitest";
import type { ProcessRunResult, ProcessRunner } from "./commandRunner.js";
import {
  getAssignmentApplyPreview,
  runAssignmentApplyPreviewCommand
} from "./assignmentApplyPreviewRunner.js";
import type { AssignmentApplyPreviewJsonResponse, AssignmentApplyPreviewRequest } from "./ipc.js";
import { GITHUB_TOKEN_ENV_NAME } from "./tokenResolver.js";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const FIXED_REFRESH_DATE = new Date("2026-06-10T12:00:00.000Z");

const APPLY_PREVIEW_REQUEST: AssignmentApplyPreviewRequest = {
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
};

const createApplyPreviewJson = (
  status: string = "success"
): AssignmentApplyPreviewJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment apply-preview",
  status,
  exitCode: status === "success" ? SUCCESS_EXIT_CODE : FAILURE_EXIT_CODE,
  diagnostics: [],
  assignment: {
    slug: "lab02",
    title: "Lab 02",
    file: APPLY_PREVIEW_REQUEST.assignmentFile,
    status: "active"
  },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: { sections: ["001"], sectionCount: 1, studentCount: 2 },
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
    resultFile: "results.json",
    workflowStatus: "available",
    workflowDispatch: "available"
  },
  plan: {
    summary: {
      wouldCreateRepositories: 1,
      wouldUpdateRepositories: 1,
      wouldSkipRepositories: 0,
      blockedRepositories: 0,
      unknownRepositories: 0
    },
    repositories: []
  },
  files: {
    assignmentFile: APPLY_PREVIEW_REQUEST.assignmentFile,
    workflowFile: ".github/workflows/grade.yml",
    templateSource: "graider-sandbox/csc1120L2Template@main"
  },
  actions: {
    apply: {
      available: true,
      implemented: false,
      previewOnly: true
    }
  }
});

const createProcessResult = (overrides: Partial<ProcessRunResult> = {}): ProcessRunResult => ({
  stdout: JSON.stringify(createApplyPreviewJson()),
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

describe("assignmentApplyPreviewRunner", () => {
  it("runs graider assignment apply-preview with argv array, course cwd, and token env", async () => {
    const runner = createRunner([createProcessResult()]);

    const result = await runAssignmentApplyPreviewCommand({
      request: APPLY_PREVIEW_REQUEST,
      token: "secret-token",
      runner,
      env: { PATH: "/bin" }
    });

    expect(result.status).toBe("success");
    expect(runner).toHaveBeenCalledWith({
      command: "graider",
      args: ["assignment", "apply-preview", APPLY_PREVIEW_REQUEST.assignmentFile, "--json"],
      cwd: APPLY_PREVIEW_REQUEST.courseFolderPath,
      env: {
        PATH: "/bin",
        [GITHUB_TOKEN_ENV_NAME]: "secret-token"
      }
    });
  });

  it("returns apply preview JSON from a nonzero partial-success exit", async () => {
    const preview = createApplyPreviewJson("partial_success");
    const runner = createRunner([
      createProcessResult({
        stdout: JSON.stringify(preview),
        exitCode: FAILURE_EXIT_CODE
      })
    ]);

    const result = await runAssignmentApplyPreviewCommand({
      request: APPLY_PREVIEW_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("success");
    expect(result.preview).toEqual(preview);
    expect(result.error).toBeNull();
  });

  it("handles invalid apply preview JSON safely", async () => {
    const runner = createRunner([createProcessResult({ stdout: "not json" })]);

    const result = await runAssignmentApplyPreviewCommand({
      request: APPLY_PREVIEW_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("invalid_assignment_apply_preview_json");
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

    const result = await runAssignmentApplyPreviewCommand({
      request: APPLY_PREVIEW_REQUEST,
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

    const result = await runAssignmentApplyPreviewCommand({
      request: APPLY_PREVIEW_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.error?.stdoutSnippet).not.toContain("secret-token");
    expect(result.error?.stderrSnippet).not.toContain("secret-token");
  });

  it("falls back to local preview when token resolution is unavailable", async () => {
    const runner = createRunner([
      createProcessResult({
        stdout: "",
        exitCode: null,
        error: { code: "ENOENT", message: "missing gh" }
      }),
      createProcessResult()
    ]);

    const result = await getAssignmentApplyPreview(APPLY_PREVIEW_REQUEST, {
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
      args: ["assignment", "apply-preview", APPLY_PREVIEW_REQUEST.assignmentFile, "--json"],
      cwd: APPLY_PREVIEW_REQUEST.courseFolderPath,
      env: {}
    });
  });
});
