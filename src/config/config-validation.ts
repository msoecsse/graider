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
  MISSING_REQUIRED_FIELD_CODE,
  TERM_CODE_MISMATCH_CODE,
  createConfigDiagnostic
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { RawAssignmentConfig, RawCourseConfig, RawTermConfig } from "./config-models.js";
import {
  FACULTY_PERMISSION,
  GRADER_PERMISSION,
  STUDENT_PERMISSION,
  SUPPORTED_ASSIGNMENT_TYPE,
  SUPPORTED_REPOSITORY_VISIBILITY,
  SUPPORTED_SCHEMA_VERSION,
  TERM_CODE_PATTERN,
  VALID_ASSIGNMENT_STATUSES
} from "./config-schemas.js";

const PATH_SEPARATOR = ".";
const WORKFLOW_GRADING_FIELDS = ["workflow", "artifact", "result_file"] as const;

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

const validateGradingConfig = (
  filePath: string,
  grading: RawCourseConfig["grading"],
  owner: string
): Diagnostic[] => {
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
  ...validateGradingConfig(filePath, config.grading, "course")
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
