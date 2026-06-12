import type { Command } from "commander";
import type { LoadedGraiderConfig } from "../../config/config-models.js";
import { loadGraiderConfig } from "../../config/config-loader.js";
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
import {
  selectTargetStudents,
  validateTargetSelector,
  type RawTargetSelector
} from "../../core/target-selector.js";
import {
  DiagnosticCode,
  createConfigDiagnostic,
  createWarningDiagnostic
} from "../../diagnostics/error-catalog.js";
import {
  executeGrade,
  getGradeGitHubDiagnostics,
  type GradeExecutionResult
} from "../../execution/grade-executor.js";
import { FakeGitHubClient } from "../../github/fake-github-client.js";
import type { GitHubClient } from "../../github/github-client.js";
import { createGitHubClient, readGitHubToken } from "../../github/github-client-factory.js";
import type { RetryOptions } from "../../github/github-retry.js";
import { createManifestPath } from "../../manifest/manifest-paths.js";
import { loadManifest } from "../../manifest/manifest-loader.js";
import { loadAssignmentRosters } from "../../roster/roster-loader.js";
import { writeCommandResult } from "../output.js";

const COMMAND_NAME = "grade";
const EMPTY_COUNT = 0;
const NOT_CONFIGURED_WARNING_COUNT = 1;

export interface GradeCommandRequest {
  cwd: string;
  assignmentFile: string;
  options: CommonCommandOptions;
  targetSelector: RawTargetSelector;
  commandName?: string;
  githubClient?: GitHubClient;
  retryOptions?: Partial<RetryOptions>;
}

export interface GradeRawOptions extends RawCommonCommandOptions {
  all?: boolean;
  section?: string;
  studentId?: string;
  githubUsername?: string;
}

const createDefaultGitHubClient = (): GitHubClient =>
  readGitHubToken() === undefined ? new FakeGitHubClient() : createGitHubClient();

const getEffectiveGrading = (config: LoadedGraiderConfig) =>
  config.assignment.grading === undefined ? config.course.grading : config.assignment.grading;

const getCommandStatus = (result: GradeExecutionResult): CommandStatus => {
  if (result.errors.length === EMPTY_COUNT) {
    return "success";
  }

  return result.summary.dispatchSucceeded > EMPTY_COUNT ? "partial_success" : "failure";
};

const createLifecycleDiagnostic = (status: string) =>
  createConfigDiagnostic(
    DiagnosticCode.AssignmentStatusBlocksGrade,
    `Assignment status ${status} does not allow grade.`,
    { assignmentStatus: status }
  );

const createGradingNotConfiguredWarning = () =>
  createWarningDiagnostic(
    DiagnosticCode.GradingNotConfigured,
    "Automated grading is not configured for this assignment."
  );

export const runGradeCommand = async ({
  cwd,
  assignmentFile,
  options,
  targetSelector,
  commandName = COMMAND_NAME,
  githubClient,
  retryOptions
}: GradeCommandRequest): Promise<CommandResult> => {
  const selectorResult = validateTargetSelector(targetSelector);

  if (selectorResult.errors.length > EMPTY_COUNT || selectorResult.selector === undefined) {
    return createCommandResult({
      commandName,
      assignmentFile,
      status: "failure",
      warnings: selectorResult.warnings,
      errors: selectorResult.errors,
      generatedFiles: [],
      summary: { options }
    });
  }

  const configResult = loadGraiderConfig({ cwd, assignmentFile });

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

  const assignmentStatus = configResult.config.assignment.assignment.status;

  if (assignmentStatus === "draft" || assignmentStatus === "archived") {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [],
      errors: [createLifecycleDiagnostic(assignmentStatus)],
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary
      }
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

  const selectionResult = selectTargetStudents(rosterResult.students, selectorResult.selector);

  if (selectionResult.errors.length > EMPTY_COUNT) {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [...rosterResult.warnings, ...selectionResult.warnings],
      errors: selectionResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        ...selectionResult.summary
      }
    });
  }

  const grading = getEffectiveGrading(configResult.config);

  if (!grading.enabled || grading.workflow === undefined) {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "success",
      warnings: [
        ...rosterResult.warnings,
        ...selectionResult.warnings,
        createGradingNotConfiguredWarning()
      ],
      errors: [],
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        ...selectionResult.summary,
        gradingEnabled: false,
        workflowDispatchAttempted: false,
        resultStatus: "not_configured",
        targetsSelected: selectionResult.students.length,
        dispatchAttempted: EMPTY_COUNT,
        dispatchSucceeded: EMPTY_COUNT,
        dispatchFailed: EMPTY_COUNT,
        skipped: selectionResult.students.length,
        warnings:
          rosterResult.warnings.length +
          selectionResult.warnings.length +
          NOT_CONFIGURED_WARNING_COUNT,
        errors: EMPTY_COUNT
      }
    });
  }

  const manifestPath = createManifestPath(
    configResult.config.summary.repoRoot,
    configResult.config.summary.termCode,
    configResult.config.summary.assignmentSlug
  );
  const manifestResult = loadManifest(manifestPath.absolutePath, { required: true });

  if (manifestResult.status !== "loaded") {
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
        ...selectionResult.summary,
        manifestFile: manifestPath.relativePath
      }
    });
  }

  const executionResult = await executeGrade({
    config: configResult.config,
    manifest: manifestResult.manifest,
    targetStudents: selectionResult.students,
    githubClient: githubClient ?? createDefaultGitHubClient(),
    ...(retryOptions === undefined ? {} : { retryOptions })
  });
  const status = getCommandStatus(executionResult);
  const executionErrors =
    status === "failure"
      ? [...executionResult.errors, ...getGradeGitHubDiagnostics(executionResult.errors)]
      : executionResult.errors;

  return createCommandResult({
    commandName,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status,
    warnings: [...rosterResult.warnings, ...selectionResult.warnings, ...executionResult.warnings],
    errors: executionErrors,
    generatedFiles: [],
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
      ...selectionResult.summary,
      manifestFile: manifestPath.relativePath,
      ...executionResult.summary
    }
  });
};

export const registerGradeCommand = (program: Command): void => {
  program
    .command(COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Emit JSON output")
    .option("--verbose", "Emit verbose diagnostics")
    .option("--yes", "Confirm non-interactive execution")
    .option("--all", "Target all active students")
    .option("--section <section-id>", "Target active students in a section")
    .option("--student-id <student-id>", "Target one active student by student ID")
    .option("--github-username <github-username>", "Target one active student by GitHub username")
    .description("Run assignment grading.")
    .action(async (assignmentFile: string, rawOptions: GradeRawOptions) => {
      const options = normalizeCommonCommandOptions(rawOptions);
      const result = await runGradeCommand({
        cwd: process.cwd(),
        assignmentFile,
        options,
        targetSelector: {
          ...(rawOptions.all === undefined ? {} : { all: rawOptions.all }),
          ...(rawOptions.section === undefined ? {} : { section: rawOptions.section }),
          ...(rawOptions.studentId === undefined ? {} : { studentId: rawOptions.studentId }),
          ...(rawOptions.githubUsername === undefined
            ? {}
            : { githubUsername: rawOptions.githubUsername })
        }
      });

      writeCommandResult(result, options.json);
      process.exitCode = result.exitCode;
    });
};
