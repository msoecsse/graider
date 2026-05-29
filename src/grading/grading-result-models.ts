import type { Diagnostic } from "../diagnostics/diagnostic.js";

export const SUPPORTED_GRADING_RESULT_SCHEMA_VERSION = 1;

export const WORKFLOW_STATUSES = [
  "completed",
  "not_run",
  "missing_workflow",
  "workflow_failed_no_results",
  "not_configured",
  "unknown"
] as const;

export const GRADING_RESULT_STATUSES = [
  "passed",
  "failed",
  "error",
  "skipped",
  "missing_artifact",
  "missing_result_file",
  "invalid_result_file",
  "not_run",
  "missing_workflow",
  "workflow_failed_no_results",
  "not_configured",
  "unknown"
] as const;

export const ARTIFACT_STATUSES = ["found", "missing", "not_checked"] as const;

export const RESULT_FILE_STATUSES = ["valid", "missing", "invalid", "not_checked"] as const;

export const GRADING_CHECK_STATUSES = ["passed", "failed", "error", "skipped"] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type GradingResultStatus = (typeof GRADING_RESULT_STATUSES)[number];
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];
export type ResultFileStatus = (typeof RESULT_FILE_STATUSES)[number];
export type GradingCheckStatus = (typeof GRADING_CHECK_STATUSES)[number];

export type WorkflowRunStatus = "queued" | "in_progress" | "completed" | "not_run" | "unknown";

export type WorkflowRunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | null;

export interface GradingResults {
  schemaVersion: typeof SUPPORTED_GRADING_RESULT_SCHEMA_VERSION;
  studentId?: string;
  githubUsername?: string;
  assignmentSlug?: string;
  generatedAt?: string;
  commit?: string;
  status: GradingResultStatus;
  score?: number | null;
  maxScore?: number | null;
  summary?: string;
  checks: GradingCheckResult[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

export interface GradingCheckResult {
  name: string;
  status: GradingCheckStatus;
  message?: string;
  pointsEarned?: number | null;
  pointsPossible?: number | null;
  details?: string[];
}

export interface GradingResultValidationResult {
  result?: GradingResults;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

export interface GradingStatusMappingInput {
  gradingEnabled: boolean;
  workflowConfigured: boolean;
  workflowFound: boolean;
  workflowRunStatus?: WorkflowRunStatus;
  workflowRunConclusion?: WorkflowRunConclusion;
  artifactStatus: ArtifactStatus;
  resultFileStatus: ResultFileStatus;
  parsedResultStatus?: GradingResultStatus;
}

export interface GradingStatusMapping {
  workflowStatus: WorkflowStatus;
  resultStatus: GradingResultStatus;
  artifactStatus: ArtifactStatus;
  resultFileStatus: ResultFileStatus;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}
