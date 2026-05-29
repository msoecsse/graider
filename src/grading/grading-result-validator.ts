import { z } from "zod";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import {
  SUPPORTED_GRADING_RESULT_SCHEMA_VERSION,
  type GradingCheckResult,
  type GradingResultValidationResult,
  type GradingResults
} from "./grading-result-models.js";
import { isGradingResultStatus } from "./grading-status-mapper.js";

const MINIMUM_TEXT_LENGTH = 1;
const NO_DIAGNOSTICS = 0;

const diagnosticSchema = z
  .object({
    code: z.string().min(MINIMUM_TEXT_LENGTH),
    severity: z.union([z.literal("error"), z.literal("warning"), z.literal("info")]),
    message: z.string().min(MINIMUM_TEXT_LENGTH),
    context: z.record(z.string(), z.unknown()).optional(),
    observedAt: z.string().optional()
  })
  .strict();

const rawGradingCheckSchema = z.looseObject({
  name: z.unknown().optional(),
  status: z.unknown().optional(),
  message: z.unknown().optional(),
  points_earned: z.unknown().optional(),
  points_possible: z.unknown().optional(),
  details: z.unknown().optional()
});

const rawGradingResultsSchema = z.looseObject({
  schema_version: z.unknown().optional(),
  student_id: z.unknown().optional(),
  github_username: z.unknown().optional(),
  assignment_slug: z.unknown().optional(),
  generated_at: z.unknown().optional(),
  commit: z.unknown().optional(),
  status: z.unknown().optional(),
  score: z.unknown().optional(),
  max_score: z.unknown().optional(),
  summary: z.unknown().optional(),
  checks: z.unknown().optional(),
  warnings: z.unknown().optional(),
  errors: z.unknown().optional()
});

type RawGradingCheck = z.infer<typeof rawGradingCheckSchema>;
type RawGradingResults = z.infer<typeof rawGradingResultsSchema>;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length >= MINIMUM_TEXT_LENGTH;

const isNumberOrNullOrUndefined = (value: unknown): value is number | null | undefined =>
  value === undefined || value === null || typeof value === "number";

const isStringOrUndefined = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === "string";

const isStringArrayOrUndefined = (value: unknown): value is string[] | undefined =>
  value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));

const createInvalidResultDiagnostic = (message: string, context?: Record<string, unknown>) =>
  createConfigDiagnostic(DiagnosticCode.InvalidGradingResult, message, context);

const validateDiagnostics = (value: unknown, fieldName: string): Diagnostic[] => {
  if (value === undefined) {
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
    const parsed = diagnosticSchema.safeParse(item);

    return parsed.success
      ? []
      : [
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

const normalizeDiagnostics = (value: unknown): Diagnostic[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const parsed = diagnosticSchema.safeParse(item);

        return parsed.success
          ? [
              {
                code: parsed.data.code,
                severity: parsed.data.severity,
                message: parsed.data.message,
                ...(parsed.data.context === undefined ? {} : { context: parsed.data.context }),
                ...(parsed.data.observedAt === undefined
                  ? {}
                  : { observedAt: parsed.data.observedAt })
              }
            ]
          : [];
      })
    : [];

const validateScoreField = (value: unknown, fieldName: string): Diagnostic[] =>
  isNumberOrNullOrUndefined(value)
    ? []
    : [
        createConfigDiagnostic(
          DiagnosticCode.InvalidGradingScore,
          `Grading result ${fieldName} must be a number or null.`,
          { fieldName }
        )
      ];

const validateCheck = (check: RawGradingCheck, index: number): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  if (!isNonEmptyString(check.name)) {
    diagnostics.push(
      createConfigDiagnostic(
        DiagnosticCode.MissingGradingCheckName,
        "Grading check is missing a non-empty name.",
        { checkIndex: index }
      )
    );
  }

  if (
    !isNonEmptyString(check.status) ||
    !["passed", "failed", "error", "skipped"].includes(check.status)
  ) {
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

const normalizeCheck = (check: RawGradingCheck): GradingCheckResult => ({
  name: check.name as string,
  status: check.status as GradingCheckResult["status"],
  ...(check.message === undefined ? {} : { message: check.message as string }),
  ...(check.points_earned === undefined
    ? {}
    : { pointsEarned: check.points_earned as number | null }),
  ...(check.points_possible === undefined
    ? {}
    : { pointsPossible: check.points_possible as number | null }),
  ...(check.details === undefined ? {} : { details: check.details as string[] })
});

const validateRawResult = (raw: RawGradingResults): Diagnostic[] => {
  const schemaVersionDiagnostics =
    raw.schema_version === SUPPORTED_GRADING_RESULT_SCHEMA_VERSION
      ? []
      : [
          createConfigDiagnostic(
            DiagnosticCode.InvalidGradingResultSchemaVersion,
            `Unsupported grading result schema_version ${String(raw.schema_version)}.`,
            {
              schemaVersion: raw.schema_version,
              supportedSchemaVersion: SUPPORTED_GRADING_RESULT_SCHEMA_VERSION
            }
          )
        ];
  const statusDiagnostics =
    isNonEmptyString(raw.status) && isGradingResultStatus(raw.status)
      ? []
      : [
          createConfigDiagnostic(
            DiagnosticCode.InvalidGradingResultStatus,
            "Grading result status is not part of the closed MVP status vocabulary.",
            { status: raw.status }
          )
        ];
  const checksDiagnostics = Array.isArray(raw.checks)
    ? raw.checks.flatMap((check, index) => {
        const parsed = rawGradingCheckSchema.safeParse(check);

        return parsed.success
          ? validateCheck(parsed.data, index)
          : [
              createInvalidResultDiagnostic("Grading check must be an object.", {
                checkIndex: index
              })
            ];
      })
    : [
        createInvalidResultDiagnostic("Grading result checks must be an array.", {
          fieldName: "checks"
        })
      ];

  return [
    ...schemaVersionDiagnostics,
    ...statusDiagnostics,
    ...validateScoreField(raw.score, "score"),
    ...validateScoreField(raw.max_score, "max_score"),
    ...(isStringOrUndefined(raw.student_id)
      ? []
      : [
          createInvalidResultDiagnostic("Grading result student_id must be a string when present.")
        ]),
    ...(isStringOrUndefined(raw.github_username)
      ? []
      : [
          createInvalidResultDiagnostic(
            "Grading result github_username must be a string when present."
          )
        ]),
    ...(isStringOrUndefined(raw.assignment_slug)
      ? []
      : [
          createInvalidResultDiagnostic(
            "Grading result assignment_slug must be a string when present."
          )
        ]),
    ...(isStringOrUndefined(raw.generated_at)
      ? []
      : [
          createInvalidResultDiagnostic(
            "Grading result generated_at must be a string when present."
          )
        ]),
    ...(isStringOrUndefined(raw.commit)
      ? []
      : [createInvalidResultDiagnostic("Grading result commit must be a string when present.")]),
    ...(isStringOrUndefined(raw.summary)
      ? []
      : [createInvalidResultDiagnostic("Grading result summary must be a string when present.")]),
    ...validateDiagnostics(raw.warnings, "warnings"),
    ...validateDiagnostics(raw.errors, "errors"),
    ...checksDiagnostics
  ];
};

const normalizeResult = (raw: RawGradingResults): GradingResults => ({
  schemaVersion: SUPPORTED_GRADING_RESULT_SCHEMA_VERSION,
  ...(raw.student_id === undefined ? {} : { studentId: raw.student_id as string }),
  ...(raw.github_username === undefined ? {} : { githubUsername: raw.github_username as string }),
  ...(raw.assignment_slug === undefined ? {} : { assignmentSlug: raw.assignment_slug as string }),
  ...(raw.generated_at === undefined ? {} : { generatedAt: raw.generated_at as string }),
  ...(raw.commit === undefined ? {} : { commit: raw.commit as string }),
  status: raw.status as GradingResults["status"],
  ...(raw.score === undefined ? {} : { score: raw.score as number | null }),
  ...(raw.max_score === undefined ? {} : { maxScore: raw.max_score as number | null }),
  ...(raw.summary === undefined ? {} : { summary: raw.summary as string }),
  checks: Array.isArray(raw.checks)
    ? raw.checks.map((check) => normalizeCheck(rawGradingCheckSchema.parse(check)))
    : [],
  warnings: normalizeDiagnostics(raw.warnings),
  errors: normalizeDiagnostics(raw.errors)
});

export const validateGradingResultsJson = (value: unknown): GradingResultValidationResult => {
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

export const parseGradingResultsJsonText = (jsonText: string): GradingResultValidationResult => {
  try {
    return validateGradingResultsJson(JSON.parse(jsonText) as unknown);
  } catch (error: unknown) {
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
