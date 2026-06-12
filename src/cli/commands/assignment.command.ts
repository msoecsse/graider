import type { Command } from "commander";
import {
  buildAssignmentApplyPreview,
  createEmptyAssignmentApplyPreviewResult
} from "../../apply-preview/apply-preview-builder.js";
import type { AssignmentApplyPreviewResult } from "../../apply-preview/apply-preview-models.js";
import {
  buildAssignmentGradePreview,
  createEmptyAssignmentGradePreviewResult
} from "../../grade-preview/grade-preview-builder.js";
import type { AssignmentGradePreviewResult } from "../../grade-preview/grade-preview-models.js";
import {
  buildAssignmentGradeStatus,
  createEmptyAssignmentGradeStatusResult
} from "../../grade-status/grade-status-builder.js";
import type { AssignmentGradeStatusResult } from "../../grade-status/grade-status-models.js";
import {
  buildAssignmentDetail,
  createEmptyAssignmentDetailResult
} from "../../assignment-detail/assignment-detail-builder.js";
import type { AssignmentDetailResult } from "../../assignment-detail/assignment-detail-models.js";
import {
  type CommonCommandOptions,
  normalizeCommonCommandOptions,
  type RawCommonCommandOptions
} from "../../core/command-context.js";
import type { Clock } from "../../core/clock.js";
import type { CommandResult } from "../../core/command-result.js";
import {
  ASSIGNMENT_APPLY_PREVIEW_JSON_REQUIRED_CODE,
  ASSIGNMENT_GRADE_STATUS_JSON_REQUIRED_CODE,
  ASSIGNMENT_GRADE_PREVIEW_JSON_REQUIRED_CODE,
  ASSIGNMENT_DETAIL_JSON_REQUIRED_CODE,
  STUDENT_FILTER_CONFLICT_CODE,
  STUDENT_FILTER_EMPTY_CODE,
  createConfigDiagnostic
} from "../../diagnostics/error-catalog.js";
import type { GitHubClient } from "../../github/github-client.js";
import { createGitHubClient, readGitHubToken } from "../../github/github-client-factory.js";
import type { RetryOptions } from "../../github/github-retry.js";
import { runApplyCommand } from "./apply.command.js";
import { runGradeCommand, type GradeRawOptions } from "./grade.command.js";
import { writeCommandResult } from "../output.js";

const COMMAND_NAME = "assignment";
const DETAIL_COMMAND_NAME = "detail";
const APPLY_PREVIEW_COMMAND_NAME = "apply-preview";
const GRADE_PREVIEW_COMMAND_NAME = "grade-preview";
const GRADE_STATUS_COMMAND_NAME = "grade-status";
const APPLY_COMMAND_NAME = "apply";
const GRADE_COMMAND_NAME = "grade";
const ASSIGNMENT_APPLY_COMMAND_NAME = "assignment apply";
const ASSIGNMENT_GRADE_COMMAND_NAME = "assignment grade";
const JSON_INDENT_SPACES = 2;

interface AssignmentDetailCommandOptions {
  readonly json?: boolean;
}

interface AssignmentApplyPreviewCommandOptions {
  readonly json?: boolean;
}

interface AssignmentGradePreviewCommandOptions {
  readonly json?: boolean;
}

interface AssignmentGradeStatusCommandOptions {
  readonly json?: boolean;
  readonly student?: string;
  readonly students?: string;
}

export interface AssignmentDetailCommandRequest {
  readonly cwd: string;
  readonly assignmentFile: string;
  readonly options: AssignmentDetailCommandOptions;
  readonly env?: Record<string, string | undefined>;
  readonly githubClient?: GitHubClient;
}

export interface AssignmentApplyPreviewCommandRequest {
  readonly cwd: string;
  readonly assignmentFile: string;
  readonly options: AssignmentApplyPreviewCommandOptions;
  readonly env?: Record<string, string | undefined>;
  readonly githubClient?: GitHubClient;
}

export interface AssignmentGradePreviewCommandRequest {
  readonly cwd: string;
  readonly assignmentFile: string;
  readonly options: AssignmentGradePreviewCommandOptions;
  readonly env?: Record<string, string | undefined>;
  readonly githubClient?: GitHubClient;
}

export interface AssignmentGradeStatusCommandRequest {
  readonly cwd: string;
  readonly assignmentFile: string;
  readonly options: AssignmentGradeStatusCommandOptions;
  readonly env?: Record<string, string | undefined>;
  readonly githubClient?: GitHubClient;
}

export interface AssignmentApplyCommandRequest {
  readonly cwd: string;
  readonly assignmentFile: string;
  readonly options: CommonCommandOptions;
  readonly githubClient?: GitHubClient;
  readonly clock?: Clock;
  readonly retryOptions?: Partial<RetryOptions>;
}

export interface AssignmentGradeCommandRequest {
  readonly cwd: string;
  readonly assignmentFile: string;
  readonly options: CommonCommandOptions;
  readonly targetSelector: GradeRawOptions;
  readonly githubClient?: GitHubClient;
  readonly retryOptions?: Partial<RetryOptions>;
}

const createJsonRequiredResult = (): AssignmentDetailResult =>
  createEmptyAssignmentDetailResult("failure", [
    createConfigDiagnostic(
      ASSIGNMENT_DETAIL_JSON_REQUIRED_CODE,
      "The assignment detail command only supports JSON output. Run with --json."
    )
  ]);

const createApplyPreviewJsonRequiredResult = (): AssignmentApplyPreviewResult =>
  createEmptyAssignmentApplyPreviewResult("failure", [
    createConfigDiagnostic(
      ASSIGNMENT_APPLY_PREVIEW_JSON_REQUIRED_CODE,
      "The assignment apply-preview command only supports JSON output. Run with --json."
    )
  ]);

const createGradePreviewJsonRequiredResult = (): AssignmentGradePreviewResult =>
  createEmptyAssignmentGradePreviewResult("failure", [
    createConfigDiagnostic(
      ASSIGNMENT_GRADE_PREVIEW_JSON_REQUIRED_CODE,
      "The assignment grade-preview command only supports JSON output. Run with --json."
    )
  ]);

const createGradeStatusJsonRequiredResult = (): AssignmentGradeStatusResult =>
  createEmptyAssignmentGradeStatusResult("failure", [
    createConfigDiagnostic(
      ASSIGNMENT_GRADE_STATUS_JSON_REQUIRED_CODE,
      "The assignment grade-status command only supports JSON output. Run with --json."
    )
  ]);

const createStudentFilterConflictResult = (): AssignmentGradeStatusResult =>
  createEmptyAssignmentGradeStatusResult("failure", [
    createConfigDiagnostic(
      STUDENT_FILTER_CONFLICT_CODE,
      "Use either --student or --students, not both."
    )
  ]);

const createStudentFilterEmptyResult = (): AssignmentGradeStatusResult =>
  createEmptyAssignmentGradeStatusResult("failure", [
    createConfigDiagnostic(
      STUDENT_FILTER_EMPTY_CODE,
      "Student filter contains an empty student ID."
    )
  ]);

const resolveGitHubClient = (
  githubClient: GitHubClient | undefined,
  token: string | undefined
): GitHubClient | undefined => {
  if (githubClient !== undefined) {
    return githubClient;
  }

  return token === undefined ? undefined : createGitHubClient({ token });
};

const dedupeStudentIds = (studentIds: readonly string[]): string[] =>
  studentIds.reduce<string[]>(
    (deduped, studentId) =>
      deduped.some((existingStudentId) => existingStudentId === studentId)
        ? deduped
        : [...deduped, studentId],
    []
  );

const parseStudentFilter = (
  options: AssignmentGradeStatusCommandOptions
):
  | { readonly result: AssignmentGradeStatusResult }
  | { readonly studentIds?: readonly string[] } => {
  if (options.student !== undefined && options.students !== undefined) {
    return { result: createStudentFilterConflictResult() };
  }

  const rawStudentIds =
    options.student !== undefined
      ? [options.student]
      : options.students === undefined
        ? []
        : options.students.split(",");
  const studentIds = rawStudentIds.map((studentId) => studentId.trim());

  if (studentIds.some((studentId) => studentId.length === 0)) {
    return { result: createStudentFilterEmptyResult() };
  }

  return studentIds.length === 0 ? {} : { studentIds: dedupeStudentIds(studentIds) };
};

export const runAssignmentDetailCommand = ({
  cwd,
  assignmentFile,
  options,
  env = process.env,
  githubClient
}: AssignmentDetailCommandRequest): Promise<AssignmentDetailResult> => {
  if (options.json !== true) {
    return Promise.resolve(createJsonRequiredResult());
  }

  const token = readGitHubToken(env);
  const resolvedGitHubClient = resolveGitHubClient(githubClient, token);

  return buildAssignmentDetail({
    cwd,
    assignmentFile,
    ...(resolvedGitHubClient === undefined ? {} : { githubClient: resolvedGitHubClient })
  });
};

export const runAssignmentApplyPreviewCommand = ({
  cwd,
  assignmentFile,
  options,
  env = process.env,
  githubClient
}: AssignmentApplyPreviewCommandRequest): Promise<AssignmentApplyPreviewResult> => {
  if (options.json !== true) {
    return Promise.resolve(createApplyPreviewJsonRequiredResult());
  }

  const token = readGitHubToken(env);
  const resolvedGitHubClient = resolveGitHubClient(githubClient, token);

  return buildAssignmentApplyPreview({
    cwd,
    assignmentFile,
    ...(resolvedGitHubClient === undefined ? {} : { githubClient: resolvedGitHubClient })
  });
};

export const runAssignmentGradePreviewCommand = ({
  cwd,
  assignmentFile,
  options,
  env = process.env,
  githubClient
}: AssignmentGradePreviewCommandRequest): Promise<AssignmentGradePreviewResult> => {
  if (options.json !== true) {
    return Promise.resolve(createGradePreviewJsonRequiredResult());
  }

  const token = readGitHubToken(env);
  const resolvedGitHubClient = resolveGitHubClient(githubClient, token);

  return buildAssignmentGradePreview({
    cwd,
    assignmentFile,
    ...(resolvedGitHubClient === undefined ? {} : { githubClient: resolvedGitHubClient })
  });
};

export const runAssignmentGradeStatusCommand = ({
  cwd,
  assignmentFile,
  options,
  env = process.env,
  githubClient
}: AssignmentGradeStatusCommandRequest): Promise<AssignmentGradeStatusResult> => {
  if (options.json !== true) {
    return Promise.resolve(createGradeStatusJsonRequiredResult());
  }

  const filterResult = parseStudentFilter(options);

  if ("result" in filterResult) {
    return Promise.resolve(filterResult.result);
  }

  const token = readGitHubToken(env);
  const resolvedGitHubClient = resolveGitHubClient(githubClient, token);

  return buildAssignmentGradeStatus({
    cwd,
    assignmentFile,
    ...(resolvedGitHubClient === undefined ? {} : { githubClient: resolvedGitHubClient }),
    ...(filterResult.studentIds === undefined ? {} : { studentIds: filterResult.studentIds })
  });
};

export const runAssignmentApplyCommand = ({
  cwd,
  assignmentFile,
  options,
  githubClient,
  clock,
  retryOptions
}: AssignmentApplyCommandRequest): Promise<CommandResult> =>
  runApplyCommand({
    cwd,
    assignmentFile,
    options,
    commandName: ASSIGNMENT_APPLY_COMMAND_NAME,
    ...(githubClient === undefined ? {} : { githubClient }),
    ...(clock === undefined ? {} : { clock }),
    ...(retryOptions === undefined ? {} : { retryOptions })
  });

export const runAssignmentGradeCommand = ({
  cwd,
  assignmentFile,
  options,
  targetSelector,
  githubClient,
  retryOptions
}: AssignmentGradeCommandRequest): Promise<CommandResult> =>
  runGradeCommand({
    cwd,
    assignmentFile,
    options,
    targetSelector,
    commandName: ASSIGNMENT_GRADE_COMMAND_NAME,
    ...(githubClient === undefined ? {} : { githubClient }),
    ...(retryOptions === undefined ? {} : { retryOptions })
  });

export const formatAssignmentDetailResultAsJson = (result: AssignmentDetailResult): string =>
  JSON.stringify(result, undefined, JSON_INDENT_SPACES);

export const formatAssignmentApplyPreviewResultAsJson = (
  result: AssignmentApplyPreviewResult
): string => JSON.stringify(result, undefined, JSON_INDENT_SPACES);

export const formatAssignmentGradePreviewResultAsJson = (
  result: AssignmentGradePreviewResult
): string => JSON.stringify(result, undefined, JSON_INDENT_SPACES);

export const formatAssignmentGradeStatusResultAsJson = (
  result: AssignmentGradeStatusResult
): string => JSON.stringify(result, undefined, JSON_INDENT_SPACES);

export const registerAssignmentCommand = (program: Command): void => {
  const assignment = program
    .command(COMMAND_NAME)
    .description("Inspect assignment configuration and local detail data.");

  assignment
    .command(DETAIL_COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Required. Emit assignment detail JSON")
    .description("Build a UI-ready read-only assignment detail model.")
    .action(async (assignmentFile: string, options: AssignmentDetailCommandOptions) => {
      const result = await runAssignmentDetailCommand({
        cwd: process.cwd(),
        assignmentFile,
        options
      });

      console.log(formatAssignmentDetailResultAsJson(result));
      process.exitCode = result.exitCode;
    });

  assignment
    .command(APPLY_PREVIEW_COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Required. Emit assignment apply preview JSON")
    .description("Build a UI-ready read-only assignment apply preview model.")
    .action(async (assignmentFile: string, options: AssignmentApplyPreviewCommandOptions) => {
      const result = await runAssignmentApplyPreviewCommand({
        cwd: process.cwd(),
        assignmentFile,
        options
      });

      console.log(formatAssignmentApplyPreviewResultAsJson(result));
      process.exitCode = result.exitCode;
    });

  assignment
    .command(GRADE_PREVIEW_COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Required. Emit assignment grade preview JSON")
    .description("Build a UI-ready read-only assignment grade preview model.")
    .action(async (assignmentFile: string, options: AssignmentGradePreviewCommandOptions) => {
      const result = await runAssignmentGradePreviewCommand({
        cwd: process.cwd(),
        assignmentFile,
        options
      });

      console.log(formatAssignmentGradePreviewResultAsJson(result));
      process.exitCode = result.exitCode;
    });

  assignment
    .command(GRADE_STATUS_COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Required. Emit assignment grade status JSON")
    .option("--student <student-id>", "Check grade status for one active target student")
    .option(
      "--students <student-ids>",
      "Check grade status for comma-separated active target students"
    )
    .description("Build a UI-ready read-only assignment grade status model.")
    .action(async (assignmentFile: string, options: AssignmentGradeStatusCommandOptions) => {
      const result = await runAssignmentGradeStatusCommand({
        cwd: process.cwd(),
        assignmentFile,
        options
      });

      console.log(formatAssignmentGradeStatusResultAsJson(result));
      process.exitCode = result.exitCode;
    });

  assignment
    .command(APPLY_COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Emit JSON output")
    .option("--verbose", "Emit verbose diagnostics")
    .option("--yes", "Confirm non-interactive execution")
    .description("Apply assignment repository changes.")
    .action(async (assignmentFile: string, rawOptions: RawCommonCommandOptions) => {
      const options = normalizeCommonCommandOptions(rawOptions);
      const result = await runAssignmentApplyCommand({
        cwd: process.cwd(),
        assignmentFile,
        options
      });

      writeCommandResult(result, options.json);
      process.exitCode = result.exitCode;
    });

  assignment
    .command(GRADE_COMMAND_NAME)
    .argument("<assignment-file>")
    .option("--json", "Emit JSON output")
    .option("--verbose", "Emit verbose diagnostics")
    .option("--yes", "Confirm non-interactive execution")
    .option("--all", "Target all active students")
    .option("--section <section-id>", "Target active students in a section")
    .option("--student-id <student-id>", "Target one active student by student ID")
    .option("--github-username <github-username>", "Target one active student by GitHub username")
    .description("Dispatch assignment grading workflows.")
    .action(async (assignmentFile: string, rawOptions: GradeRawOptions) => {
      const options = normalizeCommonCommandOptions(rawOptions);
      const result = await runAssignmentGradeCommand({
        cwd: process.cwd(),
        assignmentFile,
        options,
        targetSelector: rawOptions
      });

      writeCommandResult(result, options.json);
      process.exitCode = result.exitCode;
    });
};
