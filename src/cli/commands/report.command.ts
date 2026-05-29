import type { Command } from "commander";
import path from "node:path";
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
import { type Clock, systemClock } from "../../core/clock.js";
import { FakeGitHubClient } from "../../github/fake-github-client.js";
import type { GitHubClient } from "../../github/github-client.js";
import { createManifestPath } from "../../manifest/manifest-paths.js";
import { loadManifest } from "../../manifest/manifest-loader.js";
import { loadAssignmentRosters } from "../../roster/roster-loader.js";
import { collectReport } from "../../reporting/report-collector.js";
import { renderFacultyCsvReport } from "../../reporting/faculty-csv-renderer.js";
import { renderFacultyJsonReport } from "../../reporting/faculty-json-renderer.js";
import { renderFacultyMarkdownReport } from "../../reporting/faculty-markdown-renderer.js";
import {
  createReportPaths,
  createStudentReportRelativePath
} from "../../reporting/report-paths.js";
import { writeReportFiles, type ReportFileWrite } from "../../reporting/report-writer.js";
import { renderStudentMarkdownReport } from "../../reporting/student-markdown-renderer.js";
import { writeCommandResult } from "../output.js";

const COMMAND_NAME = "report";
const EMPTY_COUNT = 0;

export interface ReportCommandRequest {
  cwd: string;
  assignmentFile: string;
  options: CommonCommandOptions;
  githubClient?: GitHubClient;
  clock?: Clock;
}

const getCommandStatus = (errorCount: number, generatedFileCount: number): CommandStatus => {
  if (errorCount === EMPTY_COUNT) {
    return "success";
  }

  return generatedFileCount > EMPTY_COUNT ? "partial_success" : "failure";
};

const createDefaultGitHubClient = (): GitHubClient => new FakeGitHubClient();

const createReportFiles = (
  repoRoot: string,
  report: Awaited<ReturnType<typeof collectReport>>["report"]
): ReportFileWrite[] => {
  const paths = createReportPaths(
    repoRoot,
    report.assignment.termCode,
    report.assignment.assignmentSlug
  );
  const studentFiles = report.students.map((student) => {
    const relativePath = createStudentReportRelativePath(
      report.assignment.termCode,
      report.assignment.assignmentSlug,
      student.section,
      student.studentId
    );

    return {
      absolutePath: path.join(repoRoot, relativePath),
      relativePath,
      content: renderStudentMarkdownReport(report.assignment, student)
    };
  });

  return [
    {
      absolutePath: paths.facultyJson.absolutePath,
      relativePath: paths.facultyJson.relativePath,
      content: renderFacultyJsonReport(report)
    },
    {
      absolutePath: paths.facultyCsv.absolutePath,
      relativePath: paths.facultyCsv.relativePath,
      content: renderFacultyCsvReport(report)
    },
    {
      absolutePath: paths.facultyMarkdown.absolutePath,
      relativePath: paths.facultyMarkdown.relativePath,
      content: renderFacultyMarkdownReport(report)
    },
    ...studentFiles
  ];
};

export const runReportCommand = async ({
  cwd,
  assignmentFile,
  options,
  githubClient,
  clock = systemClock
}: ReportCommandRequest): Promise<CommandResult> => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });

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

  const manifestPath = createManifestPath(
    configResult.config.summary.repoRoot,
    configResult.config.summary.termCode,
    configResult.config.summary.assignmentSlug
  );
  const manifestResult = loadManifest(manifestPath.absolutePath, { required: true });

  if (manifestResult.status !== "loaded") {
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

  const collectResult = await collectReport({
    config: configResult.config,
    rosterSummary: rosterResult.summary,
    students: rosterResult.students,
    manifest: manifestResult.manifest,
    githubClient: githubClient ?? createDefaultGitHubClient(),
    generatedAt: clock.now().toISOString()
  });
  const writeResult = writeReportFiles(
    createReportFiles(configResult.config.summary.repoRoot, collectResult.report)
  );

  return createCommandResult({
    commandName: COMMAND_NAME,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: getCommandStatus(writeResult.errors.length, writeResult.generatedFiles.length),
    warnings: [...rosterResult.warnings, ...collectResult.report.warnings, ...writeResult.warnings],
    errors: writeResult.errors,
    generatedFiles: writeResult.generatedFiles,
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
      manifestFile: manifestPath.relativePath,
      reportFileCount: writeResult.generatedFiles.length,
      ...collectResult.report.summary
    }
  });
};

export const registerReportCommand = (program: Command): void => {
  program
    .command(COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Emit JSON output")
    .option("--verbose", "Emit verbose diagnostics")
    .option("--yes", "Confirm non-interactive execution")
    .description("Generate assignment reports.")
    .action(async (assignmentFile: string, rawOptions: RawCommonCommandOptions) => {
      const options = normalizeCommonCommandOptions(rawOptions);
      const result = await runReportCommand({
        cwd: process.cwd(),
        assignmentFile,
        options
      });

      writeCommandResult(result, options.json);
      process.exitCode = result.exitCode;
    });
};
