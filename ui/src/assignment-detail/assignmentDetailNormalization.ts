import type { AssignmentDetailJsonResponse } from "../../electron/ipc";
import type {
  AssignmentDetailAction,
  AssignmentDetailActions,
  AssignmentDetailDiagnostic,
  AssignmentDetailSelection,
  NormalizedAssignmentDetail
} from "./assignmentDetailTypes";

const DEFAULT_UNIMPLEMENTED_ACTION: AssignmentDetailAction = {
  available: false,
  implemented: false,
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

const stringifyContextValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
};

export const normalizeAssignmentDetailDiagnostics = (
  diagnostics: readonly unknown[]
): readonly AssignmentDetailDiagnostic[] =>
  diagnostics.map((diagnostic) => {
    if (!isRecord(diagnostic)) {
      return {
        code: null,
        severity: null,
        message: "Unknown diagnostic.",
        context: {}
      };
    }

    const context = isRecord(diagnostic.context)
      ? Object.fromEntries(
          Object.entries(diagnostic.context)
            .map(([key, value]) => [key, stringifyContextValue(value)] as const)
            .filter((entry): entry is readonly [string, string] => entry[1] !== null)
        )
      : {};

    return {
      code: getString(diagnostic, "code"),
      severity: getString(diagnostic, "severity"),
      message: getString(diagnostic, "message") ?? "Unknown diagnostic.",
      context
    };
  });

const normalizeStringArray = (values: readonly unknown[]): readonly string[] =>
  values.filter((value): value is string => typeof value === "string");

const normalizeAction = (value: unknown): AssignmentDetailAction => {
  if (!isRecord(value)) {
    return DEFAULT_UNIMPLEMENTED_ACTION;
  }

  return {
    available: getBoolean(value, "available", false),
    implemented: getBoolean(value, "implemented", false),
    reason: getString(value, "reason")
  };
};

const normalizeActions = (value: unknown): AssignmentDetailActions => {
  const record = isRecord(value) ? value : {};

  return {
    validate: normalizeAction(record.validate),
    apply: normalizeAction(record.apply),
    grade: normalizeAction(record.grade),
    report: normalizeAction(record.report),
    publishStudentReports: normalizeAction(record.publishStudentReports),
    generateWorkflow: normalizeAction(record.generateWorkflow)
  };
};

export const normalizeAssignmentDetail = (
  detail: AssignmentDetailJsonResponse,
  selection: AssignmentDetailSelection,
  refreshedAt: string | null
): NormalizedAssignmentDetail => {
  const course = isRecord(detail.course) ? detail.course : {};
  const term = isRecord(detail.term) ? detail.term : {};
  const assignment = isRecord(detail.assignment) ? detail.assignment : {};
  const metadata = isRecord(detail.metadata) ? detail.metadata : {};
  const deadline = isRecord(detail.deadline) ? detail.deadline : {};
  const roster = isRecord(detail.roster) ? detail.roster : null;
  const template = isRecord(detail.template) ? detail.template : {};
  const grading = isRecord(detail.grading) ? detail.grading : {};
  const studentReports = isRecord(detail.studentReports) ? detail.studentReports : {};
  const applyState = isRecord(detail.applyState) ? detail.applyState : {};

  return {
    status: detail.status,
    refreshedAt,
    diagnostics: normalizeAssignmentDetailDiagnostics(detail.diagnostics),
    course: {
      slug: getString(course, "slug") ?? selection.courseSlug,
      title: getString(course, "title") ?? selection.courseTitle,
      file: getString(course, "file")
    },
    term: {
      slug: getString(term, "slug") ?? selection.termSlug,
      title: getString(term, "title") ?? selection.termTitle,
      file: getString(term, "file")
    },
    assignment: {
      slug: getString(assignment, "slug") ?? selection.assignmentSlug,
      title: getString(assignment, "title") ?? selection.assignmentTitle,
      type: getString(assignment, "type"),
      status: getString(assignment, "status") ?? selection.assignmentStatus,
      file: getString(assignment, "file") ?? selection.assignmentFile
    },
    metadata: {
      facultyOwner: getString(metadata, "facultyOwner"),
      lmsAssignmentId: getString(metadata, "lmsAssignmentId"),
      gradingCategory: getString(metadata, "gradingCategory"),
      points: getNumber(metadata, "points")
    },
    deadline: {
      dueAt: getString(deadline, "dueAt"),
      latePolicy: getString(deadline, "latePolicy")
    },
    sections: normalizeStringArray(detail.sections),
    roster:
      roster === null
        ? null
        : {
            sectionCount: getNumber(roster, "sectionCount"),
            activeStudentCount: getNumber(roster, "activeStudentCount"),
            totalStudentCount: getNumber(roster, "totalStudentCount")
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
    studentReports: {
      enabled: getBoolean(studentReports, "enabled", false),
      mode: getString(studentReports, "mode")
    },
    applyState: {
      status: getString(applyState, "status")
    },
    actions: normalizeActions(detail.actions)
  };
};

export const hasTokenRequiredReadiness = (detail: NormalizedAssignmentDetail): boolean =>
  detail.diagnostics.some((diagnostic) =>
    ["github_token_required", "github_token_missing"].includes(diagnostic.code ?? "")
  ) ||
  [
    detail.template.status,
    detail.template.repositoryStatus,
    detail.template.branchStatus,
    detail.grading.workflowStatus,
    detail.grading.workflowDispatch
  ].some((status) => status === "token_required");

export const hasAttentionStatus = (status: string | null): boolean =>
  status !== null &&
  !["available", "not_required", "not_checked", "not_configured", "disabled"].includes(status);
