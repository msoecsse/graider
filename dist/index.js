#!/usr/bin/env node

// src/cli/index.ts
import { Command } from "commander";

// src/core/command-result.ts
var createSuccessfulPlaceholderResult = (context) => ({
  commandName: context.commandName,
  assignmentFile: context.assignmentRelativePath ?? context.assignmentFile,
  status: "success",
  exitCode: 0 /* Success */,
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
var createFailedPlaceholderResult = (context, error, exitCode = 1 /* CommandError */) => ({
  commandName: context.commandName,
  assignmentFile: context.assignmentRelativePath ?? context.assignmentFile,
  status: "failure",
  exitCode,
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

// src/diagnostics/error-catalog.ts
var NOT_SUPPORTED_IN_MVP_CODE = "not_supported_in_mvp";
var MISSING_REQUIRED_FILE_CODE = "missing_required_file";
var INVALID_YAML_CODE = "invalid_yaml";
var INVALID_SCHEMA_VERSION_CODE = "invalid_schema_version";
var MISSING_REQUIRED_FIELD_CODE = "missing_required_field";
var INVALID_TERM_CODE_CODE = "invalid_term_code";
var ASSIGNMENT_SLUG_MISMATCH_CODE = "assignment_slug_mismatch";
var TERM_CODE_MISMATCH_CODE = "term_code_mismatch";
var INVALID_ASSIGNMENT_TYPE_CODE = "invalid_assignment_type";
var INVALID_ASSIGNMENT_STATUS_CODE = "invalid_assignment_status";
var INVALID_REPOSITORY_VISIBILITY_CODE = "invalid_repository_visibility";
var INVALID_PERMISSION_CODE = "invalid_permission";
var INVALID_GRADING_CONFIG_CODE = "invalid_grading_config";
var MISSING_REQUIRED_COLUMN_CODE = "missing_required_column";
var MISSING_REQUIRED_VALUE_CODE = "missing_required_value";
var INVALID_ROSTER_STATUS_CODE = "invalid_roster_status";
var SECTION_MISMATCH_CODE = "section_mismatch";
var DUPLICATE_STUDENT_ID_CODE = "duplicate_student_id";
var DUPLICATE_GITHUB_USERNAME_CODE = "duplicate_github_username";
var INVALID_GITHUB_USERNAME_CODE = "invalid_github_username";
var STUDENT_ID_NORMALIZED_CODE = "student_id_normalized";
var GITHUB_USERNAME_NORMALIZED_CODE = "github_username_normalized";
var ROSTER_STATUS_NORMALIZED_CODE = "roster_status_normalized";
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

// src/core/repo-root.ts
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

// src/cli/output.ts
var JSON_INDENT_SPACES = 2;
var EMPTY_COLLECTION_LENGTH = 0;
var formatCommandResultAsJson = (result) => JSON.stringify(result, void 0, JSON_INDENT_SPACES);
var formatCommandResultAsText = (result) => {
  const assignmentFile = result.assignmentFile ?? "<none>";
  const errorCodes = result.errors.map((error) => error.code);
  if (errorCodes.length === EMPTY_COLLECTION_LENGTH) {
    return `${result.commandName}: ${assignmentFile}: ${result.status}`;
  }
  return `${result.commandName}: ${assignmentFile}: ${result.status}: ${errorCodes.join(", ")}`;
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
    const result = repositoryRootResult?.found === false ? createFailedPlaceholderResult(
      context,
      repositoryRootResult.diagnostic,
      5 /* ConfigurationOrSchemaError */
    ) : registration.support === "supported-placeholder" ? createSuccessfulPlaceholderResult(context) : createFailedPlaceholderResult(
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
      ].filter((warning) => warning !== void 0);
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

// src/cli/commands/validate.command.ts
var COMMAND_NAME = "validate";
var createValidateResult = (assignmentFile, options) => {
  const configResult = loadGraiderConfig({
    cwd: process.cwd(),
    assignmentFile
  });
  if (configResult.status === "failure") {
    return {
      commandName: COMMAND_NAME,
      assignmentFile,
      status: "failure",
      exitCode: 5 /* ConfigurationOrSchemaError */,
      warnings: [],
      errors: configResult.diagnostics,
      generatedFiles: [],
      summary: {
        options
      }
    };
  }
  const rosterResult = loadAssignmentRosters(configResult.config);
  if (rosterResult.errors.length > 0) {
    return {
      commandName: COMMAND_NAME,
      assignmentFile: configResult.config.summary.assignmentConfigPath,
      status: "failure",
      exitCode: 1 /* CommandError */,
      warnings: rosterResult.warnings,
      errors: rosterResult.errors,
      generatedFiles: [],
      summary: {
        options,
        ...configResult.config.summary,
        ...rosterResult.summary
      }
    };
  }
  return {
    commandName: COMMAND_NAME,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: "success",
    exitCode: 0 /* Success */,
    warnings: rosterResult.warnings,
    errors: [],
    generatedFiles: [],
    summary: {
      options,
      ...configResult.config.summary,
      ...rosterResult.summary
    }
  };
};
var registerValidateCommand = (program) => {
  program.command(COMMAND_NAME).argument("<assignment-file>").option("--json", "Emit JSON output").option("--verbose", "Emit verbose diagnostics").option("--yes", "Confirm non-interactive execution").description("Validate assignment configuration.").action((assignmentFile, rawOptions) => {
    const options = normalizeCommonCommandOptions(rawOptions);
    const result = createValidateResult(assignmentFile, options);
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
buildProgram().parse();
export {
  buildProgram
};
