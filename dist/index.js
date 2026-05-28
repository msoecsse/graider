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
  SourceFingerprintFailed: "source_fingerprint_failed"
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
  DiagnosticCode.InvalidGradingConfig
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

// src/core/command-context.ts
var normalizeCommonCommandOptions = (options) => ({
  json: options.json === true,
  verbose: options.verbose === true,
  yes: options.yes === true
});

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
import fs from "fs";
import path2 from "path";
var COURSE_CONFIG_FILE_NAME = "course.yml";
var isFile = (filePath) => {
  try {
    return fs.statSync(filePath).isFile();
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

// src/cli/commands/apply.command.ts
var registerApplyCommand = (program) => {
  registerPlaceholderCommand(program, {
    name: "apply",
    description: "Apply assignment repository changes.",
    support: "supported-placeholder",
    requireRepositoryRoot: false
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

// src/cli/commands/plan.command.ts
var registerPlanCommand = (program) => {
  registerPlaceholderCommand(program, {
    name: "plan",
    description: "Create an assignment execution plan.",
    support: "supported-placeholder",
    requireRepositoryRoot: false
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
var registerReportCommand = (program) => {
  registerPlaceholderCommand(program, {
    name: "report",
    description: "Generate assignment reports.",
    support: "supported-placeholder",
    requireRepositoryRoot: false
  });
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
import fs2 from "fs";
var readTextFile = (filePath) => {
  try {
    return {
      status: "success",
      content: fs2.readFileSync(filePath, "utf8")
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

// src/github/github-errors.ts
var DIAGNOSTIC_CODE_BY_KIND = {
  auth_missing: DiagnosticCode.GithubAuthMissing,
  auth_failed: DiagnosticCode.GithubAuthFailed,
  permission_denied: DiagnosticCode.GithubPermissionDenied,
  rate_limited: DiagnosticCode.GithubRateLimited,
  network_error: DiagnosticCode.GithubNetworkError,
  api_error: DiagnosticCode.GithubApiError
};
var RETRYABLE_ERROR_KINDS = /* @__PURE__ */ new Set([
  "rate_limited",
  "network_error",
  "api_error"
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

// src/github/fake-github-client.ts
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
var EMPTY_COUNT = 0;
var createUnexpectedGitHubDiagnostic = () => createConfigDiagnostic(
  DiagnosticCode.GithubApiError,
  "Unexpected GitHub client failure during readiness validation."
);
var normalizeGitHubError = (error) => error instanceof GitHubClientError ? createGitHubDiagnostic(error) : createUnexpectedGitHubDiagnostic();
var validateAuthentication = async (githubClient) => {
  try {
    await githubClient.getAuthenticatedUser();
    return [];
  } catch (error) {
    return [normalizeGitHubError(error)];
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
    return [normalizeGitHubError(error)];
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
    return [normalizeGitHubError(error)];
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
    return [normalizeGitHubError(error)];
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
  if (authenticationErrors.length > EMPTY_COUNT) {
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

// src/roster/roster-loader.ts
import path4 from "path";

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

// src/roster/roster-models.ts
var ROSTER_STATUS_ACTIVE = "active";
var ROSTER_STATUS_DROPPED = "dropped";
var ROSTER_STATUS_HOLD = "hold";

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
var CONSECUTIVE_HYPHENS = "--";
var HYPHEN = "-";
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
  const isValid = githubUsername.length > 0 && githubUsername.length <= GITHUB_USERNAME_MAX_LENGTH && GITHUB_USERNAME_PATTERN.test(githubUsername) && !githubUsername.startsWith(HYPHEN) && !githubUsername.endsWith(HYPHEN) && !githubUsername.includes(CONSECUTIVE_HYPHENS);
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
var EMPTY_COUNT2 = 0;
var TERM_DIRECTORY_DEPTH = 2;
var MISSING_COLUMN_INDEX = -1;
var createEmptySummary = (rosterFiles) => ({
  rosterFiles,
  studentCount: EMPTY_COUNT2,
  activeStudentCount: EMPTY_COUNT2,
  droppedStudentCount: EMPTY_COUNT2,
  holdStudentCount: EMPTY_COUNT2
});
var createSummary2 = (rosterFiles, students) => ({
  rosterFiles,
  studentCount: students.length,
  activeStudentCount: students.filter((student) => student.status === ROSTER_STATUS_ACTIVE).length,
  droppedStudentCount: students.filter((student) => student.status === ROSTER_STATUS_DROPPED).length,
  holdStudentCount: students.filter((student) => student.status === ROSTER_STATUS_HOLD).length
});
var getTermDirectory = (termConfigPath) => termConfigPath.split("/").slice(EMPTY_COUNT2, TERM_DIRECTORY_DEPTH).join("/");
var getSectionSources = (config) => {
  const termDirectory = getTermDirectory(config.summary.termConfigPath);
  const sectionsById = new Map(
    config.term.sections.map((section) => [
      section.id,
      toForwardSlashPath(path4.posix.join(termDirectory, section.roster))
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
  const fileResult = readTextFile(path4.join(repoRoot, source.rosterPath));
  if (fileResult.status === "failure") {
    return {
      students: [],
      warnings: [],
      errors: [fileResult.diagnostic]
    };
  }
  const document = parseCsv(fileResult.content);
  const missingColumnErrors = validateRequiredColumns(source.rosterPath, document.headers);
  if (missingColumnErrors.length > EMPTY_COUNT2) {
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
      return valueByColumn[column].length === EMPTY_COUNT2 ? [createMissingRequiredValueDiagnostic(source.rosterPath, row.rowNumber, column)] : [];
    });
    if (missingValueErrors.length > EMPTY_COUNT2) {
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
      if (rowErrors.length === EMPTY_COUNT2 && isRosterStatus(normalizedStatus.value)) {
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
    summary: errors.length > EMPTY_COUNT2 ? createEmptySummary(rosterFiles) : createSummary2(rosterFiles, students)
  };
};

// src/cli/commands/validate.command.ts
var COMMAND_NAME = "validate";
var DEFAULT_TEMPLATE_COMMIT_SHA = "fake-template-sha";
var README_FILE2 = "README.md";
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
      commandName: COMMAND_NAME,
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
  const readinessResult = await validateGitHubReadiness({
    courseConfig: configResult.config.course,
    termConfig: configResult.config.term,
    assignmentConfig: configResult.config.assignment,
    students: rosterResult.students,
    githubClient: githubClient ?? createDefaultGitHubClient(configResult.config, rosterResult.students)
  });
  if (readinessResult.errors.length > 0) {
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
  return createCommandResult({
    commandName: COMMAND_NAME,
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
  program.command(COMMAND_NAME).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").description("Validate assignment configuration.").action(async (assignmentFile, rawOptions) => {
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
