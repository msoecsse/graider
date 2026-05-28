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
  return {
    commandName: COMMAND_NAME,
    assignmentFile: configResult.config.summary.assignmentConfigPath,
    status: "success",
    exitCode: 0 /* Success */,
    warnings: [],
    errors: [],
    generatedFiles: [],
    summary: {
      options,
      ...configResult.config.summary
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
