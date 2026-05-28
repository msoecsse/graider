import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CLI_ENTRYPOINT = path.resolve("src/cli/index.ts");
const TEST_ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const NODE_ARGUMENTS = ["--import", "tsx", CLI_ENTRYPOINT] as const;
const FIXTURE_ROOT = path.resolve("tests/fixtures/path-resolution");
const VALID_REPO_ROOT = path.join(FIXTURE_ROOT, "valid-root");
const VALID_REPO_SUBDIRECTORY = path.join(VALID_REPO_ROOT, "terms", "27s1");
const MISSING_REPO_ROOT = path.join(FIXTURE_ROOT, "no-course-yml");
const SUCCESS_EXIT_CODE = 0;
const COMMAND_ERROR_EXIT_CODE = 1;
const CONFIGURATION_ERROR_EXIT_CODE = 5;

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface JsonCommandResult {
  readonly commandName: string;
  readonly assignmentFile: string;
  readonly status: string;
  readonly exitCode: number;
  readonly warnings: unknown[];
  readonly errors: Array<{ readonly code: string }>;
  readonly generatedFiles: string[];
  readonly summary: Record<string, unknown>;
}

const runCli = (args: readonly string[], cwd?: string): CliResult => {
  const result = spawnSync("node", [...NODE_ARGUMENTS, ...args], {
    cwd,
    encoding: "utf8"
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
};

const runCliText = (args: readonly string[], cwd?: string): string =>
  execFileSync("node", [...NODE_ARGUMENTS, ...args], {
    cwd,
    encoding: "utf8"
  });

const parseJsonResult = (output: string): JsonCommandResult =>
  JSON.parse(output) as JsonCommandResult;

describe("graider CLI shell", () => {
  it("TC-CLI-SHELL-001 command exists: validate", () => {
    const output = runCliText(["validate", TEST_ASSIGNMENT_FILE], VALID_REPO_ROOT);

    expect(output).toContain("validate");
    expect(output).toContain(TEST_ASSIGNMENT_FILE);
    expect(output).toContain("success");
  });

  it("TC-CLI-SHELL-002 command exists: plan", () => {
    const output = runCliText(["plan", TEST_ASSIGNMENT_FILE]);

    expect(output).toContain("plan");
    expect(output).toContain(TEST_ASSIGNMENT_FILE);
    expect(output).toContain("success");
  });

  it("TC-CLI-SHELL-003 command exists: apply", () => {
    const output = runCliText(["apply", TEST_ASSIGNMENT_FILE]);

    expect(output).toContain("apply");
    expect(output).toContain(TEST_ASSIGNMENT_FILE);
    expect(output).toContain("success");
  });

  it("TC-CLI-SHELL-004 command exists: grade", () => {
    const output = runCliText(["grade", TEST_ASSIGNMENT_FILE]);

    expect(output).toContain("grade");
    expect(output).toContain(TEST_ASSIGNMENT_FILE);
    expect(output).toContain("success");
  });

  it("TC-CLI-SHELL-005 command exists: report", () => {
    const output = runCliText(["report", TEST_ASSIGNMENT_FILE]);

    expect(output).toContain("report");
    expect(output).toContain(TEST_ASSIGNMENT_FILE);
    expect(output).toContain("success");
  });

  it("TC-CLI-SHELL-006 command exists: archive", () => {
    const result = runCli(["archive", TEST_ASSIGNMENT_FILE]);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(result.stdout).toContain("archive");
    expect(result.stdout).toContain(TEST_ASSIGNMENT_FILE);
    expect(result.stdout).toContain("not_supported_in_mvp");
  });

  it("TC-CLI-SHELL-007 command exists: remove-access", () => {
    const result = runCli(["remove-access", TEST_ASSIGNMENT_FILE]);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(result.stdout).toContain("remove-access");
    expect(result.stdout).toContain(TEST_ASSIGNMENT_FILE);
    expect(result.stdout).toContain("not_supported_in_mvp");
  });

  it("TC-CLI-SHELL-008 unknown command exits nonzero", () => {
    const result = runCli(["unknown-command", TEST_ASSIGNMENT_FILE]);

    expect(result.status).not.toBe(SUCCESS_EXIT_CODE);
    expect(result.stderr).toContain("unknown command");
  });

  it("TC-CLI-SHELL-009 --json emits valid JSON placeholder output", () => {
    const result = runCli(
      ["validate", TEST_ASSIGNMENT_FILE, "--json", "--verbose", "--yes"],
      VALID_REPO_ROOT
    );
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(json.commandName).toBe("validate");
    expect(json.assignmentFile).toBe(TEST_ASSIGNMENT_FILE);
    expect(json.status).toBe("success");
    expect(json.exitCode).toBe(SUCCESS_EXIT_CODE);
    expect(json.warnings).toEqual([]);
    expect(json.errors).toEqual([]);
    expect(json.generatedFiles).toEqual([]);
    expect(json.summary).toMatchObject({
      placeholder: true,
      options: {
        json: true,
        verbose: true,
        yes: true
      },
      repoRoot: VALID_REPO_ROOT,
      assignmentPath: path.join(VALID_REPO_ROOT, TEST_ASSIGNMENT_FILE),
      assignmentRelativePath: TEST_ASSIGNMENT_FILE
    });
  });

  it("TC-CLI-SHELL-010 archive returns not_supported_in_mvp", () => {
    const result = runCli(["archive", TEST_ASSIGNMENT_FILE, "--json"]);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.commandName).toBe("archive");
    expect(json.status).toBe("failure");
    expect(json.exitCode).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.errors).toEqual([
      expect.objectContaining({
        code: "not_supported_in_mvp"
      })
    ]);
  });

  it("TC-CLI-SHELL-011 remove-access returns not_supported_in_mvp", () => {
    const result = runCli(["remove-access", TEST_ASSIGNMENT_FILE, "--json"]);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.commandName).toBe("remove-access");
    expect(json.status).toBe("failure");
    expect(json.exitCode).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.errors).toEqual([
      expect.objectContaining({
        code: "not_supported_in_mvp"
      })
    ]);
  });
});

describe("graider validate path resolution", () => {
  it("validate run from repo root succeeds", () => {
    const result = runCli(["validate", TEST_ASSIGNMENT_FILE, "--json"], VALID_REPO_ROOT);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(json.summary).toMatchObject({
      repoRoot: VALID_REPO_ROOT,
      assignmentRelativePath: TEST_ASSIGNMENT_FILE
    });
  });

  it("validate run from subdirectory succeeds", () => {
    const assignmentFile = "assignments/lab04/assignment.yml";
    const result = runCli(["validate", assignmentFile, "--json"], VALID_REPO_SUBDIRECTORY);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(json.summary).toMatchObject({
      repoRoot: VALID_REPO_ROOT,
      assignmentRelativePath: TEST_ASSIGNMENT_FILE
    });
  });

  it("validate run outside a repo fails with missing_required_file", () => {
    const result = runCli(["validate", TEST_ASSIGNMENT_FILE, "--json"], MISSING_REPO_ROOT);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(CONFIGURATION_ERROR_EXIT_CODE);
    expect(json.status).toBe("failure");
    expect(json.exitCode).toBe(CONFIGURATION_ERROR_EXIT_CODE);
    expect(json.warnings).toEqual([]);
    expect(json.generatedFiles).toEqual([]);
    expect(json.errors).toEqual([
      expect.objectContaining({
        code: "missing_required_file"
      })
    ]);
  });
});
