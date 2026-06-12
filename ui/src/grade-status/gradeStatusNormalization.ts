import type { AssignmentGradeStatusJsonResponse } from "../../electron/ipc";
import { normalizeAssignmentDetailDiagnostics } from "../assignment-detail/assignmentDetailNormalization";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";
import type {
  GradeStatusRepositoryRow,
  GradeStatusRepositoryStatus,
  GradeStatusSummary,
  NormalizedGradeStatus
} from "./gradeStatusTypes";

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

const getBoolean = (record: Record<string, unknown>, key: string, fallback: boolean): boolean => {
  const value = record[key];

  return typeof value === "boolean" ? value : fallback;
};

const normalizeStringArray = (values: unknown): readonly string[] =>
  Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];

const normalizeRepositoryStatus = (status: string | null): GradeStatusRepositoryStatus => {
  if (
    status === "queued" ||
    status === "in_progress" ||
    status === "completed" ||
    status === "missing" ||
    status === "unknown" ||
    status === "blocked" ||
    status === "token_required"
  ) {
    return status;
  }

  return "unknown";
};

const normalizeRepositoryRow = (value: unknown): GradeStatusRepositoryRow => {
  const row = isRecord(value) ? value : {};

  return {
    studentId: getString(row, "studentId"),
    githubUsername: getString(row, "githubUsername"),
    section: getString(row, "section"),
    repository: getString(row, "repository"),
    workflow: getString(row, "workflow"),
    ref: getString(row, "ref"),
    runId: getNumber(row, "runId"),
    runUrl: getString(row, "runUrl"),
    status: normalizeRepositoryStatus(getString(row, "status")),
    conclusion: getString(row, "conclusion"),
    startedAt: getString(row, "startedAt"),
    completedAt: getString(row, "completedAt"),
    selectionStrategy: getString(row, "selectionStrategy"),
    reason: getString(row, "reason"),
    needsAttention: getBoolean(row, "needsAttention", false),
    diagnostics: normalizeAssignmentDetailDiagnostics(
      Array.isArray(row.diagnostics) ? row.diagnostics : []
    )
  };
};

const countRows = (
  rows: readonly GradeStatusRepositoryRow[],
  predicate: (row: GradeStatusRepositoryRow) => boolean
): number => rows.filter(predicate).length;

export const isTerminalGradeStatusRow = (row: GradeStatusRepositoryRow): boolean =>
  row.status === "completed" || row.status === "missing" || row.status === "blocked";

export const isNonTerminalGradeStatusRow = (row: GradeStatusRepositoryRow): boolean =>
  !isTerminalGradeStatusRow(row);

export const createGradeStatusSummary = (
  rows: readonly GradeStatusRepositoryRow[]
): GradeStatusSummary => {
  const readyForReport =
    rows.length > 0 && rows.every((row) => row.status === "completed" && row.conclusion !== null);

  return {
    totalRepositories: rows.length,
    queued: countRows(rows, (row) => row.status === "queued"),
    inProgress: countRows(rows, (row) => row.status === "in_progress"),
    completed: countRows(rows, (row) => row.status === "completed"),
    successful: countRows(
      rows,
      (row) => row.status === "completed" && row.conclusion === "success"
    ),
    failed: countRows(rows, (row) => row.status === "completed" && row.conclusion === "failure"),
    cancelled: countRows(
      rows,
      (row) => row.status === "completed" && row.conclusion === "cancelled"
    ),
    timedOut: countRows(
      rows,
      (row) => row.status === "completed" && row.conclusion === "timed_out"
    ),
    missing: countRows(rows, (row) => row.status === "missing"),
    unknown: countRows(rows, (row) => row.status === "unknown" || row.status === "token_required"),
    blocked: countRows(rows, (row) => row.status === "blocked"),
    needsAttention: countRows(rows, (row) => row.needsAttention),
    readyForReport
  };
};

export const mergeGradeStatusRows = (
  currentRows: readonly GradeStatusRepositoryRow[],
  nextRows: readonly GradeStatusRepositoryRow[]
): readonly GradeStatusRepositoryRow[] =>
  currentRows.map((currentRow) => {
    const replacement = nextRows.find(
      (nextRow) => nextRow.studentId !== null && nextRow.studentId === currentRow.studentId
    );

    return replacement ?? currentRow;
  });

const normalizeSummary = (
  summary: unknown,
  rows: readonly GradeStatusRepositoryRow[]
): GradeStatusSummary => {
  if (rows.length > 0) {
    return createGradeStatusSummary(rows);
  }

  const summaryRecord = isRecord(summary) ? summary : {};

  return {
    totalRepositories: getNumber(summaryRecord, "totalRepositories") ?? 0,
    queued: getNumber(summaryRecord, "queued") ?? 0,
    inProgress: getNumber(summaryRecord, "inProgress") ?? 0,
    completed: getNumber(summaryRecord, "completed") ?? 0,
    successful: getNumber(summaryRecord, "successful") ?? 0,
    failed: getNumber(summaryRecord, "failed") ?? 0,
    cancelled: getNumber(summaryRecord, "cancelled") ?? 0,
    timedOut: getNumber(summaryRecord, "timedOut") ?? 0,
    missing: getNumber(summaryRecord, "missing") ?? 0,
    unknown: getNumber(summaryRecord, "unknown") ?? 0,
    blocked: getNumber(summaryRecord, "blocked") ?? 0,
    needsAttention: getNumber(summaryRecord, "needsAttention") ?? 0,
    readyForReport: getBoolean(summaryRecord, "readyForReport", false)
  };
};

export const normalizeGradeStatus = (
  gradeStatus: AssignmentGradeStatusJsonResponse,
  selection: AssignmentDetailSelection,
  refreshedAt: string | null
): NormalizedGradeStatus => {
  const assignment = isRecord(gradeStatus.assignment) ? gradeStatus.assignment : {};
  const course = isRecord(gradeStatus.course) ? gradeStatus.course : {};
  const term = isRecord(gradeStatus.term) ? gradeStatus.term : {};
  const target = isRecord(gradeStatus.target) ? gradeStatus.target : {};
  const grading = isRecord(gradeStatus.grading) ? gradeStatus.grading : {};
  const rows = gradeStatus.repositories.map((row) => normalizeRepositoryRow(row));

  return {
    status: gradeStatus.status,
    exitCode: gradeStatus.exitCode,
    refreshedAt,
    diagnostics: normalizeAssignmentDetailDiagnostics(gradeStatus.diagnostics),
    assignment: {
      slug: getString(assignment, "slug") ?? selection.assignmentSlug,
      title: getString(assignment, "title") ?? selection.assignmentTitle,
      file: getString(assignment, "file") ?? selection.assignmentFile,
      status: getString(assignment, "status") ?? selection.assignmentStatus
    },
    course: {
      slug: getString(course, "slug") ?? selection.courseSlug,
      title: getString(course, "title") ?? selection.courseTitle
    },
    term: {
      slug: getString(term, "slug") ?? selection.termSlug,
      title: getString(term, "title") ?? selection.termTitle
    },
    target: {
      sections: normalizeStringArray(target.sections),
      sectionCount: getNumber(target, "sectionCount"),
      studentCount: getNumber(target, "studentCount"),
      activeStudentCount: getNumber(target, "activeStudentCount")
    },
    grading: {
      enabled: getBoolean(grading, "enabled", false),
      resolvedFrom: getString(grading, "resolvedFrom"),
      mode: getString(grading, "mode"),
      workflow: getString(grading, "workflow"),
      artifact: getString(grading, "artifact"),
      resultFile: getString(grading, "resultFile"),
      workflowRef: getString(grading, "workflowRef")
    },
    summary: normalizeSummary(gradeStatus.summary, rows),
    repositories: rows
  };
};
