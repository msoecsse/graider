import type { Command } from "commander";
import {
  buildAssignmentDetail,
  createEmptyAssignmentDetailResult
} from "../../assignment-detail/assignment-detail-builder.js";
import type { AssignmentDetailResult } from "../../assignment-detail/assignment-detail-models.js";
import {
  ASSIGNMENT_DETAIL_JSON_REQUIRED_CODE,
  createConfigDiagnostic
} from "../../diagnostics/error-catalog.js";
import type { GitHubClient } from "../../github/github-client.js";
import { createGitHubClient, readGitHubToken } from "../../github/github-client-factory.js";

const COMMAND_NAME = "assignment";
const DETAIL_COMMAND_NAME = "detail";
const JSON_INDENT_SPACES = 2;

interface AssignmentDetailCommandOptions {
  readonly json?: boolean;
}

export interface AssignmentDetailCommandRequest {
  readonly cwd: string;
  readonly assignmentFile: string;
  readonly options: AssignmentDetailCommandOptions;
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

export const formatAssignmentDetailResultAsJson = (result: AssignmentDetailResult): string =>
  JSON.stringify(result, undefined, JSON_INDENT_SPACES);

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
};
