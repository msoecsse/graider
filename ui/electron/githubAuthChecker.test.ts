import { describe, expect, it, vi } from "vitest";
import type { ProcessRunner } from "./commandRunner.js";
import { checkGitHubAuth } from "./githubAuthChecker.js";
import {
  GITHUB_CLI_AUTH_FAILED_CODE,
  GITHUB_CLI_NOT_FOUND_CODE,
  GITHUB_TOKEN_ENV_NAME
} from "./tokenResolver.js";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;

const createRunner = (runner: ProcessRunner): ProcessRunner => vi.fn(runner);

describe("githubAuthChecker", () => {
  it("reports env token as connected without exposing the token", async () => {
    const runner = createRunner(async () => ({
      stdout: "",
      stderr: "",
      exitCode: SUCCESS_EXIT_CODE,
      error: null
    }));

    const result = await checkGitHubAuth({
      env: { [GITHUB_TOKEN_ENV_NAME]: "ghp_secret_token" },
      runner
    });

    expect(result).toEqual({
      status: "connected",
      username: null,
      diagnostic: null,
      diagnosticCode: null
    });
    expect(runner).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("ghp_secret_token");
  });

  it("reports gh auth token success as connected without exposing the token", async () => {
    const runner = createRunner(async () => ({
      stdout: "ghp_secret_token\n",
      stderr: "",
      exitCode: SUCCESS_EXIT_CODE,
      error: null
    }));

    const result = await checkGitHubAuth({
      env: {},
      runner
    });

    expect(result.status).toBe("connected");
    expect(JSON.stringify(result)).not.toContain("ghp_secret_token");
    expect(runner).toHaveBeenCalledWith({
      command: "gh",
      args: ["auth", "token"],
      env: {}
    });
  });

  it("reports missing gh as not connected with a safe diagnostic", async () => {
    const runner = createRunner(async () => ({
      stdout: "",
      stderr: "",
      exitCode: null,
      error: { code: "ENOENT", message: "spawn gh ENOENT" }
    }));

    const result = await checkGitHubAuth({
      env: {},
      runner
    });

    expect(result.status).toBe("not_connected");
    expect(result.diagnosticCode).toBe(GITHUB_CLI_NOT_FOUND_CODE);
    expect(result.diagnostic).toContain("GitHub CLI was not found");
    expect(JSON.stringify(result)).not.toContain("spawn gh ENOENT");
  });

  it("reports gh auth failure as not connected with a safe diagnostic", async () => {
    const runner = createRunner(async () => ({
      stdout: "",
      stderr: "not authenticated ghp_secret_token",
      exitCode: FAILURE_EXIT_CODE,
      error: null
    }));

    const result = await checkGitHubAuth({
      env: {},
      runner
    });

    expect(result.status).toBe("not_connected");
    expect(result.diagnosticCode).toBe(GITHUB_CLI_AUTH_FAILED_CODE);
    expect(result.diagnostic).toContain("gh auth login");
    expect(JSON.stringify(result)).not.toContain("ghp_secret_token");
    expect(JSON.stringify(result)).not.toContain("not authenticated");
  });
});
