import type {
  AssignmentDetailDiagnostic,
  AssignmentDetailDiagnosticGroup,
  AssignmentNeedsAttentionItem,
  AssignmentReadinessSummary,
  NormalizedAssignmentDetail
} from "./assignmentDetailTypes";

const AVAILABLE_STATUSES = ["available", "success", "ready"] as const;
const NON_ATTENTION_STATUSES = [
  "available",
  "not_required",
  "not_checked",
  "not_configured",
  "disabled"
] as const;
const PARTIAL_STATUSES = ["token_required", "not_checked"] as const;
const ERROR_SEVERITY = "error";
const WARNING_SEVERITY = "warning";
const INFO_SEVERITY = "info";

export const formatNullableValue = (value: string | number | null | undefined): string =>
  value === null || value === undefined || value === "" ? "Not configured" : String(value);

export const formatStatusLabel = (status: string | null): string => {
  if (status === null || status.trim().length === 0) {
    return "Unavailable";
  }

  const labels: Readonly<Record<string, string>> = {
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
    token_required: "Token required"
  };

  return labels[status] ?? status.replaceAll("_", " ");
};

export const hasAttentionStatus = (status: string | null): boolean =>
  status !== null &&
  !NON_ATTENTION_STATUSES.includes(status as (typeof NON_ATTENTION_STATUSES)[number]);

const hasPartialStatus = (status: string | null): boolean =>
  status !== null && PARTIAL_STATUSES.includes(status as (typeof PARTIAL_STATUSES)[number]);

const hasAvailableStatus = (status: string | null): boolean =>
  status !== null && AVAILABLE_STATUSES.includes(status as (typeof AVAILABLE_STATUSES)[number]);

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

const createAttentionItem = (
  id: string,
  title: string,
  description: string,
  category: string
): AssignmentNeedsAttentionItem => ({
  id,
  title,
  description,
  category
});

export const collectNeedsAttentionItems = (
  detail: NormalizedAssignmentDetail
): readonly AssignmentNeedsAttentionItem[] => {
  const items: AssignmentNeedsAttentionItem[] = [];

  if (hasTokenRequiredReadiness(detail)) {
    items.push(
      createAttentionItem(
        "github-token-required",
        "GitHub authentication needed for readiness checks.",
        "Local assignment details are shown, but GitHub-backed template and workflow checks need authentication.",
        "GitHub readiness"
      )
    );
  }

  if (["missing", "inaccessible", "error"].includes(detail.template.repositoryStatus ?? "")) {
    items.push(
      createAttentionItem(
        "template-repository",
        detail.template.repositoryStatus === "missing"
          ? "Template repository is missing."
          : "Template repository is unavailable.",
        "Check the configured template repository before applying this assignment.",
        "Template"
      )
    );
  }

  if (["branch_missing", "missing", "error"].includes(detail.template.branchStatus ?? "")) {
    items.push(
      createAttentionItem(
        "template-branch",
        "Template branch is missing.",
        "The configured branch must exist in the template repository.",
        "Template"
      )
    );
  }

  if (
    detail.grading.enabled &&
    ["missing", "error"].includes(detail.grading.workflowStatus ?? "")
  ) {
    items.push(
      createAttentionItem(
        "grading-workflow",
        "Grading workflow file is missing.",
        "The configured workflow path could not be verified in the template repository.",
        "Grading workflow"
      )
    );
  }

  if (
    detail.grading.enabled &&
    ["missing", "error"].includes(detail.grading.workflowDispatch ?? "")
  ) {
    items.push(
      createAttentionItem(
        "workflow-dispatch",
        "Workflow does not support workflow_dispatch.",
        "Graider grading dispatch will require a workflow_dispatch trigger in the workflow file.",
        "Grading workflow"
      )
    );
  }

  if (detail.roster === null) {
    items.push(
      createAttentionItem(
        "roster-summary",
        "Roster counts could not be loaded.",
        "The assignment can be shown, but roster counts could not be loaded.",
        "Roster"
      )
    );
  }

  if (detail.status === "partial_success" && items.length === 0) {
    items.push(
      createAttentionItem(
        "partial-success",
        "Some readiness checks were incomplete.",
        "Review diagnostics below for the checks that could not be completed.",
        "Readiness checks"
      )
    );
  }

  return items;
};

export const deriveAssignmentReadiness = (
  detail: NormalizedAssignmentDetail
): AssignmentReadinessSummary => {
  const items = collectNeedsAttentionItems(detail);
  const hasErrorDiagnostic = detail.diagnostics.some(
    (diagnostic) => diagnostic.severity === ERROR_SEVERITY
  );
  const hasNonTokenAttention = items.some((item) => item.id !== "github-token-required");

  if (hasNonTokenAttention || hasErrorDiagnostic) {
    return {
      status: "needs_attention",
      label: "Needs attention",
      description: "Review the items below before using mutation workflows in a future slice."
    };
  }

  if (items.length > 0 || detail.status === "partial_success") {
    return {
      status: "partial",
      label: "Partially checked",
      description: "Local assignment details are available, but some readiness checks did not run."
    };
  }

  const readinessStatuses = [
    detail.template.status,
    detail.template.repositoryStatus,
    detail.template.branchStatus,
    detail.grading.workflowStatus,
    detail.grading.workflowDispatch
  ];

  if (readinessStatuses.some(hasPartialStatus)) {
    return {
      status: "partial",
      label: "Partially checked",
      description: "Some readiness checks are not complete."
    };
  }

  if (readinessStatuses.some(hasAttentionStatus)) {
    return {
      status: "needs_attention",
      label: "Needs attention",
      description: "One or more readiness checks need faculty review."
    };
  }

  if (readinessStatuses.every((status) => status === "not_required")) {
    return {
      status: "not_required",
      label: "Not required",
      description: "No readiness checks are required for this assignment."
    };
  }

  if (readinessStatuses.some(hasAvailableStatus) || detail.status === "success") {
    return {
      status: "ready",
      label: "Ready",
      description: "Configured local, template, and workflow checks are available."
    };
  }

  return {
    status: "unknown",
    label: "Not checked",
    description: "Readiness has not been checked yet."
  };
};

const getDiagnosticGroupKey = (
  diagnostic: AssignmentDetailDiagnostic
): AssignmentDetailDiagnosticGroup["key"] => {
  if (diagnostic.severity === ERROR_SEVERITY) {
    return "needs_attention";
  }

  if (diagnostic.severity === WARNING_SEVERITY) {
    return "warnings";
  }

  return "info";
};

export const getDiagnosticCategory = (diagnostic: AssignmentDetailDiagnostic): string => {
  const code = diagnostic.code ?? "";
  const message = diagnostic.message.toLowerCase();

  if (code.includes("template") || message.includes("template")) {
    return "Template";
  }

  if (code.includes("workflow") || code.includes("grading") || message.includes("workflow")) {
    return "Grading workflow";
  }

  if (code.includes("report")) {
    return "Student reports";
  }

  if (code.includes("roster")) {
    return "Roster";
  }

  if (code.includes("github") || code.includes("token") || message.includes("github")) {
    return "GitHub readiness";
  }

  if (code.includes("assignment")) {
    return "Assignment config";
  }

  return "Assignment detail";
};

export const groupDiagnostics = (
  diagnostics: readonly AssignmentDetailDiagnostic[]
): readonly AssignmentDetailDiagnosticGroup[] => {
  const grouped: Record<AssignmentDetailDiagnosticGroup["key"], AssignmentDetailDiagnostic[]> = {
    needs_attention: [],
    warnings: [],
    info: []
  };

  for (const diagnostic of diagnostics) {
    grouped[getDiagnosticGroupKey(diagnostic)].push(diagnostic);
  }

  const groups: readonly AssignmentDetailDiagnosticGroup[] = [
    { key: "needs_attention", label: "Needs attention", diagnostics: grouped.needs_attention },
    { key: "warnings", label: "Warnings", diagnostics: grouped.warnings },
    { key: "info", label: "Info", diagnostics: grouped.info }
  ];

  return groups.filter((group) => group.diagnostics.length > 0);
};
