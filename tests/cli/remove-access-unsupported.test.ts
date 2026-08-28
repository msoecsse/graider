import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runRemoveAccessCommand } from "../../src/cli/commands/remove-access.command.js";
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
const CLI_HELP_TIMEOUT_MS = 15_000;
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

describe("remove-access unsupported command shell", () => {
  it(
    "TC-CLI-REMOVE-UNSUPPORTED-001 remove-access command exists",
    () => {
      const result = runCli(["remove-access", "--help"]);

      expect(result.status).toBe(SUCCESS_EXIT_CODE);
      expect(result.stdout).toContain("remove-access");
      expect(result.stdout).toContain("Remove student access");
    },
    CLI_HELP_TIMEOUT_MS
  );

  it("TC-CLI-REMOVE-UNSUPPORTED-002 remove-access returns not_supported_in_mvp", () => {
    const result = runCli(["remove-access", ASSIGNMENT_FILE, "--json"]);
    const json = parseJsonResult(result.stdout);

    expect(json.commandName).toBe("remove-access");
    expect(json.status).toBe("failure");
    expect(json.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.NotSupportedInMvp })
    ]);
  });

  it("TC-CLI-REMOVE-UNSUPPORTED-003 remove-access performs no GitHub mutation", () => {
    const result = runRemoveAccessCommand({
      cwd: process.cwd(),
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      targetSelector: { all: true }
    });

    expect(result.generatedFiles).toEqual([]);
    expect(result.summary).toMatchObject({
      unsupported: true,
      targetSelector: {
        all: true
      }
    });
  });

  it("TC-CLI-REMOVE-UNSUPPORTED-004 remove-access exits with code 1", () => {
    const result = runCli(["remove-access", ASSIGNMENT_FILE, "--json"]);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.exitCode).toBe(ExitCode.CommandError);
  });

  it("remove-access --json output is parseable and includes empty generatedFiles", () => {
    const result = runCli(["remove-access", ASSIGNMENT_FILE, "--json", "--verbose", "--yes"]);
    const json = parseJsonResult(result.stdout);

    expect(json.assignmentFile).toBe(ASSIGNMENT_FILE);
    expect(json.generatedFiles).toEqual([]);
    expect(json.summary.options).toMatchObject({
      json: true,
      verbose: true,
      yes: true
    });
  });

  it("human-readable remove-access output includes not_supported_in_mvp", () => {
    const result = runCli(["remove-access", ASSIGNMENT_FILE]);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(result.stdout).toContain("remove-access");
    expect(result.stdout).toContain(ASSIGNMENT_FILE);
    expect(result.stdout).toContain(DiagnosticCode.NotSupportedInMvp);
    expect(result.stdout).not.toContain("Stack trace");
  });

  it("remove-access parses reserved future selector flags and remains unsupported", () => {
    const result = runCli([
      "remove-access",
      ASSIGNMENT_FILE,
      "--json",
      "--section",
      "001",
      "--student-id",
      "jones"
    ]);
    const json = parseJsonResult(result.stdout);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(json.errors[0]?.code).toBe(DiagnosticCode.NotSupportedInMvp);
    expect(json.summary.targetSelector).toMatchObject({
      section: "001",
      studentId: "jones"
    });
  });

  it("remove-access does not write files", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "graider-remove-access-"));
    const beforeFiles = listFiles(cwd);
    const result = runCli(["remove-access", ASSIGNMENT_FILE], cwd);
    const afterFiles = listFiles(cwd);

    expect(result.status).toBe(COMMAND_ERROR_EXIT_CODE);
    expect(beforeFiles).toHaveLength(EMPTY_FILE_COUNT);
    expect(afterFiles).toEqual(beforeFiles);
  });

  it("remove-access JSON formatting is centralized", () => {
    const result = runRemoveAccessCommand({
      cwd: process.cwd(),
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      targetSelector: {}
    });
    const json = parseJsonResult(formatCommandResultAsJson(result));

    expect(json.errors[0]?.code).toBe(DiagnosticCode.NotSupportedInMvp);
  });
});
