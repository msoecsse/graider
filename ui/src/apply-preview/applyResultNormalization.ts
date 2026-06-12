import type { AssignmentApplyJsonResponse } from "../../electron/ipc";
import { normalizeAssignmentDetailDiagnostics } from "../assignment-detail/assignmentDetailNormalization";
import type {
  ApplyResultRepositoryRow,
  ApplyResultRepositoryStatus,
  ApplyResultSummary,
  NormalizedApplyResult
} from "./applyPreviewTypes";

const DEFAULT_RESULT_STATUS: ApplyResultRepositoryStatus = "failed";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];

  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const getNumber = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const getArray = (record: Record<string, unknown>, key: string): readonly unknown[] => {
  const value = record[key];

  return Array.isArray(value) ? value : [];
};

const normalizeResultStatus = (status: string | null): ApplyResultRepositoryStatus => {
  if (
    status === "created" ||
    status === "updated" ||
    status === "skipped" ||
    status === "failed" ||
    status === "blocked"
  ) {
    return status;
  }

  if (status === "existing" || status === "verified" || status === "noop") {
    return "updated";
  }

  return DEFAULT_RESULT_STATUS;
};

const normalizeResultRow = (value: unknown): ApplyResultRepositoryRow => {
  const row = isRecord(value) ? value : {};

  return {
    studentId: getString(row, "studentId"),
    githubUsername: getString(row, "githubUsername"),
    section: getString(row, "section"),
    repository: getString(row, "repository"),
    status: normalizeResultStatus(getString(row, "status")),
    reason: getString(row, "reason"),
    diagnostics: normalizeAssignmentDetailDiagnostics(
      Array.isArray(row.diagnostics) ? row.diagnostics : []
    )
  };
};

const countRows = (
  rows: readonly ApplyResultRepositoryRow[],
  status: ApplyResultRepositoryStatus
): number => rows.filter((row) => row.status === status).length;

const normalizeSummary = (
  summary: Readonly<Record<string, unknown>>,
  rows: readonly ApplyResultRepositoryRow[]
): ApplyResultSummary => {
  if (rows.length > 0) {
    return {
      createdRepositories: countRows(rows, "created"),
      updatedRepositories: countRows(rows, "updated"),
      skippedRepositories: countRows(rows, "skipped"),
      failedRepositories: countRows(rows, "failed"),
      blockedRepositories: countRows(rows, "blocked")
    };
  }

  const existing = getNumber(summary, "existing") ?? 0;
  const verified = getNumber(summary, "verified") ?? 0;
  const noop = getNumber(summary, "noop") ?? 0;

  return {
    createdRepositories: getNumber(summary, "created") ?? 0,
    updatedRepositories: getNumber(summary, "updated") ?? existing + verified + noop,
    skippedRepositories: getNumber(summary, "skipped") ?? 0,
    failedRepositories: getNumber(summary, "failed") ?? 0,
    blockedRepositories:
      getNumber(summary, "blocked") ?? getNumber(summary, "blockedOperationCount") ?? 0
  };
};

const normalizeRows = (
  summary: Readonly<Record<string, unknown>>
): readonly ApplyResultRepositoryRow[] => {
  const rowValues = [
    ...getArray(summary, "repositories"),
    ...getArray(summary, "repositoryResults"),
    ...getArray(summary, "results")
  ];

  return rowValues.map((row) => normalizeResultRow(row));
};

export const normalizeApplyResult = (
  apply: AssignmentApplyJsonResponse,
  appliedAt: string | null
): NormalizedApplyResult => {
  const rows = normalizeRows(apply.summary);

  return {
    status: apply.status,
    exitCode: apply.exitCode,
    appliedAt,
    assignmentFile: apply.assignmentFile,
    diagnostics: normalizeAssignmentDetailDiagnostics(apply.diagnostics),
    generatedFiles: apply.generatedFiles,
    summary: normalizeSummary(apply.summary, rows),
    rows,
    manifestFile: getString(apply.summary, "manifestFile"),
    rawSummary: apply.summary
  };
};
