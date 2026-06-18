import { describe, expect, it, vi } from "vitest";
import type { ProcessRunner } from "./commandRunner.js";
import {
  GITHUB_CLI_AUTH_FAILED_CODE,
  GITHUB_CLI_NOT_FOUND_CODE,
  GITHUB_TOKEN_ENV_NAME,
  getCommonGithubCliPaths,
  resolveGithubToken
} from "./tokenResolver.js";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;

const createRunner = (runner: ProcessRunner): ProcessRunner => vi.fn(runner);

describe("tokenResolver", () => {
  it("uses GRAIDER_GITHUB_TOKEN when present", async () => {
    const runner = createRunner(async () => ({
      stdout: "",
      stderr: "",
      exitCode: SUCCESS_EXIT_CODE,
      error: null
    }));

    const result = await resolveGithubToken({
      env: { [GITHUB_TOKEN_ENV_NAME]: " token-from-env " },
      runner
    });

    expect(result).toEqual({ status: "success", token: "token-from-env" });
    expect(runner).not.toHaveBeenCalled();
  });

  it("ignores blank environment tokens and falls back to gh auth token", async () => {
    const runner = createRunner(async () => ({
      stdout: " token-from-gh \n",
      stderr: "",
      exitCode: SUCCESS_EXIT_CODE,
      error: null
    }));

    const result = await resolveGithubToken({
      env: { [GITHUB_TOKEN_ENV_NAME]: "   " },
      runner
    });

    expect(result).toEqual({ status: "success", token: "token-from-gh" });
    expect(runner).toHaveBeenCalledWith({
      command: "gh",
      args: ["auth", "token"],
      env: { [GITHUB_TOKEN_ENV_NAME]: "   " }
    });
  });

  it("finds GitHub CLI in common macOS paths when PATH is minimal", async () => {
    const runner = createRunner(async (request) => {
      if (request.command === "gh") {
        return {
          stdout: "",
          stderr: "",
          exitCode: null,
          error: { code: "ENOENT", message: "missing gh" }
        };
      }

      return {
        stdout: " token-from-common-gh \n",
        stderr: "",
        exitCode: SUCCESS_EXIT_CODE,
        error: null
      };
    });

    const result = await resolveGithubToken({
      env: {},
      fileExists: (candidatePath) => candidatePath === "/opt/homebrew/bin/gh",
      platform: "darwin",
      runner
    });

    expect(result).toEqual({ status: "success", token: "token-from-common-gh" });
    expect(runner).toHaveBeenNthCalledWith(1, {
      command: "gh",
      args: ["auth", "token"],
      env: {}
    });
    expect(runner).toHaveBeenNthCalledWith(2, {
      command: "/opt/homebrew/bin/gh",
      args: ["auth", "token"],
      env: {}
    });
  });

  it("fails safely when gh is missing from PATH and common locations", async () => {
    const runner = createRunner(async () => ({
      stdout: "",
      stderr: "",
      exitCode: null,
      error: { code: "ENOENT", message: "missing gh" }
    }));

    const result = await resolveGithubToken({ env: {}, runner });

    expect(result.status).toBe("failure");
    expect(result.status === "failure" ? result.error.code : "").toBe(GITHUB_CLI_NOT_FOUND_CODE);
    expect(result.status === "failure" ? result.error.message : "").toBe(
      "GitHub CLI was not found. Install GitHub CLI, then run gh auth login."
    );
    expect(JSON.stringify(result)).not.toContain("token-from");
  });

  it("fails safely when gh exits nonzero", async () => {
    const runner = createRunner(async () => ({
      stdout: "",
      stderr: "not authenticated",
      exitCode: FAILURE_EXIT_CODE,
      error: null
    }));

    const result = await resolveGithubToken({ env: {}, runner });

    expect(result.status).toBe("failure");
    expect(result.status === "failure" ? result.error.code : "").toBe(GITHUB_CLI_AUTH_FAILED_CODE);
    expect(result.status === "failure" ? result.error.exitCode : null).toBe(FAILURE_EXIT_CODE);
    expect(JSON.stringify(result)).not.toContain("not authenticated");
  });

  it("fails safely when gh returns blank stdout", async () => {
    const runner = createRunner(async () => ({
      stdout: " \n",
      stderr: "",
      exitCode: SUCCESS_EXIT_CODE,
      error: null
    }));

    const result = await resolveGithubToken({ env: {}, runner });

    expect(result.status).toBe("failure");
    expect(result.status === "failure" ? result.error.code : "").toBe(GITHUB_CLI_AUTH_FAILED_CODE);
    expect(result.status === "failure" ? result.error.message : "").toContain("gh auth login");
  });

  it("does not include token-like values in failure errors", async () => {
    const runner = createRunner(async () => ({
      stdout: "ghp_secret_token",
      stderr: "authorization: Bearer ghp_secret_token",
      exitCode: FAILURE_EXIT_CODE,
      error: null
    }));

    const result = await resolveGithubToken({ env: {}, runner });

    expect(result.status).toBe("failure");
    expect(JSON.stringify(result)).not.toContain("ghp_secret_token");
    expect(JSON.stringify(result)).not.toContain("authorization");
  });

  it("logs only auth source diagnostics in debug mode", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runner = createRunner(async () => ({
      stdout: " debug-token \n",
      stderr: "",
      exitCode: SUCCESS_EXIT_CODE,
      error: null
    }));

    const result = await resolveGithubToken({
      env: {
        GRAIDER_UI_DEBUG: "1"
      },
      runner
    });

    expect(result).toEqual({ status: "success", token: "debug-token" });
    expect(consoleError).toHaveBeenCalledWith("[graider-ui] GitHub auth: gh auth token succeeded.");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("debug-token");
    consoleError.mockRestore();
  });

  it("lists common GitHub CLI locations by platform", () => {
    expect(getCommonGithubCliPaths("darwin", {})).toEqual([
      "/opt/homebrew/bin/gh",
      "/usr/local/bin/gh",
      "/usr/bin/gh"
    ]);
    expect(getCommonGithubCliPaths("linux", {})).toEqual(["/usr/bin/gh", "/usr/local/bin/gh"]);
    expect(
      getCommonGithubCliPaths("win32", {
        ProgramFiles: "C:\\Program Files",
        "ProgramFiles(x86)": "C:\\Program Files (x86)"
      })
    ).toEqual(["C:\\Program Files/GitHub CLI/gh.exe", "C:\\Program Files (x86)/GitHub CLI/gh.exe"]);
  });
});
