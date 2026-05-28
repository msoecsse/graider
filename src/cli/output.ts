import type { CommandResult } from "../core/command-result.js";

const JSON_INDENT_SPACES = 2;
const EMPTY_COLLECTION_LENGTH = 0;

export const formatCommandResultAsJson = (result: CommandResult): string =>
  JSON.stringify(result, undefined, JSON_INDENT_SPACES);

export const formatCommandResultAsText = (result: CommandResult): string => {
  const assignmentFile = result.assignmentFile ?? "<none>";
  const errorCodes = result.errors.map((error) => error.code);

  if (errorCodes.length === EMPTY_COLLECTION_LENGTH) {
    return `${result.commandName}: ${assignmentFile}: ${result.status}`;
  }

  return `${result.commandName}: ${assignmentFile}: ${result.status}: ${errorCodes.join(", ")}`;
};

export const writeCommandResult = (result: CommandResult, json: boolean): void => {
  const output = json ? formatCommandResultAsJson(result) : formatCommandResultAsText(result);

  console.log(output);
};
