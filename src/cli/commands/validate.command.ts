import type { Command } from "commander";
import { loadGraiderConfig } from "../../config/config-loader.js";
import type { LoadedGraiderConfig } from "../../config/config-models.js";
import {
  type CommonCommandOptions,
  normalizeCommonCommandOptions,
  type RawCommonCommandOptions
} from "../../core/command-context.js";
import { createCommandResult, type CommandResult } from "../../core/command-result.js";
import { parseTemplateRepository } from "../../config/github-config-validation.js";
import { FakeGitHubClient } from "../../github/fake-github-client.js";
import type { GitHubClient } from "../../github/github-client.js";
import { validateGitHubReadiness } from "../../github/github-readiness-validation.js";
import type { GitHubTemplateRepository } from "../../github/github-models.js";
import type { RosterStudent } from "../../roster/roster-models.js";
import { loadAssignmentRosters } from "../../roster/roster-loader.js";
import { writeCommandResult } from "../output.js";

const COMMAND_NAME = "validate";
const DEFAULT_TEMPLATE_COMMIT_SHA = "fake-template-sha";
const README_FILE = "README.md";

enum ValidateCommandNumber {
  DefaultTemplateRepositoryId = 1
}

export interface ValidateCommandRequest {
  cwd: string;
  assignmentFile: string;
  options: CommonCommandOptions;
  githubClient?: GitHubClient;
}

const createDefaultTemplateRepository = (
  owner: string,
  repo: string,
  branch: string
): GitHubTemplateRepository => ({
  owner,
  name: repo,
  fullName: `${owner}/${repo}`,
  id: ValidateCommandNumber.DefaultTemplateRepositoryId,
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

  const readinessResult = await validateGitHubReadiness({
    courseConfig: configResult.config.course,
    termConfig: configResult.config.term,
    assignmentConfig: configResult.config.assignment,
    students: rosterResult.students,
    githubClient:
      githubClient ?? createDefaultGitHubClient(configResult.config, rosterResult.students)
  });

  if (readinessResult.errors.length > 0) {
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

  return createCommandResult({
    commandName: COMMAND_NAME,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: "success",
    warnings: [...rosterResult.warnings, ...readinessResult.warnings],
    errors: [],
    generatedFiles: [],
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
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
