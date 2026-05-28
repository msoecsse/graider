import type { Diagnostic } from "./diagnostic.js";

export const NOT_SUPPORTED_IN_MVP_CODE = "not_supported_in_mvp";
export const MISSING_REQUIRED_FILE_CODE = "missing_required_file";
export const INVALID_YAML_CODE = "invalid_yaml";
export const INVALID_SCHEMA_VERSION_CODE = "invalid_schema_version";
export const MISSING_REQUIRED_FIELD_CODE = "missing_required_field";
export const INVALID_TERM_CODE_CODE = "invalid_term_code";
export const ASSIGNMENT_SLUG_MISMATCH_CODE = "assignment_slug_mismatch";
export const TERM_CODE_MISMATCH_CODE = "term_code_mismatch";
export const INVALID_ASSIGNMENT_TYPE_CODE = "invalid_assignment_type";
export const INVALID_ASSIGNMENT_STATUS_CODE = "invalid_assignment_status";
export const INVALID_REPOSITORY_VISIBILITY_CODE = "invalid_repository_visibility";
export const INVALID_PERMISSION_CODE = "invalid_permission";
export const INVALID_GRADING_CONFIG_CODE = "invalid_grading_config";

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

export const createInvalidYamlDiagnostic = (filePath: string, reason: string): Diagnostic => ({
  code: INVALID_YAML_CODE,
  severity: "error",
  message: `Invalid YAML in ${filePath}: ${reason}`,
  context: {
    filePath,
    reason
  }
});

export const createConfigDiagnostic = (
  code: string,
  message: string,
  context?: Record<string, unknown>
): Diagnostic => ({
  code,
  severity: "error",
  message,
  ...(context === undefined ? {} : { context })
});
