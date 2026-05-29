import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CLI_ENTRYPOINT = path.resolve("src/cli/index.ts");
const NODE_ARGUMENTS = ["--import", "tsx", CLI_ENTRYPOINT] as const;
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const CONFIG_FIXTURE_ROOT = path.resolve("tests/fixtures/config");
const ROSTER_FIXTURE_ROOT = path.resolve("tests/fixtures/roster");
const VALID_ROOT = path.join(ROSTER_FIXTURE_ROOT, "valid-course");
const CONFIG_FAILURE_ROOT = path.join(CONFIG_FIXTURE_ROOT, "malformed-yaml");
const ROSTER_FAILURE_ROOT = path.join(ROSTER_FIXTURE_ROOT, "missing-column");
const WARNINGS_ONLY_ROOT = path.join(ROSTER_FIXTURE_ROOT, "normalization-warnings");
const TOKEN_OUTPUT_ROOT = path.join(ROSTER_FIXTURE_ROOT, "invalid-github-username");
const TOKEN_VALUE = "ghp_abcdefghijklmnopqrstuvwxyz123456";
const REDACTED_VALUE = "[REDACTED]";
const SUCCESS_EXIT_CODE = 0;
const COMMAND_ERROR_EXIT_CODE = 1;
const CONFIGURATION_ERROR_EXIT_CODE = 5;

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface JsonResult {
  readonly commandName: string;
  readonly status: string;
  readonly exitCode: number;
  readonly warnings: Array<{ readonly code: string; readonly severity: string }>;
  readonly errors: Array<{ readonly code: string; readonly severity: string }>;
  readonly summary: Record<string, unknown>;
}

const runCli = (args: readonly string[], cwd?: string): CliResult =>
  spawnSync("node", [...NODE_ARGUMENTS, ...args], {
    cwd,
    encoding: "utf8"
  });

const parseJson = (stdout: string): JsonResult => JSON.parse(stdout) as JsonResult;

const expectNoStackTrace = (output: string): void => {
  expect(output).not.toContain("Stack trace");
  expect(output).not.toContain("at ");
};

describe("CLI output formatting", () => {
  it("successful placeholder command JSON output is parseable", () => {
    const result = runCli(["apply", ASSIGNMENT_FILE, "--json"]);
    const json = parseJson(result.stdout);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(json.commandName).toBe("apply");
    expect(json.status).toBe("success");
  });

  it("unsupported command JSON output is parseable and redacted", () => {
    const result = runCli(["archive", ASSIGNMENT_FILE, "--json"]);
    const json = parseJson(result.stdout);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.status).toBe("failure");
    expect(json.errors).toEqual([
      expect.objectContaining({
        code: "not_supported_in_mvp"
      })
    ]);
    expect(result.stdout).not.toContain(TOKEN_VALUE);
  });

  it("validate config failure exits 5", () => {
    const result = runCli(["validate", ASSIGNMENT_FILE, "--json"], CONFIG_FAILURE_ROOT);
    const json = parseJson(result.stdout);

    expect(result.status).toBe(CONFIGURATION_ERROR_EXIT_CODE);
    expect(json.exitCode).toBe(CONFIGURATION_ERROR_EXIT_CODE);
  });

  it("validate roster failure exits 1", () => {
    const result = runCli(["validate", ASSIGNMENT_FILE, "--json"], ROSTER_FAILURE_ROOT);
    const json = parseJson(result.stdout);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.exitCode).toBe(COMMAND_ERROR_EXIT_CODE);
  });

  it("validate warnings-only result exits 0", () => {
    const result = runCli(["validate", ASSIGNMENT_FILE, "--json"], WARNINGS_ONLY_ROOT);
    const json = parseJson(result.stdout);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(json.exitCode).toBe(SUCCESS_EXIT_CODE);
    expect(json.warnings.length).toBeGreaterThan(0);
  });

  it("normal output includes diagnostic codes but no stack trace", () => {
    const result = runCli(["validate", ASSIGNMENT_FILE], ROSTER_FAILURE_ROOT);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(result.stdout).toContain("missing_required_column");
    expectNoStackTrace(result.stdout);
    expectNoStackTrace(result.stderr);
  });

  it("JSON output includes diagnostic codes but no stack trace", () => {
    const result = runCli(["validate", ASSIGNMENT_FILE, "--json"], ROSTER_FAILURE_ROOT);
    const json = parseJson(result.stdout);

    expect(json.errors).toEqual([
      expect.objectContaining({
        code: "missing_required_column"
      })
    ]);
    expectNoStackTrace(result.stdout);
    expectNoStackTrace(result.stderr);
  });

  it("JSON output redacts token-like values in summary/context", () => {
    const result = runCli(["validate", ASSIGNMENT_FILE, "--json"], TOKEN_OUTPUT_ROOT);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(result.stdout).toContain(REDACTED_VALUE);
    expect(result.stdout).not.toContain(TOKEN_VALUE);
  });

  it("human-readable output redacts token-like values", () => {
    const result = runCli(["validate", ASSIGNMENT_FILE], TOKEN_OUTPUT_ROOT);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(result.stdout).toContain(REDACTED_VALUE);
    expect(result.stdout).not.toContain(TOKEN_VALUE);
  });

  it("successful validate output remains parseable JSON", () => {
    const result = runCli(["validate", ASSIGNMENT_FILE, "--json"], VALID_ROOT);
    const json = parseJson(result.stdout);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(json.status).toBe("success");
  });
});
