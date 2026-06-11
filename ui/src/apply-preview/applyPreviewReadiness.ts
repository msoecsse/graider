import {
  formatStatusLabel,
  hasAttentionStatus
} from "../assignment-detail/assignmentDetailReadiness";
import type {
  ApplyPreviewReadinessSummary,
  ApplyPreviewRepositoryStatus,
  NormalizedApplyPreview
} from "./applyPreviewTypes";

const ATTENTION_REPOSITORY_STATUSES: readonly ApplyPreviewRepositoryStatus[] = [
  "blocked",
  "unknown",
  "token_required"
];

const getAffectedRepositoryCount = (preview: NormalizedApplyPreview): number =>
  preview.plan.summary.wouldCreateRepositories + preview.plan.summary.wouldUpdateRepositories;

const hasTokenRequiredDiagnostic = (preview: NormalizedApplyPreview): boolean =>
  preview.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "github_token_required" ||
      diagnostic.message.toLowerCase().includes("token required")
  ) ||
  preview.plan.repositories.some(
    (row) => row.status === "token_required" || row.reason === "token_required"
  );

const collectReadinessItems = (preview: NormalizedApplyPreview): string[] => [
  ...(hasTokenRequiredDiagnostic(preview)
    ? ["GitHub token required to determine repository status"]
    : []),
  ...(hasAttentionStatus(preview.template.repositoryStatus)
    ? [`Template repository ${formatStatusLabel(preview.template.repositoryStatus)}`]
    : []),
  ...(hasAttentionStatus(preview.template.branchStatus)
    ? [`Template branch ${formatStatusLabel(preview.template.branchStatus)}`]
    : []),
  ...(hasAttentionStatus(preview.grading.workflowStatus)
    ? [`Grading workflow ${formatStatusLabel(preview.grading.workflowStatus)}`]
    : []),
  ...(hasAttentionStatus(preview.grading.workflowDispatch)
    ? [`workflow_dispatch ${formatStatusLabel(preview.grading.workflowDispatch)}`]
    : []),
  ...(preview.plan.summary.blockedRepositories > 0
    ? [`${String(preview.plan.summary.blockedRepositories)} repository rows blocked`]
    : []),
  ...(preview.plan.summary.unknownRepositories > 0
    ? [`${String(preview.plan.summary.unknownRepositories)} repository rows unknown`]
    : [])
];

export const deriveApplyPreviewReadiness = (
  preview: NormalizedApplyPreview
): ApplyPreviewReadinessSummary => {
  const items = collectReadinessItems(preview);
  const hasErrors = preview.diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const hasAttentionRows = preview.plan.repositories.some((row) =>
    ATTENTION_REPOSITORY_STATUSES.includes(row.status)
  );

  if (hasTokenRequiredDiagnostic(preview)) {
    return {
      status: "partial",
      label: "Partially checked",
      description: "GitHub token required to determine repository status.",
      items
    };
  }

  if (hasErrors || hasAttentionRows || items.length > 0) {
    return {
      status: "needs_attention",
      label: "Needs attention before apply",
      description: "Resolve blockers and unknown repository status before applying changes.",
      items
    };
  }

  return {
    status: "ready",
    label: "Ready to preview apply",
    description: `${String(getAffectedRepositoryCount(preview))} student repositories would be affected.`,
    items
  };
};

export const formatApplyPreviewRepositoryStatus = (
  status: ApplyPreviewRepositoryStatus
): string => {
  if (status === "would_create") {
    return "Would create";
  }

  if (status === "would_update") {
    return "Would update";
  }

  if (status === "would_skip") {
    return "Would skip";
  }

  if (status === "blocked") {
    return "Blocked";
  }

  if (status === "token_required") {
    return "Token required";
  }

  return "Unknown";
};
