import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CLI_ENTRYPOINT = path.resolve("src/cli/index.ts");
const TEST_ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const NODE_ARGUMENTS = ["--import", "tsx", CLI_ENTRYPOINT] as const;
const CONFIG_FIXTURE_ROOT = path.resolve("tests/fixtures/config");
const ROSTER_FIXTURE_ROOT = path.resolve("tests/fixtures/roster");
const VALID_REPO_ROOT = path.join(CONFIG_FIXTURE_ROOT, "valid-course");
const VALID_REPO_SUBDIRECTORY = path.join(VALID_REPO_ROOT, "terms", "27s1");
const MISSING_REPO_ROOT = path.join(CONFIG_FIXTURE_ROOT, "missing-course-yml");
const MALFORMED_YAML_ROOT = path.join(CONFIG_FIXTURE_ROOT, "malformed-yaml");
const VALID_ROSTER_REPO_ROOT = path.join(ROSTER_FIXTURE_ROOT, "valid-course");
const MISSING_ROSTER_COLUMN_ROOT = path.join(ROSTER_FIXTURE_ROOT, "missing-column");
const DUPLICATE_STUDENT_ROOT = path.join(ROSTER_FIXTURE_ROOT, "duplicate-student-id");
const DUPLICATE_GITHUB_ROOT = path.join(ROSTER_FIXTURE_ROOT, "duplicate-github-username");
const NORMALIZATION_WARNINGS_ROOT = path.join(ROSTER_FIXTURE_ROOT, "normalization-warnings");
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
  readonly warnings: Array<{ readonly code: string }>;
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
    const output = runCliText(["plan", "--help"]);

    expect(output).toContain("plan");
    expect(output).toContain("Plan assignment provisioning");
  });

  it("TC-CLI-SHELL-003 command exists: apply", () => {
    const output = runCliText(["apply", "--help"]);

    expect(output).toContain("apply");
    expect(output).toContain("Apply assignment repository changes");
  });

  it("TC-CLI-SHELL-004 command exists: grade", () => {
    const output = runCliText(["grade", "--help"]);

    expect(output).toContain("grade");
    expect(output).toContain("Run assignment grading");
  });

  it("TC-CLI-SHELL-005 command exists: report", () => {
    const output = runCliText(["report", "--help"]);

    expect(output).toContain("report");
    expect(output).toContain("Generate assignment reports");
  });

  it("TC-CLI-SHELL-006 command exists: archive", () => {
    const result = runCli(["archive", TEST_ASSIGNMENT_FILE]);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(result.stdout).toContain("archive");
    expect(result.stdout).toContain(TEST_ASSIGNMENT_FILE);
    expect(result.stdout).toContain("not_supported_in_mvp");
  });

  it("TC-CLI-SHELL-007 command exists: workflow generate", () => {
    const output = runCliText(["workflow", "generate", "--help"]);

    expect(output).toContain("generate");
    expect(output).toContain("Generate a local grading workflow file");
  });

  it("command exists: dashboard", () => {
    const output = runCliText(["dashboard", "--help"]);

    expect(output).toContain("dashboard");
    expect(output).toContain("Build a UI-ready dashboard model");
    expect(output).toContain("--term");
  });

  it("command exists: assignment detail", () => {
    const output = runCliText(["assignment", "detail", "--help"]);

    expect(output).toContain("detail");
    expect(output).toContain("Build a UI-ready read-only assignment detail model");
  });

  it("command exists: assignment apply-preview", () => {
    const output = runCliText(["assignment", "apply-preview", "--help"]);

    expect(output).toContain("apply-preview");
    expect(output).toContain("Build a UI-ready read-only assignment apply preview model");
  });

  it("command exists: assignment apply", () => {
    const output = runCliText(["assignment", "apply", "--help"]);

    expect(output).toContain("apply");
    expect(output).toContain("Apply assignment repository changes");
  });

  it("TC-CLI-SHELL-008 command exists: remove-access", () => {
    const result = runCli(["remove-access", TEST_ASSIGNMENT_FILE]);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(result.stdout).toContain("remove-access");
    expect(result.stdout).toContain(TEST_ASSIGNMENT_FILE);
    expect(result.stdout).toContain("not_supported_in_mvp");
  });

  it("TC-CLI-SHELL-009 unknown command exits nonzero", () => {
    const result = runCli(["unknown-command", TEST_ASSIGNMENT_FILE]);

    expect(result.status).not.toBe(SUCCESS_EXIT_CODE);
    expect(result.stderr).toContain("unknown command");
  });

  it("TC-CLI-SHELL-010 --json emits valid JSON command output", () => {
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
      options: {
        json: true,
        verbose: true,
        yes: true
      }
    });
  });

  it("TC-CLI-SHELL-011 archive returns not_supported_in_mvp", () => {
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

  it("TC-CLI-SHELL-012 remove-access returns not_supported_in_mvp", () => {
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

describe("graider validate roster validation", () => {
  it("succeeds for a valid fixture with rosters", () => {
    const result = runCli(["validate", TEST_ASSIGNMENT_FILE], VALID_ROSTER_REPO_ROOT);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(result.stdout).toContain("validate");
    expect(result.stdout).toContain("success");
  });

  it("emits parseable JSON with roster summary counts", () => {
    const result = runCli(["validate", TEST_ASSIGNMENT_FILE, "--json"], VALID_ROSTER_REPO_ROOT);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(json.summary).toMatchObject({
      rosterFiles: ["terms/27s1/rosters/section-001.csv", "terms/27s1/rosters/section-002.csv"],
      studentCount: 4,
      activeStudentCount: 2,
      droppedStudentCount: 1,
      holdStudentCount: 1
    });
  });

  it("exits 1 for missing roster column", () => {
    const result = runCli(["validate", TEST_ASSIGNMENT_FILE, "--json"], MISSING_ROSTER_COLUMN_ROOT);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.exitCode).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.errors).toEqual([
      expect.objectContaining({
        code: "missing_required_column"
      })
    ]);
  });

  it("exits 1 for duplicate student ID", () => {
    const result = runCli(["validate", TEST_ASSIGNMENT_FILE, "--json"], DUPLICATE_STUDENT_ROOT);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.errors).toEqual([
      expect.objectContaining({
        code: "duplicate_student_id"
      })
    ]);
  });

  it("exits 1 for duplicate GitHub username", () => {
    const result = runCli(["validate", TEST_ASSIGNMENT_FILE, "--json"], DUPLICATE_GITHUB_ROOT);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.errors).toEqual([
      expect.objectContaining({
        code: "duplicate_github_username"
      })
    ]);
  });

  it("exits 0 when only normalization warnings occur", () => {
    const result = runCli(
      ["validate", TEST_ASSIGNMENT_FILE, "--json"],
      NORMALIZATION_WARNINGS_ROOT
    );
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(json.status).toBe("success");
    expect(json.warnings).toEqual([
      expect.objectContaining({
        code: "student_id_normalized"
      }),
      expect.objectContaining({
        code: "github_username_normalized"
      }),
      expect.objectContaining({
        code: "roster_status_normalized"
      })
    ]);
  });

  it("includes warning diagnostics for normalization", () => {
    const result = runCli(
      ["validate", TEST_ASSIGNMENT_FILE, "--json"],
      NORMALIZATION_WARNINGS_ROOT
    );
    const json = parseJsonResult(result.stdout);

    expect(json.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "student_id_normalized",
          severity: "warning"
        }),
        expect.objectContaining({
          code: "github_username_normalized",
          severity: "warning"
        }),
        expect.objectContaining({
          code: "roster_status_normalized",
          severity: "warning"
        })
      ])
    );
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

describe("graider validate config validation", () => {
  it("succeeds for a valid fixture", () => {
    const output = runCliText(["validate", TEST_ASSIGNMENT_FILE], VALID_REPO_ROOT);

    expect(output).toContain("validate");
    expect(output).toContain("success");
    expect(output).toContain(TEST_ASSIGNMENT_FILE);
  });

  it("emits parseable JSON for a valid fixture", () => {
    const result = runCli(["validate", TEST_ASSIGNMENT_FILE, "--json"], VALID_REPO_ROOT);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(json.status).toBe("success");
    expect(json.summary).toMatchObject({
      courseConfigPath: "course.yml",
      termConfigPath: "terms/27s1/term.yml",
      assignmentConfigPath: TEST_ASSIGNMENT_FILE,
      termCode: "27s1",
      assignmentSlug: "lab04"
    });
  });

  it("exits 5 for missing course.yml", () => {
    const result = runCli(["validate", TEST_ASSIGNMENT_FILE, "--json"], MISSING_REPO_ROOT);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(CONFIGURATION_ERROR_EXIT_CODE);
    expect(json.exitCode).toBe(CONFIGURATION_ERROR_EXIT_CODE);
    expect(json.errors).toEqual([
      expect.objectContaining({
        code: "missing_required_file"
      })
    ]);
  });

  it("exits 5 for malformed YAML", () => {
    const result = runCli(["validate", TEST_ASSIGNMENT_FILE, "--json"], MALFORMED_YAML_ROOT);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(CONFIGURATION_ERROR_EXIT_CODE);
    expect(json.exitCode).toBe(CONFIGURATION_ERROR_EXIT_CODE);
    expect(json.errors).toEqual([
      expect.objectContaining({
        code: "invalid_yaml"
      })
    ]);
  });

  it("includes structured errors on failure", () => {
    const result = runCli(["validate", TEST_ASSIGNMENT_FILE, "--json"], MALFORMED_YAML_ROOT);
    const json = parseJsonResult(result.stdout);

    expect(json.status).toBe("failure");
    expect(json.warnings).toEqual([]);
    expect(json.generatedFiles).toEqual([]);
    expect(json.errors[0]).toMatchObject({
      code: "invalid_yaml",
      severity: "error"
    });
  });
});
