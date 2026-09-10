import { describe, expect, it, vi } from "vitest";
import {
  BUNDLED_GRAIDER_CLI_MISSING_PROCESS_CODE,
  type ProcessRunDiagnostic,
  type ProcessRunResult
} from "./commandRunner.js";
import { runGraiderCliPreflight } from "./graiderCliPreflight.js";

const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const HELPER_PATH = "C:\\apps\\graider\\dist\\index.js";
const EXECUTABLE_PATH = "C:\\Program Files\\nodejs\\node.exe";

const diagnostic: ProcessRunDiagnostic = {
  runnerMode: "external",
  command: "graider",
  args: ["--version"],
  cwd: null,
  executablePath: EXECUTABLE_PATH,
  helperPath: HELPER_PATH,
  resolutionSource: "development"
};

const createRunner = (result: Partial<ProcessRunResult>) =>
  vi.fn(
    (): Promise<ProcessRunResult> =>
      Promise.resolve({
        stdout: "",
        stderr: "",
        exitCode: SUCCESS_EXIT_CODE,
        error: null,
        diagnostic,
        ...result
      })
  );

describe("runGraiderCliPreflight", () => {
  it("reports the version and the tier that located the CLI", async () => {
    const runner = createRunner({ stdout: "0.1.0\n" });

    await expect(runGraiderCliPreflight({ runner })).resolves.toEqual({
      status: "ok",
      version: "0.1.0",
      resolutionSource: "development",
      executablePath: EXECUTABLE_PATH,
      helperPath: HELPER_PATH,
      errorCode: null,
      errorMessage: null
    });
    expect(runner).toHaveBeenCalledWith({ command: "graider", args: ["--version"] });
  });

  it("reports the attempted location when the CLI cannot be started", async () => {
    const runner = createRunner({
      exitCode: null,
      error: { code: BUNDLED_GRAIDER_CLI_MISSING_PROCESS_CODE, message: "missing" },
      diagnostic: { ...diagnostic, runnerMode: "bundled", resolutionSource: null }
    });

    const result = await runGraiderCliPreflight({ runner });

    expect(result.status).toBe("failure");
    expect(result.errorCode).toBe("bundled_graider_cli_not_found");
    expect(result.errorMessage).toContain(HELPER_PATH);
    expect(result.helperPath).toBe(HELPER_PATH);
  });

  it("treats a nonzero exit or empty output as a failed preflight", async () => {
    const runner = createRunner({ exitCode: FAILURE_EXIT_CODE, stdout: "0.1.0" });
    const emptyRunner = createRunner({ stdout: "  \n" });

    await expect(runGraiderCliPreflight({ runner })).resolves.toMatchObject({
      status: "failure",
      errorCode: "graider_cli_preflight_failed"
    });
    await expect(runGraiderCliPreflight({ runner: emptyRunner })).resolves.toMatchObject({
      status: "failure",
      version: null
    });
  });
});
