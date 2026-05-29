import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runArchiveCommand } from "../../src/cli/commands/archive.command.js";
import { formatCommandResultAsJson } from "../../src/cli/output.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { DiagnosticCode } from "../../src/diagnostics/error-catalog.js";

const CLI_ENTRYPOINT = path.resolve("src/cli/index.ts");
const NODE_ARGUMENTS = ["--import", "tsx", CLI_ENTRYPOINT] as const;
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const SUCCESS_EXIT_CODE = 0;
const COMMAND_ERROR_EXIT_CODE = 1;
const EMPTY_FILE_COUNT = 0;
const jsonOptions = normalizeCommonCommandOptions({ json: true });

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface JsonCommandResult {
  readonly commandName: string;
  readonly assignmentFile?: string;
  readonly status: string;
  readonly exitCode: number;
  readonly errors: Array<{ readonly code: string; readonly severity: string }>;
  readonly generatedFiles: string[];
  readonly summary: Record<string, unknown>;
}

const runCli = (args: readonly string[], cwd?: string): CliResult =>
  spawnSync("node", [...NODE_ARGUMENTS, ...args], {
    cwd,
    encoding: "utf8"
  });

const parseJsonResult = (output: string): JsonCommandResult =>
  JSON.parse(output) as JsonCommandResult;

const listFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return listFiles(entryPath).map((filePath) => path.join(entry.name, filePath));
    }

    return entry.isFile() ? [entry.name] : [];
  });

describe("archive unsupported command shell", () => {
  it("TC-CLI-ARCHIVE-UNSUPPORTED-001 archive command exists", () => {
    const result = runCli(["archive", "--help"]);

    expect(result.status).toBe(SUCCESS_EXIT_CODE);
    expect(result.stdout).toContain("archive");
    expect(result.stdout).toContain("Archive assignment repositories");
  });

  it("TC-CLI-ARCHIVE-UNSUPPORTED-002 archive returns not_supported_in_mvp", () => {
    const result = runCli(["archive", ASSIGNMENT_FILE, "--json"]);
    const json = parseJsonResult(result.stdout);

    expect(json.commandName).toBe("archive");
    expect(json.status).toBe("failure");
    expect(json.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.NotSupportedInMvp })
    ]);
  });

  it("TC-CLI-ARCHIVE-UNSUPPORTED-003 archive performs no GitHub mutation", () => {
    const result = runArchiveCommand({
      cwd: process.cwd(),
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      targetSelector: { all: true, removeStudentAccess: true }
    });

    expect(result.generatedFiles).toEqual([]);
    expect(result.summary).toMatchObject({
      unsupported: true,
      targetSelector: {
        all: true,
        removeStudentAccess: true
      }
    });
  });

  it("TC-CLI-ARCHIVE-UNSUPPORTED-004 archive exits with code 1", () => {
    const result = runCli(["archive", ASSIGNMENT_FILE, "--json"]);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.exitCode).toBe(ExitCode.CommandError);
  });

  it("archive --json output is parseable and includes empty generatedFiles", () => {
    const result = runCli(["archive", ASSIGNMENT_FILE, "--json", "--verbose", "--yes"]);
    const json = parseJsonResult(result.stdout);

    expect(json.assignmentFile).toBe(ASSIGNMENT_FILE);
    expect(json.generatedFiles).toEqual([]);
    expect(json.summary.options).toMatchObject({
      json: true,
      verbose: true,
      yes: true
    });
  });

  it("human-readable archive output includes not_supported_in_mvp", () => {
    const result = runCli(["archive", ASSIGNMENT_FILE]);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(result.stdout).toContain("archive");
    expect(result.stdout).toContain(ASSIGNMENT_FILE);
    expect(result.stdout).toContain(DiagnosticCode.NotSupportedInMvp);
    expect(result.stdout).not.toContain("Stack trace");
  });

  it("archive parses reserved future selector flags and remains unsupported", () => {
    const result = runCli([
      "archive",
      ASSIGNMENT_FILE,
      "--json",
      "--all",
      "--remove-student-access"
    ]);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.errors[0]?.code).toBe(DiagnosticCode.NotSupportedInMvp);
    expect(json.summary.targetSelector).toMatchObject({
      all: true,
      removeStudentAccess: true
    });
  });

  it("archive does not write files", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "graider-archive-"));
    const beforeFiles = listFiles(cwd);
    const result = runCli(["archive", ASSIGNMENT_FILE], cwd);
    const afterFiles = listFiles(cwd);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(beforeFiles).toHaveLength(EMPTY_FILE_COUNT);
    expect(afterFiles).toEqual(beforeFiles);
  });

  it("archive JSON formatting is centralized", () => {
    const result = runArchiveCommand({
      cwd: process.cwd(),
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      targetSelector: {}
    });
    const json = parseJsonResult(formatCommandResultAsJson(result));

    expect(json.errors[0]?.code).toBe(DiagnosticCode.NotSupportedInMvp);
  });
});
