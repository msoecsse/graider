import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { CommandContext } from "./command-context.js";
import { resolveExitCode, type ExitCode } from "./exit-codes.js";

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

export type CommandResultInput = Omit<CommandResult, "exitCode">;

export const createCommandResult = (input: CommandResultInput): CommandResult => ({
  ...input,
  exitCode: resolveExitCode(input)
});

export const createSuccessfulPlaceholderResult = (context: CommandContext): CommandResult =>
  createCommandResult({
    commandName: context.commandName,
    assignmentFile: context.assignmentRelativePath ?? context.assignmentFile,
    status: "success",
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
  error: Diagnostic
): CommandResult =>
  createCommandResult({
    commandName: context.commandName,
    assignmentFile: context.assignmentRelativePath ?? context.assignmentFile,
    status: "failure",
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
