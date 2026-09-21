import type {
  GradeStatusRepositoryRow,
  GradeStatusRepositoryStatus,
  NormalizedGradeStatus
} from "./gradeStatusTypes";

// Mirrors GradeStatusRepositoryConclusion in src/grade-status/grade-status-models.ts.
// Can't import it directly: ui/src/ never imports from the CLI package (src/), only
// from ui/electron via window.graiderUI, so the frontend keeps its own copy — the
// same reason GradeStatusRepositoryStatus is redeclared in gradeStatusTypes.ts
// rather than imported from there. Keep both in sync by hand if the backend adds a
// new conclusion value.
type KnownGradeStatusConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "timed_out"
  | "skipped"
  | "neutral"
  | "action_required"
  | "unknown";

const COMPLETED_CONCLUSION_LABELS: Readonly<Record<KnownGradeStatusConclusion, string>> = {
  success: "Completed — success",
  failure: "Completed — failure",
  cancelled: "Cancelled",
  timed_out: "Timed out",
  // GitHub Actions can report skipped/neutral/action_required conclusions;
  // Graider has no specific copy for them, so they fold into the same
  // catch-all as a genuinely unrecognized value rather than leaking the raw
  // GitHub conclusion string into faculty-facing text (README section 2.3).
  skipped: "Completed — unknown",
  neutral: "Completed — unknown",
  action_required: "Completed — unknown",
  unknown: "Completed — unknown"
};

const isKnownGradeStatusConclusion = (value: string | null): value is KnownGradeStatusConclusion =>
  value !== null && Object.hasOwn(COMPLETED_CONCLUSION_LABELS, value);

const formatCompletedLabel = (conclusion: string | null): string =>
  isKnownGradeStatusConclusion(conclusion)
    ? COMPLETED_CONCLUSION_LABELS[conclusion]
    : "Completed — unknown";

/**
 * Enumerated directly from GradeStatusRepositoryStatus so a future addition
 * to that type fails this switch's exhaustiveness check at compile time,
 * instead of silently falling through to "Unknown" the way the two
 * duplicated helpers this replaces did.
 */
export const formatGradeStatusLabel = (row: GradeStatusRepositoryRow): string => {
  const status: GradeStatusRepositoryStatus = row.status;

  switch (status) {
    case "queued":
      return "Queued";
    case "in_progress":
      return "In progress";
    case "completed":
      return formatCompletedLabel(row.conclusion);
    case "missing":
      return "Missing";
    case "token_required":
      return "Token required";
    case "not_configured":
      return "Grading disabled";
    case "blocked":
      return "Blocked";
    case "unknown":
      return "Unknown";
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
};

export const getGradeStatusChipClassName = (row: GradeStatusRepositoryRow): string => {
  if (row.status === "completed" && row.conclusion === "success") {
    return "status-chip status-chip--success";
  }

  if (row.status === "completed" && row.conclusion === "failure") {
    return "status-chip status-chip--error";
  }

  return row.needsAttention ? "status-chip status-chip--attention" : "status-chip";
};

const buildGradeStatusReasonParts = (status: NormalizedGradeStatus): readonly string[] => {
  const activeRuns = status.summary.queued + status.summary.inProgress;

  return [
    status.summary.needsAttention > 0
      ? `${status.summary.needsAttention} grading runs need attention.`
      : null,
    activeRuns > 0 ? `${activeRuns} runs still in progress.` : null,
    status.summary.missing > 0
      ? `${status.summary.missing} repositories are missing completed grading runs.`
      : null,
    status.summary.unknown > 0 ? `${status.summary.unknown} repositories are unknown.` : null,
    status.summary.blocked > 0 ? `${status.summary.blocked} repositories are blocked.` : null
  ].filter((part): part is string => part !== null);
};

/**
 * General-purpose summary shown regardless of readiness (AssignmentDetailPage's
 * grade status summary panel). Falls back to a positive "nothing needs
 * attention" message when there is nothing to report, because this is called
 * unconditionally, not only when the assignment is already known to be unready.
 */
export const getGradeStatusSummaryText = (status: NormalizedGradeStatus): string => {
  if (!status.grading.enabled) {
    return "Grading is disabled for this assignment.";
  }

  const parts = buildGradeStatusReasonParts(status);

  if (parts.length > 0) {
    return parts.join(" ");
  }

  if (status.repositories.length === 0) {
    return "No repository status rows were returned.";
  }

  return "No grading runs need attention.";
};

/**
 * Explains why report generation isn't ready (GradeStatusPage). Only called
 * when status.summary.readyForReport is already false, so — unlike
 * getGradeStatusSummaryText above — an empty reason list means "not ready for
 * a reason not captured by these counts", not "everything is fine".
 */
export const getNotReadyReason = (status: NormalizedGradeStatus): string => {
  if (!status.grading.enabled) {
    return "Grading is disabled for this assignment.";
  }

  const parts = buildGradeStatusReasonParts(status);

  return parts.length === 0 ? "Status is not ready for report generation yet." : parts.join(" ");
};
