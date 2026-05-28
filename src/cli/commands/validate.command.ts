import type { Command } from "commander";
import { loadGraiderConfig } from "../../config/config-loader.js";
import {
  normalizeCommonCommandOptions,
  type RawCommonCommandOptions
} from "../../core/command-context.js";
import type { CommandResult } from "../../core/command-result.js";
import { ExitCode } from "../../core/exit-codes.js";
import { writeCommandResult } from "../output.js";

const COMMAND_NAME = "validate";

const createValidateResult = (
  assignmentFile: string,
  options: ReturnType<typeof normalizeCommonCommandOptions>
): CommandResult => {
  const configResult = loadGraiderConfig({
    cwd: process.cwd(),
    assignmentFile
  });

  if (configResult.status === "failure") {
    return {
      commandName: COMMAND_NAME,
      assignmentFile,
      status: "failure",
      exitCode: ExitCode.ConfigurationOrSchemaError,
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: {
        options
      }
    };
  }

  return {
    commandName: COMMAND_NAME,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: "success",
    exitCode: ExitCode.Success,
    warnings: [],
    errors: [],
    generatedFiles: [],
    summary: {
      options,
      ...configResult.config.summary
    }
  };
};

export const registerValidateCommand = (program: Command): void => {
  program
    .command(COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Emit JSON output")
    .option("--verbose", "Emit verbose diagnostics")
    .option("--yes", "Confirm non-interactive execution")
    .description("Validate assignment configuration.")
    .action((assignmentFile: string, rawOptions: RawCommonCommandOptions) => {
      const options = normalizeCommonCommandOptions(rawOptions);
      const result = createValidateResult(assignmentFile, options);

      writeCommandResult(result, options.json);
      process.exitCode = result.exitCode;
    });
};
