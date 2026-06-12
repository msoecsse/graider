import {
  formatStatusLabel,
  hasAttentionStatus
} from "../assignment-detail/assignmentDetailReadiness";
import type { GradePreviewRepositoryStatus, NormalizedGradePreview } from "./gradePreviewTypes";

export const formatGradePreviewRepositoryStatus = (
  status: GradePreviewRepositoryStatus
): string => {
  if (status === "would_dispatch") {
    return "Would dispatch";
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

export const hasGradePreviewTokenRequirement = (preview: NormalizedGradePreview): boolean =>
  preview.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "github_token_required" ||
      diagnostic.message.toLowerCase().includes("token required")
  ) ||
  preview.plan.repositories.some(
    (row) => row.status === "token_required" || row.reason === "token_required"
  );

export const getGradePreviewStatusItems = (preview: NormalizedGradePreview): readonly string[] => [
  ...(hasGradePreviewTokenRequirement(preview)
    ? ["GitHub token required to determine dispatchability"]
    : []),
  ...(hasAttentionStatus(preview.grading.workflowDispatch)
    ? [`workflow_dispatch ${formatStatusLabel(preview.grading.workflowDispatch)}`]
    : []),
  ...(preview.plan.summary.blocked > 0
    ? [`${String(preview.plan.summary.blocked)} repository rows blocked`]
    : []),
  ...(preview.plan.summary.unknown > 0
    ? [`${String(preview.plan.summary.unknown)} repository rows unknown`]
    : [])
];

export const getGradePreviewReadinessLabel = (preview: NormalizedGradePreview): string => {
  if (hasGradePreviewTokenRequirement(preview)) {
    return "Partially checked";
  }

  if (
    preview.status === "failure" ||
    preview.diagnostics.some((diagnostic) => diagnostic.severity === "error") ||
    preview.plan.summary.blocked > 0 ||
    preview.plan.summary.unknown > 0 ||
    hasAttentionStatus(preview.grading.workflowDispatch)
  ) {
    return "Needs attention before dispatch";
  }

  return "Ready for dispatch preview";
};

export const getGradeDispatchBlockerReasons = (
  preview: NormalizedGradePreview
): readonly string[] => {
  const statusItems = getGradePreviewStatusItems(preview);
  const hasErrorDiagnostics = preview.diagnostics.some(
    (diagnostic) => diagnostic.severity === "error"
  );
  const reasons = [
    ...statusItems,
    ...(hasErrorDiagnostics ? ["Resolve error diagnostics before dispatching grading"] : []),
    ...(preview.status !== "success" ? ["Refresh preview until status is success"] : []),
    ...(preview.plan.summary.wouldDispatch === 0
      ? ["No repositories are ready for grading dispatch"]
      : []),
    ...(!preview.grading.enabled ? ["Grading is disabled for this assignment"] : [])
  ];

  return [...new Set(reasons)];
};

export const canDispatchGradePreview = (preview: NormalizedGradePreview): boolean =>
  getGradeDispatchBlockerReasons(preview).length === 0;
