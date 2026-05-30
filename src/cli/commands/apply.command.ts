import fs from "node:fs";
import type { Command } from "commander";
import { parseTemplateRepository } from "../../config/github-config-validation.js";
import { loadGraiderConfig } from "../../config/config-loader.js";
import type { LoadedGraiderConfig } from "../../config/config-models.js";
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
import { FakeGitHubClient } from "../../github/fake-github-client.js";
import type { GitHubClient } from "../../github/github-client.js";
import { createGitHubClient, readGitHubToken } from "../../github/github-client-factory.js";
import { validateGitHubReadiness } from "../../github/github-readiness-validation.js";
import type { GitHubTemplateRepository } from "../../github/github-models.js";
import type { GitHubRetryEvent, RetryOptions } from "../../github/github-retry.js";
import { loadManifest } from "../../manifest/manifest-loader.js";
import { createManifestPath } from "../../manifest/manifest-paths.js";
import { buildPlan } from "../../planning/plan-builder.js";
import { loadAssignmentRosters } from "../../roster/roster-loader.js";
import type { RosterStudent } from "../../roster/roster-models.js";
import { writeCommandResult } from "../output.js";

const COMMAND_NAME = "apply";
const DEFAULT_TEMPLATE_COMMIT_SHA = "fake-template-sha";
const README_FILE = "README.md";
const EMPTY_COUNT = 0;

enum ApplyCommandNumber {
  DefaultTemplateRepositoryId = 1
}

export interface ApplyCommandRequest {
  cwd: string;
  assignmentFile: string;
  options: CommonCommandOptions;
  githubClient?: GitHubClient;
  clock?: Clock;
  retryOptions?: Partial<RetryOptions>;
}

const createDefaultTemplateRepository = (
  owner: string,
  repo: string,
  branch: string
): GitHubTemplateRepository => ({
  owner,
  name: repo,
  fullName: `${owner}/${repo}`,
  id: ApplyCommandNumber.DefaultTemplateRepositoryId,
  private: true,
  archived: false,
  defaultBranch: branch,
  htmlUrl: `https://github.com/${owner}/${repo}`,
  isTemplate: true,
  branches: [branch],
  files: [README_FILE],
  latestCommitSha: DEFAULT_TEMPLATE_COMMIT_SHA
});

const createDefaultGitHubClient = (
  config: LoadedGraiderConfig,
  students: readonly RosterStudent[]
): GitHubClient => {
  if (readGitHubToken() !== undefined) {
    return createGitHubClient();
  }

  const parsedTemplateRepository = parseTemplateRepository(
    config.course.github.organization,
    config.assignment.template.repository
  );
  const templateRepositories =
    parsedTemplateRepository.status === "success"
      ? [
          createDefaultTemplateRepository(
            parsedTemplateRepository.repository.owner,
            parsedTemplateRepository.repository.repo,
            config.assignment.template.branch
          )
        ]
      : [];

  return new FakeGitHubClient({
    templateRepositories,
    users: students.map((student) => ({ username: student.githubUsername })),
    teams: [
      {
        org: config.course.github.organization,
        slug: config.course.github.faculty_team,
        name: config.course.github.faculty_team
      },
      {
        org: config.course.github.organization,
        slug: config.course.github.grader_team,
        name: config.course.github.grader_team
      }
    ]
  });
};

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
  githubClient,
  clock = systemClock,
  retryOptions
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
      commandName: COMMAND_NAME,
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

  const effectiveGitHubClient =
    githubClient ?? createDefaultGitHubClient(configResult.config, rosterResult.students);
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

  const manifestPath = createManifestPath(
    configResult.config.summary.repoRoot,
    configResult.config.summary.termCode,
    configResult.config.summary.assignmentSlug
  );
  const manifestResult = loadManifest(manifestPath.absolutePath);

  if (manifestResult.status === "failure") {
    return createCommandResult({
      commandName: COMMAND_NAME,
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
      commandName: COMMAND_NAME,
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
        blockedOperationCount: plan.summary.blocked_operations
      }
    });
  }

  const executionResult = await executeApplyPlan({
    config: configResult.config,
    plan,
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
    commandName: COMMAND_NAME,
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
      ...executionResult.summary
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
