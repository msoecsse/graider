import { Command } from "commander";
import {
  createFailedPlaceholderResult,
  createSuccessfulPlaceholderResult
} from "../../core/command-result.js";
import {
  normalizeCommonCommandOptions,
  type RawCommonCommandOptions
} from "../../core/command-context.js";
import { ExitCode } from "../../core/exit-codes.js";
import { resolveAssignmentPath, toRepositoryRelativePath } from "../../core/paths.js";
import { findRepositoryRoot } from "../../core/repo-root.js";
import { createNotSupportedInMvpDiagnostic } from "../../diagnostics/error-catalog.js";
import { writeCommandResult } from "../output.js";

type PlaceholderCommandSupport = "supported-placeholder" | "unsupported-in-mvp";

interface PlaceholderCommandRegistration {
  name: string;
  description: string;
  support: PlaceholderCommandSupport;
  requireRepositoryRoot: boolean;
}

export const registerPlaceholderCommand = (
  program: Command,
  registration: PlaceholderCommandRegistration
): void => {
  program
    .command(registration.name)
    .argument("<assignment-file>")
    .option("--json", "Emit JSON output")
    .option("--verbose", "Emit verbose diagnostics")
    .option("--yes", "Confirm non-interactive execution")
    .description(registration.description)
    .action((assignmentFile: string, rawOptions: RawCommonCommandOptions) => {
      const cwd = process.cwd();
      const assignmentPath = resolveAssignmentPath(cwd, assignmentFile);
      const repositoryRootResult = registration.requireRepositoryRoot
        ? findRepositoryRoot(cwd)
        : undefined;
      const context = {
        commandName: registration.name,
        cwd,
        assignmentFile,
        assignmentPath,
        ...(repositoryRootResult?.found === true
          ? {
              repoRoot: repositoryRootResult.repoRoot,
              assignmentRelativePath: toRepositoryRelativePath(
                repositoryRootResult.repoRoot,
                assignmentPath
              )
            }
          : {}),
        options: normalizeCommonCommandOptions(rawOptions)
      };

      const result =
        repositoryRootResult?.found === false
          ? createFailedPlaceholderResult(
              context,
              repositoryRootResult.diagnostic,
              ExitCode.ConfigurationOrSchemaError
            )
          : registration.support === "supported-placeholder"
            ? createSuccessfulPlaceholderResult(context)
            : createFailedPlaceholderResult(
                context,
                createNotSupportedInMvpDiagnostic(registration.name)
              );

      writeCommandResult(result, context.options.json);
      process.exitCode = result.exitCode;
    });
};
