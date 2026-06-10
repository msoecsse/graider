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
}

const createJsonRequiredResult = (): AssignmentDetailResult =>
  createEmptyAssignmentDetailResult("failure", [
    createConfigDiagnostic(
      ASSIGNMENT_DETAIL_JSON_REQUIRED_CODE,
      "The assignment detail command only supports JSON output. Run with --json."
    )
  ]);

export const runAssignmentDetailCommand = ({
  cwd,
  assignmentFile,
  options
}: AssignmentDetailCommandRequest): AssignmentDetailResult => {
  if (options.json !== true) {
    return createJsonRequiredResult();
  }

  return buildAssignmentDetail({ cwd, assignmentFile });
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
    .action((assignmentFile: string, options: AssignmentDetailCommandOptions) => {
      const result = runAssignmentDetailCommand({
        cwd: process.cwd(),
        assignmentFile,
        options
      });

      console.log(formatAssignmentDetailResultAsJson(result));
      process.exitCode = result.exitCode;
    });
};
