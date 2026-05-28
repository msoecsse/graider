import type { Diagnostic } from "./diagnostic.js";

export const DiagnosticCode = {
  MissingRequiredFile: "missing_required_file",
  InvalidYaml: "invalid_yaml",
  InvalidSchemaVersion: "invalid_schema_version",
  MissingRequiredField: "missing_required_field",
  InvalidTermCode: "invalid_term_code",
  AssignmentSlugMismatch: "assignment_slug_mismatch",
  TermCodeMismatch: "term_code_mismatch",
  InvalidAssignmentType: "invalid_assignment_type",
  InvalidAssignmentStatus: "invalid_assignment_status",
  InvalidRepositoryVisibility: "invalid_repository_visibility",
  InvalidPermission: "invalid_permission",
  InvalidGradingConfig: "invalid_grading_config",
  MissingRequiredColumn: "missing_required_column",
  MissingRequiredValue: "missing_required_value",
  InvalidRosterStatus: "invalid_roster_status",
  SectionMismatch: "section_mismatch",
  DuplicateStudentId: "duplicate_student_id",
  DuplicateGithubUsername: "duplicate_github_username",
  InvalidGithubUsername: "invalid_github_username",
  StudentIdNormalized: "student_id_normalized",
  GithubUsernameNormalized: "github_username_normalized",
  RosterStatusNormalized: "roster_status_normalized",
  NotSupportedInMvp: "not_supported_in_mvp",
  GithubAuthMissing: "github_auth_missing",
  GithubAuthFailed: "github_auth_failed",
  GithubPermissionDenied: "github_permission_denied",
  GithubApiError: "github_api_error",
  GithubNetworkError: "github_network_error",
  GithubRateLimited: "github_rate_limited",
  GithubTimeout: "github_timeout"
} as const;

export type DiagnosticCodeValue = (typeof DiagnosticCode)[keyof typeof DiagnosticCode];

export const NOT_SUPPORTED_IN_MVP_CODE = DiagnosticCode.NotSupportedInMvp;
export const MISSING_REQUIRED_FILE_CODE = DiagnosticCode.MissingRequiredFile;
export const INVALID_YAML_CODE = DiagnosticCode.InvalidYaml;
export const INVALID_SCHEMA_VERSION_CODE = DiagnosticCode.InvalidSchemaVersion;
export const MISSING_REQUIRED_FIELD_CODE = DiagnosticCode.MissingRequiredField;
export const INVALID_TERM_CODE_CODE = DiagnosticCode.InvalidTermCode;
export const ASSIGNMENT_SLUG_MISMATCH_CODE = DiagnosticCode.AssignmentSlugMismatch;
export const TERM_CODE_MISMATCH_CODE = DiagnosticCode.TermCodeMismatch;
export const INVALID_ASSIGNMENT_TYPE_CODE = DiagnosticCode.InvalidAssignmentType;
export const INVALID_ASSIGNMENT_STATUS_CODE = DiagnosticCode.InvalidAssignmentStatus;
export const INVALID_REPOSITORY_VISIBILITY_CODE = DiagnosticCode.InvalidRepositoryVisibility;
export const INVALID_PERMISSION_CODE = DiagnosticCode.InvalidPermission;
export const INVALID_GRADING_CONFIG_CODE = DiagnosticCode.InvalidGradingConfig;
export const MISSING_REQUIRED_COLUMN_CODE = DiagnosticCode.MissingRequiredColumn;
export const MISSING_REQUIRED_VALUE_CODE = DiagnosticCode.MissingRequiredValue;
export const INVALID_ROSTER_STATUS_CODE = DiagnosticCode.InvalidRosterStatus;
export const SECTION_MISMATCH_CODE = DiagnosticCode.SectionMismatch;
export const DUPLICATE_STUDENT_ID_CODE = DiagnosticCode.DuplicateStudentId;
export const DUPLICATE_GITHUB_USERNAME_CODE = DiagnosticCode.DuplicateGithubUsername;
export const INVALID_GITHUB_USERNAME_CODE = DiagnosticCode.InvalidGithubUsername;
export const STUDENT_ID_NORMALIZED_CODE = DiagnosticCode.StudentIdNormalized;
export const GITHUB_USERNAME_NORMALIZED_CODE = DiagnosticCode.GithubUsernameNormalized;
export const ROSTER_STATUS_NORMALIZED_CODE = DiagnosticCode.RosterStatusNormalized;

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

export const createWarningDiagnostic = (
  code: string,
  message: string,
  context?: Record<string, unknown>
): Diagnostic => ({
  code,
  severity: "warning",
  message,
  ...(context === undefined ? {} : { context })
});
