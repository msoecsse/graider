import { describe, expect, it } from "vitest";
import { ExitCode } from "../../src/core/exit-codes.js";
import { formatCommandResultAsJson, formatCommandResultAsText } from "../../src/cli/output.js";
import type { CommandResult } from "../../src/core/command-result.js";

const TEST_ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";

const createResult = (): CommandResult => ({
  commandName: "validate",
  assignmentFile: TEST_ASSIGNMENT_FILE,
  status: "success",
  exitCode: ExitCode.Success,
  warnings: [],
  errors: [],
  generatedFiles: [],
  summary: {
    placeholder: true
  }
});

describe("command output formatting", () => {
  it("formats parseable JSON command results", () => {
    const json = JSON.parse(formatCommandResultAsJson(createResult())) as CommandResult;

    expect(json.commandName).toBe("validate");
    expect(json.assignmentFile).toBe(TEST_ASSIGNMENT_FILE);
    expect(json.exitCode).toBe(ExitCode.Success);
  });

  it("formats concise human command results", () => {
    const text = formatCommandResultAsText(createResult());

    expect(text).toContain("validate");
    expect(text).toContain(TEST_ASSIGNMENT_FILE);
    expect(text).toContain("success");
  });
});
