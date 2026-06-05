import type { z } from "zod";
import {
  ASSIGNMENT_SLUG_MISMATCH_CODE,
  INVALID_ASSIGNMENT_STATUS_CODE,
  INVALID_ASSIGNMENT_TYPE_CODE,
  INVALID_GRADING_CONFIG_CODE,
  INVALID_PERMISSION_CODE,
  INVALID_REPOSITORY_VISIBILITY_CODE,
  INVALID_SCHEMA_VERSION_CODE,
  INVALID_TERM_CODE_CODE,
  MISSING_FACULTY_REPORT_DESTINATION_CODE,
  MISSING_FACULTY_REPORT_SOURCE_CODE,
  MISSING_GRAIDER_REPORT_DESTINATION_CODE,
  MISSING_GRADING_ARTIFACT_CODE,
  MISSING_GRADING_PRESET_CODE,
  MISSING_GRADING_RESULT_FILE_CODE,
  MISSING_GRADING_WORKFLOW_CODE,
  MISSING_REQUIRED_FIELD_CODE,
  MISSING_STUDENT_PUBLISH_ARTIFACT_CODE,
  MISSING_STUDENT_PUBLISH_DESTINATION_CODE,
  MISSING_STUDENT_PUBLISH_SOURCE_FILE_CODE,
  TERM_CODE_MISMATCH_CODE,
  UNSUPPORTED_GRADING_MODE_CODE,
  UNSUPPORTED_GRADING_PRESET_CODE,
  UNSUPPORTED_STUDENT_PUBLISH_MODE_CODE,
  createConfigDiagnostic
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { RawAssignmentConfig, RawCourseConfig, RawTermConfig } from "./config-models.js";
import {
  DISABLED_GRADING_MODE,
  DISABLED_STUDENT_PUBLISH_MODE,
  ENABLED_GRADING_MODES,
  ENABLED_STUDENT_PUBLISH_MODES,
  FACULTY_PERMISSION,
  GRADER_PERMISSION,
  STUDENT_PERMISSION,
  SUPPORTED_GRADING_PRESETS,
  SUPPORTED_ASSIGNMENT_TYPE,
  SUPPORTED_REPOSITORY_VISIBILITY,
  SUPPORTED_SCHEMA_VERSION,
  TERM_CODE_PATTERN,
  VALID_ASSIGNMENT_STATUSES
} from "./config-schemas.js";

const PATH_SEPARATOR = ".";
const WORKFLOW_GRADING_FIELDS = ["workflow", "artifact", "result_file"] as const;
const LEGACY_GRADING_MODE = "custom-workflow";
const PRESET_GRADING_MODE = "preset";
const GRAIDER_GENERATED_STUDENT_PUBLISH_MODE = "graider-generated";
const FACULTY_PROVIDED_STUDENT_PUBLISH_MODE = "faculty-provided";

export type SchemaValidationResult<T> =
  | {
      status: "success";
      value: T;
      diagnostics: Diagnostic[];
    }
  | {
      status: "failure";
      diagnostics: Diagnostic[];
    };

const formatIssuePath = (issue: z.core.$ZodIssue): string =>
  issue.path.map((part) => String(part)).join(PATH_SEPARATOR);

const mapZodIssueToDiagnostic = (filePath: string, issue: z.core.$ZodIssue): Diagnostic => {
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

export const validateRawConfigSchema = <T>(
  filePath: string,
  schema: z.ZodType<T>,
  value: unknown
): SchemaValidationResult<T> => {
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

const createInvalidSchemaVersionDiagnostic = (
  filePath: string,
  schemaVersion: number
): Diagnostic =>
  createConfigDiagnostic(
    INVALID_SCHEMA_VERSION_CODE,
    `Unsupported schema_version ${String(schemaVersion)} in ${filePath}.`,
    {
      filePath,
      schemaVersion,
      supportedSchemaVersion: SUPPORTED_SCHEMA_VERSION
    }
  );

const validateSchemaVersion = (filePath: string, schemaVersion: number): Diagnostic[] =>
  schemaVersion === SUPPORTED_SCHEMA_VERSION
    ? []
    : [createInvalidSchemaVersionDiagnostic(filePath, schemaVersion)];

const hasAnyWorkflowField = (grading: RawCourseConfig["grading"]): boolean =>
  WORKFLOW_GRADING_FIELDS.some((field) => grading[field] !== undefined);

const hasAllWorkflowFields = (grading: RawCourseConfig["grading"]): boolean =>
  WORKFLOW_GRADING_FIELDS.every((field) => grading[field] !== undefined);

const createMissingGradingFieldDiagnostic = (
  filePath: string,
  owner: string,
  code: string,
  field: string
): Diagnostic =>
  createConfigDiagnostic(code, `Enabled grading in ${filePath} must include ${field}.`, {
    filePath,
    owner,
    field
  });

const validateEnabledGradingFields = (
  filePath: string,
  grading: RawCourseConfig["grading"],
  owner: string
): Diagnostic[] => {
  if (grading.workflow === undefined) {
    return [
      createMissingGradingFieldDiagnostic(
        filePath,
        owner,
        MISSING_GRADING_WORKFLOW_CODE,
        "workflow"
      )
    ];
  }

  if (grading.artifact === undefined) {
    return [
      createMissingGradingFieldDiagnostic(
        filePath,
        owner,
        MISSING_GRADING_ARTIFACT_CODE,
        "artifact"
      )
    ];
  }

  if (grading.result_file === undefined) {
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

const validatePresetGrading = (
  filePath: string,
  grading: RawCourseConfig["grading"],
  owner: string
): Diagnostic[] => {
  if (grading.preset === undefined) {
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

  return SUPPORTED_GRADING_PRESETS.some((preset) => preset === grading.preset)
    ? []
    : [
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

const validateEnabledGradingConfig = (
  filePath: string,
  grading: RawCourseConfig["grading"],
  owner: string
): Diagnostic[] => {
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

  if (grading.mode === undefined && !hasAllWorkflowFields(grading)) {
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

const validateDisabledGradingConfig = (
  filePath: string,
  grading: RawCourseConfig["grading"],
  owner: string
): Diagnostic[] => {
  if (grading.mode !== undefined && grading.mode !== DISABLED_GRADING_MODE) {
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

const validateGradingConfig = (
  filePath: string,
  grading: RawCourseConfig["grading"],
  owner: string
): Diagnostic[] =>
  grading.enabled
    ? validateEnabledGradingConfig(filePath, grading, owner)
    : validateDisabledGradingConfig(filePath, grading, owner);

const createMissingStudentPublishFieldDiagnostic = (
  filePath: string,
  code: string,
  field: string
): Diagnostic =>
  createConfigDiagnostic(code, `Student report publishing in ${filePath} must include ${field}.`, {
    filePath,
    field
  });

const validateGraiderGeneratedStudentPublish = (
  filePath: string,
  studentPublish: NonNullable<RawCourseConfig["reports"]["student_publish"]>
): Diagnostic[] =>
  studentPublish.destination_file === undefined
    ? [
        createMissingStudentPublishFieldDiagnostic(
          filePath,
          MISSING_STUDENT_PUBLISH_DESTINATION_CODE,
          "destination_file"
        )
      ]
    : [];

const validateFacultyProvidedStudentPublish = (
  filePath: string,
  studentPublish: NonNullable<RawCourseConfig["reports"]["student_publish"]>
): Diagnostic[] => {
  if (studentPublish.artifact === undefined) {
    return [
      createMissingStudentPublishFieldDiagnostic(
        filePath,
        MISSING_STUDENT_PUBLISH_ARTIFACT_CODE,
        "artifact"
      )
    ];
  }

  if (studentPublish.source_file === undefined) {
    return [
      createMissingStudentPublishFieldDiagnostic(
        filePath,
        MISSING_STUDENT_PUBLISH_SOURCE_FILE_CODE,
        "source_file"
      )
    ];
  }

  if (studentPublish.destination_file === undefined) {
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

const validateBothStudentPublish = (
  filePath: string,
  studentPublish: NonNullable<RawCourseConfig["reports"]["student_publish"]>
): Diagnostic[] => {
  if (studentPublish.artifact === undefined) {
    return [
      createMissingStudentPublishFieldDiagnostic(
        filePath,
        MISSING_STUDENT_PUBLISH_ARTIFACT_CODE,
        "artifact"
      )
    ];
  }

  if (studentPublish.graider_report_destination === undefined) {
    return [
      createMissingStudentPublishFieldDiagnostic(
        filePath,
        MISSING_GRAIDER_REPORT_DESTINATION_CODE,
        "graider_report_destination"
      )
    ];
  }

  if (studentPublish.faculty_report_source === undefined) {
    return [
      createMissingStudentPublishFieldDiagnostic(
        filePath,
        MISSING_FACULTY_REPORT_SOURCE_CODE,
        "faculty_report_source"
      )
    ];
  }

  if (studentPublish.faculty_report_destination === undefined) {
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

const validateEnabledStudentPublishConfig = (
  filePath: string,
  studentPublish: NonNullable<RawCourseConfig["reports"]["student_publish"]>
): Diagnostic[] => {
  const mode = studentPublish.mode;

  if (mode === undefined || !ENABLED_STUDENT_PUBLISH_MODES.some((item) => item === mode)) {
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

const validateDisabledStudentPublishConfig = (
  filePath: string,
  studentPublish: NonNullable<RawCourseConfig["reports"]["student_publish"]>
): Diagnostic[] =>
  studentPublish.mode === undefined || studentPublish.mode === DISABLED_STUDENT_PUBLISH_MODE
    ? []
    : [
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

const validateStudentPublishConfig = (
  filePath: string,
  reports: RawCourseConfig["reports"]
): Diagnostic[] => {
  if (reports.student_publish === undefined) {
    return [];
  }

  return reports.student_publish.enabled
    ? validateEnabledStudentPublishConfig(filePath, reports.student_publish)
    : validateDisabledStudentPublishConfig(filePath, reports.student_publish);
};

export const validateCourseConfig = (filePath: string, config: RawCourseConfig): Diagnostic[] => [
  ...validateSchemaVersion(filePath, config.schema_version),
  ...(config.github.repository_visibility === SUPPORTED_REPOSITORY_VISIBILITY
    ? []
    : [
        createConfigDiagnostic(
          INVALID_REPOSITORY_VISIBILITY_CODE,
          `github.repository_visibility must be ${SUPPORTED_REPOSITORY_VISIBILITY}.`,
          {
            filePath,
            value: config.github.repository_visibility
          }
        )
      ]),
  ...(config.github.student_permission === STUDENT_PERMISSION &&
  config.github.faculty_permission === FACULTY_PERMISSION &&
  config.github.grader_permission === GRADER_PERMISSION
    ? []
    : [
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
      ]),
  ...(config.defaults.assignment_type === SUPPORTED_ASSIGNMENT_TYPE
    ? []
    : [
        createConfigDiagnostic(
          INVALID_ASSIGNMENT_TYPE_CODE,
          `defaults.assignment_type must be ${SUPPORTED_ASSIGNMENT_TYPE}.`,
          {
            filePath,
            value: config.defaults.assignment_type
          }
        )
      ]),
  ...validateGradingConfig(filePath, config.grading, "course"),
  ...validateStudentPublishConfig(filePath, config.reports)
];

export const validateTermConfig = (
  filePath: string,
  config: RawTermConfig,
  expectedTermCode: string
): Diagnostic[] => [
  ...validateSchemaVersion(filePath, config.schema_version),
  ...(config.term.code === expectedTermCode
    ? []
    : [
        createConfigDiagnostic(
          TERM_CODE_MISMATCH_CODE,
          "term.code must match the term folder name.",
          {
            filePath,
            expectedTermCode,
            actualTermCode: config.term.code
          }
        )
      ]),
  ...(TERM_CODE_PATTERN.test(config.term.code)
    ? []
    : [
        createConfigDiagnostic(INVALID_TERM_CODE_CODE, "term.code must use YYsN format.", {
          filePath,
          value: config.term.code
        })
      ])
];

export const validateAssignmentConfig = (
  filePath: string,
  config: RawAssignmentConfig,
  expectedAssignmentSlug: string
): Diagnostic[] => [
  ...validateSchemaVersion(filePath, config.schema_version),
  ...(config.assignment.slug === expectedAssignmentSlug
    ? []
    : [
        createConfigDiagnostic(
          ASSIGNMENT_SLUG_MISMATCH_CODE,
          "assignment.slug must match the assignment folder name.",
          {
            filePath,
            expectedAssignmentSlug,
            actualAssignmentSlug: config.assignment.slug
          }
        )
      ]),
  ...(config.assignment.type === SUPPORTED_ASSIGNMENT_TYPE
    ? []
    : [
        createConfigDiagnostic(
          INVALID_ASSIGNMENT_TYPE_CODE,
          `assignment.type must be ${SUPPORTED_ASSIGNMENT_TYPE}.`,
          {
            filePath,
            value: config.assignment.type
          }
        )
      ]),
  ...(VALID_ASSIGNMENT_STATUSES.some((status) => status === config.assignment.status)
    ? []
    : [
        createConfigDiagnostic(
          INVALID_ASSIGNMENT_STATUS_CODE,
          "assignment.status must be draft, active, closed, or archived.",
          {
            filePath,
            value: config.assignment.status
          }
        )
      ]),
  ...(config.grading === undefined
    ? []
    : validateGradingConfig(filePath, config.grading, "assignment"))
];
