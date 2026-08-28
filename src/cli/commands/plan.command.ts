import type { Command } from "commander";
import { loadGraiderConfig } from "../../config/config-loader.js";
import { type Clock, formatPlanCreatedAt, systemClock } from "../../core/clock.js";
import {
  type CommonCommandOptions,
  normalizeCommonCommandOptions,
  type RawCommonCommandOptions
} from "../../core/command-context.js";
import { createCommandResult, type CommandResult } from "../../core/command-result.js";
import type { GitHubClient } from "../../github/github-client.js";
import { resolveProductionGitHubClient } from "../../github/github-client-factory.js";
import { validateGitHubReadiness } from "../../github/github-readiness-validation.js";
import { buildPlan } from "../../planning/plan-builder.js";
import { createPlanPath } from "../../planning/plan-paths.js";
import { writePlanJsonFile } from "../../planning/plan-renderer.js";
import { loadAssignmentRosters } from "../../roster/roster-loader.js";
import {
  GITHUB_TOKEN_REQUIRED_CODE,
  createConfigDiagnostic
} from "../../diagnostics/error-catalog.js";
import { writeCommandResult } from "../output.js";

const COMMAND_NAME = "plan";
const EMPTY_COUNT = 0;

export interface PlanCommandRequest {
  cwd: string;
  assignmentFile: string;
  options: CommonCommandOptions;
  githubClient?: GitHubClient;
  clock?: Clock;
}

export const runPlanCommand = async ({
  cwd,
  assignmentFile,
  options,
  githubClient,
  clock = systemClock
}: PlanCommandRequest): Promise<CommandResult> => {
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

  if (rosterResult.errors.length > EMPTY_COUNT) {
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

  const githubResolution = resolveProductionGitHubClient({ githubClient });
  if (githubResolution.status === "token_missing") {
    return createCommandResult({
      commandName: COMMAND_NAME,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: rosterResult.warnings,
      errors: [
        createConfigDiagnostic(
          GITHUB_TOKEN_REQUIRED_CODE,
          "A GitHub token is required before Plan can check GitHub readiness. Set GRAIDER_GITHUB_TOKEN or GITHUB_TOKEN."
        )
      ],
      generatedFiles: [],
      summary: { options, ...configResult.config.summary, ...rosterResult.summary }
    });
  }
  const effectiveGitHubClient = githubResolution.githubClient;
  const readinessResult = await validateGitHubReadiness({
    courseConfig: configResult.config.course,
    termConfig: configResult.config.term,
    assignmentConfig: configResult.config.assignment,
    students: rosterResult.students,
    githubClient: effectiveGitHubClient
  });

  if (readinessResult.errors.length > EMPTY_COUNT) {
    return createCommandResult({
      commandName: COMMAND_NAME,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [...rosterResult.warnings, ...readinessResult.warnings],
      errors: readinessResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        githubReadinessChecked: true
      }
    });
  }

  const now = clock.now();
  const plan = await buildPlan({
    config: configResult.config,
    students: rosterResult.students,
    rosterSummary: rosterResult.summary,
    githubClient: effectiveGitHubClient,
    createdAt: formatPlanCreatedAt(now)
  });
  const planPath = createPlanPath(
    configResult.config.summary.repoRoot,
    configResult.config.summary.termCode,
    configResult.config.summary.assignmentSlug,
    {
      now: () => now
    }
  );
  const writeResult = writePlanJsonFile(plan, planPath.absolutePath);
  const writeErrors = writeResult.diagnostic === undefined ? [] : [writeResult.diagnostic];
  const errors = [...plan.errors, ...writeErrors];
  const generatedFiles = writeResult.status === "success" ? [planPath.relativePath] : [];

  return createCommandResult({
    commandName: COMMAND_NAME,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: errors.length > EMPTY_COUNT ? "failure" : "success",
    warnings: [...rosterResult.warnings, ...readinessResult.warnings, ...plan.warnings],
    errors,
    generatedFiles,
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
      githubReadinessChecked: true,
      planFile: planPath.relativePath,
      operationCount: plan.operations.length,
      plannedOperationCount: plan.summary.planned_operations,
      skippedOperationCount: plan.summary.skipped_operations,
      blockedOperationCount: plan.summary.blocked_operations,
      inputFingerprint: plan.source.input_fingerprint
    }
  });
};

export const registerPlanCommand = (program: Command): void => {
  program
    .command(COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Emit JSON output")
    .option("--verbose", "Emit verbose diagnostics")
    .option("--yes", "Confirm non-interactive execution")
    .description("Plan assignment provisioning.")
    .action(async (assignmentFile: string, rawOptions: RawCommonCommandOptions) => {
      const options = normalizeCommonCommandOptions(rawOptions);
      const result = await runPlanCommand({
        cwd: process.cwd(),
        assignmentFile,
        options
      });

      writeCommandResult(result, options.json);
      process.exitCode = result.exitCode;
    });
};
