import type { Diagnostic } from "./diagnostic.js";

export const NOT_SUPPORTED_IN_MVP_CODE = "not_supported_in_mvp";
export const MISSING_REQUIRED_FILE_CODE = "missing_required_file";

export const createNotSupportedInMvpDiagnostic = (commandName: string): Diagnostic => ({
  code: NOT_SUPPORTED_IN_MVP_CODE,
  severity: "error",
  message: `The ${commandName} command is not supported in the MVP placeholder CLI shell.`,
  context: {
    commandName
  }
});

export const createMissingRequiredFileDiagnostic = (
  fileName: string,
  startDirectory: string
): Diagnostic => ({
  code: MISSING_REQUIRED_FILE_CODE,
  severity: "error",
  message: `Missing required file ${fileName}; could not find it in ${startDirectory} or any parent directory.`,
  context: {
    fileName,
    startDirectory
  }
});
