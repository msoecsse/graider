import type { Command } from "commander";
import { loadGraiderConfig } from "../../config/config-loader.js";
import {
  type CommonCommandOptions,
  normalizeCommonCommandOptions,
  type RawCommonCommandOptions
} from "../../core/command-context.js";
import { createCommandResult, type CommandResult } from "../../core/command-result.js";
import type { GitHubClient } from "../../github/github-client.js";
import { resolveProductionGitHubClient } from "../../github/github-client-factory.js";
import { validateGitHubReadiness } from "../../github/github-readiness-validation.js";
import {
  GITHUB_TOKEN_REQUIRED_CODE,
  createConfigDiagnostic
} from "../../diagnostics/error-catalog.js";
import { loadAssignmentRosters } from "../../roster/roster-loader.js";
import { validateWorkflowCompatibility } from "../../workflows/workflow-compatibility-validation.js";
import { writeCommandResult } from "../output.js";

const COMMAND_NAME = "validate";

export interface ValidateCommandRequest {
  cwd: string;
  assignmentFile: string;
  options: CommonCommandOptions;
  githubClient?: GitHubClient;
}

export const runValidateCommand = async ({
  cwd,
  assignmentFile,
  options,
  githubClient
}: ValidateCommandRequest): Promise<CommandResult> => {
  const configResult = loadGraiderConfig({
    cwd,
    assignmentFile
  });

  if (configResult.status === "failure") {
    return createCommandResult({
      commandName: COMMAND_NAME,
      assignmentFile,
      status: "failure",
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: {
        options
      }
    });
  }

  const rosterResult = loadAssignmentRosters(configResult.config);

  if (rosterResult.errors.length > 0) {
    return createCommandResult({
      commandName: COMMAND_NAME,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: rosterResult.warnings,
      errors: rosterResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary
      }
    });
  }

  const workflowCompatibilityResult = validateWorkflowCompatibility(configResult.config);

  if (
    workflowCompatibilityResult.errors.length > 0 &&
    workflowCompatibilityResult.workflowStatus !== "missing"
  ) {
    return createCommandResult({
      commandName: COMMAND_NAME,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [...rosterResult.warnings, ...workflowCompatibilityResult.warnings],
      errors: workflowCompatibilityResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        workflowCompatibilityChecked: true
      }
    });
  }

  const githubResolution = resolveProductionGitHubClient({ githubClient });
  if (githubResolution.status === "token_missing") {
    return createCommandResult({
      commandName: COMMAND_NAME,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [...rosterResult.warnings, ...workflowCompatibilityResult.warnings],
      errors: [
        createConfigDiagnostic(
          GITHUB_TOKEN_REQUIRED_CODE,
          "A GitHub token is required before Validate can check GitHub readiness. Set GRAIDER_GITHUB_TOKEN or GITHUB_TOKEN."
        )
      ],
      generatedFiles: [],
      summary: { options, ...configResult.config.summary, ...rosterResult.summary }
    });
  }

  const readinessResult = await validateGitHubReadiness({
    courseConfig: configResult.config.course,
    termConfig: configResult.config.term,
    assignmentConfig: configResult.config.assignment,
    students: rosterResult.students,
    githubClient: githubResolution.githubClient,
    validateTemplateWorkflow: workflowCompatibilityResult.workflowStatus === "missing"
  });

  if (readinessResult.errors.length > 0) {
    return createCommandResult({
      commandName: COMMAND_NAME,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [
        ...rosterResult.warnings,
        ...workflowCompatibilityResult.warnings,
        ...readinessResult.warnings
      ],
      errors: readinessResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        workflowCompatibilityChecked: true,
        githubReadinessChecked: true
      }
    });
  }

  return createCommandResult({
    commandName: COMMAND_NAME,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: "success",
    warnings: [
      ...rosterResult.warnings,
      ...workflowCompatibilityResult.warnings,
      ...readinessResult.warnings
    ],
    errors: [],
    generatedFiles: [],
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
      workflowCompatibilityChecked: true,
      githubReadinessChecked: true
    }
  });
};

export const registerValidateCommand = (program: Command): void => {
  program
    .command(COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Emit JSON output")
    .option("--verbose", "Emit verbose diagnostics")
    .option("--yes", "Confirm non-interactive execution")
    .description("Validate assignment configuration.")
    .action(async (assignmentFile: string, rawOptions: RawCommonCommandOptions) => {
      const options = normalizeCommonCommandOptions(rawOptions);
      const result = await runValidateCommand({
        cwd: process.cwd(),
        assignmentFile,
        options
      });

      writeCommandResult(result, options.json);
      process.exitCode = result.exitCode;
    });
};
