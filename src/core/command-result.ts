import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { CommandContext } from "./command-context.js";
import { ExitCode } from "./exit-codes.js";

export type CommandStatus = "success" | "failure" | "partial_success";

export interface CommandResult {
  commandName: string;
  assignmentFile?: string;
  status: CommandStatus;
  exitCode: ExitCode;
  warnings: Diagnostic[];
  errors: Diagnostic[];
  generatedFiles: string[];
  summary: Record<string, unknown>;
}

export const createSuccessfulPlaceholderResult = (context: CommandContext): CommandResult => ({
  commandName: context.commandName,
  assignmentFile: context.assignmentRelativePath ?? context.assignmentFile,
  status: "success",
  exitCode: ExitCode.Success,
  warnings: [],
  errors: [],
  generatedFiles: [],
  summary: {
    placeholder: true,
    options: context.options,
    cwd: context.cwd,
    assignmentPath: context.assignmentPath,
    ...(context.repoRoot === undefined ? {} : { repoRoot: context.repoRoot }),
    ...(context.assignmentRelativePath === undefined
      ? {}
      : { assignmentRelativePath: context.assignmentRelativePath })
  }
});

export const createFailedPlaceholderResult = (
  context: CommandContext,
  error: Diagnostic,
  exitCode: ExitCode = ExitCode.CommandError
): CommandResult => ({
  commandName: context.commandName,
  assignmentFile: context.assignmentRelativePath ?? context.assignmentFile,
  status: "failure",
  exitCode,
  warnings: [],
  errors: [error],
  generatedFiles: [],
  summary: {
    placeholder: true,
    options: context.options,
    cwd: context.cwd,
    assignmentPath: context.assignmentPath,
    ...(context.repoRoot === undefined ? {} : { repoRoot: context.repoRoot }),
    ...(context.assignmentRelativePath === undefined
      ? {}
      : { assignmentRelativePath: context.assignmentRelativePath })
  }
});
