import fs from "node:fs";
import type { Command } from "commander";
import { loadGraiderConfig } from "../../config/config-loader.js";
import { type Clock, formatPlanCreatedAt, systemClock } from "../../core/clock.js";
import {
  type CommonCommandOptions,
  normalizeCommonCommandOptions,
  type RawCommonCommandOptions
} from "../../core/command-context.js";
import {
  createCommandResult,
  type CommandResult,
  type CommandStatus
} from "../../core/command-result.js";
import { executeApplyPlan } from "../../execution/apply-executor.js";
import { evaluateMutationGuard } from "../../execution/mutation-guard.js";
import type { GitHubClient } from "../../github/github-client.js";
import { resolveProductionGitHubClient } from "../../github/github-client-factory.js";
import { validateGitHubReadiness } from "../../github/github-readiness-validation.js";
import type { GitHubRetryEvent, RetryOptions } from "../../github/github-retry.js";
import { loadManifest } from "../../manifest/manifest-loader.js";
import { createManifestPath } from "../../manifest/manifest-paths.js";
import { buildPlan } from "../../planning/plan-builder.js";
import { loadAssignmentRosters } from "../../roster/roster-loader.js";
import {
  GITHUB_TOKEN_REQUIRED_CODE,
  createConfigDiagnostic,
  createWarningDiagnostic
} from "../../diagnostics/error-catalog.js";
import { writeCommandResult } from "../output.js";
import { runGroupApplyPreflight } from "../../groups/group-apply-preflight.js";
import { executeGroupTargets } from "../../groups/group-target-executor.js";
import { writeGroupApplyManifestV2 } from "../../groups/group-apply-manifest-writer.js";

const COMMAND_NAME = "apply";
const EMPTY_COUNT = 0;
const GROUP_APPLY_INCOMPLETE_MESSAGE =
  "Group Apply did not complete, so no manifest was written. Some group repositories may have been created before the failure. Graider will not adopt untracked repositories automatically. Delete any partial repositories manually or use a future reconcile workflow, then run Apply again.";

export interface ApplyCommandRequest {
  cwd: string;
  assignmentFile: string;
  options: CommonCommandOptions;
  commandName?: string;
  githubClient?: GitHubClient;
  clock?: Clock;
  retryOptions?: Partial<RetryOptions>;
  groupTargetExecutor?: typeof executeGroupTargets;
  groupManifestWriter?: typeof writeGroupApplyManifestV2;
}

const getExecutionStatus = (
  errorsLength: number,
  summary: {
    created: number;
    existing: number;
    verified: number;
    noop: number;
    skipped: number;
  }
): CommandStatus => {
  if (errorsLength === EMPTY_COUNT) {
    return "success";
  }

  const successfulWorkCount =
    summary.created + summary.existing + summary.verified + summary.noop + summary.skipped;

  return successfulWorkCount > EMPTY_COUNT ? "partial_success" : "failure";
};

export const runApplyCommand = async ({
  cwd,
  assignmentFile,
  options,
  commandName = COMMAND_NAME,
  githubClient,
  clock = systemClock,
  retryOptions,
  groupTargetExecutor = executeGroupTargets,
  groupManifestWriter = writeGroupApplyManifestV2
}: ApplyCommandRequest): Promise<CommandResult> => {
  const retryEvents: GitHubRetryEvent[] = [];
  const effectiveRetryOptions: Partial<RetryOptions> = {
    ...retryOptions,
    onRetry: (event) => {
      retryEvents.push(event);
      retryOptions?.onRetry?.(event);
    }
  };
  const configResult = loadGraiderConfig({
    cwd,
    assignmentFile
  });

  if (configResult.status === "failure") {
    return createCommandResult({
      commandName,
      assignmentFile,
      status: "failure",
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: { options }
    });
  }

  const rosterResult = loadAssignmentRosters(configResult.config);

  if (rosterResult.errors.length > EMPTY_COUNT) {
    return createCommandResult({
      commandName,
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
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: rosterResult.warnings,
      errors: [
        createConfigDiagnostic(
          GITHUB_TOKEN_REQUIRED_CODE,
          "A GitHub token is required before Apply can contact GitHub. Set GRAIDER_GITHUB_TOKEN or GITHUB_TOKEN."
        )
      ],
      generatedFiles: [],
      summary: { options, ...configResult.config.summary, ...rosterResult.summary }
    });
  }
  const effectiveGitHubClient = githubResolution.githubClient;
  if (configResult.config.assignment.repository_mode === "group") {
    const preflight = await runGroupApplyPreflight({
      config: configResult.config,
      students: rosterResult.students,
      githubClient: effectiveGitHubClient
    });
    const groupTargetSummary = preflight.targets.map((target) => ({
      groupId: target.groupId,
      repositoryName: target.repositoryName,
      studentIds: target.studentIds,
      githubUsernames: target.githubUsernames,
      status: preflight.errors.length === EMPTY_COUNT ? "pending" : "blocked",
      diagnostics: target.diagnostics
    }));
    const groupSummary = {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
      repositoryMode: "group",
      targetCount: preflight.targets.length,
      studentMappingCount: preflight.targets.reduce(
        (count, target) => count + target.studentIds.length,
        EMPTY_COUNT
      ),
      groupTargets: groupTargetSummary
    };
    const guardResult = evaluateMutationGuard({
      options,
      preflightErrors: preflight.errors
    });
    if (!guardResult.allowed) {
      return createCommandResult({
        commandName,
        assignmentFile: configResult.config.summary.assignmentConfigPath,
        status: "failure",
        warnings: [...rosterResult.warnings, ...preflight.warnings],
        errors: guardResult.errors,
        generatedFiles: [],
        summary: groupSummary
      });
    }

    const execution = await groupTargetExecutor({
      config: configResult.config,
      targets: preflight.targets,
      githubClient: effectiveGitHubClient
    });
    const executionTargetSummary = execution.targets.map((result) => ({
      groupId: result.target.groupId,
      repositoryName: result.target.repositoryName,
      ...(result.htmlUrl === null ? {} : { htmlUrl: result.htmlUrl }),
      ...(result.cloneUrl === null ? {} : { cloneUrl: result.cloneUrl }),
      studentIds: result.target.studentIds,
      githubUsernames: result.target.githubUsernames,
      status: result.status,
      diagnostics: result.diagnostics
    }));
    const executionSummary = {
      ...groupSummary,
      groupTargets: executionTargetSummary
    };
    if (execution.errors.length > EMPTY_COUNT) {
      return createCommandResult({
        commandName,
        assignmentFile: configResult.config.summary.assignmentConfigPath,
        status: "failure",
        warnings: [
          ...rosterResult.warnings,
          ...preflight.warnings,
          ...execution.warnings,
          createWarningDiagnostic(
            "group_apply_manifest_not_written",
            GROUP_APPLY_INCOMPLETE_MESSAGE
          )
        ],
        errors: [...execution.errors],
        generatedFiles: [],
        summary: executionSummary
      });
    }

    const manifestWrite = groupManifestWriter({
      repoRoot: configResult.config.summary.repoRoot,
      termCode: configResult.config.summary.termCode,
      assignmentSlug: configResult.config.summary.assignmentSlug,
      plannedTargets: preflight.targets,
      execution
    });
    if (manifestWrite.status === "failure") {
      return createCommandResult({
        commandName,
        assignmentFile: configResult.config.summary.assignmentConfigPath,
        status: "failure",
        warnings: [
          ...rosterResult.warnings,
          ...preflight.warnings,
          ...execution.warnings,
          createWarningDiagnostic(
            "group_apply_manifest_not_written",
            GROUP_APPLY_INCOMPLETE_MESSAGE
          )
        ],
        errors: [...manifestWrite.diagnostics],
        generatedFiles: [],
        summary: executionSummary
      });
    }
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "success",
      warnings: [...rosterResult.warnings, ...preflight.warnings, ...execution.warnings],
      errors: [],
      generatedFiles: [manifestWrite.manifestPath],
      summary: {
        ...executionSummary,
        manifestFile: manifestWrite.manifestPath,
        manifestWritten: true
      }
    });
  }
  const readinessResult = await validateGitHubReadiness({
    courseConfig: configResult.config.course,
    termConfig: configResult.config.term,
    assignmentConfig: configResult.config.assignment,
    students: rosterResult.students,
    githubClient: effectiveGitHubClient
  });

  if (readinessResult.errors.length > EMPTY_COUNT) {
    return createCommandResult({
      commandName,
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

  const manifestPath = createManifestPath(
    configResult.config.summary.repoRoot,
    configResult.config.summary.termCode,
    configResult.config.summary.assignmentSlug
  );
  const manifestResult = loadManifest(manifestPath.absolutePath);

  if (manifestResult.status === "failure") {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: manifestResult.warnings,
      errors: manifestResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        manifestFile: manifestPath.relativePath
      }
    });
  }

  const plan = await buildPlan({
    config: configResult.config,
    students: rosterResult.students,
    rosterSummary: rosterResult.summary,
    githubClient: effectiveGitHubClient,
    createdAt: formatPlanCreatedAt(clock.now()),
    ...(manifestResult.status === "loaded" ? { manifest: manifestResult.manifest } : {})
  });
  const guardResult = evaluateMutationGuard({ plan, options });

  if (!guardResult.allowed) {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [...rosterResult.warnings, ...plan.warnings],
      errors: guardResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        githubReadinessChecked: true,
        manifestFile: manifestPath.relativePath,
        blockedOperationCount: plan.summary.blocked_operations,
        repositories: plan.targets
          .filter((target) => target.mode === "individual")
          .map((target) => ({
            studentId: target.primaryStudentId ?? target.targetId,
            githubUsername: target.githubUsernames[0] ?? "",
            section: target.sectionIds[0] ?? "",
            repository: target.repositoryName,
            status: "blocked"
          }))
      }
    });
  }

  const executionResult = await executeApplyPlan({
    config: configResult.config,
    plan,
    targets: plan.targets,
    ...(manifestResult.status === "loaded" ? { manifest: manifestResult.manifest } : {}),
    manifestPath: manifestPath.absolutePath,
    students: rosterResult.students,
    githubClient: effectiveGitHubClient,
    clock,
    retryOptions: effectiveRetryOptions
  });
  const generatedFiles = fs.existsSync(manifestPath.absolutePath)
    ? [manifestPath.relativePath]
    : [];

  return createCommandResult({
    commandName,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: getExecutionStatus(executionResult.errors.length, executionResult.summary),
    warnings: [...rosterResult.warnings, ...plan.warnings, ...executionResult.warnings],
    errors: executionResult.errors,
    generatedFiles,
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
      githubReadinessChecked: true,
      manifestFile: manifestPath.relativePath,
      retryCount: retryEvents.length,
      retryDiagnostics: retryEvents.map((event) => event.diagnosticCode),
      ...executionResult.summary,
      repositories: executionResult.repositories
    }
  });
};

export const registerApplyCommand = (program: Command): void => {
  program
    .command(COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Emit JSON output")
    .option("--verbose", "Emit verbose diagnostics")
    .option("--yes", "Confirm non-interactive execution")
    .description("Apply assignment repository changes.")
    .action(async (assignmentFile: string, rawOptions: RawCommonCommandOptions) => {
      const options = normalizeCommonCommandOptions(rawOptions);
      const result = await runApplyCommand({
        cwd: process.cwd(),
        assignmentFile,
        options
      });

      writeCommandResult(result, options.json);
      process.exitCode = result.exitCode;
    });
};
