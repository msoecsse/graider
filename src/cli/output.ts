import type { CommandResult } from "../core/command-result.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { redactCommandResult } from "../diagnostics/redaction.js";

const JSON_INDENT_SPACES = 2;
const EMPTY_COLLECTION_LENGTH = 0;

export const formatCommandResultAsJson = (result: CommandResult): string =>
  JSON.stringify(redactCommandResult(result), undefined, JSON_INDENT_SPACES);

const formatDiagnostic = (diagnostic: Diagnostic): string =>
  `${diagnostic.code}: ${diagnostic.message}`;

export const formatCommandResultAsText = (result: CommandResult): string => {
  const redactedResult = redactCommandResult(result);
  const assignmentFile = redactedResult.assignmentFile ?? "<none>";
  const lines = [`${redactedResult.commandName}: ${assignmentFile}: ${redactedResult.status}`];

  if (redactedResult.generatedFiles.length > EMPTY_COLLECTION_LENGTH) {
    lines.push(`generated: ${redactedResult.generatedFiles.join(", ")}`);
  }

  if (redactedResult.warnings.length > EMPTY_COLLECTION_LENGTH) {
    lines.push(`warnings: ${redactedResult.warnings.map(formatDiagnostic).join("; ")}`);
  }

  if (redactedResult.errors.length > EMPTY_COLLECTION_LENGTH) {
    lines.push(`errors: ${redactedResult.errors.map(formatDiagnostic).join("; ")}`);
  }

  return lines.join("\n");
};

export const writeCommandResult = (result: CommandResult, json: boolean): void => {
  const output = json ? formatCommandResultAsJson(result) : formatCommandResultAsText(result);

  console.log(output);
};
