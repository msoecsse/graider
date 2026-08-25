#!/usr/bin/env node

// src/cli/index.ts
import { Command } from "commander";

// src/diagnostics/error-catalog.ts
var DiagnosticCode = {
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
  UnsupportedGradingMode: "unsupported_grading_mode",
  MissingGradingWorkflow: "missing_grading_workflow",
  MissingGradingArtifact: "missing_grading_artifact",
  MissingGradingResultFile: "missing_grading_result_file",
  MissingGradingPreset: "missing_grading_preset",
  UnsupportedGradingPreset: "unsupported_grading_preset",
  UnsupportedStudentPublishMode: "unsupported_student_publish_mode",
  MissingStudentPublishDestination: "missing_student_publish_destination",
  MissingStudentPublishSourceFile: "missing_student_publish_source_file",
  MissingStudentPublishArtifact: "missing_student_publish_artifact",
  MissingGraiderReportDestination: "missing_graider_report_destination",
  MissingFacultyReportSource: "missing_faculty_report_source",
  MissingFacultyReportDestination: "missing_faculty_report_destination",
  WorkflowGenerationNotConfigured: "workflow_generation_not_configured",
  WorkflowGenerationRequiresPresetMode: "workflow_generation_requires_preset_mode",
  GeneratedWorkflowExists: "generated_workflow_exists",
  WorkflowGenerationWriteFailed: "workflow_generation_write_failed",
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
  PlanWriteFailed: "plan_write_failed",
  ManifestMissing: "manifest_missing",
  InvalidManifest: "invalid_manifest",
  InvalidManifestSchemaVersion: "invalid_manifest_schema_version",
  MissingManifestSection: "missing_manifest_section",
  InvalidManifestRepositoryRecord: "invalid_manifest_repository_record",
  InvalidManifestLifecycleStatus: "invalid_manifest_lifecycle_status",
  InvalidManifestPermission: "invalid_manifest_permission",
  ManifestWriteFailed: "manifest_write_failed",
  MutationBlocked: "mutation_blocked",
  ConfirmationRequired: "confirmation_required",
  ManifestTrackedRepositoryMissing: "manifest_tracked_repository_missing",
  GradingWorkflowMissing: "grading_workflow_missing",
  GradingWorkflowPending: "grading_workflow_pending",
  GroupRepositoryApplyNotImplemented: "group_repository_apply_not_implemented",
  WorkflowDispatchUnsupported: "workflow_dispatch_unsupported",
  WorkflowDispatchMissing: "workflow_dispatch_missing",
  WorkflowDispatchFailed: "workflow_dispatch_failed",
  PermissionNotDowngraded: "permission_not_downgraded",
  UnexpectedCollaboratorPreserved: "unexpected_collaborator_preserved",
  GradingNotConfigured: "grading_not_configured",
  AssignmentStatusBlocksGrade: "assignment_status_blocks_grade",
  TargetSelectorMissing: "target_selector_missing",
  TargetSelectorAmbiguous: "target_selector_ambiguous",
  TargetMatchesNoStudents: "target_matches_no_students",
  TargetStudentNotActive: "target_student_not_active",
  StudentRepositoryMissing: "student_repository_missing",
  ManifestRepositoryMissing: "manifest_repository_missing",
  InvalidGradingResult: "invalid_grading_result",
  InvalidGradingResultSchemaVersion: "invalid_grading_result_schema_version",
  InvalidGradingResultStatus: "invalid_grading_result_status",
  InvalidGradingCheckStatus: "invalid_grading_check_status",
  MissingGradingCheckName: "missing_grading_check_name",
  InvalidGradingScore: "invalid_grading_score",
  GradingWorkflowFailedWithResults: "grading_workflow_failed_with_results",
  ReportWriteFailed: "report_write_failed",
  StudentReportPublishFailed: "student_report_publish_failed",
  StudentReportRepositoryMissing: "student_report_repository_missing",
  StudentReportSourceMissing: "student_report_source_missing",
  StudentReportArtifactMissing: "student_report_artifact_missing",
  StudentReportWriteFailed: "student_report_write_failed",
  StudentReportPublishPartial: "student_report_publish_partial",
  StudentReportPublishNotRequested: "student_report_publish_not_requested",
  DashboardJsonRequired: "dashboard_json_required",
  DashboardTermNotFound: "dashboard_term_not_found",
  DashboardTemplateRepositoryMissing: "dashboard_template_repository_missing",
  DashboardTemplateBranchMissing: "dashboard_template_branch_missing",
  DashboardGradingWorkflowMissing: "dashboard_grading_workflow_missing",
  DashboardWorkflowDispatchMissing: "dashboard_workflow_dispatch_missing",
  DashboardGithubAuthFailed: "dashboard_github_auth_failed",
  DashboardGithubPermissionDenied: "dashboard_github_permission_denied",
  DashboardGithubRateLimited: "dashboard_github_rate_limited",
  DashboardGithubRequestFailed: "dashboard_github_request_failed",
  AssignmentDetailJsonRequired: "assignment_detail_json_required",
  GithubTokenRequired: "github_token_required",
  AssignmentDetailTemplateRepositoryMissing: "assignment_detail_template_repository_missing",
  AssignmentDetailTemplateBranchMissing: "assignment_detail_template_branch_missing",
  AssignmentDetailGradingWorkflowMissing: "assignment_detail_grading_workflow_missing",
  AssignmentDetailWorkflowDispatchMissing: "assignment_detail_workflow_dispatch_missing",
  AssignmentDetailGithubAuthFailed: "assignment_detail_github_auth_failed",
  AssignmentDetailGithubPermissionDenied: "assignment_detail_github_permission_denied",
  AssignmentDetailGithubRateLimited: "assignment_detail_github_rate_limited",
  AssignmentDetailGithubRequestFailed: "assignment_detail_github_request_failed",
  AssignmentApplyPreviewJsonRequired: "assignment_apply_preview_json_required",
  AssignmentGradePreviewJsonRequired: "assignment_grade_preview_json_required",
  AssignmentGradeStatusJsonRequired: "assignment_grade_status_json_required",
  StudentFilterConflict: "student_filter_conflict",
  StudentFilterEmpty: "student_filter_empty",
  StudentFilterNoMatches: "student_filter_no_matches",
  StudentFilterUnknownStudent: "student_filter_unknown_student",
  StudentRepositoryStatusUnknown: "student_repository_status_unknown",
  GradingWorkflowRunMissing: "grading_workflow_run_missing",
  GradingWorkflowRunInProgress: "grading_workflow_run_in_progress",
  GradingWorkflowRunFailed: "grading_workflow_run_failed",
  GradingWorkflowStatusUnknown: "grading_workflow_status_unknown",
  GithubTokenMissing: "github_token_missing"
};
var NOT_SUPPORTED_IN_MVP_CODE = DiagnosticCode.NotSupportedInMvp;
var MISSING_REQUIRED_FILE_CODE = DiagnosticCode.MissingRequiredFile;
var INVALID_YAML_CODE = DiagnosticCode.InvalidYaml;
var INVALID_SCHEMA_VERSION_CODE = DiagnosticCode.InvalidSchemaVersion;
var MISSING_REQUIRED_FIELD_CODE = DiagnosticCode.MissingRequiredField;
var INVALID_TERM_CODE_CODE = DiagnosticCode.InvalidTermCode;
var ASSIGNMENT_SLUG_MISMATCH_CODE = DiagnosticCode.AssignmentSlugMismatch;
var TERM_CODE_MISMATCH_CODE = DiagnosticCode.TermCodeMismatch;
var INVALID_ASSIGNMENT_TYPE_CODE = DiagnosticCode.InvalidAssignmentType;
var INVALID_ASSIGNMENT_STATUS_CODE = DiagnosticCode.InvalidAssignmentStatus;
var INVALID_REPOSITORY_VISIBILITY_CODE = DiagnosticCode.InvalidRepositoryVisibility;
var INVALID_PERMISSION_CODE = DiagnosticCode.InvalidPermission;
var INVALID_GRADING_CONFIG_CODE = DiagnosticCode.InvalidGradingConfig;
var UNSUPPORTED_GRADING_MODE_CODE = DiagnosticCode.UnsupportedGradingMode;
var MISSING_GRADING_WORKFLOW_CODE = DiagnosticCode.MissingGradingWorkflow;
var MISSING_GRADING_ARTIFACT_CODE = DiagnosticCode.MissingGradingArtifact;
var MISSING_GRADING_RESULT_FILE_CODE = DiagnosticCode.MissingGradingResultFile;
var MISSING_GRADING_PRESET_CODE = DiagnosticCode.MissingGradingPreset;
var UNSUPPORTED_GRADING_PRESET_CODE = DiagnosticCode.UnsupportedGradingPreset;
var UNSUPPORTED_STUDENT_PUBLISH_MODE_CODE = DiagnosticCode.UnsupportedStudentPublishMode;
var MISSING_STUDENT_PUBLISH_DESTINATION_CODE = DiagnosticCode.MissingStudentPublishDestination;
var MISSING_STUDENT_PUBLISH_SOURCE_FILE_CODE = DiagnosticCode.MissingStudentPublishSourceFile;
var MISSING_STUDENT_PUBLISH_ARTIFACT_CODE = DiagnosticCode.MissingStudentPublishArtifact;
var MISSING_GRAIDER_REPORT_DESTINATION_CODE = DiagnosticCode.MissingGraiderReportDestination;
var MISSING_FACULTY_REPORT_SOURCE_CODE = DiagnosticCode.MissingFacultyReportSource;
var MISSING_FACULTY_REPORT_DESTINATION_CODE = DiagnosticCode.MissingFacultyReportDestination;
var WORKFLOW_GENERATION_NOT_CONFIGURED_CODE = DiagnosticCode.WorkflowGenerationNotConfigured;
var WORKFLOW_GENERATION_REQUIRES_PRESET_MODE_CODE = DiagnosticCode.WorkflowGenerationRequiresPresetMode;
var GENERATED_WORKFLOW_EXISTS_CODE = DiagnosticCode.GeneratedWorkflowExists;
var WORKFLOW_GENERATION_WRITE_FAILED_CODE = DiagnosticCode.WorkflowGenerationWriteFailed;
var MISSING_REQUIRED_COLUMN_CODE = DiagnosticCode.MissingRequiredColumn;
var MISSING_REQUIRED_VALUE_CODE = DiagnosticCode.MissingRequiredValue;
var INVALID_ROSTER_STATUS_CODE = DiagnosticCode.InvalidRosterStatus;
var SECTION_MISMATCH_CODE = DiagnosticCode.SectionMismatch;
var DUPLICATE_STUDENT_ID_CODE = DiagnosticCode.DuplicateStudentId;
var DUPLICATE_GITHUB_USERNAME_CODE = DiagnosticCode.DuplicateGithubUsername;
var INVALID_GITHUB_USERNAME_CODE = DiagnosticCode.InvalidGithubUsername;
var STUDENT_ID_NORMALIZED_CODE = DiagnosticCode.StudentIdNormalized;
var GITHUB_USERNAME_NORMALIZED_CODE = DiagnosticCode.GithubUsernameNormalized;
var ROSTER_STATUS_NORMALIZED_CODE = DiagnosticCode.RosterStatusNormalized;
var INVALID_TEMPLATE_REPOSITORY_CODE = DiagnosticCode.InvalidTemplateRepository;
var TEMPLATE_REPOSITORY_OUTSIDE_ORG_CODE = DiagnosticCode.TemplateRepositoryOutsideOrg;
var TEMPLATE_REPOSITORY_MISSING_CODE = DiagnosticCode.TemplateRepositoryMissing;
var TEMPLATE_REPOSITORY_NOT_TEMPLATE_CODE = DiagnosticCode.TemplateRepositoryNotTemplate;
var TEMPLATE_BRANCH_MISSING_CODE = DiagnosticCode.TemplateBranchMissing;
var TEMPLATE_BRANCH_NOT_DEFAULT_CODE = DiagnosticCode.TemplateBranchNotDefault;
var TEMPLATE_README_MISSING_CODE = DiagnosticCode.TemplateReadmeMissing;
var FACULTY_TEAM_MISSING_CODE = DiagnosticCode.FacultyTeamMissing;
var GRADER_TEAM_MISSING_CODE = DiagnosticCode.GraderTeamMissing;
var GITHUB_USER_MISSING_CODE = DiagnosticCode.GithubUserMissing;
var INVALID_REPOSITORY_NAME_CODE = DiagnosticCode.InvalidRepositoryName;
var REPO_NAME_PATTERN_MISSING_PLACEHOLDER_CODE = DiagnosticCode.RepoNamePatternMissingPlaceholder;
var REPO_NAME_PATTERN_UNKNOWN_PLACEHOLDER_CODE = DiagnosticCode.RepoNamePatternUnknownPlaceholder;
var SOURCE_FILE_MISSING_CODE = DiagnosticCode.SourceFileMissing;
var SOURCE_FILE_OUTSIDE_REPO_CODE = DiagnosticCode.SourceFileOutsideRepo;
var SOURCE_FILE_NOT_FILE_CODE = DiagnosticCode.SourceFileNotFile;
var SOURCE_FINGERPRINT_FAILED_CODE = DiagnosticCode.SourceFingerprintFailed;
var REPO_NAME_COLLISION_CODE = DiagnosticCode.RepoNameCollision;
var ASSIGNMENT_NOT_ACTIVE_CODE = DiagnosticCode.AssignmentNotActive;
var ASSIGNMENT_CLOSED_BLOCKS_CREATION_CODE = DiagnosticCode.AssignmentClosedBlocksCreation;
var ASSIGNMENT_ARCHIVED_CODE = DiagnosticCode.AssignmentArchived;
var PLAN_CONTAINS_BLOCKED_OPERATIONS_CODE = DiagnosticCode.PlanContainsBlockedOperations;
var PLAN_WRITE_FAILED_CODE = DiagnosticCode.PlanWriteFailed;
var MANIFEST_MISSING_CODE = DiagnosticCode.ManifestMissing;
var INVALID_MANIFEST_CODE = DiagnosticCode.InvalidManifest;
var INVALID_MANIFEST_SCHEMA_VERSION_CODE = DiagnosticCode.InvalidManifestSchemaVersion;
var MISSING_MANIFEST_SECTION_CODE = DiagnosticCode.MissingManifestSection;
var INVALID_MANIFEST_REPOSITORY_RECORD_CODE = DiagnosticCode.InvalidManifestRepositoryRecord;
var INVALID_MANIFEST_LIFECYCLE_STATUS_CODE = DiagnosticCode.InvalidManifestLifecycleStatus;
var INVALID_MANIFEST_PERMISSION_CODE = DiagnosticCode.InvalidManifestPermission;
var MANIFEST_WRITE_FAILED_CODE = DiagnosticCode.ManifestWriteFailed;
var MUTATION_BLOCKED_CODE = DiagnosticCode.MutationBlocked;
var CONFIRMATION_REQUIRED_CODE = DiagnosticCode.ConfirmationRequired;
var MANIFEST_TRACKED_REPOSITORY_MISSING_CODE = DiagnosticCode.ManifestTrackedRepositoryMissing;
var GRADING_WORKFLOW_MISSING_CODE = DiagnosticCode.GradingWorkflowMissing;
var WORKFLOW_DISPATCH_UNSUPPORTED_CODE = DiagnosticCode.WorkflowDispatchUnsupported;
var WORKFLOW_DISPATCH_MISSING_CODE = DiagnosticCode.WorkflowDispatchMissing;
var WORKFLOW_DISPATCH_FAILED_CODE = DiagnosticCode.WorkflowDispatchFailed;
var PERMISSION_NOT_DOWNGRADED_CODE = DiagnosticCode.PermissionNotDowngraded;
var UNEXPECTED_COLLABORATOR_PRESERVED_CODE = DiagnosticCode.UnexpectedCollaboratorPreserved;
var GRADING_NOT_CONFIGURED_CODE = DiagnosticCode.GradingNotConfigured;
var ASSIGNMENT_STATUS_BLOCKS_GRADE_CODE = DiagnosticCode.AssignmentStatusBlocksGrade;
var TARGET_SELECTOR_MISSING_CODE = DiagnosticCode.TargetSelectorMissing;
var TARGET_SELECTOR_AMBIGUOUS_CODE = DiagnosticCode.TargetSelectorAmbiguous;
var TARGET_MATCHES_NO_STUDENTS_CODE = DiagnosticCode.TargetMatchesNoStudents;
var TARGET_STUDENT_NOT_ACTIVE_CODE = DiagnosticCode.TargetStudentNotActive;
var STUDENT_REPOSITORY_MISSING_CODE = DiagnosticCode.StudentRepositoryMissing;
var MANIFEST_REPOSITORY_MISSING_CODE = DiagnosticCode.ManifestRepositoryMissing;
var INVALID_GRADING_RESULT_CODE = DiagnosticCode.InvalidGradingResult;
var INVALID_GRADING_RESULT_SCHEMA_VERSION_CODE = DiagnosticCode.InvalidGradingResultSchemaVersion;
var INVALID_GRADING_RESULT_STATUS_CODE = DiagnosticCode.InvalidGradingResultStatus;
var INVALID_GRADING_CHECK_STATUS_CODE = DiagnosticCode.InvalidGradingCheckStatus;
var MISSING_GRADING_CHECK_NAME_CODE = DiagnosticCode.MissingGradingCheckName;
var INVALID_GRADING_SCORE_CODE = DiagnosticCode.InvalidGradingScore;
var GRADING_WORKFLOW_FAILED_WITH_RESULTS_CODE = DiagnosticCode.GradingWorkflowFailedWithResults;
var REPORT_WRITE_FAILED_CODE = DiagnosticCode.ReportWriteFailed;
var STUDENT_REPORT_PUBLISH_FAILED_CODE = DiagnosticCode.StudentReportPublishFailed;
var STUDENT_REPORT_REPOSITORY_MISSING_CODE = DiagnosticCode.StudentReportRepositoryMissing;
var STUDENT_REPORT_WRITE_FAILED_CODE = DiagnosticCode.StudentReportWriteFailed;
var STUDENT_REPORT_PUBLISH_PARTIAL_CODE = DiagnosticCode.StudentReportPublishPartial;
var STUDENT_REPORT_PUBLISH_NOT_REQUESTED_CODE = DiagnosticCode.StudentReportPublishNotRequested;
var DASHBOARD_JSON_REQUIRED_CODE = DiagnosticCode.DashboardJsonRequired;
var DASHBOARD_TERM_NOT_FOUND_CODE = DiagnosticCode.DashboardTermNotFound;
var DASHBOARD_TEMPLATE_REPOSITORY_MISSING_CODE = DiagnosticCode.DashboardTemplateRepositoryMissing;
var DASHBOARD_TEMPLATE_BRANCH_MISSING_CODE = DiagnosticCode.DashboardTemplateBranchMissing;
var DASHBOARD_GRADING_WORKFLOW_MISSING_CODE = DiagnosticCode.DashboardGradingWorkflowMissing;
var DASHBOARD_WORKFLOW_DISPATCH_MISSING_CODE = DiagnosticCode.DashboardWorkflowDispatchMissing;
var DASHBOARD_GITHUB_AUTH_FAILED_CODE = DiagnosticCode.DashboardGithubAuthFailed;
var DASHBOARD_GITHUB_PERMISSION_DENIED_CODE = DiagnosticCode.DashboardGithubPermissionDenied;
var DASHBOARD_GITHUB_RATE_LIMITED_CODE = DiagnosticCode.DashboardGithubRateLimited;
var DASHBOARD_GITHUB_REQUEST_FAILED_CODE = DiagnosticCode.DashboardGithubRequestFailed;
var ASSIGNMENT_DETAIL_JSON_REQUIRED_CODE = DiagnosticCode.AssignmentDetailJsonRequired;
var GITHUB_TOKEN_REQUIRED_CODE = DiagnosticCode.GithubTokenRequired;
var ASSIGNMENT_DETAIL_TEMPLATE_REPOSITORY_MISSING_CODE = DiagnosticCode.AssignmentDetailTemplateRepositoryMissing;
var ASSIGNMENT_DETAIL_TEMPLATE_BRANCH_MISSING_CODE = DiagnosticCode.AssignmentDetailTemplateBranchMissing;
var ASSIGNMENT_DETAIL_GRADING_WORKFLOW_MISSING_CODE = DiagnosticCode.AssignmentDetailGradingWorkflowMissing;
var ASSIGNMENT_DETAIL_WORKFLOW_DISPATCH_MISSING_CODE = DiagnosticCode.AssignmentDetailWorkflowDispatchMissing;
var ASSIGNMENT_DETAIL_GITHUB_AUTH_FAILED_CODE = DiagnosticCode.AssignmentDetailGithubAuthFailed;
var ASSIGNMENT_DETAIL_GITHUB_PERMISSION_DENIED_CODE = DiagnosticCode.AssignmentDetailGithubPermissionDenied;
var ASSIGNMENT_DETAIL_GITHUB_RATE_LIMITED_CODE = DiagnosticCode.AssignmentDetailGithubRateLimited;
var ASSIGNMENT_DETAIL_GITHUB_REQUEST_FAILED_CODE = DiagnosticCode.AssignmentDetailGithubRequestFailed;
var ASSIGNMENT_APPLY_PREVIEW_JSON_REQUIRED_CODE = DiagnosticCode.AssignmentApplyPreviewJsonRequired;
var ASSIGNMENT_GRADE_PREVIEW_JSON_REQUIRED_CODE = DiagnosticCode.AssignmentGradePreviewJsonRequired;
var ASSIGNMENT_GRADE_STATUS_JSON_REQUIRED_CODE = DiagnosticCode.AssignmentGradeStatusJsonRequired;
var STUDENT_FILTER_CONFLICT_CODE = DiagnosticCode.StudentFilterConflict;
var STUDENT_FILTER_EMPTY_CODE = DiagnosticCode.StudentFilterEmpty;
var STUDENT_FILTER_NO_MATCHES_CODE = DiagnosticCode.StudentFilterNoMatches;
var STUDENT_FILTER_UNKNOWN_STUDENT_CODE = DiagnosticCode.StudentFilterUnknownStudent;
var STUDENT_REPOSITORY_STATUS_UNKNOWN_CODE = DiagnosticCode.StudentRepositoryStatusUnknown;
var GRADING_WORKFLOW_RUN_MISSING_CODE = DiagnosticCode.GradingWorkflowRunMissing;
var GRADING_WORKFLOW_RUN_IN_PROGRESS_CODE = DiagnosticCode.GradingWorkflowRunInProgress;
var GRADING_WORKFLOW_RUN_FAILED_CODE = DiagnosticCode.GradingWorkflowRunFailed;
var GRADING_WORKFLOW_STATUS_UNKNOWN_CODE = DiagnosticCode.GradingWorkflowStatusUnknown;
var GITHUB_TOKEN_MISSING_CODE = DiagnosticCode.GithubTokenMissing;
var createNotSupportedInMvpDiagnostic = (commandName, assignmentFile) => ({
  code: NOT_SUPPORTED_IN_MVP_CODE,
  severity: "error",
  message: `The ${commandName} command is not supported in the MVP placeholder CLI shell.`,
  context: {
    commandName,
    ...assignmentFile === void 0 ? {} : { assignmentFile }
  }
});
var createMissingRequiredFileDiagnostic = (fileName, startDirectory) => ({
  code: MISSING_REQUIRED_FILE_CODE,
  severity: "error",
  message: `Missing required file ${fileName}; could not find it in ${startDirectory} or any parent directory.`,
  context: {
    fileName,
    startDirectory
  }
});
var createInvalidYamlDiagnostic = (filePath, reason) => ({
  code: INVALID_YAML_CODE,
  severity: "error",
  message: `Invalid YAML in ${filePath}: ${reason}`,
  context: {
    filePath,
    reason
  }
});
var createConfigDiagnostic = (code, message, context) => ({
  code,
  severity: "error",
  message,
  ...context === void 0 ? {} : { context }
});
var createWarningDiagnostic = (code, message, context) => ({
  code,
  severity: "warning",
  message,
  ...context === void 0 ? {} : { context }
});

// src/config/github-config-validation.ts
var TEMPLATE_REPOSITORY_SEGMENTS = 2;
var hasBlankSegment = (segments) => segments.some((segment) => segment.trim().length === 0);
var parseTemplateRepository = (configuredOrganization, repository) => {
  const segments = repository.split("/");
  if (segments.length === TEMPLATE_REPOSITORY_SEGMENTS && !hasBlankSegment(segments)) {
    const [owner, repo] = segments;
    return {
      status: "success",
      repository: {
        owner,
        repo,
        fullName: `${owner}/${repo}`
      }
    };
  }
  return {
    status: "failure",
    diagnostic: createConfigDiagnostic(
      DiagnosticCode.InvalidTemplateRepository,
      `Template repository ${repository} must be specified as owner/repo.`,
      {
        repository,
        organization: configuredOrganization
      }
    )
  };
};

// src/diagnostics/redaction.ts
var REDACTED_VALUE = "[REDACTED]";
var GITHUB_TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,})\b/g;
var SENSITIVE_KEY_PARTS = ["token", "authorization", "password", "secret", "apikey"];
var KEY_SEPARATOR_PATTERN = /[-_]/g;
var redactString = (value) => value.replace(GITHUB_TOKEN_PATTERN, REDACTED_VALUE);
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isSensitiveKey = (key) => {
  const normalizedKey = key.replace(KEY_SEPARATOR_PATTERN, "").toLowerCase();
  return SENSITIVE_KEY_PARTS.some((keyPart) => normalizedKey.includes(keyPart));
};
var redactValue = (value) => {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        isSensitiveKey(key) ? REDACTED_VALUE : redactValue(entryValue)
      ])
    );
  }
  return value;
};
var redactCommandResult = (result) => redactValue(result);

// src/github/github-errors.ts
var DIAGNOSTIC_CODE_BY_KIND = {
  auth_missing: DiagnosticCode.GithubAuthMissing,
  auth_failed: DiagnosticCode.GithubAuthFailed,
  permission_denied: DiagnosticCode.GithubPermissionDenied,
  rate_limited: DiagnosticCode.GithubRateLimited,
  network_error: DiagnosticCode.GithubNetworkError,
  api_error: DiagnosticCode.GithubApiError,
  timeout: DiagnosticCode.GithubNetworkError
};
var RETRYABLE_ERROR_KINDS = /* @__PURE__ */ new Set([
  "rate_limited",
  "network_error",
  "api_error",
  "timeout"
]);
var GitHubClientError = class extends Error {
  kind;
  diagnosticCode;
  retryAfterSeconds;
  retryable;
  constructor(kind, message, options) {
    super(redactString(message));
    this.name = "GitHubClientError";
    this.kind = kind;
    this.diagnosticCode = DIAGNOSTIC_CODE_BY_KIND[kind];
    this.retryable = RETRYABLE_ERROR_KINDS.has(kind);
    if (options?.retryAfterSeconds !== void 0) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var isRetryableGitHubError = (error) => error.retryable;
var createGitHubDiagnostic = (error) => ({
  code: error.diagnosticCode,
  severity: "error",
  message: error.message,
  context: {
    kind: error.kind,
    retryable: error.retryable,
    ...error.retryAfterSeconds === void 0 ? {} : { retryAfterSeconds: error.retryAfterSeconds }
  }
});

// src/io/stable-yaml.ts
import { parseDocument } from "yaml";
var parseYaml = (content, filePath) => {
  const document = parseDocument(content, {
    strict: true
  });
  if (document.errors.length > 0) {
    return {
      status: "failure",
      diagnostic: createInvalidYamlDiagnostic(
        filePath,
        document.errors[0]?.message ?? "Invalid YAML."
      )
    };
  }
  return {
    status: "success",
    value: document.toJSON()
  };
};

// src/workflows/workflow-dispatch-validation.ts
var WORKFLOW_DISPATCH_TRIGGER = "workflow_dispatch";
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var hasWorkflowDispatchString = (value) => typeof value === "string" && value === WORKFLOW_DISPATCH_TRIGGER;
var hasWorkflowDispatchArray = (value) => Array.isArray(value) && value.some((item) => hasWorkflowDispatchString(item));
var hasWorkflowDispatchObject = (value) => isRecord2(value) && Object.hasOwn(value, WORKFLOW_DISPATCH_TRIGGER);
var hasWorkflowDispatchTrigger = (workflowDocument) => {
  if (!isRecord2(workflowDocument)) {
    return false;
  }
  const triggers = workflowDocument.on;
  return hasWorkflowDispatchString(triggers) || hasWorkflowDispatchArray(triggers) || hasWorkflowDispatchObject(triggers);
};

// src/assignment-detail/assignment-detail-github-readiness.ts
var STATUS_AVAILABLE = "available";
var STATUS_MISSING = "missing";
var STATUS_INACCESSIBLE = "inaccessible";
var STATUS_BRANCH_MISSING = "branch_missing";
var STATUS_TOKEN_REQUIRED = "token_required";
var STATUS_NOT_CHECKED = "not_checked";
var STATUS_NOT_REQUIRED = "not_required";
var STATUS_ERROR = "error";
var createTokenRequiredDiagnostic = (config) => createConfigDiagnostic(
  GITHUB_TOKEN_REQUIRED_CODE,
  "GRAIDER_GITHUB_TOKEN is required to check assignment GitHub readiness.",
  {
    assignmentFile: config.summary.assignmentConfigPath,
    templateRepository: config.assignment.template.repository,
    templateBranch: config.assignment.template.branch,
    ...config.assignment.grading?.workflow === void 0 ? {} : { workflow: config.assignment.grading.workflow }
  }
);
var mapGitHubErrorCode = (error) => {
  if (error.kind === "auth_missing" || error.kind === "auth_failed") {
    return ASSIGNMENT_DETAIL_GITHUB_AUTH_FAILED_CODE;
  }
  if (error.kind === "permission_denied") {
    return ASSIGNMENT_DETAIL_GITHUB_PERMISSION_DENIED_CODE;
  }
  if (error.kind === "rate_limited") {
    return ASSIGNMENT_DETAIL_GITHUB_RATE_LIMITED_CODE;
  }
  return ASSIGNMENT_DETAIL_GITHUB_REQUEST_FAILED_CODE;
};
var mapGitHubErrorStatus = (error) => {
  if (error.kind === "auth_missing" || error.kind === "auth_failed" || error.kind === "permission_denied") {
    return STATUS_INACCESSIBLE;
  }
  return STATUS_ERROR;
};
var createGitHubDiagnostic2 = (error, message, context) => {
  if (error instanceof GitHubClientError) {
    return createConfigDiagnostic(mapGitHubErrorCode(error), `${message}: ${error.message}`, {
      ...context,
      kind: error.kind,
      retryable: error.retryable,
      ...error.retryAfterSeconds === void 0 ? {} : { retryAfterSeconds: error.retryAfterSeconds }
    });
  }
  return createConfigDiagnostic(ASSIGNMENT_DETAIL_GITHUB_REQUEST_FAILED_CODE, message, context);
};
var createTemplateRepositoryMissingDiagnostic = (config) => createConfigDiagnostic(
  ASSIGNMENT_DETAIL_TEMPLATE_REPOSITORY_MISSING_CODE,
  `Template repository ${config.assignment.template.repository} was not found.`,
  {
    assignmentFile: config.summary.assignmentConfigPath,
    templateRepository: config.assignment.template.repository
  }
);
var createTemplateBranchMissingDiagnostic = (config) => createConfigDiagnostic(
  ASSIGNMENT_DETAIL_TEMPLATE_BRANCH_MISSING_CODE,
  `Template branch ${config.assignment.template.branch} was not found.`,
  {
    assignmentFile: config.summary.assignmentConfigPath,
    templateRepository: config.assignment.template.repository,
    templateBranch: config.assignment.template.branch
  }
);
var createGradingWorkflowMissingDiagnostic = (config, workflowPath) => createConfigDiagnostic(
  ASSIGNMENT_DETAIL_GRADING_WORKFLOW_MISSING_CODE,
  `Configured grading workflow ${workflowPath} was not found in the template repository.`,
  {
    assignmentFile: config.summary.assignmentConfigPath,
    templateRepository: config.assignment.template.repository,
    templateBranch: config.assignment.template.branch,
    workflow: workflowPath,
    checkedPath: workflowPath
  }
);
var createWorkflowDispatchMissingDiagnostic = (config, workflowPath) => createConfigDiagnostic(
  ASSIGNMENT_DETAIL_WORKFLOW_DISPATCH_MISSING_CODE,
  `Configured grading workflow ${workflowPath} does not define workflow_dispatch.`,
  {
    assignmentFile: config.summary.assignmentConfigPath,
    templateRepository: config.assignment.template.repository,
    templateBranch: config.assignment.template.branch,
    workflow: workflowPath,
    checkedPath: workflowPath
  }
);
var createTokenRequiredResult = (config, template, grading) => ({
  template: {
    ...template,
    status: STATUS_TOKEN_REQUIRED,
    repositoryStatus: STATUS_TOKEN_REQUIRED,
    branchStatus: STATUS_TOKEN_REQUIRED
  },
  grading: {
    ...grading,
    workflowStatus: grading.enabled ? STATUS_TOKEN_REQUIRED : STATUS_NOT_REQUIRED,
    workflowDispatch: grading.enabled ? STATUS_TOKEN_REQUIRED : STATUS_NOT_REQUIRED
  },
  diagnostics: [createTokenRequiredDiagnostic(config)]
});
var withTemplateStatus = (template, repositoryStatus, branchStatus) => ({
  ...template,
  repositoryStatus,
  branchStatus,
  status: repositoryStatus === STATUS_AVAILABLE ? branchStatus === STATUS_AVAILABLE ? STATUS_AVAILABLE : branchStatus : repositoryStatus
});
var withWorkflowStatus = (grading, workflowStatus, workflowDispatch) => ({
  ...grading,
  workflowStatus,
  workflowDispatch
});
var inspectWorkflowDispatch = (config, workflowPath, workflowContent) => {
  const parseResult = parseYaml(workflowContent, workflowPath);
  if (parseResult.status === "failure") {
    return {
      dispatchStatus: STATUS_ERROR,
      diagnostics: [
        {
          ...parseResult.diagnostic,
          context: {
            ...parseResult.diagnostic.context ?? {},
            assignmentFile: config.summary.assignmentConfigPath,
            templateRepository: config.assignment.template.repository,
            templateBranch: config.assignment.template.branch,
            workflow: workflowPath
          }
        }
      ]
    };
  }
  if (!hasWorkflowDispatchTrigger(parseResult.value)) {
    return {
      dispatchStatus: STATUS_MISSING,
      diagnostics: [createWorkflowDispatchMissingDiagnostic(config, workflowPath)]
    };
  }
  return {
    dispatchStatus: STATUS_AVAILABLE,
    diagnostics: []
  };
};
var checkWorkflow = async (config, grading, githubClient, owner, repo, branch) => {
  if (!grading.enabled || grading.workflow === null) {
    return {
      grading: withWorkflowStatus(grading, STATUS_NOT_REQUIRED, STATUS_NOT_REQUIRED),
      diagnostics: []
    };
  }
  try {
    const workflowContent = await githubClient.getRepositoryFileContent(
      owner,
      repo,
      grading.workflow,
      branch
    );
    if (workflowContent === null) {
      return {
        grading: withWorkflowStatus(grading, STATUS_MISSING, STATUS_NOT_CHECKED),
        diagnostics: [createGradingWorkflowMissingDiagnostic(config, grading.workflow)]
      };
    }
    const dispatchResult = inspectWorkflowDispatch(config, grading.workflow, workflowContent);
    return {
      grading: withWorkflowStatus(grading, STATUS_AVAILABLE, dispatchResult.dispatchStatus),
      diagnostics: dispatchResult.diagnostics
    };
  } catch (error) {
    const status = error instanceof GitHubClientError ? mapGitHubErrorStatus(error) : STATUS_ERROR;
    return {
      grading: withWorkflowStatus(grading, status, status),
      diagnostics: [
        createGitHubDiagnostic2(error, `Could not check grading workflow ${grading.workflow}.`, {
          assignmentFile: config.summary.assignmentConfigPath,
          templateRepository: config.assignment.template.repository,
          templateBranch: config.assignment.template.branch,
          workflow: grading.workflow,
          checkedPath: grading.workflow
        })
      ]
    };
  }
};
var checkAssignmentDetailGithubReadiness = async ({
  config,
  template,
  grading,
  githubClient
}) => {
  if (githubClient === void 0) {
    return createTokenRequiredResult(config, template, grading);
  }
  const parsedRepository = parseTemplateRepository(
    config.course.github.organization,
    config.assignment.template.repository
  );
  if (parsedRepository.status === "failure") {
    return {
      template: withTemplateStatus(template, STATUS_ERROR, STATUS_ERROR),
      grading: withWorkflowStatus(grading, STATUS_ERROR, STATUS_ERROR),
      diagnostics: [parsedRepository.diagnostic]
    };
  }
  const { owner, repo } = parsedRepository.repository;
  try {
    const templateRepository = await githubClient.getTemplateRepository(owner, repo);
    if (templateRepository === null) {
      return {
        template: withTemplateStatus(template, STATUS_MISSING, STATUS_NOT_CHECKED),
        grading: withWorkflowStatus(
          grading,
          grading.enabled ? STATUS_NOT_CHECKED : STATUS_NOT_REQUIRED,
          grading.enabled ? STATUS_NOT_CHECKED : STATUS_NOT_REQUIRED
        ),
        diagnostics: [createTemplateRepositoryMissingDiagnostic(config)]
      };
    }
    if (!templateRepository.branches.some((branch) => branch === config.assignment.template.branch)) {
      return {
        template: withTemplateStatus(template, STATUS_AVAILABLE, STATUS_BRANCH_MISSING),
        grading: withWorkflowStatus(
          grading,
          grading.enabled ? STATUS_NOT_CHECKED : STATUS_NOT_REQUIRED,
          grading.enabled ? STATUS_NOT_CHECKED : STATUS_NOT_REQUIRED
        ),
        diagnostics: [createTemplateBranchMissingDiagnostic(config)]
      };
    }
    const workflowResult = await checkWorkflow(
      config,
      grading,
      githubClient,
      owner,
      repo,
      config.assignment.template.branch
    );
    return {
      template: withTemplateStatus(template, STATUS_AVAILABLE, STATUS_AVAILABLE),
      grading: workflowResult.grading,
      diagnostics: workflowResult.diagnostics
    };
  } catch (error) {
    const status = error instanceof GitHubClientError ? mapGitHubErrorStatus(error) : STATUS_ERROR;
    return {
      template: withTemplateStatus(template, status, status),
      grading: withWorkflowStatus(
        grading,
        grading.enabled ? status : STATUS_NOT_REQUIRED,
        grading.enabled ? status : STATUS_NOT_REQUIRED
      ),
      diagnostics: [
        createGitHubDiagnostic2(error, "Could not check template repository readiness.", {
          assignmentFile: config.summary.assignmentConfigPath,
          templateRepository: config.assignment.template.repository,
          templateBranch: config.assignment.template.branch
        })
      ]
    };
  }
};

// src/config/config-loader.ts
import path3 from "path";

// src/config/config-schemas.ts
import { z } from "zod";
var MINIMUM_LIST_ITEMS = 1;
var SUPPORTED_SCHEMA_VERSION = 1;
var SUPPORTED_ASSIGNMENT_TYPE = "individual";
var SUPPORTED_REPOSITORY_VISIBILITY = "private";
var STUDENT_PERMISSION = "push";
var FACULTY_PERMISSION = "admin";
var GRADER_PERMISSION = "maintain";
var VALID_ASSIGNMENT_STATUSES = ["draft", "active", "closed", "archived"];
var ENABLED_GRADING_MODES = ["preset", "custom-workflow", "contract-only"];
var DISABLED_GRADING_MODE = "no-grading";
var SUPPORTED_GRADING_PRESETS = ["java-junit-checkstyle"];
var ENABLED_STUDENT_PUBLISH_MODES = [
  "graider-generated",
  "faculty-provided",
  "both"
];
var DISABLED_STUDENT_PUBLISH_MODE = "disabled";
var TERM_CODE_PATTERN = /^\d{2}s[123]$/;
var gradingSchema = z.object({
  enabled: z.boolean(),
  mode: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  preset: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  workflow: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  artifact: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  result_file: z.string().min(MINIMUM_LIST_ITEMS).optional()
}).strict();
var studentPublishSchema = z.object({
  enabled: z.boolean(),
  mode: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  source: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  artifact: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  source_file: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  destination_file: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  graider_report_destination: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  faculty_report_source: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  faculty_report_destination: z.string().min(MINIMUM_LIST_ITEMS).optional()
}).strict();
var reportsSchema = z.object({
  formats: z.array(z.string().min(MINIMUM_LIST_ITEMS)).min(MINIMUM_LIST_ITEMS),
  student_publish: studentPublishSchema.optional()
}).strict();
var studentAccessPagesSchema = z.object({
  repository: z.string().regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u),
  base_url: z.url().refine((value) => new URL(value).protocol === "https:"),
  branch: z.string().min(MINIMUM_LIST_ITEMS).default("main")
}).strict();
var notificationsSchema = z.object({
  student_access_pages: studentAccessPagesSchema.optional()
}).strict();
var rawCourseConfigSchema = z.object({
  schema_version: z.number(),
  course: z.object({
    code: z.string().min(MINIMUM_LIST_ITEMS),
    title: z.string().min(MINIMUM_LIST_ITEMS),
    repository: z.string().min(MINIMUM_LIST_ITEMS)
  }).strict(),
  github: z.object({
    organization: z.string().min(MINIMUM_LIST_ITEMS),
    repository_visibility: z.string().min(MINIMUM_LIST_ITEMS),
    repo_name_pattern: z.string().min(MINIMUM_LIST_ITEMS),
    student_permission: z.string().min(MINIMUM_LIST_ITEMS),
    faculty_team: z.string().min(MINIMUM_LIST_ITEMS),
    faculty_permission: z.string().min(MINIMUM_LIST_ITEMS),
    grader_team: z.string().min(MINIMUM_LIST_ITEMS),
    grader_permission: z.string().min(MINIMUM_LIST_ITEMS)
  }).strict(),
  defaults: z.object({
    timezone: z.string().min(MINIMUM_LIST_ITEMS),
    assignment_type: z.string().min(MINIMUM_LIST_ITEMS)
  }).strict(),
  grading: gradingSchema,
  reports: reportsSchema,
  notifications: notificationsSchema.optional()
}).strict();
var rawTermConfigSchema = z.object({
  schema_version: z.number(),
  term: z.object({
    code: z.string().min(MINIMUM_LIST_ITEMS),
    academic_year: z.number(),
    semester: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    display_name: z.string().min(MINIMUM_LIST_ITEMS)
  }).strict(),
  sections: z.array(
    z.object({
      id: z.string().min(MINIMUM_LIST_ITEMS),
      roster: z.string().min(MINIMUM_LIST_ITEMS)
    }).strict()
  ).min(MINIMUM_LIST_ITEMS)
}).strict();
var rawAssignmentConfigSchema = z.object({
  schema_version: z.number(),
  assignment: z.object({
    slug: z.string().min(MINIMUM_LIST_ITEMS),
    title: z.string().min(MINIMUM_LIST_ITEMS),
    type: z.string().min(MINIMUM_LIST_ITEMS),
    status: z.string().min(MINIMUM_LIST_ITEMS)
  }).strict(),
  template: z.object({
    repository: z.string().min(MINIMUM_LIST_ITEMS),
    branch: z.string().min(MINIMUM_LIST_ITEMS)
  }).strict(),
  sections: z.array(z.string().min(MINIMUM_LIST_ITEMS)).min(MINIMUM_LIST_ITEMS),
  deadline: z.object({
    due_at: z.string().min(MINIMUM_LIST_ITEMS),
    late_policy: z.string().min(MINIMUM_LIST_ITEMS)
  }).strict(),
  metadata: z.object({
    faculty_owner: z.string().min(MINIMUM_LIST_ITEMS),
    lms_assignment_id: z.string().nullable(),
    grading_category: z.string().min(MINIMUM_LIST_ITEMS),
    points: z.number().nullable()
  }).strict(),
  grading: gradingSchema.optional(),
  repository_mode: z.enum(["individual", "group"]).optional(),
  groups: z.object({
    file: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/u)
  }).strict().optional()
}).strict();

// src/config/config-validation.ts
var PATH_SEPARATOR = ".";
var WORKFLOW_GRADING_FIELDS = ["workflow", "artifact", "result_file"];
var LEGACY_GRADING_MODE = "custom-workflow";
var PRESET_GRADING_MODE = "preset";
var GRAIDER_GENERATED_STUDENT_PUBLISH_MODE = "graider-generated";
var FACULTY_PROVIDED_STUDENT_PUBLISH_MODE = "faculty-provided";
var formatIssuePath = (issue) => issue.path.map((part) => String(part)).join(PATH_SEPARATOR);
var mapZodIssueToDiagnostic = (filePath, issue) => {
  const field = formatIssuePath(issue);
  return createConfigDiagnostic(
    MISSING_REQUIRED_FIELD_CODE,
    `Missing or invalid required field ${field} in ${filePath}.`,
    {
      filePath,
      field,
      reason: issue.message
    }
  );
};
var validateRawConfigSchema = (filePath, schema, value) => {
  const result = schema.safeParse(value);
  if (result.success) {
    return {
      status: "success",
      value: result.data,
      diagnostics: []
    };
  }
  return {
    status: "failure",
    diagnostics: result.error.issues.map((issue) => mapZodIssueToDiagnostic(filePath, issue))
  };
};
var createInvalidSchemaVersionDiagnostic = (filePath, schemaVersion) => createConfigDiagnostic(
  INVALID_SCHEMA_VERSION_CODE,
  `Unsupported schema_version ${String(schemaVersion)} in ${filePath}.`,
  {
    filePath,
    schemaVersion,
    supportedSchemaVersion: SUPPORTED_SCHEMA_VERSION
  }
);
var validateSchemaVersion = (filePath, schemaVersion) => schemaVersion === SUPPORTED_SCHEMA_VERSION ? [] : [createInvalidSchemaVersionDiagnostic(filePath, schemaVersion)];
var hasAnyWorkflowField = (grading) => WORKFLOW_GRADING_FIELDS.some((field) => grading[field] !== void 0);
var hasAllWorkflowFields = (grading) => WORKFLOW_GRADING_FIELDS.every((field) => grading[field] !== void 0);
var createMissingGradingFieldDiagnostic = (filePath, owner, code, field) => createConfigDiagnostic(code, `Enabled grading in ${filePath} must include ${field}.`, {
  filePath,
  owner,
  field
});
var validateEnabledGradingFields = (filePath, grading, owner) => {
  if (grading.workflow === void 0) {
    return [
      createMissingGradingFieldDiagnostic(
        filePath,
        owner,
        MISSING_GRADING_WORKFLOW_CODE,
        "workflow"
      )
    ];
  }
  if (grading.artifact === void 0) {
    return [
      createMissingGradingFieldDiagnostic(
        filePath,
        owner,
        MISSING_GRADING_ARTIFACT_CODE,
        "artifact"
      )
    ];
  }
  if (grading.result_file === void 0) {
    return [
      createMissingGradingFieldDiagnostic(
        filePath,
        owner,
        MISSING_GRADING_RESULT_FILE_CODE,
        "result_file"
      )
    ];
  }
  return [];
};
var validatePresetGrading = (filePath, grading, owner) => {
  if (grading.preset === void 0) {
    return [
      createConfigDiagnostic(
        MISSING_GRADING_PRESET_CODE,
        `Preset grading in ${filePath} must include preset.`,
        {
          filePath,
          owner
        }
      )
    ];
  }
  return SUPPORTED_GRADING_PRESETS.some((preset) => preset === grading.preset) ? [] : [
    createConfigDiagnostic(
      UNSUPPORTED_GRADING_PRESET_CODE,
      `Unsupported grading preset ${grading.preset} in ${filePath}.`,
      {
        filePath,
        owner,
        preset: grading.preset,
        supportedPresets: SUPPORTED_GRADING_PRESETS
      }
    )
  ];
};
var validateEnabledGradingConfig = (filePath, grading, owner) => {
  const mode = grading.mode ?? LEGACY_GRADING_MODE;
  if (!ENABLED_GRADING_MODES.some((supportedMode) => supportedMode === mode)) {
    return [
      createConfigDiagnostic(
        UNSUPPORTED_GRADING_MODE_CODE,
        `Unsupported grading mode ${mode} in ${filePath}.`,
        {
          filePath,
          owner,
          mode,
          supportedModes: ENABLED_GRADING_MODES
        }
      )
    ];
  }
  if (grading.mode === void 0 && !hasAllWorkflowFields(grading)) {
    return [
      createConfigDiagnostic(
        INVALID_GRADING_CONFIG_CODE,
        `Enabled grading in ${filePath} must include workflow, artifact, and result_file.`,
        {
          filePath,
          owner
        }
      )
    ];
  }
  const fieldDiagnostics = validateEnabledGradingFields(filePath, grading, owner);
  if (fieldDiagnostics.length > 0) {
    return fieldDiagnostics;
  }
  return mode === PRESET_GRADING_MODE ? validatePresetGrading(filePath, grading, owner) : [];
};
var validateDisabledGradingConfig = (filePath, grading, owner) => {
  if (grading.mode !== void 0 && grading.mode !== DISABLED_GRADING_MODE) {
    return [
      createConfigDiagnostic(
        UNSUPPORTED_GRADING_MODE_CODE,
        `Disabled grading in ${filePath} must omit mode or use ${DISABLED_GRADING_MODE}.`,
        {
          filePath,
          owner,
          mode: grading.mode,
          supportedModes: [DISABLED_GRADING_MODE]
        }
      )
    ];
  }
  if (hasAnyWorkflowField(grading)) {
    return [
      createConfigDiagnostic(
        INVALID_GRADING_CONFIG_CODE,
        `Disabled grading in ${filePath} must not include workflow, artifact, or result_file.`,
        {
          filePath,
          owner
        }
      )
    ];
  }
  return [];
};
var validateGradingConfig = (filePath, grading, owner) => grading.enabled ? validateEnabledGradingConfig(filePath, grading, owner) : validateDisabledGradingConfig(filePath, grading, owner);
var createMissingStudentPublishFieldDiagnostic = (filePath, code, field) => createConfigDiagnostic(code, `Student report publishing in ${filePath} must include ${field}.`, {
  filePath,
  field
});
var validateGraiderGeneratedStudentPublish = (filePath, studentPublish) => studentPublish.destination_file === void 0 ? [
  createMissingStudentPublishFieldDiagnostic(
    filePath,
    MISSING_STUDENT_PUBLISH_DESTINATION_CODE,
    "destination_file"
  )
] : [];
var validateFacultyProvidedStudentPublish = (filePath, studentPublish) => {
  if (studentPublish.artifact === void 0) {
    return [
      createMissingStudentPublishFieldDiagnostic(
        filePath,
        MISSING_STUDENT_PUBLISH_ARTIFACT_CODE,
        "artifact"
      )
    ];
  }
  if (studentPublish.source_file === void 0) {
    return [
      createMissingStudentPublishFieldDiagnostic(
        filePath,
        MISSING_STUDENT_PUBLISH_SOURCE_FILE_CODE,
        "source_file"
      )
    ];
  }
  if (studentPublish.destination_file === void 0) {
    return [
      createMissingStudentPublishFieldDiagnostic(
        filePath,
        MISSING_STUDENT_PUBLISH_DESTINATION_CODE,
        "destination_file"
      )
    ];
  }
  return [];
};
var validateBothStudentPublish = (filePath, studentPublish) => {
  if (studentPublish.artifact === void 0) {
    return [
      createMissingStudentPublishFieldDiagnostic(
        filePath,
        MISSING_STUDENT_PUBLISH_ARTIFACT_CODE,
        "artifact"
      )
    ];
  }
  if (studentPublish.graider_report_destination === void 0) {
    return [
      createMissingStudentPublishFieldDiagnostic(
        filePath,
        MISSING_GRAIDER_REPORT_DESTINATION_CODE,
        "graider_report_destination"
      )
    ];
  }
  if (studentPublish.faculty_report_source === void 0) {
    return [
      createMissingStudentPublishFieldDiagnostic(
        filePath,
        MISSING_FACULTY_REPORT_SOURCE_CODE,
        "faculty_report_source"
      )
    ];
  }
  if (studentPublish.faculty_report_destination === void 0) {
    return [
      createMissingStudentPublishFieldDiagnostic(
        filePath,
        MISSING_FACULTY_REPORT_DESTINATION_CODE,
        "faculty_report_destination"
      )
    ];
  }
  return [];
};
var validateEnabledStudentPublishConfig = (filePath, studentPublish) => {
  const mode = studentPublish.mode;
  if (mode === void 0 || !ENABLED_STUDENT_PUBLISH_MODES.some((item) => item === mode)) {
    return [
      createConfigDiagnostic(
        UNSUPPORTED_STUDENT_PUBLISH_MODE_CODE,
        `Unsupported student report publishing mode ${String(mode)} in ${filePath}.`,
        {
          filePath,
          mode,
          supportedModes: ENABLED_STUDENT_PUBLISH_MODES
        }
      )
    ];
  }
  if (mode === GRAIDER_GENERATED_STUDENT_PUBLISH_MODE) {
    return validateGraiderGeneratedStudentPublish(filePath, studentPublish);
  }
  if (mode === FACULTY_PROVIDED_STUDENT_PUBLISH_MODE) {
    return validateFacultyProvidedStudentPublish(filePath, studentPublish);
  }
  return validateBothStudentPublish(filePath, studentPublish);
};
var validateDisabledStudentPublishConfig = (filePath, studentPublish) => studentPublish.mode === void 0 || studentPublish.mode === DISABLED_STUDENT_PUBLISH_MODE ? [] : [
  createConfigDiagnostic(
    UNSUPPORTED_STUDENT_PUBLISH_MODE_CODE,
    `Disabled student report publishing in ${filePath} must omit mode or use ${DISABLED_STUDENT_PUBLISH_MODE}.`,
    {
      filePath,
      mode: studentPublish.mode,
      supportedModes: [DISABLED_STUDENT_PUBLISH_MODE]
    }
  )
];
var validateStudentPublishConfig = (filePath, reports) => {
  if (reports.student_publish === void 0) {
    return [];
  }
  return reports.student_publish.enabled ? validateEnabledStudentPublishConfig(filePath, reports.student_publish) : validateDisabledStudentPublishConfig(filePath, reports.student_publish);
};
var validateCourseConfig = (filePath, config) => [
  ...validateSchemaVersion(filePath, config.schema_version),
  ...config.github.repository_visibility === SUPPORTED_REPOSITORY_VISIBILITY ? [] : [
    createConfigDiagnostic(
      INVALID_REPOSITORY_VISIBILITY_CODE,
      `github.repository_visibility must be ${SUPPORTED_REPOSITORY_VISIBILITY}.`,
      {
        filePath,
        value: config.github.repository_visibility
      }
    )
  ],
  ...config.github.student_permission === STUDENT_PERMISSION && config.github.faculty_permission === FACULTY_PERMISSION && config.github.grader_permission === GRADER_PERMISSION ? [] : [
    createConfigDiagnostic(
      INVALID_PERMISSION_CODE,
      "One or more GitHub permissions are invalid.",
      {
        filePath,
        studentPermission: config.github.student_permission,
        facultyPermission: config.github.faculty_permission,
        graderPermission: config.github.grader_permission
      }
    )
  ],
  ...config.defaults.assignment_type === SUPPORTED_ASSIGNMENT_TYPE ? [] : [
    createConfigDiagnostic(
      INVALID_ASSIGNMENT_TYPE_CODE,
      `defaults.assignment_type must be ${SUPPORTED_ASSIGNMENT_TYPE}.`,
      {
        filePath,
        value: config.defaults.assignment_type
      }
    )
  ],
  ...validateGradingConfig(filePath, config.grading, "course"),
  ...validateStudentPublishConfig(filePath, config.reports)
];
var validateTermConfig = (filePath, config, expectedTermCode) => [
  ...validateSchemaVersion(filePath, config.schema_version),
  ...config.term.code === expectedTermCode ? [] : [
    createConfigDiagnostic(
      TERM_CODE_MISMATCH_CODE,
      "term.code must match the term folder name.",
      {
        filePath,
        expectedTermCode,
        actualTermCode: config.term.code
      }
    )
  ],
  ...TERM_CODE_PATTERN.test(config.term.code) ? [] : [
    createConfigDiagnostic(INVALID_TERM_CODE_CODE, "term.code must use YYsN format.", {
      filePath,
      value: config.term.code
    })
  ]
];
var validateAssignmentConfig = (filePath, config, expectedAssignmentSlug) => [
  ...validateSchemaVersion(filePath, config.schema_version),
  ...config.assignment.slug === expectedAssignmentSlug ? [] : [
    createConfigDiagnostic(
      ASSIGNMENT_SLUG_MISMATCH_CODE,
      "assignment.slug must match the assignment folder name.",
      {
        filePath,
        expectedAssignmentSlug,
        actualAssignmentSlug: config.assignment.slug
      }
    )
  ],
  ...config.assignment.type === SUPPORTED_ASSIGNMENT_TYPE ? [] : [
    createConfigDiagnostic(
      INVALID_ASSIGNMENT_TYPE_CODE,
      `assignment.type must be ${SUPPORTED_ASSIGNMENT_TYPE}.`,
      {
        filePath,
        value: config.assignment.type
      }
    )
  ],
  ...VALID_ASSIGNMENT_STATUSES.some((status) => status === config.assignment.status) ? [] : [
    createConfigDiagnostic(
      INVALID_ASSIGNMENT_STATUS_CODE,
      "assignment.status must be draft, active, closed, or archived.",
      {
        filePath,
        value: config.assignment.status
      }
    )
  ],
  ...config.grading === void 0 ? [] : validateGradingConfig(filePath, config.grading, "assignment")
];

// src/io/file-system.ts
import fs from "fs";
var readTextFile = (filePath) => {
  try {
    return {
      status: "success",
      content: fs.readFileSync(filePath, "utf8")
    };
  } catch {
    return {
      status: "failure",
      diagnostic: createMissingRequiredFileDiagnostic(filePath, filePath)
    };
  }
};

// src/config/load-assignment-config.ts
var loadAssignmentConfig = (filePath) => {
  const fileResult = readTextFile(filePath);
  if (fileResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [fileResult.diagnostic]
    };
  }
  const yamlResult = parseYaml(fileResult.content, filePath);
  if (yamlResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [yamlResult.diagnostic]
    };
  }
  return validateRawConfigSchema(filePath, rawAssignmentConfigSchema, yamlResult.value);
};

// src/config/load-course-config.ts
var loadCourseConfig = (filePath) => {
  const fileResult = readTextFile(filePath);
  if (fileResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [fileResult.diagnostic]
    };
  }
  const yamlResult = parseYaml(fileResult.content, filePath);
  if (yamlResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [yamlResult.diagnostic]
    };
  }
  return validateRawConfigSchema(filePath, rawCourseConfigSchema, yamlResult.value);
};

// src/config/load-term-config.ts
var loadTermConfig = (filePath) => {
  const fileResult = readTextFile(filePath);
  if (fileResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [fileResult.diagnostic]
    };
  }
  const yamlResult = parseYaml(fileResult.content, filePath);
  if (yamlResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [yamlResult.diagnostic]
    };
  }
  return validateRawConfigSchema(filePath, rawTermConfigSchema, yamlResult.value);
};

// src/core/paths.ts
import path from "path";
var WINDOWS_SEPARATOR_PATTERN = /\\/g;
var PARENT_DIRECTORY_REFERENCE = "..";
var OUTSIDE_REPOSITORY_ROOT_MESSAGE = "Path is outside the repository root.";
var resolveAssignmentPath = (cwd, assignmentPath) => path.resolve(cwd, assignmentPath);
var toForwardSlashPath = (pathValue) => pathValue.replace(WINDOWS_SEPARATOR_PATTERN, "/");
var toRepositoryRelativePath = (repoRoot, absolutePath) => {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const resolvedPath = path.resolve(absolutePath);
  const relativePath = path.relative(resolvedRepoRoot, resolvedPath);
  if (relativePath === PARENT_DIRECTORY_REFERENCE || relativePath.startsWith(`${PARENT_DIRECTORY_REFERENCE}${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(OUTSIDE_REPOSITORY_ROOT_MESSAGE);
  }
  return toForwardSlashPath(relativePath);
};

// src/core/repo-root.ts
import fs2 from "fs";
import path2 from "path";
var COURSE_CONFIG_FILE_NAME = "course.yml";
var isFile = (filePath) => {
  try {
    return fs2.statSync(filePath).isFile();
  } catch {
    return false;
  }
};
var findRepositoryRootFromDirectory = (currentDirectory, startDirectory) => {
  const courseConfigPath = path2.join(currentDirectory, COURSE_CONFIG_FILE_NAME);
  if (isFile(courseConfigPath)) {
    return {
      found: true,
      repoRoot: currentDirectory
    };
  }
  const parentDirectory = path2.dirname(currentDirectory);
  if (parentDirectory === currentDirectory) {
    return {
      found: false,
      diagnostic: createMissingRequiredFileDiagnostic(COURSE_CONFIG_FILE_NAME, startDirectory)
    };
  }
  return findRepositoryRootFromDirectory(parentDirectory, startDirectory);
};
var findRepositoryRoot = (startDirectory) => {
  const resolvedStartDirectory = path2.resolve(startDirectory);
  return findRepositoryRootFromDirectory(resolvedStartDirectory, resolvedStartDirectory);
};

// src/config/config-loader.ts
var COURSE_CONFIG_PATH = "course.yml";
var TERMS_DIRECTORY = "terms";
var TERM_CONFIG_FILE_NAME = "term.yml";
var TERM_CODE_SEGMENT_INDEX = 1;
var ASSIGNMENT_SLUG_SEGMENT_INDEX = 3;
var getAssignmentPathParts = (assignmentRelativePath) => {
  const segments = assignmentRelativePath.split("/");
  const termCode = segments[TERM_CODE_SEGMENT_INDEX] ?? "";
  const assignmentSlug = segments[ASSIGNMENT_SLUG_SEGMENT_INDEX] ?? "";
  return {
    termCode,
    assignmentSlug,
    assignmentConfigPath: assignmentRelativePath,
    termConfigPath: `${TERMS_DIRECTORY}/${termCode}/${TERM_CONFIG_FILE_NAME}`
  };
};
var createFailure = (diagnostics) => ({
  status: "failure",
  diagnostics
});
var createConfigFilesFailure = (diagnostics) => ({
  status: "failure",
  diagnostics
});
var loadAllConfigFiles = (repoRoot, parts) => {
  const courseResult = loadCourseConfig(path3.join(repoRoot, COURSE_CONFIG_PATH));
  if (courseResult.status === "failure") {
    return createConfigFilesFailure(courseResult.diagnostics);
  }
  const termResult = loadTermConfig(path3.join(repoRoot, parts.termConfigPath));
  if (termResult.status === "failure") {
    return createConfigFilesFailure(termResult.diagnostics);
  }
  const assignmentResult = loadAssignmentConfig(path3.join(repoRoot, parts.assignmentConfigPath));
  if (assignmentResult.status === "failure") {
    return createConfigFilesFailure(assignmentResult.diagnostics);
  }
  return {
    status: "success",
    course: courseResult.value,
    term: termResult.value,
    assignment: assignmentResult.value
  };
};
var getGradingEnabled = (course, assignment) => assignment.grading === void 0 ? {
  gradingEnabled: course.grading.enabled,
  gradingSource: "course"
} : {
  gradingEnabled: assignment.grading.enabled,
  gradingSource: "assignment"
};
var createSummary = (repoRoot, parts, course, assignment) => ({
  repoRoot,
  courseConfigPath: COURSE_CONFIG_PATH,
  termConfigPath: parts.termConfigPath,
  assignmentConfigPath: parts.assignmentConfigPath,
  assignmentRelativePath: parts.assignmentConfigPath,
  termCode: parts.termCode,
  assignmentSlug: parts.assignmentSlug,
  ...getGradingEnabled(course, assignment)
});
var loadGraiderConfig = (request) => {
  const repositoryRootResult = findRepositoryRoot(request.cwd);
  if (!repositoryRootResult.found) {
    return createFailure([repositoryRootResult.diagnostic]);
  }
  const assignmentPath = resolveAssignmentPath(request.cwd, request.assignmentFile);
  const assignmentRelativePath = toRepositoryRelativePath(
    repositoryRootResult.repoRoot,
    assignmentPath
  );
  const parts = getAssignmentPathParts(assignmentRelativePath);
  const loadResult = loadAllConfigFiles(repositoryRootResult.repoRoot, parts);
  if (loadResult.status === "failure") {
    return createFailure(loadResult.diagnostics);
  }
  const diagnostics = [
    ...validateCourseConfig(COURSE_CONFIG_PATH, loadResult.course),
    ...validateTermConfig(parts.termConfigPath, loadResult.term, parts.termCode),
    ...validateAssignmentConfig(
      parts.assignmentConfigPath,
      loadResult.assignment,
      parts.assignmentSlug
    )
  ];
  if (diagnostics.length > 0) {
    return createFailure(diagnostics);
  }
  return {
    status: "success",
    config: {
      course: loadResult.course,
      term: loadResult.term,
      assignment: loadResult.assignment,
      summary: createSummary(
        repositoryRootResult.repoRoot,
        parts,
        loadResult.course,
        loadResult.assignment
      )
    },
    diagnostics: []
  };
};

// src/manifest/manifest-loader.ts
import fs3 from "fs";
import { z as z2 } from "zod";

// src/manifest/manifest-models.ts
var MANIFEST_SCHEMA_VERSION = 1;
var MANIFEST_V2_SCHEMA_VERSION = 2;
var MANIFEST_LIFECYCLE_STATUSES = [
  "created",
  "active",
  "archived",
  "access_removed",
  "missing",
  "error"
];

// src/manifest/manifest-updater.ts
var MISSING_INDEX = -1;
var EMPTY_DIAGNOSTICS = [];
var compareManifestRepositoryRecords = (left, right) => left.section.localeCompare(right.section) || left.studentId.localeCompare(right.studentId) || left.repository.name.localeCompare(right.repository.name);
var sortManifestRepositories = (repositories) => [...repositories].sort(compareManifestRepositoryRecords);
var createEmptyManifest = ({
  assignment,
  source,
  template,
  warnings = EMPTY_DIAGNOSTICS,
  errors = EMPTY_DIAGNOSTICS
}) => ({
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  assignment,
  source,
  template,
  repositories: [],
  operationHistory: [],
  warnings: [...warnings],
  errors: [...errors]
});
var repositoryRecordIndex = (manifest, studentId) => manifest.repositories.findIndex((record) => record.studentId === studentId);
var mergeRepositoryRecord = (existing, incoming) => ({
  ...existing,
  ...incoming,
  repository: {
    ...existing.repository,
    ...incoming.repository
  },
  permissions: {
    ...existing.permissions,
    ...incoming.permissions
  },
  actions: {
    ...existing.actions,
    ...incoming.actions
  },
  lifecycle: {
    ...existing.lifecycle,
    ...incoming.lifecycle
  },
  warnings: incoming.warnings,
  errors: incoming.errors
});
var updateRepositoryRecord = (manifest, studentId, updater) => ({
  ...manifest,
  repositories: sortManifestRepositories(
    manifest.repositories.map(
      (record) => record.studentId === studentId ? updater(record) : record
    )
  )
});
var upsertRepositoryRecord = (manifest, record) => {
  const existingIndex = repositoryRecordIndex(manifest, record.studentId);
  const repositories = existingIndex === MISSING_INDEX ? [...manifest.repositories, record] : manifest.repositories.map(
    (existingRecord, index) => index === existingIndex ? mergeRepositoryRecord(existingRecord, record) : existingRecord
  );
  return {
    ...manifest,
    repositories: sortManifestRepositories(repositories)
  };
};
var updatePermissionState = (manifest, input) => updateRepositoryRecord(manifest, input.studentId, (record) => ({
  ...record,
  permissions: {
    ...record.permissions,
    ...input.permissions
  }
}));
var updateActionsState = (manifest, input) => updateRepositoryRecord(manifest, input.studentId, (record) => ({
  ...record,
  actions: {
    ...record.actions,
    ...input.actions
  }
}));

// src/manifest/manifest-loader.ts
var MINIMUM_ITEMS = 1;
var EMPTY_INDEX = 0;
var diagnosticSchema = z2.object({
  code: z2.string().min(MINIMUM_ITEMS),
  severity: z2.union([z2.literal("error"), z2.literal("warning"), z2.literal("info")]),
  message: z2.string().min(MINIMUM_ITEMS),
  context: z2.record(z2.string(), z2.unknown()).optional(),
  observedAt: z2.string().optional()
}).strict();
var sourceFileSchema = z2.object({
  path: z2.string().min(MINIMUM_ITEMS),
  sha256: z2.string().min(MINIMUM_ITEMS)
}).strict();
var permissionSchema = z2.union([
  z2.literal("pull"),
  z2.literal("triage"),
  z2.literal("push"),
  z2.literal("maintain"),
  z2.literal("admin")
]);
var collaboratorPermissionSchema = z2.object({
  username: z2.string().min(MINIMUM_ITEMS),
  permission: permissionSchema,
  pending_invite: z2.boolean(),
  last_applied_at: z2.string().optional(),
  last_observed_at: z2.string().optional()
}).strict();
var teamPermissionSchema = z2.object({
  team_slug: z2.string().min(MINIMUM_ITEMS),
  permission: permissionSchema,
  last_applied_at: z2.string().optional(),
  last_observed_at: z2.string().optional()
}).strict();
var permissionStateSchema = z2.object({
  student: collaboratorPermissionSchema.optional(),
  faculty_team: teamPermissionSchema.optional(),
  grader_team: teamPermissionSchema.optional()
}).strict();
var repositoryIdentitySchema = z2.object({
  owner: z2.string().min(MINIMUM_ITEMS),
  name: z2.string().min(MINIMUM_ITEMS),
  full_name: z2.string().min(MINIMUM_ITEMS),
  id: z2.number().optional(),
  html_url: z2.string().optional(),
  created_from_template: z2.boolean(),
  template_repository: z2.string().min(MINIMUM_ITEMS),
  template_commit_sha: z2.string().optional(),
  created_at: z2.string().optional(),
  last_observed_at: z2.string().optional()
}).strict();
var actionsStateSchema = z2.object({
  enabled: z2.boolean(),
  grading_workflow_path: z2.string().optional(),
  grading_workflow_found: z2.boolean().optional(),
  workflow_dispatch_supported: z2.boolean().optional(),
  last_observed_at: z2.string().optional()
}).strict();
var lifecycleStateSchema = z2.object({
  repository_archived: z2.boolean(),
  student_access_removed: z2.boolean(),
  status: z2.union(MANIFEST_LIFECYCLE_STATUSES.map((status) => z2.literal(status))),
  last_changed_at: z2.string().optional()
}).strict();
var repositoryRecordSchema = z2.object({
  student_id: z2.string().min(MINIMUM_ITEMS),
  github_username: z2.string().min(MINIMUM_ITEMS),
  section: z2.string().min(MINIMUM_ITEMS),
  roster_status: z2.union([z2.literal("active"), z2.literal("dropped"), z2.literal("hold")]),
  repository: repositoryIdentitySchema,
  permissions: permissionStateSchema,
  actions: actionsStateSchema,
  lifecycle: lifecycleStateSchema,
  warnings: z2.array(diagnosticSchema),
  errors: z2.array(diagnosticSchema)
}).strict();
var operationRecordSchema = z2.object({
  command: z2.string().min(MINIMUM_ITEMS),
  started_at: z2.string().min(MINIMUM_ITEMS),
  completed_at: z2.string().optional(),
  status: z2.union([z2.literal("success"), z2.literal("failure"), z2.literal("partial_success")]),
  summary: z2.record(z2.string(), z2.unknown()),
  warnings: z2.array(diagnosticSchema),
  errors: z2.array(diagnosticSchema)
}).strict();
var rawManifestSchema = z2.object({
  schema_version: z2.number(),
  assignment: z2.object({
    term_code: z2.string().min(MINIMUM_ITEMS),
    course_code: z2.string().min(MINIMUM_ITEMS),
    assignment_slug: z2.string().min(MINIMUM_ITEMS),
    assignment_title: z2.string().min(MINIMUM_ITEMS)
  }).strict(),
  source: z2.object({
    source_files: z2.array(sourceFileSchema),
    input_fingerprint: z2.string().min(MINIMUM_ITEMS)
  }).strict(),
  template: z2.object({
    repository: z2.string().min(MINIMUM_ITEMS),
    branch: z2.string().min(MINIMUM_ITEMS),
    commit_sha: z2.string().optional()
  }).strict(),
  repositories: z2.array(repositoryRecordSchema),
  operation_history: z2.array(operationRecordSchema),
  warnings: z2.array(diagnosticSchema),
  errors: z2.array(diagnosticSchema)
}).strict();
var rawManifestV2Schema = z2.object({
  schema_version: z2.literal(MANIFEST_V2_SCHEMA_VERSION),
  repository_mode: z2.enum(["individual", "group"]),
  targets: z2.array(
    z2.object({
      target_id: z2.string().min(1),
      mode: z2.enum(["individual", "group"]),
      group_id: z2.string().min(1).optional(),
      repository_name: z2.string().min(1),
      html_url: z2.string().optional(),
      clone_url: z2.string().optional(),
      section_ids: z2.array(z2.string().min(1)),
      student_ids: z2.array(z2.string().min(1)),
      github_usernames: z2.array(z2.string().min(1)),
      diagnostics: z2.array(diagnosticSchema)
    }).strict()
  ),
  student_mappings: z2.array(
    z2.object({
      student_id: z2.string().min(1),
      github_username: z2.string().min(1),
      target_id: z2.string().min(1),
      repository_name: z2.string().min(1),
      html_url: z2.string().optional(),
      clone_url: z2.string().optional()
    }).strict()
  ),
  diagnostics: z2.array(diagnosticSchema)
}).strict();
var createFailure2 = (errors) => ({
  status: "failure",
  warnings: [],
  errors
});
var createManifestMissingDiagnostic = (manifestPath) => createConfigDiagnostic(
  DiagnosticCode.ManifestMissing,
  `Manifest ${manifestPath} was not found.`,
  {
    manifestPath
  }
);
var createManifestSchemaVersionDiagnostic = (schemaVersion) => createConfigDiagnostic(
  DiagnosticCode.InvalidManifestSchemaVersion,
  `Unsupported manifest schema version ${String(schemaVersion)}.`,
  {
    schemaVersion,
    supportedSchemaVersion: MANIFEST_SCHEMA_VERSION
  }
);
var createManifestValidationDiagnostic = (code, filePath, issue) => createConfigDiagnostic(code, `Invalid manifest ${filePath}: ${issue.message}`, {
  filePath,
  path: issue.path.join("."),
  reason: issue.message
});
var normalizeDiagnostic = (diagnostic2) => ({
  code: diagnostic2.code,
  severity: diagnostic2.severity,
  message: diagnostic2.message,
  ...diagnostic2.context === void 0 ? {} : { context: diagnostic2.context },
  ...diagnostic2.observedAt === void 0 ? {} : { observedAt: diagnostic2.observedAt }
});
var getIssueCode = (issue) => {
  const pathParts = issue.path.map(String);
  const path19 = pathParts.join(".");
  if (pathParts.length === MINIMUM_ITEMS) {
    return DiagnosticCode.MissingManifestSection;
  }
  if (path19.endsWith("lifecycle.status")) {
    return DiagnosticCode.InvalidManifestLifecycleStatus;
  }
  if (path19.endsWith("permission")) {
    return DiagnosticCode.InvalidManifestPermission;
  }
  if (path19.startsWith("repositories.")) {
    return DiagnosticCode.InvalidManifestRepositoryRecord;
  }
  return DiagnosticCode.InvalidManifest;
};
var validateRawManifest = (filePath, value) => {
  const schemaVersion = z2.looseObject({
    schema_version: z2.number()
  }).safeParse(value);
  if (schemaVersion.success && schemaVersion.data.schema_version === MANIFEST_V2_SCHEMA_VERSION) {
    const result = rawManifestV2Schema.safeParse(value);
    if (!result.success)
      return createFailure2([
        createConfigDiagnostic(
          DiagnosticCode.InvalidManifest,
          `Invalid manifest ${filePath}: ${result.error.issues[0]?.message ?? "schema validation failed"}.`,
          { filePath }
        )
      ]);
    const ids = /* @__PURE__ */ new Set();
    const students = /* @__PURE__ */ new Set();
    const duplicate = result.data.targets.find(
      (target) => ids.has(target.target_id) ? true : (ids.add(target.target_id), false)
    );
    const mappingError = result.data.student_mappings.find(
      (mapping) => !ids.has(mapping.target_id) || (students.has(mapping.student_id) ? true : (students.add(mapping.student_id), false))
    );
    if (duplicate !== void 0 || mappingError !== void 0)
      return createFailure2([
        createConfigDiagnostic(
          DiagnosticCode.InvalidManifest,
          "Manifest v2 targets or student mappings are invalid.",
          { filePath }
        )
      ]);
    return {
      status: "loaded",
      warnings: [],
      errors: [],
      manifest: {
        schemaVersion: MANIFEST_V2_SCHEMA_VERSION,
        repositoryMode: result.data.repository_mode,
        targets: result.data.targets.map((target) => ({
          targetId: target.target_id,
          mode: target.mode,
          ...target.group_id === void 0 ? {} : { groupId: target.group_id },
          repositoryName: target.repository_name,
          ...target.html_url === void 0 ? {} : { htmlUrl: target.html_url },
          ...target.clone_url === void 0 ? {} : { cloneUrl: target.clone_url },
          sectionIds: target.section_ids,
          studentIds: target.student_ids,
          githubUsernames: target.github_usernames,
          diagnostics: target.diagnostics.map(normalizeDiagnostic)
        })),
        studentMappings: result.data.student_mappings.map((mapping) => ({
          studentId: mapping.student_id,
          githubUsername: mapping.github_username,
          targetId: mapping.target_id,
          repositoryName: mapping.repository_name,
          ...mapping.html_url === void 0 ? {} : { htmlUrl: mapping.html_url },
          ...mapping.clone_url === void 0 ? {} : { cloneUrl: mapping.clone_url }
        })),
        assignment: { termCode: "", courseCode: "", assignmentSlug: "", assignmentTitle: "" },
        source: { sourceFiles: [], inputFingerprint: "" },
        template: { repository: "", branch: "" },
        repositories: [],
        operationHistory: [],
        warnings: result.data.diagnostics.map(normalizeDiagnostic),
        errors: []
      }
    };
  }
  if (schemaVersion.success && schemaVersion.data.schema_version !== MANIFEST_SCHEMA_VERSION) {
    return createFailure2([
      createManifestSchemaVersionDiagnostic(schemaVersion.data.schema_version)
    ]);
  }
  const schemaResult = rawManifestSchema.safeParse(value);
  if (!schemaResult.success) {
    const issue = schemaResult.error.issues[EMPTY_INDEX];
    return createFailure2([
      issue === void 0 ? createConfigDiagnostic(
        DiagnosticCode.InvalidManifest,
        `Invalid manifest ${filePath}: unknown schema validation failure.`,
        { filePath }
      ) : createManifestValidationDiagnostic(getIssueCode(issue), filePath, issue)
    ]);
  }
  return {
    status: "loaded",
    manifest: normalizeManifest(schemaResult.data),
    warnings: [],
    errors: []
  };
};
var normalizeRepositoryIdentity = (repository) => ({
  owner: repository.owner,
  name: repository.name,
  fullName: repository.full_name,
  ...repository.id === void 0 ? {} : { id: repository.id },
  ...repository.html_url === void 0 ? {} : { htmlUrl: repository.html_url },
  createdFromTemplate: repository.created_from_template,
  templateRepository: repository.template_repository,
  ...repository.template_commit_sha === void 0 ? {} : { templateCommitSha: repository.template_commit_sha },
  ...repository.created_at === void 0 ? {} : { createdAt: repository.created_at },
  ...repository.last_observed_at === void 0 ? {} : { lastObservedAt: repository.last_observed_at }
});
var normalizePermissionState = (permissions) => ({
  ...permissions.student === void 0 ? {} : {
    student: {
      username: permissions.student.username,
      permission: permissions.student.permission,
      pendingInvite: permissions.student.pending_invite,
      ...permissions.student.last_applied_at === void 0 ? {} : { lastAppliedAt: permissions.student.last_applied_at },
      ...permissions.student.last_observed_at === void 0 ? {} : { lastObservedAt: permissions.student.last_observed_at }
    }
  },
  ...permissions.faculty_team === void 0 ? {} : { facultyTeam: normalizeTeamPermission(permissions.faculty_team) },
  ...permissions.grader_team === void 0 ? {} : { graderTeam: normalizeTeamPermission(permissions.grader_team) }
});
var normalizeTeamPermission = (permission) => ({
  teamSlug: permission.team_slug,
  permission: permission.permission,
  ...permission.last_applied_at === void 0 ? {} : { lastAppliedAt: permission.last_applied_at },
  ...permission.last_observed_at === void 0 ? {} : { lastObservedAt: permission.last_observed_at }
});
var normalizeActionsState = (actions) => ({
  enabled: actions.enabled,
  ...actions.grading_workflow_path === void 0 ? {} : { gradingWorkflowPath: actions.grading_workflow_path },
  ...actions.grading_workflow_found === void 0 ? {} : { gradingWorkflowFound: actions.grading_workflow_found },
  ...actions.workflow_dispatch_supported === void 0 ? {} : { workflowDispatchSupported: actions.workflow_dispatch_supported },
  ...actions.last_observed_at === void 0 ? {} : { lastObservedAt: actions.last_observed_at }
});
var normalizeLifecycleState = (lifecycle) => ({
  repositoryArchived: lifecycle.repository_archived,
  studentAccessRemoved: lifecycle.student_access_removed,
  status: lifecycle.status,
  ...lifecycle.last_changed_at === void 0 ? {} : { lastChangedAt: lifecycle.last_changed_at }
});
var normalizeRepositoryRecord = (record) => ({
  studentId: record.student_id,
  githubUsername: record.github_username,
  section: record.section,
  rosterStatus: record.roster_status,
  repository: normalizeRepositoryIdentity(record.repository),
  permissions: normalizePermissionState(record.permissions),
  actions: normalizeActionsState(record.actions),
  lifecycle: normalizeLifecycleState(record.lifecycle),
  warnings: record.warnings.map(normalizeDiagnostic),
  errors: record.errors.map(normalizeDiagnostic)
});
var normalizeOperationRecord = (operation) => ({
  command: operation.command,
  startedAt: operation.started_at,
  ...operation.completed_at === void 0 ? {} : { completedAt: operation.completed_at },
  status: operation.status,
  summary: operation.summary,
  warnings: operation.warnings.map(normalizeDiagnostic),
  errors: operation.errors.map(normalizeDiagnostic)
});
var normalizeManifest = (manifest) => ({
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  assignment: {
    termCode: manifest.assignment.term_code,
    courseCode: manifest.assignment.course_code,
    assignmentSlug: manifest.assignment.assignment_slug,
    assignmentTitle: manifest.assignment.assignment_title
  },
  source: {
    sourceFiles: manifest.source.source_files,
    inputFingerprint: manifest.source.input_fingerprint
  },
  template: {
    repository: manifest.template.repository,
    branch: manifest.template.branch,
    ...manifest.template.commit_sha === void 0 ? {} : { commitSha: manifest.template.commit_sha }
  },
  repositories: sortManifestRepositories(manifest.repositories.map(normalizeRepositoryRecord)),
  operationHistory: manifest.operation_history.map(normalizeOperationRecord),
  warnings: manifest.warnings.map(normalizeDiagnostic),
  errors: manifest.errors.map(normalizeDiagnostic)
});
var loadManifest = (manifestPath, options = {}) => {
  if (!fs3.existsSync(manifestPath)) {
    return options.required === true ? createFailure2([createManifestMissingDiagnostic(manifestPath)]) : {
      status: "missing",
      warnings: [],
      errors: []
    };
  }
  const fileResult = readTextFile(manifestPath);
  if (fileResult.status === "failure") {
    return createFailure2([fileResult.diagnostic]);
  }
  const yamlResult = parseYaml(fileResult.content, manifestPath);
  if (yamlResult.status === "failure") {
    return createFailure2([yamlResult.diagnostic]);
  }
  return validateRawManifest(manifestPath, yamlResult.value);
};

// src/manifest/manifest-paths.ts
import path4 from "path";
var TERMS_DIRECTORY2 = "terms";
var MANIFESTS_DIRECTORY = "manifests";
var MANIFEST_FILE_NAME = "manifest.yml";
var createManifestPath = (repoRoot, termCode, assignmentSlug) => {
  const relativeDirectory = path4.posix.join(
    TERMS_DIRECTORY2,
    termCode,
    MANIFESTS_DIRECTORY,
    assignmentSlug
  );
  const relativePath = path4.posix.join(relativeDirectory, MANIFEST_FILE_NAME);
  return {
    relativeDirectory,
    relativePath,
    absolutePath: path4.join(repoRoot, relativePath)
  };
};

// src/groups/group-preview-planner.ts
import path5 from "path";

// src/io/csv.ts
var HEADER_ROW_NUMBER = 1;
var FIRST_DATA_ROW_NUMBER = 2;
var EMPTY_LINE_COUNT = 0;
var EMPTY_FIELD = "";
var COMMA = ",";
var QUOTE = '"';
var DOUBLE_QUOTE = '""';
var CARRIAGE_RETURN = "\r";
var NEWLINE_PATTERN = /\n/;
var stripCarriageReturn = (line) => line.endsWith(CARRIAGE_RETURN) ? line.slice(0, -CARRIAGE_RETURN.length) : line;
var parseCsvLine = (line) => {
  const fields = [];
  let current = EMPTY_FIELD;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? EMPTY_FIELD;
    const nextTwoCharacters = line.slice(index, index + DOUBLE_QUOTE.length);
    if (nextTwoCharacters === DOUBLE_QUOTE && inQuotes) {
      current += QUOTE;
      index += QUOTE.length;
    } else if (character === QUOTE) {
      inQuotes = !inQuotes;
    } else if (character === COMMA && !inQuotes) {
      fields.push(current.trim());
      current = EMPTY_FIELD;
    } else {
      current += character;
    }
  }
  fields.push(current.trim());
  return fields;
};
var parseCsv = (content) => {
  const lines = content.split(NEWLINE_PATTERN).map(stripCarriageReturn);
  const nonEmptyLines = lines.filter((line) => line.trim().length > EMPTY_LINE_COUNT);
  const headerLine = nonEmptyLines[HEADER_ROW_NUMBER - HEADER_ROW_NUMBER] ?? EMPTY_FIELD;
  const dataLines = nonEmptyLines.slice(FIRST_DATA_ROW_NUMBER - HEADER_ROW_NUMBER);
  return {
    headers: parseCsvLine(headerLine),
    rows: dataLines.map((line, index) => ({
      rowNumber: index + FIRST_DATA_ROW_NUMBER,
      values: parseCsvLine(line)
    }))
  };
};

// src/planning/repo-name.ts
var PLACEHOLDER_PATTERN = /\{([a-z_]+)\}/gu;
var REPOSITORY_NAME_PATTERN = /^[a-z0-9-]+$/u;
var HYPHEN = "-";
var CONSECUTIVE_HYPHENS = "--";
var EMPTY_LENGTH = 0;
var getMaxRepositoryNameLength = () => 100 /* MaxLength */;
var REQUIRED_PLACEHOLDERS = ["term", "course", "assignment", "github_username"];
var LEGACY_STUDENT_PLACEHOLDER = "student";
var GITHUB_USERNAME_PLACEHOLDER = "github_username";
var createRepositoryNameError = (name, reason) => createConfigDiagnostic(
  DiagnosticCode.InvalidRepositoryName,
  `Invalid repository name ${name}: ${reason}.`,
  {
    repositoryName: name,
    reason
  }
);
var isKnownPlaceholder = (placeholder) => REQUIRED_PLACEHOLDERS.some((requiredPlaceholder) => requiredPlaceholder === placeholder) || placeholder === LEGACY_STUDENT_PLACEHOLDER;
var extractPlaceholders = (pattern) => Array.from(pattern.matchAll(PLACEHOLDER_PATTERN), (match) => match[1] ?? "");
var normalizePlaceholders = (placeholders) => placeholders.map(
  (placeholder) => placeholder === LEGACY_STUDENT_PLACEHOLDER ? GITHUB_USERNAME_PLACEHOLDER : placeholder
);
var getUnknownPlaceholderErrors = (placeholders) => placeholders.filter((placeholder) => !isKnownPlaceholder(placeholder)).map(
  (placeholder) => createConfigDiagnostic(
    DiagnosticCode.RepoNamePatternUnknownPlaceholder,
    `Unknown repository name pattern placeholder ${placeholder}.`,
    {
      placeholder
    }
  )
);
var getMissingPlaceholderErrors = (placeholders) => {
  const normalizedPlaceholders = normalizePlaceholders(placeholders);
  return REQUIRED_PLACEHOLDERS.filter(
    (requiredPlaceholder) => !normalizedPlaceholders.includes(requiredPlaceholder)
  ).map(
    (placeholder) => createConfigDiagnostic(
      DiagnosticCode.RepoNamePatternMissingPlaceholder,
      `Repository name pattern is missing required placeholder ${placeholder}.`,
      {
        placeholder
      }
    )
  );
};
var getPlaceholderValues = (input) => ({
  term: input.termCode.toLowerCase(),
  course: input.courseCode.toLowerCase(),
  assignment: input.assignmentSlug.toLowerCase(),
  github_username: input.githubUsername.toLowerCase(),
  student: input.githubUsername.toLowerCase()
});
var replacePlaceholders = (input) => {
  const values = getPlaceholderValues(input);
  return input.pattern.replace(
    PLACEHOLDER_PATTERN,
    (_, placeholder) => isKnownPlaceholder(placeholder) ? values[placeholder] : `{${placeholder}}`
  );
};
var validateRepositoryName = (repositoryName) => {
  const errors = [
    ...repositoryName.length === EMPTY_LENGTH ? [createRepositoryNameError(repositoryName, "repository name must not be empty")] : [],
    ...repositoryName.length > getMaxRepositoryNameLength() ? [
      createRepositoryNameError(
        repositoryName,
        `repository name must be at most ${String(getMaxRepositoryNameLength())} characters`
      )
    ] : [],
    ...repositoryName !== repositoryName.toLowerCase() ? [createRepositoryNameError(repositoryName, "repository name must be lowercase")] : [],
    ...REPOSITORY_NAME_PATTERN.test(repositoryName) ? [] : [
      createRepositoryNameError(
        repositoryName,
        "repository name may contain only lowercase letters, digits, and hyphens"
      )
    ],
    ...repositoryName.startsWith(HYPHEN) ? [createRepositoryNameError(repositoryName, "repository name must not start with a hyphen")] : [],
    ...repositoryName.endsWith(HYPHEN) ? [createRepositoryNameError(repositoryName, "repository name must not end with a hyphen")] : [],
    ...repositoryName.includes(CONSECUTIVE_HYPHENS) ? [
      createRepositoryNameError(
        repositoryName,
        "repository name must not contain consecutive hyphens"
      )
    ] : []
  ];
  return {
    warnings: [],
    errors
  };
};
var generateRepositoryName = (input) => {
  const placeholders = extractPlaceholders(input.pattern);
  const patternErrors = [
    ...getUnknownPlaceholderErrors(placeholders),
    ...getMissingPlaceholderErrors(placeholders)
  ];
  if (patternErrors.length > EMPTY_LENGTH) {
    return {
      warnings: [],
      errors: patternErrors
    };
  }
  const repositoryName = replacePlaceholders(input).toLowerCase();
  const validationResult = validateRepositoryName(repositoryName);
  if (validationResult.errors.length > EMPTY_LENGTH) {
    return validationResult;
  }
  return {
    repositoryName,
    warnings: [],
    errors: []
  };
};

// src/roster/roster-models.ts
var ROSTER_STATUS_ACTIVE = "active";
var ROSTER_STATUS_DROPPED = "dropped";
var ROSTER_STATUS_HOLD = "hold";

// src/groups/group-preview-planner.ts
var GROUP_HEADERS = ["group_id", "student_id"];
var SAFE_GROUP_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
var SAFE_GROUP_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/u;
var diagnostic = (code, message, context) => createConfigDiagnostic(code, message, context);
var warning = (code, message, context) => createWarningDiagnostic(code, message, context);
var buildGroupApplyPreviewPlan = (config, students) => {
  const groupsFile = config.assignment.groups?.file ?? "groups.csv";
  const assignmentDirectory = path5.dirname(
    path5.resolve(config.summary.repoRoot, config.summary.assignmentRelativePath)
  );
  const groupsPath = path5.resolve(assignmentDirectory, groupsFile);
  const baseContext = { assignmentFile: config.summary.assignmentConfigPath, groupsFile };
  if (!SAFE_GROUP_FILE.test(groupsFile) || path5.dirname(groupsFile) !== ".") {
    return {
      targets: [],
      warnings: [],
      errors: [diagnostic("group_csv_invalid", "Group CSV file name is invalid.", baseContext)]
    };
  }
  if (path5.relative(assignmentDirectory, groupsPath).startsWith("..")) {
    return {
      targets: [],
      warnings: [],
      errors: [
        diagnostic(
          "group_csv_invalid",
          "Group CSV path is outside the assignment directory.",
          baseContext
        )
      ]
    };
  }
  const file = readTextFile(groupsPath);
  if (file.status === "failure") {
    return {
      targets: [],
      warnings: [],
      errors: [
        diagnostic(
          "group_csv_missing",
          "Group CSV is missing for this group assignment.",
          baseContext
        )
      ]
    };
  }
  const document = parseCsv(file.content);
  if (document.headers.length !== GROUP_HEADERS.length || document.headers.some((header, index) => header !== GROUP_HEADERS[index])) {
    return {
      targets: [],
      warnings: [],
      errors: [
        diagnostic(
          "group_csv_invalid",
          "Group CSV must begin with group_id,student_id.",
          baseContext
        )
      ]
    };
  }
  const knownStudents = new Map(students.map((student) => [student.studentId, student]));
  const memberships = /* @__PURE__ */ new Set();
  const assigned = /* @__PURE__ */ new Set();
  const groups = /* @__PURE__ */ new Map();
  const errors = [];
  for (const row of document.rows) {
    const groupId = (row.values[0] ?? "").trim();
    const studentId = (row.values[1] ?? "").trim();
    const context = { ...baseContext, rowNumber: row.rowNumber, groupId, studentId };
    if (row.values.length !== 2 || groupId === "" || studentId === "") {
      errors.push(
        diagnostic(
          "group_csv_invalid",
          "Each group CSV row requires group_id and student_id.",
          context
        )
      );
      continue;
    }
    if (!SAFE_GROUP_ID.test(groupId)) {
      errors.push(
        diagnostic(
          "group_id_invalid",
          `Group ID ${groupId} is not safe for repository naming.`,
          context
        )
      );
      continue;
    }
    const membership = `${groupId}\0${studentId}`;
    if (memberships.has(membership)) {
      errors.push(
        diagnostic(
          "group_membership_duplicate",
          `Student ${studentId} is duplicated in group ${groupId}.`,
          context
        )
      );
      continue;
    }
    memberships.add(membership);
    if (assigned.has(studentId)) {
      errors.push(
        diagnostic(
          "group_student_multiple_groups",
          `Student ${studentId} appears in more than one group.`,
          context
        )
      );
      continue;
    }
    const student = knownStudents.get(studentId);
    if (student === void 0) {
      errors.push(
        diagnostic(
          "group_student_unknown",
          `Student ${studentId} is not in this assignment's selected sections.`,
          context
        )
      );
      continue;
    }
    if (student.status !== ROSTER_STATUS_ACTIVE) {
      errors.push(
        diagnostic(
          "group_student_inactive",
          `Student ${studentId} is ${student.status} and cannot be assigned to a group.`,
          context
        )
      );
      continue;
    }
    assigned.add(studentId);
    groups.set(groupId, [...groups.get(groupId) ?? [], student]);
  }
  const targets = [];
  const names = /* @__PURE__ */ new Map();
  for (const [groupId, members] of groups) {
    const sectionIds = [...new Set(members.map((student) => student.section))];
    if (sectionIds.length !== 1) {
      errors.push(
        diagnostic(
          "group_cross_section",
          `Group ${groupId} contains students from more than one section.`,
          { ...baseContext, groupId, sectionIds }
        )
      );
      continue;
    }
    const repository = generateRepositoryName({
      pattern: config.course.github.repo_name_pattern,
      termCode: config.summary.termCode,
      courseCode: config.course.course.code,
      assignmentSlug: config.summary.assignmentSlug,
      githubUsername: groupId
    });
    if (repository.repositoryName === void 0 || repository.errors.length > 0) {
      errors.push(...repository.errors);
      continue;
    }
    const existingGroup = names.get(repository.repositoryName);
    if (existingGroup !== void 0) {
      errors.push(
        diagnostic(
          "group_repository_name_collision",
          `Groups ${existingGroup} and ${groupId} resolve to the same repository name ${repository.repositoryName}.`,
          { ...baseContext, groupId, repositoryName: repository.repositoryName }
        )
      );
      continue;
    }
    names.set(repository.repositoryName, groupId);
    targets.push({
      targetId: groupId,
      mode: "group",
      groupId,
      repositoryName: repository.repositoryName,
      sectionIds,
      studentIds: members.map((student) => student.studentId),
      githubUsernames: members.map((student) => student.githubUsername),
      plannedStudentPermission: "admin",
      facultyTeam: config.course.github.faculty_team,
      facultyTeamPermission: config.course.github.faculty_permission,
      graderTeam: config.course.github.grader_team,
      graderTeamPermission: config.course.github.grader_permission,
      diagnostics: [...repository.warnings]
    });
  }
  if (targets.length === 0 && errors.length === 0)
    errors.push(
      diagnostic("group_csv_no_valid_groups", "Group CSV contains no valid groups.", baseContext)
    );
  const ungrouped = students.filter(
    (student) => student.status === ROSTER_STATUS_ACTIVE && !assigned.has(student.studentId)
  );
  const warnings = ungrouped.length === 0 ? [] : [
    warning(
      "group_students_ungrouped",
      `${String(ungrouped.length)} active student(s) in selected sections are not assigned to a group.`,
      { ...baseContext, studentIds: ungrouped.map((student) => student.studentId) }
    )
  ];
  return { targets, warnings, errors };
};

// src/roster/roster-loader.ts
import path6 from "path";

// src/roster/roster-normalization.ts
var normalizeLowercaseValue = (value, code, message, context) => {
  const normalized = value.toLowerCase();
  if (normalized === value) {
    return {
      value
    };
  }
  return {
    value: normalized,
    warning: createWarningDiagnostic(code, message, {
      ...context,
      originalValue: value,
      normalizedValue: normalized
    })
  };
};
var normalizeStudentId = (value, context) => normalizeLowercaseValue(
  value,
  STUDENT_ID_NORMALIZED_CODE,
  "student_id was normalized to lowercase.",
  context
);
var normalizeGithubUsername = (value, context) => normalizeLowercaseValue(
  value,
  GITHUB_USERNAME_NORMALIZED_CODE,
  "github_username was normalized to lowercase.",
  context
);
var normalizeRosterStatus = (value, context) => normalizeLowercaseValue(
  value,
  ROSTER_STATUS_NORMALIZED_CODE,
  "Roster status was normalized to lowercase.",
  context
);

// src/roster/roster-validation.ts
var STUDENT_ID_COLUMN = "student_id";
var GITHUB_USERNAME_COLUMN = "github_username";
var SECTION_COLUMN = "section";
var STATUS_COLUMN = "status";
var REQUIRED_ROSTER_COLUMNS = [
  STUDENT_ID_COLUMN,
  GITHUB_USERNAME_COLUMN,
  SECTION_COLUMN,
  STATUS_COLUMN
];
var GITHUB_USERNAME_MAX_LENGTH = 39;
var FIRST_MATCH_INDEX = 0;
var SECOND_MATCH_INDEX = 1;
var VALID_ROSTER_STATUSES = [
  ROSTER_STATUS_ACTIVE,
  ROSTER_STATUS_DROPPED,
  ROSTER_STATUS_HOLD
];
var GITHUB_USERNAME_PATTERN = /^[a-z0-9-]+$/;
var CONSECUTIVE_HYPHENS2 = "--";
var HYPHEN2 = "-";
var isRosterStatus = (value) => VALID_ROSTER_STATUSES.some((status) => status === value);
var validateRequiredColumns = (rosterPath, headers) => REQUIRED_ROSTER_COLUMNS.filter((column) => !headers.includes(column)).map(
  (column) => createConfigDiagnostic(
    MISSING_REQUIRED_COLUMN_CODE,
    `Roster is missing required column ${column}.`,
    {
      rosterPath,
      columnName: column
    }
  )
);
var createMissingRequiredValueDiagnostic = (rosterPath, rowNumber, columnName) => createConfigDiagnostic(
  MISSING_REQUIRED_VALUE_CODE,
  `Roster row ${String(rowNumber)} is missing required value ${columnName}.`,
  {
    rosterPath,
    rowNumber,
    columnName
  }
);
var validateRosterStatus = (rosterPath, rowNumber, status) => isRosterStatus(status) ? [] : [
  createConfigDiagnostic(
    INVALID_ROSTER_STATUS_CODE,
    `Roster row ${String(rowNumber)} has invalid status ${status}.`,
    {
      rosterPath,
      rowNumber,
      status
    }
  )
];
var validateRosterSection = (rosterPath, rowNumber, expectedSection, actualSection) => actualSection === expectedSection ? [] : [
  createConfigDiagnostic(
    SECTION_MISMATCH_CODE,
    `Roster row ${String(rowNumber)} has section ${actualSection}; expected ${expectedSection}.`,
    {
      rosterPath,
      rowNumber,
      expectedSection,
      actualSection
    }
  )
];
var validateGithubUsername = (rosterPath, rowNumber, githubUsername) => {
  const isValid = githubUsername.length > 0 && githubUsername.length <= GITHUB_USERNAME_MAX_LENGTH && GITHUB_USERNAME_PATTERN.test(githubUsername) && !githubUsername.startsWith(HYPHEN2) && !githubUsername.endsWith(HYPHEN2) && !githubUsername.includes(CONSECUTIVE_HYPHENS2);
  return isValid ? [] : [
    createConfigDiagnostic(
      INVALID_GITHUB_USERNAME_CODE,
      `Roster row ${String(rowNumber)} has invalid GitHub username ${githubUsername}.`,
      {
        rosterPath,
        rowNumber,
        githubUsername
      }
    )
  ];
};
var createDuplicateDiagnostic = (code, message, valueKey, matches) => {
  const firstMatch = matches[FIRST_MATCH_INDEX];
  const secondMatch = matches[SECOND_MATCH_INDEX];
  return createConfigDiagnostic(code, message, {
    [valueKey]: firstMatch?.[valueKey === STUDENT_ID_COLUMN ? "studentId" : "githubUsername"],
    firstRosterPath: firstMatch?.rosterPath,
    firstRowNumber: firstMatch?.rowNumber,
    secondRosterPath: secondMatch?.rosterPath,
    secondRowNumber: secondMatch?.rowNumber
  });
};
var findDuplicateDiagnostics = (students, getValue3, code, message, valueKey) => {
  const grouped = /* @__PURE__ */ new Map();
  for (const student of students) {
    grouped.set(getValue3(student), [...grouped.get(getValue3(student)) ?? [], student]);
  }
  return [...grouped.values()].filter((matches) => matches.length > SECOND_MATCH_INDEX).map((matches) => createDuplicateDiagnostic(code, message, valueKey, matches));
};
var validateRosterDuplicates = (students) => [
  ...findDuplicateDiagnostics(
    students,
    (student) => student.studentId,
    DUPLICATE_STUDENT_ID_CODE,
    "Duplicate student_id found in rosters.",
    STUDENT_ID_COLUMN
  ),
  ...findDuplicateDiagnostics(
    students,
    (student) => student.githubUsername,
    DUPLICATE_GITHUB_USERNAME_CODE,
    "Duplicate github_username found in rosters.",
    GITHUB_USERNAME_COLUMN
  )
];

// src/roster/roster-loader.ts
var EMPTY_COUNT = 0;
var TERM_DIRECTORY_DEPTH = 2;
var MISSING_COLUMN_INDEX = -1;
var createEmptySummary = (rosterFiles) => ({
  rosterFiles,
  studentCount: EMPTY_COUNT,
  activeStudentCount: EMPTY_COUNT,
  droppedStudentCount: EMPTY_COUNT,
  holdStudentCount: EMPTY_COUNT
});
var createSummary2 = (rosterFiles, students) => ({
  rosterFiles,
  studentCount: students.length,
  activeStudentCount: students.filter((student) => student.status === ROSTER_STATUS_ACTIVE).length,
  droppedStudentCount: students.filter((student) => student.status === ROSTER_STATUS_DROPPED).length,
  holdStudentCount: students.filter((student) => student.status === ROSTER_STATUS_HOLD).length
});
var getTermDirectory = (termConfigPath) => termConfigPath.split("/").slice(EMPTY_COUNT, TERM_DIRECTORY_DEPTH).join("/");
var getSectionSources = (config) => {
  const termDirectory = getTermDirectory(config.summary.termConfigPath);
  const sectionsById = new Map(
    config.term.sections.map((section) => [
      section.id,
      toForwardSlashPath(path6.posix.join(termDirectory, section.roster))
    ])
  );
  return config.assignment.sections.map((sectionId) => ({
    sectionId,
    rosterPath: sectionsById.get(sectionId) ?? ""
  }));
};
var getColumnIndexes = (headers) => ({
  studentId: headers.indexOf(STUDENT_ID_COLUMN),
  githubUsername: headers.indexOf(GITHUB_USERNAME_COLUMN),
  section: headers.indexOf(SECTION_COLUMN),
  status: headers.indexOf(STATUS_COLUMN)
});
var getValue = (values, index) => index === MISSING_COLUMN_INDEX ? "" : (values[index] ?? "").trim();
var createContext = (rosterPath, rowNumber, expectedSection) => ({
  rosterPath,
  rowNumber,
  expectedSection
});
var loadSectionRoster = (repoRoot, source) => {
  const fileResult = readTextFile(path6.join(repoRoot, source.rosterPath));
  if (fileResult.status === "failure") {
    return {
      students: [],
      warnings: [],
      errors: [fileResult.diagnostic]
    };
  }
  const document = parseCsv(fileResult.content);
  const missingColumnErrors = validateRequiredColumns(source.rosterPath, document.headers);
  if (missingColumnErrors.length > EMPTY_COUNT) {
    return {
      students: [],
      warnings: [],
      errors: missingColumnErrors
    };
  }
  const indexes = getColumnIndexes(document.headers);
  const students = [];
  const warnings = [];
  const errors = [];
  for (const row of document.rows) {
    const rawStudentId = getValue(row.values, indexes.studentId);
    const rawGithubUsername = getValue(row.values, indexes.githubUsername);
    const rawSection = getValue(row.values, indexes.section);
    const rawStatus = getValue(row.values, indexes.status);
    const rowContext = createContext(source.rosterPath, row.rowNumber, source.sectionId);
    const missingValueErrors = REQUIRED_ROSTER_COLUMNS.flatMap((column) => {
      const valueByColumn = {
        [STUDENT_ID_COLUMN]: rawStudentId,
        [GITHUB_USERNAME_COLUMN]: rawGithubUsername,
        [SECTION_COLUMN]: rawSection,
        [STATUS_COLUMN]: rawStatus
      };
      return valueByColumn[column].length === EMPTY_COUNT ? [createMissingRequiredValueDiagnostic(source.rosterPath, row.rowNumber, column)] : [];
    });
    if (missingValueErrors.length > EMPTY_COUNT) {
      errors.push(...missingValueErrors);
    } else {
      const normalizedStudentId = normalizeStudentId(rawStudentId, rowContext);
      const normalizedGithubUsername = normalizeGithubUsername(rawGithubUsername, rowContext);
      const normalizedStatus = normalizeRosterStatus(rawStatus, rowContext);
      const rowWarnings = [
        normalizedStudentId.warning,
        normalizedGithubUsername.warning,
        normalizedStatus.warning
      ].filter((warning2) => warning2 !== void 0);
      const rowErrors = [
        ...validateRosterStatus(source.rosterPath, row.rowNumber, normalizedStatus.value),
        ...validateRosterSection(source.rosterPath, row.rowNumber, source.sectionId, rawSection),
        ...validateGithubUsername(source.rosterPath, row.rowNumber, normalizedGithubUsername.value)
      ];
      warnings.push(...rowWarnings);
      errors.push(...rowErrors);
      if (rowErrors.length === EMPTY_COUNT && isRosterStatus(normalizedStatus.value)) {
        students.push({
          studentId: normalizedStudentId.value,
          githubUsername: normalizedGithubUsername.value,
          section: rawSection,
          status: normalizedStatus.value,
          rosterPath: source.rosterPath,
          rowNumber: row.rowNumber
        });
      }
    }
  }
  return {
    students,
    warnings,
    errors
  };
};
var loadAssignmentRosters = (config) => {
  const sources = getSectionSources(config);
  const rosterFiles = sources.map((source) => source.rosterPath);
  const loadedSections = sources.map(
    (source) => loadSectionRoster(config.summary.repoRoot, source)
  );
  const students = loadedSections.flatMap((section) => section.students);
  const warnings = loadedSections.flatMap((section) => section.warnings);
  const errors = [
    ...loadedSections.flatMap((section) => section.errors),
    ...validateRosterDuplicates(students)
  ];
  return {
    students,
    warnings,
    errors,
    summary: errors.length > EMPTY_COUNT ? createEmptySummary(rosterFiles) : createSummary2(rosterFiles, students)
  };
};

// src/apply-preview/apply-preview-models.ts
var ASSIGNMENT_APPLY_PREVIEW_SCHEMA_VERSION = 1;

// src/apply-preview/apply-preview-builder.ts
var COMMAND_NAME = "assignment apply-preview";
var EMPTY_COUNT2 = 0;
var SUCCESS_EXIT_CODE = 0;
var FAILURE_EXIT_CODE = 1;
var PARTIAL_SUCCESS_EXIT_CODE = 2;
var ACTIVE_ASSIGNMENT_STATUS = "active";
var CLOSED_ASSIGNMENT_STATUS = "closed";
var DRAFT_ASSIGNMENT_STATUS = "draft";
var ARCHIVED_ASSIGNMENT_STATUS = "archived";
var LEGACY_GRADING_MODE2 = "custom-workflow";
var NOT_CHECKED_STATUS = "not_checked";
var NOT_REQUIRED_STATUS = "not_required";
var UNKNOWN_REASON_TOKEN_REQUIRED = "token_required";
var UNKNOWN_REASON_REPOSITORY_STATUS_UNKNOWN = "student_repository_status_unknown";
var STUDENT_STATUS_REASON_PREFIX = "student_status";
var resolveExitCode = (status) => {
  if (status === "success") {
    return SUCCESS_EXIT_CODE;
  }
  return status === "partial_success" ? PARTIAL_SUCCESS_EXIT_CODE : FAILURE_EXIT_CODE;
};
var createEmptyAssignmentApplyPreviewResult = (status, diagnostics) => ({
  schemaVersion: ASSIGNMENT_APPLY_PREVIEW_SCHEMA_VERSION,
  commandName: COMMAND_NAME,
  status,
  exitCode: resolveExitCode(status),
  diagnostics,
  assignment: null,
  course: null,
  term: null,
  target: null,
  template: null,
  grading: null,
  plan: null,
  files: null,
  actions: null
});
var createGradingPreview = (config) => {
  const grading = config.assignment.grading ?? config.course.grading;
  if (!grading.enabled) {
    return {
      enabled: false,
      mode: grading.mode ?? DISABLED_GRADING_MODE,
      workflow: null,
      artifact: null,
      resultFile: null,
      workflowStatus: NOT_REQUIRED_STATUS,
      workflowDispatch: NOT_REQUIRED_STATUS
    };
  }
  return {
    enabled: true,
    mode: grading.mode ?? LEGACY_GRADING_MODE2,
    workflow: grading.workflow ?? null,
    artifact: grading.artifact ?? null,
    resultFile: grading.result_file ?? null,
    workflowStatus: NOT_CHECKED_STATUS,
    workflowDispatch: NOT_CHECKED_STATUS
  };
};
var createTemplatePreview = (config) => ({
  repository: config.assignment.template.repository,
  branch: config.assignment.template.branch,
  status: NOT_CHECKED_STATUS,
  repositoryStatus: NOT_CHECKED_STATUS,
  branchStatus: NOT_CHECKED_STATUS
});
var createTargetStudentsEmptyDiagnostic = (config) => createConfigDiagnostic(
  TARGET_MATCHES_NO_STUDENTS_CODE,
  "Assignment apply preview found no target students.",
  {
    assignmentFile: config.summary.assignmentConfigPath,
    sections: config.assignment.sections
  }
);
var createLifecycleDiagnostic = (code, message, config, student) => createConfigDiagnostic(code, message, {
  assignmentFile: config.summary.assignmentConfigPath,
  assignmentStatus: config.assignment.assignment.status,
  studentId: student.studentId,
  githubUsername: student.githubUsername,
  section: student.section
});
var createManifestTrackedMissingDiagnostic = (owner, repositoryName, student) => createConfigDiagnostic(
  MANIFEST_TRACKED_REPOSITORY_MISSING_CODE,
  `Manifest tracks repository ${owner}/${repositoryName}, but it was not found.`,
  {
    owner,
    repositoryName,
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section
  }
);
var createRepositoryStatusUnknownDiagnostic = (error, owner, repositoryName, student) => {
  if (error instanceof GitHubClientError) {
    return createConfigDiagnostic(
      error.diagnosticCode,
      `Could not check repository ${owner}/${repositoryName}: ${error.message}`,
      {
        owner,
        repositoryName,
        studentId: student.studentId,
        githubUsername: student.githubUsername,
        section: student.section,
        kind: error.kind,
        retryable: error.retryable,
        ...error.retryAfterSeconds === void 0 ? {} : { retryAfterSeconds: error.retryAfterSeconds }
      }
    );
  }
  return createConfigDiagnostic(
    STUDENT_REPOSITORY_STATUS_UNKNOWN_CODE,
    `Could not check repository ${owner}/${repositoryName}.`,
    {
      owner,
      repositoryName,
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section
    }
  );
};
var createRow = (student, repository, status, reason, diagnostics = []) => ({
  studentId: student.studentId,
  githubUsername: student.githubUsername,
  section: student.section,
  repository,
  status,
  reason,
  diagnostics
});
var findManifestRecord = (manifest, student) => manifest?.repositories.find((record) => record.studentId === student.studentId);
var getRepositoryNameDiagnostics = (config, student) => {
  const result = generateRepositoryName({
    pattern: config.course.github.repo_name_pattern,
    termCode: config.summary.termCode,
    courseCode: config.course.course.code,
    assignmentSlug: config.summary.assignmentSlug,
    githubUsername: student.githubUsername
  });
  return {
    repositoryName: result.repositoryName ?? "",
    diagnostics: [...result.warnings, ...result.errors]
  };
};
var createLifecycleRow = (config, student, repositoryFullName) => {
  const assignmentStatus = config.assignment.assignment.status;
  if (assignmentStatus === DRAFT_ASSIGNMENT_STATUS) {
    return createRow(student, repositoryFullName, "blocked", assignmentStatus, [
      createLifecycleDiagnostic(
        ASSIGNMENT_NOT_ACTIVE_CODE,
        "Draft assignments cannot be applied.",
        config,
        student
      )
    ]);
  }
  if (assignmentStatus === CLOSED_ASSIGNMENT_STATUS) {
    return createRow(student, repositoryFullName, "blocked", assignmentStatus, [
      createLifecycleDiagnostic(
        ASSIGNMENT_CLOSED_BLOCKS_CREATION_CODE,
        "Closed assignments block new repository creation.",
        config,
        student
      )
    ]);
  }
  if (assignmentStatus === ARCHIVED_ASSIGNMENT_STATUS) {
    return createRow(student, repositoryFullName, "blocked", assignmentStatus, [
      createLifecycleDiagnostic(
        ASSIGNMENT_ARCHIVED_CODE,
        "Archived assignments cannot be applied.",
        config,
        student
      )
    ]);
  }
  return void 0;
};
var createDraftOrArchivedLifecycleRow = (config, student, repositoryFullName) => {
  const assignmentStatus = config.assignment.assignment.status;
  if (assignmentStatus === DRAFT_ASSIGNMENT_STATUS) {
    return createRow(student, repositoryFullName, "blocked", assignmentStatus, [
      createLifecycleDiagnostic(
        ASSIGNMENT_NOT_ACTIVE_CODE,
        "Draft assignments cannot be applied.",
        config,
        student
      )
    ]);
  }
  if (assignmentStatus === ARCHIVED_ASSIGNMENT_STATUS) {
    return createRow(student, repositoryFullName, "blocked", assignmentStatus, [
      createLifecycleDiagnostic(
        ASSIGNMENT_ARCHIVED_CODE,
        "Archived assignments cannot be applied.",
        config,
        student
      )
    ]);
  }
  return void 0;
};
var getSkippedStudentReason = (status) => `${STUDENT_STATUS_REASON_PREFIX}_${status}`;
var previewRepositoryWithClient = async (config, student, repositoryName, manifestRecord, githubClient) => {
  const owner = config.course.github.organization;
  const repositoryFullName = `${owner}/${repositoryName}`;
  const blockingLifecycleRow = createDraftOrArchivedLifecycleRow(
    config,
    student,
    repositoryFullName
  );
  if (blockingLifecycleRow !== void 0) {
    return blockingLifecycleRow;
  }
  if (manifestRecord !== void 0) {
    try {
      const existingRepository = await githubClient.getRepository(owner, repositoryName);
      if (existingRepository === null) {
        return createRow(student, repositoryFullName, "blocked", "manifest_repository_missing", [
          createManifestTrackedMissingDiagnostic(owner, repositoryName, student)
        ]);
      }
      return createRow(student, repositoryFullName, "would_update", "manifest_tracked_repository");
    } catch (error) {
      return createRow(
        student,
        repositoryFullName,
        "unknown",
        UNKNOWN_REASON_REPOSITORY_STATUS_UNKNOWN,
        [createRepositoryStatusUnknownDiagnostic(error, owner, repositoryName, student)]
      );
    }
  }
  const lifecycleRow = createLifecycleRow(config, student, repositoryFullName);
  if (lifecycleRow !== void 0) {
    return lifecycleRow;
  }
  if (config.assignment.assignment.status !== ACTIVE_ASSIGNMENT_STATUS) {
    return createRow(
      student,
      repositoryFullName,
      "would_skip",
      config.assignment.assignment.status
    );
  }
  try {
    const existingRepository = await githubClient.getRepository(owner, repositoryName);
    return existingRepository === null ? createRow(student, repositoryFullName, "would_create", "student_repository_missing") : createRow(student, repositoryFullName, "would_update", "student_repository_exists");
  } catch (error) {
    return createRow(
      student,
      repositoryFullName,
      "unknown",
      UNKNOWN_REASON_REPOSITORY_STATUS_UNKNOWN,
      [createRepositoryStatusUnknownDiagnostic(error, owner, repositoryName, student)]
    );
  }
};
var previewRepositoryWithoutClient = (config, student, repositoryName, manifestRecord) => {
  const repositoryFullName = `${config.course.github.organization}/${repositoryName}`;
  const blockingLifecycleRow = createDraftOrArchivedLifecycleRow(
    config,
    student,
    repositoryFullName
  );
  const lifecycleRow = blockingLifecycleRow ?? (manifestRecord === void 0 ? createLifecycleRow(config, student, repositoryFullName) : void 0);
  return lifecycleRow ?? createRow(student, repositoryFullName, "unknown", UNKNOWN_REASON_TOKEN_REQUIRED);
};
var previewStudentRepository = async (config, student, manifest, githubClient) => {
  const generatedName = getRepositoryNameDiagnostics(config, student);
  const owner = config.course.github.organization;
  const manifestRecord = findManifestRecord(manifest, student);
  const repositoryName = manifestRecord?.repository.name ?? generatedName.repositoryName;
  const repositoryFullName = `${owner}/${repositoryName}`;
  if (student.status !== ROSTER_STATUS_ACTIVE) {
    return createRow(
      student,
      repositoryFullName,
      "would_skip",
      getSkippedStudentReason(student.status)
    );
  }
  if (generatedName.diagnostics.some((diagnostic2) => diagnostic2.severity === "error")) {
    return createRow(student, repositoryFullName, "blocked", "invalid_repository_name", [
      ...generatedName.diagnostics
    ]);
  }
  if (githubClient === void 0) {
    return previewRepositoryWithoutClient(config, student, repositoryName, manifestRecord);
  }
  return previewRepositoryWithClient(config, student, repositoryName, manifestRecord, githubClient);
};
var createPlanSummary = (repositories) => ({
  wouldCreateRepositories: repositories.filter((row) => row.status === "would_create").length,
  wouldUpdateRepositories: repositories.filter((row) => row.status === "would_update").length,
  wouldSkipRepositories: repositories.filter((row) => row.status === "would_skip").length,
  blockedRepositories: repositories.filter((row) => row.status === "blocked").length,
  unknownRepositories: repositories.filter((row) => row.status === "unknown").length
});
var collectRowDiagnostics = (repositories) => repositories.flatMap((row) => row.diagnostics);
var hasErrorDiagnostics = (diagnostics) => diagnostics.some((diagnostic2) => diagnostic2.severity === "error");
var createApplyAction = (config, diagnostics, summary) => {
  const assignmentStatus = config.assignment.assignment.status;
  const lifecycleAllowsApply = assignmentStatus === ACTIVE_ASSIGNMENT_STATUS || assignmentStatus === CLOSED_ASSIGNMENT_STATUS;
  const blocked = hasErrorDiagnostics(diagnostics) || summary.blockedRepositories > EMPTY_COUNT2 || summary.unknownRepositories > EMPTY_COUNT2 || !lifecycleAllowsApply;
  return {
    available: !blocked,
    implemented: false,
    previewOnly: true,
    ...blocked ? { reason: "preview_has_blockers" } : {}
  };
};
var createStatus = (diagnostics) => hasErrorDiagnostics(diagnostics) ? "partial_success" : "success";
var createTemplateSource = (template) => `${template.repository}@${template.branch}`;
var buildAssignmentApplyPreview = async ({
  cwd,
  assignmentFile,
  githubClient
}) => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });
  if (configResult.status === "failure") {
    return createEmptyAssignmentApplyPreviewResult("failure", configResult.diagnostics);
  }
  const { config } = configResult;
  const rosterResult = loadAssignmentRosters(config);
  if (rosterResult.errors.length > EMPTY_COUNT2) {
    return createEmptyAssignmentApplyPreviewResult("failure", [
      ...configResult.diagnostics,
      ...rosterResult.warnings,
      ...rosterResult.errors
    ]);
  }
  if (rosterResult.students.length === EMPTY_COUNT2) {
    return createEmptyAssignmentApplyPreviewResult("failure", [
      ...configResult.diagnostics,
      createTargetStudentsEmptyDiagnostic(config)
    ]);
  }
  if (config.assignment.repository_mode === "group") {
    const groupPlan = buildGroupApplyPreviewPlan(config, rosterResult.students);
    const localTemplate2 = createTemplatePreview(config);
    const localGrading2 = createGradingPreview(config);
    const readiness2 = await checkAssignmentDetailGithubReadiness({
      config,
      template: localTemplate2,
      grading: localGrading2,
      ...githubClient === void 0 ? {} : { githubClient }
    });
    const diagnostics2 = [
      ...configResult.diagnostics,
      ...rosterResult.warnings,
      ...groupPlan.warnings,
      ...groupPlan.errors,
      ...readiness2.diagnostics,
      createWarningDiagnostic(
        "group_repository_apply_not_implemented",
        "Group repository Apply Preview is available. Group repository creation is not implemented yet.",
        { assignmentFile: config.summary.assignmentConfigPath }
      )
    ];
    const status2 = groupPlan.errors.length === EMPTY_COUNT2 ? createStatus(diagnostics2) : "failure";
    const summary2 = {
      wouldCreateRepositories: groupPlan.targets.length,
      wouldUpdateRepositories: EMPTY_COUNT2,
      wouldSkipRepositories: EMPTY_COUNT2,
      blockedRepositories: groupPlan.errors.length === EMPTY_COUNT2 ? EMPTY_COUNT2 : groupPlan.targets.length,
      unknownRepositories: EMPTY_COUNT2
    };
    return {
      schemaVersion: ASSIGNMENT_APPLY_PREVIEW_SCHEMA_VERSION,
      commandName: COMMAND_NAME,
      status: status2,
      exitCode: resolveExitCode(status2),
      diagnostics: diagnostics2,
      repositoryMode: "group",
      applySupported: false,
      assignment: {
        slug: config.assignment.assignment.slug,
        title: config.assignment.assignment.title,
        file: config.summary.assignmentConfigPath,
        status: config.assignment.assignment.status
      },
      course: { slug: config.course.course.code, title: config.course.course.title },
      term: { slug: config.term.term.code, title: config.term.term.display_name },
      target: {
        sections: config.assignment.sections,
        sectionCount: config.assignment.sections.length,
        studentCount: rosterResult.summary.studentCount
      },
      template: readiness2.template,
      grading: readiness2.grading,
      plan: { summary: summary2, repositories: [], groupTargets: groupPlan.targets },
      files: {
        assignmentFile: config.summary.assignmentConfigPath,
        workflowFile: readiness2.grading.workflow,
        templateSource: createTemplateSource(readiness2.template)
      },
      actions: {
        apply: {
          available: false,
          implemented: false,
          previewOnly: true,
          reason: "group_repository_apply_not_implemented"
        }
      }
    };
  }
  const manifestPath = createManifestPath(
    config.summary.repoRoot,
    config.summary.termCode,
    config.summary.assignmentSlug
  );
  const manifestResult = loadManifest(manifestPath.absolutePath);
  const manifest = manifestResult.status === "loaded" ? manifestResult.manifest : void 0;
  const localTemplate = createTemplatePreview(config);
  const localGrading = createGradingPreview(config);
  const readiness = await checkAssignmentDetailGithubReadiness({
    config,
    template: localTemplate,
    grading: localGrading,
    ...githubClient === void 0 ? {} : { githubClient }
  });
  const repositoryRows = await Promise.all(
    rosterResult.students.map(
      (student) => previewStudentRepository(config, student, manifest, githubClient)
    )
  );
  const summary = createPlanSummary(repositoryRows);
  const diagnostics = [
    ...configResult.diagnostics,
    ...rosterResult.warnings,
    ...manifestResult.warnings,
    ...manifestResult.errors,
    ...readiness.diagnostics,
    ...collectRowDiagnostics(repositoryRows)
  ];
  const status = createStatus(diagnostics);
  const action2 = createApplyAction(config, diagnostics, summary);
  return {
    schemaVersion: ASSIGNMENT_APPLY_PREVIEW_SCHEMA_VERSION,
    commandName: COMMAND_NAME,
    status,
    exitCode: resolveExitCode(status),
    diagnostics,
    assignment: {
      slug: config.assignment.assignment.slug,
      title: config.assignment.assignment.title,
      file: config.summary.assignmentConfigPath,
      status: config.assignment.assignment.status
    },
    course: {
      slug: config.course.course.code,
      title: config.course.course.title
    },
    term: {
      slug: config.term.term.code,
      title: config.term.term.display_name
    },
    target: {
      sections: config.assignment.sections,
      sectionCount: config.assignment.sections.length,
      studentCount: rosterResult.summary.studentCount
    },
    template: readiness.template,
    grading: readiness.grading,
    plan: {
      summary,
      repositories: repositoryRows
    },
    files: {
      assignmentFile: config.summary.assignmentConfigPath,
      workflowFile: readiness.grading.workflow,
      templateSource: createTemplateSource(readiness.template)
    },
    actions: {
      apply: action2
    }
  };
};

// src/workflows/workflow-paths.ts
import path7 from "path";
var TERMS_DIRECTORY3 = "terms";
var GENERATED_WORKFLOWS_DIRECTORY = "generated-workflows";
var WORKFLOW_FILE_NAME = "grade.yml";
var GITHUB_WORKFLOWS_DIRECTORY = ".github/workflows";
var WORKFLOW_PATH_SEPARATOR = "/";
var WINDOWS_PATH_SEPARATOR_PATTERN = /\\/g;
var createGeneratedWorkflowPath = (repoRoot, termCode, assignmentSlug) => {
  const relativePath = [
    TERMS_DIRECTORY3,
    termCode,
    GENERATED_WORKFLOWS_DIRECTORY,
    assignmentSlug,
    WORKFLOW_FILE_NAME
  ].join("/");
  return {
    absolutePath: path7.join(repoRoot, relativePath),
    relativePath
  };
};
var normalizeWorkflowPath = (workflowPath) => workflowPath.replace(WINDOWS_PATH_SEPARATOR_PATTERN, WORKFLOW_PATH_SEPARATOR);
var getWorkflowRepositoryPath = (configuredWorkflow) => {
  const normalizedWorkflow = normalizeWorkflowPath(configuredWorkflow);
  return normalizedWorkflow.includes(WORKFLOW_PATH_SEPARATOR) ? normalizedWorkflow : [GITHUB_WORKFLOWS_DIRECTORY, normalizedWorkflow].join(WORKFLOW_PATH_SEPARATOR);
};
var getWorkflowDispatchIdentifier = (configuredWorkflow) => path7.posix.basename(normalizeWorkflowPath(configuredWorkflow));
var uniqueWorkflowPaths = (paths) => [...new Set(paths)];
var createLocalWorkflowPathCandidates = (configuredWorkflow) => uniqueWorkflowPaths([
  normalizeWorkflowPath(configuredWorkflow),
  getWorkflowRepositoryPath(configuredWorkflow)
]);
var createRepositoryWorkflowPathCandidates = (configuredWorkflow) => uniqueWorkflowPaths([
  getWorkflowRepositoryPath(configuredWorkflow),
  normalizeWorkflowPath(configuredWorkflow)
]);

// src/grade-preview/grade-preview-models.ts
var ASSIGNMENT_GRADE_PREVIEW_SCHEMA_VERSION = 1;

// src/grade-preview/grade-preview-builder.ts
var COMMAND_NAME2 = "assignment grade-preview";
var EMPTY_COUNT3 = 0;
var SUCCESS_EXIT_CODE2 = 0;
var FAILURE_EXIT_CODE2 = 1;
var PARTIAL_SUCCESS_EXIT_CODE2 = 2;
var LEGACY_GRADING_MODE3 = "custom-workflow";
var TOKEN_REQUIRED_REASON = "token_required";
var WORKFLOW_DISPATCH_AVAILABLE_REASON = "workflow_dispatch_available";
var STUDENT_STATUS_REASON_PREFIX2 = "student_status";
var ACTIVE_ASSIGNMENT_STATUSES = ["active", "closed"];
var resolveExitCode2 = (status) => {
  if (status === "success") {
    return SUCCESS_EXIT_CODE2;
  }
  return status === "partial_success" ? PARTIAL_SUCCESS_EXIT_CODE2 : FAILURE_EXIT_CODE2;
};
var createEmptyAssignmentGradePreviewResult = (status, diagnostics) => ({
  schemaVersion: ASSIGNMENT_GRADE_PREVIEW_SCHEMA_VERSION,
  commandName: COMMAND_NAME2,
  status,
  exitCode: resolveExitCode2(status),
  diagnostics,
  assignment: null,
  course: null,
  term: null,
  target: null,
  grading: null,
  plan: null,
  files: null,
  actions: null
});
var getEffectiveGrading = (config) => config.assignment.grading === void 0 ? config.course.grading : config.assignment.grading;
var createGradingNotConfiguredWarning = () => createWarningDiagnostic(
  GRADING_NOT_CONFIGURED_CODE,
  "Automated grading is not configured for this assignment."
);
var createTokenRequiredDiagnostic2 = () => createConfigDiagnostic(
  GITHUB_TOKEN_REQUIRED_CODE,
  "GitHub token required to check student repository workflow dispatch readiness."
);
var createTargetStudentsEmptyDiagnostic2 = (config) => createConfigDiagnostic(
  TARGET_MATCHES_NO_STUDENTS_CODE,
  "Assignment grade preview found no target students.",
  {
    assignmentFile: config.summary.assignmentConfigPath,
    sections: config.assignment.sections
  }
);
var createAssignmentStatusBlocksGradeDiagnostic = (config, student) => createConfigDiagnostic(
  ASSIGNMENT_STATUS_BLOCKS_GRADE_CODE,
  `Assignment status ${config.assignment.assignment.status} does not allow grade.`,
  {
    assignmentStatus: config.assignment.assignment.status,
    assignmentFile: config.summary.assignmentConfigPath,
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section
  }
);
var createStudentRepositoryMissingDiagnostic = (student) => createConfigDiagnostic(
  STUDENT_REPOSITORY_MISSING_CODE,
  "Selected student does not have a manifest-tracked repository.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section
  }
);
var createManifestTrackedRepositoryMissingDiagnostic = (student, repository) => createConfigDiagnostic(
  STUDENT_REPOSITORY_MISSING_CODE,
  "Manifest-tracked student repository was not found.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    repository: repository.repository.fullName
  }
);
var createWorkflowMissingDiagnostic = (student, repository, workflowPath) => createConfigDiagnostic(
  GRADING_WORKFLOW_MISSING_CODE,
  "Configured grading workflow was not found.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    repository: repository.repository.fullName,
    workflowPath
  }
);
var createWorkflowDispatchMissingDiagnostic2 = (student, repository, workflowPath) => createConfigDiagnostic(
  WORKFLOW_DISPATCH_MISSING_CODE,
  "Configured grading workflow does not support manual dispatch.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    repository: repository.repository.fullName,
    workflowPath
  }
);
var createRepositoryStatusUnknownDiagnostic2 = (error, student, repository) => {
  if (error instanceof GitHubClientError) {
    return createConfigDiagnostic(
      error.diagnosticCode,
      `Could not check repository ${repository.repository.fullName}: ${error.message}`,
      {
        studentId: student.studentId,
        githubUsername: student.githubUsername,
        section: student.section,
        repository: repository.repository.fullName,
        kind: error.kind,
        retryable: error.retryable,
        ...error.retryAfterSeconds === void 0 ? {} : { retryAfterSeconds: error.retryAfterSeconds }
      }
    );
  }
  return createConfigDiagnostic(
    STUDENT_REPOSITORY_STATUS_UNKNOWN_CODE,
    `Could not check repository ${repository.repository.fullName}.`,
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      repository: repository.repository.fullName
    }
  );
};
var createGradingPreview2 = (config, workflowDispatch) => {
  const grading = getEffectiveGrading(config);
  const resolvedFrom = config.summary.gradingSource === "assignment" ? "assignment_override" : "course_default";
  if (!grading.enabled) {
    return {
      enabled: false,
      resolvedFrom,
      mode: grading.mode ?? DISABLED_GRADING_MODE,
      workflow: null,
      artifact: null,
      resultFile: null,
      workflowDispatch: "not_required",
      workflowRef: null
    };
  }
  return {
    enabled: true,
    resolvedFrom,
    mode: grading.mode ?? LEGACY_GRADING_MODE3,
    workflow: grading.workflow ?? null,
    artifact: grading.artifact ?? null,
    resultFile: grading.result_file ?? null,
    workflowDispatch,
    workflowRef: config.assignment.template.branch
  };
};
var findManifestRecord2 = (manifest, student) => manifest?.repositories.find(
  (record) => record.studentId === student.studentId && record.section === student.section
);
var createRow2 = (student, repository, status, reason, workflow, ref, diagnostics = []) => ({
  studentId: student.studentId,
  githubUsername: student.githubUsername,
  section: student.section,
  repository,
  status,
  reason,
  workflow,
  ref,
  diagnostics
});
var createSkippedStudentRow = (student, repository) => createRow2(
  student,
  repository?.repository.fullName ?? null,
  "would_skip",
  `${STUDENT_STATUS_REASON_PREFIX2}_${student.status}`,
  null,
  null
);
var createBlockedLifecycleRow = (config, student, repository, workflowPath) => createRow2(
  student,
  repository?.repository.fullName ?? null,
  "blocked",
  config.assignment.assignment.status,
  workflowPath,
  config.assignment.template.branch,
  [createAssignmentStatusBlocksGradeDiagnostic(config, student)]
);
var createGradingDisabledRow = (student, repository) => createRow2(
  student,
  repository?.repository.fullName ?? null,
  "would_skip",
  GRADING_NOT_CONFIGURED_CODE,
  null,
  null
);
var createMissingManifestRow = (student, workflowPath, ref) => createRow2(student, null, "blocked", STUDENT_REPOSITORY_MISSING_CODE, workflowPath, ref, [
  createStudentRepositoryMissingDiagnostic(student)
]);
var previewDispatchableRepository = async (student, repository, githubClient, workflowPath, ref) => {
  try {
    const existingRepository = await githubClient.getRepository(
      repository.repository.owner,
      repository.repository.name
    );
    if (existingRepository === null) {
      return createRow2(
        student,
        repository.repository.fullName,
        "blocked",
        STUDENT_REPOSITORY_MISSING_CODE,
        workflowPath,
        ref,
        [createManifestTrackedRepositoryMissingDiagnostic(student, repository)]
      );
    }
    const workflow = await githubClient.getWorkflow(
      repository.repository.owner,
      repository.repository.name,
      getWorkflowDispatchIdentifier(workflowPath)
    );
    if (workflow === null) {
      return createRow2(
        student,
        repository.repository.fullName,
        "blocked",
        GRADING_WORKFLOW_MISSING_CODE,
        workflowPath,
        ref,
        [createWorkflowMissingDiagnostic(student, repository, workflowPath)]
      );
    }
    if (!workflow.supportsDispatch) {
      return createRow2(
        student,
        repository.repository.fullName,
        "blocked",
        WORKFLOW_DISPATCH_MISSING_CODE,
        workflowPath,
        ref,
        [createWorkflowDispatchMissingDiagnostic2(student, repository, workflowPath)]
      );
    }
    return createRow2(
      student,
      repository.repository.fullName,
      "would_dispatch",
      WORKFLOW_DISPATCH_AVAILABLE_REASON,
      workflowPath,
      ref
    );
  } catch (error) {
    return createRow2(
      student,
      repository.repository.fullName,
      "unknown",
      STUDENT_REPOSITORY_STATUS_UNKNOWN_CODE,
      workflowPath,
      ref,
      [createRepositoryStatusUnknownDiagnostic2(error, student, repository)]
    );
  }
};
var previewStudentRepository2 = async (config, student, manifest, githubClient) => {
  const grading = getEffectiveGrading(config);
  const workflowPath = grading.workflow ?? null;
  const workflowRef = grading.enabled ? config.assignment.template.branch : null;
  const repository = findManifestRecord2(manifest, student);
  if (student.status !== ROSTER_STATUS_ACTIVE) {
    return createSkippedStudentRow(student, repository);
  }
  if (!grading.enabled || workflowPath === null) {
    return createGradingDisabledRow(student, repository);
  }
  if (!ACTIVE_ASSIGNMENT_STATUSES.some((status) => status === config.assignment.assignment.status)) {
    return createBlockedLifecycleRow(config, student, repository, workflowPath);
  }
  if (repository === void 0) {
    return createMissingManifestRow(student, workflowPath, workflowRef);
  }
  if (githubClient === void 0) {
    return createRow2(
      student,
      repository.repository.fullName,
      "token_required",
      TOKEN_REQUIRED_REASON,
      workflowPath,
      workflowRef
    );
  }
  return previewDispatchableRepository(
    student,
    repository,
    githubClient,
    workflowPath,
    config.assignment.template.branch
  );
};
var createPlanSummary2 = (repositories) => ({
  wouldDispatch: repositories.filter((row) => row.status === "would_dispatch").length,
  wouldSkip: repositories.filter((row) => row.status === "would_skip").length,
  blocked: repositories.filter((row) => row.status === "blocked").length,
  unknown: repositories.filter((row) => row.status === "unknown" || row.status === "token_required").length
});
var collectRowDiagnostics2 = (repositories) => repositories.flatMap((row) => row.diagnostics);
var hasErrorDiagnostics2 = (diagnostics) => diagnostics.some((diagnostic2) => diagnostic2.severity === "error");
var hasTokenRequiredRows = (repositories) => repositories.some((row) => row.status === "token_required");
var createStatus2 = (diagnostics) => hasErrorDiagnostics2(diagnostics) ? "partial_success" : "success";
var createGradeAction = (diagnostics, summary) => {
  const blocked = hasErrorDiagnostics2(diagnostics) || summary.blocked > EMPTY_COUNT3 || summary.unknown > EMPTY_COUNT3 || summary.wouldDispatch === EMPTY_COUNT3;
  return {
    available: !blocked,
    implemented: false,
    previewOnly: true,
    ...blocked ? { reason: "preview_has_blockers" } : {}
  };
};
var createWorkflowDispatchStatus = (grading, repositories) => {
  if (!grading.enabled) {
    return "not_required";
  }
  if (repositories.some((row) => row.status === "token_required" || row.status === "unknown")) {
    return "not_checked";
  }
  if (repositories.some(
    (row) => row.reason === GRADING_WORKFLOW_MISSING_CODE || row.reason === WORKFLOW_DISPATCH_MISSING_CODE
  )) {
    return "missing";
  }
  return repositories.some((row) => row.status === "would_dispatch") ? "available" : "not_checked";
};
var buildAssignmentGradePreview = async ({
  cwd,
  assignmentFile,
  githubClient
}) => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });
  if (configResult.status === "failure") {
    return createEmptyAssignmentGradePreviewResult("failure", configResult.diagnostics);
  }
  const { config } = configResult;
  const rosterResult = loadAssignmentRosters(config);
  if (rosterResult.errors.length > EMPTY_COUNT3) {
    return createEmptyAssignmentGradePreviewResult("failure", [
      ...configResult.diagnostics,
      ...rosterResult.warnings,
      ...rosterResult.errors
    ]);
  }
  if (rosterResult.students.length === EMPTY_COUNT3) {
    return createEmptyAssignmentGradePreviewResult("failure", [
      ...configResult.diagnostics,
      createTargetStudentsEmptyDiagnostic2(config)
    ]);
  }
  const manifestPath = createManifestPath(
    config.summary.repoRoot,
    config.summary.termCode,
    config.summary.assignmentSlug
  );
  const grading = getEffectiveGrading(config);
  const manifestResult = loadManifest(manifestPath.absolutePath, { required: grading.enabled });
  const manifest = manifestResult.status === "loaded" ? manifestResult.manifest : void 0;
  const repositoryRows = await Promise.all(
    rosterResult.students.map(
      (student) => previewStudentRepository2(config, student, manifest, githubClient)
    )
  );
  const summary = createPlanSummary2(repositoryRows);
  const rowDiagnostics = collectRowDiagnostics2(repositoryRows);
  const diagnostics = [
    ...configResult.diagnostics,
    ...rosterResult.warnings,
    ...manifestResult.warnings,
    ...manifestResult.errors,
    ...!grading.enabled ? [createGradingNotConfiguredWarning()] : [],
    ...hasTokenRequiredRows(repositoryRows) ? [createTokenRequiredDiagnostic2()] : [],
    ...rowDiagnostics
  ];
  const status = createStatus2(diagnostics);
  return {
    schemaVersion: ASSIGNMENT_GRADE_PREVIEW_SCHEMA_VERSION,
    commandName: COMMAND_NAME2,
    status,
    exitCode: resolveExitCode2(status),
    diagnostics,
    assignment: {
      slug: config.assignment.assignment.slug,
      title: config.assignment.assignment.title,
      file: config.summary.assignmentConfigPath,
      status: config.assignment.assignment.status
    },
    course: {
      slug: config.course.course.code,
      title: config.course.course.title
    },
    term: {
      slug: config.term.term.code,
      title: config.term.term.display_name
    },
    target: {
      sections: config.assignment.sections,
      sectionCount: config.assignment.sections.length,
      studentCount: rosterResult.summary.studentCount,
      activeStudentCount: rosterResult.summary.activeStudentCount
    },
    grading: createGradingPreview2(config, createWorkflowDispatchStatus(grading, repositoryRows)),
    plan: {
      summary,
      repositories: repositoryRows
    },
    files: {
      assignmentFile: config.summary.assignmentConfigPath,
      manifestFile: manifestPath.relativePath,
      workflowFile: grading.workflow ?? null
    },
    actions: {
      grade: createGradeAction(diagnostics, summary)
    }
  };
};

// src/grade-status/grade-status-models.ts
var ASSIGNMENT_GRADE_STATUS_SCHEMA_VERSION = 1;

// src/grade-status/grade-status-builder.ts
var COMMAND_NAME3 = "assignment grade-status";
var EMPTY_COUNT4 = 0;
var SUCCESS_EXIT_CODE3 = 0;
var FAILURE_EXIT_CODE3 = 1;
var PARTIAL_SUCCESS_EXIT_CODE3 = 2;
var LEGACY_GRADING_MODE4 = "custom-workflow";
var TOKEN_REQUIRED_REASON2 = "token_required";
var LATEST_WORKFLOW_RUN_SELECTION = "latest_configured_workflow_run";
var NO_RUN_SELECTION = "no_configured_workflow_run";
var ACTIVE_ASSIGNMENT_STATUSES2 = ["active", "closed"];
var GITHUB_HOST = "github.com";
var ACTIONS_RUN_PATH_SEGMENT_COUNT = 5;
var resolveExitCode3 = (status) => {
  if (status === "success") {
    return SUCCESS_EXIT_CODE3;
  }
  return status === "partial_success" ? PARTIAL_SUCCESS_EXIT_CODE3 : FAILURE_EXIT_CODE3;
};
var createEmptyAssignmentGradeStatusResult = (status, diagnostics) => ({
  schemaVersion: ASSIGNMENT_GRADE_STATUS_SCHEMA_VERSION,
  commandName: COMMAND_NAME3,
  status,
  exitCode: resolveExitCode3(status),
  diagnostics,
  assignment: null,
  course: null,
  term: null,
  target: null,
  grading: null,
  summary: null,
  repositories: [],
  actions: null
});
var getEffectiveGrading2 = (config) => config.assignment.grading === void 0 ? config.course.grading : config.assignment.grading;
var createGradingNotConfiguredWarning2 = () => createWarningDiagnostic(
  GRADING_NOT_CONFIGURED_CODE,
  "Automated grading is not configured for this assignment."
);
var createTokenRequiredDiagnostic3 = () => createConfigDiagnostic(
  GITHUB_TOKEN_REQUIRED_CODE,
  "GitHub token required to check student repository grading workflow run status."
);
var createTargetStudentsEmptyDiagnostic3 = (config) => createConfigDiagnostic(
  TARGET_MATCHES_NO_STUDENTS_CODE,
  "Assignment grade status found no target students.",
  {
    assignmentFile: config.summary.assignmentConfigPath,
    sections: config.assignment.sections
  }
);
var createStudentFilterUnknownDiagnostic = (config, studentId) => createConfigDiagnostic(
  STUDENT_FILTER_UNKNOWN_STUDENT_CODE,
  "Student filter did not match an active target student.",
  {
    assignmentFile: config.summary.assignmentConfigPath,
    studentId
  }
);
var createStudentFilterNoMatchesDiagnostic = (config, studentIds) => createConfigDiagnostic(
  STUDENT_FILTER_NO_MATCHES_CODE,
  "Student filter did not match any active target students.",
  {
    assignmentFile: config.summary.assignmentConfigPath,
    studentIds
  }
);
var createAssignmentStatusBlocksGradeDiagnostic2 = (config, student) => createConfigDiagnostic(
  ASSIGNMENT_STATUS_BLOCKS_GRADE_CODE,
  `Assignment status ${config.assignment.assignment.status} does not allow grade status.`,
  {
    assignmentStatus: config.assignment.assignment.status,
    assignmentFile: config.summary.assignmentConfigPath,
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section
  }
);
var createStudentRepositoryMissingDiagnostic2 = (student) => createConfigDiagnostic(
  STUDENT_REPOSITORY_MISSING_CODE,
  "Selected student does not have a manifest-tracked repository.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section
  }
);
var createWorkflowRunMissingDiagnostic = (student, repository, workflowPath) => createConfigDiagnostic(
  GRADING_WORKFLOW_RUN_MISSING_CODE,
  "No grading workflow run was found for the configured workflow.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    repository: repository.repository.fullName,
    workflowPath
  }
);
var createWorkflowStatusUnknownDiagnostic = (error, student, repository) => {
  if (error instanceof GitHubClientError) {
    return createConfigDiagnostic(
      error.diagnosticCode,
      `Could not check grading workflow run status for ${repository.repository.fullName}.`,
      {
        studentId: student.studentId,
        githubUsername: student.githubUsername,
        section: student.section,
        repository: repository.repository.fullName,
        kind: error.kind,
        retryable: error.retryable,
        ...error.retryAfterSeconds === void 0 ? {} : { retryAfterSeconds: error.retryAfterSeconds }
      }
    );
  }
  return createConfigDiagnostic(
    GRADING_WORKFLOW_STATUS_UNKNOWN_CODE,
    `Could not check grading workflow run status for ${repository.repository.fullName}.`,
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      repository: repository.repository.fullName
    }
  );
};
var createWorkflowRunInProgressDiagnostic = (student, repository, run, workflowPath) => createWarningDiagnostic(
  GRADING_WORKFLOW_RUN_IN_PROGRESS_CODE,
  "Grading workflow run is not complete yet.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    repository: repository.repository.fullName,
    workflowPath,
    runId: run.id,
    status: run.status
  }
);
var createWorkflowRunFailedDiagnostic = (student, repository, run, workflowPath, conclusion) => createConfigDiagnostic(
  GRADING_WORKFLOW_RUN_FAILED_CODE,
  "Grading workflow run completed with a non-success conclusion.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    repository: repository.repository.fullName,
    workflowPath,
    runId: run.id,
    conclusion
  }
);
var createGradingStatus = (config) => {
  const grading = getEffectiveGrading2(config);
  const resolvedFrom = config.summary.gradingSource === "assignment" ? "assignment_override" : "course_default";
  if (!grading.enabled) {
    return {
      enabled: false,
      resolvedFrom,
      mode: grading.mode ?? DISABLED_GRADING_MODE,
      workflow: null,
      artifact: null,
      resultFile: null,
      workflowRef: null
    };
  }
  return {
    enabled: true,
    resolvedFrom,
    mode: grading.mode ?? LEGACY_GRADING_MODE4,
    workflow: grading.workflow ?? null,
    artifact: grading.artifact ?? null,
    resultFile: grading.result_file ?? null,
    workflowRef: config.assignment.template.branch
  };
};
var findManifestRecord3 = (manifest, student) => manifest?.repositories.find(
  (record) => record.studentId === student.studentId && record.section === student.section
);
var normalizeConclusion = (conclusion) => {
  if (conclusion === null) {
    return "unknown";
  }
  return conclusion;
};
var getRunTimestamp = (run) => run.startedAt ?? run.createdAt;
var sortRunsNewestFirst = (runs) => [...runs].sort((left, right) => getRunTimestamp(right).localeCompare(getRunTimestamp(left)));
var selectLatestWorkflowRun = (runs) => sortRunsNewestFirst(runs)[0] ?? null;
var createFallbackRunUrl = (repository, run) => `https://${GITHUB_HOST}/${repository.repository.fullName}/actions/runs/${String(run.id)}`;
var isMatchingRunUrl = (urlValue, repository, runId) => {
  try {
    const url = new URL(urlValue);
    const pathParts = url.pathname.split("/").filter((part) => part.length > 0);
    const [owner, repo, actions, runs, pathRunId] = pathParts;
    return url.protocol === "https:" && url.hostname === GITHUB_HOST && url.search.length === 0 && url.hash.length === 0 && pathParts.length === ACTIONS_RUN_PATH_SEGMENT_COUNT && owner === repository.repository.owner && repo === repository.repository.name && actions === "actions" && runs === "runs" && pathRunId === String(runId);
  } catch {
    return false;
  }
};
var createRunUrl = (repository, run) => run.runUrl !== void 0 && isMatchingRunUrl(run.runUrl, repository, run.id) ? run.runUrl : createFallbackRunUrl(repository, run);
var createRow3 = (student, repository, status, reason, workflow, ref, diagnostics = [], run = null, repositoryRecord = null) => {
  const conclusion = run === null ? "unknown" : normalizeConclusion(run.conclusion);
  const failedConclusion = conclusion === "failure" || conclusion === "cancelled" || conclusion === "timed_out";
  const needsAttention = status === "missing" || status === "unknown" || status === "blocked" || status === "token_required" || failedConclusion;
  return {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    repository,
    workflow,
    ref,
    runId: run?.id ?? null,
    runUrl: run === null || repositoryRecord === null ? null : createRunUrl(repositoryRecord, run),
    status,
    conclusion,
    startedAt: run?.startedAt ?? run?.createdAt ?? null,
    completedAt: status === "completed" ? run?.completedAt ?? run?.updatedAt ?? null : null,
    selectionStrategy: run === null ? NO_RUN_SELECTION : LATEST_WORKFLOW_RUN_SELECTION,
    reason,
    needsAttention,
    diagnostics
  };
};
var createGradingDisabledRow2 = (student, repository) => createRow3(
  student,
  repository?.repository.fullName ?? null,
  "blocked",
  GRADING_NOT_CONFIGURED_CODE,
  null,
  null
);
var createBlockedLifecycleRow2 = (config, student, repository, workflowPath) => createRow3(
  student,
  repository?.repository.fullName ?? null,
  "blocked",
  config.assignment.assignment.status,
  workflowPath,
  config.assignment.template.branch,
  [createAssignmentStatusBlocksGradeDiagnostic2(config, student)]
);
var createMissingManifestRow2 = (student, workflowPath, ref) => createRow3(student, null, "blocked", STUDENT_REPOSITORY_MISSING_CODE, workflowPath, ref, [
  createStudentRepositoryMissingDiagnostic2(student)
]);
var createTokenRequiredRow = (student, repository, workflowPath, ref) => createRow3(
  student,
  repository.repository.fullName,
  "token_required",
  TOKEN_REQUIRED_REASON2,
  workflowPath,
  ref
);
var mapRunStatus = (run) => {
  if (run.status === "in_progress") {
    return "in_progress";
  }
  return run.status;
};
var createRunRow = (student, repository, workflowPath, ref, run) => {
  const status = mapRunStatus(run);
  const conclusion = normalizeConclusion(run.conclusion);
  const reason = status === "completed" ? conclusion : status;
  const failedConclusion = conclusion === "failure" || conclusion === "cancelled" || conclusion === "timed_out";
  const diagnostics = status === "queued" || status === "in_progress" ? [createWorkflowRunInProgressDiagnostic(student, repository, run, workflowPath)] : failedConclusion ? [createWorkflowRunFailedDiagnostic(student, repository, run, workflowPath, conclusion)] : [];
  return createRow3(
    student,
    repository.repository.fullName,
    status,
    reason,
    workflowPath,
    ref,
    diagnostics,
    run,
    repository
  );
};
var createMissingRunRow = (student, repository, workflowPath, ref) => createRow3(
  student,
  repository.repository.fullName,
  "missing",
  GRADING_WORKFLOW_RUN_MISSING_CODE,
  workflowPath,
  ref,
  [createWorkflowRunMissingDiagnostic(student, repository, workflowPath)]
);
var createUnknownRunRow = (error, student, repository, workflowPath, ref) => createRow3(
  student,
  repository.repository.fullName,
  "unknown",
  GRADING_WORKFLOW_STATUS_UNKNOWN_CODE,
  workflowPath,
  ref,
  [createWorkflowStatusUnknownDiagnostic(error, student, repository)]
);
var getRepositoryWorkflowStatus = async (student, repository, githubClient, workflowPath, ref) => {
  try {
    const runs = await githubClient.listWorkflowRuns({
      owner: repository.repository.owner,
      repo: repository.repository.name,
      workflowPath: getWorkflowDispatchIdentifier(workflowPath)
    });
    const run = selectLatestWorkflowRun(runs);
    return run === null ? createMissingRunRow(student, repository, workflowPath, ref) : createRunRow(student, repository, workflowPath, ref, run);
  } catch (error) {
    return createUnknownRunRow(error, student, repository, workflowPath, ref);
  }
};
var createRepositoryStatusRow = async (config, student, manifest, githubClient) => {
  const grading = getEffectiveGrading2(config);
  const workflowPath = grading.workflow ?? null;
  const workflowRef = grading.enabled ? config.assignment.template.branch : null;
  const repository = findManifestRecord3(manifest, student);
  if (!grading.enabled || workflowPath === null) {
    return createGradingDisabledRow2(student, repository);
  }
  if (!ACTIVE_ASSIGNMENT_STATUSES2.some((status) => status === config.assignment.assignment.status)) {
    return createBlockedLifecycleRow2(config, student, repository, workflowPath);
  }
  if (repository === void 0) {
    return createMissingManifestRow2(student, workflowPath, workflowRef);
  }
  if (githubClient === void 0) {
    return createTokenRequiredRow(
      student,
      repository,
      workflowPath,
      config.assignment.template.branch
    );
  }
  return getRepositoryWorkflowStatus(
    student,
    repository,
    githubClient,
    workflowPath,
    config.assignment.template.branch
  );
};
var countRows = (repositories, predicate) => repositories.filter(predicate).length;
var createSummary3 = (repositories) => {
  const queued = countRows(repositories, (row) => row.status === "queued");
  const inProgress = countRows(repositories, (row) => row.status === "in_progress");
  const completed = countRows(repositories, (row) => row.status === "completed");
  const missing = countRows(repositories, (row) => row.status === "missing");
  const unknown = countRows(
    repositories,
    (row) => row.status === "unknown" || row.status === "token_required"
  );
  const blocked = countRows(repositories, (row) => row.status === "blocked");
  const readyForReport = repositories.length > EMPTY_COUNT4 && repositories.every((row) => row.status === "completed" && row.conclusion !== "unknown");
  return {
    totalRepositories: repositories.length,
    queued,
    inProgress,
    completed,
    successful: countRows(
      repositories,
      (row) => row.status === "completed" && row.conclusion === "success"
    ),
    failed: countRows(
      repositories,
      (row) => row.status === "completed" && row.conclusion === "failure"
    ),
    cancelled: countRows(
      repositories,
      (row) => row.status === "completed" && row.conclusion === "cancelled"
    ),
    timedOut: countRows(
      repositories,
      (row) => row.status === "completed" && row.conclusion === "timed_out"
    ),
    missing,
    unknown,
    blocked,
    needsAttention: countRows(repositories, (row) => row.needsAttention),
    readyForReport
  };
};
var createSections = (config, students, filtered) => {
  if (!filtered) {
    return config.assignment.sections;
  }
  return students.reduce(
    (sections, student) => sections.some((section) => section === student.section) ? sections : [...sections, student.section],
    []
  );
};
var createZeroSummary = () => createSummary3([]);
var findUnknownStudentIds = (activeStudents, studentIds) => studentIds.filter(
  (studentId) => !activeStudents.some((student) => student.studentId === studentId)
);
var filterActiveStudents = (activeStudents, studentIds) => studentIds === void 0 ? [...activeStudents] : activeStudents.filter(
  (student) => studentIds.some((studentId) => studentId === student.studentId)
);
var collectRowDiagnostics3 = (repositories) => repositories.flatMap((row) => row.diagnostics);
var hasErrorDiagnostics3 = (diagnostics) => diagnostics.some((diagnostic2) => diagnostic2.severity === "error");
var hasTokenRequiredRows2 = (repositories) => repositories.some((row) => row.status === "token_required");
var createStatus3 = (diagnostics) => hasErrorDiagnostics3(diagnostics) ? "partial_success" : "success";
var createActions = (summary) => ({
  refreshStatus: {
    available: true,
    implemented: true
  },
  generateReport: {
    available: summary.readyForReport,
    implemented: false,
    ...summary.readyForReport ? {} : { reason: "not_all_runs_complete" }
  }
});
var buildAssignmentGradeStatus = async ({
  cwd,
  assignmentFile,
  githubClient,
  studentIds
}) => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });
  if (configResult.status === "failure") {
    return createEmptyAssignmentGradeStatusResult("failure", configResult.diagnostics);
  }
  const { config } = configResult;
  const rosterResult = loadAssignmentRosters(config);
  if (rosterResult.errors.length > EMPTY_COUNT4) {
    return createEmptyAssignmentGradeStatusResult("failure", [
      ...configResult.diagnostics,
      ...rosterResult.warnings,
      ...rosterResult.errors
    ]);
  }
  if (rosterResult.students.length === EMPTY_COUNT4) {
    return createEmptyAssignmentGradeStatusResult("failure", [
      ...configResult.diagnostics,
      createTargetStudentsEmptyDiagnostic3(config)
    ]);
  }
  const manifestPath = createManifestPath(
    config.summary.repoRoot,
    config.summary.termCode,
    config.summary.assignmentSlug
  );
  const grading = getEffectiveGrading2(config);
  const manifestResult = loadManifest(manifestPath.absolutePath, { required: grading.enabled });
  const manifest = manifestResult.status === "loaded" ? manifestResult.manifest : void 0;
  const activeStudents = rosterResult.students.filter(
    (student) => student.status === ROSTER_STATUS_ACTIVE
  );
  if (activeStudents.length === EMPTY_COUNT4) {
    return createEmptyAssignmentGradeStatusResult("failure", [
      ...configResult.diagnostics,
      createTargetStudentsEmptyDiagnostic3(config)
    ]);
  }
  const filtered = studentIds !== void 0;
  const requestedStudentIds = studentIds ?? [];
  const selectedStudents = filterActiveStudents(activeStudents, studentIds);
  const unknownStudentIds = filtered ? findUnknownStudentIds(activeStudents, requestedStudentIds) : [];
  const filterDiagnostics = [
    ...unknownStudentIds.map(
      (studentId) => createStudentFilterUnknownDiagnostic(config, studentId)
    ),
    ...filtered && selectedStudents.length === EMPTY_COUNT4 ? [createStudentFilterNoMatchesDiagnostic(config, requestedStudentIds)] : []
  ];
  const repositoryRows = await Promise.all(
    selectedStudents.map(
      (student) => createRepositoryStatusRow(config, student, manifest, githubClient)
    )
  );
  const summary = createSummary3(repositoryRows);
  const diagnostics = [
    ...configResult.diagnostics,
    ...rosterResult.warnings,
    ...filterDiagnostics,
    ...manifestResult.warnings,
    ...manifestResult.errors,
    ...!grading.enabled ? [createGradingNotConfiguredWarning2()] : [],
    ...hasTokenRequiredRows2(repositoryRows) ? [createTokenRequiredDiagnostic3()] : [],
    ...collectRowDiagnostics3(repositoryRows)
  ];
  const status = filtered && selectedStudents.length === EMPTY_COUNT4 ? "failure" : createStatus3(diagnostics);
  const targetStudentCount = filtered ? selectedStudents.length : rosterResult.summary.studentCount;
  const targetActiveStudentCount = filtered ? selectedStudents.length : rosterResult.summary.activeStudentCount;
  const targetSections = createSections(config, selectedStudents, filtered);
  return {
    schemaVersion: ASSIGNMENT_GRADE_STATUS_SCHEMA_VERSION,
    commandName: COMMAND_NAME3,
    status,
    exitCode: resolveExitCode3(status),
    diagnostics,
    assignment: {
      slug: config.assignment.assignment.slug,
      title: config.assignment.assignment.title,
      file: config.summary.assignmentConfigPath,
      status: config.assignment.assignment.status
    },
    course: {
      slug: config.course.course.code,
      title: config.course.course.title
    },
    term: {
      slug: config.term.term.code,
      title: config.term.term.display_name
    },
    target: {
      sections: targetSections,
      sectionCount: targetSections.length,
      studentCount: targetStudentCount,
      activeStudentCount: targetActiveStudentCount
    },
    grading: createGradingStatus(config),
    summary: filtered && selectedStudents.length === EMPTY_COUNT4 ? createZeroSummary() : summary,
    repositories: repositoryRows,
    actions: createActions(summary)
  };
};

// src/assignment-detail/assignment-detail-builder.ts
import fs4 from "fs";

// src/assignment-detail/assignment-detail-models.ts
var ASSIGNMENT_DETAIL_SCHEMA_VERSION = 1;

// src/assignment-detail/assignment-detail-builder.ts
var COMMAND_NAME4 = "assignment detail";
var EMPTY_COUNT5 = 0;
var EXIT_CODE_SUCCESS = 0;
var EXIT_CODE_FAILURE = 1;
var EXIT_CODE_PARTIAL_SUCCESS = 2;
var LEGACY_GRADING_MODE5 = "custom-workflow";
var PRESET_GRADING_MODE2 = "preset";
var ACTIVE_ASSIGNMENT_STATUS2 = "active";
var CLOSED_ASSIGNMENT_STATUS2 = "closed";
var DRAFT_ASSIGNMENT_STATUS2 = "draft";
var ARCHIVED_ASSIGNMENT_STATUS2 = "archived";
var NOT_CHECKED_STATUS2 = "not_checked";
var NOT_REQUIRED_STATUS2 = "not_required";
var AVAILABLE_STATUS = "available";
var APPLY_STATE_APPLIED = "applied";
var APPLY_STATE_NOT_APPLIED = "not_applied";
var resolveExitCode4 = (status) => {
  if (status === "success") {
    return EXIT_CODE_SUCCESS;
  }
  return status === "partial_success" ? EXIT_CODE_PARTIAL_SUCCESS : EXIT_CODE_FAILURE;
};
var createEmptyAssignmentDetailResult = (status, diagnostics) => ({
  schemaVersion: ASSIGNMENT_DETAIL_SCHEMA_VERSION,
  commandName: COMMAND_NAME4,
  status,
  exitCode: resolveExitCode4(status),
  diagnostics,
  course: null,
  term: null,
  assignment: null,
  metadata: null,
  deadline: null,
  sections: [],
  roster: null,
  template: null,
  grading: null,
  studentReports: null,
  applyState: null,
  actions: null
});
var hasErrorDiagnostics4 = (diagnostics) => diagnostics.some((diagnostic2) => diagnostic2.severity === "error");
var getEffectiveGrading3 = (config) => config.assignment.grading ?? config.course.grading;
var createRosterSummary = (config) => {
  const rosterResult = loadAssignmentRosters(config);
  return {
    roster: {
      sectionCount: config.assignment.sections.length,
      activeStudentCount: rosterResult.summary.activeStudentCount,
      totalStudentCount: rosterResult.summary.studentCount
    },
    diagnostics: [...rosterResult.warnings, ...rosterResult.errors]
  };
};
var isFile2 = (filePath) => {
  try {
    return fs4.statSync(filePath).isFile();
  } catch {
    return false;
  }
};
var getApplyState = (config) => {
  const manifestPath = createManifestPath(
    config.summary.repoRoot,
    config.summary.termCode,
    config.summary.assignmentSlug
  );
  return isFile2(manifestPath.absolutePath) ? APPLY_STATE_APPLIED : APPLY_STATE_NOT_APPLIED;
};
var createGradingDetail = (config) => {
  const grading = getEffectiveGrading3(config);
  if (!grading.enabled) {
    return {
      enabled: false,
      mode: grading.mode ?? DISABLED_GRADING_MODE,
      workflow: null,
      artifact: null,
      resultFile: null,
      workflowStatus: NOT_REQUIRED_STATUS2,
      workflowDispatch: NOT_REQUIRED_STATUS2
    };
  }
  return {
    enabled: true,
    mode: grading.mode ?? LEGACY_GRADING_MODE5,
    workflow: grading.workflow ?? null,
    artifact: grading.artifact ?? null,
    resultFile: grading.result_file ?? null,
    workflowStatus: NOT_CHECKED_STATUS2,
    workflowDispatch: NOT_CHECKED_STATUS2
  };
};
var nullable = (value) => value ?? null;
var createStudentReports = (config) => {
  const studentPublish = config.course.reports.student_publish;
  if (studentPublish === void 0) {
    return {
      enabled: false,
      mode: DISABLED_STUDENT_PUBLISH_MODE,
      artifact: null,
      sourceFile: null,
      destinationFile: null,
      graiderReportDestination: null,
      facultyReportSource: null,
      facultyReportDestination: null
    };
  }
  return {
    enabled: studentPublish.enabled,
    mode: studentPublish.mode ?? DISABLED_STUDENT_PUBLISH_MODE,
    artifact: nullable(studentPublish.artifact),
    sourceFile: nullable(studentPublish.source_file),
    destinationFile: nullable(studentPublish.destination_file),
    graiderReportDestination: nullable(studentPublish.graider_report_destination),
    facultyReportSource: nullable(studentPublish.faculty_report_source),
    facultyReportDestination: nullable(studentPublish.faculty_report_destination)
  };
};
var action = (available, implemented) => ({
  available,
  implemented
});
var createActions2 = (config, grading, studentReports) => {
  const assignmentStatus = config.assignment.assignment.status;
  const applyAvailable = assignmentStatus === ACTIVE_ASSIGNMENT_STATUS2 || assignmentStatus === CLOSED_ASSIGNMENT_STATUS2;
  const lifecycleAllowsGrading = assignmentStatus !== DRAFT_ASSIGNMENT_STATUS2 && assignmentStatus !== ARCHIVED_ASSIGNMENT_STATUS2;
  return {
    validate: action(true, true),
    apply: action(applyAvailable, false),
    grade: action(
      grading.enabled && lifecycleAllowsGrading && grading.workflowStatus === AVAILABLE_STATUS && grading.workflowDispatch === AVAILABLE_STATUS,
      false
    ),
    report: action(true, false),
    publishStudentReports: action(studentReports.enabled, false),
    generateWorkflow: action(grading.enabled && grading.mode === PRESET_GRADING_MODE2, false)
  };
};
var buildAssignmentDetail = ({
  cwd,
  assignmentFile,
  githubClient
}) => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });
  if (configResult.status === "failure") {
    return Promise.resolve(createEmptyAssignmentDetailResult("failure", configResult.diagnostics));
  }
  const { config } = configResult;
  const rosterResult = createRosterSummary(config);
  const localDiagnostics = [...configResult.diagnostics, ...rosterResult.diagnostics];
  const localGrading = createGradingDetail(config);
  const studentReports = createStudentReports(config);
  const template = {
    repository: config.assignment.template.repository,
    branch: config.assignment.template.branch,
    status: NOT_CHECKED_STATUS2,
    repositoryStatus: NOT_CHECKED_STATUS2,
    branchStatus: NOT_CHECKED_STATUS2
  };
  return checkAssignmentDetailGithubReadiness({
    config,
    template,
    grading: localGrading,
    ...githubClient === void 0 ? {} : { githubClient }
  }).then((githubReadiness) => {
    const diagnostics = [...localDiagnostics, ...githubReadiness.diagnostics];
    const status = diagnostics.length === EMPTY_COUNT5 ? "success" : hasErrorDiagnostics4(diagnostics) ? "partial_success" : "success";
    return {
      schemaVersion: ASSIGNMENT_DETAIL_SCHEMA_VERSION,
      commandName: COMMAND_NAME4,
      status,
      exitCode: resolveExitCode4(status),
      diagnostics,
      course: {
        slug: config.course.course.code,
        title: config.course.course.title,
        file: config.summary.courseConfigPath
      },
      term: {
        slug: config.term.term.code,
        title: config.term.term.display_name,
        file: config.summary.termConfigPath
      },
      assignment: {
        slug: config.assignment.assignment.slug,
        title: config.assignment.assignment.title,
        type: config.assignment.assignment.type,
        status: config.assignment.assignment.status,
        file: config.summary.assignmentConfigPath
      },
      metadata: {
        facultyOwner: config.assignment.metadata.faculty_owner,
        lmsAssignmentId: config.assignment.metadata.lms_assignment_id,
        gradingCategory: config.assignment.metadata.grading_category,
        points: config.assignment.metadata.points
      },
      deadline: {
        dueAt: config.assignment.deadline.due_at,
        latePolicy: config.assignment.deadline.late_policy
      },
      sections: config.assignment.sections,
      roster: rosterResult.roster,
      template: githubReadiness.template,
      grading: githubReadiness.grading,
      studentReports,
      applyState: {
        status: getApplyState(config)
      },
      actions: createActions2(config, githubReadiness.grading, studentReports)
    };
  });
};

// src/core/command-context.ts
var normalizeCommonCommandOptions = (options) => ({
  json: options.json === true,
  verbose: options.verbose === true,
  yes: options.yes === true
});

// src/github/octokit-github-client.ts
import { Buffer } from "buffer";
import { inflateRawSync } from "zlib";
import { Octokit } from "@octokit/rest";

// src/github/github-rate-limit.ts
var MILLISECONDS_PER_SECOND = 1e3;
var retryAfterSecondsToMilliseconds = (seconds) => seconds * MILLISECONDS_PER_SECOND;
var getGitHubRetryDelayMs = (error, fallbackDelayMs) => error.retryAfterSeconds === void 0 ? fallbackDelayMs : retryAfterSecondsToMilliseconds(error.retryAfterSeconds);

// src/github/github-retry.ts
var DEFAULT_GITHUB_RETRY_ATTEMPTS = 3;
var DEFAULT_INITIAL_BACKOFF_MS = 250;
var DEFAULT_BACKOFF_MULTIPLIER = 2;
var defaultSleep = async (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});
var createDefaultRetryOptions = () => ({
  maxAttempts: DEFAULT_GITHUB_RETRY_ATTEMPTS,
  initialBackoffMs: DEFAULT_INITIAL_BACKOFF_MS,
  backoffMultiplier: DEFAULT_BACKOFF_MULTIPLIER,
  sleep: defaultSleep
});
var normalizeRetryOptions = (options = {}) => ({
  ...createDefaultRetryOptions(),
  ...options
});
var shouldRetryGitHubError = (error) => isRetryableGitHubError(error);
var withGitHubRetry = async (operation, options) => {
  const retryOptions = normalizeRetryOptions(options);
  let nextBackoffMs = retryOptions.initialBackoffMs;
  let lastError;
  for (let attempt = 1; attempt <= retryOptions.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!(error instanceof GitHubClientError) || !shouldRetryGitHubError(error)) {
        throw error;
      }
      if (attempt >= retryOptions.maxAttempts) {
        throw error;
      }
      const delayMs = getGitHubRetryDelayMs(error, nextBackoffMs);
      retryOptions.onRetry?.({
        attempt,
        maxAttempts: retryOptions.maxAttempts,
        diagnosticCode: error.diagnosticCode,
        ...error.retryAfterSeconds === void 0 ? {} : { retryAfterSeconds: error.retryAfterSeconds },
        delayMs
      });
      await retryOptions.sleep(delayMs);
      nextBackoffMs *= retryOptions.backoffMultiplier;
    }
  }
  throw lastError;
};

// src/github/octokit-github-client.ts
var HTTP_STATUS_UNAUTHORIZED = 401;
var HTTP_STATUS_CREATED = 201;
var HTTP_STATUS_FOUND = 302;
var HTTP_STATUS_FORBIDDEN = 403;
var HTTP_STATUS_NOT_FOUND = 404;
var HTTP_STATUS_TOO_MANY_REQUESTS = 429;
var HTTP_STATUS_SERVER_ERROR_MIN = 500;
var DEFAULT_BRANCH_FALLBACK = "main";
var ROOT_CONTENT_PATH = "";
var FIRST_PAGE_LIMIT = 1;
var UNKNOWN_COMMIT_SHA = "unknown";
var UNKNOWN_ID = 0;
var EMPTY_LENGTH2 = 0;
var SINGLE_BYTE_STEP = 1;
var DECIMAL_RADIX = 10;
var ZIP_LOCAL_FILE_HEADER_SIGNATURE = 67324752;
var ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 33639248;
var ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 101010256;
var ZIP_DEFLATE_COMPRESSION = 8;
var ZIP_STORED_COMPRESSION = 0;
var ZIP_GENERAL_PURPOSE_DATA_DESCRIPTOR_FLAG = 8;
var ZIP_MIN_LOCAL_FILE_HEADER_BYTES = 30;
var ZIP_MIN_CENTRAL_DIRECTORY_FILE_HEADER_BYTES = 46;
var ZIP_MIN_END_OF_CENTRAL_DIRECTORY_BYTES = 22;
var ZIP_MAX_COMMENT_BYTES = 65535;
var ZIP_COMPRESSION_METHOD_OFFSET = 8;
var ZIP_GENERAL_PURPOSE_FLAG_OFFSET = 6;
var ZIP_COMPRESSED_SIZE_OFFSET = 18;
var ZIP_FILE_NAME_LENGTH_OFFSET = 26;
var ZIP_EXTRA_FIELD_LENGTH_OFFSET = 28;
var ZIP_LOCAL_FILE_NAME_OFFSET = 30;
var ZIP_CENTRAL_COMPRESSION_METHOD_OFFSET = 10;
var ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET = 20;
var ZIP_CENTRAL_FILE_NAME_LENGTH_OFFSET = 28;
var ZIP_CENTRAL_EXTRA_FIELD_LENGTH_OFFSET = 30;
var ZIP_CENTRAL_FILE_COMMENT_LENGTH_OFFSET = 32;
var ZIP_CENTRAL_LOCAL_HEADER_OFFSET = 42;
var ZIP_CENTRAL_FILE_NAME_OFFSET = 46;
var ZIP_END_CENTRAL_DIRECTORY_ENTRY_COUNT_OFFSET = 10;
var ZIP_END_CENTRAL_DIRECTORY_SIZE_OFFSET = 12;
var ZIP_END_CENTRAL_DIRECTORY_OFFSET = 16;
var ZIP_END_CENTRAL_DIRECTORY_COMMENT_LENGTH_OFFSET = 20;
var BASE64_ENCODING = "base64";
var UTF8_ENCODING = "utf8";
var WINDOWS_PATH_SEPARATOR_PATTERN2 = /\\/g;
var PARSE_SUCCESS_RESPONSE_BODY_DISABLED = false;
var LOCATION_HEADER = "location";
var LOCATION_HEADER_ALTERNATE = "Location";
var GET_METHOD = "GET";
var OctokitGitHubClient = class {
  octokit;
  token;
  constructor(options = {}) {
    this.token = normalizeToken(options.token);
    this.octokit = options.octokit ?? new Octokit({ auth: this.token });
  }
  async getAuthenticatedUser() {
    const data = await this.run(() => this.octokit.rest.users.getAuthenticated());
    return mapUser(data);
  }
  async getRepository(owner, repo) {
    const data = await this.runNullable(() => this.octokit.rest.repos.get({ owner, repo }));
    return data === null ? null : mapRepository(data);
  }
  async getTemplateRepository(owner, repo) {
    const repository = await this.getRepository(owner, repo);
    if (repository === null) {
      return null;
    }
    const repoData = await this.run(() => this.octokit.rest.repos.get({ owner, repo }));
    const repoRecord = asRecord(repoData);
    const branches = await this.listBranchNames(owner, repo);
    const files = await this.listRootFiles(owner, repo);
    const latestCommitSha = await this.getLatestCommitSha(owner, repo, repository.defaultBranch);
    return {
      ...repository,
      branches,
      files,
      isTemplate: asBoolean(repoRecord.is_template) ?? false,
      latestCommitSha
    };
  }
  async createRepositoryFromTemplate(input) {
    const data = await this.run(
      () => this.octokit.rest.repos.createUsingTemplate({
        description: input.description,
        include_all_branches: false,
        name: input.name,
        owner: input.owner,
        private: input.private,
        template_owner: input.templateOwner,
        template_repo: input.templateRepo
      })
    );
    return mapRepository(data);
  }
  async getUser(username) {
    const data = await this.runNullable(() => this.octokit.rest.users.getByUsername({ username }));
    return data === null ? null : mapUser(data);
  }
  async getTeam(org, teamSlug) {
    const data = await this.runNullable(
      () => this.octokit.rest.teams.getByName({ org, team_slug: teamSlug })
    );
    if (data === null) {
      return null;
    }
    const record = asRecord(data);
    const id = asNumber(record.id);
    return {
      name: asString(record.name) ?? teamSlug,
      org,
      slug: asString(record.slug) ?? teamSlug,
      ...id === void 0 ? {} : { id }
    };
  }
  async getCollaboratorPermission(owner, repo, username) {
    const data = await this.runNullable(
      () => this.octokit.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username
      })
    );
    if (data === null) {
      return noPermission();
    }
    const record = asRecord(data);
    return {
      pendingInvite: false,
      permission: toPermission(asString(record.permission))
    };
  }
  async listCollaboratorPermissions(owner, repo) {
    this.ensureAuthenticated();
    const collaborators = await this.runPaginated(this.octokit.rest.repos.listCollaborators, {
      affiliation: "all",
      owner,
      repo
    });
    return collaborators.map(asRecord).map((collaborator) => ({
      pendingInvite: false,
      permission: toCollaboratorPermission(collaborator),
      username: asString(collaborator.login) ?? ""
    })).filter((collaborator) => collaborator.username.length > EMPTY_LENGTH2);
  }
  async addCollaborator(input) {
    const response = await this.runResponse(
      () => this.octokit.rest.repos.addCollaborator({
        owner: input.owner,
        permission: input.permission,
        repo: input.repo,
        username: input.username
      })
    );
    return {
      pendingInvite: response.status === HTTP_STATUS_CREATED,
      permission: input.permission,
      username: input.username
    };
  }
  async removeCollaborator(input) {
    await this.run(
      () => this.octokit.rest.repos.removeCollaborator({
        owner: input.owner,
        repo: input.repo,
        username: input.username
      })
    );
  }
  async getTeamPermission(owner, repo, teamSlug) {
    const data = await this.runNullable(
      () => this.octokit.rest.teams.checkPermissionsForRepoInOrg({
        org: owner,
        owner,
        repo,
        team_slug: teamSlug
      })
    );
    if (data === null) {
      return noPermission();
    }
    const record = asRecord(data);
    return {
      pendingInvite: false,
      permission: toPermission(asString(record.permission))
    };
  }
  async addTeamPermission(input) {
    await this.run(
      () => this.octokit.rest.teams.addOrUpdateRepoPermissionsInOrg({
        org: input.owner,
        owner: input.owner,
        permission: input.permission,
        repo: input.repo,
        team_slug: input.teamSlug
      })
    );
  }
  async getActionsState(owner, repo) {
    const data = await this.run(
      () => this.octokit.rest.actions.getGithubActionsPermissionsRepository({
        owner,
        repo
      })
    );
    const record = asRecord(data);
    return asBoolean(record.enabled) === false ? "disabled" : "enabled";
  }
  async enableActions(owner, repo) {
    await this.run(
      () => this.octokit.rest.actions.setGithubActionsPermissionsRepository({
        allowed_actions: "all",
        enabled: true,
        owner,
        repo
      })
    );
  }
  async getRepositoryFileContent(owner, repo, filePath, ref) {
    const data = await this.runNullable(
      () => this.octokit.rest.repos.getContent({
        owner,
        path: filePath,
        ref,
        repo
      })
    );
    if (data === null || Array.isArray(data)) {
      return null;
    }
    const record = asRecord(data);
    const content = asString(record.content);
    return content === void 0 ? null : Buffer.from(content, BASE64_ENCODING).toString(UTF8_ENCODING);
  }
  async getWorkflow(owner, repo, workflowPath) {
    const data = await this.runNullable(
      () => this.octokit.rest.actions.getWorkflow({
        owner,
        repo,
        workflow_id: workflowPath
      })
    );
    if (data === null) {
      return null;
    }
    const record = asRecord(data);
    return {
      id: asNumber(record.id) ?? UNKNOWN_ID,
      name: asString(record.name) ?? workflowPath,
      path: asString(record.path) ?? workflowPath,
      supportsDispatch: asString(record.state) !== "disabled_manually"
    };
  }
  async dispatchWorkflow(input) {
    await this.run(
      () => this.octokit.rest.actions.createWorkflowDispatch({
        owner: input.owner,
        ref: input.ref,
        repo: input.repo,
        workflow_id: input.workflowPath,
        ...input.inputs === void 0 ? {} : { inputs: input.inputs }
      })
    );
  }
  async listWorkflowRuns(input) {
    const response = input.workflowPath === void 0 ? await this.run(
      () => this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner: input.owner,
        repo: input.repo
      })
    ) : await this.run(
      () => this.octokit.rest.actions.listWorkflowRuns({
        owner: input.owner,
        repo: input.repo,
        workflow_id: input.workflowPath
      })
    );
    const record = asRecord(response);
    const runs = asArray(record.workflow_runs);
    return runs.map((run) => mapWorkflowRun(run, input.workflowPath));
  }
  async downloadArtifact(input) {
    const artifactsData = await this.run(
      () => this.octokit.rest.actions.listWorkflowRunArtifacts({
        owner: input.owner,
        repo: input.repo,
        run_id: input.runId
      })
    );
    const artifactsRecord = asRecord(artifactsData);
    const artifacts = asArray(artifactsRecord.artifacts);
    const artifact = artifacts.map(asRecord).find((candidate) => asString(candidate.name) === input.artifactName);
    if (artifact === void 0) {
      return null;
    }
    const artifactId = asNumber(artifact.id);
    if (artifactId === void 0) {
      return null;
    }
    const archiveResponse = await this.resolveArtifactDownloadResponse(
      await this.runResponse(
        () => this.octokit.rest.actions.downloadArtifact({
          archive_format: "zip",
          artifact_id: artifactId,
          owner: input.owner,
          repo: input.repo,
          request: {
            parseSuccessResponseBody: PARSE_SUCCESS_RESPONSE_BODY_DISABLED
          }
        })
      )
    );
    const archiveBuffer = await toBuffer(archiveResponse.data);
    const files = extractZipTextFiles(archiveBuffer);
    if (Object.keys(files).length === EMPTY_LENGTH2) {
      throw createArtifactDecodeError();
    }
    return {
      files,
      name: input.artifactName
    };
  }
  async resolveArtifactDownloadResponse(response) {
    if (response.status !== HTTP_STATUS_FOUND) {
      return response;
    }
    const location = response.headers?.[LOCATION_HEADER] ?? response.headers?.[LOCATION_HEADER_ALTERNATE];
    if (location === void 0 || location.length === EMPTY_LENGTH2) {
      throw createArtifactDecodeError();
    }
    return this.runResponse(
      () => this.octokit.request({
        method: GET_METHOD,
        url: location,
        request: {
          parseSuccessResponseBody: PARSE_SUCCESS_RESPONSE_BODY_DISABLED
        }
      })
    );
  }
  async archiveRepository(owner, repo) {
    await this.run(() => this.octokit.rest.repos.update({ archived: true, owner, repo }));
  }
  async writeRepositoryFile(input) {
    return withGitHubRetry(() => this.writeRepositoryFileOnce(input));
  }
  async writeRepositoryFileOnce(input) {
    const existingSha = await this.getExistingFileSha(input);
    const response = await this.run(
      () => this.octokit.rest.repos.createOrUpdateFileContents({
        branch: input.branch,
        content: Buffer.from(input.content, UTF8_ENCODING).toString(BASE64_ENCODING),
        message: input.message,
        owner: input.owner,
        path: input.path,
        repo: input.repo,
        ...existingSha === void 0 ? {} : { sha: existingSha }
      })
    );
    const record = asRecord(response);
    const content = asRecord(record.content);
    const commit = asRecord(record.commit);
    return {
      commitSha: asString(commit.sha) ?? UNKNOWN_COMMIT_SHA,
      path: asString(content.path) ?? input.path
    };
  }
  async listBranchNames(owner, repo) {
    const branches = await this.runPaginated(this.octokit.rest.repos.listBranches, { owner, repo });
    return branches.map(asRecord).map((branch) => asString(branch.name)).filter((name) => name !== void 0);
  }
  async listRootFiles(owner, repo) {
    const data = await this.runNullable(
      () => this.octokit.rest.repos.getContent({
        owner,
        path: ROOT_CONTENT_PATH,
        repo
      })
    );
    if (data === null) {
      return [];
    }
    return asArray(data).map(asRecord).map((file) => asString(file.name)).filter((name) => name !== void 0);
  }
  async getLatestCommitSha(owner, repo, branch) {
    const data = await this.runNullable(
      () => this.octokit.rest.repos.listCommits({
        owner,
        per_page: FIRST_PAGE_LIMIT,
        repo,
        sha: branch
      })
    );
    const commit = asArray(data).map(asRecord).at(0);
    return commit === void 0 ? UNKNOWN_COMMIT_SHA : asString(commit.sha) ?? UNKNOWN_COMMIT_SHA;
  }
  async getExistingFileSha(input) {
    const data = await this.runNullable(
      () => this.octokit.rest.repos.getContent({
        owner: input.owner,
        path: input.path,
        ref: input.branch,
        repo: input.repo
      })
    );
    if (data === null || Array.isArray(data)) {
      return void 0;
    }
    return asString(asRecord(data).sha);
  }
  async run(operation) {
    const response = await this.runResponse(operation);
    return response.data;
  }
  async runNullable(operation) {
    this.ensureAuthenticated();
    try {
      const response = await operation();
      return response.data;
    } catch (error) {
      if (getErrorStatus(error) === HTTP_STATUS_NOT_FOUND) {
        return null;
      }
      throw normalizeOctokitError(error);
    }
  }
  async runPaginated(method, parameters) {
    this.ensureAuthenticated();
    try {
      return await this.octokit.paginate(method, parameters);
    } catch (error) {
      throw normalizeOctokitError(error);
    }
  }
  async runResponse(operation) {
    this.ensureAuthenticated();
    try {
      return await operation();
    } catch (error) {
      throw normalizeOctokitError(error);
    }
  }
  ensureAuthenticated() {
    if (this.token === void 0) {
      throw new GitHubClientError("auth_missing", "GitHub token is not configured.");
    }
  }
};
function normalizeToken(token) {
  const normalized = token?.trim();
  return normalized === void 0 || normalized.length === EMPTY_LENGTH2 ? void 0 : normalized;
}
function normalizeOctokitError(error) {
  if (error instanceof GitHubClientError) {
    return error;
  }
  const status = getErrorStatus(error);
  const retryAfterSeconds = getRetryAfterSeconds(error);
  if (status === HTTP_STATUS_UNAUTHORIZED) {
    return new GitHubClientError("auth_failed", "GitHub authentication failed.");
  }
  if (status === HTTP_STATUS_TOO_MANY_REQUESTS || status === HTTP_STATUS_FORBIDDEN && isRateLimitError(error)) {
    const options = retryAfterSeconds === void 0 ? {} : { retryAfterSeconds };
    return new GitHubClientError("rate_limited", "GitHub rate limit was reached.", options);
  }
  if (status === HTTP_STATUS_FORBIDDEN) {
    return new GitHubClientError("permission_denied", "GitHub permission was denied.");
  }
  if (status !== void 0 && status >= HTTP_STATUS_SERVER_ERROR_MIN) {
    return new GitHubClientError("api_error", "GitHub API request failed.");
  }
  if (status !== void 0) {
    return new GitHubClientError("api_error", "GitHub API request failed.");
  }
  return new GitHubClientError("network_error", "GitHub network request failed.");
}
function createArtifactDecodeError() {
  return new GitHubClientError("api_error", "GitHub artifact download could not be decoded.");
}
function getErrorStatus(error) {
  const record = asRecord(error);
  return asNumber(record.status);
}
function getRetryAfterSeconds(error) {
  const headers = getErrorHeaders(error);
  const retryAfter = headers["retry-after"] ?? headers["Retry-After"];
  return typeof retryAfter === "string" ? Number.parseInt(retryAfter, DECIMAL_RADIX) : void 0;
}
function isRateLimitError(error) {
  const headers = getErrorHeaders(error);
  const remaining = headers["x-ratelimit-remaining"] ?? headers["X-RateLimit-Remaining"];
  const message = asString(asRecord(error).message)?.toLowerCase() ?? "";
  return remaining === "0" || headers["retry-after"] !== void 0 || message.includes("rate limit");
}
function getErrorHeaders(error) {
  const response = asRecord(asRecord(error).response);
  const headers = asRecord(response.headers);
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }
  return normalized;
}
function mapUser(value) {
  const record = asRecord(value);
  const id = asNumber(record.id);
  if (id === void 0) {
    return {
      username: asString(record.login) ?? ""
    };
  }
  return {
    id,
    username: asString(record.login) ?? ""
  };
}
function mapRepository(value) {
  const record = asRecord(value);
  const ownerRecord = asRecord(record.owner);
  const owner = asString(ownerRecord.login) ?? "";
  const name = asString(record.name) ?? "";
  return {
    archived: asBoolean(record.archived) ?? false,
    defaultBranch: asString(record.default_branch) ?? DEFAULT_BRANCH_FALLBACK,
    fullName: asString(record.full_name) ?? `${owner}/${name}`,
    htmlUrl: asString(record.html_url) ?? "",
    id: asNumber(record.id) ?? UNKNOWN_ID,
    name,
    owner,
    private: asBoolean(record.private) ?? true
  };
}
function mapWorkflowRun(value, workflowPath) {
  const record = asRecord(value);
  const runUrl = asString(record.html_url);
  const event = asString(record.event);
  const startedAt = asString(record.run_started_at);
  return {
    conclusion: toWorkflowConclusion(record.conclusion),
    createdAt: asString(record.created_at) ?? "",
    headSha: asString(record.head_sha) ?? "",
    id: asNumber(record.id) ?? UNKNOWN_ID,
    status: toWorkflowStatus(record.status),
    updatedAt: asString(record.updated_at) ?? "",
    workflowPath: asString(record.path) ?? workflowPath ?? "",
    ...runUrl === void 0 ? {} : { runUrl },
    ...event === void 0 ? {} : { event },
    ...startedAt === void 0 ? {} : { startedAt },
    ...asString(record.status) === "completed" ? { completedAt: asString(record.updated_at) ?? "" } : {}
  };
}
function toPermission(value) {
  const allowed = ["none", "pull", "triage", "push", "maintain", "admin"];
  return value !== void 0 && allowed.includes(value) ? value : "none";
}
function toCollaboratorPermission(collaborator) {
  const permissions = asRecord(collaborator.permissions);
  if (asBoolean(permissions.admin) === true) {
    return "admin";
  }
  if (asBoolean(permissions.maintain) === true) {
    return "maintain";
  }
  if (asBoolean(permissions.push) === true || asBoolean(permissions.write) === true) {
    return "push";
  }
  if (asBoolean(permissions.triage) === true) {
    return "triage";
  }
  if (asBoolean(permissions.pull) === true || asBoolean(permissions.read) === true) {
    return "pull";
  }
  return "none";
}
function toWorkflowStatus(value) {
  const status = asString(value);
  if (status === "queued" || status === "in_progress" || status === "completed") {
    return status;
  }
  return "queued";
}
function toWorkflowConclusion(value) {
  const conclusion = asString(value);
  if (conclusion === "success" || conclusion === "failure" || conclusion === "cancelled" || conclusion === "skipped" || conclusion === "neutral" || conclusion === "timed_out" || conclusion === "action_required") {
    return conclusion;
  }
  return null;
}
function noPermission() {
  return {
    pendingInvite: false,
    permission: "none"
  };
}
function extractZipTextFiles(buffer) {
  const centralDirectoryFiles = extractZipTextFilesFromCentralDirectory(buffer);
  if (Object.keys(centralDirectoryFiles).length !== EMPTY_LENGTH2) {
    return centralDirectoryFiles;
  }
  return extractZipTextFilesFromLocalHeaders(buffer);
}
function extractZipTextFilesFromCentralDirectory(buffer) {
  const files = {};
  const directory = findZipCentralDirectory(buffer);
  if (directory === void 0) {
    return files;
  }
  const directoryEnd = Math.min(directory.offset + directory.size, buffer.length);
  for (let offset = directory.offset, remainingEntries = directory.entries, scanning = true; scanning && remainingEntries > EMPTY_LENGTH2 && offset + ZIP_MIN_CENTRAL_DIRECTORY_FILE_HEADER_BYTES <= directoryEnd; remainingEntries -= SINGLE_BYTE_STEP) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      scanning = false;
    } else {
      const fileNameLength = buffer.readUInt16LE(offset + ZIP_CENTRAL_FILE_NAME_LENGTH_OFFSET);
      const extraFieldLength = buffer.readUInt16LE(offset + ZIP_CENTRAL_EXTRA_FIELD_LENGTH_OFFSET);
      const fileCommentLength = buffer.readUInt16LE(
        offset + ZIP_CENTRAL_FILE_COMMENT_LENGTH_OFFSET
      );
      const nameStart = offset + ZIP_CENTRAL_FILE_NAME_OFFSET;
      const nameEnd = nameStart + fileNameLength;
      const nextOffset = nameEnd + extraFieldLength + fileCommentLength;
      if (nextOffset > directoryEnd) {
        scanning = false;
      } else {
        const compressionMethod = buffer.readUInt16LE(
          offset + ZIP_CENTRAL_COMPRESSION_METHOD_OFFSET
        );
        const compressedSize = buffer.readUInt32LE(offset + ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET);
        const localHeaderOffset = buffer.readUInt32LE(offset + ZIP_CENTRAL_LOCAL_HEADER_OFFSET);
        const name = normalizeZipEntryPath(
          buffer.subarray(nameStart, nameEnd).toString(UTF8_ENCODING)
        );
        const content = extractZipEntryContent(
          buffer,
          localHeaderOffset,
          compressedSize,
          compressionMethod
        );
        if (content !== void 0 && name.length > EMPTY_LENGTH2 && !name.endsWith("/")) {
          files[name] = content.toString(UTF8_ENCODING);
        }
        offset = nextOffset;
      }
    }
  }
  return files;
}
function extractZipTextFilesFromLocalHeaders(buffer) {
  const files = {};
  for (let offset = 0, scanning = true; scanning && offset + ZIP_MIN_LOCAL_FILE_HEADER_BYTES <= buffer.length; ) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      scanning = false;
    } else {
      const flags = buffer.readUInt16LE(offset + ZIP_GENERAL_PURPOSE_FLAG_OFFSET);
      const compressionMethod = buffer.readUInt16LE(offset + ZIP_COMPRESSION_METHOD_OFFSET);
      const compressedSize = buffer.readUInt32LE(offset + ZIP_COMPRESSED_SIZE_OFFSET);
      const fileNameLength = buffer.readUInt16LE(offset + ZIP_FILE_NAME_LENGTH_OFFSET);
      const extraFieldLength = buffer.readUInt16LE(offset + ZIP_EXTRA_FIELD_LENGTH_OFFSET);
      const nameStart = offset + ZIP_LOCAL_FILE_NAME_OFFSET;
      const nameEnd = nameStart + fileNameLength;
      const dataStart = nameEnd + extraFieldLength;
      const dataEnd = dataStart + compressedSize;
      if ((flags & ZIP_GENERAL_PURPOSE_DATA_DESCRIPTOR_FLAG) !== 0 || dataEnd > buffer.length) {
        scanning = false;
      } else {
        const name = normalizeZipEntryPath(
          buffer.subarray(nameStart, nameEnd).toString(UTF8_ENCODING)
        );
        const compressed = buffer.subarray(dataStart, dataEnd);
        const content = compressionMethod === ZIP_DEFLATE_COMPRESSION ? inflateRawSync(compressed) : compressionMethod === ZIP_STORED_COMPRESSION ? compressed : void 0;
        if (content !== void 0 && name.length > EMPTY_LENGTH2 && !name.endsWith("/")) {
          files[name] = content.toString(UTF8_ENCODING);
        }
        offset = dataEnd;
      }
    }
  }
  return files;
}
function findZipCentralDirectory(buffer) {
  const firstOffset = Math.max(
    EMPTY_LENGTH2,
    buffer.length - ZIP_MIN_END_OF_CENTRAL_DIRECTORY_BYTES - ZIP_MAX_COMMENT_BYTES
  );
  let directory;
  for (let offset = buffer.length - ZIP_MIN_END_OF_CENTRAL_DIRECTORY_BYTES; directory === void 0 && offset >= firstOffset; offset -= SINGLE_BYTE_STEP) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      const commentLength = buffer.readUInt16LE(
        offset + ZIP_END_CENTRAL_DIRECTORY_COMMENT_LENGTH_OFFSET
      );
      const expectedEnd = offset + ZIP_MIN_END_OF_CENTRAL_DIRECTORY_BYTES + commentLength;
      if (expectedEnd <= buffer.length) {
        directory = {
          entries: buffer.readUInt16LE(offset + ZIP_END_CENTRAL_DIRECTORY_ENTRY_COUNT_OFFSET),
          offset: buffer.readUInt32LE(offset + ZIP_END_CENTRAL_DIRECTORY_OFFSET),
          size: buffer.readUInt32LE(offset + ZIP_END_CENTRAL_DIRECTORY_SIZE_OFFSET)
        };
      }
    }
  }
  return directory;
}
function extractZipEntryContent(buffer, localHeaderOffset, compressedSize, compressionMethod) {
  if (localHeaderOffset + ZIP_MIN_LOCAL_FILE_HEADER_BYTES > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    return void 0;
  }
  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + ZIP_FILE_NAME_LENGTH_OFFSET);
  const extraFieldLength = buffer.readUInt16LE(localHeaderOffset + ZIP_EXTRA_FIELD_LENGTH_OFFSET);
  const dataStart = localHeaderOffset + ZIP_LOCAL_FILE_NAME_OFFSET + fileNameLength + extraFieldLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > buffer.length) {
    return void 0;
  }
  const compressed = buffer.subarray(dataStart, dataEnd);
  return compressionMethod === ZIP_DEFLATE_COMPRESSION ? inflateRawSync(compressed) : compressionMethod === ZIP_STORED_COMPRESSION ? compressed : void 0;
}
function normalizeZipEntryPath(filePath) {
  return filePath.replace(WINDOWS_PATH_SEPARATOR_PATTERN2, "/");
}
async function toBuffer(value) {
  const directBuffer = toDirectBuffer(value);
  if (directBuffer !== void 0) {
    if (directBuffer.length === EMPTY_LENGTH2) {
      throw createArtifactDecodeError();
    }
    return directBuffer;
  }
  if (isReadableStreamLike(value)) {
    return readStreamToBuffer(value);
  }
  if (isAsyncIterableLike(value)) {
    return readAsyncIterableToBuffer(value);
  }
  if (isBlobLike(value)) {
    const blobBuffer = Buffer.from(await value.arrayBuffer());
    if (blobBuffer.length === EMPTY_LENGTH2) {
      throw createArtifactDecodeError();
    }
    return blobBuffer;
  }
  throw createArtifactDecodeError();
}
function toDirectBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === "string") {
    return Buffer.from(value, UTF8_ENCODING);
  }
  return void 0;
}
async function readStreamToBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];
  try {
    for (let reading = true; reading; ) {
      const result = await reader.read();
      if (result.done) {
        reading = false;
      } else {
        const chunk = toDirectBuffer(result.value);
        if (chunk !== void 0) {
          chunks.push(chunk);
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length === EMPTY_LENGTH2) {
    throw createArtifactDecodeError();
  }
  return buffer;
}
async function readAsyncIterableToBuffer(iterable) {
  const chunks = [];
  for await (const value of iterable) {
    const chunk = toDirectBuffer(value);
    if (chunk === void 0) {
      throw createArtifactDecodeError();
    }
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length === EMPTY_LENGTH2) {
    throw createArtifactDecodeError();
  }
  return buffer;
}
function isReadableStreamLike(value) {
  const candidate = asRecord(value);
  return typeof candidate.getReader === "function";
}
function isAsyncIterableLike(value) {
  const candidate = typeof value === "object" && value !== null ? value : {};
  return typeof candidate[Symbol.asyncIterator] === "function";
}
function isBlobLike(value) {
  const candidate = asRecord(value);
  return typeof candidate.arrayBuffer === "function";
}
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function asString(value) {
  return typeof value === "string" ? value : void 0;
}
function asNumber(value) {
  return typeof value === "number" ? value : void 0;
}
function asBoolean(value) {
  return typeof value === "boolean" ? value : void 0;
}

// src/github/github-client-factory.ts
var GRAIDER_GITHUB_TOKEN_ENV = "GRAIDER_GITHUB_TOKEN";
var GITHUB_TOKEN_ENV = "GITHUB_TOKEN";
var EMPTY_LENGTH3 = 0;
function createGitHubClient(options = {}) {
  const token = options.token ?? readGitHubToken(options.env);
  return new OctokitGitHubClient(token === void 0 ? {} : { token });
}
function readGitHubToken(env = process.env) {
  const graiderToken = normalizeToken2(env[GRAIDER_GITHUB_TOKEN_ENV]);
  if (graiderToken !== void 0) {
    return graiderToken;
  }
  return normalizeToken2(env[GITHUB_TOKEN_ENV]);
}
function normalizeToken2(token) {
  const normalized = token?.trim();
  return normalized === void 0 || normalized.length === EMPTY_LENGTH3 ? void 0 : normalized;
}

// src/cli/commands/apply.command.ts
import fs7 from "fs";

// src/core/clock.ts
var COLON_PATTERN = /:/gu;
var PERIOD_PATTERN = /\./gu;
var FILESYSTEM_TIMESTAMP_SEPARATOR = "-";
var systemClock = {
  now: () => /* @__PURE__ */ new Date()
};
var formatPlanCreatedAt = (date) => date.toISOString();
var formatFilesystemTimestamp = (date) => date.toISOString().replace(COLON_PATTERN, FILESYSTEM_TIMESTAMP_SEPARATOR).replace(PERIOD_PATTERN, FILESYSTEM_TIMESTAMP_SEPARATOR);

// src/core/exit-codes.ts
var AUTHORIZATION_ERROR_CODES = /* @__PURE__ */ new Set([
  DiagnosticCode.GithubAuthMissing,
  DiagnosticCode.GithubAuthFailed,
  DiagnosticCode.GithubPermissionDenied
]);
var CONFIGURATION_ERROR_CODES = /* @__PURE__ */ new Set([
  DiagnosticCode.MissingRequiredFile,
  DiagnosticCode.InvalidYaml,
  DiagnosticCode.InvalidSchemaVersion,
  DiagnosticCode.MissingRequiredField,
  DiagnosticCode.InvalidTermCode,
  DiagnosticCode.AssignmentSlugMismatch,
  DiagnosticCode.TermCodeMismatch,
  DiagnosticCode.InvalidAssignmentType,
  DiagnosticCode.InvalidAssignmentStatus,
  DiagnosticCode.InvalidRepositoryVisibility,
  DiagnosticCode.InvalidPermission,
  DiagnosticCode.InvalidGradingConfig,
  DiagnosticCode.ManifestMissing,
  DiagnosticCode.InvalidManifest,
  DiagnosticCode.InvalidManifestSchemaVersion,
  DiagnosticCode.MissingManifestSection,
  DiagnosticCode.InvalidManifestRepositoryRecord,
  DiagnosticCode.InvalidManifestLifecycleStatus,
  DiagnosticCode.InvalidManifestPermission
]);
var GITHUB_ERROR_CODES = /* @__PURE__ */ new Set([
  DiagnosticCode.GithubApiError,
  DiagnosticCode.GithubNetworkError,
  DiagnosticCode.GithubRateLimited,
  DiagnosticCode.GithubTimeout
]);
var hasCodeInSet = (diagnostics, codes) => diagnostics.some((diagnostic2) => codes.has(diagnostic2.code));
var resolveExitCode5 = ({ status, errors }) => {
  if (hasCodeInSet(errors, AUTHORIZATION_ERROR_CODES)) {
    return 3 /* AuthenticationOrAuthorizationFailure */;
  }
  if (hasCodeInSet(errors, CONFIGURATION_ERROR_CODES)) {
    return 5 /* ConfigurationOrSchemaError */;
  }
  if (hasCodeInSet(errors, GITHUB_ERROR_CODES)) {
    return 4 /* GitHubOrNetworkFailure */;
  }
  if (status === "partial_success") {
    return 2 /* PartialSuccess */;
  }
  if (errors.length > 0 || status === "failure") {
    return 1 /* CommandError */;
  }
  return 0 /* Success */;
};

// src/core/command-result.ts
var createCommandResult = (input) => ({
  ...input,
  exitCode: resolveExitCode5(input)
});

// src/manifest/manifest-renderer.ts
import fs5 from "fs";
import path8 from "path";
import { stringify } from "yaml";
var YAML_INDENT_SPACES = 2;
var LINE_WIDTH_DISABLED = 0;
var optionalEntries = (entries) => Object.fromEntries(
  Object.entries(entries).filter(([, value]) => value !== void 0)
);
var toRawRepositoryIdentity = (repository) => ({
  owner: repository.owner,
  name: repository.name,
  full_name: repository.fullName,
  ...optionalEntries({
    id: repository.id,
    html_url: repository.htmlUrl
  }),
  created_from_template: repository.createdFromTemplate,
  template_repository: repository.templateRepository,
  ...optionalEntries({
    template_commit_sha: repository.templateCommitSha,
    created_at: repository.createdAt,
    last_observed_at: repository.lastObservedAt
  })
});
var toRawCollaboratorPermission = (permission) => ({
  username: permission.username,
  permission: permission.permission,
  pending_invite: permission.pendingInvite,
  ...optionalEntries({
    last_applied_at: permission.lastAppliedAt,
    last_observed_at: permission.lastObservedAt
  })
});
var toRawTeamPermission = (permission) => ({
  team_slug: permission.teamSlug,
  permission: permission.permission,
  ...optionalEntries({
    last_applied_at: permission.lastAppliedAt,
    last_observed_at: permission.lastObservedAt
  })
});
var toRawPermissionState = (permissions) => ({
  ...optionalEntries({
    student: permissions.student === void 0 ? void 0 : toRawCollaboratorPermission(permissions.student),
    faculty_team: permissions.facultyTeam === void 0 ? void 0 : toRawTeamPermission(permissions.facultyTeam),
    grader_team: permissions.graderTeam === void 0 ? void 0 : toRawTeamPermission(permissions.graderTeam)
  })
});
var toRawActionsState = (actions) => ({
  enabled: actions.enabled,
  ...optionalEntries({
    grading_workflow_path: actions.gradingWorkflowPath,
    grading_workflow_found: actions.gradingWorkflowFound,
    workflow_dispatch_supported: actions.workflowDispatchSupported,
    last_observed_at: actions.lastObservedAt
  })
});
var toRawLifecycleState = (lifecycle) => ({
  repository_archived: lifecycle.repositoryArchived,
  student_access_removed: lifecycle.studentAccessRemoved,
  status: lifecycle.status,
  ...optionalEntries({
    last_changed_at: lifecycle.lastChangedAt
  })
});
var toRawRepositoryRecord = (record) => ({
  student_id: record.studentId,
  github_username: record.githubUsername,
  section: record.section,
  roster_status: record.rosterStatus,
  repository: toRawRepositoryIdentity(record.repository),
  permissions: toRawPermissionState(record.permissions),
  actions: toRawActionsState(record.actions),
  lifecycle: toRawLifecycleState(record.lifecycle),
  warnings: record.warnings,
  errors: record.errors
});
var toRawOperationHistory = (operation) => ({
  command: operation.command,
  started_at: operation.startedAt,
  ...optionalEntries({
    completed_at: operation.completedAt
  }),
  status: operation.status,
  summary: operation.summary,
  warnings: operation.warnings,
  errors: operation.errors
});
var toRawManifest = (manifest) => ({
  schema_version: manifest.schemaVersion,
  assignment: {
    term_code: manifest.assignment.termCode,
    course_code: manifest.assignment.courseCode,
    assignment_slug: manifest.assignment.assignmentSlug,
    assignment_title: manifest.assignment.assignmentTitle
  },
  source: {
    source_files: manifest.source.sourceFiles,
    input_fingerprint: manifest.source.inputFingerprint
  },
  template: {
    repository: manifest.template.repository,
    branch: manifest.template.branch,
    ...optionalEntries({
      commit_sha: manifest.template.commitSha
    })
  },
  repositories: sortManifestRepositories(manifest.repositories).map(toRawRepositoryRecord),
  operation_history: manifest.operationHistory.map(toRawOperationHistory),
  warnings: manifest.warnings,
  errors: manifest.errors
});
var renderManifestYaml = (manifest) => stringify(toRawManifest(manifest), {
  indent: YAML_INDENT_SPACES,
  lineWidth: LINE_WIDTH_DISABLED
});
var writeManifest = (manifestPath, manifest) => {
  try {
    fs5.mkdirSync(path8.dirname(manifestPath), {
      recursive: true
    });
    fs5.writeFileSync(manifestPath, renderManifestYaml(manifest), "utf8");
    return {
      status: "success"
    };
  } catch (error) {
    return {
      status: "failure",
      diagnostic: createConfigDiagnostic(
        DiagnosticCode.ManifestWriteFailed,
        "Failed to write manifest.",
        {
          manifestPath,
          reason: error instanceof Error ? error.message : "unknown"
        }
      )
    };
  }
};

// src/execution/apply-executor.ts
var EMPTY_COUNT6 = 0;
var PRIVATE_REPOSITORY = true;
var DEFAULT_ACTIONS_ENABLED = true;
var STUDENT_PERMISSION2 = "admin";
var FACULTY_PERMISSION2 = "admin";
var GRADER_PERMISSION2 = "maintain";
var CREATE_REPOSITORY_OPERATION = "createRepositoryFromTemplate";
var CREATE_REPOSITORY_PLAN_TYPE = "create_repository_from_template";
var PERMISSION_RANK = {
  none: 0,
  pull: 1,
  triage: 2,
  push: 3,
  maintain: 4,
  admin: 5
};
var createEmptySummary2 = () => ({
  created: EMPTY_COUNT6,
  existing: EMPTY_COUNT6,
  verified: EMPTY_COUNT6,
  noop: EMPTY_COUNT6,
  skipped: EMPTY_COUNT6,
  blocked: EMPTY_COUNT6,
  failed: EMPTY_COUNT6,
  warnings: EMPTY_COUNT6,
  errors: EMPTY_COUNT6
});
var normalizeGitHubError = (error) => error instanceof GitHubClientError ? createGitHubDiagnostic(error) : createConfigDiagnostic(
  DiagnosticCode.GithubApiError,
  "Unexpected GitHub client failure during apply."
);
var runGitHubOperation = async (input, operation) => withGitHubRetry(operation, input.retryOptions);
var createWorkflowMissingDiagnostic2 = (operation) => createConfigDiagnostic(
  DiagnosticCode.GradingWorkflowMissing,
  `Grading workflow was not found for ${operation.repository_name ?? "repository"}.`,
  {
    repositoryName: operation.repository_name,
    student_id: operation.student_id,
    github_username: operation.github_username,
    section: operation.section
  }
);
var createWorkflowDispatchDiagnostic = (operation) => createConfigDiagnostic(
  DiagnosticCode.WorkflowDispatchUnsupported,
  `Workflow dispatch is not supported for ${operation.repository_name ?? "repository"}.`,
  {
    repositoryName: operation.repository_name,
    student_id: operation.student_id,
    github_username: operation.github_username,
    section: operation.section
  }
);
var createWorkflowPendingWarning = (operation) => createWarningDiagnostic(
  DiagnosticCode.GradingWorkflowPending,
  `Grading workflow is not observable yet for newly created ${operation.repository_name ?? "repository"}; it may still be becoming available.`,
  {
    repositoryName: operation.repository_name,
    student_id: operation.student_id,
    github_username: operation.github_username,
    section: operation.section
  }
);
var wasRepositoryCreatedInPlan = (input, operation) => input.plan.operations.some(
  (candidate) => candidate.type === CREATE_REPOSITORY_PLAN_TYPE && candidate.student_id === operation.student_id && candidate.status === "planned"
);
var createPermissionWarning = (operation, currentPermission, expectedPermission) => createWarningDiagnostic(
  DiagnosticCode.PermissionNotDowngraded,
  `Existing permission ${currentPermission} is higher than requested ${expectedPermission}; leaving it unchanged.`,
  {
    repositoryName: operation.repository_name,
    student_id: operation.student_id,
    github_username: operation.github_username,
    section: operation.section,
    currentPermission,
    expectedPermission
  }
);
var createUnexpectedCollaboratorWarning = (operation, username, permission) => createWarningDiagnostic(
  DiagnosticCode.UnexpectedCollaboratorPreserved,
  `Unexpected collaborator ${username} is present and was left unchanged.`,
  {
    repositoryName: operation.repository_name,
    student_id: operation.student_id,
    github_username: operation.github_username,
    section: operation.section,
    unexpectedUsername: username,
    permission
  }
);
var createRepositoryCreationNotObservedDiagnostic = (operation, owner, repositoryName) => createConfigDiagnostic(
  DiagnosticCode.GithubApiError,
  `Repository creation did not produce an observable repository for ${owner}/${repositoryName}.`,
  {
    operation: CREATE_REPOSITORY_OPERATION,
    owner,
    repositoryName,
    student_id: operation.student_id,
    github_username: operation.github_username,
    section: operation.section
  }
);
var findTarget = (input, operation) => (input.targets ?? input.plan.targets).find((target) => target.targetId === operation.target_id);
var findStudent = (input, students, operation) => students.find(
  (student) => student.studentId === (findTarget(input, operation)?.primaryStudentId ?? operation.student_id)
);
var findManifestRecord4 = (input, manifest, operation) => manifest.repositories.find(
  (record) => record.studentId === (findTarget(input, operation)?.primaryStudentId ?? operation.student_id)
);
var createManifestRecord = (config, student, repository, observedAt, templateCommitSha) => ({
  studentId: student.studentId,
  githubUsername: student.githubUsername,
  section: student.section,
  rosterStatus: student.status,
  repository: {
    owner: repository.owner,
    name: repository.name,
    fullName: repository.fullName,
    id: repository.id,
    htmlUrl: repository.htmlUrl,
    createdFromTemplate: true,
    templateRepository: config.assignment.template.repository,
    ...templateCommitSha === void 0 ? {} : { templateCommitSha },
    createdAt: observedAt,
    lastObservedAt: observedAt
  },
  permissions: {},
  actions: {
    enabled: false
  },
  lifecycle: {
    repositoryArchived: false,
    studentAccessRemoved: false,
    status: "created",
    lastChangedAt: observedAt
  },
  warnings: [],
  errors: []
});
var createInitialManifest = async (config, plan, githubClient) => {
  const parsedTemplate = parseTemplateRepository(
    config.course.github.organization,
    config.assignment.template.repository
  );
  const templateRepository = parsedTemplate.status === "success" ? await githubClient.getTemplateRepository(parsedTemplate.repository.owner, parsedTemplate.repository.repo).catch(() => null) : null;
  return createEmptyManifest({
    assignment: {
      termCode: config.summary.termCode,
      courseCode: config.course.course.code,
      assignmentSlug: config.summary.assignmentSlug,
      assignmentTitle: config.assignment.assignment.title
    },
    source: {
      sourceFiles: plan.source.source_files,
      inputFingerprint: plan.source.input_fingerprint
    },
    template: {
      repository: config.assignment.template.repository,
      branch: config.assignment.template.branch,
      ...templateRepository?.latestCommitSha === void 0 ? {} : { commitSha: templateRepository.latestCommitSha }
    }
  });
};
var persistManifest = (state, manifestPath) => {
  const writeResult = writeManifest(manifestPath, state.manifest);
  if (writeResult.status === "failure" && writeResult.diagnostic !== void 0) {
    return recordError(state, writeResult.diagnostic);
  }
  return state;
};
var recordWarning = (state, diagnostic2) => ({
  ...state,
  warnings: [...state.warnings, diagnostic2],
  summary: {
    ...state.summary,
    warnings: state.summary.warnings + 1
  }
});
var recordError = (state, diagnostic2) => ({
  ...state,
  errors: [...state.errors, diagnostic2],
  summary: {
    ...state.summary,
    failed: state.summary.failed + 1,
    errors: state.summary.errors + 1
  }
});
var incrementSummary = (state, key) => ({
  ...state,
  summary: {
    ...state.summary,
    [key]: state.summary[key] + 1
  }
});
var hasAtLeastPermission = (currentPermission, expectedPermission) => PERMISSION_RANK[currentPermission] >= PERMISSION_RANK[expectedPermission];
var hasHigherPermission = (currentPermission, expectedPermission) => PERMISSION_RANK[currentPermission] > PERMISSION_RANK[expectedPermission];
var executeCreateRepository = async (input, state, operation, observedAt) => {
  const student = findStudent(input, input.students, operation);
  if (student === void 0 || operation.repository_name === void 0) {
    return state;
  }
  const repositoryName = operation.repository_name;
  try {
    const parsedTemplate = parseTemplateRepository(
      input.config.course.github.organization,
      input.config.assignment.template.repository
    );
    if (parsedTemplate.status === "failure") {
      return recordError(state, parsedTemplate.diagnostic);
    }
    await runGitHubOperation(
      input,
      () => input.githubClient.createRepositoryFromTemplate({
        templateOwner: parsedTemplate.repository.owner,
        templateRepo: parsedTemplate.repository.repo,
        owner: input.config.course.github.organization,
        name: repositoryName,
        private: PRIVATE_REPOSITORY
      })
    );
    const repository = await runGitHubOperation(
      input,
      () => input.githubClient.getRepository(input.config.course.github.organization, repositoryName)
    );
    if (repository === null) {
      return recordError(
        state,
        createRepositoryCreationNotObservedDiagnostic(
          operation,
          input.config.course.github.organization,
          repositoryName
        )
      );
    }
    const manifest = upsertRepositoryRecord(
      state.manifest,
      createManifestRecord(
        input.config,
        student,
        repository,
        observedAt,
        state.manifest.template.commitSha
      )
    );
    return persistManifest(
      incrementSummary(
        {
          ...state,
          manifest
        },
        "created"
      ),
      input.manifestPath
    );
  } catch (error) {
    return recordError(state, normalizeGitHubError(error));
  }
};
var executeStudentCollaborator = async (input, state, operation, observedAt) => {
  if (operation.repository_name === void 0 || operation.github_username === void 0) {
    return state;
  }
  const repositoryName = operation.repository_name;
  const githubUsername = operation.github_username;
  if (findManifestRecord4(input, state.manifest, operation) === void 0) {
    return incrementSummary(state, "skipped");
  }
  try {
    const currentPermission = await runGitHubOperation(
      input,
      () => input.githubClient.getCollaboratorPermission(
        input.config.course.github.organization,
        repositoryName,
        githubUsername
      )
    );
    let nextState = state;
    if (hasAtLeastPermission(currentPermission.permission, STUDENT_PERMISSION2)) {
      nextState = incrementSummary(nextState, "noop");
      if (hasHigherPermission(currentPermission.permission, STUDENT_PERMISSION2)) {
        nextState = recordWarning(
          nextState,
          createPermissionWarning(operation, currentPermission.permission, STUDENT_PERMISSION2)
        );
      }
    } else {
      await runGitHubOperation(
        input,
        () => input.githubClient.addCollaborator({
          owner: input.config.course.github.organization,
          repo: repositoryName,
          username: githubUsername,
          permission: STUDENT_PERMISSION2
        })
      );
      nextState = incrementSummary(nextState, "verified");
    }
    const collaborators = await runGitHubOperation(
      input,
      () => input.githubClient.listCollaboratorPermissions(
        input.config.course.github.organization,
        repositoryName
      )
    );
    for (const collaborator of collaborators) {
      if (collaborator.username !== githubUsername) {
        nextState = recordWarning(
          nextState,
          createUnexpectedCollaboratorWarning(
            operation,
            collaborator.username,
            collaborator.permission
          )
        );
      }
    }
    return persistManifest(
      {
        ...nextState,
        manifest: updatePermissionState(nextState.manifest, {
          studentId: operation.student_id ?? "",
          permissions: {
            student: {
              username: githubUsername,
              permission: currentPermission.permission === "none" ? STUDENT_PERMISSION2 : currentPermission.permission,
              pendingInvite: currentPermission.pendingInvite,
              lastObservedAt: observedAt,
              lastAppliedAt: observedAt
            }
          }
        })
      },
      input.manifestPath
    );
  } catch (error) {
    return recordError(state, normalizeGitHubError(error));
  }
};
var executeTeamPermission = async (input, state, operation, teamSlug, expectedPermission, observedAt) => {
  if (operation.repository_name === void 0) {
    return state;
  }
  const repositoryName = operation.repository_name;
  if (findManifestRecord4(input, state.manifest, operation) === void 0) {
    return incrementSummary(state, "skipped");
  }
  try {
    const currentPermission = await runGitHubOperation(
      input,
      () => input.githubClient.getTeamPermission(
        input.config.course.github.organization,
        repositoryName,
        teamSlug
      )
    );
    let nextState = state;
    if (hasAtLeastPermission(currentPermission.permission, expectedPermission)) {
      nextState = incrementSummary(nextState, "noop");
      if (hasHigherPermission(currentPermission.permission, expectedPermission)) {
        nextState = recordWarning(
          nextState,
          createPermissionWarning(operation, currentPermission.permission, expectedPermission)
        );
      }
    } else {
      await runGitHubOperation(
        input,
        () => input.githubClient.addTeamPermission({
          owner: input.config.course.github.organization,
          repo: repositoryName,
          teamSlug,
          permission: expectedPermission
        })
      );
      nextState = incrementSummary(nextState, "verified");
    }
    return persistManifest(
      {
        ...nextState,
        manifest: updatePermissionState(nextState.manifest, {
          studentId: operation.student_id ?? "",
          permissions: operation.type === "add_faculty_team_permission" ? {
            facultyTeam: {
              teamSlug,
              permission: currentPermission.permission === "none" ? expectedPermission : currentPermission.permission,
              lastObservedAt: observedAt,
              lastAppliedAt: observedAt
            }
          } : {
            graderTeam: {
              teamSlug,
              permission: currentPermission.permission === "none" ? expectedPermission : currentPermission.permission,
              lastObservedAt: observedAt,
              lastAppliedAt: observedAt
            }
          }
        })
      },
      input.manifestPath
    );
  } catch (error) {
    return recordError(state, normalizeGitHubError(error));
  }
};
var executeEnableActions = async (input, state, operation, observedAt) => {
  if (operation.repository_name === void 0) {
    return state;
  }
  const repositoryName = operation.repository_name;
  if (findManifestRecord4(input, state.manifest, operation) === void 0) {
    return incrementSummary(state, "skipped");
  }
  try {
    const actionsState = await runGitHubOperation(
      input,
      () => input.githubClient.getActionsState(input.config.course.github.organization, repositoryName)
    );
    let nextState = state;
    if (actionsState === "enabled") {
      nextState = incrementSummary(nextState, "noop");
    } else {
      await runGitHubOperation(
        input,
        () => input.githubClient.enableActions(input.config.course.github.organization, repositoryName)
      );
      nextState = incrementSummary(nextState, "verified");
    }
    return persistManifest(
      {
        ...nextState,
        manifest: updateActionsState(nextState.manifest, {
          studentId: operation.student_id ?? "",
          actions: {
            enabled: DEFAULT_ACTIONS_ENABLED,
            lastObservedAt: observedAt
          }
        })
      },
      input.manifestPath
    );
  } catch (error) {
    return recordError(state, normalizeGitHubError(error));
  }
};
var executeVerifyWorkflow = async (input, state, operation, observedAt) => {
  if (operation.repository_name === void 0 || input.config.course.grading.workflow === void 0) {
    return state;
  }
  const repositoryName = operation.repository_name;
  const workflowPath = input.config.course.grading.workflow;
  const workflowDispatchIdentifier = getWorkflowDispatchIdentifier(workflowPath);
  if (findManifestRecord4(input, state.manifest, operation) === void 0) {
    return incrementSummary(state, "skipped");
  }
  try {
    const workflow = await runGitHubOperation(
      input,
      () => input.githubClient.getWorkflow(
        input.config.course.github.organization,
        repositoryName,
        workflowDispatchIdentifier
      )
    );
    if (workflow === null) {
      const isNewRepository = wasRepositoryCreatedInPlan(input, operation);
      const diagnostic2 = isNewRepository ? createWorkflowPendingWarning(operation) : createWorkflowMissingDiagnostic2(operation);
      return persistManifest(
        (isNewRepository ? recordWarning : recordError)(
          {
            ...state,
            manifest: updateActionsState(state.manifest, {
              studentId: operation.student_id ?? "",
              actions: {
                gradingWorkflowPath: workflowPath,
                ...isNewRepository ? {} : { gradingWorkflowFound: false },
                lastObservedAt: observedAt
              }
            })
          },
          diagnostic2
        ),
        input.manifestPath
      );
    }
    return persistManifest(
      incrementSummary(
        {
          ...state,
          manifest: updateActionsState(state.manifest, {
            studentId: operation.student_id ?? "",
            actions: {
              gradingWorkflowPath: workflow.path,
              gradingWorkflowFound: true,
              lastObservedAt: observedAt
            }
          })
        },
        "verified"
      ),
      input.manifestPath
    );
  } catch (error) {
    return recordError(state, normalizeGitHubError(error));
  }
};
var executeVerifyDispatch = async (input, state, operation, observedAt) => {
  if (operation.repository_name === void 0 || input.config.course.grading.workflow === void 0) {
    return state;
  }
  const repositoryName = operation.repository_name;
  const workflowPath = input.config.course.grading.workflow;
  const workflowDispatchIdentifier = getWorkflowDispatchIdentifier(workflowPath);
  if (findManifestRecord4(input, state.manifest, operation) === void 0) {
    return incrementSummary(state, "skipped");
  }
  try {
    const workflow = await runGitHubOperation(
      input,
      () => input.githubClient.getWorkflow(
        input.config.course.github.organization,
        repositoryName,
        workflowDispatchIdentifier
      )
    );
    if (workflow === null || !workflow.supportsDispatch) {
      const isNewRepository = wasRepositoryCreatedInPlan(input, operation);
      const diagnostic2 = workflow === null && isNewRepository ? createWorkflowPendingWarning(operation) : createWorkflowDispatchDiagnostic(operation);
      return persistManifest(
        (workflow === null && isNewRepository ? recordWarning : recordError)(
          {
            ...state,
            manifest: updateActionsState(state.manifest, {
              studentId: operation.student_id ?? "",
              actions: {
                ...workflow === null && isNewRepository ? {} : { workflowDispatchSupported: false },
                lastObservedAt: observedAt
              }
            })
          },
          diagnostic2
        ),
        input.manifestPath
      );
    }
    return persistManifest(
      incrementSummary(
        {
          ...state,
          manifest: updateActionsState(state.manifest, {
            studentId: operation.student_id ?? "",
            actions: {
              workflowDispatchSupported: true,
              lastObservedAt: observedAt
            }
          })
        },
        "verified"
      ),
      input.manifestPath
    );
  } catch (error) {
    return recordError(state, normalizeGitHubError(error));
  }
};
var executeOperation = async (input, state, operation, observedAt) => {
  if (operation.status === "skipped") {
    return incrementSummary(state, "skipped");
  }
  if (operation.status === "noop") {
    return incrementSummary(state, "existing");
  }
  if (operation.status !== "planned") {
    return state;
  }
  if (operation.type === "create_repository_from_template") {
    return executeCreateRepository(input, state, operation, observedAt);
  }
  if (operation.type === "add_student_collaborator") {
    return executeStudentCollaborator(input, state, operation, observedAt);
  }
  if (operation.type === "add_faculty_team_permission") {
    return executeTeamPermission(
      input,
      state,
      operation,
      input.config.course.github.faculty_team,
      FACULTY_PERMISSION2,
      observedAt
    );
  }
  if (operation.type === "add_grader_team_permission") {
    return executeTeamPermission(
      input,
      state,
      operation,
      input.config.course.github.grader_team,
      GRADER_PERMISSION2,
      observedAt
    );
  }
  if (operation.type === "enable_actions") {
    return executeEnableActions(input, state, operation, observedAt);
  }
  if (operation.type === "verify_grading_workflow") {
    return executeVerifyWorkflow(input, state, operation, observedAt);
  }
  return executeVerifyDispatch(input, state, operation, observedAt);
};
var executeApplyPlan = async (input) => {
  const initialManifest = input.manifest ?? await createInitialManifest(input.config, input.plan, input.githubClient);
  let state = {
    manifest: initialManifest,
    summary: createEmptySummary2(),
    warnings: [],
    errors: []
  };
  const observedAt = input.clock.now().toISOString();
  for (const operation of input.plan.operations) {
    state = await executeOperation(input, state, operation, observedAt);
  }
  return state;
};

// src/execution/mutation-guard.ts
var EMPTY_COUNT7 = 0;
var createMutationBlockedDiagnostic = () => createConfigDiagnostic(
  DiagnosticCode.MutationBlocked,
  "Apply is blocked because the computed plan contains blocked operations or errors."
);
var createConfirmationRequiredDiagnostic = () => createConfigDiagnostic(
  DiagnosticCode.ConfirmationRequired,
  "Apply requires --yes in non-interactive execution before making GitHub mutations."
);
var evaluateMutationGuard = ({
  plan,
  options
}) => {
  const hasBlockedOperations = plan.operations.some((operation) => operation.status === "blocked");
  if (hasBlockedOperations || plan.errors.length > EMPTY_COUNT7) {
    return {
      allowed: false,
      errors: [createMutationBlockedDiagnostic(), ...plan.errors]
    };
  }
  if (!options.yes) {
    return {
      allowed: false,
      errors: [createConfirmationRequiredDiagnostic()]
    };
  }
  return {
    allowed: true,
    errors: []
  };
};

// src/github/github-readiness-validation.ts
var README_FILE = "README.md";
var EMPTY_COUNT8 = 0;
var createUnexpectedGitHubDiagnostic = () => createConfigDiagnostic(
  DiagnosticCode.GithubApiError,
  "Unexpected GitHub client failure during readiness validation."
);
var normalizeGitHubError2 = (error) => error instanceof GitHubClientError ? createGitHubDiagnostic(error) : createUnexpectedGitHubDiagnostic();
var validateAuthentication = async (githubClient) => {
  try {
    await githubClient.getAuthenticatedUser();
    return [];
  } catch (error) {
    return [normalizeGitHubError2(error)];
  }
};
var createTemplateOutsideOrgDiagnostic = (reference) => createConfigDiagnostic(
  DiagnosticCode.TemplateRepositoryOutsideOrg,
  `Template repository ${reference.fullName} must belong to GitHub organization ${reference.organization}.`,
  {
    repository: reference.fullName,
    organization: reference.organization
  }
);
var createTemplateMissingDiagnostic = (reference) => createConfigDiagnostic(
  DiagnosticCode.TemplateRepositoryMissing,
  `Template repository ${reference.fullName} was not found.`,
  {
    repository: reference.fullName,
    organization: reference.organization
  }
);
var createTemplateNotTemplateDiagnostic = (reference) => createConfigDiagnostic(
  DiagnosticCode.TemplateRepositoryNotTemplate,
  `Template repository ${reference.fullName} is not marked as a template.`,
  {
    repository: reference.fullName
  }
);
var createTemplateBranchMissingDiagnostic2 = (reference) => createConfigDiagnostic(
  DiagnosticCode.TemplateBranchMissing,
  `Template repository ${reference.fullName} does not contain branch ${reference.branch}.`,
  {
    repository: reference.fullName,
    templateBranch: reference.branch
  }
);
var createTemplateBranchNotDefaultDiagnostic = (reference, templateRepository) => createConfigDiagnostic(
  DiagnosticCode.TemplateBranchNotDefault,
  `Template branch ${reference.branch} must be the default branch for ${reference.fullName}.`,
  {
    repository: reference.fullName,
    templateBranch: reference.branch,
    expectedDefaultBranch: reference.branch,
    actualDefaultBranch: templateRepository.defaultBranch
  }
);
var createTemplateReadmeMissingDiagnostic = (reference) => createConfigDiagnostic(
  DiagnosticCode.TemplateReadmeMissing,
  `Template repository ${reference.fullName} must contain ${README_FILE}.`,
  {
    repository: reference.fullName,
    requiredFile: README_FILE
  }
);
var validateTemplateRepositoryFields = (reference, templateRepository) => [
  ...templateRepository.isTemplate ? [] : [createTemplateNotTemplateDiagnostic(reference)],
  ...templateRepository.branches.includes(reference.branch) ? [] : [createTemplateBranchMissingDiagnostic2(reference)],
  ...templateRepository.defaultBranch === reference.branch ? [] : [createTemplateBranchNotDefaultDiagnostic(reference, templateRepository)],
  ...templateRepository.files.includes(README_FILE) ? [] : [createTemplateReadmeMissingDiagnostic(reference)]
];
var validateTemplateRepository = async (courseConfig, assignmentConfig, githubClient) => {
  const parsedRepository = parseTemplateRepository(
    courseConfig.github.organization,
    assignmentConfig.template.repository
  );
  if (parsedRepository.status === "failure") {
    return [parsedRepository.diagnostic];
  }
  const reference = {
    ...parsedRepository.repository,
    branch: assignmentConfig.template.branch,
    organization: courseConfig.github.organization
  };
  if (reference.owner !== reference.organization) {
    return [createTemplateOutsideOrgDiagnostic(reference)];
  }
  try {
    const templateRepository = await githubClient.getTemplateRepository(
      reference.owner,
      reference.repo
    );
    if (templateRepository === null) {
      return [createTemplateMissingDiagnostic(reference)];
    }
    if (templateRepository.owner !== reference.organization) {
      return [createTemplateOutsideOrgDiagnostic(reference)];
    }
    return validateTemplateRepositoryFields(reference, templateRepository);
  } catch (error) {
    return [normalizeGitHubError2(error)];
  }
};
var getEffectiveGrading4 = (courseConfig, assignmentConfig) => assignmentConfig.grading ?? courseConfig.grading;
var createTemplateWorkflowMissingDiagnostic = (reference, workflow, checkedPaths) => createConfigDiagnostic(
  DiagnosticCode.GradingWorkflowMissing,
  `Configured grading workflow ${workflow} was not found in template repository ${reference.fullName}.`,
  {
    workflow,
    checkedPaths,
    templateRepository: reference.fullName,
    templateBranch: reference.branch
  }
);
var createTemplateWorkflowDispatchUnsupportedDiagnostic = (reference, workflowPath) => createConfigDiagnostic(
  DiagnosticCode.WorkflowDispatchUnsupported,
  `Configured grading workflow ${workflowPath} does not include ${WORKFLOW_DISPATCH_TRIGGER}.`,
  {
    workflow: workflowPath,
    templateRepository: reference.fullName,
    templateBranch: reference.branch,
    requiredTrigger: WORKFLOW_DISPATCH_TRIGGER
  }
);
var validateTemplateWorkflowContent = (reference, workflowPath, content) => {
  const parseResult = parseYaml(content, workflowPath);
  if (parseResult.status === "failure") {
    return [parseResult.diagnostic];
  }
  return hasWorkflowDispatchTrigger(parseResult.value) ? [] : [createTemplateWorkflowDispatchUnsupportedDiagnostic(reference, workflowPath)];
};
var validateTemplateWorkflow = async (courseConfig, assignmentConfig, githubClient) => {
  const grading = getEffectiveGrading4(courseConfig, assignmentConfig);
  if (!grading.enabled || grading.workflow === void 0) {
    return [];
  }
  const parsedRepository = parseTemplateRepository(
    courseConfig.github.organization,
    assignmentConfig.template.repository
  );
  if (parsedRepository.status === "failure") {
    return [];
  }
  const reference = {
    ...parsedRepository.repository,
    branch: assignmentConfig.template.branch,
    organization: courseConfig.github.organization
  };
  const checkedPaths = createRepositoryWorkflowPathCandidates(grading.workflow);
  try {
    const templateRepository = await githubClient.getTemplateRepository(
      reference.owner,
      reference.repo
    );
    if (templateRepository === null || templateRepository.owner !== reference.organization) {
      return [];
    }
    let workflowContent;
    let workflowPath;
    for (const checkedPath of checkedPaths) {
      if (workflowContent === void 0) {
        const content = await githubClient.getRepositoryFileContent(
          reference.owner,
          reference.repo,
          checkedPath,
          reference.branch
        );
        if (content !== null) {
          workflowContent = content;
          workflowPath = checkedPath;
        }
      }
    }
    return workflowContent === void 0 || workflowPath === void 0 ? [createTemplateWorkflowMissingDiagnostic(reference, grading.workflow, checkedPaths)] : validateTemplateWorkflowContent(reference, workflowPath, workflowContent);
  } catch (error) {
    return [normalizeGitHubError2(error)];
  }
};
var createTeamMissingDiagnostic = (code, label, organization, teamSlug) => createConfigDiagnostic(code, `${label} team ${teamSlug} was not found in ${organization}.`, {
  organization,
  teamSlug
});
var validateTeam = async (githubClient, organization, teamSlug, code, label) => {
  try {
    const team = await githubClient.getTeam(organization, teamSlug);
    return team === null ? [createTeamMissingDiagnostic(code, label, organization, teamSlug)] : [];
  } catch (error) {
    return [normalizeGitHubError2(error)];
  }
};
var validateTeams = async (courseConfig, githubClient) => {
  const organization = courseConfig.github.organization;
  const facultyTeamErrors = await validateTeam(
    githubClient,
    organization,
    courseConfig.github.faculty_team,
    DiagnosticCode.FacultyTeamMissing,
    "Faculty"
  );
  const graderTeamErrors = await validateTeam(
    githubClient,
    organization,
    courseConfig.github.grader_team,
    DiagnosticCode.GraderTeamMissing,
    "Grader"
  );
  return [...facultyTeamErrors, ...graderTeamErrors];
};
var createMissingUserDiagnostic = (student) => createConfigDiagnostic(
  DiagnosticCode.GithubUserMissing,
  `GitHub user ${student.githubUsername} was not found for student ${student.studentId}.`,
  {
    student_id: student.studentId,
    github_username: student.githubUsername,
    section: student.section,
    status: student.status,
    rosterPath: student.rosterPath,
    rowNumber: student.rowNumber
  }
);
var validateGithubUser = async (githubClient, student) => {
  try {
    const user = await githubClient.getUser(student.githubUsername);
    return user === null ? [createMissingUserDiagnostic(student)] : [];
  } catch (error) {
    return [normalizeGitHubError2(error)];
  }
};
var validateGithubUsers = async (githubClient, students) => {
  const diagnostics = [];
  for (const student of students) {
    diagnostics.push(...await validateGithubUser(githubClient, student));
  }
  return diagnostics;
};
var validateGitHubReadiness = async ({
  courseConfig,
  assignmentConfig,
  students,
  githubClient,
  validateTemplateWorkflow: shouldValidateTemplateWorkflow = false
}) => {
  const authenticationErrors = await validateAuthentication(githubClient);
  if (authenticationErrors.length > EMPTY_COUNT8) {
    return {
      warnings: [],
      errors: authenticationErrors
    };
  }
  const errors = [
    ...await validateTemplateRepository(courseConfig, assignmentConfig, githubClient),
    ...shouldValidateTemplateWorkflow ? await validateTemplateWorkflow(courseConfig, assignmentConfig, githubClient) : [],
    ...await validateTeams(courseConfig, githubClient),
    ...await validateGithubUsers(githubClient, students)
  ];
  return {
    warnings: [],
    errors
  };
};

// src/config/source-fingerprint.ts
import path9 from "path";

// src/core/hash.ts
import { createHash } from "crypto";
import fs6 from "fs";
var SHA_256_ALGORITHM = "sha256";
var HEX_ENCODING = "hex";
var hashStringSha256 = (value) => createHash(SHA_256_ALGORITHM).update(value).digest(HEX_ENCODING);
var hashBufferSha256 = (value) => createHash(SHA_256_ALGORITHM).update(value).digest(HEX_ENCODING);
var hashFileSha256 = (filePath) => {
  if (!fs6.existsSync(filePath)) {
    return {
      status: "failure",
      diagnostic: createConfigDiagnostic(
        DiagnosticCode.SourceFileMissing,
        `Source file ${filePath} was not found.`,
        {
          filePath
        }
      )
    };
  }
  const fileStats = fs6.statSync(filePath);
  if (!fileStats.isFile()) {
    return {
      status: "failure",
      diagnostic: createConfigDiagnostic(
        DiagnosticCode.SourceFileNotFile,
        `Source path ${filePath} is not a file.`,
        {
          filePath
        }
      )
    };
  }
  return {
    status: "success",
    sha256: hashBufferSha256(fs6.readFileSync(filePath))
  };
};

// src/config/source-fingerprint.ts
var EMPTY_FINGERPRINT = "";
var EMPTY_LENGTH4 = 0;
var sortSourceFiles = (sourceFiles) => [...sourceFiles].sort((left, right) => left.path.localeCompare(right.path));
var createSourceOutsideRepoDiagnostic = (repoRoot, sourceFilePath) => createConfigDiagnostic(
  DiagnosticCode.SourceFileOutsideRepo,
  `Source file ${sourceFilePath} must be inside repository root.`,
  {
    repoRoot,
    sourceFilePath
  }
);
var resolveSourcePath = (repoRoot, sourceFilePath) => {
  const absolutePath = path9.isAbsolute(sourceFilePath) ? path9.resolve(sourceFilePath) : path9.resolve(repoRoot, sourceFilePath);
  try {
    return {
      absolutePath,
      relativePath: toRepositoryRelativePath(repoRoot, absolutePath)
    };
  } catch {
    return createSourceOutsideRepoDiagnostic(repoRoot, sourceFilePath);
  }
};
var createInputFingerprint = (sourceFiles) => hashStringSha256(JSON.stringify(sortSourceFiles(sourceFiles)));
var createSourceFingerprint = ({
  repoRoot,
  sourceFilePaths
}) => {
  const sourceFiles = [];
  const errors = [];
  for (const sourceFilePath of sourceFilePaths) {
    const resolvedSourcePath = resolveSourcePath(repoRoot, sourceFilePath);
    if ("code" in resolvedSourcePath) {
      errors.push(resolvedSourcePath);
    } else {
      const hashResult = hashFileSha256(resolvedSourcePath.absolutePath);
      if (hashResult.status === "failure") {
        errors.push(hashResult.diagnostic);
      } else {
        sourceFiles.push({
          path: resolvedSourcePath.relativePath,
          sha256: hashResult.sha256
        });
      }
    }
  }
  const orderedSourceFiles = sortSourceFiles(sourceFiles);
  return {
    sourceFiles: orderedSourceFiles,
    inputFingerprint: errors.length === EMPTY_LENGTH4 ? createInputFingerprint(orderedSourceFiles) : EMPTY_FINGERPRINT,
    warnings: [],
    errors
  };
};
var getSourceFingerprintPaths = ({
  courseConfigPath,
  termConfigPath,
  assignmentConfigPath,
  rosterFiles
}) => [
  courseConfigPath,
  termConfigPath,
  assignmentConfigPath,
  ...rosterFiles
];

// src/planning/operation-models.ts
var PLAN_OPERATION_TYPES = [
  "create_repository_from_template",
  "add_student_collaborator",
  "add_faculty_team_permission",
  "add_grader_team_permission",
  "enable_actions",
  "verify_grading_workflow",
  "verify_workflow_dispatch"
];

// src/planning/operation-ordering.ts
var OPERATION_ID_SEPARATOR = ":";
var UNKNOWN_OPERATION_INDEX = PLAN_OPERATION_TYPES.length;
var operationOrderIndex = (type) => {
  const index = PLAN_OPERATION_TYPES.indexOf(type);
  return index < 0 ? UNKNOWN_OPERATION_INDEX : index;
};
var createOperationId = (section, studentId, type) => [section, studentId, type].join(OPERATION_ID_SEPARATOR);
var comparePlanOperations = (left, right) => (left.section ?? "").localeCompare(right.section ?? "") || (left.student_id ?? "").localeCompare(right.student_id ?? "") || operationOrderIndex(left.type) - operationOrderIndex(right.type);

// src/planning/plan-models.ts
var PLAN_SCHEMA_VERSION = 1;

// src/planning/repository-targets.ts
var createIndividualRepositoryTarget = (config, student) => {
  const name = generateRepositoryName({
    pattern: config.course.github.repo_name_pattern,
    termCode: config.summary.termCode,
    courseCode: config.course.course.code,
    assignmentSlug: config.summary.assignmentSlug,
    githubUsername: student.githubUsername
  });
  return {
    targetId: student.studentId,
    mode: "individual",
    repositoryName: name.repositoryName ?? "",
    sectionIds: [student.section],
    studentIds: [student.studentId],
    githubUsernames: [student.githubUsername],
    primaryStudentId: student.studentId,
    plannedStudentPermission: "admin",
    facultyTeamPermission: config.course.github.faculty_permission,
    graderTeamPermission: config.course.github.grader_permission,
    diagnostics: [...name.warnings, ...name.errors]
  };
};

// src/planning/plan-builder.ts
var EMPTY_COUNT9 = 0;
var NO_REPOSITORY_NAME = "";
var ACTIVE_ASSIGNMENT_STATUS3 = "active";
var DRAFT_ASSIGNMENT_STATUS3 = "draft";
var CLOSED_ASSIGNMENT_STATUS3 = "closed";
var ARCHIVED_ASSIGNMENT_STATUS3 = "archived";
var STUDENT_STATUS_REASON_PREFIX3 = "student_status";
var GRADING_DISABLED_REASON = "grading_disabled";
var createUnexpectedGitHubDiagnostic2 = () => createConfigDiagnostic(
  DiagnosticCode.GithubApiError,
  "Unexpected GitHub client failure during planning."
);
var normalizeGitHubError3 = (error) => error instanceof GitHubClientError ? createGitHubDiagnostic(error) : createUnexpectedGitHubDiagnostic2();
var createOperation = (student, type, status, input = {}) => ({
  id: createOperationId(student.section, student.studentId, type),
  type,
  status,
  requires: input.requires ?? [],
  target_id: student.studentId,
  student_id: student.studentId,
  github_username: student.githubUsername,
  section: student.section,
  ...input.repositoryName === void 0 ? {} : { repository_name: input.repositoryName },
  ...input.reason === void 0 ? {} : { reason: input.reason },
  warnings: input.warnings ?? [],
  errors: input.errors ?? []
});
var createCollisionDiagnostic = (organization, repositoryName) => createConfigDiagnostic(
  DiagnosticCode.RepoNameCollision,
  `Repository ${organization}/${repositoryName} already exists and is not manifest-tracked.`,
  {
    organization,
    repositoryName
  }
);
var createManifestTrackedMissingDiagnostic2 = (organization, repositoryName, student) => createConfigDiagnostic(
  DiagnosticCode.ManifestTrackedRepositoryMissing,
  `Manifest-tracked repository ${organization}/${repositoryName} was not found on GitHub.`,
  {
    organization,
    repositoryName,
    student_id: student.studentId,
    github_username: student.githubUsername,
    section: student.section
  }
);
var createLifecycleDiagnostic2 = (code, message, assignmentStatus, student) => createConfigDiagnostic(code, message, {
  assignmentStatus,
  student_id: student.studentId,
  github_username: student.githubUsername,
  section: student.section
});
var createPlanBlockedDiagnostic = (blockedOperationCount) => createConfigDiagnostic(
  DiagnosticCode.PlanContainsBlockedOperations,
  "Plan contains blocked operations.",
  {
    blockedOperationCount
  }
);
var generateStudentRepositoryName = (config, student) => {
  const result = generateRepositoryName({
    pattern: config.course.github.repo_name_pattern,
    termCode: config.summary.termCode,
    courseCode: config.course.course.code,
    assignmentSlug: config.summary.assignmentSlug,
    githubUsername: student.githubUsername
  });
  return {
    repositoryName: result.repositoryName ?? NO_REPOSITORY_NAME,
    warnings: result.warnings,
    errors: result.errors
  };
};
var createLifecycleBlockedOperation = (config, student, diagnostic2, repositoryName) => createOperation(student, "create_repository_from_template", "blocked", {
  repositoryName,
  reason: config.assignment.assignment.status,
  errors: [diagnostic2]
});
var buildSkippedStudentOperation = (student) => createOperation(student, "create_repository_from_template", "skipped", {
  reason: `${STUDENT_STATUS_REASON_PREFIX3}_${student.status}`
});
var buildLifecycleOperations = (config, student, repositoryName) => {
  const assignmentStatus = config.assignment.assignment.status;
  if (assignmentStatus === DRAFT_ASSIGNMENT_STATUS3) {
    return [
      createLifecycleBlockedOperation(
        config,
        student,
        createLifecycleDiagnostic2(
          DiagnosticCode.AssignmentNotActive,
          "Draft assignments cannot be applied.",
          assignmentStatus,
          student
        ),
        repositoryName
      )
    ];
  }
  if (assignmentStatus === CLOSED_ASSIGNMENT_STATUS3) {
    return [
      createLifecycleBlockedOperation(
        config,
        student,
        createLifecycleDiagnostic2(
          DiagnosticCode.AssignmentClosedBlocksCreation,
          "Closed assignments block new repository creation.",
          assignmentStatus,
          student
        ),
        repositoryName
      )
    ];
  }
  if (assignmentStatus === ARCHIVED_ASSIGNMENT_STATUS3) {
    return [
      createLifecycleBlockedOperation(
        config,
        student,
        createLifecycleDiagnostic2(
          DiagnosticCode.AssignmentArchived,
          "Archived assignments cannot be planned for provisioning.",
          assignmentStatus,
          student
        ),
        repositoryName
      )
    ];
  }
  return [];
};
var buildPlannedProvisioningOperations = (config, student, repositoryName) => {
  const createRepositoryId = createOperationId(
    student.section,
    student.studentId,
    "create_repository_from_template"
  );
  const enableActionsId = createOperationId(student.section, student.studentId, "enable_actions");
  const verifyWorkflowId = createOperationId(
    student.section,
    student.studentId,
    "verify_grading_workflow"
  );
  const sharedInput = {
    repositoryName,
    requires: [createRepositoryId]
  };
  return [
    createOperation(student, "create_repository_from_template", "planned", {
      repositoryName
    }),
    createOperation(student, "add_student_collaborator", "planned", sharedInput),
    createOperation(student, "add_faculty_team_permission", "planned", sharedInput),
    createOperation(student, "add_grader_team_permission", "planned", sharedInput),
    createOperation(student, "enable_actions", "planned", sharedInput),
    ...config.summary.gradingEnabled ? [
      createOperation(student, "verify_grading_workflow", "planned", {
        repositoryName,
        requires: [enableActionsId]
      }),
      createOperation(student, "verify_workflow_dispatch", "planned", {
        repositoryName,
        requires: [verifyWorkflowId]
      })
    ] : [
      createOperation(student, "verify_grading_workflow", "skipped", {
        repositoryName,
        requires: [enableActionsId],
        reason: GRADING_DISABLED_REASON
      }),
      createOperation(student, "verify_workflow_dispatch", "skipped", {
        repositoryName,
        requires: [verifyWorkflowId],
        reason: GRADING_DISABLED_REASON
      })
    ]
  ];
};
var buildTrackedRepositoryOperations = (config, student, repositoryName) => {
  const createRepositoryId = createOperationId(
    student.section,
    student.studentId,
    "create_repository_from_template"
  );
  const enableActionsId = createOperationId(student.section, student.studentId, "enable_actions");
  const verifyWorkflowId = createOperationId(
    student.section,
    student.studentId,
    "verify_grading_workflow"
  );
  const sharedInput = {
    repositoryName,
    requires: [createRepositoryId]
  };
  return [
    createOperation(student, "create_repository_from_template", "noop", {
      repositoryName,
      reason: "manifest_tracked_repository"
    }),
    createOperation(student, "add_student_collaborator", "planned", sharedInput),
    createOperation(student, "add_faculty_team_permission", "planned", sharedInput),
    createOperation(student, "add_grader_team_permission", "planned", sharedInput),
    createOperation(student, "enable_actions", "planned", sharedInput),
    ...config.summary.gradingEnabled ? [
      createOperation(student, "verify_grading_workflow", "planned", {
        repositoryName,
        requires: [enableActionsId]
      }),
      createOperation(student, "verify_workflow_dispatch", "planned", {
        repositoryName,
        requires: [verifyWorkflowId]
      })
    ] : [
      createOperation(student, "verify_grading_workflow", "skipped", {
        repositoryName,
        requires: [enableActionsId],
        reason: GRADING_DISABLED_REASON
      }),
      createOperation(student, "verify_workflow_dispatch", "skipped", {
        repositoryName,
        requires: [verifyWorkflowId],
        reason: GRADING_DISABLED_REASON
      })
    ]
  ];
};
var findManifestRecord5 = (manifest, student) => manifest?.repositories.find((record) => record.studentId === student.studentId);
var buildActiveStudentOperations = async (config, student, githubClient, manifest) => {
  const repositoryNameResult = generateStudentRepositoryName(config, student);
  if (repositoryNameResult.errors.length > EMPTY_COUNT9) {
    return [
      createOperation(student, "create_repository_from_template", "blocked", {
        errors: repositoryNameResult.errors,
        warnings: repositoryNameResult.warnings
      })
    ];
  }
  const manifestRecord = findManifestRecord5(manifest, student);
  const repositoryName = manifestRecord?.repository.name ?? repositoryNameResult.repositoryName;
  if (config.assignment.assignment.status === DRAFT_ASSIGNMENT_STATUS3 || config.assignment.assignment.status === ARCHIVED_ASSIGNMENT_STATUS3) {
    return buildLifecycleOperations(config, student, repositoryName);
  }
  if (manifestRecord !== void 0) {
    try {
      const existingRepository = await githubClient.getRepository(
        config.course.github.organization,
        manifestRecord.repository.name
      );
      if (existingRepository === null) {
        return [
          createOperation(student, "create_repository_from_template", "blocked", {
            repositoryName: manifestRecord.repository.name,
            errors: [
              createManifestTrackedMissingDiagnostic2(
                config.course.github.organization,
                manifestRecord.repository.name,
                student
              )
            ]
          })
        ];
      }
      return buildTrackedRepositoryOperations(config, student, manifestRecord.repository.name);
    } catch (error) {
      return [
        createOperation(student, "create_repository_from_template", "blocked", {
          repositoryName: manifestRecord.repository.name,
          errors: [normalizeGitHubError3(error)]
        })
      ];
    }
  }
  const lifecycleOperations = buildLifecycleOperations(config, student, repositoryName);
  if (lifecycleOperations.length > EMPTY_COUNT9) {
    return lifecycleOperations;
  }
  if (config.assignment.assignment.status !== ACTIVE_ASSIGNMENT_STATUS3) {
    return [];
  }
  try {
    const existingRepository = await githubClient.getRepository(
      config.course.github.organization,
      repositoryNameResult.repositoryName
    );
    if (existingRepository !== null) {
      return [
        createOperation(student, "create_repository_from_template", "blocked", {
          repositoryName,
          errors: [createCollisionDiagnostic(config.course.github.organization, repositoryName)]
        })
      ];
    }
    return buildPlannedProvisioningOperations(config, student, repositoryName);
  } catch (error) {
    return [
      createOperation(student, "create_repository_from_template", "blocked", {
        repositoryName,
        errors: [normalizeGitHubError3(error)]
      })
    ];
  }
};
var buildStudentOperations = async (config, student, githubClient, manifest) => student.status === ROSTER_STATUS_ACTIVE ? buildActiveStudentOperations(config, student, githubClient, manifest) : [buildSkippedStudentOperation(student)];
var createPlanSummary3 = (rosterSummary, operations) => ({
  total_students: rosterSummary.studentCount,
  active_students: rosterSummary.activeStudentCount,
  dropped_students: rosterSummary.droppedStudentCount,
  hold_students: rosterSummary.holdStudentCount,
  planned_operations: operations.filter((operation) => operation.status === "planned").length,
  noop_operations: operations.filter((operation) => operation.status === "noop").length,
  skipped_operations: operations.filter((operation) => operation.status === "skipped").length,
  blocked_operations: operations.filter((operation) => operation.status === "blocked").length
});
var collectOperationDiagnostics = (operations) => operations.flatMap((operation) => operation.errors);
var buildPlan = async ({
  config,
  students,
  rosterSummary,
  githubClient,
  createdAt,
  manifest
}) => {
  const sourceFingerprint = createSourceFingerprint({
    repoRoot: config.summary.repoRoot,
    sourceFilePaths: getSourceFingerprintPaths({
      courseConfigPath: config.summary.courseConfigPath,
      termConfigPath: config.summary.termConfigPath,
      assignmentConfigPath: config.summary.assignmentConfigPath,
      rosterFiles: rosterSummary.rosterFiles
    })
  });
  const operationGroups = [];
  for (const student of students) {
    operationGroups.push(
      ...[await buildStudentOperations(config, student, githubClient, manifest)]
    );
  }
  const operations = operationGroups.flat().sort(comparePlanOperations);
  const summary = createPlanSummary3(rosterSummary, operations);
  const blockedPlanErrors = summary.blocked_operations > EMPTY_COUNT9 ? [createPlanBlockedDiagnostic(summary.blocked_operations)] : [];
  return {
    schema_version: PLAN_SCHEMA_VERSION,
    created_at: createdAt,
    assignment: {
      term_code: config.summary.termCode,
      course_code: config.course.course.code,
      assignment_slug: config.summary.assignmentSlug,
      assignment_title: config.assignment.assignment.title
    },
    source: {
      source_files: sourceFingerprint.sourceFiles,
      input_fingerprint: sourceFingerprint.inputFingerprint
    },
    summary,
    operations,
    targets: students.filter((student) => student.status === ROSTER_STATUS_ACTIVE).map((student) => createIndividualRepositoryTarget(config, student)),
    warnings: sourceFingerprint.warnings,
    errors: [
      ...sourceFingerprint.errors,
      ...collectOperationDiagnostics(operations),
      ...blockedPlanErrors
    ]
  };
};

// src/cli/output.ts
var CLI_JSON_SCHEMA_VERSION = 1;
var JSON_INDENT_SPACES = 2;
var EMPTY_COLLECTION_LENGTH = 0;
var createCliJsonOutput = (result) => {
  const redactedResult = redactCommandResult(result);
  return {
    schemaVersion: CLI_JSON_SCHEMA_VERSION,
    ...redactedResult,
    diagnostics: [...redactedResult.warnings, ...redactedResult.errors]
  };
};
var formatCommandResultAsJson = (result) => JSON.stringify(createCliJsonOutput(result), void 0, JSON_INDENT_SPACES);
var formatDiagnostic = (diagnostic2) => `${diagnostic2.code}: ${diagnostic2.message}`;
var formatCommandResultAsText = (result) => {
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
var writeCommandResult = (result, json) => {
  const output = json ? formatCommandResultAsJson(result) : formatCommandResultAsText(result);
  console.log(output);
};

// src/groups/group-apply-preflight.ts
var runGroupApplyPreflight = async (input) => {
  const plan = buildGroupApplyPreviewPlan(input.config, input.students);
  if (plan.errors.length > 0)
    return {
      targets: plan.targets,
      warnings: plan.warnings,
      errors: plan.errors,
      mutationSupported: false
    };
  const errors = [];
  for (const target of plan.targets) {
    const repository = await input.githubClient.getRepository(
      input.config.course.github.organization,
      target.repositoryName
    );
    if (repository !== null)
      errors.push(
        createConfigDiagnostic(
          "group_repository_untracked_collision",
          `Repository ${target.repositoryName} already exists and is not manifest-tracked. Graider will not adopt untracked repositories automatically. If this repository was created by a failed group Apply, delete it manually or use a future reconcile workflow, then run Apply again.`,
          { groupId: target.groupId, repositoryName: target.repositoryName }
        )
      );
  }
  return {
    targets: plan.targets,
    warnings: [
      ...plan.warnings,
      ...errors.length === 0 ? [
        createWarningDiagnostic(
          "group_apply_preflight_mutation_not_implemented",
          "Group Apply preflight passed, but group repository mutation is not implemented yet.",
          { assignmentFile: input.config.summary.assignmentConfigPath }
        )
      ] : []
    ],
    errors,
    mutationSupported: false
  };
};

// src/cli/commands/apply.command.ts
var COMMAND_NAME5 = "apply";
var EMPTY_COUNT10 = 0;
var getExecutionStatus = (errorsLength, summary) => {
  if (errorsLength === EMPTY_COUNT10) {
    return "success";
  }
  const successfulWorkCount = summary.created + summary.existing + summary.verified + summary.noop + summary.skipped;
  return successfulWorkCount > EMPTY_COUNT10 ? "partial_success" : "failure";
};
var runApplyCommand = async ({
  cwd,
  assignmentFile,
  options,
  commandName = COMMAND_NAME5,
  githubClient,
  clock = systemClock,
  retryOptions
}) => {
  const retryEvents = [];
  const effectiveRetryOptions = {
    ...retryOptions,
    onRetry: (event) => {
      retryEvents.push(event);
      retryOptions?.onRetry?.(event);
    }
  };
  const configResult = loadGraiderConfig({
    cwd,
    assignmentFile
  });
  if (configResult.status === "failure") {
    return createCommandResult({
      commandName,
      assignmentFile,
      status: "failure",
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: { options }
    });
  }
  const rosterResult = loadAssignmentRosters(configResult.config);
  if (rosterResult.errors.length > EMPTY_COUNT10) {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: rosterResult.warnings,
      errors: rosterResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary
      }
    });
  }
  const effectiveGitHubClient = githubClient ?? createGitHubClient();
  if (configResult.config.assignment.repository_mode === "group") {
    const preflight = await runGroupApplyPreflight({
      config: configResult.config,
      students: rosterResult.students,
      githubClient: effectiveGitHubClient
    });
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [...rosterResult.warnings, ...preflight.warnings],
      errors: [
        ...preflight.errors,
        createConfigDiagnostic(
          DiagnosticCode.GroupRepositoryApplyNotImplemented,
          "Group Apply preflight completed, but group repository creation is not implemented yet.",
          {
            assignmentFile: configResult.config.summary.assignmentConfigPath,
            targetCount: preflight.targets.length
          }
        )
      ],
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        groupTargets: preflight.targets.map((target) => ({
          groupId: target.groupId,
          repositoryName: target.repositoryName
        }))
      }
    });
  }
  const readinessResult = await validateGitHubReadiness({
    courseConfig: configResult.config.course,
    termConfig: configResult.config.term,
    assignmentConfig: configResult.config.assignment,
    students: rosterResult.students,
    githubClient: effectiveGitHubClient
  });
  if (readinessResult.errors.length > EMPTY_COUNT10) {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [...rosterResult.warnings, ...readinessResult.warnings],
      errors: readinessResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        githubReadinessChecked: true
      }
    });
  }
  const manifestPath = createManifestPath(
    configResult.config.summary.repoRoot,
    configResult.config.summary.termCode,
    configResult.config.summary.assignmentSlug
  );
  const manifestResult = loadManifest(manifestPath.absolutePath);
  if (manifestResult.status === "failure") {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: manifestResult.warnings,
      errors: manifestResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        manifestFile: manifestPath.relativePath
      }
    });
  }
  const plan = await buildPlan({
    config: configResult.config,
    students: rosterResult.students,
    rosterSummary: rosterResult.summary,
    githubClient: effectiveGitHubClient,
    createdAt: formatPlanCreatedAt(clock.now()),
    ...manifestResult.status === "loaded" ? { manifest: manifestResult.manifest } : {}
  });
  const guardResult = evaluateMutationGuard({ plan, options });
  if (!guardResult.allowed) {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [...rosterResult.warnings, ...plan.warnings],
      errors: guardResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        githubReadinessChecked: true,
        manifestFile: manifestPath.relativePath,
        blockedOperationCount: plan.summary.blocked_operations
      }
    });
  }
  const executionResult = await executeApplyPlan({
    config: configResult.config,
    plan,
    targets: plan.targets,
    ...manifestResult.status === "loaded" ? { manifest: manifestResult.manifest } : {},
    manifestPath: manifestPath.absolutePath,
    students: rosterResult.students,
    githubClient: effectiveGitHubClient,
    clock,
    retryOptions: effectiveRetryOptions
  });
  const generatedFiles = fs7.existsSync(manifestPath.absolutePath) ? [manifestPath.relativePath] : [];
  return createCommandResult({
    commandName,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: getExecutionStatus(executionResult.errors.length, executionResult.summary),
    warnings: [...rosterResult.warnings, ...plan.warnings, ...executionResult.warnings],
    errors: executionResult.errors,
    generatedFiles,
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
      githubReadinessChecked: true,
      manifestFile: manifestPath.relativePath,
      retryCount: retryEvents.length,
      retryDiagnostics: retryEvents.map((event) => event.diagnosticCode),
      ...executionResult.summary
    }
  });
};
var registerApplyCommand = (program) => {
  program.command(COMMAND_NAME5).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").description("Apply assignment repository changes.").action(async (assignmentFile, rawOptions) => {
    const options = normalizeCommonCommandOptions(rawOptions);
    const result = await runApplyCommand({
      cwd: process.cwd(),
      assignmentFile,
      options
    });
    writeCommandResult(result, options.json);
    process.exitCode = result.exitCode;
  });
};

// src/core/target-selector.ts
var EMPTY_COUNT11 = 0;
var SINGLE_SELECTOR_COUNT = 1;
var normalizeIdentity = (value) => value.trim().toLowerCase();
var createSelectorDiagnostic = (code, message, context) => createConfigDiagnostic(code, message, context);
var describeSelector = (selector) => {
  if (selector.kind === "all") {
    return "all";
  }
  if (selector.kind === "section") {
    return `section:${selector.section}`;
  }
  if (selector.kind === "student_id") {
    return `student_id:${selector.studentId}`;
  }
  return `github_username:${selector.githubUsername}`;
};
var validateTargetSelector = (rawSelector) => {
  const selectors = [];
  if (rawSelector.all === true) {
    selectors.push({ kind: "all" });
  }
  if (rawSelector.section !== void 0) {
    selectors.push({ kind: "section", section: rawSelector.section.trim() });
  }
  if (rawSelector.studentId !== void 0) {
    selectors.push({ kind: "student_id", studentId: normalizeIdentity(rawSelector.studentId) });
  }
  if (rawSelector.githubUsername !== void 0) {
    selectors.push({
      kind: "github_username",
      githubUsername: normalizeIdentity(rawSelector.githubUsername)
    });
  }
  if (selectors.length === EMPTY_COUNT11) {
    return {
      warnings: [],
      errors: [
        createSelectorDiagnostic(
          DiagnosticCode.TargetSelectorMissing,
          "Grade requires exactly one target selector."
        )
      ]
    };
  }
  if (selectors.length > SINGLE_SELECTOR_COUNT) {
    return {
      warnings: [],
      errors: [
        createSelectorDiagnostic(
          DiagnosticCode.TargetSelectorAmbiguous,
          "Grade received more than one target selector."
        )
      ]
    };
  }
  const selector = selectors[EMPTY_COUNT11];
  return selector === void 0 ? {
    warnings: [],
    errors: [
      createSelectorDiagnostic(
        DiagnosticCode.TargetSelectorMissing,
        "Grade requires exactly one target selector."
      )
    ]
  } : {
    selector,
    warnings: [],
    errors: []
  };
};
var createNoMatchesDiagnostic = (selector) => createSelectorDiagnostic(
  DiagnosticCode.TargetMatchesNoStudents,
  "Target selector matched no active students.",
  { targetSelector: describeSelector(selector) }
);
var createInactiveDiagnostic = (selector, student) => createSelectorDiagnostic(
  DiagnosticCode.TargetStudentNotActive,
  "Target selector matched a student who is not active.",
  {
    targetSelector: describeSelector(selector),
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    status: student.status
  }
);
var matchesSelector = (student, selector) => {
  if (selector.kind === "all") {
    return true;
  }
  if (selector.kind === "section") {
    return student.section === selector.section;
  }
  if (selector.kind === "student_id") {
    return student.studentId === selector.studentId;
  }
  return normalizeIdentity(student.githubUsername) === normalizeIdentity(selector.githubUsername);
};
var selectTargetStudents = (students, selector) => {
  const matchingStudents = students.filter((student) => matchesSelector(student, selector));
  const activeStudents = matchingStudents.filter(
    (student) => student.status === ROSTER_STATUS_ACTIVE
  );
  if (activeStudents.length > EMPTY_COUNT11) {
    return {
      students: activeStudents,
      warnings: [],
      errors: [],
      summary: {
        targetsSelected: activeStudents.length,
        targetSelector: describeSelector(selector)
      }
    };
  }
  const directInactiveMatch = (selector.kind === "student_id" || selector.kind === "github_username") && matchingStudents.length > EMPTY_COUNT11 ? matchingStudents[EMPTY_COUNT11] : void 0;
  return {
    students: [],
    warnings: [],
    errors: directInactiveMatch === void 0 ? [createNoMatchesDiagnostic(selector)] : [createInactiveDiagnostic(selector, directInactiveMatch)],
    summary: {
      targetsSelected: EMPTY_COUNT11,
      targetSelector: describeSelector(selector)
    }
  };
};

// src/execution/grade-executor.ts
var EMPTY_COUNT12 = 0;
var SUCCESS_INCREMENT = 1;
var FAILED_INCREMENT = 1;
var createInitialSummary = (targetsSelected) => ({
  targetsSelected,
  dispatchAttempted: EMPTY_COUNT12,
  dispatchSucceeded: EMPTY_COUNT12,
  dispatchFailed: EMPTY_COUNT12,
  skipped: EMPTY_COUNT12,
  warnings: EMPTY_COUNT12,
  errors: EMPTY_COUNT12
});
var getEffectiveGrading5 = (config) => config.assignment.grading === void 0 ? config.course.grading : config.assignment.grading;
var findManifestRecord6 = (manifest, student) => manifest.repositories.find(
  (record) => record.studentId === student.studentId && record.section === student.section
);
var normalizeGitHubError4 = (error, student, repository) => error instanceof GitHubClientError ? createConfigDiagnostic(
  DiagnosticCode.WorkflowDispatchFailed,
  "Workflow dispatch failed for a selected student repository.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    repositoryName: repository?.repository.name,
    underlyingDiagnosticCode: error.diagnosticCode,
    kind: error.kind
  }
) : createConfigDiagnostic(
  DiagnosticCode.WorkflowDispatchFailed,
  "Unexpected workflow dispatch failure.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    repositoryName: repository?.repository.name
  }
);
var createStudentRepositoryMissingDiagnostic3 = (student) => createConfigDiagnostic(
  DiagnosticCode.StudentRepositoryMissing,
  "Selected student does not have a manifest-tracked repository.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section
  }
);
var createWorkflowMissingDiagnostic3 = (student, repository, workflowPath) => createConfigDiagnostic(
  DiagnosticCode.GradingWorkflowMissing,
  "Configured grading workflow was not found.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    repositoryName: repository.repository.name,
    workflowPath
  }
);
var createWorkflowDispatchMissingDiagnostic3 = (student, repository, workflowPath) => createConfigDiagnostic(
  DiagnosticCode.WorkflowDispatchMissing,
  "Configured grading workflow does not support manual dispatch.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    repositoryName: repository.repository.name,
    workflowPath
  }
);
var createGradingNotConfiguredWarning3 = () => createWarningDiagnostic(
  DiagnosticCode.GradingNotConfigured,
  "Automated grading is not configured for this assignment."
);
var runGitHubOperation2 = async (input, operation) => withGitHubRetry(operation, input.retryOptions);
var recordFailure = (state, diagnostic2) => ({
  summary: {
    ...state.summary,
    dispatchFailed: state.summary.dispatchFailed + FAILED_INCREMENT,
    errors: state.summary.errors + FAILED_INCREMENT
  },
  warnings: state.warnings,
  errors: [...state.errors, diagnostic2]
});
var recordSuccess = (state) => ({
  summary: {
    ...state.summary,
    dispatchSucceeded: state.summary.dispatchSucceeded + SUCCESS_INCREMENT
  },
  warnings: state.warnings,
  errors: state.errors
});
var dispatchForStudent = async (input, state, student, configuredWorkflowPath) => {
  const repository = findManifestRecord6(input.manifest, student);
  const workflowDispatchIdentifier = getWorkflowDispatchIdentifier(configuredWorkflowPath);
  if (repository === void 0) {
    return recordFailure(state, createStudentRepositoryMissingDiagnostic3(student));
  }
  try {
    const workflow = await runGitHubOperation2(
      input,
      () => input.githubClient.getWorkflow(
        repository.repository.owner,
        repository.repository.name,
        workflowDispatchIdentifier
      )
    );
    if (workflow === null) {
      return recordFailure(
        state,
        createWorkflowMissingDiagnostic3(student, repository, configuredWorkflowPath)
      );
    }
    if (!workflow.supportsDispatch) {
      return recordFailure(
        state,
        createWorkflowDispatchMissingDiagnostic3(student, repository, configuredWorkflowPath)
      );
    }
    await runGitHubOperation2(
      input,
      () => input.githubClient.dispatchWorkflow({
        owner: repository.repository.owner,
        repo: repository.repository.name,
        workflowPath: workflowDispatchIdentifier,
        ref: input.config.assignment.template.branch
      })
    );
    return recordSuccess(state);
  } catch (error) {
    return recordFailure(state, normalizeGitHubError4(error, student, repository));
  }
};
var getGradeGitHubDiagnostics = (errors) => errors.flatMap((error) => {
  const underlyingDiagnosticCode = error.context?.underlyingDiagnosticCode;
  return typeof underlyingDiagnosticCode === "string" ? [
    {
      code: underlyingDiagnosticCode,
      severity: "error",
      message: error.message,
      ...error.context === void 0 ? {} : { context: error.context }
    }
  ] : [];
});
var executeGrade = async (input) => {
  const grading = getEffectiveGrading5(input.config);
  const workflowPath = grading.workflow;
  let state = {
    summary: createInitialSummary(input.targetStudents.length),
    warnings: [],
    errors: []
  };
  if (!grading.enabled) {
    return {
      summary: {
        ...state.summary,
        skipped: input.targetStudents.length,
        warnings: SUCCESS_INCREMENT
      },
      warnings: [createGradingNotConfiguredWarning3()],
      errors: []
    };
  }
  if (workflowPath === void 0) {
    return {
      summary: {
        ...state.summary,
        skipped: input.targetStudents.length,
        errors: SUCCESS_INCREMENT
      },
      warnings: [],
      errors: [
        createConfigDiagnostic(
          DiagnosticCode.GradingNotConfigured,
          "Grading workflow is not configured for this assignment."
        )
      ]
    };
  }
  for (const student of input.targetStudents) {
    state = {
      ...state,
      summary: {
        ...state.summary,
        dispatchAttempted: state.summary.dispatchAttempted + SUCCESS_INCREMENT
      }
    };
    state = await dispatchForStudent(input, state, student, workflowPath);
  }
  return state;
};

// src/github/fake-github-client.ts
var NO_FAKE_GITHUB_FAILURES = 0;
var DEFAULT_AUTHENTICATED_USER = {
  username: "graider-fake-user"
};
var DEFAULT_BRANCH = "main";
var DEFAULT_ACTIONS_STATE = "disabled";
var DEFAULT_PERMISSION_STATE = {
  permission: "none",
  pendingInvite: false
};
var GENERATED_COMMIT_SHA_PREFIX = "fake-commit-";
var normalizeKeyPart = (value) => value.toLowerCase();
var repositoryKey = (owner, repo) => `${normalizeKeyPart(owner)}/${normalizeKeyPart(repo)}`;
var userKey = (username) => normalizeKeyPart(username);
var teamKey = (org, teamSlug) => `${normalizeKeyPart(org)}/${normalizeKeyPart(teamSlug)}`;
var workflowKey = (owner, repo, workflowPath) => `${repositoryKey(owner, repo)}:${workflowPath}`;
var collaboratorKey = (owner, repo, username) => `${repositoryKey(owner, repo)}:${userKey(username)}`;
var teamPermissionKey = (owner, repo, teamSlug) => `${repositoryKey(owner, repo)}:${normalizeKeyPart(teamSlug)}`;
var actionsStateKey = (owner, repo) => repositoryKey(owner, repo);
var createGitHubClientError = (failure) => new GitHubClientError(failure.kind, `Fake GitHub ${failure.kind} failure.`, {
  ...failure.retryAfterSeconds === void 0 ? {} : { retryAfterSeconds: failure.retryAfterSeconds }
});
var FakeGitHubClient = class {
  mutations = {
    createdRepositories: [],
    addedCollaborators: [],
    removedCollaborators: [],
    teamPermissions: [],
    enabledActions: [],
    workflowDispatches: [],
    archivedRepositories: [],
    fileWrites: []
  };
  fileReads = [];
  artifactDownloads = [];
  workflowRunReadRequests = [];
  authenticatedUser;
  users;
  teams;
  repositories;
  templateRepositories;
  collaboratorPermissions;
  teamPermissions;
  actionsStates;
  workflows;
  workflowRuns;
  artifacts;
  repositoryFiles;
  failures;
  nextRepositoryId;
  nextCommitNumber;
  constructor(state = {}) {
    this.authenticatedUser = state.authenticatedUser ?? DEFAULT_AUTHENTICATED_USER;
    this.users = [...state.users ?? []];
    this.teams = [...state.teams ?? []];
    this.repositories = [...state.repositories ?? []];
    this.templateRepositories = [...state.templateRepositories ?? []];
    this.collaboratorPermissions = [...state.collaboratorPermissions ?? []];
    this.teamPermissions = [...state.teamPermissions ?? []];
    this.actionsStates = [...state.actionsStates ?? []];
    this.workflows = [...state.workflows ?? []];
    this.workflowRuns = [...state.workflowRuns ?? []];
    this.artifacts = [...state.artifacts ?? []];
    this.repositoryFiles = [...state.repositoryFiles ?? []];
    this.failures = [...state.failures ?? []];
    this.nextRepositoryId = 1e3 /* FirstGeneratedRepositoryId */;
    this.nextCommitNumber = 1 /* FirstGeneratedCommitNumber */;
  }
  failNext(method, kind, options = {}) {
    this.failures.push({
      method,
      kind,
      ...options
    });
  }
  failTimes(method, kind, count, options = {}) {
    for (let remaining = count; remaining > NO_FAKE_GITHUB_FAILURES; remaining -= 1) {
      this.failNext(method, kind, options);
    }
  }
  failAll(kind, options = {}) {
    this.failures.push({
      kind,
      persistent: true,
      ...options
    });
  }
  clearFailures() {
    this.failures.splice(0);
  }
  getAuthenticatedUser() {
    return this.run("getAuthenticatedUser", () => this.authenticatedUser);
  }
  getRepository(owner, repo) {
    return this.run(
      "getRepository",
      () => this.repositories.find(
        (repository) => repositoryKey(repository.owner, repository.name) === repositoryKey(owner, repo)
      ) ?? null
    );
  }
  getTemplateRepository(owner, repo) {
    return this.run(
      "getTemplateRepository",
      () => this.templateRepositories.find(
        (repository) => repositoryKey(repository.owner, repository.name) === repositoryKey(owner, repo)
      ) ?? null
    );
  }
  createRepositoryFromTemplate(input) {
    return this.run("createRepositoryFromTemplate", () => {
      const templateRepository = this.templateRepositories.find(
        (repository2) => repositoryKey(repository2.owner, repository2.name) === repositoryKey(input.templateOwner, input.templateRepo)
      );
      const defaultBranch = templateRepository?.defaultBranch ?? DEFAULT_BRANCH;
      const repository = {
        owner: input.owner,
        name: input.name,
        fullName: `${input.owner}/${input.name}`,
        id: this.consumeRepositoryId(),
        private: input.private,
        archived: false,
        defaultBranch,
        htmlUrl: `https://github.com/${input.owner}/${input.name}`
      };
      this.repositories.push(repository);
      this.mutations.createdRepositories.push({
        input,
        repository
      });
      return repository;
    });
  }
  getUser(username) {
    return this.run(
      "getUser",
      () => this.users.find((user) => userKey(user.username) === userKey(username)) ?? null
    );
  }
  getTeam(org, teamSlug) {
    return this.run(
      "getTeam",
      () => this.teams.find((team) => teamKey(team.org, team.slug) === teamKey(org, teamSlug)) ?? null
    );
  }
  getCollaboratorPermission(owner, repo, username) {
    return this.run("getCollaboratorPermission", () => {
      const permissionRecord = this.collaboratorPermissions.find(
        (record) => collaboratorKey(record.owner, record.repo, record.username) === collaboratorKey(owner, repo, username)
      );
      if (permissionRecord === void 0) {
        return DEFAULT_PERMISSION_STATE;
      }
      return {
        permission: permissionRecord.permission,
        pendingInvite: permissionRecord.pendingInvite ?? false
      };
    });
  }
  listCollaboratorPermissions(owner, repo) {
    return this.run(
      "listCollaboratorPermissions",
      () => this.collaboratorPermissions.filter((record) => repositoryKey(record.owner, record.repo) === repositoryKey(owner, repo)).map((record) => ({
        username: record.username,
        permission: record.permission,
        pendingInvite: record.pendingInvite ?? false
      }))
    );
  }
  addCollaborator(input) {
    return this.run("addCollaborator", () => {
      const existingIndex = this.collaboratorPermissions.findIndex(
        (record2) => collaboratorKey(record2.owner, record2.repo, record2.username) === collaboratorKey(input.owner, input.repo, input.username)
      );
      const record = {
        ...input,
        pendingInvite: false
      };
      if (existingIndex < 0) {
        this.collaboratorPermissions.push(record);
      } else {
        this.collaboratorPermissions[existingIndex] = record;
      }
      this.mutations.addedCollaborators.push(input);
      return {
        username: input.username,
        permission: input.permission,
        pendingInvite: false
      };
    });
  }
  removeCollaborator(input) {
    return this.run("removeCollaborator", () => {
      const existingIndex = this.collaboratorPermissions.findIndex(
        (record) => collaboratorKey(record.owner, record.repo, record.username) === collaboratorKey(input.owner, input.repo, input.username)
      );
      if (existingIndex >= 0) {
        this.collaboratorPermissions.splice(existingIndex, 1 /* SingleRecord */);
      }
      this.mutations.removedCollaborators.push(input);
    });
  }
  getTeamPermission(owner, repo, teamSlug) {
    return this.run("getTeamPermission", () => {
      const permissionRecord = this.teamPermissions.find(
        (record) => teamPermissionKey(record.owner, record.repo, record.teamSlug) === teamPermissionKey(owner, repo, teamSlug)
      );
      if (permissionRecord === void 0) {
        return DEFAULT_PERMISSION_STATE;
      }
      return {
        permission: permissionRecord.permission,
        pendingInvite: false
      };
    });
  }
  addTeamPermission(input) {
    return this.run("addTeamPermission", () => {
      const existingIndex = this.teamPermissions.findIndex(
        (record) => teamPermissionKey(record.owner, record.repo, record.teamSlug) === teamPermissionKey(input.owner, input.repo, input.teamSlug)
      );
      if (existingIndex < 0) {
        this.teamPermissions.push(input);
      } else {
        this.teamPermissions[existingIndex] = input;
      }
      this.mutations.teamPermissions.push(input);
    });
  }
  getActionsState(owner, repo) {
    return this.run(
      "getActionsState",
      () => this.actionsStates.find(
        (record) => actionsStateKey(record.owner, record.repo) === actionsStateKey(owner, repo)
      )?.state ?? DEFAULT_ACTIONS_STATE
    );
  }
  enableActions(owner, repo) {
    return this.run("enableActions", () => {
      const existingIndex = this.actionsStates.findIndex(
        (record2) => actionsStateKey(record2.owner, record2.repo) === actionsStateKey(owner, repo)
      );
      const record = {
        owner,
        repo,
        state: "enabled"
      };
      if (existingIndex < 0) {
        this.actionsStates.push(record);
      } else {
        this.actionsStates[existingIndex] = record;
      }
      this.mutations.enabledActions.push({ owner, repo });
    });
  }
  getRepositoryFileContent(owner, repo, filePath, ref) {
    return this.run("getRepositoryFileContent", () => {
      this.fileReads.push({
        owner,
        repo,
        path: filePath,
        ref
      });
      return this.repositoryFiles.find(
        (file) => repositoryKey(file.owner, file.repo) === repositoryKey(owner, repo) && file.path === filePath && (file.branch === ref || file.branch === void 0)
      )?.content ?? null;
    });
  }
  getWorkflow(owner, repo, workflowPath) {
    return this.run(
      "getWorkflow",
      () => this.workflows.find(
        (record) => workflowKey(record.owner, record.repo, record.workflow.path) === workflowKey(owner, repo, workflowPath)
      )?.workflow ?? null
    );
  }
  dispatchWorkflow(input) {
    return this.run("dispatchWorkflow", () => {
      this.mutations.workflowDispatches.push(input);
    });
  }
  listWorkflowRuns(input) {
    return this.run("listWorkflowRuns", () => {
      this.workflowRunReadRequests.push(input);
      return this.workflowRuns.filter(
        (record) => repositoryKey(record.owner, record.repo) === repositoryKey(input.owner, input.repo)
      ).filter(
        (record) => input.workflowPath === void 0 || record.run.workflowPath === input.workflowPath
      ).map((record) => record.run);
    });
  }
  downloadArtifact(input) {
    return this.run("downloadArtifact", () => {
      this.artifactDownloads.push(input);
      return this.artifacts.find(
        (record) => repositoryKey(record.owner, record.repo) === repositoryKey(input.owner, input.repo) && record.runId === input.runId && record.artifact.name === input.artifactName
      )?.artifact ?? null;
    });
  }
  archiveRepository(owner, repo) {
    return this.run("archiveRepository", () => {
      const existingIndex = this.repositories.findIndex(
        (repository) => repositoryKey(repository.owner, repository.name) === repositoryKey(owner, repo)
      );
      if (existingIndex >= 0) {
        const existingRepository = this.repositories[existingIndex];
        if (existingRepository !== void 0) {
          this.repositories[existingIndex] = {
            ...existingRepository,
            archived: true
          };
        }
      }
      this.mutations.archivedRepositories.push({ owner, repo });
    });
  }
  writeRepositoryFile(input) {
    return this.run("writeRepositoryFile", () => {
      const commitSha = this.consumeCommitSha();
      const record = {
        owner: input.owner,
        repo: input.repo,
        path: input.path,
        content: input.content,
        message: input.message,
        commitSha,
        ...input.branch === void 0 ? {} : { branch: input.branch }
      };
      const existingIndex = this.repositoryFiles.findIndex(
        (file) => repositoryKey(file.owner, file.repo) === repositoryKey(input.owner, input.repo) && file.path === input.path && file.branch === input.branch
      );
      if (existingIndex < 0) {
        this.repositoryFiles.push(record);
      } else {
        this.repositoryFiles[existingIndex] = record;
      }
      this.mutations.fileWrites.push(record);
      return {
        path: input.path,
        commitSha
      };
    });
  }
  run(method, action2) {
    const failure = this.consumeFailure(method);
    if (failure !== void 0) {
      return Promise.reject(createGitHubClientError(failure));
    }
    return Promise.resolve(action2());
  }
  consumeFailure(method) {
    const failureIndex = this.failures.findIndex(
      (failure2) => failure2.method === void 0 || failure2.method === method
    );
    if (failureIndex < 0) {
      return void 0;
    }
    const failure = this.failures[failureIndex];
    if (failure?.persistent !== true) {
      this.failures.splice(failureIndex, 1 /* SingleRecord */);
    }
    return failure;
  }
  consumeRepositoryId() {
    const repositoryId = this.nextRepositoryId;
    this.nextRepositoryId += 1 /* SingleRecord */;
    return repositoryId;
  }
  consumeCommitSha() {
    const commitSha = `${GENERATED_COMMIT_SHA_PREFIX}${String(this.nextCommitNumber)}`;
    this.nextCommitNumber += 1 /* SingleRecord */;
    return commitSha;
  }
};

// src/cli/commands/grade.command.ts
var COMMAND_NAME6 = "grade";
var EMPTY_COUNT13 = 0;
var NOT_CONFIGURED_WARNING_COUNT = 1;
var createDefaultGitHubClient = () => readGitHubToken() === void 0 ? new FakeGitHubClient() : createGitHubClient();
var getEffectiveGrading6 = (config) => config.assignment.grading === void 0 ? config.course.grading : config.assignment.grading;
var getCommandStatus = (result) => {
  if (result.errors.length === EMPTY_COUNT13) {
    return "success";
  }
  return result.summary.dispatchSucceeded > EMPTY_COUNT13 ? "partial_success" : "failure";
};
var createLifecycleDiagnostic3 = (status) => createConfigDiagnostic(
  DiagnosticCode.AssignmentStatusBlocksGrade,
  `Assignment status ${status} does not allow grade.`,
  { assignmentStatus: status }
);
var createGradingNotConfiguredWarning4 = () => createWarningDiagnostic(
  DiagnosticCode.GradingNotConfigured,
  "Automated grading is not configured for this assignment."
);
var runGradeCommand = async ({
  cwd,
  assignmentFile,
  options,
  targetSelector,
  commandName = COMMAND_NAME6,
  githubClient,
  retryOptions
}) => {
  const selectorResult = validateTargetSelector(targetSelector);
  if (selectorResult.errors.length > EMPTY_COUNT13 || selectorResult.selector === void 0) {
    return createCommandResult({
      commandName,
      assignmentFile,
      status: "failure",
      warnings: selectorResult.warnings,
      errors: selectorResult.errors,
      generatedFiles: [],
      summary: { options }
    });
  }
  const configResult = loadGraiderConfig({ cwd, assignmentFile });
  if (configResult.status === "failure") {
    return createCommandResult({
      commandName,
      assignmentFile,
      status: "failure",
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: { options }
    });
  }
  const assignmentStatus = configResult.config.assignment.assignment.status;
  if (assignmentStatus === "draft" || assignmentStatus === "archived") {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [],
      errors: [createLifecycleDiagnostic3(assignmentStatus)],
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary
      }
    });
  }
  const rosterResult = loadAssignmentRosters(configResult.config);
  if (rosterResult.errors.length > EMPTY_COUNT13) {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: rosterResult.warnings,
      errors: rosterResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary
      }
    });
  }
  const selectionResult = selectTargetStudents(rosterResult.students, selectorResult.selector);
  if (selectionResult.errors.length > EMPTY_COUNT13) {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [...rosterResult.warnings, ...selectionResult.warnings],
      errors: selectionResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        ...selectionResult.summary
      }
    });
  }
  const grading = getEffectiveGrading6(configResult.config);
  if (!grading.enabled || grading.workflow === void 0) {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "success",
      warnings: [
        ...rosterResult.warnings,
        ...selectionResult.warnings,
        createGradingNotConfiguredWarning4()
      ],
      errors: [],
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        ...selectionResult.summary,
        gradingEnabled: false,
        workflowDispatchAttempted: false,
        resultStatus: "not_configured",
        targetsSelected: selectionResult.students.length,
        dispatchAttempted: EMPTY_COUNT13,
        dispatchSucceeded: EMPTY_COUNT13,
        dispatchFailed: EMPTY_COUNT13,
        skipped: selectionResult.students.length,
        warnings: rosterResult.warnings.length + selectionResult.warnings.length + NOT_CONFIGURED_WARNING_COUNT,
        errors: EMPTY_COUNT13
      }
    });
  }
  const manifestPath = createManifestPath(
    configResult.config.summary.repoRoot,
    configResult.config.summary.termCode,
    configResult.config.summary.assignmentSlug
  );
  const manifestResult = loadManifest(manifestPath.absolutePath, { required: true });
  if (manifestResult.status !== "loaded") {
    return createCommandResult({
      commandName,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: manifestResult.warnings,
      errors: manifestResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        ...selectionResult.summary,
        manifestFile: manifestPath.relativePath
      }
    });
  }
  const executionResult = await executeGrade({
    config: configResult.config,
    manifest: manifestResult.manifest,
    targetStudents: selectionResult.students,
    githubClient: githubClient ?? createDefaultGitHubClient(),
    ...retryOptions === void 0 ? {} : { retryOptions }
  });
  const status = getCommandStatus(executionResult);
  const executionErrors = status === "failure" ? [...executionResult.errors, ...getGradeGitHubDiagnostics(executionResult.errors)] : executionResult.errors;
  return createCommandResult({
    commandName,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status,
    warnings: [...rosterResult.warnings, ...selectionResult.warnings, ...executionResult.warnings],
    errors: executionErrors,
    generatedFiles: [],
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
      ...selectionResult.summary,
      manifestFile: manifestPath.relativePath,
      ...executionResult.summary
    }
  });
};
var registerGradeCommand = (program) => {
  program.command(COMMAND_NAME6).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").option("--all", "Target all active students").option("--section <section-id>", "Target active students in a section").option("--student-id <student-id>", "Target one active student by student ID").option("--github-username <github-username>", "Target one active student by GitHub username").description("Run assignment grading.").action(async (assignmentFile, rawOptions) => {
    const options = normalizeCommonCommandOptions(rawOptions);
    const result = await runGradeCommand({
      cwd: process.cwd(),
      assignmentFile,
      options,
      targetSelector: {
        ...rawOptions.all === void 0 ? {} : { all: rawOptions.all },
        ...rawOptions.section === void 0 ? {} : { section: rawOptions.section },
        ...rawOptions.studentId === void 0 ? {} : { studentId: rawOptions.studentId },
        ...rawOptions.githubUsername === void 0 ? {} : { githubUsername: rawOptions.githubUsername }
      }
    });
    writeCommandResult(result, options.json);
    process.exitCode = result.exitCode;
  });
};

// src/manifest/repository-targets.ts
var toTarget = (record) => ({
  targetId: record.studentId,
  mode: "individual",
  repositoryName: record.repository.name,
  repositoryUrl: record.repository.htmlUrl ?? null,
  sectionIds: [record.section],
  studentIds: [record.studentId],
  githubUsernames: [record.githubUsername],
  diagnostics: [...record.warnings, ...record.errors]
});
var toMapping = (record) => ({
  studentId: record.studentId,
  githubUsername: record.githubUsername,
  targetId: record.studentId,
  repositoryName: record.repository.name,
  repositoryUrl: record.repository.htmlUrl ?? null
});
var normalizeManifestRepositories = (manifest) => ({
  targets: manifest.schemaVersion === 2 ? (manifest.targets ?? []).map((target) => ({
    targetId: target.targetId,
    mode: target.mode,
    repositoryName: target.repositoryName,
    repositoryUrl: target.htmlUrl ?? null,
    ...target.cloneUrl === void 0 ? {} : { cloneUrl: target.cloneUrl },
    ...target.groupId === void 0 ? {} : { groupId: target.groupId },
    sectionIds: target.sectionIds,
    studentIds: target.studentIds,
    githubUsernames: target.githubUsernames,
    diagnostics: target.diagnostics
  })) : manifest.repositories.map(toTarget),
  studentMappings: manifest.schemaVersion === 2 ? (manifest.studentMappings ?? []).map((mapping) => ({
    studentId: mapping.studentId,
    githubUsername: mapping.githubUsername,
    targetId: mapping.targetId,
    repositoryName: mapping.repositoryName,
    repositoryUrl: mapping.htmlUrl ?? null,
    ...mapping.cloneUrl === void 0 ? {} : { cloneUrl: mapping.cloneUrl }
  })) : manifest.repositories.map(toMapping)
});

// src/repository-mappings/repository-mappings-builder.ts
var COMMAND_NAME7 = "assignment repository-mappings";
var createResult = (status, assignment, manifest, diagnostics, targets = [], studentMappings = []) => ({
  schemaVersion: 1,
  commandName: COMMAND_NAME7,
  status,
  exitCode: status === "success" ? 0 : status === "partial_success" ? 2 : 1,
  assignment,
  manifest,
  repositoryMode: "individual",
  targets,
  studentMappings,
  summary: {
    targetCount: targets.length,
    studentMappingCount: studentMappings.length,
    diagnosticCount: diagnostics.length
  },
  diagnostics
});
var buildAssignmentRepositoryMappings = ({
  cwd,
  assignmentFile
}) => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });
  if (configResult.status === "failure") {
    return createResult(
      "failure",
      null,
      { status: "invalid", schemaVersion: null, path: null },
      configResult.diagnostics
    );
  }
  const config = configResult.config;
  const assignment = {
    slug: config.summary.assignmentSlug,
    title: config.assignment.assignment.title,
    path: config.summary.assignmentConfigPath
  };
  const manifestPath = createManifestPath(
    config.summary.repoRoot,
    config.summary.termCode,
    config.summary.assignmentSlug
  );
  const manifestResult = loadManifest(manifestPath.absolutePath);
  if (manifestResult.status === "missing") {
    return createResult(
      "success",
      assignment,
      { status: "not_applied", schemaVersion: null, path: manifestPath.relativePath },
      [
        createConfigDiagnostic(
          "assignment_not_applied",
          "Repositories have not been created for this assignment yet.",
          { manifestPath: manifestPath.relativePath }
        )
      ]
    );
  }
  if (manifestResult.status === "failure") {
    return createResult(
      "failure",
      assignment,
      { status: "invalid", schemaVersion: null, path: manifestPath.relativePath },
      manifestResult.errors
    );
  }
  const normalized = normalizeManifestRepositories(manifestResult.manifest);
  return {
    ...createResult(
      "success",
      assignment,
      {
        status: "present",
        schemaVersion: manifestResult.manifest.schemaVersion,
        path: manifestPath.relativePath
      },
      [...manifestResult.warnings, ...manifestResult.errors],
      normalized.targets,
      normalized.studentMappings
    ),
    repositoryMode: manifestResult.manifest.repositoryMode ?? "individual"
  };
};
var createRepositoryMappingsJsonRequiredResult = () => createResult("failure", null, { status: "invalid", schemaVersion: null, path: null }, [
  createConfigDiagnostic(
    "assignment_repository_mappings_json_required",
    "The assignment repository-mappings command only supports JSON output. Run with --json."
  )
]);

// src/cli/commands/assignment.command.ts
var COMMAND_NAME8 = "assignment";
var DETAIL_COMMAND_NAME = "detail";
var APPLY_PREVIEW_COMMAND_NAME = "apply-preview";
var GRADE_PREVIEW_COMMAND_NAME = "grade-preview";
var GRADE_STATUS_COMMAND_NAME = "grade-status";
var APPLY_COMMAND_NAME = "apply";
var GRADE_COMMAND_NAME = "grade";
var REPOSITORY_MAPPINGS_COMMAND_NAME = "repository-mappings";
var ASSIGNMENT_APPLY_COMMAND_NAME = "assignment apply";
var ASSIGNMENT_GRADE_COMMAND_NAME = "assignment grade";
var JSON_INDENT_SPACES2 = 2;
var createJsonRequiredResult = () => createEmptyAssignmentDetailResult("failure", [
  createConfigDiagnostic(
    ASSIGNMENT_DETAIL_JSON_REQUIRED_CODE,
    "The assignment detail command only supports JSON output. Run with --json."
  )
]);
var createApplyPreviewJsonRequiredResult = () => createEmptyAssignmentApplyPreviewResult("failure", [
  createConfigDiagnostic(
    ASSIGNMENT_APPLY_PREVIEW_JSON_REQUIRED_CODE,
    "The assignment apply-preview command only supports JSON output. Run with --json."
  )
]);
var createGradePreviewJsonRequiredResult = () => createEmptyAssignmentGradePreviewResult("failure", [
  createConfigDiagnostic(
    ASSIGNMENT_GRADE_PREVIEW_JSON_REQUIRED_CODE,
    "The assignment grade-preview command only supports JSON output. Run with --json."
  )
]);
var createGradeStatusJsonRequiredResult = () => createEmptyAssignmentGradeStatusResult("failure", [
  createConfigDiagnostic(
    ASSIGNMENT_GRADE_STATUS_JSON_REQUIRED_CODE,
    "The assignment grade-status command only supports JSON output. Run with --json."
  )
]);
var createStudentFilterConflictResult = () => createEmptyAssignmentGradeStatusResult("failure", [
  createConfigDiagnostic(
    STUDENT_FILTER_CONFLICT_CODE,
    "Use either --student or --students, not both."
  )
]);
var createStudentFilterEmptyResult = () => createEmptyAssignmentGradeStatusResult("failure", [
  createConfigDiagnostic(
    STUDENT_FILTER_EMPTY_CODE,
    "Student filter contains an empty student ID."
  )
]);
var resolveGitHubClient = (githubClient, token) => {
  if (githubClient !== void 0) {
    return githubClient;
  }
  return token === void 0 ? void 0 : createGitHubClient({ token });
};
var dedupeStudentIds = (studentIds) => studentIds.reduce(
  (deduped, studentId) => deduped.some((existingStudentId) => existingStudentId === studentId) ? deduped : [...deduped, studentId],
  []
);
var parseStudentFilter = (options) => {
  if (options.student !== void 0 && options.students !== void 0) {
    return { result: createStudentFilterConflictResult() };
  }
  const rawStudentIds = options.student !== void 0 ? [options.student] : options.students === void 0 ? [] : options.students.split(",");
  const studentIds = rawStudentIds.map((studentId) => studentId.trim());
  if (studentIds.some((studentId) => studentId.length === 0)) {
    return { result: createStudentFilterEmptyResult() };
  }
  return studentIds.length === 0 ? {} : { studentIds: dedupeStudentIds(studentIds) };
};
var runAssignmentDetailCommand = ({
  cwd,
  assignmentFile,
  options,
  env = process.env,
  githubClient
}) => {
  if (options.json !== true) {
    return Promise.resolve(createJsonRequiredResult());
  }
  const token = readGitHubToken(env);
  const resolvedGitHubClient = resolveGitHubClient(githubClient, token);
  return buildAssignmentDetail({
    cwd,
    assignmentFile,
    ...resolvedGitHubClient === void 0 ? {} : { githubClient: resolvedGitHubClient }
  });
};
var runAssignmentApplyPreviewCommand = ({
  cwd,
  assignmentFile,
  options,
  env = process.env,
  githubClient
}) => {
  if (options.json !== true) {
    return Promise.resolve(createApplyPreviewJsonRequiredResult());
  }
  const token = readGitHubToken(env);
  const resolvedGitHubClient = resolveGitHubClient(githubClient, token);
  return buildAssignmentApplyPreview({
    cwd,
    assignmentFile,
    ...resolvedGitHubClient === void 0 ? {} : { githubClient: resolvedGitHubClient }
  });
};
var runAssignmentGradePreviewCommand = ({
  cwd,
  assignmentFile,
  options,
  env = process.env,
  githubClient
}) => {
  if (options.json !== true) {
    return Promise.resolve(createGradePreviewJsonRequiredResult());
  }
  const token = readGitHubToken(env);
  const resolvedGitHubClient = resolveGitHubClient(githubClient, token);
  return buildAssignmentGradePreview({
    cwd,
    assignmentFile,
    ...resolvedGitHubClient === void 0 ? {} : { githubClient: resolvedGitHubClient }
  });
};
var runAssignmentGradeStatusCommand = ({
  cwd,
  assignmentFile,
  options,
  env = process.env,
  githubClient
}) => {
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
    ...resolvedGitHubClient === void 0 ? {} : { githubClient: resolvedGitHubClient },
    ...filterResult.studentIds === void 0 ? {} : { studentIds: filterResult.studentIds }
  });
};
var runAssignmentRepositoryMappingsCommand = ({
  cwd,
  assignmentFile,
  options
}) => Promise.resolve(
  options.json ? buildAssignmentRepositoryMappings({ cwd, assignmentFile }) : createRepositoryMappingsJsonRequiredResult()
);
var runAssignmentApplyCommand = ({
  cwd,
  assignmentFile,
  options,
  githubClient,
  clock,
  retryOptions
}) => runApplyCommand({
  cwd,
  assignmentFile,
  options,
  commandName: ASSIGNMENT_APPLY_COMMAND_NAME,
  ...githubClient === void 0 ? {} : { githubClient },
  ...clock === void 0 ? {} : { clock },
  ...retryOptions === void 0 ? {} : { retryOptions }
});
var runAssignmentGradeCommand = ({
  cwd,
  assignmentFile,
  options,
  targetSelector,
  githubClient,
  retryOptions
}) => runGradeCommand({
  cwd,
  assignmentFile,
  options,
  targetSelector,
  commandName: ASSIGNMENT_GRADE_COMMAND_NAME,
  ...githubClient === void 0 ? {} : { githubClient },
  ...retryOptions === void 0 ? {} : { retryOptions }
});
var formatAssignmentDetailResultAsJson = (result) => JSON.stringify(result, void 0, JSON_INDENT_SPACES2);
var formatAssignmentApplyPreviewResultAsJson = (result) => JSON.stringify(result, void 0, JSON_INDENT_SPACES2);
var formatAssignmentGradePreviewResultAsJson = (result) => JSON.stringify(result, void 0, JSON_INDENT_SPACES2);
var formatAssignmentGradeStatusResultAsJson = (result) => JSON.stringify(result, void 0, JSON_INDENT_SPACES2);
var formatAssignmentRepositoryMappingsResultAsJson = (result) => JSON.stringify(result, void 0, JSON_INDENT_SPACES2);
var registerAssignmentCommand = (program) => {
  const assignment = program.command(COMMAND_NAME8).description("Inspect assignment configuration and local detail data.");
  assignment.command(DETAIL_COMMAND_NAME).argument("<assignment-file>").option("--json", "Required. Emit assignment detail JSON").description("Build a UI-ready read-only assignment detail model.").action(async (assignmentFile, options) => {
    const result = await runAssignmentDetailCommand({
      cwd: process.cwd(),
      assignmentFile,
      options
    });
    console.log(formatAssignmentDetailResultAsJson(result));
    process.exitCode = result.exitCode;
  });
  assignment.command(APPLY_PREVIEW_COMMAND_NAME).argument("<assignment-file>").option("--json", "Required. Emit assignment apply preview JSON").description("Build a UI-ready read-only assignment apply preview model.").action(async (assignmentFile, options) => {
    const result = await runAssignmentApplyPreviewCommand({
      cwd: process.cwd(),
      assignmentFile,
      options
    });
    console.log(formatAssignmentApplyPreviewResultAsJson(result));
    process.exitCode = result.exitCode;
  });
  assignment.command(GRADE_PREVIEW_COMMAND_NAME).argument("<assignment-file>").option("--json", "Required. Emit assignment grade preview JSON").description("Build a UI-ready read-only assignment grade preview model.").action(async (assignmentFile, options) => {
    const result = await runAssignmentGradePreviewCommand({
      cwd: process.cwd(),
      assignmentFile,
      options
    });
    console.log(formatAssignmentGradePreviewResultAsJson(result));
    process.exitCode = result.exitCode;
  });
  assignment.command(GRADE_STATUS_COMMAND_NAME).argument("<assignment-file>").option("--json", "Required. Emit assignment grade status JSON").option("--student <student-id>", "Check grade status for one active target student").option(
    "--students <student-ids>",
    "Check grade status for comma-separated active target students"
  ).description("Build a UI-ready read-only assignment grade status model.").action(async (assignmentFile, options) => {
    const result = await runAssignmentGradeStatusCommand({
      cwd: process.cwd(),
      assignmentFile,
      options
    });
    console.log(formatAssignmentGradeStatusResultAsJson(result));
    process.exitCode = result.exitCode;
  });
  assignment.command(REPOSITORY_MAPPINGS_COMMAND_NAME).argument("<assignment-file>").option("--json", "Required. Emit normalized repository mapping JSON").description("Read normalized assignment repository targets and student mappings.").action(async (assignmentFile, options) => {
    const result = await runAssignmentRepositoryMappingsCommand({
      cwd: process.cwd(),
      assignmentFile,
      options
    });
    console.log(formatAssignmentRepositoryMappingsResultAsJson(result));
    process.exitCode = result.exitCode;
  });
  assignment.command(APPLY_COMMAND_NAME).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").description("Apply assignment repository changes.").action(async (assignmentFile, rawOptions) => {
    const options = normalizeCommonCommandOptions(rawOptions);
    const result = await runAssignmentApplyCommand({
      cwd: process.cwd(),
      assignmentFile,
      options
    });
    writeCommandResult(result, options.json);
    process.exitCode = result.exitCode;
  });
  assignment.command(GRADE_COMMAND_NAME).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").option("--all", "Target all active students").option("--section <section-id>", "Target active students in a section").option("--student-id <student-id>", "Target one active student by student ID").option("--github-username <github-username>", "Target one active student by GitHub username").description("Dispatch assignment grading workflows.").action(async (assignmentFile, rawOptions) => {
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

// src/cli/commands/archive.command.ts
var COMMAND_NAME9 = "archive";
var normalizeArchiveTargetSelector = (rawOptions) => ({
  ...rawOptions.all === void 0 ? {} : { all: rawOptions.all },
  ...rawOptions.section === void 0 ? {} : { section: rawOptions.section },
  ...rawOptions.studentId === void 0 ? {} : { studentId: rawOptions.studentId },
  ...rawOptions.githubUsername === void 0 ? {} : { githubUsername: rawOptions.githubUsername },
  ...rawOptions.removeStudentAccess === void 0 ? {} : { removeStudentAccess: rawOptions.removeStudentAccess }
});
var runArchiveCommand = ({
  cwd,
  assignmentFile,
  options,
  targetSelector
}) => createCommandResult({
  commandName: COMMAND_NAME9,
  assignmentFile,
  status: "failure",
  warnings: [],
  errors: [createNotSupportedInMvpDiagnostic(COMMAND_NAME9, assignmentFile)],
  generatedFiles: [],
  summary: {
    unsupported: true,
    mvpSupported: false,
    cwd,
    options,
    targetSelector
  }
});
var registerArchiveCommand = (program) => {
  program.command(COMMAND_NAME9).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").option("--all", "Reserved for future archive targeting").option("--section <section-id>", "Reserved for future archive targeting").option("--student-id <student-id>", "Reserved for future archive targeting").option("--github-username <github-username>", "Reserved for future archive targeting").option("--remove-student-access", "Reserved for future archive access removal").description("Archive assignment repositories.").action((assignmentFile, rawOptions) => {
    const options = normalizeCommonCommandOptions(rawOptions);
    const result = runArchiveCommand({
      cwd: process.cwd(),
      assignmentFile,
      options,
      targetSelector: normalizeArchiveTargetSelector(rawOptions)
    });
    writeCommandResult(result, options.json);
    process.exitCode = result.exitCode;
  });
};

// src/dashboard/dashboard-builder.ts
import fs8 from "fs";
import path10 from "path";

// src/dashboard/dashboard-models.ts
var DASHBOARD_SCHEMA_VERSION = 1;

// src/dashboard/dashboard-builder.ts
var COMMAND_NAME10 = "dashboard";
var COURSE_CONFIG_PATH2 = "course.yml";
var TERMS_DIRECTORY4 = "terms";
var TERM_CONFIG_FILE_NAME2 = "term.yml";
var ASSIGNMENTS_DIRECTORY = "assignments";
var ASSIGNMENT_CONFIG_FILE_NAME = "assignment.yml";
var COURSE_PATH = ".";
var EMPTY_COUNT14 = 0;
var DEFAULT_RECENT_ASSIGNMENT_LIMIT = 5;
var FIRST_SORT_BEFORE_SECOND = -1;
var FIRST_SORT_AFTER_SECOND = 1;
var SORT_EQUAL = 0;
var DATE_PARSE_FAILED = Number.NaN;
var MISSING_COLUMN_INDEX2 = -1;
var STATUS_ACTIVE = "active";
var STATUS_COMPLETED = "completed";
var STATUS_INACTIVE = "inactive";
var STATUS_UNKNOWN = "unknown";
var LEGACY_GRADING_MODE6 = "custom-workflow";
var APPLY_STATE_APPLIED2 = "applied";
var APPLY_STATE_NOT_APPLIED2 = "not_applied";
var APPLY_STATE_UNKNOWN = "unknown";
var GITHUB_STATUS_AVAILABLE = "available";
var GITHUB_STATUS_MISSING = "missing";
var GITHUB_STATUS_NOT_REQUIRED = "not_required";
var GITHUB_STATUS_NOT_CHECKED = "not_checked";
var GITHUB_STATUS_ERROR = "error";
var RECENT_ASSIGNMENT_STATUS_WEIGHT = {
  [STATUS_ACTIVE]: 0,
  [STATUS_COMPLETED]: 1,
  [STATUS_UNKNOWN]: 2
};
var emptySummary = () => ({
  cardCount: EMPTY_COUNT14,
  courseCount: EMPTY_COUNT14,
  termCount: EMPTY_COUNT14,
  assignmentCount: EMPTY_COUNT14,
  needsAttentionCount: EMPTY_COUNT14
});
var createDashboardResult = (status, diagnostics, cards) => {
  const summary = createSummary4(cards);
  return {
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    commandName: COMMAND_NAME10,
    status,
    exitCode: status === "success" ? 0 : status === "partial_success" ? 2 : 1,
    diagnostics,
    summary,
    cards
  };
};
var createEmptyDashboardResult = (status, diagnostics) => ({
  schemaVersion: DASHBOARD_SCHEMA_VERSION,
  commandName: COMMAND_NAME10,
  status,
  exitCode: status === "success" ? 0 : status === "partial_success" ? 2 : 1,
  diagnostics,
  summary: emptySummary(),
  cards: []
});
var createSummary4 = (cards) => ({
  cardCount: cards.length,
  courseCount: cards.length > EMPTY_COUNT14 ? 1 : EMPTY_COUNT14,
  termCount: cards.length,
  assignmentCount: cards.reduce((count, card) => count + card.assignmentCount, EMPTY_COUNT14),
  needsAttentionCount: cards.filter((card) => card.needsAttention).length
});
var diagnosticRequiresAttention = (diagnostic2) => diagnostic2.severity === "error";
var getAttentionCount = (diagnostics) => diagnostics.filter(diagnosticRequiresAttention).length;
var listDirectoryNames = (directoryPath) => {
  try {
    return fs8.readdirSync(directoryPath, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
};
var isFile3 = (filePath) => {
  try {
    return fs8.statSync(filePath).isFile();
  } catch {
    return false;
  }
};
var loadCourse = (cwd) => {
  const rootResult = findRepositoryRoot(cwd);
  if (!rootResult.found) {
    return {
      diagnostics: [rootResult.diagnostic]
    };
  }
  const loadResult = loadCourseConfig(path10.join(rootResult.repoRoot, COURSE_CONFIG_PATH2));
  if (loadResult.status === "failure") {
    return {
      diagnostics: loadResult.diagnostics
    };
  }
  return {
    repoRoot: rootResult.repoRoot,
    config: loadResult.value,
    diagnostics: validateCourseConfig(COURSE_CONFIG_PATH2, loadResult.value)
  };
};
var createTermNotFoundDiagnostic = (termSlug) => createConfigDiagnostic(
  DASHBOARD_TERM_NOT_FOUND_CODE,
  `The requested term ${termSlug} was not found.`,
  { termSlug }
);
var createGitHubCheckCache = () => ({
  templateRepositories: /* @__PURE__ */ new Map(),
  workflowFiles: /* @__PURE__ */ new Map()
});
var createRepositoryCacheKey = (owner, repo) => `${owner.toLowerCase()}/${repo.toLowerCase()}`;
var createWorkflowCacheKey = (owner, repo, branch, workflowPath) => `${createRepositoryCacheKey(owner, repo)}:${branch}:${workflowPath}`;
var getCachedTemplateRepository = (cache, githubClient, owner, repo) => {
  const key = createRepositoryCacheKey(owner, repo);
  const cached = cache.templateRepositories.get(key);
  if (cached !== void 0) {
    return cached;
  }
  const request = githubClient.getTemplateRepository(owner, repo);
  cache.templateRepositories.set(key, request);
  return request;
};
var getCachedWorkflowFileContent = (cache, githubClient, owner, repo, branch, workflowPath) => {
  const key = createWorkflowCacheKey(owner, repo, branch, workflowPath);
  const cached = cache.workflowFiles.get(key);
  if (cached !== void 0) {
    return cached;
  }
  const request = githubClient.getRepositoryFileContent(owner, repo, workflowPath, branch);
  cache.workflowFiles.set(key, request);
  return request;
};
var createAssignmentDiagnosticContext = (assignment) => ({
  assignmentSlug: assignment.slug,
  assignmentFile: assignment.assignmentFile,
  ...assignment.templateRepository === void 0 ? {} : { templateRepository: assignment.templateRepository },
  ...assignment.templateBranch === void 0 ? {} : { templateBranch: assignment.templateBranch },
  ...assignment.workflow === void 0 ? {} : { workflow: assignment.workflow }
});
var addDiagnosticContext = (diagnostic2, context) => ({
  ...diagnostic2,
  context: {
    ...diagnostic2.context ?? {},
    ...context
  }
});
var mapDashboardGithubErrorCode = (error) => {
  if (error.kind === "auth_missing" || error.kind === "auth_failed") {
    return DASHBOARD_GITHUB_AUTH_FAILED_CODE;
  }
  if (error.kind === "permission_denied") {
    return DASHBOARD_GITHUB_PERMISSION_DENIED_CODE;
  }
  if (error.kind === "rate_limited") {
    return DASHBOARD_GITHUB_RATE_LIMITED_CODE;
  }
  return DASHBOARD_GITHUB_REQUEST_FAILED_CODE;
};
var createDashboardGithubRequestDiagnostic = (error, message, context) => {
  if (error instanceof GitHubClientError) {
    return createConfigDiagnostic(
      mapDashboardGithubErrorCode(error),
      `${message}: ${error.message}`,
      {
        ...context,
        kind: error.kind,
        retryable: error.retryable,
        ...error.retryAfterSeconds === void 0 ? {} : { retryAfterSeconds: error.retryAfterSeconds }
      }
    );
  }
  return createConfigDiagnostic(DASHBOARD_GITHUB_REQUEST_FAILED_CODE, message, context);
};
var createTemplateRepositoryMissingDiagnostic2 = (assignment) => createConfigDiagnostic(
  DASHBOARD_TEMPLATE_REPOSITORY_MISSING_CODE,
  `Template repository ${assignment.templateRepository ?? ""} was not found.`,
  createAssignmentDiagnosticContext(assignment)
);
var createTemplateBranchMissingDiagnostic3 = (assignment) => createConfigDiagnostic(
  DASHBOARD_TEMPLATE_BRANCH_MISSING_CODE,
  `Template branch ${assignment.templateBranch ?? ""} was not found.`,
  createAssignmentDiagnosticContext(assignment)
);
var createGradingWorkflowMissingDiagnostic2 = (assignment, workflowPath) => createConfigDiagnostic(
  DASHBOARD_GRADING_WORKFLOW_MISSING_CODE,
  `Configured grading workflow ${workflowPath} was not found in the template repository.`,
  {
    ...createAssignmentDiagnosticContext(assignment),
    checkedPath: workflowPath
  }
);
var createWorkflowDispatchMissingDiagnostic4 = (assignment, workflowPath) => createConfigDiagnostic(
  DASHBOARD_WORKFLOW_DISPATCH_MISSING_CODE,
  `Configured grading workflow ${workflowPath} does not define workflow_dispatch.`,
  {
    ...createAssignmentDiagnosticContext(assignment),
    checkedPath: workflowPath
  }
);
var createDefaultGithubStatus = (gradingEnabled) => ({
  templateRepository: GITHUB_STATUS_NOT_CHECKED,
  templateBranch: GITHUB_STATUS_NOT_CHECKED,
  gradingWorkflow: gradingEnabled ? GITHUB_STATUS_NOT_CHECKED : GITHUB_STATUS_NOT_REQUIRED,
  workflowDispatch: gradingEnabled ? GITHUB_STATUS_NOT_CHECKED : GITHUB_STATUS_NOT_REQUIRED
});
var hasTemplateBranch = (templateRepository, branch) => templateRepository.branches.some((availableBranch) => availableBranch === branch);
var discoverTermSlugs = (repoRoot, requestedTerm) => {
  const termSlugs = listDirectoryNames(path10.join(repoRoot, TERMS_DIRECTORY4));
  return requestedTerm === void 0 ? termSlugs : termSlugs.filter((termSlug) => termSlug === requestedTerm);
};
var loadTerm = (repoRoot, termSlug) => {
  const termConfigPath = [TERMS_DIRECTORY4, termSlug, TERM_CONFIG_FILE_NAME2].join("/");
  const loadResult = loadTermConfig(path10.join(repoRoot, termConfigPath));
  if (loadResult.status === "failure") {
    return {
      termSlug,
      termConfigPath,
      diagnostics: loadResult.diagnostics
    };
  }
  return {
    termSlug,
    termConfigPath,
    config: loadResult.value,
    diagnostics: validateTermConfig(termConfigPath, loadResult.value, termSlug)
  };
};
var mapAssignmentStatus = (status) => {
  if (status === "active") {
    return STATUS_ACTIVE;
  }
  if (status === "closed") {
    return STATUS_COMPLETED;
  }
  return STATUS_INACTIVE;
};
var shouldIncludeAssignment = (assignment) => assignment.status === STATUS_ACTIVE || assignment.status === STATUS_COMPLETED || assignment.status === STATUS_UNKNOWN;
var parseTime = (value) => value === void 0 ? DATE_PARSE_FAILED : Date.parse(value);
var compareMaybeDescendingTime = (left, right) => {
  const leftTime = parseTime(left);
  const rightTime = parseTime(right);
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);
  if (leftValid && rightValid && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  if (leftValid !== rightValid) {
    return leftValid ? FIRST_SORT_BEFORE_SECOND : FIRST_SORT_AFTER_SECOND;
  }
  return SORT_EQUAL;
};
var getStatusWeight = (status) => RECENT_ASSIGNMENT_STATUS_WEIGHT[status] ?? RECENT_ASSIGNMENT_STATUS_WEIGHT[STATUS_UNKNOWN] ?? SORT_EQUAL;
var compareRecentAssignments = (left, right) => {
  const statusComparison = getStatusWeight(left.status) - getStatusWeight(right.status);
  if (statusComparison !== SORT_EQUAL) {
    return statusComparison;
  }
  const timeComparison = compareMaybeDescendingTime(left.dueAt, right.dueAt);
  if (timeComparison !== SORT_EQUAL) {
    return timeComparison;
  }
  const titleComparison = left.title.localeCompare(right.title);
  return titleComparison === SORT_EQUAL ? left.slug.localeCompare(right.slug) : titleComparison;
};
var getEffectiveGrading7 = (courseConfig, assignmentConfig) => assignmentConfig.grading ?? courseConfig.grading;
var getAssignmentApplyState = (repoRoot, termSlug, assignmentSlug) => {
  const manifestPath = createManifestPath(repoRoot, termSlug, assignmentSlug);
  return isFile3(manifestPath.absolutePath) ? APPLY_STATE_APPLIED2 : APPLY_STATE_NOT_APPLIED2;
};
var createAssignmentSummary = (repoRoot, courseConfig, assignmentConfig, assignmentFile, expectedSlug, diagnostics) => {
  const grading = getEffectiveGrading7(courseConfig, assignmentConfig);
  const assignmentStatus = mapAssignmentStatus(assignmentConfig.assignment.status);
  return {
    slug: assignmentConfig.assignment.slug,
    title: assignmentConfig.assignment.title,
    status: assignmentStatus,
    gradingEnabled: grading.enabled,
    assignmentFile,
    applyState: getAssignmentApplyState(repoRoot, assignmentFile.split("/")[1] ?? "", expectedSlug),
    needsAttention: getAttentionCount(diagnostics) > EMPTY_COUNT14,
    diagnostics,
    ...grading.enabled ? { gradingMode: grading.mode ?? LEGACY_GRADING_MODE6 } : grading.mode === void 0 ? {} : { gradingMode: grading.mode },
    ...courseConfig.reports.student_publish === void 0 ? {} : { studentPublishEnabled: courseConfig.reports.student_publish.enabled },
    dueAt: assignmentConfig.deadline.due_at,
    points: assignmentConfig.metadata.points,
    sections: assignmentConfig.sections,
    templateRepository: assignmentConfig.template.repository,
    templateBranch: assignmentConfig.template.branch,
    ...grading.workflow === void 0 ? {} : { workflow: grading.workflow }
  };
};
var createBrokenAssignmentSummary = (assignmentSlug, assignmentFile, diagnostics) => ({
  slug: assignmentSlug,
  title: assignmentSlug,
  status: STATUS_UNKNOWN,
  gradingEnabled: false,
  assignmentFile,
  applyState: APPLY_STATE_UNKNOWN,
  needsAttention: true,
  diagnostics
});
var withAssignmentGithubResult = (assignment, diagnostics, github) => ({
  ...assignment,
  diagnostics: [...diagnostics],
  needsAttention: getAttentionCount(diagnostics) > EMPTY_COUNT14,
  github
});
var inspectWorkflowDispatch2 = (assignment, workflowPath, workflowContent) => {
  const parseResult = parseYaml(workflowContent, workflowPath);
  if (parseResult.status === "failure") {
    return {
      status: GITHUB_STATUS_ERROR,
      diagnostics: [
        addDiagnosticContext(parseResult.diagnostic, createAssignmentDiagnosticContext(assignment))
      ]
    };
  }
  if (!hasWorkflowDispatchTrigger(parseResult.value)) {
    return {
      status: GITHUB_STATUS_MISSING,
      diagnostics: [createWorkflowDispatchMissingDiagnostic4(assignment, workflowPath)]
    };
  }
  return {
    status: GITHUB_STATUS_AVAILABLE,
    diagnostics: []
  };
};
var checkWorkflowReadiness = async (cache, githubClient, assignment, owner, repo, branch, currentGithub, diagnostics) => {
  const workflowPath = assignment.workflow;
  if (!assignment.gradingEnabled || workflowPath === void 0) {
    return withAssignmentGithubResult(assignment, diagnostics, {
      ...currentGithub,
      gradingWorkflow: assignment.gradingEnabled ? GITHUB_STATUS_NOT_CHECKED : GITHUB_STATUS_NOT_REQUIRED,
      workflowDispatch: assignment.gradingEnabled ? GITHUB_STATUS_NOT_CHECKED : GITHUB_STATUS_NOT_REQUIRED
    });
  }
  try {
    const workflowContent = await getCachedWorkflowFileContent(
      cache,
      githubClient,
      owner,
      repo,
      branch,
      workflowPath
    );
    if (workflowContent === null) {
      const workflowDiagnostics2 = [
        ...diagnostics,
        createGradingWorkflowMissingDiagnostic2(assignment, workflowPath)
      ];
      return withAssignmentGithubResult(assignment, workflowDiagnostics2, {
        ...currentGithub,
        gradingWorkflow: GITHUB_STATUS_MISSING,
        workflowDispatch: GITHUB_STATUS_NOT_CHECKED
      });
    }
    const dispatchResult = inspectWorkflowDispatch2(assignment, workflowPath, workflowContent);
    const workflowDiagnostics = [...diagnostics, ...dispatchResult.diagnostics];
    return withAssignmentGithubResult(assignment, workflowDiagnostics, {
      ...currentGithub,
      gradingWorkflow: GITHUB_STATUS_AVAILABLE,
      workflowDispatch: dispatchResult.status
    });
  } catch (error) {
    const workflowDiagnostics = [
      ...diagnostics,
      createDashboardGithubRequestDiagnostic(
        error,
        `Could not check grading workflow ${workflowPath}.`,
        {
          ...createAssignmentDiagnosticContext(assignment),
          checkedPath: workflowPath
        }
      )
    ];
    return withAssignmentGithubResult(assignment, workflowDiagnostics, {
      ...currentGithub,
      gradingWorkflow: GITHUB_STATUS_ERROR,
      workflowDispatch: GITHUB_STATUS_ERROR
    });
  }
};
var checkAssignmentGithubReadiness = async (cache, githubClient, courseConfig, loadedAssignment) => {
  const assignment = loadedAssignment.summary;
  const github = createDefaultGithubStatus(assignment.gradingEnabled);
  if (loadedAssignment.config === void 0) {
    return {
      ...loadedAssignment,
      summary: withAssignmentGithubResult(assignment, assignment.diagnostics, github)
    };
  }
  const repositoryResult = parseTemplateRepository(
    courseConfig.github.organization,
    loadedAssignment.config.template.repository
  );
  if (repositoryResult.status === "failure") {
    const diagnostics = [
      ...assignment.diagnostics,
      addDiagnosticContext(
        repositoryResult.diagnostic,
        createAssignmentDiagnosticContext(assignment)
      )
    ];
    return {
      ...loadedAssignment,
      summary: withAssignmentGithubResult(assignment, diagnostics, {
        ...github,
        templateRepository: GITHUB_STATUS_ERROR,
        templateBranch: GITHUB_STATUS_ERROR
      })
    };
  }
  const { owner, repo } = repositoryResult.repository;
  const branch = loadedAssignment.config.template.branch;
  try {
    const templateRepository = await getCachedTemplateRepository(cache, githubClient, owner, repo);
    if (templateRepository === null) {
      const diagnostics = [
        ...assignment.diagnostics,
        createTemplateRepositoryMissingDiagnostic2(assignment)
      ];
      return {
        ...loadedAssignment,
        summary: withAssignmentGithubResult(assignment, diagnostics, {
          ...github,
          templateRepository: GITHUB_STATUS_MISSING
        })
      };
    }
    if (!hasTemplateBranch(templateRepository, branch)) {
      const diagnostics = [
        ...assignment.diagnostics,
        createTemplateBranchMissingDiagnostic3(assignment)
      ];
      return {
        ...loadedAssignment,
        summary: withAssignmentGithubResult(assignment, diagnostics, {
          ...github,
          templateRepository: GITHUB_STATUS_AVAILABLE,
          templateBranch: GITHUB_STATUS_MISSING
        })
      };
    }
    return {
      ...loadedAssignment,
      summary: await checkWorkflowReadiness(
        cache,
        githubClient,
        assignment,
        owner,
        repo,
        branch,
        {
          ...github,
          templateRepository: GITHUB_STATUS_AVAILABLE,
          templateBranch: GITHUB_STATUS_AVAILABLE
        },
        assignment.diagnostics
      )
    };
  } catch (error) {
    const diagnostics = [
      ...assignment.diagnostics,
      createDashboardGithubRequestDiagnostic(error, "Could not check template repository.", {
        ...createAssignmentDiagnosticContext(assignment)
      })
    ];
    return {
      ...loadedAssignment,
      summary: withAssignmentGithubResult(assignment, diagnostics, {
        ...github,
        templateRepository: GITHUB_STATUS_ERROR,
        templateBranch: GITHUB_STATUS_ERROR
      })
    };
  }
};
var loadAssignmentSummary = (repoRoot, courseConfig, termSlug, assignmentSlug) => {
  const assignmentFile = [
    TERMS_DIRECTORY4,
    termSlug,
    ASSIGNMENTS_DIRECTORY,
    assignmentSlug,
    ASSIGNMENT_CONFIG_FILE_NAME
  ].join("/");
  const loadResult = loadAssignmentConfig(path10.join(repoRoot, assignmentFile));
  if (loadResult.status === "failure") {
    return {
      summary: createBrokenAssignmentSummary(assignmentSlug, assignmentFile, loadResult.diagnostics)
    };
  }
  const diagnostics = validateAssignmentConfig(assignmentFile, loadResult.value, assignmentSlug);
  return {
    config: loadResult.value,
    summary: createAssignmentSummary(
      repoRoot,
      courseConfig,
      loadResult.value,
      assignmentFile,
      assignmentSlug,
      diagnostics
    )
  };
};
var loadAssignmentSummaries = (repoRoot, courseConfig, termSlug) => {
  const assignmentsDirectory = path10.join(
    repoRoot,
    TERMS_DIRECTORY4,
    termSlug,
    ASSIGNMENTS_DIRECTORY
  );
  return listDirectoryNames(assignmentsDirectory).map(
    (assignmentSlug) => loadAssignmentSummary(repoRoot, courseConfig, termSlug, assignmentSlug)
  );
};
var createEmptyRosterSummary = (sectionCount) => ({
  sectionCount,
  activeStudentCount: EMPTY_COUNT14,
  totalStudentCount: EMPTY_COUNT14
});
var getColumnIndexes2 = (headers) => ({
  studentId: headers.indexOf(STUDENT_ID_COLUMN),
  githubUsername: headers.indexOf(GITHUB_USERNAME_COLUMN),
  section: headers.indexOf(SECTION_COLUMN),
  status: headers.indexOf(STATUS_COLUMN)
});
var getValue2 = (values, index) => index === MISSING_COLUMN_INDEX2 ? "" : (values[index] ?? "").trim();
var createRosterContext = (rosterPath, rowNumber, expectedSection) => ({
  rosterPath,
  rowNumber,
  expectedSection
});
var loadRosterStudents = (repoRoot, rosterPath, expectedSection) => {
  const fileResult = readTextFile(path10.join(repoRoot, rosterPath));
  if (fileResult.status === "failure") {
    return {
      students: [],
      diagnostics: [fileResult.diagnostic]
    };
  }
  const document = parseCsv(fileResult.content);
  const missingColumnErrors = validateRequiredColumns(rosterPath, document.headers);
  if (missingColumnErrors.length > EMPTY_COUNT14) {
    return {
      students: [],
      diagnostics: missingColumnErrors
    };
  }
  const indexes = getColumnIndexes2(document.headers);
  const students = [];
  const diagnostics = [];
  for (const row of document.rows) {
    const rawStudentId = getValue2(row.values, indexes.studentId);
    const rawGithubUsername = getValue2(row.values, indexes.githubUsername);
    const rawSection = getValue2(row.values, indexes.section);
    const rawStatus = getValue2(row.values, indexes.status);
    const valueByColumn = {
      [STUDENT_ID_COLUMN]: rawStudentId,
      [GITHUB_USERNAME_COLUMN]: rawGithubUsername,
      [SECTION_COLUMN]: rawSection,
      [STATUS_COLUMN]: rawStatus
    };
    const missingValueErrors = REQUIRED_ROSTER_COLUMNS.flatMap(
      (column) => valueByColumn[column].length === EMPTY_COUNT14 ? [createMissingRequiredValueDiagnostic(rosterPath, row.rowNumber, column)] : []
    );
    if (missingValueErrors.length > EMPTY_COUNT14) {
      diagnostics.push(...missingValueErrors);
    } else {
      const rowContext = createRosterContext(rosterPath, row.rowNumber, expectedSection);
      const normalizedStudentId = normalizeStudentId(rawStudentId, rowContext);
      const normalizedGithubUsername = normalizeGithubUsername(rawGithubUsername, rowContext);
      const normalizedStatus = normalizeRosterStatus(rawStatus, rowContext);
      const rowDiagnostics = [
        normalizedStudentId.warning,
        normalizedGithubUsername.warning,
        normalizedStatus.warning,
        ...validateRosterStatus(rosterPath, row.rowNumber, normalizedStatus.value),
        ...validateRosterSection(rosterPath, row.rowNumber, expectedSection, rawSection),
        ...validateGithubUsername(rosterPath, row.rowNumber, normalizedGithubUsername.value)
      ].filter((diagnostic2) => diagnostic2 !== void 0);
      const rowErrors = rowDiagnostics.filter(diagnosticRequiresAttention);
      diagnostics.push(...rowDiagnostics);
      if (rowErrors.length === EMPTY_COUNT14 && isRosterStatus(normalizedStatus.value)) {
        students.push({
          studentId: normalizedStudentId.value,
          githubUsername: normalizedGithubUsername.value,
          section: rawSection,
          status: normalizedStatus.value,
          rosterPath,
          rowNumber: row.rowNumber
        });
      }
    }
  }
  return {
    students,
    diagnostics
  };
};
var loadRosterSummary = (repoRoot, termSlug, termConfig) => {
  if (termConfig === void 0) {
    return {
      roster: createEmptyRosterSummary(EMPTY_COUNT14),
      diagnostics: []
    };
  }
  const loadedRosters = termConfig.sections.map(
    (section) => loadRosterStudents(repoRoot, [TERMS_DIRECTORY4, termSlug, section.roster].join("/"), section.id)
  );
  const students = loadedRosters.flatMap((roster) => roster.students);
  const diagnostics = [
    ...loadedRosters.flatMap((roster) => roster.diagnostics),
    ...validateRosterDuplicates(students)
  ];
  return {
    roster: {
      sectionCount: termConfig.sections.length,
      activeStudentCount: students.filter((student) => student.status === ROSTER_STATUS_ACTIVE).length,
      totalStudentCount: students.length
    },
    diagnostics
  };
};
var getTermTitle = (term) => term.config?.term.display_name ?? term.termSlug;
var getCardStatus = (assignments) => {
  if (assignments.length === EMPTY_COUNT14) {
    return STATUS_ACTIVE;
  }
  if (assignments.some((assignment) => assignment.status === STATUS_ACTIVE)) {
    return STATUS_ACTIVE;
  }
  if (assignments.some((assignment) => assignment.status === STATUS_COMPLETED)) {
    return STATUS_COMPLETED;
  }
  return STATUS_INACTIVE;
};
var buildCard = async (repoRoot, githubClient, githubCache, courseConfig, courseDiagnostics, term) => {
  const loadedAssignments = loadAssignmentSummaries(repoRoot, courseConfig, term.termSlug);
  const checkedAssignments = await Promise.all(
    loadedAssignments.map(
      (loadedAssignment) => checkAssignmentGithubReadiness(githubCache, githubClient, courseConfig, loadedAssignment)
    )
  );
  const assignments = checkedAssignments.map((loadedAssignment) => loadedAssignment.summary);
  const sortedAssignments = [...assignments].sort(compareRecentAssignments);
  const recentAssignments = assignments.filter(shouldIncludeAssignment).sort(compareRecentAssignments).slice(EMPTY_COUNT14, DEFAULT_RECENT_ASSIGNMENT_LIMIT);
  const rosterResult = loadRosterSummary(repoRoot, term.termSlug, term.config);
  const assignmentDiagnostics = assignments.flatMap((assignment) => assignment.diagnostics);
  const diagnostics = [
    ...courseDiagnostics,
    ...term.diagnostics,
    ...rosterResult.diagnostics,
    ...assignmentDiagnostics
  ];
  const attentionCount = getAttentionCount(diagnostics);
  const courseSlug = courseConfig.course.code;
  return {
    kind: "course-term",
    displayName: `${term.termSlug}-${courseSlug}`,
    courseSlug,
    courseTitle: courseConfig.course.title,
    coursePath: COURSE_PATH,
    termSlug: term.termSlug,
    termTitle: getTermTitle(term),
    status: getCardStatus(assignments),
    needsAttention: attentionCount > EMPTY_COUNT14,
    attentionCount,
    roster: rosterResult.roster,
    assignmentCount: assignments.length,
    assignments: sortedAssignments,
    recentAssignments,
    diagnostics
  };
};
var determineStatus = (diagnostics, cards) => {
  const hasErrors = diagnostics.some(diagnosticRequiresAttention);
  if (cards.length === EMPTY_COUNT14 && hasErrors) {
    return "failure";
  }
  return hasErrors ? "partial_success" : "success";
};
var buildDashboard = async ({
  cwd,
  githubClient,
  term
}) => {
  const courseResult = loadCourse(cwd);
  if (!("config" in courseResult)) {
    return createEmptyDashboardResult("failure", courseResult.diagnostics);
  }
  const discoveredTermSlugs = discoverTermSlugs(courseResult.repoRoot, term);
  if (term !== void 0 && discoveredTermSlugs.length === EMPTY_COUNT14) {
    return createEmptyDashboardResult("failure", [createTermNotFoundDiagnostic(term)]);
  }
  const terms = discoveredTermSlugs.map((termSlug) => loadTerm(courseResult.repoRoot, termSlug));
  const githubCache = createGitHubCheckCache();
  const cards = await Promise.all(
    terms.map(
      (loadedTerm) => buildCard(
        courseResult.repoRoot,
        githubClient,
        githubCache,
        courseResult.config,
        courseResult.diagnostics,
        loadedTerm
      )
    )
  );
  const diagnostics = cards.flatMap((card) => card.diagnostics);
  const status = determineStatus(diagnostics, cards);
  return createDashboardResult(status, diagnostics, cards);
};

// src/cli/commands/dashboard.command.ts
var COMMAND_NAME11 = "dashboard";
var EMPTY_LENGTH5 = 0;
var JSON_INDENT_SPACES3 = 2;
var readGraiderToken = (env) => {
  const token = env[GRAIDER_GITHUB_TOKEN_ENV]?.trim();
  return token === void 0 || token.length === EMPTY_LENGTH5 ? void 0 : token;
};
var createJsonRequiredResult2 = () => createEmptyDashboardResult("failure", [
  createConfigDiagnostic(
    DASHBOARD_JSON_REQUIRED_CODE,
    "The dashboard command only supports JSON output. Run with --json."
  )
]);
var createTokenMissingResult = () => createEmptyDashboardResult("failure", [
  createConfigDiagnostic(
    GITHUB_TOKEN_MISSING_CODE,
    "The dashboard command requires GRAIDER_GITHUB_TOKEN so it can check current GitHub status."
  )
]);
var runDashboardCommand = ({
  cwd,
  options,
  env = process.env,
  githubClient
}) => {
  if (options.json !== true) {
    return Promise.resolve(createJsonRequiredResult2());
  }
  const token = readGraiderToken(env);
  if (token === void 0) {
    return Promise.resolve(createTokenMissingResult());
  }
  return buildDashboard({
    cwd,
    githubClient: githubClient ?? createGitHubClient({ token }),
    ...options.term === void 0 ? {} : { term: options.term }
  });
};
var formatDashboardResultAsJson = (result) => JSON.stringify(result, void 0, JSON_INDENT_SPACES3);
var registerDashboardCommand = (program) => {
  program.command(COMMAND_NAME11).option("--json", "Required. Emit dashboard JSON").option("--term <termSlug>", "Include only one term").description("Build a UI-ready dashboard model for the current course admin repository.").action(async (options) => {
    const result = await runDashboardCommand({
      cwd: process.cwd(),
      options
    });
    console.log(formatDashboardResultAsJson(result));
    process.exitCode = result.exitCode;
  });
};

// src/planning/plan-paths.ts
import path11 from "path";
var TERMS_DIRECTORY5 = "terms";
var PLANS_DIRECTORY = "plans";
var PLAN_FILE_PREFIX = "plan";
var PLAN_FILE_EXTENSION = "json";
var createPlanPath = (repoRoot, termCode, assignmentSlug, clock) => {
  const relativeDirectory = path11.posix.join(
    TERMS_DIRECTORY5,
    termCode,
    PLANS_DIRECTORY,
    assignmentSlug
  );
  const fileName = `${PLAN_FILE_PREFIX}-${formatFilesystemTimestamp(clock.now())}.${PLAN_FILE_EXTENSION}`;
  const relativePath = path11.posix.join(relativeDirectory, fileName);
  return {
    relativeDirectory,
    relativePath,
    absolutePath: path11.join(repoRoot, relativePath)
  };
};

// src/planning/plan-renderer.ts
import fs9 from "fs";
import path12 from "path";

// src/io/stable-json.ts
var JSON_INDENT_SPACES4 = 2;
var isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var orderValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(orderValue);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)).map(([key, nestedValue]) => [key, orderValue(nestedValue)])
    );
  }
  return value;
};
var stringifyStableJson = (value) => JSON.stringify(orderValue(value), void 0, JSON_INDENT_SPACES4);

// src/planning/plan-renderer.ts
var renderPlanJson = (plan) => stringifyStableJson(plan);
var writePlanJsonFile = (plan, absolutePath) => {
  try {
    fs9.mkdirSync(path12.dirname(absolutePath), {
      recursive: true
    });
    fs9.writeFileSync(absolutePath, `${renderPlanJson(plan)}
`, "utf8");
    return {
      status: "success"
    };
  } catch (error) {
    return {
      status: "failure",
      diagnostic: createConfigDiagnostic(
        DiagnosticCode.PlanWriteFailed,
        "Failed to write plan file.",
        {
          path: absolutePath,
          reason: error instanceof Error ? error.message : "unknown"
        }
      )
    };
  }
};

// src/cli/commands/plan.command.ts
var COMMAND_NAME12 = "plan";
var DEFAULT_TEMPLATE_COMMIT_SHA = "fake-template-sha";
var README_FILE2 = "README.md";
var EMPTY_COUNT15 = 0;
var createDefaultTemplateRepository = (owner, repo, branch) => ({
  owner,
  name: repo,
  fullName: `${owner}/${repo}`,
  id: 1 /* DefaultTemplateRepositoryId */,
  private: true,
  archived: false,
  defaultBranch: branch,
  htmlUrl: `https://github.com/${owner}/${repo}`,
  isTemplate: true,
  branches: [branch],
  files: [README_FILE2],
  latestCommitSha: DEFAULT_TEMPLATE_COMMIT_SHA
});
var createDefaultGitHubClient2 = (config, students) => {
  const parsedTemplateRepository = parseTemplateRepository(
    config.course.github.organization,
    config.assignment.template.repository
  );
  const templateRepositories = parsedTemplateRepository.status === "success" ? [
    createDefaultTemplateRepository(
      parsedTemplateRepository.repository.owner,
      parsedTemplateRepository.repository.repo,
      config.assignment.template.branch
    )
  ] : [];
  return new FakeGitHubClient({
    templateRepositories,
    users: students.map((student) => ({ username: student.githubUsername })),
    teams: [
      {
        org: config.course.github.organization,
        slug: config.course.github.faculty_team,
        name: config.course.github.faculty_team
      },
      {
        org: config.course.github.organization,
        slug: config.course.github.grader_team,
        name: config.course.github.grader_team
      }
    ]
  });
};
var runPlanCommand = async ({
  cwd,
  assignmentFile,
  options,
  githubClient,
  clock = systemClock
}) => {
  const configResult = loadGraiderConfig({
    cwd,
    assignmentFile
  });
  if (configResult.status === "failure") {
    return createCommandResult({
      commandName: COMMAND_NAME12,
      assignmentFile,
      status: "failure",
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: {
        options
      }
    });
  }
  const rosterResult = loadAssignmentRosters(configResult.config);
  if (rosterResult.errors.length > EMPTY_COUNT15) {
    return createCommandResult({
      commandName: COMMAND_NAME12,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: rosterResult.warnings,
      errors: rosterResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary
      }
    });
  }
  const effectiveGitHubClient = githubClient ?? createDefaultGitHubClient2(configResult.config, rosterResult.students);
  const readinessResult = await validateGitHubReadiness({
    courseConfig: configResult.config.course,
    termConfig: configResult.config.term,
    assignmentConfig: configResult.config.assignment,
    students: rosterResult.students,
    githubClient: effectiveGitHubClient
  });
  if (readinessResult.errors.length > EMPTY_COUNT15) {
    return createCommandResult({
      commandName: COMMAND_NAME12,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [...rosterResult.warnings, ...readinessResult.warnings],
      errors: readinessResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        githubReadinessChecked: true
      }
    });
  }
  const now = clock.now();
  const plan = await buildPlan({
    config: configResult.config,
    students: rosterResult.students,
    rosterSummary: rosterResult.summary,
    githubClient: effectiveGitHubClient,
    createdAt: formatPlanCreatedAt(now)
  });
  const planPath = createPlanPath(
    configResult.config.summary.repoRoot,
    configResult.config.summary.termCode,
    configResult.config.summary.assignmentSlug,
    {
      now: () => now
    }
  );
  const writeResult = writePlanJsonFile(plan, planPath.absolutePath);
  const writeErrors = writeResult.diagnostic === void 0 ? [] : [writeResult.diagnostic];
  const errors = [...plan.errors, ...writeErrors];
  const generatedFiles = writeResult.status === "success" ? [planPath.relativePath] : [];
  return createCommandResult({
    commandName: COMMAND_NAME12,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: errors.length > EMPTY_COUNT15 ? "failure" : "success",
    warnings: [...rosterResult.warnings, ...readinessResult.warnings, ...plan.warnings],
    errors,
    generatedFiles,
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
      githubReadinessChecked: true,
      planFile: planPath.relativePath,
      operationCount: plan.operations.length,
      plannedOperationCount: plan.summary.planned_operations,
      skippedOperationCount: plan.summary.skipped_operations,
      blockedOperationCount: plan.summary.blocked_operations,
      inputFingerprint: plan.source.input_fingerprint
    }
  });
};
var registerPlanCommand = (program) => {
  program.command(COMMAND_NAME12).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").description("Plan assignment provisioning.").action(async (assignmentFile, rawOptions) => {
    const options = normalizeCommonCommandOptions(rawOptions);
    const result = await runPlanCommand({
      cwd: process.cwd(),
      assignmentFile,
      options
    });
    writeCommandResult(result, options.json);
    process.exitCode = result.exitCode;
  });
};

// src/cli/commands/remove-access.command.ts
var COMMAND_NAME13 = "remove-access";
var normalizeRemoveAccessTargetSelector = (rawOptions) => ({
  ...rawOptions.all === void 0 ? {} : { all: rawOptions.all },
  ...rawOptions.section === void 0 ? {} : { section: rawOptions.section },
  ...rawOptions.studentId === void 0 ? {} : { studentId: rawOptions.studentId },
  ...rawOptions.githubUsername === void 0 ? {} : { githubUsername: rawOptions.githubUsername }
});
var runRemoveAccessCommand = ({
  cwd,
  assignmentFile,
  options,
  targetSelector
}) => createCommandResult({
  commandName: COMMAND_NAME13,
  assignmentFile,
  status: "failure",
  warnings: [],
  errors: [createNotSupportedInMvpDiagnostic(COMMAND_NAME13, assignmentFile)],
  generatedFiles: [],
  summary: {
    unsupported: true,
    mvpSupported: false,
    cwd,
    options,
    targetSelector
  }
});
var registerRemoveAccessCommand = (program) => {
  program.command(COMMAND_NAME13).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").option("--all", "Reserved for future remove-access targeting").option("--section <section-id>", "Reserved for future remove-access targeting").option("--student-id <student-id>", "Reserved for future remove-access targeting").option("--github-username <github-username>", "Reserved for future remove-access targeting").description("Remove student access from assignment repositories.").action((assignmentFile, rawOptions) => {
    const options = normalizeCommonCommandOptions(rawOptions);
    const result = runRemoveAccessCommand({
      cwd: process.cwd(),
      assignmentFile,
      options,
      targetSelector: normalizeRemoveAccessTargetSelector(rawOptions)
    });
    writeCommandResult(result, options.json);
    process.exitCode = result.exitCode;
  });
};

// src/cli/commands/report.command.ts
import path15 from "path";

// src/reporting/student-markdown-renderer.ts
var NEWLINE = "\n";
var EMPTY_DISPLAY = "";
var diagnosticCodes = (diagnostics) => diagnostics.map((diagnostic2) => diagnostic2.code).join("; ");
var formatNullableNumber = (value) => value === void 0 || value === null ? EMPTY_DISPLAY : String(value);
var renderRepositoryLine = (student) => {
  if (student.repositoryName === void 0) {
    return "- Repository: missing";
  }
  if (student.repositoryUrl === void 0) {
    return `- Repository: ${student.repositoryName}`;
  }
  return `- Repository: [${student.repositoryName}](${student.repositoryUrl})`;
};
var renderCheckRows = (student) => student.grading.checks.length === 0 ? ["No check details were reported."] : [
  "| Check | Status | Points | Message |",
  "| --- | --- | --- | --- |",
  ...student.grading.checks.map((check) => {
    const points = check.pointsEarned === void 0 && check.pointsPossible === void 0 ? EMPTY_DISPLAY : `${formatNullableNumber(check.pointsEarned)}/${formatNullableNumber(check.pointsPossible)}`;
    return `| ${check.name} | ${check.status} | ${points} | ${check.message ?? EMPTY_DISPLAY} |`;
  })
];
var renderDetails = (student) => {
  const details = student.grading.checks.flatMap(
    (check) => check.details === void 0 || check.details.length === 0 ? [] : [`### ${check.name}`, ...check.details.map((detail) => `- ${detail}`), ""]
  );
  return details.length === 0 ? ["No additional details were reported."] : details;
};
var renderNotConfiguredMessage = (student) => student.grading.resultStatus === "not_configured" ? ["", "Grading was not configured for this assignment."] : [];
var renderStudentMarkdownReport = (assignment, student) => [
  `# ${assignment.assignmentTitle}`,
  "",
  `Student: ${student.studentId} (${student.githubUsername})`,
  `Section: ${student.section}`,
  "",
  "## Submission",
  "",
  renderRepositoryLine(student),
  `- Repository status: ${student.repositoryStatus}`,
  `- Roster status: ${student.rosterStatus}`,
  "",
  "## Grading Result",
  "",
  `- Workflow status: ${student.grading.workflowStatus}`,
  `- Result status: ${student.grading.resultStatus}`,
  `- Artifact status: ${student.grading.artifactStatus}`,
  `- Result file status: ${student.grading.resultFileStatus}`,
  ...student.grading.score === void 0 ? [] : [
    `- Score: ${formatNullableNumber(student.grading.score)}/${formatNullableNumber(student.grading.maxScore)}`
  ],
  ...renderNotConfiguredMessage(student),
  "",
  "## Checks",
  "",
  ...renderCheckRows(student),
  "",
  "## Details",
  "",
  ...renderDetails(student),
  "",
  "## Diagnostics",
  "",
  `Warnings: ${diagnosticCodes(student.warnings)}`,
  `Errors: ${diagnosticCodes(student.errors)}`,
  ""
].join(NEWLINE);

// src/reporting/student-results-json-renderer.ts
var PUBLISHED_STUDENT_RESULTS_SCHEMA_VERSION = 1;
var mapChecks = (student) => student.grading.checks.map((check) => ({
  name: check.name,
  status: check.status,
  ...check.message === void 0 ? {} : { message: check.message },
  ...check.pointsEarned === void 0 ? {} : { points_earned: check.pointsEarned },
  ...check.pointsPossible === void 0 ? {} : { points_possible: check.pointsPossible },
  ...check.details === void 0 ? {} : { details: check.details }
}));
var toStudentResultsJsonValue = (assignment, student, generatedAt) => ({
  schema_version: PUBLISHED_STUDENT_RESULTS_SCHEMA_VERSION,
  generated_at: generatedAt,
  assignment: {
    course_code: assignment.courseCode,
    term_code: assignment.termCode,
    assignment_slug: assignment.assignmentSlug,
    assignment_title: assignment.assignmentTitle
  },
  student: {
    student_id: student.studentId,
    github_username: student.githubUsername,
    section: student.section,
    roster_status: student.rosterStatus
  },
  repository: {
    ...student.repositoryName === void 0 ? {} : { name: student.repositoryName },
    ...student.repositoryUrl === void 0 ? {} : { url: student.repositoryUrl },
    status: student.repositoryStatus
  },
  grading: {
    workflow_status: student.grading.workflowStatus,
    result_status: student.grading.resultStatus,
    artifact_status: student.grading.artifactStatus,
    result_file_status: student.grading.resultFileStatus,
    ...student.grading.score === void 0 ? {} : { score: student.grading.score },
    ...student.grading.maxScore === void 0 ? {} : { max_score: student.grading.maxScore },
    checks: mapChecks(student)
  },
  warnings: student.warnings,
  errors: student.errors
});
var renderStudentResultsJson = (assignment, student, generatedAt) => `${stringifyStableJson(toStudentResultsJsonValue(assignment, student, generatedAt))}
`;

// src/reporting/student-report-publisher.ts
var PUBLISHED_STUDENT_REPORT_PATH = "grading/report.md";
var PUBLISHED_STUDENT_RESULTS_PATH = "grading/results.json";
var PUBLISHED_STUDENT_REPORT_COMMIT_MESSAGE = "Update Graider student report";
var EMPTY_COUNT16 = 0;
var PUBLISHED_FILE_COUNT_PER_STUDENT = 2;
var FIRST_PUBLISHED_FILE_COUNT = 1;
var STUDENT_PUBLISH_MODE_GRAIDER_GENERATED = "graider-generated";
var STUDENT_PUBLISH_MODE_FACULTY_PROVIDED = "faculty-provided";
var STUDENT_PUBLISH_MODE_BOTH = "both";
var STUDENT_PUBLISH_MODE_DISABLED = "disabled";
var CURRENT_DIRECTORY_PREFIX = "./";
var WINDOWS_PATH_SEPARATOR_PATTERN3 = /\\/g;
var createPublishedFileReference = (owner, repo, filePath) => `${owner}/${repo}:${filePath}`;
var createRepositoryMissingWarning = (student) => createWarningDiagnostic(
  DiagnosticCode.StudentReportRepositoryMissing,
  "Student report was not published because the student repository is unavailable.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    repositoryName: student.repositoryName,
    repositoryStatus: student.repositoryStatus
  }
);
var createWriteDiagnostic = (student, filePath, error) => createConfigDiagnostic(
  DiagnosticCode.StudentReportWriteFailed,
  "Student report publish failed.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    repositoryName: student.repositoryName,
    path: filePath,
    operation: "writeRepositoryFile",
    ...error instanceof GitHubClientError ? {
      underlyingDiagnosticCode: error.diagnosticCode,
      kind: error.kind
    } : {}
  }
);
var createArtifactMissingDiagnostic = (student, artifactName) => createConfigDiagnostic(
  DiagnosticCode.StudentReportArtifactMissing,
  "Student report source artifact was not found.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    repositoryName: student.repositoryName,
    artifact: artifactName,
    workflowRunId: student.grading.workflowRunId
  }
);
var createSourceMissingDiagnostic = (student, artifactName, sourceFile) => createConfigDiagnostic(
  DiagnosticCode.StudentReportSourceMissing,
  "Student report source file was not found in the configured artifact.",
  {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    repositoryName: student.repositoryName,
    artifact: artifactName,
    sourceFile
  }
);
var normalizeArtifactPath = (filePath) => {
  const normalizedPath = filePath.trim().replace(WINDOWS_PATH_SEPARATOR_PATTERN3, "/");
  return normalizedPath.startsWith(CURRENT_DIRECTORY_PREFIX) ? normalizedPath.slice(CURRENT_DIRECTORY_PREFIX.length) : normalizedPath;
};
var findArtifactText = (artifact, sourceFile) => {
  const normalizedSourceFile = normalizeArtifactPath(sourceFile);
  return Object.entries(artifact.files).find(
    ([filePath]) => normalizeArtifactPath(filePath) === normalizedSourceFile
  )?.[1];
};
var getStudentPublishMode = (studentPublishConfig) => {
  if (studentPublishConfig?.enabled === false) {
    return STUDENT_PUBLISH_MODE_DISABLED;
  }
  if (studentPublishConfig?.mode === STUDENT_PUBLISH_MODE_FACULTY_PROVIDED) {
    return STUDENT_PUBLISH_MODE_FACULTY_PROVIDED;
  }
  if (studentPublishConfig?.mode === STUDENT_PUBLISH_MODE_BOTH) {
    return STUDENT_PUBLISH_MODE_BOTH;
  }
  return STUDENT_PUBLISH_MODE_GRAIDER_GENERATED;
};
var createGraiderGeneratedFiles = (assignment, student, generatedAt, studentPublishConfig) => [
  {
    path: studentPublishConfig?.destination_file ?? PUBLISHED_STUDENT_REPORT_PATH,
    content: renderStudentMarkdownReport(assignment, student)
  },
  {
    path: PUBLISHED_STUDENT_RESULTS_PATH,
    content: renderStudentResultsJson(assignment, student, generatedAt)
  }
];
var createBothGraiderGeneratedFile = (assignment, student, studentPublishConfig) => ({
  path: studentPublishConfig.graider_report_destination ?? PUBLISHED_STUDENT_REPORT_PATH,
  content: renderStudentMarkdownReport(assignment, student)
});
var downloadFacultyProvidedArtifact = async (githubClient, student, artifactName) => {
  if (student.repositoryOwner === void 0 || student.repositoryName === void 0 || student.grading.workflowRunId === void 0) {
    return null;
  }
  return githubClient.downloadArtifact({
    owner: student.repositoryOwner,
    repo: student.repositoryName,
    runId: student.grading.workflowRunId,
    artifactName
  });
};
var createFacultyProvidedFile = async (githubClient, student, artifactName, sourceFile, destinationFile) => {
  const artifact = await downloadFacultyProvidedArtifact(githubClient, student, artifactName);
  if (artifact === null) {
    return {
      errors: [createArtifactMissingDiagnostic(student, artifactName)]
    };
  }
  const content = findArtifactText(artifact, sourceFile);
  if (content === void 0) {
    return {
      errors: [createSourceMissingDiagnostic(student, artifactName, sourceFile)]
    };
  }
  return {
    file: {
      path: destinationFile,
      content
    },
    errors: []
  };
};
var createPublishFiles = async (input) => {
  const mode = getStudentPublishMode(input.studentPublishConfig);
  if (mode === STUDENT_PUBLISH_MODE_DISABLED) {
    return {
      files: [],
      errors: [],
      skipped: true
    };
  }
  if (mode === STUDENT_PUBLISH_MODE_GRAIDER_GENERATED) {
    return {
      files: createGraiderGeneratedFiles(
        input.assignment,
        input.student,
        input.generatedAt,
        input.studentPublishConfig
      ),
      errors: [],
      skipped: false
    };
  }
  if (mode === STUDENT_PUBLISH_MODE_FACULTY_PROVIDED) {
    const studentPublishConfig2 = input.studentPublishConfig;
    const artifactName2 = studentPublishConfig2?.artifact ?? "";
    const sourceFile2 = studentPublishConfig2?.source_file ?? "";
    const destinationFile2 = studentPublishConfig2?.destination_file ?? PUBLISHED_STUDENT_REPORT_PATH;
    const facultyFile2 = await createFacultyProvidedFile(
      input.githubClient,
      input.student,
      artifactName2,
      sourceFile2,
      destinationFile2
    );
    return {
      files: facultyFile2.file === void 0 ? [] : [facultyFile2.file],
      errors: facultyFile2.errors,
      skipped: false
    };
  }
  const studentPublishConfig = input.studentPublishConfig;
  const artifactName = studentPublishConfig?.artifact ?? "";
  const sourceFile = studentPublishConfig?.faculty_report_source ?? "";
  const destinationFile = studentPublishConfig?.faculty_report_destination ?? PUBLISHED_STUDENT_REPORT_PATH;
  const facultyFile = await createFacultyProvidedFile(
    input.githubClient,
    input.student,
    artifactName,
    sourceFile,
    destinationFile
  );
  const files = [
    createBothGraiderGeneratedFile(
      input.assignment,
      input.student,
      studentPublishConfig ?? {
        enabled: true,
        mode: STUDENT_PUBLISH_MODE_BOTH
      }
    ),
    ...facultyFile.file === void 0 ? [] : [facultyFile.file]
  ];
  return {
    files,
    errors: facultyFile.errors,
    skipped: false
  };
};
var publishFile = async (githubClient, student, file) => {
  if (student.repositoryOwner === void 0 || student.repositoryName === void 0) {
    return "";
  }
  await githubClient.writeRepositoryFile({
    owner: student.repositoryOwner,
    repo: student.repositoryName,
    path: file.path,
    content: file.content,
    message: PUBLISHED_STUDENT_REPORT_COMMIT_MESSAGE
  });
  return createPublishedFileReference(student.repositoryOwner, student.repositoryName, file.path);
};
var publishStudentReport = async ({
  githubClient,
  assignment,
  student,
  generatedAt,
  studentPublishConfig
}) => {
  if (getStudentPublishMode(studentPublishConfig) === STUDENT_PUBLISH_MODE_DISABLED) {
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles: [],
      warnings: [],
      errors: [],
      skipped: true
    };
  }
  if (student.repositoryOwner === void 0 || student.repositoryName === void 0 || student.repositoryStatus !== "available") {
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles: [],
      warnings: [createRepositoryMissingWarning(student)],
      errors: [],
      skipped: true
    };
  }
  const publishedFiles = [];
  let publishPlan;
  try {
    publishPlan = await createPublishFiles({
      githubClient,
      assignment,
      student,
      generatedAt,
      studentPublishConfig
    });
  } catch (error) {
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles,
      warnings: [],
      errors: [createWriteDiagnostic(student, studentPublishConfig?.source_file ?? "", error)],
      skipped: false
    };
  }
  if (publishPlan.errors.length > EMPTY_COUNT16) {
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles,
      warnings: [],
      errors: publishPlan.errors,
      skipped: false
    };
  }
  try {
    for (const file of publishPlan.files) {
      publishedFiles.push(await publishFile(githubClient, student, file));
    }
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles,
      warnings: [],
      errors: [],
      skipped: false
    };
  } catch (error) {
    const attemptedPath = publishPlan.files[publishedFiles.length]?.path ?? (publishedFiles.length === PUBLISHED_FILE_COUNT_PER_STUDENT - FIRST_PUBLISHED_FILE_COUNT ? PUBLISHED_STUDENT_RESULTS_PATH : PUBLISHED_STUDENT_REPORT_PATH);
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles,
      warnings: [],
      errors: [createWriteDiagnostic(student, attemptedPath, error)],
      skipped: false
    };
  }
};

// src/execution/report-publisher.ts
var EMPTY_COUNT17 = 0;
var publishStudentReports = async ({
  report,
  githubClient,
  studentPublishConfig
}) => {
  const publishedFiles = [];
  const warnings = [];
  const errors = [];
  let studentsPublished = EMPTY_COUNT17;
  let publishFailed = EMPTY_COUNT17;
  let publishSkipped = EMPTY_COUNT17;
  for (const student of report.students) {
    const result = await publishStudentReport({
      githubClient,
      assignment: report.assignment,
      student,
      generatedAt: report.generatedAt,
      studentPublishConfig
    });
    publishedFiles.push(...result.publishedFiles);
    warnings.push(...result.warnings);
    errors.push(...result.errors);
    if (result.skipped) {
      publishSkipped += 1;
    } else if (result.errors.length > EMPTY_COUNT17) {
      publishFailed += 1;
    } else {
      studentsPublished += 1;
    }
  }
  return {
    publishedFiles,
    warnings,
    errors,
    studentsReported: report.students.length,
    studentsPublished,
    publishFailed,
    publishSkipped
  };
};

// src/grading/grading-result-models.ts
var SUPPORTED_GRADING_RESULT_SCHEMA_VERSION = 1;
var GRADING_RESULT_STATUSES = [
  "passed",
  "failed",
  "error",
  "skipped",
  "missing_artifact",
  "missing_result_file",
  "invalid_result_file",
  "not_run",
  "missing_workflow",
  "workflow_failed_no_results",
  "not_configured",
  "unknown"
];

// src/grading/grading-status-mapper.ts
var FAILED_WORKFLOW_CONCLUSIONS = /* @__PURE__ */ new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required"
]);
var isOneOf = (values, value) => values.includes(value);
var isGradingResultStatus = (value) => isOneOf(GRADING_RESULT_STATUSES, value);
var createMapping = (workflowStatus, resultStatus, artifactStatus, resultFileStatus, warnings = []) => ({
  workflowStatus,
  resultStatus,
  artifactStatus,
  resultFileStatus,
  warnings,
  errors: []
});
var isFailedWorkflowConclusion = (conclusion) => conclusion !== void 0 && conclusion !== null && FAILED_WORKFLOW_CONCLUSIONS.has(conclusion);
var mapGradingStatus = (input) => {
  if (!input.gradingEnabled) {
    return createMapping("not_configured", "not_configured", "not_checked", "not_checked");
  }
  if (!input.workflowConfigured || !input.workflowFound) {
    return createMapping("missing_workflow", "missing_workflow", "not_checked", "not_checked");
  }
  if (input.workflowRunStatus === void 0 || input.workflowRunStatus === "not_run") {
    return createMapping("not_run", "not_run", "not_checked", "not_checked");
  }
  const workflowFailed = isFailedWorkflowConclusion(input.workflowRunConclusion);
  if (workflowFailed && input.resultFileStatus !== "valid") {
    return createMapping(
      "workflow_failed_no_results",
      "workflow_failed_no_results",
      input.artifactStatus,
      input.resultFileStatus
    );
  }
  if (input.artifactStatus === "missing") {
    return createMapping("completed", "missing_artifact", "missing", "not_checked");
  }
  if (input.resultFileStatus === "missing") {
    return createMapping("completed", "missing_result_file", "found", "missing");
  }
  if (input.resultFileStatus === "invalid") {
    return createMapping("completed", "invalid_result_file", "found", "invalid");
  }
  if (input.resultFileStatus === "valid") {
    const resultStatus = input.parsedResultStatus ?? "unknown";
    const warnings = workflowFailed ? [
      createWarningDiagnostic(
        DiagnosticCode.GradingWorkflowFailedWithResults,
        "Workflow failed, but a valid grading result file was found; preserving parsed result status.",
        {
          workflowRunConclusion: input.workflowRunConclusion,
          resultStatus
        }
      )
    ] : [];
    return createMapping("completed", resultStatus, "found", "valid", warnings);
  }
  return createMapping("unknown", "unknown", input.artifactStatus, input.resultFileStatus);
};

// src/grading/grading-result-validator.ts
import { z as z3 } from "zod";
var MINIMUM_TEXT_LENGTH = 1;
var NO_DIAGNOSTICS = 0;
var diagnosticSchema2 = z3.object({
  code: z3.string().min(MINIMUM_TEXT_LENGTH),
  severity: z3.union([z3.literal("error"), z3.literal("warning"), z3.literal("info")]),
  message: z3.string().min(MINIMUM_TEXT_LENGTH),
  context: z3.record(z3.string(), z3.unknown()).optional(),
  observedAt: z3.string().optional()
}).strict();
var rawGradingCheckSchema = z3.looseObject({
  name: z3.unknown().optional(),
  status: z3.unknown().optional(),
  message: z3.unknown().optional(),
  points_earned: z3.unknown().optional(),
  points_possible: z3.unknown().optional(),
  details: z3.unknown().optional()
});
var rawGradingResultsSchema = z3.looseObject({
  schema_version: z3.unknown().optional(),
  student_id: z3.unknown().optional(),
  github_username: z3.unknown().optional(),
  assignment_slug: z3.unknown().optional(),
  generated_at: z3.unknown().optional(),
  commit: z3.unknown().optional(),
  status: z3.unknown().optional(),
  score: z3.unknown().optional(),
  max_score: z3.unknown().optional(),
  summary: z3.unknown().optional(),
  checks: z3.unknown().optional(),
  warnings: z3.unknown().optional(),
  errors: z3.unknown().optional()
});
var isNonEmptyString = (value) => typeof value === "string" && value.length >= MINIMUM_TEXT_LENGTH;
var isNumberOrNullOrUndefined = (value) => value === void 0 || value === null || typeof value === "number";
var isStringOrUndefined = (value) => value === void 0 || typeof value === "string";
var isStringArrayOrUndefined = (value) => value === void 0 || Array.isArray(value) && value.every((item) => typeof item === "string");
var createInvalidResultDiagnostic = (message, context) => createConfigDiagnostic(DiagnosticCode.InvalidGradingResult, message, context);
var validateDiagnostics = (value, fieldName) => {
  if (value === void 0) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [
      createInvalidResultDiagnostic(`Grading result ${fieldName} must be an array.`, {
        fieldName
      })
    ];
  }
  const diagnostics = value.flatMap((item, index) => {
    const parsed = diagnosticSchema2.safeParse(item);
    return parsed.success ? [] : [
      createInvalidResultDiagnostic(
        `Grading result ${fieldName} contains an invalid diagnostic.`,
        {
          fieldName,
          index
        }
      )
    ];
  });
  return diagnostics;
};
var normalizeDiagnostics = (value) => Array.isArray(value) ? value.flatMap((item) => {
  const parsed = diagnosticSchema2.safeParse(item);
  return parsed.success ? [
    {
      code: parsed.data.code,
      severity: parsed.data.severity,
      message: parsed.data.message,
      ...parsed.data.context === void 0 ? {} : { context: parsed.data.context },
      ...parsed.data.observedAt === void 0 ? {} : { observedAt: parsed.data.observedAt }
    }
  ] : [];
}) : [];
var validateScoreField = (value, fieldName) => isNumberOrNullOrUndefined(value) ? [] : [
  createConfigDiagnostic(
    DiagnosticCode.InvalidGradingScore,
    `Grading result ${fieldName} must be a number or null.`,
    { fieldName }
  )
];
var validateCheck = (check, index) => {
  const diagnostics = [];
  if (!isNonEmptyString(check.name)) {
    diagnostics.push(
      createConfigDiagnostic(
        DiagnosticCode.MissingGradingCheckName,
        "Grading check is missing a non-empty name.",
        { checkIndex: index }
      )
    );
  }
  if (!isNonEmptyString(check.status) || !["passed", "failed", "error", "skipped"].includes(check.status)) {
    diagnostics.push(
      createConfigDiagnostic(
        DiagnosticCode.InvalidGradingCheckStatus,
        "Grading check status is not part of the closed MVP status vocabulary.",
        { checkIndex: index, status: check.status }
      )
    );
  }
  if (!isStringOrUndefined(check.message)) {
    diagnostics.push(
      createInvalidResultDiagnostic("Grading check message must be a string when present.", {
        checkIndex: index,
        fieldName: "message"
      })
    );
  }
  if (!isStringArrayOrUndefined(check.details)) {
    diagnostics.push(
      createInvalidResultDiagnostic(
        "Grading check details must be an array of strings when present.",
        {
          checkIndex: index,
          fieldName: "details"
        }
      )
    );
  }
  return [
    ...diagnostics,
    ...validateScoreField(check.points_earned, "points_earned"),
    ...validateScoreField(check.points_possible, "points_possible")
  ];
};
var normalizeCheck = (check) => ({
  name: check.name,
  status: check.status,
  ...check.message === void 0 ? {} : { message: check.message },
  ...check.points_earned === void 0 ? {} : { pointsEarned: check.points_earned },
  ...check.points_possible === void 0 ? {} : { pointsPossible: check.points_possible },
  ...check.details === void 0 ? {} : { details: check.details }
});
var validateRawResult = (raw) => {
  const schemaVersionDiagnostics = raw.schema_version === SUPPORTED_GRADING_RESULT_SCHEMA_VERSION ? [] : [
    createConfigDiagnostic(
      DiagnosticCode.InvalidGradingResultSchemaVersion,
      `Unsupported grading result schema_version ${String(raw.schema_version)}.`,
      {
        schemaVersion: raw.schema_version,
        supportedSchemaVersion: SUPPORTED_GRADING_RESULT_SCHEMA_VERSION
      }
    )
  ];
  const statusDiagnostics = isNonEmptyString(raw.status) && isGradingResultStatus(raw.status) ? [] : [
    createConfigDiagnostic(
      DiagnosticCode.InvalidGradingResultStatus,
      "Grading result status is not part of the closed MVP status vocabulary.",
      { status: raw.status }
    )
  ];
  const checksDiagnostics = Array.isArray(raw.checks) ? raw.checks.flatMap((check, index) => {
    const parsed = rawGradingCheckSchema.safeParse(check);
    return parsed.success ? validateCheck(parsed.data, index) : [
      createInvalidResultDiagnostic("Grading check must be an object.", {
        checkIndex: index
      })
    ];
  }) : [
    createInvalidResultDiagnostic("Grading result checks must be an array.", {
      fieldName: "checks"
    })
  ];
  return [
    ...schemaVersionDiagnostics,
    ...statusDiagnostics,
    ...validateScoreField(raw.score, "score"),
    ...validateScoreField(raw.max_score, "max_score"),
    ...isStringOrUndefined(raw.student_id) ? [] : [
      createInvalidResultDiagnostic("Grading result student_id must be a string when present.")
    ],
    ...isStringOrUndefined(raw.github_username) ? [] : [
      createInvalidResultDiagnostic(
        "Grading result github_username must be a string when present."
      )
    ],
    ...isStringOrUndefined(raw.assignment_slug) ? [] : [
      createInvalidResultDiagnostic(
        "Grading result assignment_slug must be a string when present."
      )
    ],
    ...isStringOrUndefined(raw.generated_at) ? [] : [
      createInvalidResultDiagnostic(
        "Grading result generated_at must be a string when present."
      )
    ],
    ...isStringOrUndefined(raw.commit) ? [] : [createInvalidResultDiagnostic("Grading result commit must be a string when present.")],
    ...isStringOrUndefined(raw.summary) ? [] : [createInvalidResultDiagnostic("Grading result summary must be a string when present.")],
    ...validateDiagnostics(raw.warnings, "warnings"),
    ...validateDiagnostics(raw.errors, "errors"),
    ...checksDiagnostics
  ];
};
var normalizeResult = (raw) => ({
  schemaVersion: SUPPORTED_GRADING_RESULT_SCHEMA_VERSION,
  ...raw.student_id === void 0 ? {} : { studentId: raw.student_id },
  ...raw.github_username === void 0 ? {} : { githubUsername: raw.github_username },
  ...raw.assignment_slug === void 0 ? {} : { assignmentSlug: raw.assignment_slug },
  ...raw.generated_at === void 0 ? {} : { generatedAt: raw.generated_at },
  ...raw.commit === void 0 ? {} : { commit: raw.commit },
  status: raw.status,
  ...raw.score === void 0 ? {} : { score: raw.score },
  ...raw.max_score === void 0 ? {} : { maxScore: raw.max_score },
  ...raw.summary === void 0 ? {} : { summary: raw.summary },
  checks: Array.isArray(raw.checks) ? raw.checks.map((check) => normalizeCheck(rawGradingCheckSchema.parse(check))) : [],
  warnings: normalizeDiagnostics(raw.warnings),
  errors: normalizeDiagnostics(raw.errors)
});
var validateGradingResultsJson = (value) => {
  const parsed = rawGradingResultsSchema.safeParse(value);
  if (!parsed.success) {
    return {
      warnings: [],
      errors: [
        createInvalidResultDiagnostic("Grading result must be a JSON object.", {
          reason: parsed.error.issues.map((issue) => issue.message).join("; ")
        })
      ]
    };
  }
  const errors = validateRawResult(parsed.data);
  if (errors.length > NO_DIAGNOSTICS) {
    return {
      warnings: normalizeDiagnostics(parsed.data.warnings),
      errors
    };
  }
  return {
    result: normalizeResult(parsed.data),
    warnings: normalizeDiagnostics(parsed.data.warnings),
    errors: []
  };
};
var parseGradingResultsJsonText = (jsonText) => {
  try {
    return validateGradingResultsJson(JSON.parse(jsonText));
  } catch (error) {
    return {
      warnings: [],
      errors: [
        createInvalidResultDiagnostic("Invalid JSON in grading result file.", {
          reason: error instanceof Error ? error.message : "Unknown JSON parse failure."
        })
      ]
    };
  }
};

// src/reporting/report-models.ts
var REPORT_SCHEMA_VERSION = 1;

// src/reporting/report-collector.ts
var EMPTY_COUNT18 = 0;
var FIRST_SORT_BEFORE_SECOND2 = -1;
var FIRST_SORT_AFTER_SECOND2 = 1;
var FIRST_WORKFLOW_RUN_INDEX = 0;
var CURRENT_DIRECTORY_PREFIX2 = "./";
var WINDOWS_PATH_SEPARATOR_PATTERN4 = /\\/g;
var compareStudents = (left, right) => {
  const sectionComparison = left.section.localeCompare(right.section);
  if (sectionComparison !== EMPTY_COUNT18) {
    return sectionComparison;
  }
  return left.studentId.localeCompare(right.studentId);
};
var compareRuns = (left, right) => {
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedComparison !== EMPTY_COUNT18) {
    return updatedComparison;
  }
  return left.id < right.id ? FIRST_SORT_BEFORE_SECOND2 : FIRST_SORT_AFTER_SECOND2;
};
var findManifestRecord7 = (manifest, student) => manifest.repositories.find(
  (record) => record.studentId === student.studentId && record.section === student.section
);
var normalizeGitHubError5 = (error) => error instanceof GitHubClientError ? createGitHubDiagnostic(error) : {
  code: "github_api_error",
  severity: "error",
  message: "Unexpected GitHub client failure during report collection."
};
var getEffectiveGrading8 = (config) => config.assignment.grading === void 0 ? config.course.grading : config.assignment.grading;
var getWorkflowRunStatus = (run) => run === void 0 ? void 0 : run.status;
var getWorkflowRunConclusion = (run) => run === void 0 ? void 0 : run.conclusion;
var normalizeArtifactPath2 = (filePath) => {
  const normalizedPath = filePath.trim().replace(WINDOWS_PATH_SEPARATOR_PATTERN4, "/");
  return normalizedPath.startsWith(CURRENT_DIRECTORY_PREFIX2) ? normalizedPath.slice(CURRENT_DIRECTORY_PREFIX2.length) : normalizedPath;
};
var findArtifactResultText = (artifact, resultFilePath) => {
  if (artifact === null) {
    return void 0;
  }
  const normalizedResultFilePath = normalizeArtifactPath2(resultFilePath);
  return Object.entries(artifact.files).find(
    ([filePath]) => normalizeArtifactPath2(filePath) === normalizedResultFilePath
  )?.[1];
};
var getArtifactFileKeys = (artifact) => artifact === null ? [] : Object.keys(artifact.files).map(normalizeArtifactPath2).sort((left, right) => left.localeCompare(right));
var createDefaultGrading = () => ({
  workflowStatus: "unknown",
  resultStatus: "unknown",
  artifactStatus: "not_checked",
  resultFileStatus: "not_checked",
  checks: []
});
var collectStudentGrading = async (input, record, repositoryStatus) => {
  const gradingConfig = getEffectiveGrading8(input.config);
  if (!gradingConfig.enabled) {
    const mapping2 = mapGradingStatus({
      gradingEnabled: false,
      workflowConfigured: false,
      workflowFound: false,
      artifactStatus: "not_checked",
      resultFileStatus: "not_checked"
    });
    return {
      grading: {
        workflowStatus: mapping2.workflowStatus,
        resultStatus: mapping2.resultStatus,
        artifactStatus: mapping2.artifactStatus,
        resultFileStatus: mapping2.resultFileStatus,
        checks: []
      },
      warnings: mapping2.warnings,
      errors: mapping2.errors
    };
  }
  if (record === void 0 || repositoryStatus !== "available" || gradingConfig.workflow === void 0 || gradingConfig.artifact === void 0 || gradingConfig.result_file === void 0) {
    const mapping2 = mapGradingStatus({
      gradingEnabled: true,
      workflowConfigured: gradingConfig.workflow !== void 0,
      workflowFound: false,
      artifactStatus: "not_checked",
      resultFileStatus: "not_checked"
    });
    return {
      grading: {
        workflowStatus: mapping2.workflowStatus,
        resultStatus: mapping2.resultStatus,
        artifactStatus: mapping2.artifactStatus,
        resultFileStatus: mapping2.resultFileStatus,
        checks: []
      },
      warnings: mapping2.warnings,
      errors: mapping2.errors
    };
  }
  const workflowDispatchIdentifier = getWorkflowDispatchIdentifier(gradingConfig.workflow);
  const workflow = await input.githubClient.getWorkflow(
    record.repository.owner,
    record.repository.name,
    workflowDispatchIdentifier
  );
  if (workflow === null) {
    const mapping2 = mapGradingStatus({
      gradingEnabled: true,
      workflowConfigured: true,
      workflowFound: false,
      artifactStatus: "not_checked",
      resultFileStatus: "not_checked"
    });
    return {
      grading: {
        workflowStatus: mapping2.workflowStatus,
        resultStatus: mapping2.resultStatus,
        artifactStatus: mapping2.artifactStatus,
        resultFileStatus: mapping2.resultFileStatus,
        checks: []
      },
      warnings: mapping2.warnings,
      errors: mapping2.errors
    };
  }
  const workflowRuns = (await input.githubClient.listWorkflowRuns({
    owner: record.repository.owner,
    repo: record.repository.name,
    workflowPath: workflowDispatchIdentifier
  })).sort(compareRuns);
  const workflowRun = workflowRuns[FIRST_WORKFLOW_RUN_INDEX];
  if (workflowRun === void 0) {
    const mapping2 = mapGradingStatus({
      gradingEnabled: true,
      workflowConfigured: true,
      workflowFound: true,
      workflowRunStatus: "not_run",
      workflowRunConclusion: null,
      artifactStatus: "not_checked",
      resultFileStatus: "not_checked"
    });
    return {
      grading: {
        ...mapping2,
        checks: []
      },
      warnings: mapping2.warnings,
      errors: mapping2.errors
    };
  }
  const artifact = await input.githubClient.downloadArtifact({
    owner: record.repository.owner,
    repo: record.repository.name,
    runId: workflowRun.id,
    artifactName: gradingConfig.artifact
  });
  const artifactStatus = artifact === null ? "missing" : "found";
  const artifactFileKeys = getArtifactFileKeys(artifact);
  const resultText = findArtifactResultText(artifact, gradingConfig.result_file);
  const resultFileStatus = artifact === null ? "not_checked" : resultText === void 0 ? "missing" : "valid";
  const validationResult = resultText === void 0 ? void 0 : parseGradingResultsJsonText(resultText);
  const finalResultFileStatus = validationResult === void 0 || validationResult.errors.length === EMPTY_COUNT18 ? resultFileStatus : "invalid";
  const parsedResultStatus = validationResult?.result?.status;
  const workflowRunStatus = getWorkflowRunStatus(workflowRun);
  const workflowRunConclusion = getWorkflowRunConclusion(workflowRun);
  const mapping = mapGradingStatus({
    gradingEnabled: true,
    workflowConfigured: true,
    workflowFound: true,
    ...workflowRunStatus === void 0 ? {} : { workflowRunStatus },
    ...workflowRunConclusion === void 0 ? {} : { workflowRunConclusion },
    artifactStatus,
    resultFileStatus: finalResultFileStatus,
    ...parsedResultStatus === void 0 ? {} : { parsedResultStatus }
  });
  return {
    grading: {
      workflowStatus: mapping.workflowStatus,
      resultStatus: mapping.resultStatus,
      artifactStatus: mapping.artifactStatus,
      resultFileStatus: mapping.resultFileStatus,
      ...validationResult?.result?.score === void 0 ? {} : { score: validationResult.result.score },
      ...validationResult?.result?.maxScore === void 0 ? {} : { maxScore: validationResult.result.maxScore },
      checks: validationResult?.result?.checks ?? [],
      workflowRunId: workflowRun.id,
      commitSha: workflowRun.headSha,
      ...input.includeArtifactFileKeys ? {
        artifactFileKeys,
        configuredResultFile: gradingConfig.result_file,
        normalizedResultFile: normalizeArtifactPath2(gradingConfig.result_file)
      } : {}
    },
    warnings: [...mapping.warnings, ...validationResult?.warnings ?? []],
    errors: [...mapping.errors, ...validationResult?.errors ?? []]
  };
};
var collectRepositoryStatus = async (githubClient, record) => {
  if (record === void 0) {
    return {
      repositoryStatus: "not_tracked",
      warnings: [],
      errors: []
    };
  }
  const repository = await githubClient.getRepository(
    record.repository.owner,
    record.repository.name
  );
  if (repository === null) {
    return {
      repositoryStatus: "missing",
      warnings: [],
      errors: []
    };
  }
  return {
    repositoryStatus: repository.archived ? "archived" : "available",
    warnings: [],
    errors: []
  };
};
var collectStudent = async (input, student) => {
  const record = findManifestRecord7(input.manifest, student);
  const warnings = [...record?.warnings ?? []];
  const errors = [...record?.errors ?? []];
  try {
    const repository = await collectRepositoryStatus(input.githubClient, record);
    const grading = await collectStudentGrading(input, record, repository.repositoryStatus);
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      rosterStatus: student.status,
      ...record?.repository.owner === void 0 ? {} : { repositoryOwner: record.repository.owner },
      ...record?.repository.name === void 0 ? {} : { repositoryName: record.repository.name },
      ...record?.repository.htmlUrl === void 0 ? {} : { repositoryUrl: record.repository.htmlUrl },
      repositoryStatus: repository.repositoryStatus,
      grading: grading.grading,
      warnings: [...warnings, ...repository.warnings, ...grading.warnings],
      errors: [...errors, ...repository.errors, ...grading.errors]
    };
  } catch (error) {
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      rosterStatus: student.status,
      ...record?.repository.owner === void 0 ? {} : { repositoryOwner: record.repository.owner },
      ...record?.repository.name === void 0 ? {} : { repositoryName: record.repository.name },
      ...record?.repository.htmlUrl === void 0 ? {} : { repositoryUrl: record.repository.htmlUrl },
      repositoryStatus: "missing",
      grading: createDefaultGrading(),
      warnings,
      errors: [...errors, normalizeGitHubError5(error)]
    };
  }
};
var countResultStatus = (students, status) => students.filter((student) => student.grading.resultStatus === status).length;
var countDiagnostics = (students, fieldName) => students.reduce((total, student) => total + student[fieldName].length, EMPTY_COUNT18);
var createSummary5 = (rosterSummary, students) => ({
  studentCount: rosterSummary.studentCount,
  activeStudentCount: rosterSummary.activeStudentCount,
  droppedStudentCount: rosterSummary.droppedStudentCount,
  holdStudentCount: rosterSummary.holdStudentCount,
  passedCount: countResultStatus(students, "passed"),
  failedCount: countResultStatus(students, "failed"),
  errorCount: countResultStatus(students, "error"),
  skippedCount: countResultStatus(students, "skipped"),
  notConfiguredCount: countResultStatus(students, "not_configured"),
  missingArtifactCount: countResultStatus(students, "missing_artifact"),
  invalidResultFileCount: countResultStatus(students, "invalid_result_file"),
  warningCount: countDiagnostics(students, "warnings"),
  errorCountTotal: countDiagnostics(students, "errors")
});
var collectReport = async (input) => {
  const students = [];
  const sortedStudents = [...input.students].sort(compareStudents);
  for (const student of sortedStudents) {
    students.push(await collectStudent(input, student));
  }
  return {
    report: {
      schemaVersion: REPORT_SCHEMA_VERSION,
      generatedAt: input.generatedAt,
      assignment: {
        courseCode: input.config.course.course.code,
        termCode: input.config.summary.termCode,
        assignmentSlug: input.config.summary.assignmentSlug,
        assignmentTitle: input.config.assignment.assignment.title
      },
      source: {
        inputFingerprint: input.manifest.source.inputFingerprint
      },
      summary: createSummary5(input.rosterSummary, students),
      students,
      warnings: input.manifest.warnings,
      errors: input.manifest.errors
    }
  };
};

// src/reporting/faculty-csv-renderer.ts
var CSV_HEADERS = [
  "section",
  "student_id",
  "github_username",
  "roster_status",
  "repository_name",
  "repository_url",
  "repository_status",
  "workflow_status",
  "result_status",
  "artifact_status",
  "result_file_status",
  "score",
  "max_score",
  "warning_codes",
  "error_codes"
];
var EMPTY_FIELD2 = "";
var COMMA2 = ",";
var QUOTE2 = '"';
var ESCAPED_QUOTE = '""';
var NEWLINE2 = "\n";
var CSV_NEEDS_QUOTES_PATTERN = /[",\n\r]/;
var renderDiagnosticCodes = (diagnostics) => diagnostics.map((diagnostic2) => diagnostic2.code).join(";");
var renderValue = (value) => {
  const rawValue = value === void 0 || value === null ? EMPTY_FIELD2 : String(value);
  const escaped = rawValue.replaceAll(QUOTE2, ESCAPED_QUOTE);
  return CSV_NEEDS_QUOTES_PATTERN.test(escaped) ? `${QUOTE2}${escaped}${QUOTE2}` : escaped;
};
var createRow4 = (student) => [
  student.section,
  student.studentId,
  student.githubUsername,
  student.rosterStatus,
  student.repositoryName ?? EMPTY_FIELD2,
  student.repositoryUrl ?? EMPTY_FIELD2,
  student.repositoryStatus,
  student.grading.workflowStatus,
  student.grading.resultStatus,
  student.grading.artifactStatus,
  student.grading.resultFileStatus,
  student.grading.score ?? EMPTY_FIELD2,
  student.grading.maxScore ?? EMPTY_FIELD2,
  renderDiagnosticCodes(student.warnings),
  renderDiagnosticCodes(student.errors)
];
var renderFacultyCsvReport = (report) => [
  CSV_HEADERS.join(COMMA2),
  ...report.students.map((student) => createRow4(student).map(renderValue).join(COMMA2))
].join(NEWLINE2) + NEWLINE2;

// src/reporting/faculty-json-renderer.ts
var mapStudent = (student) => ({
  student_id: student.studentId,
  github_username: student.githubUsername,
  section: student.section,
  roster_status: student.rosterStatus,
  ...student.repositoryName === void 0 ? {} : { repository_name: student.repositoryName },
  ...student.repositoryUrl === void 0 ? {} : { repository_url: student.repositoryUrl },
  repository_status: student.repositoryStatus,
  grading: {
    workflow_status: student.grading.workflowStatus,
    result_status: student.grading.resultStatus,
    artifact_status: student.grading.artifactStatus,
    result_file_status: student.grading.resultFileStatus,
    ...student.grading.score === void 0 ? {} : { score: student.grading.score },
    ...student.grading.maxScore === void 0 ? {} : { max_score: student.grading.maxScore },
    ...student.grading.workflowRunId === void 0 ? {} : { workflow_run_id: student.grading.workflowRunId },
    ...student.grading.commitSha === void 0 ? {} : { commit_sha: student.grading.commitSha },
    ...student.grading.artifactFileKeys === void 0 ? {} : { artifact_file_keys: student.grading.artifactFileKeys },
    ...student.grading.configuredResultFile === void 0 ? {} : { configured_result_file: student.grading.configuredResultFile },
    ...student.grading.normalizedResultFile === void 0 ? {} : { normalized_result_file: student.grading.normalizedResultFile },
    checks: student.grading.checks.map((check) => ({
      name: check.name,
      status: check.status,
      ...check.message === void 0 ? {} : { message: check.message },
      ...check.pointsEarned === void 0 ? {} : { points_earned: check.pointsEarned },
      ...check.pointsPossible === void 0 ? {} : { points_possible: check.pointsPossible },
      ...check.details === void 0 ? {} : { details: check.details }
    }))
  },
  warnings: student.warnings,
  errors: student.errors
});
var toFacultyJsonValue = (report) => ({
  schema_version: report.schemaVersion,
  generated_at: report.generatedAt,
  assignment: {
    course_code: report.assignment.courseCode,
    term_code: report.assignment.termCode,
    assignment_slug: report.assignment.assignmentSlug,
    assignment_title: report.assignment.assignmentTitle
  },
  source: {
    ...report.source.inputFingerprint === void 0 ? {} : { input_fingerprint: report.source.inputFingerprint }
  },
  summary: {
    student_count: report.summary.studentCount,
    active_student_count: report.summary.activeStudentCount,
    dropped_student_count: report.summary.droppedStudentCount,
    hold_student_count: report.summary.holdStudentCount,
    passed_count: report.summary.passedCount,
    failed_count: report.summary.failedCount,
    error_count: report.summary.errorCount,
    skipped_count: report.summary.skippedCount,
    not_configured_count: report.summary.notConfiguredCount,
    missing_artifact_count: report.summary.missingArtifactCount,
    invalid_result_file_count: report.summary.invalidResultFileCount,
    warning_count: report.summary.warningCount,
    error_count_total: report.summary.errorCountTotal
  },
  students: report.students.map(mapStudent),
  warnings: report.warnings,
  errors: report.errors
});
var renderFacultyJsonReport = (report) => `${stringifyStableJson(toFacultyJsonValue(report))}
`;

// src/reporting/faculty-markdown-renderer.ts
var EMPTY_DISPLAY2 = "";
var NEWLINE3 = "\n";
var escapeCell = (value) => value.replaceAll("|", "\\|");
var formatCount = (value) => String(value);
var diagnosticCodes2 = (diagnostics) => diagnostics.map((diagnostic2) => diagnostic2.code).join("; ");
var renderRepository = (student) => {
  if (student.repositoryName === void 0) {
    return EMPTY_DISPLAY2;
  }
  return student.repositoryUrl === void 0 ? student.repositoryName : `[${student.repositoryName}](${student.repositoryUrl})`;
};
var renderStudentRow = (student) => [
  student.section,
  student.studentId,
  student.githubUsername,
  student.rosterStatus,
  renderRepository(student),
  student.repositoryStatus,
  student.grading.workflowStatus,
  student.grading.resultStatus,
  diagnosticCodes2(student.warnings),
  diagnosticCodes2(student.errors)
].map(escapeCell).join(" | ");
var renderFacultyMarkdownReport = (report) => [
  `# ${report.assignment.assignmentTitle} (${report.assignment.courseCode} ${report.assignment.termCode})`,
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "## Summary",
  "",
  "| Metric | Count |",
  "| --- | ---: |",
  `| Students | ${formatCount(report.summary.studentCount)} |`,
  `| Active | ${formatCount(report.summary.activeStudentCount)} |`,
  `| Dropped | ${formatCount(report.summary.droppedStudentCount)} |`,
  `| Hold | ${formatCount(report.summary.holdStudentCount)} |`,
  `| Passed | ${formatCount(report.summary.passedCount)} |`,
  `| Failed | ${formatCount(report.summary.failedCount)} |`,
  `| Not configured | ${formatCount(report.summary.notConfiguredCount)} |`,
  `| Warnings | ${formatCount(report.summary.warningCount)} |`,
  `| Errors | ${formatCount(report.summary.errorCountTotal)} |`,
  "",
  "## Students",
  "",
  "| Section | Student ID | GitHub | Roster | Repository | Repo Status | Workflow | Result | Warnings | Errors |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...report.students.map((student) => `| ${renderStudentRow(student)} |`),
  ""
].join(NEWLINE3);

// src/reporting/report-paths.ts
import path13 from "path";
var TERMS_DIRECTORY6 = "terms";
var REPORTS_DIRECTORY = "reports";
var FACULTY_JSON_FILE = "faculty-summary.json";
var FACULTY_CSV_FILE = "faculty-summary.csv";
var FACULTY_MARKDOWN_FILE = "faculty-summary.md";
var STUDENTS_DIRECTORY = "students";
var createRelativeReportDirectory = (termCode, assignmentSlug) => toForwardSlashPath(path13.join(TERMS_DIRECTORY6, termCode, REPORTS_DIRECTORY, assignmentSlug));
var createPathPair = (repoRoot, relativePath) => ({
  absolutePath: path13.join(repoRoot, relativePath),
  relativePath: toForwardSlashPath(relativePath)
});
var createReportPaths = (repoRoot, termCode, assignmentSlug) => {
  const reportDirectory = createRelativeReportDirectory(termCode, assignmentSlug);
  return {
    reportDirectory: createPathPair(repoRoot, reportDirectory),
    facultyJson: createPathPair(repoRoot, path13.join(reportDirectory, FACULTY_JSON_FILE)),
    facultyCsv: createPathPair(repoRoot, path13.join(reportDirectory, FACULTY_CSV_FILE)),
    facultyMarkdown: createPathPair(repoRoot, path13.join(reportDirectory, FACULTY_MARKDOWN_FILE))
  };
};
var createStudentReportRelativePath = (termCode, assignmentSlug, section, studentId) => toForwardSlashPath(
  path13.join(
    createRelativeReportDirectory(termCode, assignmentSlug),
    STUDENTS_DIRECTORY,
    section,
    `${studentId}.md`
  )
);

// src/reporting/report-writer.ts
import fs10 from "fs";
import path14 from "path";
var writeReportFiles = (files) => {
  const generatedFiles = [];
  const errors = [];
  for (const file of files) {
    try {
      fs10.mkdirSync(path14.dirname(file.absolutePath), { recursive: true });
      fs10.writeFileSync(file.absolutePath, file.content, "utf8");
      generatedFiles.push(file.relativePath);
    } catch (error) {
      errors.push(
        createConfigDiagnostic(DiagnosticCode.ReportWriteFailed, "Failed to write report file.", {
          path: file.relativePath,
          reason: error instanceof Error ? error.message : "Unknown write failure."
        })
      );
    }
  }
  return {
    generatedFiles,
    warnings: [],
    errors
  };
};

// src/cli/commands/report.command.ts
var COMMAND_NAME14 = "report";
var EMPTY_COUNT19 = 0;
var getCommandStatus2 = (errorCount, generatedFileCount) => {
  if (errorCount === EMPTY_COUNT19) {
    return "success";
  }
  return generatedFileCount > EMPTY_COUNT19 ? "partial_success" : "failure";
};
var createDefaultGitHubClient3 = () => readGitHubToken() === void 0 ? new FakeGitHubClient() : createGitHubClient();
var createReportFiles = (repoRoot, report) => {
  const paths = createReportPaths(
    repoRoot,
    report.assignment.termCode,
    report.assignment.assignmentSlug
  );
  const studentFiles = report.students.map((student) => {
    const relativePath = createStudentReportRelativePath(
      report.assignment.termCode,
      report.assignment.assignmentSlug,
      student.section,
      student.studentId
    );
    return {
      absolutePath: path15.join(repoRoot, relativePath),
      relativePath,
      content: renderStudentMarkdownReport(report.assignment, student)
    };
  });
  return [
    {
      absolutePath: paths.facultyJson.absolutePath,
      relativePath: paths.facultyJson.relativePath,
      content: renderFacultyJsonReport(report)
    },
    {
      absolutePath: paths.facultyCsv.absolutePath,
      relativePath: paths.facultyCsv.relativePath,
      content: renderFacultyCsvReport(report)
    },
    {
      absolutePath: paths.facultyMarkdown.absolutePath,
      relativePath: paths.facultyMarkdown.relativePath,
      content: renderFacultyMarkdownReport(report)
    },
    ...studentFiles
  ];
};
var runReportCommand = async ({
  cwd,
  assignmentFile,
  options,
  publishStudentReports: publishStudentReports2 = false,
  githubClient,
  clock = systemClock
}) => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });
  if (configResult.status === "failure") {
    return createCommandResult({
      commandName: COMMAND_NAME14,
      assignmentFile,
      status: "failure",
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: { options }
    });
  }
  const rosterResult = loadAssignmentRosters(configResult.config);
  if (rosterResult.errors.length > EMPTY_COUNT19) {
    return createCommandResult({
      commandName: COMMAND_NAME14,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: rosterResult.warnings,
      errors: rosterResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary
      }
    });
  }
  const manifestPath = createManifestPath(
    configResult.config.summary.repoRoot,
    configResult.config.summary.termCode,
    configResult.config.summary.assignmentSlug
  );
  const manifestResult = loadManifest(manifestPath.absolutePath, { required: true });
  if (manifestResult.status !== "loaded") {
    return createCommandResult({
      commandName: COMMAND_NAME14,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: manifestResult.warnings,
      errors: manifestResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        manifestFile: manifestPath.relativePath
      }
    });
  }
  const activeGitHubClient = githubClient ?? createDefaultGitHubClient3();
  const collectResult = await collectReport({
    config: configResult.config,
    rosterSummary: rosterResult.summary,
    students: rosterResult.students,
    manifest: manifestResult.manifest,
    githubClient: activeGitHubClient,
    generatedAt: clock.now().toISOString(),
    includeArtifactFileKeys: options.verbose
  });
  const writeResult = writeReportFiles(
    createReportFiles(configResult.config.summary.repoRoot, collectResult.report)
  );
  const publishResult = publishStudentReports2 && writeResult.errors.length === EMPTY_COUNT19 ? await publishStudentReports({
    report: collectResult.report,
    githubClient: activeGitHubClient,
    studentPublishConfig: configResult.config.course.reports.student_publish
  }) : {
    publishedFiles: [],
    warnings: [],
    errors: [],
    studentsReported: collectResult.report.students.length,
    studentsPublished: EMPTY_COUNT19,
    publishFailed: EMPTY_COUNT19,
    publishSkipped: EMPTY_COUNT19
  };
  const commandStatus = publishResult.errors.length > EMPTY_COUNT19 ? getCommandStatus2(publishResult.errors.length, publishResult.studentsPublished) : getCommandStatus2(writeResult.errors.length, writeResult.generatedFiles.length);
  return createCommandResult({
    commandName: COMMAND_NAME14,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: commandStatus,
    warnings: [
      ...rosterResult.warnings,
      ...collectResult.report.warnings,
      ...writeResult.warnings,
      ...publishResult.warnings
    ],
    errors: [...writeResult.errors, ...publishResult.errors],
    generatedFiles: writeResult.generatedFiles,
    summary: {
      options,
      publishStudentReports: publishStudentReports2,
      ...configResult.config.summary,
      ...rosterResult.summary,
      manifestFile: manifestPath.relativePath,
      reportFileCount: writeResult.generatedFiles.length,
      publishedFiles: publishResult.publishedFiles,
      studentsReported: publishResult.studentsReported,
      studentsPublished: publishResult.studentsPublished,
      publishFailed: publishResult.publishFailed,
      publishSkipped: publishResult.publishSkipped,
      ...collectResult.report.summary
    }
  });
};
var registerReportCommand = (program) => {
  program.command(COMMAND_NAME14).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").option("--publish-student-reports", "Publish per-student reports to student repositories").description("Generate assignment reports.").action(async (assignmentFile, rawOptions) => {
    const options = normalizeCommonCommandOptions(rawOptions);
    const result = await runReportCommand({
      cwd: process.cwd(),
      assignmentFile,
      options,
      publishStudentReports: rawOptions.publishStudentReports === true
    });
    writeCommandResult(result, options.json);
    process.exitCode = result.exitCode;
  });
};

// src/workflows/workflow-compatibility-validation.ts
import fs11 from "fs";
import path16 from "path";
var PRESET_GRADING_MODE3 = "preset";
var getEffectiveGrading9 = (config) => config.assignment.grading ?? config.course.grading;
var createConfiguredWorkflowCandidate = (repoRoot, workflowPath) => {
  return {
    absolutePath: path16.join(repoRoot, workflowPath),
    relativePath: workflowPath
  };
};
var createWorkflowCandidates = (config, grading) => {
  if (grading.workflow === void 0) {
    return [];
  }
  const configuredCandidates = createLocalWorkflowPathCandidates(grading.workflow).map(
    (workflowPath) => createConfiguredWorkflowCandidate(config.summary.repoRoot, workflowPath)
  );
  const generatedCandidate = createGeneratedWorkflowPath(
    config.summary.repoRoot,
    config.summary.termCode,
    config.summary.assignmentSlug
  );
  return grading.mode === PRESET_GRADING_MODE3 ? [...configuredCandidates, generatedCandidate] : configuredCandidates;
};
var findExistingWorkflowCandidate = (candidates) => candidates.find((candidate) => fs11.existsSync(candidate.absolutePath));
var createWorkflowMissingDiagnostic4 = (grading, candidates) => createConfigDiagnostic(
  GRADING_WORKFLOW_MISSING_CODE,
  `Configured grading workflow ${String(grading.workflow)} was not found locally.`,
  {
    workflow: grading.workflow,
    checkedPaths: candidates.map((candidate) => candidate.relativePath)
  }
);
var createWorkflowDispatchUnsupportedDiagnostic = (workflowPath) => createConfigDiagnostic(
  WORKFLOW_DISPATCH_UNSUPPORTED_CODE,
  `Configured grading workflow ${workflowPath} does not include workflow_dispatch.`,
  {
    workflow: workflowPath,
    requiredTrigger: WORKFLOW_DISPATCH_TRIGGER
  }
);
var validateWorkflowCompatibility = (config) => {
  const grading = getEffectiveGrading9(config);
  if (!grading.enabled || grading.workflow === void 0) {
    return {
      warnings: [],
      errors: [],
      workflowStatus: "not_required"
    };
  }
  const candidates = createWorkflowCandidates(config, grading);
  const workflowCandidate = findExistingWorkflowCandidate(candidates);
  if (workflowCandidate === void 0) {
    return {
      warnings: [],
      errors: [createWorkflowMissingDiagnostic4(grading, candidates)],
      workflowStatus: "missing"
    };
  }
  const content = fs11.readFileSync(workflowCandidate.absolutePath, "utf8");
  const parseResult = parseYaml(content, workflowCandidate.relativePath);
  if (parseResult.status === "failure") {
    return {
      warnings: [],
      errors: [parseResult.diagnostic],
      workflowStatus: "invalid"
    };
  }
  return hasWorkflowDispatchTrigger(parseResult.value) ? {
    warnings: [],
    errors: [],
    workflowStatus: "found"
  } : {
    warnings: [],
    errors: [createWorkflowDispatchUnsupportedDiagnostic(workflowCandidate.relativePath)],
    workflowStatus: "invalid"
  };
};

// src/cli/commands/validate.command.ts
var COMMAND_NAME15 = "validate";
var DEFAULT_TEMPLATE_COMMIT_SHA2 = "fake-template-sha";
var README_FILE3 = "README.md";
var createDefaultTemplateRepository2 = (owner, repo, branch) => ({
  owner,
  name: repo,
  fullName: `${owner}/${repo}`,
  id: 1 /* DefaultTemplateRepositoryId */,
  private: true,
  archived: false,
  defaultBranch: branch,
  htmlUrl: `https://github.com/${owner}/${repo}`,
  isTemplate: true,
  branches: [branch],
  files: [README_FILE3],
  latestCommitSha: DEFAULT_TEMPLATE_COMMIT_SHA2
});
var createDefaultGitHubClient4 = (config, students) => {
  if (readGitHubToken() !== void 0) {
    return createGitHubClient();
  }
  const parsedTemplateRepository = parseTemplateRepository(
    config.course.github.organization,
    config.assignment.template.repository
  );
  const templateRepositories = parsedTemplateRepository.status === "success" ? [
    createDefaultTemplateRepository2(
      parsedTemplateRepository.repository.owner,
      parsedTemplateRepository.repository.repo,
      config.assignment.template.branch
    )
  ] : [];
  return new FakeGitHubClient({
    templateRepositories,
    users: students.map((student) => ({ username: student.githubUsername })),
    teams: [
      {
        org: config.course.github.organization,
        slug: config.course.github.faculty_team,
        name: config.course.github.faculty_team
      },
      {
        org: config.course.github.organization,
        slug: config.course.github.grader_team,
        name: config.course.github.grader_team
      }
    ]
  });
};
var runValidateCommand = async ({
  cwd,
  assignmentFile,
  options,
  githubClient
}) => {
  const configResult = loadGraiderConfig({
    cwd,
    assignmentFile
  });
  if (configResult.status === "failure") {
    return createCommandResult({
      commandName: COMMAND_NAME15,
      assignmentFile,
      status: "failure",
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: {
        options
      }
    });
  }
  const rosterResult = loadAssignmentRosters(configResult.config);
  if (rosterResult.errors.length > 0) {
    return createCommandResult({
      commandName: COMMAND_NAME15,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: rosterResult.warnings,
      errors: rosterResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary
      }
    });
  }
  const workflowCompatibilityResult = validateWorkflowCompatibility(configResult.config);
  if (workflowCompatibilityResult.errors.length > 0 && workflowCompatibilityResult.workflowStatus !== "missing") {
    return createCommandResult({
      commandName: COMMAND_NAME15,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [...rosterResult.warnings, ...workflowCompatibilityResult.warnings],
      errors: workflowCompatibilityResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        workflowCompatibilityChecked: true
      }
    });
  }
  const readinessResult = await validateGitHubReadiness({
    courseConfig: configResult.config.course,
    termConfig: configResult.config.term,
    assignmentConfig: configResult.config.assignment,
    students: rosterResult.students,
    githubClient: githubClient ?? createDefaultGitHubClient4(configResult.config, rosterResult.students),
    validateTemplateWorkflow: workflowCompatibilityResult.workflowStatus === "missing"
  });
  if (readinessResult.errors.length > 0) {
    return createCommandResult({
      commandName: COMMAND_NAME15,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      warnings: [
        ...rosterResult.warnings,
        ...workflowCompatibilityResult.warnings,
        ...readinessResult.warnings
      ],
      errors: readinessResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary,
        workflowCompatibilityChecked: true,
        githubReadinessChecked: true
      }
    });
  }
  return createCommandResult({
    commandName: COMMAND_NAME15,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: "success",
    warnings: [
      ...rosterResult.warnings,
      ...workflowCompatibilityResult.warnings,
      ...readinessResult.warnings
    ],
    errors: [],
    generatedFiles: [],
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
      workflowCompatibilityChecked: true,
      githubReadinessChecked: true
    }
  });
};
var registerValidateCommand = (program) => {
  program.command(COMMAND_NAME15).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").description("Validate assignment configuration.").action(async (assignmentFile, rawOptions) => {
    const options = normalizeCommonCommandOptions(rawOptions);
    const result = await runValidateCommand({
      cwd: process.cwd(),
      assignmentFile,
      options
    });
    writeCommandResult(result, options.json);
    process.exitCode = result.exitCode;
  });
};

// src/cli/commands/workflow.command.ts
import path18 from "path";

// src/workflows/result-writer-template.ts
var RESULT_SCHEMA_VERSION = 1;
var RESULT_SCHEMA_VERSION_TEXT = String(RESULT_SCHEMA_VERSION);
var RESULT_WRITER_SCRIPT_PATH = ".graider/write-grading-result.py";
var renderGradingResultWriterScript = () => `#!/usr/bin/env python3
import argparse
import base64
import json
import os
import sys

SCHEMA_VERSION = ${RESULT_SCHEMA_VERSION_TEXT}
STATUS_PASSED = "passed"
STATUS_FAILED = "failed"
STATUS_SKIPPED = "skipped"
STATUS_MAP = {
    "pass": STATUS_PASSED,
    "passed": STATUS_PASSED,
    "success": STATUS_PASSED,
    "fail": STATUS_FAILED,
    "failed": STATUS_FAILED,
    "failure": STATUS_FAILED,
    "error": STATUS_FAILED,
    "cancelled": STATUS_FAILED,
    "timed_out": STATUS_FAILED,
    "timed-out": STATUS_FAILED,
    "skip": STATUS_SKIPPED,
    "skipped": STATUS_SKIPPED,
}


def map_status(value):
    normalized = (value or "").strip().lower()
    return STATUS_MAP.get(normalized, STATUS_FAILED)


def decode_classroom_result(encoded):
    if not encoded:
        return None

    try:
        decoded_bytes = base64.b64decode(encoded)
        decoded_text = decoded_bytes.decode("utf-8")
        return json.loads(decoded_text)
    except Exception:
        return None


def status_from_classroom_or_outcome(classroom_env_name, outcome_env_name):
    classroom_result = decode_classroom_result(os.environ.get(classroom_env_name))

    if isinstance(classroom_result, dict):
        top_level_status = classroom_result.get("status")
        if top_level_status:
            return map_status(top_level_status)

        tests = classroom_result.get("tests")
        if isinstance(tests, list) and tests:
            test_statuses = [
                map_status(test.get("status"))
                for test in tests
                if isinstance(test, dict)
            ]

            if STATUS_FAILED in test_statuses:
                return STATUS_FAILED

            if test_statuses and all(status == STATUS_SKIPPED for status in test_statuses):
                return STATUS_SKIPPED

            if test_statuses:
                return STATUS_PASSED

    return map_status(os.environ.get(outcome_env_name))


def parse_check(raw_check):
    name, separator, outcome = raw_check.partition("=")
    normalized_name = name.strip()
    if not normalized_name:
        raise ValueError("check name must not be empty")
    normalized_outcome = outcome if separator else ""
    return {
        "name": normalized_name,
        "status": map_status(normalized_outcome),
    }


def parse_classroom_check(raw_check):
    name, separator, env_names = raw_check.partition("=")
    normalized_name = name.strip()
    if not normalized_name:
        raise ValueError("check name must not be empty")
    if not separator:
        raise ValueError("classroom check must include environment variable names")
    classroom_env_name, env_separator, outcome_env_name = env_names.partition(":")
    if not env_separator or not classroom_env_name.strip() or not outcome_env_name.strip():
        raise ValueError("classroom check must include classroom and outcome environment names")
    return {
        "name": normalized_name,
        "status": status_from_classroom_or_outcome(
            classroom_env_name.strip(),
            outcome_env_name.strip(),
        ),
    }


def compute_overall_status(checks):
    if not checks:
        return STATUS_SKIPPED
    statuses = [check["status"] for check in checks]
    if STATUS_FAILED in statuses:
        return STATUS_FAILED
    if all(status == STATUS_SKIPPED for status in statuses):
        return STATUS_SKIPPED
    return STATUS_PASSED


def write_result(output_path, checks):
    parent = os.path.dirname(output_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    result = {
        "schema_version": SCHEMA_VERSION,
        "status": compute_overall_status(checks),
        "checks": checks,
    }
    with open(output_path, "w", encoding="utf-8") as output_file:
        json.dump(result, output_file, indent=2)
        output_file.write("\\n")


def main(argv):
    parser = argparse.ArgumentParser(description="Write Graider grading result JSON.")
    parser.add_argument("--output", required=True)
    parser.add_argument("--check", action="append", default=[])
    parser.add_argument("--classroom-check", action="append", default=[])
    args = parser.parse_args(argv)

    try:
        checks = [
            *[parse_check(raw_check) for raw_check in args.check],
            *[parse_classroom_check(raw_check) for raw_check in args.classroom_check],
        ]
        write_result(args.output, checks)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
`;

// src/workflows/java-junit-checkstyle-workflow.ts
var JAVA_JUNIT_CHECKSTYLE_PRESET = "java-junit-checkstyle";
var WORKFLOW_NAME = "AutoGrading Tests";
var JAVA_VERSION = "25";
var JAVA_DISTRIBUTION = "oracle";
var CHECKSTYLE_VERSION = "13.4.1";
var CHECKSTYLE_CONFIG_URL = "https://csse.msoe.us/csc1110/MSOE_checkStyle.xml";
var JUNIT_PLATFORM_CONSOLE_VERSION = "6.1.0";
var MOCKITO_VERSION = "5.18.0";
var BYTE_BUDDY_VERSION = "1.17.5";
var JAVAFX_VERSION = "25";
var OUTPUT_DIRECTORY = "graider-output";
var indentWorkflowRunLine = (line) => `          ${line}`;
var renderResultWriterInstallLines = () => renderGradingResultWriterScript().trimEnd().split("\n").map(indentWorkflowRunLine);
var createResultOutputPath = (resultFile) => resultFile.includes("/") ? resultFile : `${OUTPUT_DIRECTORY}/${resultFile}`;
var renderJavaJunitCheckstyleWorkflow = ({
  grading
}) => {
  const artifactName = grading.artifact ?? "grading-results";
  const resultFile = grading.result_file ?? "grading-results.json";
  const resultOutputPath = createResultOutputPath(resultFile);
  return [
    `name: ${WORKFLOW_NAME}`,
    "",
    "on:",
    "  - push",
    "  - repository_dispatch",
    "  - workflow_dispatch",
    "",
    "permissions:",
    "  checks: write",
    "  actions: read",
    "  contents: read",
    "",
    "jobs:",
    "  grade:",
    "    runs-on: ubuntu-latest",
    "    env:",
    `      JAVA_VERSION: "${JAVA_VERSION}"`,
    `      CHECKSTYLE_VERSION: "${CHECKSTYLE_VERSION}"`,
    `      CHECKSTYLE_CONFIG_URL: "${CHECKSTYLE_CONFIG_URL}"`,
    `      JUNIT_PLATFORM_CONSOLE_VERSION: "${JUNIT_PLATFORM_CONSOLE_VERSION}"`,
    `      MOCKITO_VERSION: "${MOCKITO_VERSION}"`,
    `      BYTE_BUDDY_VERSION: "${BYTE_BUDDY_VERSION}"`,
    `      JAVAFX_VERSION: "${JAVAFX_VERSION}"`,
    "      TOOLS_DIR: graider-tools",
    "    steps:",
    "      - name: Check out repository",
    "        uses: actions/checkout@v4",
    "",
    "      - name: Set up Java",
    "        uses: actions/setup-java@v4",
    "        with:",
    `          distribution: ${JAVA_DISTRIBUTION}`,
    "          java-version: ${{ env.JAVA_VERSION }}",
    "",
    "      - name: Install JavaFX headless dependencies",
    "        run: |",
    "          sudo apt-get update",
    "          sudo apt-get install -y unzip xvfb",
    "",
    "      - name: Download grading tools",
    "        run: |",
    '          mkdir -p "$TOOLS_DIR"',
    '          curl -fsSL -o "$TOOLS_DIR/checkstyle.jar" "https://repo1.maven.org/maven2/com/puppycrawl/tools/checkstyle/${CHECKSTYLE_VERSION}/checkstyle-${CHECKSTYLE_VERSION}-all.jar"',
    '          curl -fsSL -o "$TOOLS_DIR/junit-platform-console-standalone.jar" "https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/${JUNIT_PLATFORM_CONSOLE_VERSION}/junit-platform-console-standalone-${JUNIT_PLATFORM_CONSOLE_VERSION}.jar"',
    '          curl -fsSL -o "$TOOLS_DIR/mockito-core.jar" "https://repo1.maven.org/maven2/org/mockito/mockito-core/${MOCKITO_VERSION}/mockito-core-${MOCKITO_VERSION}.jar"',
    '          curl -fsSL -o "$TOOLS_DIR/byte-buddy.jar" "https://repo1.maven.org/maven2/net/bytebuddy/byte-buddy/${BYTE_BUDDY_VERSION}/byte-buddy-${BYTE_BUDDY_VERSION}.jar"',
    '          curl -fsSL -o "$TOOLS_DIR/byte-buddy-agent.jar" "https://repo1.maven.org/maven2/net/bytebuddy/byte-buddy-agent/${BYTE_BUDDY_VERSION}/byte-buddy-agent-${BYTE_BUDDY_VERSION}.jar"',
    '          curl -fsSL -o "$TOOLS_DIR/javafx.zip" "https://download2.gluonhq.com/openjfx/${JAVAFX_VERSION}/openjfx-${JAVAFX_VERSION}_linux-x64_bin-sdk.zip"',
    '          unzip -q "$TOOLS_DIR/javafx.zip" -d "$TOOLS_DIR/javafx"',
    "",
    "      - name: Install Graider result writer",
    "        run: |",
    "          mkdir -p .graider",
    `          cat > ${RESULT_WRITER_SCRIPT_PATH} <<'PY'`,
    ...renderResultWriterInstallLines(),
    "          PY",
    `          chmod +x ${RESULT_WRITER_SCRIPT_PATH}`,
    "",
    "      - name: Run CheckStyle",
    "        id: checkstyle",
    "        continue-on-error: true",
    "        run: |",
    `          java -jar "$TOOLS_DIR/checkstyle.jar" -c "$CHECKSTYLE_CONFIG_URL" $(find src test -name '*.java' -print)`,
    "",
    "      - name: Compile Java sources",
    "        id: compile",
    "        continue-on-error: true",
    "        run: |",
    "          mkdir -p build/classes",
    `          JAVAFX_LIB=$(find "$TOOLS_DIR/javafx" -type d -path '*/lib' | head -n 1)`,
    `          javac --module-path "$JAVAFX_LIB" --add-modules javafx.controls,javafx.fxml -cp "$TOOLS_DIR/junit-platform-console-standalone.jar:$TOOLS_DIR/mockito-core.jar:$TOOLS_DIR/byte-buddy.jar:$TOOLS_DIR/byte-buddy-agent.jar" -d build/classes $(find src test -name '*.java' -print)`,
    "",
    "      - name: Run Unit Tests",
    "        id: unit-tests",
    "        continue-on-error: true",
    "        run: |",
    `          JAVAFX_LIB=$(find "$TOOLS_DIR/javafx" -type d -path '*/lib' | head -n 1)`,
    '          xvfb-run -a java --module-path "$JAVAFX_LIB" --add-modules javafx.controls,javafx.fxml -jar "$TOOLS_DIR/junit-platform-console-standalone.jar" execute --class-path build/classes --scan-class-path',
    "",
    "      - name: Run GitHub Classroom autograding reporter",
    "        if: always()",
    "        continue-on-error: true",
    "        uses: education/autograding@v1",
    "",
    "      - name: Write Graider grading result",
    "        if: always()",
    "        env:",
    "          CHECKSTYLE_CLASSROOM_RESULT: ${{ steps.checkstyle.outputs.result }}",
    "          UNIT_TESTS_CLASSROOM_RESULT: ${{ steps.unit-tests.outputs.result }}",
    "          CHECKSTYLE_OUTCOME: ${{ steps.checkstyle.outcome }}",
    "          UNIT_TESTS_OUTCOME: ${{ steps.unit-tests.outcome }}",
    "        run: |",
    `          python3 ${RESULT_WRITER_SCRIPT_PATH} \\`,
    `            --output ${resultOutputPath} \\`,
    '            --classroom-check "CheckStyle=CHECKSTYLE_CLASSROOM_RESULT:CHECKSTYLE_OUTCOME" \\',
    '            --classroom-check "Unit Tests=UNIT_TESTS_CLASSROOM_RESULT:UNIT_TESTS_OUTCOME"',
    "",
    "      - name: Upload Graider grading result",
    "        if: always()",
    "        uses: actions/upload-artifact@v4",
    "        with:",
    `          name: ${artifactName}`,
    `          path: ${resultOutputPath}`,
    ""
  ].join("\n");
};

// src/workflows/workflow-writer.ts
import fs12 from "fs";
import path17 from "path";
var writeWorkflowFile = ({
  filePath,
  content,
  force
}) => {
  if (!force && fs12.existsSync(filePath)) {
    return {
      status: "failure",
      diagnostic: createConfigDiagnostic(
        GENERATED_WORKFLOW_EXISTS_CODE,
        `Generated workflow already exists at ${filePath}.`,
        {
          filePath
        }
      )
    };
  }
  try {
    fs12.mkdirSync(path17.dirname(filePath), { recursive: true });
    fs12.writeFileSync(filePath, content);
    return {
      status: "success"
    };
  } catch (error) {
    return {
      status: "failure",
      diagnostic: createConfigDiagnostic(
        WORKFLOW_GENERATION_WRITE_FAILED_CODE,
        `Generated workflow could not be written to ${filePath}.`,
        {
          filePath,
          reason: error instanceof Error ? error.message : String(error)
        }
      )
    };
  }
};

// src/cli/commands/workflow.command.ts
var WORKFLOW_COMMAND_NAME = "workflow";
var GENERATE_COMMAND_NAME = "generate";
var COMMAND_NAME16 = "workflow generate";
var PRESET_GRADING_MODE4 = "preset";
var LEGACY_GRADING_MODE7 = "custom-workflow";
var EMPTY_COUNT20 = 0;
var getEffectiveGrading10 = (courseGrading, assignmentGrading) => assignmentGrading ?? courseGrading;
var formatGeneratedFilePath = (repoRoot, absolutePath) => {
  try {
    return toRepositoryRelativePath(repoRoot, absolutePath);
  } catch {
    return toForwardSlashPath(path18.resolve(absolutePath));
  }
};
var resolveOutputPath = (cwd, repoRoot, termCode, assignmentSlug, output) => {
  if (output === void 0) {
    const workflowPath = createGeneratedWorkflowPath(repoRoot, termCode, assignmentSlug);
    return {
      absolutePath: workflowPath.absolutePath,
      reportPath: workflowPath.relativePath
    };
  }
  const absolutePath = path18.isAbsolute(output) ? output : path18.resolve(cwd, output);
  return {
    absolutePath,
    reportPath: formatGeneratedFilePath(repoRoot, absolutePath)
  };
};
var runWorkflowGenerateCommand = ({
  cwd,
  assignmentFile,
  options,
  output,
  force
}) => {
  const configResult = loadGraiderConfig({
    cwd,
    assignmentFile
  });
  if (configResult.status === "failure") {
    return createCommandResult({
      commandName: COMMAND_NAME16,
      assignmentFile,
      status: "failure",
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: {
        options
      }
    });
  }
  const grading = getEffectiveGrading10(
    configResult.config.course.grading,
    configResult.config.assignment.grading
  );
  const assignmentConfigPath = configResult.config.summary.assignmentConfigPath;
  if (!grading.enabled) {
    return createCommandResult({
      commandName: COMMAND_NAME16,
      assignmentFile: assignmentConfigPath,
      status: "failure",
      warnings: [],
      errors: [
        createConfigDiagnostic(
          WORKFLOW_GENERATION_NOT_CONFIGURED_CODE,
          `Workflow generation requires enabled preset grading in ${assignmentConfigPath}.`,
          {
            assignmentFile: assignmentConfigPath
          }
        )
      ],
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary
      }
    });
  }
  const mode = grading.mode ?? LEGACY_GRADING_MODE7;
  if (mode !== PRESET_GRADING_MODE4) {
    return createCommandResult({
      commandName: COMMAND_NAME16,
      assignmentFile: assignmentConfigPath,
      status: "failure",
      warnings: [],
      errors: [
        createConfigDiagnostic(
          WORKFLOW_GENERATION_REQUIRES_PRESET_MODE_CODE,
          `Workflow generation requires grading.mode: ${PRESET_GRADING_MODE4}.`,
          {
            assignmentFile: assignmentConfigPath,
            mode
          }
        )
      ],
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        gradingMode: mode
      }
    });
  }
  if (grading.preset !== JAVA_JUNIT_CHECKSTYLE_PRESET) {
    return createCommandResult({
      commandName: COMMAND_NAME16,
      assignmentFile: assignmentConfigPath,
      status: "failure",
      warnings: [],
      errors: [
        createConfigDiagnostic(
          UNSUPPORTED_GRADING_PRESET_CODE,
          `Unsupported grading preset ${String(grading.preset)} for workflow generation.`,
          {
            assignmentFile: assignmentConfigPath,
            preset: grading.preset,
            supportedPreset: JAVA_JUNIT_CHECKSTYLE_PRESET
          }
        )
      ],
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        gradingMode: mode,
        preset: grading.preset
      }
    });
  }
  const outputPath = resolveOutputPath(
    cwd,
    configResult.config.summary.repoRoot,
    configResult.config.summary.termCode,
    configResult.config.summary.assignmentSlug,
    output
  );
  const writeResult = writeWorkflowFile({
    filePath: outputPath.absolutePath,
    content: renderJavaJunitCheckstyleWorkflow({ grading }),
    force
  });
  const errors = writeResult.status === "failure" ? [writeResult.diagnostic] : [];
  const generatedFiles = errors.length > EMPTY_COUNT20 ? [] : [outputPath.reportPath];
  return createCommandResult({
    commandName: COMMAND_NAME16,
    assignmentFile: assignmentConfigPath,
    status: errors.length > EMPTY_COUNT20 ? "failure" : "success",
    warnings: [],
    errors,
    generatedFiles,
    summary: {
      options,
      ...configResult.config.summary,
      gradingMode: mode,
      preset: grading.preset,
      workflowFile: outputPath.reportPath
    }
  });
};
var registerWorkflowCommand = (program) => {
  const workflowCommand = program.command(WORKFLOW_COMMAND_NAME).description("Generate and manage local grading workflow files.");
  workflowCommand.command(GENERATE_COMMAND_NAME).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").option("--output <path>", "Write workflow to a local output path").option("--force", "Overwrite an existing generated workflow").description("Generate a local grading workflow file.").action((assignmentFile, rawOptions) => {
    const options = normalizeCommonCommandOptions(rawOptions);
    const result = runWorkflowGenerateCommand({
      cwd: process.cwd(),
      assignmentFile,
      options,
      force: rawOptions.force === true,
      ...rawOptions.output === void 0 ? {} : { output: rawOptions.output }
    });
    writeCommandResult(result, options.json);
    process.exitCode = result.exitCode;
  });
};

// src/cli/index.ts
var buildProgram = () => {
  const program = new Command();
  program.name("graider").description("CLI-based GitHub assignment management for course repositories.").version("0.1.0");
  registerValidateCommand(program);
  registerAssignmentCommand(program);
  registerDashboardCommand(program);
  registerPlanCommand(program);
  registerApplyCommand(program);
  registerGradeCommand(program);
  registerReportCommand(program);
  registerWorkflowCommand(program);
  registerArchiveCommand(program);
  registerRemoveAccessCommand(program);
  return program;
};
await buildProgram().parseAsync(process.argv);
export {
  buildProgram
};
