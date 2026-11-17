import { describe, expect, it, vi } from "vitest";
import type { ProcessRunResult, ProcessRunner } from "./commandRunner.js";
import {
  applyAssignment,
  createAssignmentApplyProgressParser,
  runAssignmentApplyCommand
} from "./assignmentApplyRunner.js";
import type { AssignmentApplyJsonResponse, AssignmentApplyRequest } from "./ipc.js";
import { GITHUB_TOKEN_ENV_NAME } from "./tokenResolver.js";
import {
  courseOperationAuthentication,
  managedCourseOperation
} from "./managedCourseOperationContext.js";

import { runManagedAssignmentApply } from "./assignmentApplyBackend.js";
vi.mock("./assignmentApplyBackend.js", () => ({ runManagedAssignmentApply: vi.fn() }));

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const PARTIAL_SUCCESS_EXIT_CODE = 2;
const FIXED_APPLY_DATE = new Date("2026-06-10T12:00:00.000Z");

const APPLY_REQUEST: AssignmentApplyRequest = {
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
};

const createApplyJson = (status: string = "success"): AssignmentApplyJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment apply",
  assignmentFile: APPLY_REQUEST.assignmentFile,
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
  generatedFiles: ["terms/27s1/manifests/lab02/manifest.yml"],
  summary: {
    assignmentSlug: "lab02",
    manifestFile: "terms/27s1/manifests/lab02/manifest.yml",
    created: 1,
    existing: 1,
    verified: 0,
    noop: 0,
    skipped: 0,
    failed: 0,
    blocked: 0
  }
});

const createProcessResult = (overrides: Partial<ProcessRunResult> = {}): ProcessRunResult => ({
  stdout: JSON.stringify(createApplyJson()),
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

describe("assignmentApplyRunner", () => {
  it("requires the guard-owned credential when a GUI mutation context exists", async () => {
    const runner = createRunner([createProcessResult()]);
    await expect(
      managedCourseOperation.run(
        {
          ...APPLY_REQUEST,
          userId: 42,
          repositoryId: 20,
          authoritativeCommit: "a".repeat(40),
          operationalCommit: "a".repeat(40),
          mode: "new_mutation"
        },
        () =>
          applyAssignment(APPLY_REQUEST, { runner, env: { GRAIDER_GITHUB_TOKEN: "ambient-token" } })
      )
    ).rejects.toThrow("guarded GitHub OAuth session");
    expect(runner).not.toHaveBeenCalled();
    expect(runManagedAssignmentApply).not.toHaveBeenCalled();
  });
  it.each([{}, { GRAIDER_GITHUB_TOKEN: "other-account", GITHUB_TOKEN: "also-other" }])(
    "uses the guarded OAuth credential without gh, pins the verified course and revalidates before launch (%j)",
    async (env) => {
      vi.mocked(runManagedAssignmentApply).mockImplementation(async (request) => {
        await request.revalidate();
        return createApplyJson();
      });
      const runner = createRunner([createProcessResult()]);
      const revalidate = vi.fn(async () => {});
      const revision = "a".repeat(40);
      const result = await courseOperationAuthentication.run({ token: "oauth-session-token" }, () =>
        managedCourseOperation.run(
          {
            ...APPLY_REQUEST,
            userId: 42,
            repositoryId: 20,
            authoritativeCommit: revision,
            operationalCommit: revision,
            mode: "new_mutation",
            revalidate
          },
          () => applyAssignment(APPLY_REQUEST, { runner, env })
        )
      );
      expect(result.status).toBe("success");
      expect(revalidate).toHaveBeenCalledOnce();
      expect(runner).not.toHaveBeenCalled();
      expect(runManagedAssignmentApply).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "oauth-session-token",
          binding: { userId: 42, repositoryId: 20, revision }
        })
      );
      expect(JSON.stringify(result)).not.toContain("oauth-session-token");
    }
  );
  it("starts no child process when the guarded course becomes unauthorized before launch", async () => {
    vi.mocked(runManagedAssignmentApply).mockImplementation(async (request) => {
      await request.revalidate();
      return createApplyJson();
    });
    const runner = createRunner([createProcessResult()]);
    await expect(
      courseOperationAuthentication.run({ token: "oauth-session-token" }, () =>
        managedCourseOperation.run(
          {
            ...APPLY_REQUEST,
            userId: 42,
            repositoryId: 20,
            authoritativeCommit: "a".repeat(40),
            operationalCommit: "a".repeat(40),
            mode: "new_mutation",
            revalidate: async () => {
              throw new Error("Account authorization changed");
            }
          },
          () => applyAssignment(APPLY_REQUEST, { runner, env: {} })
        )
      )
    ).rejects.toThrow("Account authorization changed");
    expect(runner).not.toHaveBeenCalled();
  });
  it("parses split and multiple trusted Apply progress records while ignoring malformed records", () => {
    const progress = vi.fn();
    const parse = createAssignmentApplyProgressParser(progress);

    parse('ordinary stderr\nGRAIDER_PROGRESS {"current":1,"total":2,"mode":"individual",');
    parse(
      '"studentId":"ada","repository":"course/lab-ada"}\nGRAIDER_PROGRESS {"current":2,"total":2,"mode":"group","groupId":"team-2","repository":"course/lab-team-2"}\nGRAIDER_PROGRESS {bad}\n'
    );

    expect(progress).toHaveBeenNthCalledWith(1, {
      current: 1,
      total: 2,
      mode: "individual",
      studentId: "ada",
      repository: "course/lab-ada"
    });
    expect(progress).toHaveBeenNthCalledWith(2, {
      current: 2,
      total: 2,
      mode: "group",
      groupId: "team-2",
      repository: "course/lab-team-2"
    });
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it("runs graider assignment apply with argv array, course cwd, --yes, and token env", async () => {
    const runner = createRunner([createProcessResult()]);

    const result = await runAssignmentApplyCommand({
      request: APPLY_REQUEST,
      token: "secret-token",
      runner,
      env: { PATH: "/bin" }
    });

    expect(result.status).toBe("success");
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "graider",
        args: [
          "assignment",
          "apply",
          APPLY_REQUEST.assignmentFile,
          "--json",
          "--yes",
          "--progress-json"
        ],
        cwd: APPLY_REQUEST.courseFolderPath,
        env: {
          PATH: "/bin",
          [GITHUB_TOKEN_ENV_NAME]: "secret-token"
        }
      })
    );
  });

  it.each([PARTIAL_SUCCESS_EXIT_CODE, 3, 4])(
    "preserves partial Apply diagnostics with nonzero exit %s as transport success",
    async (exitCode) => {
      const diagnostic = {
        code: "workflow_deployment_forbidden",
        severity: "error",
        message: "The credential needs authorization to modify workflow files.",
        context: {
          operationType: "ensure_managed_grading_workflow",
          workflowPath: ".github/workflows/grade.yml",
          repositoryName: "course/lab-ada",
          remediation:
            "Authorize workflow-file writes and rerun Apply. Repository creation is retained."
        }
      };
      const apply = {
        ...createApplyJson("partial_success"),
        exitCode,
        diagnostics: [diagnostic],
        errors: [diagnostic],
        summary: {
          created: 1,
          repositories: [
            { repository: "course/lab-ada", status: "failed", diagnostics: [diagnostic] }
          ]
        }
      };
      const runner = createRunner([
        createProcessResult({
          stdout: JSON.stringify(apply),
          exitCode
        })
      ]);

      const result = await runAssignmentApplyCommand({
        request: APPLY_REQUEST,
        token: "secret-token",
        runner
      });

      expect(result.status).toBe("success");
      expect(result.apply).toEqual(apply);
      expect(result.error).toBeNull();
    }
  );

  it("returns failure apply JSON for command failures with usable output", async () => {
    const apply = createApplyJson("failure");
    const runner = createRunner([
      createProcessResult({
        stdout: JSON.stringify(apply),
        exitCode: FAILURE_EXIT_CODE
      })
    ]);

    const result = await runAssignmentApplyCommand({
      request: APPLY_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.apply).toEqual(apply);
    expect(result.error).toBeNull();
  });

  it("handles invalid apply JSON safely", async () => {
    const runner = createRunner([createProcessResult({ stdout: "not json" })]);

    const result = await runAssignmentApplyCommand({
      request: APPLY_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("invalid_assignment_apply_json");
    expect(result.error?.stdoutSnippet).toBe("not json");
  });

  it("removes recognized progress transport records from user-facing stderr errors", async () => {
    const runner = createRunner([
      createProcessResult({
        stdout: "not json",
        stderr:
          'real failure\nGRAIDER_PROGRESS {"current":1,"total":1,"mode":"individual","studentId":"ada","repository":"course/lab-ada"}\n'
      })
    ]);

    const result = await runAssignmentApplyCommand({
      request: APPLY_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.error?.stderrSnippet).toBe("real failure\n");
  });

  it("handles missing graider CLI safely", async () => {
    const runner = createRunner([
      createProcessResult({
        stdout: "",
        exitCode: null,
        error: { code: "ENOENT", message: "spawn graider ENOENT" }
      })
    ]);

    const result = await runAssignmentApplyCommand({
      request: APPLY_REQUEST,
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

    const result = await runAssignmentApplyCommand({
      request: APPLY_REQUEST,
      token: "secret-token",
      runner
    });

    expect(result.error?.stdoutSnippet).not.toContain("secret-token");
    expect(result.error?.stderrSnippet).not.toContain("secret-token");
  });

  it("reuses token resolver before running apply", async () => {
    const runner = createRunner([
      createProcessResult({ stdout: " secret-token \n" }),
      createProcessResult()
    ]);

    const result = await applyAssignment(APPLY_REQUEST, {
      runner,
      env: {},
      now: () => FIXED_APPLY_DATE
    });

    expect(result.status).toBe("success");
    expect(result.appliedAt).toBe(FIXED_APPLY_DATE.toISOString());
    expect(runner).toHaveBeenNthCalledWith(1, {
      command: "gh",
      args: ["auth", "token"],
      env: {}
    });
    expect(runner).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        command: "graider",
        args: [
          "assignment",
          "apply",
          APPLY_REQUEST.assignmentFile,
          "--json",
          "--yes",
          "--progress-json"
        ],
        cwd: APPLY_REQUEST.courseFolderPath,
        env: { [GITHUB_TOKEN_ENV_NAME]: "secret-token" }
      })
    );
  });

  it("forwards parsed repository progress after token resolution", async () => {
    const progress = vi.fn();
    const runner: ProcessRunner = vi.fn(async (request) => {
      if (request.command === "gh") {
        return createProcessResult({ stdout: "secret-token" });
      }

      request.onStderrChunk?.(
        'GRAIDER_PROGRESS {"current":1,"total":1,"mode":"individual","studentId":"ada","repository":"course/lab-ada"}\n'
      );
      return createProcessResult();
    });

    const result = await applyAssignment(APPLY_REQUEST, {
      runner,
      env: {},
      now: () => FIXED_APPLY_DATE,
      onProgress: progress
    });

    expect(result.status).toBe("success");
    expect(progress).toHaveBeenCalledWith({
      current: 1,
      total: 1,
      mode: "individual",
      studentId: "ada",
      repository: "course/lab-ada"
    });
  });

  it("still runs apply so backend can return missing-token diagnostics when token is unavailable", async () => {
    const runner: ProcessRunner = vi.fn(async (request) =>
      request.command === "graider"
        ? createProcessResult()
        : createProcessResult({
            stdout: "",
            exitCode: null,
            error: { code: "ENOENT", message: "missing gh" }
          })
    );

    const result = await applyAssignment(APPLY_REQUEST, {
      runner,
      env: {},
      now: () => FIXED_APPLY_DATE
    });

    expect(result.status).toBe("success");
    expect(vi.mocked(runner).mock.calls).toContainEqual([
      expect.objectContaining({
        command: "graider",
        args: [
          "assignment",
          "apply",
          APPLY_REQUEST.assignmentFile,
          "--json",
          "--yes",
          "--progress-json"
        ],
        cwd: APPLY_REQUEST.courseFolderPath,
        env: {}
      })
    ]);
  });
});
