import type {
  GradeStatusRepositoryRow,
  GradeStatusRepositoryStatus,
  NormalizedGradeStatus
} from "./gradeStatusTypes";

const GRADING_RESULT_LABELS: Readonly<Record<string, string>> = {
  passed: "Grading passed",
  failed: "Grading failed",
  skipped: "Grading skipped",
  missing: "Grading results missing",
  invalid: "Grading results invalid",
  expired: "Grading results expired",
  stale: "Grading results stale",
  contradictory: "Grading results contradictory",
  unavailable: "Grading results unavailable"
};

const formatCompletedLabel = (row: GradeStatusRepositoryRow): string =>
  row.gradingResult !== undefined &&
  row.gradingResult !== null &&
  Object.hasOwn(GRADING_RESULT_LABELS, row.gradingResult)
    ? (GRADING_RESULT_LABELS[row.gradingResult] ?? "Grading results unverified")
    : "Grading results unverified";

/**
 * Enumerated directly from GradeStatusRepositoryStatus so a future addition
 * to that type fails this switch's exhaustiveness check at compile time,
 * instead of silently falling through to "Unknown" the way the two
 * duplicated helpers this replaces did.
 */
export const formatGradeStatusLabel = (row: GradeStatusRepositoryRow): string => {
  const status: GradeStatusRepositoryStatus = row.status;

  switch (status) {
    case null:
      return "";
    case "queued":
      return "Queued";
    case "in_progress":
      return "In progress";
    case "completed":
      return formatCompletedLabel(row);
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
  if (row.status === "completed" && row.gradingResult === "passed") {
    return "status-chip status-chip--success";
  }

  if (row.status === "completed" && row.gradingResult === "failed") {
    return "status-chip status-chip--error";
  }

  return row.needsAttention || row.status === "completed"
    ? "status-chip status-chip--attention"
    : "status-chip";
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

  if (status.repositories.some((row) => row.status === null)) {
    return "Grading status is not applicable yet for some students.";
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
