#!/usr/bin/env node

// src/cli/index.ts
import { Command } from "commander";

// src/cli/commands/apply.command.ts
import fs6 from "fs";

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
  WorkflowDispatchUnsupported: "workflow_dispatch_unsupported",
  PermissionNotDowngraded: "permission_not_downgraded",
  UnexpectedCollaboratorPreserved: "unexpected_collaborator_preserved",
  InvalidGradingResult: "invalid_grading_result",
  InvalidGradingResultSchemaVersion: "invalid_grading_result_schema_version",
  InvalidGradingResultStatus: "invalid_grading_result_status",
  InvalidGradingCheckStatus: "invalid_grading_check_status",
  MissingGradingCheckName: "missing_grading_check_name",
  InvalidGradingScore: "invalid_grading_score",
  GradingWorkflowFailedWithResults: "grading_workflow_failed_with_results",
  ReportWriteFailed: "report_write_failed"
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
var PERMISSION_NOT_DOWNGRADED_CODE = DiagnosticCode.PermissionNotDowngraded;
var UNEXPECTED_COLLABORATOR_PRESERVED_CODE = DiagnosticCode.UnexpectedCollaboratorPreserved;
var INVALID_GRADING_RESULT_CODE = DiagnosticCode.InvalidGradingResult;
var INVALID_GRADING_RESULT_SCHEMA_VERSION_CODE = DiagnosticCode.InvalidGradingResultSchemaVersion;
var INVALID_GRADING_RESULT_STATUS_CODE = DiagnosticCode.InvalidGradingResultStatus;
var INVALID_GRADING_CHECK_STATUS_CODE = DiagnosticCode.InvalidGradingCheckStatus;
var MISSING_GRADING_CHECK_NAME_CODE = DiagnosticCode.MissingGradingCheckName;
var INVALID_GRADING_SCORE_CODE = DiagnosticCode.InvalidGradingScore;
var GRADING_WORKFLOW_FAILED_WITH_RESULTS_CODE = DiagnosticCode.GradingWorkflowFailedWithResults;
var REPORT_WRITE_FAILED_CODE = DiagnosticCode.ReportWriteFailed;
var createNotSupportedInMvpDiagnostic = (commandName) => ({
  code: NOT_SUPPORTED_IN_MVP_CODE,
  severity: "error",
  message: `The ${commandName} command is not supported in the MVP placeholder CLI shell.`,
  context: {
    commandName
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
var TERM_CODE_PATTERN = /^\d{2}s[123]$/;
var gradingSchema = z.object({
  enabled: z.boolean(),
  workflow: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  artifact: z.string().min(MINIMUM_LIST_ITEMS).optional(),
  result_file: z.string().min(MINIMUM_LIST_ITEMS).optional()
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
  reports: z.object({
    formats: z.array(z.string().min(MINIMUM_LIST_ITEMS)).min(MINIMUM_LIST_ITEMS)
  }).strict()
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
  grading: gradingSchema.optional()
}).strict();

// src/config/config-validation.ts
var PATH_SEPARATOR = ".";
var WORKFLOW_GRADING_FIELDS = ["workflow", "artifact", "result_file"];
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
var validateGradingConfig = (filePath, grading, owner) => {
  if (grading.enabled && !hasAllWorkflowFields(grading)) {
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
  if (!grading.enabled && hasAnyWorkflowField(grading)) {
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
  ...validateGradingConfig(filePath, config.grading, "course")
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

// src/core/clock.ts
var COLON_PATTERN = /:/gu;
var PERIOD_PATTERN = /\./gu;
var FILESYSTEM_TIMESTAMP_SEPARATOR = "-";
var systemClock = {
  now: () => /* @__PURE__ */ new Date()
};
var formatPlanCreatedAt = (date) => date.toISOString();
var formatFilesystemTimestamp = (date) => date.toISOString().replace(COLON_PATTERN, FILESYSTEM_TIMESTAMP_SEPARATOR).replace(PERIOD_PATTERN, FILESYSTEM_TIMESTAMP_SEPARATOR);

// src/core/command-context.ts
var normalizeCommonCommandOptions = (options) => ({
  json: options.json === true,
  verbose: options.verbose === true,
  yes: options.yes === true
});

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
var hasCodeInSet = (diagnostics, codes) => diagnostics.some((diagnostic) => codes.has(diagnostic.code));
var resolveExitCode = ({ status, errors }) => {
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
  exitCode: resolveExitCode(input)
});
var createSuccessfulPlaceholderResult = (context) => createCommandResult({
  commandName: context.commandName,
  assignmentFile: context.assignmentRelativePath ?? context.assignmentFile,
  status: "success",
  warnings: [],
  errors: [],
  generatedFiles: [],
  summary: {
    placeholder: true,
    options: context.options,
    cwd: context.cwd,
    assignmentPath: context.assignmentPath,
    ...context.repoRoot === void 0 ? {} : { repoRoot: context.repoRoot },
    ...context.assignmentRelativePath === void 0 ? {} : { assignmentRelativePath: context.assignmentRelativePath }
  }
});
var createFailedPlaceholderResult = (context, error) => createCommandResult({
  commandName: context.commandName,
  assignmentFile: context.assignmentRelativePath ?? context.assignmentFile,
  status: "failure",
  warnings: [],
  errors: [error],
  generatedFiles: [],
  summary: {
    placeholder: true,
    options: context.options,
    cwd: context.cwd,
    assignmentPath: context.assignmentPath,
    ...context.repoRoot === void 0 ? {} : { repoRoot: context.repoRoot },
    ...context.assignmentRelativePath === void 0 ? {} : { assignmentRelativePath: context.assignmentRelativePath }
  }
});

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

// src/manifest/manifest-renderer.ts
import fs3 from "fs";
import path4 from "path";
import { stringify } from "yaml";

// src/manifest/manifest-models.ts
var MANIFEST_SCHEMA_VERSION = 1;
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

// src/manifest/manifest-renderer.ts
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
    fs3.mkdirSync(path4.dirname(manifestPath), {
      recursive: true
    });
    fs3.writeFileSync(manifestPath, renderManifestYaml(manifest), "utf8");
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
var EMPTY_COUNT = 0;
var PRIVATE_REPOSITORY = true;
var DEFAULT_ACTIONS_ENABLED = true;
var STUDENT_PERMISSION2 = "push";
var FACULTY_PERMISSION2 = "admin";
var GRADER_PERMISSION2 = "maintain";
var PERMISSION_RANK = {
  none: 0,
  pull: 1,
  triage: 2,
  push: 3,
  maintain: 4,
  admin: 5
};
var createEmptySummary = () => ({
  created: EMPTY_COUNT,
  existing: EMPTY_COUNT,
  verified: EMPTY_COUNT,
  noop: EMPTY_COUNT,
  skipped: EMPTY_COUNT,
  blocked: EMPTY_COUNT,
  failed: EMPTY_COUNT,
  warnings: EMPTY_COUNT,
  errors: EMPTY_COUNT
});
var normalizeGitHubError = (error) => error instanceof GitHubClientError ? createGitHubDiagnostic(error) : createConfigDiagnostic(
  DiagnosticCode.GithubApiError,
  "Unexpected GitHub client failure during apply."
);
var runGitHubOperation = async (input, operation) => withGitHubRetry(operation, input.retryOptions);
var createWorkflowMissingDiagnostic = (operation) => createConfigDiagnostic(
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
var findStudent = (students, operation) => students.find((student) => student.studentId === operation.student_id);
var findManifestRecord = (manifest, operation) => manifest.repositories.find((record) => record.studentId === operation.student_id);
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
var recordWarning = (state, diagnostic) => ({
  ...state,
  warnings: [...state.warnings, diagnostic],
  summary: {
    ...state.summary,
    warnings: state.summary.warnings + 1
  }
});
var recordError = (state, diagnostic) => ({
  ...state,
  errors: [...state.errors, diagnostic],
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
  const student = findStudent(input.students, operation);
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
    const repository = await runGitHubOperation(
      input,
      () => input.githubClient.createRepositoryFromTemplate({
        templateOwner: parsedTemplate.repository.owner,
        templateRepo: parsedTemplate.repository.repo,
        owner: input.config.course.github.organization,
        name: repositoryName,
        private: PRIVATE_REPOSITORY
      })
    );
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
  if (findManifestRecord(state.manifest, operation) === void 0) {
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
  if (findManifestRecord(state.manifest, operation) === void 0) {
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
  if (findManifestRecord(state.manifest, operation) === void 0) {
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
  if (findManifestRecord(state.manifest, operation) === void 0) {
    return incrementSummary(state, "skipped");
  }
  try {
    const workflow = await runGitHubOperation(
      input,
      () => input.githubClient.getWorkflow(
        input.config.course.github.organization,
        repositoryName,
        workflowPath
      )
    );
    if (workflow === null) {
      const diagnostic = createWorkflowMissingDiagnostic(operation);
      return persistManifest(
        recordError(
          {
            ...state,
            manifest: updateActionsState(state.manifest, {
              studentId: operation.student_id ?? "",
              actions: {
                gradingWorkflowPath: workflowPath,
                gradingWorkflowFound: false,
                lastObservedAt: observedAt
              }
            })
          },
          diagnostic
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
  if (findManifestRecord(state.manifest, operation) === void 0) {
    return incrementSummary(state, "skipped");
  }
  try {
    const workflow = await runGitHubOperation(
      input,
      () => input.githubClient.getWorkflow(
        input.config.course.github.organization,
        repositoryName,
        workflowPath
      )
    );
    if (workflow === null || !workflow.supportsDispatch) {
      const diagnostic = createWorkflowDispatchDiagnostic(operation);
      return persistManifest(
        recordError(
          {
            ...state,
            manifest: updateActionsState(state.manifest, {
              studentId: operation.student_id ?? "",
              actions: {
                workflowDispatchSupported: false,
                lastObservedAt: observedAt
              }
            })
          },
          diagnostic
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
    summary: createEmptySummary(),
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
var EMPTY_COUNT2 = 0;
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
  if (hasBlockedOperations || plan.errors.length > EMPTY_COUNT2) {
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
    return this.run(
      "listWorkflowRuns",
      () => this.workflowRuns.filter(
        (record) => repositoryKey(record.owner, record.repo) === repositoryKey(input.owner, input.repo)
      ).filter(
        (record) => input.workflowPath === void 0 || record.run.workflowPath === input.workflowPath
      ).map((record) => record.run)
    );
  }
  downloadArtifact(input) {
    return this.run(
      "downloadArtifact",
      () => this.artifacts.find(
        (record) => repositoryKey(record.owner, record.repo) === repositoryKey(input.owner, input.repo) && record.runId === input.runId && record.artifact.name === input.artifactName
      )?.artifact ?? null
    );
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
  run(method, action) {
    const failure = this.consumeFailure(method);
    if (failure !== void 0) {
      return Promise.reject(createGitHubClientError(failure));
    }
    return Promise.resolve(action());
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

// src/github/github-readiness-validation.ts
var README_FILE = "README.md";
var EMPTY_COUNT3 = 0;
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
var createTemplateBranchMissingDiagnostic = (reference) => createConfigDiagnostic(
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
  ...templateRepository.branches.includes(reference.branch) ? [] : [createTemplateBranchMissingDiagnostic(reference)],
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
  githubClient
}) => {
  const authenticationErrors = await validateAuthentication(githubClient);
  if (authenticationErrors.length > EMPTY_COUNT3) {
    return {
      warnings: [],
      errors: authenticationErrors
    };
  }
  const errors = [
    ...await validateTemplateRepository(courseConfig, assignmentConfig, githubClient),
    ...await validateTeams(courseConfig, githubClient),
    ...await validateGithubUsers(githubClient, students)
  ];
  return {
    warnings: [],
    errors
  };
};

// src/manifest/manifest-loader.ts
import fs4 from "fs";
import { z as z2 } from "zod";
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
var normalizeDiagnostic = (diagnostic) => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.message,
  ...diagnostic.context === void 0 ? {} : { context: diagnostic.context },
  ...diagnostic.observedAt === void 0 ? {} : { observedAt: diagnostic.observedAt }
});
var getIssueCode = (issue) => {
  const pathParts = issue.path.map(String);
  const path13 = pathParts.join(".");
  if (pathParts.length === MINIMUM_ITEMS) {
    return DiagnosticCode.MissingManifestSection;
  }
  if (path13.endsWith("lifecycle.status")) {
    return DiagnosticCode.InvalidManifestLifecycleStatus;
  }
  if (path13.endsWith("permission")) {
    return DiagnosticCode.InvalidManifestPermission;
  }
  if (path13.startsWith("repositories.")) {
    return DiagnosticCode.InvalidManifestRepositoryRecord;
  }
  return DiagnosticCode.InvalidManifest;
};
var validateRawManifest = (filePath, value) => {
  const schemaVersion = z2.looseObject({
    schema_version: z2.number()
  }).safeParse(value);
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
  if (!fs4.existsSync(manifestPath)) {
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
import path5 from "path";
var TERMS_DIRECTORY2 = "terms";
var MANIFESTS_DIRECTORY = "manifests";
var MANIFEST_FILE_NAME = "manifest.yml";
var createManifestPath = (repoRoot, termCode, assignmentSlug) => {
  const relativeDirectory = path5.posix.join(
    TERMS_DIRECTORY2,
    termCode,
    MANIFESTS_DIRECTORY,
    assignmentSlug
  );
  const relativePath = path5.posix.join(relativeDirectory, MANIFEST_FILE_NAME);
  return {
    relativeDirectory,
    relativePath,
    absolutePath: path5.join(repoRoot, relativePath)
  };
};

// src/config/source-fingerprint.ts
import path6 from "path";

// src/core/hash.ts
import { createHash } from "crypto";
import fs5 from "fs";
var SHA_256_ALGORITHM = "sha256";
var HEX_ENCODING = "hex";
var hashStringSha256 = (value) => createHash(SHA_256_ALGORITHM).update(value).digest(HEX_ENCODING);
var hashBufferSha256 = (value) => createHash(SHA_256_ALGORITHM).update(value).digest(HEX_ENCODING);
var hashFileSha256 = (filePath) => {
  if (!fs5.existsSync(filePath)) {
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
  const fileStats = fs5.statSync(filePath);
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
    sha256: hashBufferSha256(fs5.readFileSync(filePath))
  };
};

// src/config/source-fingerprint.ts
var EMPTY_FINGERPRINT = "";
var EMPTY_LENGTH = 0;
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
  const absolutePath = path6.isAbsolute(sourceFilePath) ? path6.resolve(sourceFilePath) : path6.resolve(repoRoot, sourceFilePath);
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
    inputFingerprint: errors.length === EMPTY_LENGTH ? createInputFingerprint(orderedSourceFiles) : EMPTY_FINGERPRINT,
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

// src/roster/roster-models.ts
var ROSTER_STATUS_ACTIVE = "active";
var ROSTER_STATUS_DROPPED = "dropped";
var ROSTER_STATUS_HOLD = "hold";

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

// src/planning/repo-name.ts
var PLACEHOLDER_PATTERN = /\{([a-z_]+)\}/gu;
var REPOSITORY_NAME_PATTERN = /^[a-z0-9-]+$/u;
var HYPHEN = "-";
var CONSECUTIVE_HYPHENS = "--";
var EMPTY_LENGTH2 = 0;
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
    ...repositoryName.length === EMPTY_LENGTH2 ? [createRepositoryNameError(repositoryName, "repository name must not be empty")] : [],
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
  if (patternErrors.length > EMPTY_LENGTH2) {
    return {
      warnings: [],
      errors: patternErrors
    };
  }
  const repositoryName = replacePlaceholders(input).toLowerCase();
  const validationResult = validateRepositoryName(repositoryName);
  if (validationResult.errors.length > EMPTY_LENGTH2) {
    return validationResult;
  }
  return {
    repositoryName,
    warnings: [],
    errors: []
  };
};

// src/planning/plan-builder.ts
var EMPTY_COUNT4 = 0;
var NO_REPOSITORY_NAME = "";
var ACTIVE_ASSIGNMENT_STATUS = "active";
var DRAFT_ASSIGNMENT_STATUS = "draft";
var CLOSED_ASSIGNMENT_STATUS = "closed";
var ARCHIVED_ASSIGNMENT_STATUS = "archived";
var STUDENT_STATUS_REASON_PREFIX = "student_status";
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
var createManifestTrackedMissingDiagnostic = (organization, repositoryName, student) => createConfigDiagnostic(
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
var createLifecycleDiagnostic = (code, message, assignmentStatus, student) => createConfigDiagnostic(code, message, {
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
var createLifecycleBlockedOperation = (config, student, diagnostic, repositoryName) => createOperation(student, "create_repository_from_template", "blocked", {
  repositoryName,
  reason: config.assignment.assignment.status,
  errors: [diagnostic]
});
var buildSkippedStudentOperation = (student) => createOperation(student, "create_repository_from_template", "skipped", {
  reason: `${STUDENT_STATUS_REASON_PREFIX}_${student.status}`
});
var buildLifecycleOperations = (config, student, repositoryName) => {
  const assignmentStatus = config.assignment.assignment.status;
  if (assignmentStatus === DRAFT_ASSIGNMENT_STATUS) {
    return [
      createLifecycleBlockedOperation(
        config,
        student,
        createLifecycleDiagnostic(
          DiagnosticCode.AssignmentNotActive,
          "Draft assignments cannot be applied.",
          assignmentStatus,
          student
        ),
        repositoryName
      )
    ];
  }
  if (assignmentStatus === CLOSED_ASSIGNMENT_STATUS) {
    return [
      createLifecycleBlockedOperation(
        config,
        student,
        createLifecycleDiagnostic(
          DiagnosticCode.AssignmentClosedBlocksCreation,
          "Closed assignments block new repository creation.",
          assignmentStatus,
          student
        ),
        repositoryName
      )
    ];
  }
  if (assignmentStatus === ARCHIVED_ASSIGNMENT_STATUS) {
    return [
      createLifecycleBlockedOperation(
        config,
        student,
        createLifecycleDiagnostic(
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
var findManifestRecord2 = (manifest, student) => manifest?.repositories.find((record) => record.studentId === student.studentId);
var buildActiveStudentOperations = async (config, student, githubClient, manifest) => {
  const repositoryNameResult = generateStudentRepositoryName(config, student);
  if (repositoryNameResult.errors.length > EMPTY_COUNT4) {
    return [
      createOperation(student, "create_repository_from_template", "blocked", {
        errors: repositoryNameResult.errors,
        warnings: repositoryNameResult.warnings
      })
    ];
  }
  const manifestRecord = findManifestRecord2(manifest, student);
  const repositoryName = manifestRecord?.repository.name ?? repositoryNameResult.repositoryName;
  if (config.assignment.assignment.status === DRAFT_ASSIGNMENT_STATUS || config.assignment.assignment.status === ARCHIVED_ASSIGNMENT_STATUS) {
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
              createManifestTrackedMissingDiagnostic(
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
  if (lifecycleOperations.length > EMPTY_COUNT4) {
    return lifecycleOperations;
  }
  if (config.assignment.assignment.status !== ACTIVE_ASSIGNMENT_STATUS) {
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
var createPlanSummary = (rosterSummary, operations) => ({
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
  const summary = createPlanSummary(rosterSummary, operations);
  const blockedPlanErrors = summary.blocked_operations > EMPTY_COUNT4 ? [createPlanBlockedDiagnostic(summary.blocked_operations)] : [];
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
    warnings: sourceFingerprint.warnings,
    errors: [
      ...sourceFingerprint.errors,
      ...collectOperationDiagnostics(operations),
      ...blockedPlanErrors
    ]
  };
};

// src/roster/roster-loader.ts
import path7 from "path";

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
var findDuplicateDiagnostics = (students, getValue2, code, message, valueKey) => {
  const grouped = /* @__PURE__ */ new Map();
  for (const student of students) {
    grouped.set(getValue2(student), [...grouped.get(getValue2(student)) ?? [], student]);
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
var EMPTY_COUNT5 = 0;
var TERM_DIRECTORY_DEPTH = 2;
var MISSING_COLUMN_INDEX = -1;
var createEmptySummary2 = (rosterFiles) => ({
  rosterFiles,
  studentCount: EMPTY_COUNT5,
  activeStudentCount: EMPTY_COUNT5,
  droppedStudentCount: EMPTY_COUNT5,
  holdStudentCount: EMPTY_COUNT5
});
var createSummary2 = (rosterFiles, students) => ({
  rosterFiles,
  studentCount: students.length,
  activeStudentCount: students.filter((student) => student.status === ROSTER_STATUS_ACTIVE).length,
  droppedStudentCount: students.filter((student) => student.status === ROSTER_STATUS_DROPPED).length,
  holdStudentCount: students.filter((student) => student.status === ROSTER_STATUS_HOLD).length
});
var getTermDirectory = (termConfigPath) => termConfigPath.split("/").slice(EMPTY_COUNT5, TERM_DIRECTORY_DEPTH).join("/");
var getSectionSources = (config) => {
  const termDirectory = getTermDirectory(config.summary.termConfigPath);
  const sectionsById = new Map(
    config.term.sections.map((section) => [
      section.id,
      toForwardSlashPath(path7.posix.join(termDirectory, section.roster))
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
  const fileResult = readTextFile(path7.join(repoRoot, source.rosterPath));
  if (fileResult.status === "failure") {
    return {
      students: [],
      warnings: [],
      errors: [fileResult.diagnostic]
    };
  }
  const document = parseCsv(fileResult.content);
  const missingColumnErrors = validateRequiredColumns(source.rosterPath, document.headers);
  if (missingColumnErrors.length > EMPTY_COUNT5) {
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
      return valueByColumn[column].length === EMPTY_COUNT5 ? [createMissingRequiredValueDiagnostic(source.rosterPath, row.rowNumber, column)] : [];
    });
    if (missingValueErrors.length > EMPTY_COUNT5) {
      errors.push(...missingValueErrors);
    } else {
      const normalizedStudentId = normalizeStudentId(rawStudentId, rowContext);
      const normalizedGithubUsername = normalizeGithubUsername(rawGithubUsername, rowContext);
      const normalizedStatus = normalizeRosterStatus(rawStatus, rowContext);
      const rowWarnings = [
        normalizedStudentId.warning,
        normalizedGithubUsername.warning,
        normalizedStatus.warning
      ].filter((warning) => warning !== void 0);
      const rowErrors = [
        ...validateRosterStatus(source.rosterPath, row.rowNumber, normalizedStatus.value),
        ...validateRosterSection(source.rosterPath, row.rowNumber, source.sectionId, rawSection),
        ...validateGithubUsername(source.rosterPath, row.rowNumber, normalizedGithubUsername.value)
      ];
      warnings.push(...rowWarnings);
      errors.push(...rowErrors);
      if (rowErrors.length === EMPTY_COUNT5 && isRosterStatus(normalizedStatus.value)) {
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
    summary: errors.length > EMPTY_COUNT5 ? createEmptySummary2(rosterFiles) : createSummary2(rosterFiles, students)
  };
};

// src/cli/output.ts
var JSON_INDENT_SPACES = 2;
var EMPTY_COLLECTION_LENGTH = 0;
var formatCommandResultAsJson = (result) => JSON.stringify(redactCommandResult(result), void 0, JSON_INDENT_SPACES);
var formatDiagnostic = (diagnostic) => `${diagnostic.code}: ${diagnostic.message}`;
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

// src/cli/commands/apply.command.ts
var COMMAND_NAME = "apply";
var DEFAULT_TEMPLATE_COMMIT_SHA = "fake-template-sha";
var README_FILE2 = "README.md";
var EMPTY_COUNT6 = 0;
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
var createDefaultGitHubClient = (config, students) => {
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
var getExecutionStatus = (errorsLength, summary) => {
  if (errorsLength === EMPTY_COUNT6) {
    return "success";
  }
  const successfulWorkCount = summary.created + summary.existing + summary.verified + summary.noop + summary.skipped;
  return successfulWorkCount > EMPTY_COUNT6 ? "partial_success" : "failure";
};
var runApplyCommand = async ({
  cwd,
  assignmentFile,
  options,
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
      commandName: COMMAND_NAME,
      assignmentFile,
      status: "failure",
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: { options }
    });
  }
  const rosterResult = loadAssignmentRosters(configResult.config);
  if (rosterResult.errors.length > EMPTY_COUNT6) {
    return createCommandResult({
      commandName: COMMAND_NAME,
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
  const effectiveGitHubClient = githubClient ?? createDefaultGitHubClient(configResult.config, rosterResult.students);
  const readinessResult = await validateGitHubReadiness({
    courseConfig: configResult.config.course,
    termConfig: configResult.config.term,
    assignmentConfig: configResult.config.assignment,
    students: rosterResult.students,
    githubClient: effectiveGitHubClient
  });
  if (readinessResult.errors.length > EMPTY_COUNT6) {
    return createCommandResult({
      commandName: COMMAND_NAME,
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
      commandName: COMMAND_NAME,
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
      commandName: COMMAND_NAME,
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
    ...manifestResult.status === "loaded" ? { manifest: manifestResult.manifest } : {},
    manifestPath: manifestPath.absolutePath,
    students: rosterResult.students,
    githubClient: effectiveGitHubClient,
    clock,
    retryOptions: effectiveRetryOptions
  });
  const generatedFiles = fs6.existsSync(manifestPath.absolutePath) ? [manifestPath.relativePath] : [];
  return createCommandResult({
    commandName: COMMAND_NAME,
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
  program.command(COMMAND_NAME).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").description("Apply assignment repository changes.").action(async (assignmentFile, rawOptions) => {
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

// src/cli/commands/placeholder-command.ts
var registerPlaceholderCommand = (program, registration) => {
  program.command(registration.name).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").description(registration.description).action((assignmentFile, rawOptions) => {
    const cwd = process.cwd();
    const assignmentPath = resolveAssignmentPath(cwd, assignmentFile);
    const repositoryRootResult = registration.requireRepositoryRoot ? findRepositoryRoot(cwd) : void 0;
    const context = {
      commandName: registration.name,
      cwd,
      assignmentFile,
      assignmentPath,
      ...repositoryRootResult?.found === true ? {
        repoRoot: repositoryRootResult.repoRoot,
        assignmentRelativePath: toRepositoryRelativePath(
          repositoryRootResult.repoRoot,
          assignmentPath
        )
      } : {},
      options: normalizeCommonCommandOptions(rawOptions)
    };
    const result = repositoryRootResult?.found === false ? createFailedPlaceholderResult(context, repositoryRootResult.diagnostic) : registration.support === "supported-placeholder" ? createSuccessfulPlaceholderResult(context) : createFailedPlaceholderResult(
      context,
      createNotSupportedInMvpDiagnostic(registration.name)
    );
    writeCommandResult(result, context.options.json);
    process.exitCode = result.exitCode;
  });
};

// src/cli/commands/archive.command.ts
var registerArchiveCommand = (program) => {
  registerPlaceholderCommand(program, {
    name: "archive",
    description: "Archive assignment repositories.",
    support: "unsupported-in-mvp",
    requireRepositoryRoot: false
  });
};

// src/cli/commands/grade.command.ts
var registerGradeCommand = (program) => {
  registerPlaceholderCommand(program, {
    name: "grade",
    description: "Run assignment grading.",
    support: "supported-placeholder",
    requireRepositoryRoot: false
  });
};

// src/planning/plan-paths.ts
import path8 from "path";
var TERMS_DIRECTORY3 = "terms";
var PLANS_DIRECTORY = "plans";
var PLAN_FILE_PREFIX = "plan";
var PLAN_FILE_EXTENSION = "json";
var createPlanPath = (repoRoot, termCode, assignmentSlug, clock) => {
  const relativeDirectory = path8.posix.join(
    TERMS_DIRECTORY3,
    termCode,
    PLANS_DIRECTORY,
    assignmentSlug
  );
  const fileName = `${PLAN_FILE_PREFIX}-${formatFilesystemTimestamp(clock.now())}.${PLAN_FILE_EXTENSION}`;
  const relativePath = path8.posix.join(relativeDirectory, fileName);
  return {
    relativeDirectory,
    relativePath,
    absolutePath: path8.join(repoRoot, relativePath)
  };
};

// src/planning/plan-renderer.ts
import fs7 from "fs";
import path9 from "path";

// src/io/stable-json.ts
var JSON_INDENT_SPACES2 = 2;
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
var stringifyStableJson = (value) => JSON.stringify(orderValue(value), void 0, JSON_INDENT_SPACES2);

// src/planning/plan-renderer.ts
var renderPlanJson = (plan) => stringifyStableJson(plan);
var writePlanJsonFile = (plan, absolutePath) => {
  try {
    fs7.mkdirSync(path9.dirname(absolutePath), {
      recursive: true
    });
    fs7.writeFileSync(absolutePath, `${renderPlanJson(plan)}
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
var COMMAND_NAME2 = "plan";
var DEFAULT_TEMPLATE_COMMIT_SHA2 = "fake-template-sha";
var README_FILE3 = "README.md";
var EMPTY_COUNT7 = 0;
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
var createDefaultGitHubClient2 = (config, students) => {
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
      commandName: COMMAND_NAME2,
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
  if (rosterResult.errors.length > EMPTY_COUNT7) {
    return createCommandResult({
      commandName: COMMAND_NAME2,
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
  if (readinessResult.errors.length > EMPTY_COUNT7) {
    return createCommandResult({
      commandName: COMMAND_NAME2,
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
    commandName: COMMAND_NAME2,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: errors.length > EMPTY_COUNT7 ? "failure" : "success",
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
  program.command(COMMAND_NAME2).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").description("Plan assignment provisioning.").action(async (assignmentFile, rawOptions) => {
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
var registerRemoveAccessCommand = (program) => {
  registerPlaceholderCommand(program, {
    name: "remove-access",
    description: "Remove student access from assignment repositories.",
    support: "unsupported-in-mvp",
    requireRepositoryRoot: false
  });
};

// src/cli/commands/report.command.ts
import path12 from "path";

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
var EMPTY_COUNT8 = 0;
var FIRST_SORT_BEFORE_SECOND = -1;
var FIRST_SORT_AFTER_SECOND = 1;
var FIRST_WORKFLOW_RUN_INDEX = 0;
var compareStudents = (left, right) => {
  const sectionComparison = left.section.localeCompare(right.section);
  if (sectionComparison !== EMPTY_COUNT8) {
    return sectionComparison;
  }
  return left.studentId.localeCompare(right.studentId);
};
var compareRuns = (left, right) => {
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedComparison !== EMPTY_COUNT8) {
    return updatedComparison;
  }
  return left.id < right.id ? FIRST_SORT_BEFORE_SECOND : FIRST_SORT_AFTER_SECOND;
};
var findManifestRecord3 = (manifest, student) => manifest.repositories.find(
  (record) => record.studentId === student.studentId && record.section === student.section
);
var normalizeGitHubError4 = (error) => error instanceof GitHubClientError ? createGitHubDiagnostic(error) : {
  code: "github_api_error",
  severity: "error",
  message: "Unexpected GitHub client failure during report collection."
};
var getEffectiveGrading = (config) => config.assignment.grading === void 0 ? config.course.grading : config.assignment.grading;
var getWorkflowRunStatus = (run) => run === void 0 ? void 0 : run.status;
var getWorkflowRunConclusion = (run) => run === void 0 ? void 0 : run.conclusion;
var createDefaultGrading = () => ({
  workflowStatus: "unknown",
  resultStatus: "unknown",
  artifactStatus: "not_checked",
  resultFileStatus: "not_checked",
  checks: []
});
var collectStudentGrading = async (input, record, repositoryStatus) => {
  const gradingConfig = getEffectiveGrading(input.config);
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
  const workflow = await input.githubClient.getWorkflow(
    record.repository.owner,
    record.repository.name,
    gradingConfig.workflow
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
    workflowPath: gradingConfig.workflow
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
  const resultText = artifact?.files[gradingConfig.result_file];
  const resultFileStatus = artifact === null ? "not_checked" : resultText === void 0 ? "missing" : "valid";
  const validationResult = resultText === void 0 ? void 0 : parseGradingResultsJsonText(resultText);
  const finalResultFileStatus = validationResult === void 0 || validationResult.errors.length === EMPTY_COUNT8 ? resultFileStatus : "invalid";
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
      commitSha: workflowRun.headSha
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
  const record = findManifestRecord3(input.manifest, student);
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
      ...record?.repository.name === void 0 ? {} : { repositoryName: record.repository.name },
      ...record?.repository.htmlUrl === void 0 ? {} : { repositoryUrl: record.repository.htmlUrl },
      repositoryStatus: "missing",
      grading: createDefaultGrading(),
      warnings,
      errors: [...errors, normalizeGitHubError4(error)]
    };
  }
};
var countResultStatus = (students, status) => students.filter((student) => student.grading.resultStatus === status).length;
var countDiagnostics = (students, fieldName) => students.reduce((total, student) => total + student[fieldName].length, EMPTY_COUNT8);
var createSummary3 = (rosterSummary, students) => ({
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
      summary: createSummary3(input.rosterSummary, students),
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
var NEWLINE = "\n";
var CSV_NEEDS_QUOTES_PATTERN = /[",\n\r]/;
var renderDiagnosticCodes = (diagnostics) => diagnostics.map((diagnostic) => diagnostic.code).join(";");
var renderValue = (value) => {
  const rawValue = value === void 0 || value === null ? EMPTY_FIELD2 : String(value);
  const escaped = rawValue.replaceAll(QUOTE2, ESCAPED_QUOTE);
  return CSV_NEEDS_QUOTES_PATTERN.test(escaped) ? `${QUOTE2}${escaped}${QUOTE2}` : escaped;
};
var createRow = (student) => [
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
  ...report.students.map((student) => createRow(student).map(renderValue).join(COMMA2))
].join(NEWLINE) + NEWLINE;

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
var EMPTY_DISPLAY = "";
var NEWLINE2 = "\n";
var escapeCell = (value) => value.replaceAll("|", "\\|");
var formatCount = (value) => String(value);
var diagnosticCodes = (diagnostics) => diagnostics.map((diagnostic) => diagnostic.code).join("; ");
var renderRepository = (student) => {
  if (student.repositoryName === void 0) {
    return EMPTY_DISPLAY;
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
  diagnosticCodes(student.warnings),
  diagnosticCodes(student.errors)
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
].join(NEWLINE2);

// src/reporting/report-paths.ts
import path10 from "path";
var TERMS_DIRECTORY4 = "terms";
var REPORTS_DIRECTORY = "reports";
var FACULTY_JSON_FILE = "faculty-summary.json";
var FACULTY_CSV_FILE = "faculty-summary.csv";
var FACULTY_MARKDOWN_FILE = "faculty-summary.md";
var STUDENTS_DIRECTORY = "students";
var createRelativeReportDirectory = (termCode, assignmentSlug) => toForwardSlashPath(path10.join(TERMS_DIRECTORY4, termCode, REPORTS_DIRECTORY, assignmentSlug));
var createPathPair = (repoRoot, relativePath) => ({
  absolutePath: path10.join(repoRoot, relativePath),
  relativePath: toForwardSlashPath(relativePath)
});
var createReportPaths = (repoRoot, termCode, assignmentSlug) => {
  const reportDirectory = createRelativeReportDirectory(termCode, assignmentSlug);
  return {
    reportDirectory: createPathPair(repoRoot, reportDirectory),
    facultyJson: createPathPair(repoRoot, path10.join(reportDirectory, FACULTY_JSON_FILE)),
    facultyCsv: createPathPair(repoRoot, path10.join(reportDirectory, FACULTY_CSV_FILE)),
    facultyMarkdown: createPathPair(repoRoot, path10.join(reportDirectory, FACULTY_MARKDOWN_FILE))
  };
};
var createStudentReportRelativePath = (termCode, assignmentSlug, section, studentId) => toForwardSlashPath(
  path10.join(
    createRelativeReportDirectory(termCode, assignmentSlug),
    STUDENTS_DIRECTORY,
    section,
    `${studentId}.md`
  )
);

// src/reporting/report-writer.ts
import fs8 from "fs";
import path11 from "path";
var writeReportFiles = (files) => {
  const generatedFiles = [];
  const errors = [];
  for (const file of files) {
    try {
      fs8.mkdirSync(path11.dirname(file.absolutePath), { recursive: true });
      fs8.writeFileSync(file.absolutePath, file.content, "utf8");
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

// src/reporting/student-markdown-renderer.ts
var NEWLINE3 = "\n";
var EMPTY_DISPLAY2 = "";
var diagnosticCodes2 = (diagnostics) => diagnostics.map((diagnostic) => diagnostic.code).join("; ");
var formatNullableNumber = (value) => value === void 0 || value === null ? EMPTY_DISPLAY2 : String(value);
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
    const points = check.pointsEarned === void 0 && check.pointsPossible === void 0 ? EMPTY_DISPLAY2 : `${formatNullableNumber(check.pointsEarned)}/${formatNullableNumber(check.pointsPossible)}`;
    return `| ${check.name} | ${check.status} | ${points} | ${check.message ?? EMPTY_DISPLAY2} |`;
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
  `Warnings: ${diagnosticCodes2(student.warnings)}`,
  `Errors: ${diagnosticCodes2(student.errors)}`,
  ""
].join(NEWLINE3);

// src/cli/commands/report.command.ts
var COMMAND_NAME3 = "report";
var EMPTY_COUNT9 = 0;
var getCommandStatus = (errorCount, generatedFileCount) => {
  if (errorCount === EMPTY_COUNT9) {
    return "success";
  }
  return generatedFileCount > EMPTY_COUNT9 ? "partial_success" : "failure";
};
var createDefaultGitHubClient3 = () => new FakeGitHubClient();
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
      absolutePath: path12.join(repoRoot, relativePath),
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
  githubClient,
  clock = systemClock
}) => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });
  if (configResult.status === "failure") {
    return createCommandResult({
      commandName: COMMAND_NAME3,
      assignmentFile,
      status: "failure",
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: { options }
    });
  }
  const rosterResult = loadAssignmentRosters(configResult.config);
  if (rosterResult.errors.length > EMPTY_COUNT9) {
    return createCommandResult({
      commandName: COMMAND_NAME3,
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
      commandName: COMMAND_NAME3,
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
  const collectResult = await collectReport({
    config: configResult.config,
    rosterSummary: rosterResult.summary,
    students: rosterResult.students,
    manifest: manifestResult.manifest,
    githubClient: githubClient ?? createDefaultGitHubClient3(),
    generatedAt: clock.now().toISOString()
  });
  const writeResult = writeReportFiles(
    createReportFiles(configResult.config.summary.repoRoot, collectResult.report)
  );
  return createCommandResult({
    commandName: COMMAND_NAME3,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: getCommandStatus(writeResult.errors.length, writeResult.generatedFiles.length),
    warnings: [...rosterResult.warnings, ...collectResult.report.warnings, ...writeResult.warnings],
    errors: writeResult.errors,
    generatedFiles: writeResult.generatedFiles,
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
      manifestFile: manifestPath.relativePath,
      reportFileCount: writeResult.generatedFiles.length,
      ...collectResult.report.summary
    }
  });
};
var registerReportCommand = (program) => {
  program.command(COMMAND_NAME3).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").description("Generate assignment reports.").action(async (assignmentFile, rawOptions) => {
    const options = normalizeCommonCommandOptions(rawOptions);
    const result = await runReportCommand({
      cwd: process.cwd(),
      assignmentFile,
      options
    });
    writeCommandResult(result, options.json);
    process.exitCode = result.exitCode;
  });
};

// src/cli/commands/validate.command.ts
var COMMAND_NAME4 = "validate";
var DEFAULT_TEMPLATE_COMMIT_SHA3 = "fake-template-sha";
var README_FILE4 = "README.md";
var createDefaultTemplateRepository3 = (owner, repo, branch) => ({
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
  files: [README_FILE4],
  latestCommitSha: DEFAULT_TEMPLATE_COMMIT_SHA3
});
var createDefaultGitHubClient4 = (config, students) => {
  const parsedTemplateRepository = parseTemplateRepository(
    config.course.github.organization,
    config.assignment.template.repository
  );
  const templateRepositories = parsedTemplateRepository.status === "success" ? [
    createDefaultTemplateRepository3(
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
      commandName: COMMAND_NAME4,
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
      commandName: COMMAND_NAME4,
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
  const readinessResult = await validateGitHubReadiness({
    courseConfig: configResult.config.course,
    termConfig: configResult.config.term,
    assignmentConfig: configResult.config.assignment,
    students: rosterResult.students,
    githubClient: githubClient ?? createDefaultGitHubClient4(configResult.config, rosterResult.students)
  });
  if (readinessResult.errors.length > 0) {
    return createCommandResult({
      commandName: COMMAND_NAME4,
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
  return createCommandResult({
    commandName: COMMAND_NAME4,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: "success",
    warnings: [...rosterResult.warnings, ...readinessResult.warnings],
    errors: [],
    generatedFiles: [],
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary,
      githubReadinessChecked: true
    }
  });
};
var registerValidateCommand = (program) => {
  program.command(COMMAND_NAME4).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").description("Validate assignment configuration.").action(async (assignmentFile, rawOptions) => {
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

// src/cli/index.ts
var buildProgram = () => {
  const program = new Command();
  program.name("graider").description("CLI-based GitHub assignment management for course repositories.").version("0.1.0");
  registerValidateCommand(program);
  registerPlanCommand(program);
  registerApplyCommand(program);
  registerGradeCommand(program);
  registerReportCommand(program);
  registerArchiveCommand(program);
  registerRemoveAccessCommand(program);
  return program;
};
await buildProgram().parseAsync();
export {
  buildProgram
};
