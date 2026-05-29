import {
  ARTIFACT_STATUSES,
  GRADING_RESULT_STATUSES,
  RESULT_FILE_STATUSES,
  WORKFLOW_STATUSES,
  type ArtifactStatus,
  type GradingResultStatus,
  type GradingStatusMapping,
  type GradingStatusMappingInput,
  type ResultFileStatus,
  type WorkflowRunConclusion,
  type WorkflowStatus
} from "./grading-result-models.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { DiagnosticCode, createWarningDiagnostic } from "../diagnostics/error-catalog.js";

const FAILED_WORKFLOW_CONCLUSIONS = new Set<Exclude<WorkflowRunConclusion, null>>([
  "failure",
  "cancelled",
  "timed_out",
  "action_required"
]);

const isOneOf = <T extends readonly string[]>(values: T, value: string): value is T[number] =>
  values.includes(value);

export const isWorkflowStatus = (value: string): value is WorkflowStatus =>
  isOneOf(WORKFLOW_STATUSES, value);

export const isGradingResultStatus = (value: string): value is GradingResultStatus =>
  isOneOf(GRADING_RESULT_STATUSES, value);

export const isArtifactStatus = (value: string): value is ArtifactStatus =>
  isOneOf(ARTIFACT_STATUSES, value);

export const isResultFileStatus = (value: string): value is ResultFileStatus =>
  isOneOf(RESULT_FILE_STATUSES, value);

const createMapping = (
  workflowStatus: WorkflowStatus,
  resultStatus: GradingResultStatus,
  artifactStatus: ArtifactStatus,
  resultFileStatus: ResultFileStatus,
  warnings: Diagnostic[] = []
): GradingStatusMapping => ({
  workflowStatus,
  resultStatus,
  artifactStatus,
  resultFileStatus,
  warnings,
  errors: []
});

const isFailedWorkflowConclusion = (conclusion: WorkflowRunConclusion | undefined): boolean =>
  conclusion !== undefined && conclusion !== null && FAILED_WORKFLOW_CONCLUSIONS.has(conclusion);

export const mapGradingStatus = (input: GradingStatusMappingInput): GradingStatusMapping => {
  if (!input.gradingEnabled) {
    return createMapping("not_configured", "not_configured", "not_checked", "not_checked");
  }

  if (!input.workflowConfigured || !input.workflowFound) {
    return createMapping("missing_workflow", "missing_workflow", "not_checked", "not_checked");
  }

  if (input.workflowRunStatus === undefined || input.workflowRunStatus === "not_run") {
    return createMapping("not_run", "not_run", "not_checked", "not_checked");
  }

  const workflowFailed = isFailedWorkflowConclusion(input.workflowRunConclusion);

  if (workflowFailed && input.resultFileStatus !== "valid") {
    return createMapping(
      "workflow_failed_no_results",
      "workflow_failed_no_results",
      input.artifactStatus,
      input.resultFileStatus
    );
  }

  if (input.artifactStatus === "missing") {
    return createMapping("completed", "missing_artifact", "missing", "not_checked");
  }

  if (input.resultFileStatus === "missing") {
    return createMapping("completed", "missing_result_file", "found", "missing");
  }

  if (input.resultFileStatus === "invalid") {
    return createMapping("completed", "invalid_result_file", "found", "invalid");
  }

  if (input.resultFileStatus === "valid") {
    const resultStatus = input.parsedResultStatus ?? "unknown";
    const warnings = workflowFailed
      ? [
          createWarningDiagnostic(
            DiagnosticCode.GradingWorkflowFailedWithResults,
            "Workflow failed, but a valid grading result file was found; preserving parsed result status.",
            {
              workflowRunConclusion: input.workflowRunConclusion,
              resultStatus
            }
          )
        ]
      : [];

    return createMapping("completed", resultStatus, "found", "valid", warnings);
  }

  return createMapping("unknown", "unknown", input.artifactStatus, input.resultFileStatus);
};
