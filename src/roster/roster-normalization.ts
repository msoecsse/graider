import {
  GITHUB_USERNAME_NORMALIZED_CODE,
  ROSTER_STATUS_NORMALIZED_CODE,
  STUDENT_ID_NORMALIZED_CODE,
  createWarningDiagnostic
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

export interface NormalizedRosterValue {
  value: string;
  warning?: Diagnostic;
}

const normalizeLowercaseValue = (
  value: string,
  code: string,
  message: string,
  context: Record<string, unknown>
): NormalizedRosterValue => {
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

export const normalizeStudentId = (
  value: string,
  context: Record<string, unknown>
): NormalizedRosterValue =>
  normalizeLowercaseValue(
    value,
    STUDENT_ID_NORMALIZED_CODE,
    "student_id was normalized to lowercase.",
    context
  );

export const normalizeGithubUsername = (
  value: string,
  context: Record<string, unknown>
): NormalizedRosterValue =>
  normalizeLowercaseValue(
    value,
    GITHUB_USERNAME_NORMALIZED_CODE,
    "github_username was normalized to lowercase.",
    context
  );

export const normalizeRosterStatus = (
  value: string,
  context: Record<string, unknown>
): NormalizedRosterValue =>
  normalizeLowercaseValue(
    value,
    ROSTER_STATUS_NORMALIZED_CODE,
    "Roster status was normalized to lowercase.",
    context
  );
