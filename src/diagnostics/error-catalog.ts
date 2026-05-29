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
  GithubTimeout: "github_timeout",
  InvalidTemplateRepository: "invalid_template_repository",
  TemplateRepositoryOutsideOrg: "template_repository_outside_org",
  TemplateRepositoryMissing: "template_repository_missing",
  TemplateRepositoryNotTemplate: "template_repository_not_template",
  TemplateBranchMissing: "template_branch_missing",
  TemplateBranchNotDefault: "template_branch_not_default",
  TemplateReadmeMissing: "template_readme_missing",
  FacultyTeamMissing: "faculty_team_missing",
  GraderTeamMissing: "grader_team_missing",
  GithubUserMissing: "github_user_missing",
  InvalidRepositoryName: "invalid_repository_name",
  RepoNamePatternMissingPlaceholder: "repo_name_pattern_missing_placeholder",
  RepoNamePatternUnknownPlaceholder: "repo_name_pattern_unknown_placeholder",
  SourceFileMissing: "source_file_missing",
  SourceFileOutsideRepo: "source_file_outside_repo",
  SourceFileNotFile: "source_file_not_file",
  SourceFingerprintFailed: "source_fingerprint_failed",
  RepoNameCollision: "repo_name_collision",
  AssignmentNotActive: "assignment_not_active",
  AssignmentClosedBlocksCreation: "assignment_closed_blocks_creation",
  AssignmentArchived: "assignment_archived",
  PlanContainsBlockedOperations: "plan_contains_blocked_operations",
  PlanWriteFailed: "plan_write_failed"
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
export const INVALID_TEMPLATE_REPOSITORY_CODE = DiagnosticCode.InvalidTemplateRepository;
export const TEMPLATE_REPOSITORY_OUTSIDE_ORG_CODE = DiagnosticCode.TemplateRepositoryOutsideOrg;
export const TEMPLATE_REPOSITORY_MISSING_CODE = DiagnosticCode.TemplateRepositoryMissing;
export const TEMPLATE_REPOSITORY_NOT_TEMPLATE_CODE = DiagnosticCode.TemplateRepositoryNotTemplate;
export const TEMPLATE_BRANCH_MISSING_CODE = DiagnosticCode.TemplateBranchMissing;
export const TEMPLATE_BRANCH_NOT_DEFAULT_CODE = DiagnosticCode.TemplateBranchNotDefault;
export const TEMPLATE_README_MISSING_CODE = DiagnosticCode.TemplateReadmeMissing;
export const FACULTY_TEAM_MISSING_CODE = DiagnosticCode.FacultyTeamMissing;
export const GRADER_TEAM_MISSING_CODE = DiagnosticCode.GraderTeamMissing;
export const GITHUB_USER_MISSING_CODE = DiagnosticCode.GithubUserMissing;
export const INVALID_REPOSITORY_NAME_CODE = DiagnosticCode.InvalidRepositoryName;
export const REPO_NAME_PATTERN_MISSING_PLACEHOLDER_CODE =
  DiagnosticCode.RepoNamePatternMissingPlaceholder;
export const REPO_NAME_PATTERN_UNKNOWN_PLACEHOLDER_CODE =
  DiagnosticCode.RepoNamePatternUnknownPlaceholder;
export const SOURCE_FILE_MISSING_CODE = DiagnosticCode.SourceFileMissing;
export const SOURCE_FILE_OUTSIDE_REPO_CODE = DiagnosticCode.SourceFileOutsideRepo;
export const SOURCE_FILE_NOT_FILE_CODE = DiagnosticCode.SourceFileNotFile;
export const SOURCE_FINGERPRINT_FAILED_CODE = DiagnosticCode.SourceFingerprintFailed;
export const REPO_NAME_COLLISION_CODE = DiagnosticCode.RepoNameCollision;
export const ASSIGNMENT_NOT_ACTIVE_CODE = DiagnosticCode.AssignmentNotActive;
export const ASSIGNMENT_CLOSED_BLOCKS_CREATION_CODE = DiagnosticCode.AssignmentClosedBlocksCreation;
export const ASSIGNMENT_ARCHIVED_CODE = DiagnosticCode.AssignmentArchived;
export const PLAN_CONTAINS_BLOCKED_OPERATIONS_CODE = DiagnosticCode.PlanContainsBlockedOperations;
export const PLAN_WRITE_FAILED_CODE = DiagnosticCode.PlanWriteFailed;

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
