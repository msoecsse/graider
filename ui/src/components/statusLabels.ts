/**
 * README section 2.3: any status or reason enum reaching the UI needs a
 * display-string mapping, "in one module so they are reviewable in one
 * place." This module is that place for every single-word status value and
 * every apply/grade-preview row reason in the app.
 *
 * `STATUS_LABELS` deliberately serves several raw vocabularies at once --
 * template/branch/workflow readiness (`available`, `missing`, ...), the
 * assignment lifecycle (`draft`, `active`, `closed`, `archived`), the
 * shared top-level command outcome (`success`, `partial_success`,
 * `failure` -- see `CommandStatus` in src/core/command-result.ts, reused by
 * every CLI command's JSON), and a repository download's per-target outcome
 * (`cloned`, `failed`). `error` also covers diagnostic severity, though
 * `warning` and `info` severities are not mapped here -- out of scope for
 * this pass; see the PR8-2 summary. None of these vocabularies assign
 * conflicting meaning to the same raw word, so one flat table keeps a given
 * word reading the same way everywhere instead of drifting screen to
 * screen -- this was already happening in practice: `formatStatusLabel` (moved from
 * assignment-detail/assignmentDetailReadiness.ts, its previous home) was
 * already imported by eight files across five screens before this move.
 *
 * Fallback for a status this table doesn't list: underscores become
 * spaces (`some_new_status` -> "some new status"). Never blank, never a
 * crash, always at least readable -- deliberately chosen over guessing at
 * capitalization or inventing copy for a value nobody has reviewed yet.
 */
const STATUS_LABELS: Readonly<Record<string, string>> = {
  // Template / branch / workflow readiness
  available: "Available",
  branch_missing: "Branch missing",
  disabled: "Disabled",
  error: "Error",
  inaccessible: "Inaccessible",
  missing: "Missing",
  not_checked: "Not checked",
  not_configured: "Not configured",
  not_required: "Not required",
  partial_success: "Partially checked",
  success: "Ready",
  token_required: "Token required",
  auth_required: "Sign-in required",
  // Top-level command outcome (CommandStatus). "success" and "partial_success"
  // above already cover this vocabulary's shared values; only "failure" is new.
  failure: "Failed",
  // Assignment lifecycle (assignment.yml `status`, config-schemas.ts
  // VALID_ASSIGNMENT_STATUSES)
  draft: "Draft",
  active: "Active",
  closed: "Closed",
  archived: "Archived",
  // Repository download per-target outcome
  cloned: "Cloned",
  failed: "Failed"
};

export const formatStatusLabel = (status: string | null): string => {
  if (status === null || status.trim().length === 0) {
    return "Unavailable";
  }

  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
};

const NON_ATTENTION_STATUSES = [
  "available",
  "not_required",
  "not_checked",
  "not_configured",
  "disabled"
] as const;

export const hasAttentionStatus = (status: string | null): boolean =>
  status !== null &&
  !NON_ATTENTION_STATUSES.includes(status as (typeof NON_ATTENTION_STATUSES)[number]);

/**
 * Machine-readable `reason` values from the apply-preview and grade-preview
 * repository rows (src/apply-preview/apply-preview-builder.ts,
 * src/grade-preview/grade-preview-builder.ts) and their apply/dispatch
 * result equivalents. Several reasons reuse the assignment lifecycle status
 * itself (a blocked row's reason is literally "draft"/"closed"/"archived"),
 * so those three values are listed here too rather than delegated to
 * `formatStatusLabel`, keeping this table self-contained and independently
 * reviewable.
 *
 * Fallback: same rule as `formatStatusLabel` -- underscores become spaces,
 * never blank, never a crash.
 */
const REASON_LABELS: Readonly<Record<string, string>> = {
  student_repository_missing: "No repository yet",
  student_repository_exists: "Repository ready",
  student_repository_status_unknown: "Repository status unknown",
  manifest_repository_missing: "Tracked repository is missing",
  manifest_tracked_repository: "Repository already tracked",
  invalid_repository_name: "Repository name is invalid",
  token_required: "Token required",
  grading_not_configured: "Grading not configured",
  grading_workflow_missing: "Grading workflow missing",
  workflow_dispatch_missing: "Workflow can't be triggered automatically",
  workflow_dispatch_available: "Ready to dispatch",
  draft: "Draft",
  active: "Active",
  closed: "Closed",
  archived: "Archived",
  student_status_active: "Student active",
  student_status_dropped: "Student dropped",
  student_status_hold: "Student on hold"
};

export const formatReasonLabel = (reason: string | null): string => {
  if (reason === null || reason.trim().length === 0) {
    return "Unavailable";
  }

  return REASON_LABELS[reason] ?? reason.replaceAll("_", " ");
};
