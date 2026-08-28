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
export const UNSUPPORTED_GRADING_MODE_CODE = DiagnosticCode.UnsupportedGradingMode;
export const MISSING_GRADING_WORKFLOW_CODE = DiagnosticCode.MissingGradingWorkflow;
export const MISSING_GRADING_ARTIFACT_CODE = DiagnosticCode.MissingGradingArtifact;
export const MISSING_GRADING_RESULT_FILE_CODE = DiagnosticCode.MissingGradingResultFile;
export const MISSING_GRADING_PRESET_CODE = DiagnosticCode.MissingGradingPreset;
export const UNSUPPORTED_GRADING_PRESET_CODE = DiagnosticCode.UnsupportedGradingPreset;
export const UNSUPPORTED_STUDENT_PUBLISH_MODE_CODE = DiagnosticCode.UnsupportedStudentPublishMode;
export const MISSING_STUDENT_PUBLISH_DESTINATION_CODE =
  DiagnosticCode.MissingStudentPublishDestination;
export const MISSING_STUDENT_PUBLISH_SOURCE_FILE_CODE =
  DiagnosticCode.MissingStudentPublishSourceFile;
export const MISSING_STUDENT_PUBLISH_ARTIFACT_CODE = DiagnosticCode.MissingStudentPublishArtifact;
export const MISSING_GRAIDER_REPORT_DESTINATION_CODE =
  DiagnosticCode.MissingGraiderReportDestination;
export const MISSING_FACULTY_REPORT_SOURCE_CODE = DiagnosticCode.MissingFacultyReportSource;
export const MISSING_FACULTY_REPORT_DESTINATION_CODE =
  DiagnosticCode.MissingFacultyReportDestination;
export const WORKFLOW_GENERATION_NOT_CONFIGURED_CODE =
  DiagnosticCode.WorkflowGenerationNotConfigured;
export const WORKFLOW_GENERATION_REQUIRES_PRESET_MODE_CODE =
  DiagnosticCode.WorkflowGenerationRequiresPresetMode;
export const GENERATED_WORKFLOW_EXISTS_CODE = DiagnosticCode.GeneratedWorkflowExists;
export const WORKFLOW_GENERATION_WRITE_FAILED_CODE = DiagnosticCode.WorkflowGenerationWriteFailed;
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
export const MANIFEST_MISSING_CODE = DiagnosticCode.ManifestMissing;
export const INVALID_MANIFEST_CODE = DiagnosticCode.InvalidManifest;
export const INVALID_MANIFEST_SCHEMA_VERSION_CODE = DiagnosticCode.InvalidManifestSchemaVersion;
export const MISSING_MANIFEST_SECTION_CODE = DiagnosticCode.MissingManifestSection;
export const INVALID_MANIFEST_REPOSITORY_RECORD_CODE =
  DiagnosticCode.InvalidManifestRepositoryRecord;
export const INVALID_MANIFEST_LIFECYCLE_STATUS_CODE = DiagnosticCode.InvalidManifestLifecycleStatus;
export const INVALID_MANIFEST_PERMISSION_CODE = DiagnosticCode.InvalidManifestPermission;
export const MANIFEST_WRITE_FAILED_CODE = DiagnosticCode.ManifestWriteFailed;
export const MUTATION_BLOCKED_CODE = DiagnosticCode.MutationBlocked;
export const CONFIRMATION_REQUIRED_CODE = DiagnosticCode.ConfirmationRequired;
export const MANIFEST_TRACKED_REPOSITORY_MISSING_CODE =
  DiagnosticCode.ManifestTrackedRepositoryMissing;
export const GRADING_WORKFLOW_MISSING_CODE = DiagnosticCode.GradingWorkflowMissing;
export const WORKFLOW_DISPATCH_UNSUPPORTED_CODE = DiagnosticCode.WorkflowDispatchUnsupported;
export const WORKFLOW_DISPATCH_MISSING_CODE = DiagnosticCode.WorkflowDispatchMissing;
export const WORKFLOW_DISPATCH_FAILED_CODE = DiagnosticCode.WorkflowDispatchFailed;
export const PERMISSION_NOT_DOWNGRADED_CODE = DiagnosticCode.PermissionNotDowngraded;
export const UNEXPECTED_COLLABORATOR_PRESERVED_CODE =
  DiagnosticCode.UnexpectedCollaboratorPreserved;
export const GRADING_NOT_CONFIGURED_CODE = DiagnosticCode.GradingNotConfigured;
export const ASSIGNMENT_STATUS_BLOCKS_GRADE_CODE = DiagnosticCode.AssignmentStatusBlocksGrade;
export const TARGET_SELECTOR_MISSING_CODE = DiagnosticCode.TargetSelectorMissing;
export const TARGET_SELECTOR_AMBIGUOUS_CODE = DiagnosticCode.TargetSelectorAmbiguous;
export const TARGET_MATCHES_NO_STUDENTS_CODE = DiagnosticCode.TargetMatchesNoStudents;
export const TARGET_STUDENT_NOT_ACTIVE_CODE = DiagnosticCode.TargetStudentNotActive;
export const STUDENT_REPOSITORY_MISSING_CODE = DiagnosticCode.StudentRepositoryMissing;
export const MANIFEST_REPOSITORY_MISSING_CODE = DiagnosticCode.ManifestRepositoryMissing;
export const INVALID_GRADING_RESULT_CODE = DiagnosticCode.InvalidGradingResult;
export const INVALID_GRADING_RESULT_SCHEMA_VERSION_CODE =
  DiagnosticCode.InvalidGradingResultSchemaVersion;
export const INVALID_GRADING_RESULT_STATUS_CODE = DiagnosticCode.InvalidGradingResultStatus;
export const INVALID_GRADING_CHECK_STATUS_CODE = DiagnosticCode.InvalidGradingCheckStatus;
export const MISSING_GRADING_CHECK_NAME_CODE = DiagnosticCode.MissingGradingCheckName;
export const INVALID_GRADING_SCORE_CODE = DiagnosticCode.InvalidGradingScore;
export const GRADING_WORKFLOW_FAILED_WITH_RESULTS_CODE =
  DiagnosticCode.GradingWorkflowFailedWithResults;
export const REPORT_WRITE_FAILED_CODE = DiagnosticCode.ReportWriteFailed;
export const STUDENT_REPORT_PUBLISH_FAILED_CODE = DiagnosticCode.StudentReportPublishFailed;
export const STUDENT_REPORT_REPOSITORY_MISSING_CODE = DiagnosticCode.StudentReportRepositoryMissing;
export const STUDENT_REPORT_WRITE_FAILED_CODE = DiagnosticCode.StudentReportWriteFailed;
export const STUDENT_REPORT_PUBLISH_PARTIAL_CODE = DiagnosticCode.StudentReportPublishPartial;
export const STUDENT_REPORT_PUBLISH_NOT_REQUESTED_CODE =
  DiagnosticCode.StudentReportPublishNotRequested;
export const DASHBOARD_JSON_REQUIRED_CODE = DiagnosticCode.DashboardJsonRequired;
export const DASHBOARD_TERM_NOT_FOUND_CODE = DiagnosticCode.DashboardTermNotFound;
export const DASHBOARD_TEMPLATE_REPOSITORY_MISSING_CODE =
  DiagnosticCode.DashboardTemplateRepositoryMissing;
export const DASHBOARD_TEMPLATE_BRANCH_MISSING_CODE = DiagnosticCode.DashboardTemplateBranchMissing;
export const DASHBOARD_GRADING_WORKFLOW_MISSING_CODE =
  DiagnosticCode.DashboardGradingWorkflowMissing;
export const DASHBOARD_WORKFLOW_DISPATCH_MISSING_CODE =
  DiagnosticCode.DashboardWorkflowDispatchMissing;
export const DASHBOARD_GITHUB_AUTH_FAILED_CODE = DiagnosticCode.DashboardGithubAuthFailed;
export const DASHBOARD_GITHUB_PERMISSION_DENIED_CODE =
  DiagnosticCode.DashboardGithubPermissionDenied;
export const DASHBOARD_GITHUB_RATE_LIMITED_CODE = DiagnosticCode.DashboardGithubRateLimited;
export const DASHBOARD_GITHUB_REQUEST_FAILED_CODE = DiagnosticCode.DashboardGithubRequestFailed;
export const ASSIGNMENT_DETAIL_JSON_REQUIRED_CODE = DiagnosticCode.AssignmentDetailJsonRequired;
export const GITHUB_TOKEN_REQUIRED_CODE = DiagnosticCode.GithubTokenRequired;
export const ASSIGNMENT_DETAIL_TEMPLATE_REPOSITORY_MISSING_CODE =
  DiagnosticCode.AssignmentDetailTemplateRepositoryMissing;
export const ASSIGNMENT_DETAIL_TEMPLATE_BRANCH_MISSING_CODE =
  DiagnosticCode.AssignmentDetailTemplateBranchMissing;
export const ASSIGNMENT_DETAIL_GRADING_WORKFLOW_MISSING_CODE =
  DiagnosticCode.AssignmentDetailGradingWorkflowMissing;
export const ASSIGNMENT_DETAIL_WORKFLOW_DISPATCH_MISSING_CODE =
  DiagnosticCode.AssignmentDetailWorkflowDispatchMissing;
export const ASSIGNMENT_DETAIL_GITHUB_AUTH_FAILED_CODE =
  DiagnosticCode.AssignmentDetailGithubAuthFailed;
export const ASSIGNMENT_DETAIL_GITHUB_PERMISSION_DENIED_CODE =
  DiagnosticCode.AssignmentDetailGithubPermissionDenied;
export const ASSIGNMENT_DETAIL_GITHUB_RATE_LIMITED_CODE =
  DiagnosticCode.AssignmentDetailGithubRateLimited;
export const ASSIGNMENT_DETAIL_GITHUB_REQUEST_FAILED_CODE =
  DiagnosticCode.AssignmentDetailGithubRequestFailed;
export const ASSIGNMENT_APPLY_PREVIEW_JSON_REQUIRED_CODE =
  DiagnosticCode.AssignmentApplyPreviewJsonRequired;
export const ASSIGNMENT_GRADE_PREVIEW_JSON_REQUIRED_CODE =
  DiagnosticCode.AssignmentGradePreviewJsonRequired;
export const ASSIGNMENT_GRADE_STATUS_JSON_REQUIRED_CODE =
  DiagnosticCode.AssignmentGradeStatusJsonRequired;
export const STUDENT_FILTER_CONFLICT_CODE = DiagnosticCode.StudentFilterConflict;
export const STUDENT_FILTER_EMPTY_CODE = DiagnosticCode.StudentFilterEmpty;
export const STUDENT_FILTER_NO_MATCHES_CODE = DiagnosticCode.StudentFilterNoMatches;
export const STUDENT_FILTER_UNKNOWN_STUDENT_CODE = DiagnosticCode.StudentFilterUnknownStudent;
export const STUDENT_REPOSITORY_STATUS_UNKNOWN_CODE = DiagnosticCode.StudentRepositoryStatusUnknown;
export const GRADING_WORKFLOW_RUN_MISSING_CODE = DiagnosticCode.GradingWorkflowRunMissing;
export const GRADING_WORKFLOW_RUN_IN_PROGRESS_CODE = DiagnosticCode.GradingWorkflowRunInProgress;
export const GRADING_WORKFLOW_RUN_FAILED_CODE = DiagnosticCode.GradingWorkflowRunFailed;
export const GRADING_WORKFLOW_STATUS_UNKNOWN_CODE = DiagnosticCode.GradingWorkflowStatusUnknown;
export const GITHUB_TOKEN_MISSING_CODE = DiagnosticCode.GithubTokenMissing;

export const createNotSupportedInMvpDiagnostic = (
  commandName: string,
  assignmentFile?: string
): Diagnostic => ({
  code: NOT_SUPPORTED_IN_MVP_CODE,
  severity: "error",
  message: `The ${commandName} command is not supported in the MVP placeholder CLI shell.`,
  context: {
    commandName,
    ...(assignmentFile === undefined ? {} : { assignmentFile })
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
