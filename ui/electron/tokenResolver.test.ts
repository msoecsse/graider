import { describe, expect, it, vi } from "vitest";
import type { ProcessRunner } from "./commandRunner.js";
import { GITHUB_TOKEN_ENV_NAME, resolveGithubToken } from "./tokenResolver.js";

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

  it("fails safely when gh is missing", async () => {
    const runner = createRunner(async () => ({
      stdout: "",
      stderr: "",
      exitCode: null,
      error: { code: "ENOENT", message: "missing gh" }
    }));

    const result = await resolveGithubToken({ env: {}, runner });

    expect(result.status).toBe("failure");
    expect(result.status === "failure" ? result.error.code : "").toBe("github_token_unavailable");
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
    expect(result.status === "failure" ? result.error.exitCode : null).toBe(FAILURE_EXIT_CODE);
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
    expect(result.status === "failure" ? result.error.message : "").toContain("empty token");
  });
});
