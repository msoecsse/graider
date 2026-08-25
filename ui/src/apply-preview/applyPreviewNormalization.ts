import type { AssignmentApplyPreviewJsonResponse } from "../../electron/ipc";
import { normalizeAssignmentDetailDiagnostics } from "../assignment-detail/assignmentDetailNormalization";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";
import type {
  ApplyPreviewAction,
  ApplyPreviewActions,
  ApplyPreviewGroupTarget,
  ApplyPreviewPlanSummary,
  ApplyPreviewRepositoryRow,
  ApplyPreviewRepositoryStatus,
  NormalizedApplyPreview
} from "./applyPreviewTypes";

const DEFAULT_APPLY_ACTION: ApplyPreviewAction = {
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

const normalizeRepositoryStatus = (status: string | null): ApplyPreviewRepositoryStatus => {
  if (
    status === "would_create" ||
    status === "would_update" ||
    status === "would_skip" ||
    status === "blocked" ||
    status === "unknown" ||
    status === "token_required"
  ) {
    return status;
  }

  return "unknown";
};

const normalizeRepositoryRow = (value: unknown): ApplyPreviewRepositoryRow => {
  const row = isRecord(value) ? value : {};

  return {
    studentId: getString(row, "studentId"),
    githubUsername: getString(row, "githubUsername"),
    section: getString(row, "section"),
    repository: getString(row, "repository"),
    status: normalizeRepositoryStatus(getString(row, "status")),
    reason: getString(row, "reason"),
    diagnostics: normalizeAssignmentDetailDiagnostics(
      Array.isArray(row.diagnostics) ? row.diagnostics : []
    )
  };
};

const normalizeGroupTarget = (value: unknown): ApplyPreviewGroupTarget => {
  const target = isRecord(value) ? value : {};
  return {
    targetId: getString(target, "targetId"),
    groupId: getString(target, "groupId"),
    repositoryName: getString(target, "repositoryName"),
    sectionIds: normalizeStringArray(target.sectionIds),
    studentIds: normalizeStringArray(target.studentIds),
    githubUsernames: normalizeStringArray(target.githubUsernames),
    plannedStudentPermission: getString(target, "plannedStudentPermission"),
    facultyTeam: getString(target, "facultyTeam"),
    facultyTeamPermission: getString(target, "facultyTeamPermission"),
    graderTeam: getString(target, "graderTeam"),
    graderTeamPermission: getString(target, "graderTeamPermission")
  };
};

const countRows = (
  rows: readonly ApplyPreviewRepositoryRow[],
  status: ApplyPreviewRepositoryStatus
): number => rows.filter((row) => row.status === status).length;

const normalizePlanSummary = (
  summary: unknown,
  rows: readonly ApplyPreviewRepositoryRow[]
): ApplyPreviewPlanSummary => {
  const summaryRecord = isRecord(summary) ? summary : {};
  const unknownCount = countRows(rows, "unknown") + countRows(rows, "token_required");

  return {
    wouldCreateRepositories:
      rows.length > 0
        ? countRows(rows, "would_create")
        : (getNumber(summaryRecord, "wouldCreateRepositories") ?? 0),
    wouldUpdateRepositories:
      rows.length > 0
        ? countRows(rows, "would_update")
        : (getNumber(summaryRecord, "wouldUpdateRepositories") ?? 0),
    wouldSkipRepositories:
      rows.length > 0
        ? countRows(rows, "would_skip")
        : (getNumber(summaryRecord, "wouldSkipRepositories") ?? 0),
    blockedRepositories:
      rows.length > 0
        ? countRows(rows, "blocked")
        : (getNumber(summaryRecord, "blockedRepositories") ?? 0),
    unknownRepositories:
      rows.length > 0 ? unknownCount : (getNumber(summaryRecord, "unknownRepositories") ?? 0)
  };
};

const normalizeApplyAction = (value: unknown): ApplyPreviewAction => {
  if (!isRecord(value)) {
    return DEFAULT_APPLY_ACTION;
  }

  return {
    available: getBoolean(value, "available", false),
    implemented: getBoolean(value, "implemented", false),
    previewOnly: getBoolean(value, "previewOnly", true),
    reason: getString(value, "reason")
  };
};

const normalizeActions = (value: unknown): ApplyPreviewActions => {
  const record = isRecord(value) ? value : {};

  return {
    apply: normalizeApplyAction(record.apply)
  };
};

export const normalizeApplyPreview = (
  preview: AssignmentApplyPreviewJsonResponse,
  selection: AssignmentDetailSelection,
  refreshedAt: string | null
): NormalizedApplyPreview => {
  const assignment = isRecord(preview.assignment) ? preview.assignment : {};
  const course = isRecord(preview.course) ? preview.course : {};
  const term = isRecord(preview.term) ? preview.term : {};
  const target = isRecord(preview.target) ? preview.target : {};
  const template = isRecord(preview.template) ? preview.template : {};
  const grading = isRecord(preview.grading) ? preview.grading : {};
  const plan = isRecord(preview.plan) ? preview.plan : {};
  const files = isRecord(preview.files) ? preview.files : {};
  const rows = Array.isArray(plan.repositories)
    ? plan.repositories.map((row) => normalizeRepositoryRow(row))
    : [];
  const groupTargets = Array.isArray(plan.groupTargets)
    ? plan.groupTargets.map((target) => normalizeGroupTarget(target))
    : [];

  return {
    status: preview.status,
    repositoryMode: preview.repositoryMode === "group" ? "group" : "individual",
    applySupported: preview.applySupported === true,
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
      studentCount: getNumber(target, "studentCount")
    },
    template: {
      repository: getString(template, "repository"),
      branch: getString(template, "branch"),
      status: getString(template, "status"),
      repositoryStatus: getString(template, "repositoryStatus"),
      branchStatus: getString(template, "branchStatus")
    },
    grading: {
      enabled: getBoolean(grading, "enabled", false),
      mode: getString(grading, "mode"),
      workflow: getString(grading, "workflow"),
      artifact: getString(grading, "artifact"),
      resultFile: getString(grading, "resultFile"),
      workflowStatus: getString(grading, "workflowStatus"),
      workflowDispatch: getString(grading, "workflowDispatch")
    },
    plan: {
      summary: normalizePlanSummary(plan.summary, rows),
      repositories: rows,
      groupTargets
    },
    files: {
      assignmentFile: getString(files, "assignmentFile") ?? selection.assignmentFile,
      workflowFile: getString(files, "workflowFile"),
      templateSource: getString(files, "templateSource")
    },
    actions: normalizeActions(preview.actions)
  };
};
