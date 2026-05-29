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
import { createCommandResult, type CommandResult } from "../../core/command-result.js";
import { FakeGitHubClient } from "../../github/fake-github-client.js";
import type { GitHubClient } from "../../github/github-client.js";
import { validateGitHubReadiness } from "../../github/github-readiness-validation.js";
import type { GitHubTemplateRepository } from "../../github/github-models.js";
import { buildPlan } from "../../planning/plan-builder.js";
import { createPlanPath } from "../../planning/plan-paths.js";
import { writePlanJsonFile } from "../../planning/plan-renderer.js";
import { loadAssignmentRosters } from "../../roster/roster-loader.js";
import type { RosterStudent } from "../../roster/roster-models.js";
import { writeCommandResult } from "../output.js";

const COMMAND_NAME = "plan";
const DEFAULT_TEMPLATE_COMMIT_SHA = "fake-template-sha";
const README_FILE = "README.md";
const EMPTY_COUNT = 0;

enum PlanCommandNumber {
  DefaultTemplateRepositoryId = 1
}

export interface PlanCommandRequest {
  cwd: string;
  assignmentFile: string;
  options: CommonCommandOptions;
  githubClient?: GitHubClient;
  clock?: Clock;
}

const createDefaultTemplateRepository = (
  owner: string,
  repo: string,
  branch: string
): GitHubTemplateRepository => ({
  owner,
  name: repo,
  fullName: `${owner}/${repo}`,
  id: PlanCommandNumber.DefaultTemplateRepositoryId,
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
