import type { Command } from "commander";
import {
  type CommonCommandOptions,
  normalizeCommonCommandOptions,
  type RawCommonCommandOptions
} from "../../core/command-context.js";
import { createCommandResult, type CommandResult } from "../../core/command-result.js";
import { createNotSupportedInMvpDiagnostic } from "../../diagnostics/error-catalog.js";
import { writeCommandResult } from "../output.js";

const COMMAND_NAME = "remove-access";

export interface RemoveAccessTargetSelector {
  all?: boolean;
  section?: string;
  studentId?: string;
  githubUsername?: string;
}

export interface RemoveAccessCommandRequest {
  cwd: string;
  assignmentFile: string;
  options: CommonCommandOptions;
  targetSelector: RemoveAccessTargetSelector;
}

interface RemoveAccessRawOptions extends RawCommonCommandOptions {
  all?: boolean;
  section?: string;
  studentId?: string;
  githubUsername?: string;
}

const normalizeRemoveAccessTargetSelector = (
  rawOptions: RemoveAccessRawOptions
): RemoveAccessTargetSelector => ({
  ...(rawOptions.all === undefined ? {} : { all: rawOptions.all }),
  ...(rawOptions.section === undefined ? {} : { section: rawOptions.section }),
  ...(rawOptions.studentId === undefined ? {} : { studentId: rawOptions.studentId }),
  ...(rawOptions.githubUsername === undefined ? {} : { githubUsername: rawOptions.githubUsername })
});

export const runRemoveAccessCommand = ({
  cwd,
  assignmentFile,
  options,
  targetSelector
}: RemoveAccessCommandRequest): CommandResult =>
  createCommandResult({
    commandName: COMMAND_NAME,
    assignmentFile,
    status: "failure",
    warnings: [],
    errors: [createNotSupportedInMvpDiagnostic(COMMAND_NAME, assignmentFile)],
    generatedFiles: [],
    summary: {
      unsupported: true,
      mvpSupported: false,
      cwd,
      options,
      targetSelector
    }
  });

export const registerRemoveAccessCommand = (program: Command): void => {
  program
    .command(COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Emit JSON output")
    .option("--verbose", "Emit verbose diagnostics")
    .option("--yes", "Confirm non-interactive execution")
    .option("--all", "Reserved for future remove-access targeting")
    .option("--section <section-id>", "Reserved for future remove-access targeting")
    .option("--student-id <student-id>", "Reserved for future remove-access targeting")
    .option("--github-username <github-username>", "Reserved for future remove-access targeting")
    .description("Remove student access from assignment repositories.")
    .action((assignmentFile: string, rawOptions: RemoveAccessRawOptions) => {
      const options = normalizeCommonCommandOptions(rawOptions);
      const result = runRemoveAccessCommand({
        cwd: process.cwd(),
        assignmentFile,
        options,
        targetSelector: normalizeRemoveAccessTargetSelector(rawOptions)
      });

      writeCommandResult(result, options.json);
      process.exitCode = result.exitCode;
    });
};
