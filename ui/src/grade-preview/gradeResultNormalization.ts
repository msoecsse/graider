import type { AssignmentGradeJsonResponse } from "../../electron/ipc";
import { normalizeAssignmentDetailDiagnostics } from "../assignment-detail/assignmentDetailNormalization";
import type {
  GradeDispatchResultRepositoryRow,
  GradeDispatchResultRepositoryStatus,
  GradeDispatchResultSummary,
  NormalizedGradeDispatchResult
} from "./gradePreviewTypes";

const DEFAULT_RESULT_STATUS: GradeDispatchResultRepositoryStatus = "failed";

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

const normalizeResultStatus = (status: string | null): GradeDispatchResultRepositoryStatus => {
  if (
    status === "dispatched" ||
    status === "skipped" ||
    status === "failed" ||
    status === "blocked"
  ) {
    return status;
  }

  if (status === "dispatch_succeeded" || status === "success") {
    return "dispatched";
  }

  if (status === "dispatch_failed" || status === "failure") {
    return "failed";
  }

  return DEFAULT_RESULT_STATUS;
};

const normalizeResultRow = (value: unknown): GradeDispatchResultRepositoryRow => {
  const row = isRecord(value) ? value : {};

  return {
    studentId: getString(row, "studentId"),
    githubUsername: getString(row, "githubUsername"),
    section: getString(row, "section"),
    repository: getString(row, "repository"),
    status: normalizeResultStatus(getString(row, "status")),
    reason: getString(row, "reason"),
    workflow: getString(row, "workflow"),
    ref: getString(row, "ref"),
    diagnostics: normalizeAssignmentDetailDiagnostics(
      Array.isArray(row.diagnostics) ? row.diagnostics : []
    )
  };
};

const countRows = (
  rows: readonly GradeDispatchResultRepositoryRow[],
  status: GradeDispatchResultRepositoryStatus
): number => rows.filter((row) => row.status === status).length;

const normalizeSummary = (
  summary: Readonly<Record<string, unknown>>,
  rows: readonly GradeDispatchResultRepositoryRow[]
): GradeDispatchResultSummary => {
  if (rows.length > 0) {
    return {
      targetsSelected: rows.length,
      dispatchAttempted: countRows(rows, "dispatched") + countRows(rows, "failed"),
      dispatchSucceeded: countRows(rows, "dispatched"),
      skipped: countRows(rows, "skipped"),
      failedOrBlocked: countRows(rows, "failed") + countRows(rows, "blocked")
    };
  }

  const dispatchFailed = getNumber(summary, "dispatchFailed") ?? getNumber(summary, "failed") ?? 0;
  const blocked = getNumber(summary, "blocked") ?? 0;

  return {
    targetsSelected:
      getNumber(summary, "targetsSelected") ?? getNumber(summary, "studentCount") ?? 0,
    dispatchAttempted: getNumber(summary, "dispatchAttempted") ?? 0,
    dispatchSucceeded: getNumber(summary, "dispatchSucceeded") ?? 0,
    skipped: getNumber(summary, "skipped") ?? 0,
    failedOrBlocked: dispatchFailed + blocked
  };
};

const normalizeRows = (
  summary: Readonly<Record<string, unknown>>
): readonly GradeDispatchResultRepositoryRow[] => {
  const rowValues = [
    ...getArray(summary, "repositories"),
    ...getArray(summary, "repositoryResults"),
    ...getArray(summary, "results")
  ];

  return rowValues.map((row) => normalizeResultRow(row));
};

export const normalizeGradeDispatchResult = (
  grade: AssignmentGradeJsonResponse,
  dispatchedAt: string | null
): NormalizedGradeDispatchResult => {
  const rows = normalizeRows(grade.summary);

  return {
    status: grade.status,
    exitCode: grade.exitCode,
    dispatchedAt,
    assignmentFile: grade.assignmentFile,
    diagnostics: normalizeAssignmentDetailDiagnostics(grade.diagnostics),
    generatedFiles: grade.generatedFiles,
    summary: normalizeSummary(grade.summary, rows),
    rows,
    rawSummary: grade.summary
  };
};
