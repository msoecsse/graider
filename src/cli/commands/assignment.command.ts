import type { Command } from "commander";
import {
  buildAssignmentApplyPreview,
  createEmptyAssignmentApplyPreviewResult
} from "../../apply-preview/apply-preview-builder.js";
import type { AssignmentApplyPreviewResult } from "../../apply-preview/apply-preview-models.js";
import {
  buildAssignmentDetail,
  createEmptyAssignmentDetailResult
} from "../../assignment-detail/assignment-detail-builder.js";
import type { AssignmentDetailResult } from "../../assignment-detail/assignment-detail-models.js";
import {
  ASSIGNMENT_APPLY_PREVIEW_JSON_REQUIRED_CODE,
  ASSIGNMENT_DETAIL_JSON_REQUIRED_CODE,
  createConfigDiagnostic
} from "../../diagnostics/error-catalog.js";
import type { GitHubClient } from "../../github/github-client.js";
import { createGitHubClient, readGitHubToken } from "../../github/github-client-factory.js";

const COMMAND_NAME = "assignment";
const DETAIL_COMMAND_NAME = "detail";
const APPLY_PREVIEW_COMMAND_NAME = "apply-preview";
const JSON_INDENT_SPACES = 2;

interface AssignmentDetailCommandOptions {
  readonly json?: boolean;
}

interface AssignmentApplyPreviewCommandOptions {
  readonly json?: boolean;
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

const resolveGitHubClient = (
  githubClient: GitHubClient | undefined,
  token: string | undefined
): GitHubClient | undefined => {
  if (githubClient !== undefined) {
    return githubClient;
  }

  return token === undefined ? undefined : createGitHubClient({ token });
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

export const formatAssignmentDetailResultAsJson = (result: AssignmentDetailResult): string =>
  JSON.stringify(result, undefined, JSON_INDENT_SPACES);

export const formatAssignmentApplyPreviewResultAsJson = (
  result: AssignmentApplyPreviewResult
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
};
