import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUNDLED_GRAIDER_CLI_MISSING_PROCESS_CODE,
  type ProcessRunResult,
  type ProcessRunner
} from "./commandRunner.js";
import {
  addCourseFolderToRegistry,
  getCourseRegistryPath,
  loadCourseRegistry
} from "./courseRegistry.js";
import {
  MAX_COMMAND_OUTPUT_SNIPPET_LENGTH,
  refreshCourseFolder,
  refreshDashboard,
  runDashboardCommand
} from "./dashboardRunner.js";
import type { CourseFolderRecord, DashboardJsonResponse } from "./ipc.js";
import { GITHUB_TOKEN_ENV_NAME } from "./tokenResolver.js";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const FIXED_REFRESH_DATE = new Date("2026-06-10T12:00:00.000Z");

const COURSE_FOLDER: CourseFolderRecord = {
  id: "course-folder-csc1120",
  path: "/Users/sean/dev/csc1120",
  displayAlias: null,
  lastOpenedAt: "2026-06-09T19:30:00.000Z",
  lastRefreshedAt: null,
  lastDashboardStatus: null
};

const createDashboardJson = (status: string = "success"): DashboardJsonResponse => ({
  schemaVersion: 1,
  commandName: "dashboard",
  status,
  exitCode: status === "success" ? SUCCESS_EXIT_CODE : FAILURE_EXIT_CODE,
  diagnostics: [],
  summary: { cardCount: 1 },
  cards: []
});

const createProcessResult = (overrides: Partial<ProcessRunResult> = {}): ProcessRunResult => ({
  stdout: JSON.stringify(createDashboardJson()),
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

describe("dashboardRunner", () => {
  let tempDirectory: string;
  let registryPath: string;

  beforeEach(() => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "graider-ui-dashboard-"));
    registryPath = getCourseRegistryPath(tempDirectory);
  });

  afterEach(() => {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it("runs graider dashboard --json with the course folder as cwd and token in env", async () => {
    const runner = createRunner([createProcessResult()]);

    const result = await runDashboardCommand({
      courseFolder: COURSE_FOLDER,
      token: "secret-token",
      runner,
      env: { PATH: "/bin" }
    });

    expect(result.status).toBe("success");
    expect(runner).toHaveBeenCalledWith({
      command: "graider",
      args: ["dashboard", "--json"],
      cwd: COURSE_FOLDER.path,
      env: {
        PATH: "/bin",
        [GITHUB_TOKEN_ENV_NAME]: "secret-token"
      }
    });
  });

  it("returns dashboard JSON from a nonzero graider exit", async () => {
    const dashboard = createDashboardJson("failure");
    const runner = createRunner([
      createProcessResult({
        stdout: JSON.stringify(dashboard),
        exitCode: FAILURE_EXIT_CODE
      })
    ]);

    const result = await runDashboardCommand({
      courseFolder: COURSE_FOLDER,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.dashboard).toEqual(dashboard);
    expect(result.error).toBeNull();
  });

  it("handles invalid dashboard JSON safely", async () => {
    const runner = createRunner([createProcessResult({ stdout: "not json" })]);

    const result = await runDashboardCommand({
      courseFolder: COURSE_FOLDER,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("invalid_dashboard_json");
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

    const result = await runDashboardCommand({
      courseFolder: COURSE_FOLDER,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("graider_cli_not_found");
  });

  it("handles missing bundled graider CLI safely", async () => {
    const runner = createRunner([
      createProcessResult({
        stdout: "",
        exitCode: null,
        error: {
          code: BUNDLED_GRAIDER_CLI_MISSING_PROCESS_CODE,
          message: "Bundled Graider CLI could not be started."
        }
      })
    ]);

    const result = await runDashboardCommand({
      courseFolder: COURSE_FOLDER,
      token: "secret-token",
      runner
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("bundled_graider_cli_not_found");
    expect(result.error?.message).toBe(
      "Bundled Graider CLI could not be started. Rebuild or reinstall the Graider app."
    );
  });

  it("redacts tokens and truncates command snippets", async () => {
    const longOutput = `before secret-token ${"x".repeat(MAX_COMMAND_OUTPUT_SNIPPET_LENGTH + 20)}`;
    const runner = createRunner([
      createProcessResult({
        stdout: longOutput,
        stderr: longOutput,
        exitCode: FAILURE_EXIT_CODE
      })
    ]);

    const result = await runDashboardCommand({
      courseFolder: COURSE_FOLDER,
      token: "secret-token",
      runner
    });

    expect(result.error?.stdoutSnippet).not.toContain("secret-token");
    expect(result.error?.stderrSnippet).not.toContain("secret-token");
    expect(result.error?.stdoutSnippet?.length).toBeLessThanOrEqual(
      MAX_COMMAND_OUTPUT_SNIPPET_LENGTH
    );
  });

  it("returns course_folder_not_found for unknown registry ids", async () => {
    const runner = createRunner([createProcessResult()]);

    const result = await refreshCourseFolder(registryPath, "missing-id", {
      runner,
      env: { [GITHUB_TOKEN_ENV_NAME]: "secret-token" }
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("course_folder_not_found");
    expect(runner).not.toHaveBeenCalled();
  });

  it("resolves token before running graider and updates refresh metadata", async () => {
    const courseFolder = addCourseFolderToRegistry(registryPath, COURSE_FOLDER.path);
    const runner = createRunner([
      createProcessResult({ stdout: " secret-token \n" }),
      createProcessResult()
    ]);

    const result = await refreshCourseFolder(registryPath, courseFolder.id, {
      runner,
      env: {},
      now: () => FIXED_REFRESH_DATE
    });
    const registry = loadCourseRegistry(registryPath);

    expect(result.status).toBe("success");
    expect(runner).toHaveBeenNthCalledWith(1, {
      command: "gh",
      args: ["auth", "token"],
      env: {}
    });
    expect(runner).toHaveBeenNthCalledWith(2, {
      command: "graider",
      args: ["dashboard", "--json"],
      cwd: courseFolder.path,
      env: { [GITHUB_TOKEN_ENV_NAME]: "secret-token" }
    });
    expect(registry.courseFolders[0]?.lastRefreshedAt).toBe(FIXED_REFRESH_DATE.toISOString());
    expect(registry.courseFolders[0]?.lastDashboardStatus).toBe("success");
  });

  it("does not run graider when token resolution fails", async () => {
    const courseFolder = addCourseFolderToRegistry(registryPath, COURSE_FOLDER.path);
    const runner = createRunner([
      createProcessResult({
        stdout: "",
        exitCode: null,
        error: { code: "ENOENT", message: "missing gh" }
      })
    ]);

    const result = await refreshCourseFolder(registryPath, courseFolder.id, {
      runner,
      env: {}
    });
    const registry = loadCourseRegistry(registryPath);

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("github_token_unavailable");
    expect(runner).toHaveBeenCalledTimes(1);
    expect(registry.courseFolders[0]?.lastRefreshedAt).toBeNull();
  });

  it("refreshes all folders and contains one folder failure", async () => {
    addCourseFolderToRegistry(registryPath, "/Users/sean/dev/csc1120");
    addCourseFolderToRegistry(registryPath, "/Users/sean/dev/csc4641");
    const runner = createRunner([
      createProcessResult(),
      createProcessResult({ stdout: "not json", exitCode: FAILURE_EXIT_CODE })
    ]);

    const result = await refreshDashboard(registryPath, {
      runner,
      env: { [GITHUB_TOKEN_ENV_NAME]: "secret-token" },
      now: () => FIXED_REFRESH_DATE
    });

    expect(result.status).toBe("partial_failure");
    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.status).toBe("success");
    expect(result.results[1]?.status).toBe("failure");
  });
});
