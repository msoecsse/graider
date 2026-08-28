import type { AssignmentGradePreviewJsonResponse } from "../../electron/ipc";
import { normalizeAssignmentDetailDiagnostics } from "../assignment-detail/assignmentDetailNormalization";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";
import type {
  GradePreviewAction,
  GradePreviewActions,
  GradePreviewPlanSummary,
  GradePreviewRepositoryRow,
  GradePreviewRepositoryStatus,
  NormalizedGradePreview
} from "./gradePreviewTypes";

const DEFAULT_GRADE_ACTION: GradePreviewAction = {
  available: false,
  implemented: false,
  previewOnly: true,
  reason: null
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];

  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const getBoolean = (record: Record<string, unknown>, key: string, fallback: boolean): boolean => {
  const value = record[key];

  return typeof value === "boolean" ? value : fallback;
};

const getNumber = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const normalizeStringArray = (values: unknown): readonly string[] =>
  Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];

const normalizeRepositoryStatus = (status: string | null): GradePreviewRepositoryStatus => {
  if (
    status === "would_dispatch" ||
    status === "would_skip" ||
    status === "blocked" ||
    status === "unknown" ||
    status === "token_required"
  ) {
    return status;
  }

  return "unknown";
};

const normalizeRepositoryRow = (value: unknown): GradePreviewRepositoryRow => {
  const row = isRecord(value) ? value : {};

  return {
    studentId: getString(row, "studentId"),
    githubUsername: getString(row, "githubUsername"),
    section: getString(row, "section"),
    repository: getString(row, "repository"),
    status: normalizeRepositoryStatus(getString(row, "status")),
    reason: getString(row, "reason"),
    workflow: getString(row, "workflow"),
    ref: getString(row, "ref"),
    diagnostics: normalizeAssignmentDetailDiagnostics(
      Array.isArray(row.diagnostics) ? row.diagnostics : []
    )
  };
};

const countRows = (
  rows: readonly GradePreviewRepositoryRow[],
  status: GradePreviewRepositoryStatus
): number => rows.filter((row) => row.status === status).length;

const normalizePlanSummary = (
  summary: unknown,
  rows: readonly GradePreviewRepositoryRow[]
): GradePreviewPlanSummary => {
  const summaryRecord = isRecord(summary) ? summary : {};
  const unknownCount = countRows(rows, "unknown") + countRows(rows, "token_required");

  return {
    wouldDispatch:
      rows.length > 0
        ? countRows(rows, "would_dispatch")
        : (getNumber(summaryRecord, "wouldDispatch") ?? 0),
    wouldSkip:
      rows.length > 0
        ? countRows(rows, "would_skip")
        : (getNumber(summaryRecord, "wouldSkip") ?? 0),
    blocked:
      rows.length > 0 ? countRows(rows, "blocked") : (getNumber(summaryRecord, "blocked") ?? 0),
    unknown: rows.length > 0 ? unknownCount : (getNumber(summaryRecord, "unknown") ?? 0)
  };
};

const normalizeGradeAction = (value: unknown): GradePreviewAction => {
  if (!isRecord(value)) {
    return DEFAULT_GRADE_ACTION;
  }

  return {
    available: getBoolean(value, "available", false),
    implemented: getBoolean(value, "implemented", false),
    previewOnly: getBoolean(value, "previewOnly", true),
    reason: getString(value, "reason")
  };
};

const normalizeActions = (value: unknown): GradePreviewActions => {
  const record = isRecord(value) ? value : {};

  return {
    grade: normalizeGradeAction(record.grade)
  };
};

export const normalizeGradePreview = (
  preview: AssignmentGradePreviewJsonResponse,
  selection: AssignmentDetailSelection,
  refreshedAt: string | null
): NormalizedGradePreview => {
  const assignment = isRecord(preview.assignment) ? preview.assignment : {};
  const course = isRecord(preview.course) ? preview.course : {};
  const term = isRecord(preview.term) ? preview.term : {};
  const target = isRecord(preview.target) ? preview.target : {};
  const grading = isRecord(preview.grading) ? preview.grading : {};
  const plan = isRecord(preview.plan) ? preview.plan : {};
  const files = isRecord(preview.files) ? preview.files : {};
  const rows = Array.isArray(plan.repositories)
    ? plan.repositories.map((row) => normalizeRepositoryRow(row))
    : [];

  return {
    status: preview.status,
    refreshedAt,
    diagnostics: normalizeAssignmentDetailDiagnostics(preview.diagnostics),
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
      workflowDispatch: getString(grading, "workflowDispatch"),
      workflowRef: getString(grading, "workflowRef")
    },
    plan: {
      summary: normalizePlanSummary(plan.summary, rows),
      repositories: rows
    },
    files: {
      assignmentFile: getString(files, "assignmentFile") ?? selection.assignmentFile,
      manifestFile: getString(files, "manifestFile"),
      workflowFile: getString(files, "workflowFile")
    },
    actions: normalizeActions(preview.actions)
  };
};
