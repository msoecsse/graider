import type { EffectiveAssignmentGrading } from "../config/effective-grading.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError } from "../github/github-errors.js";
import type { GitHubWorkflowRunForCommit } from "../github/github-models.js";
import {
  parseGradingEvidenceArtifact,
  type GradingEvidenceArtifactError
} from "./grading-evidence-artifact.js";
import type { GradingEvidence, GradingEvidenceParseError } from "./grading-evidence-parser.js";
import { isManualManagedGradingWorkflowEligible } from "../workflows/manual-managed-grading-workflow.js";
import { GRAIDER_MANAGED_WORKFLOW_PATH } from "../workflows/managed-workflow-policy.js";

const BYTES_PER_MEBIBYTE = 1_048_576;
const MAX_GRADING_EVIDENCE_ARCHIVE_DOWNLOAD_MEBIBYTES = 32;

export const MAX_GRADING_EVIDENCE_ARCHIVE_DOWNLOAD_BYTES =
  MAX_GRADING_EVIDENCE_ARCHIVE_DOWNLOAD_MEBIBYTES * BYTES_PER_MEBIBYTE;
export const DEFAULT_GRADING_EVIDENCE_ARTIFACT_NAME = "grading-results";
export const MAX_RECENT_GRADING_WORKFLOW_RUNS = 20;

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/iu;

export type GradingEvidenceRetrievalErrorCode =
  | "submission_sha_invalid"
  | "workflow_run_not_found"
  | "actions_forbidden"
  | "evidence_artifact_missing"
  | "evidence_artifact_expired"
  | "evidence_artifact_ambiguous"
  | "evidence_artifact_too_large"
  | "evidence_artifact_download_failed"
  | "evidence_identity_mismatch"
  | "evidence_retrieval_failed";

export interface GradingEvidenceRetrievalError {
  readonly code: GradingEvidenceRetrievalErrorCode;
  readonly message: string;
}

export interface GradingEvidenceRetrievalInput {
  readonly githubClient: GitHubClient;
  readonly repository: {
    readonly owner: string;
    readonly repo: string;
  };
  readonly grading: EffectiveAssignmentGrading | undefined;
  readonly submissionCommitSha: string;
}

export interface TrustedGradingEvidence {
  readonly runId: number;
  readonly runAttempt: number;
  readonly artifactId: number;
  readonly evidence: GradingEvidence;
}

export type GradingEvidenceRetrievalResult =
  | { readonly status: "success"; readonly value: TrustedGradingEvidence }
  | { readonly status: "not_applicable"; readonly reason: "managed_preset_not_enabled" }
  | {
      readonly status: "failure";
      readonly error:
        | GradingEvidenceRetrievalError
        | GradingEvidenceArtifactError
        | GradingEvidenceParseError;
    };

const failure = (
  code: GradingEvidenceRetrievalErrorCode,
  message: string
): GradingEvidenceRetrievalResult => ({ status: "failure", error: { code, message } });

const githubFailure = (error: unknown, fallbackCode: GradingEvidenceRetrievalErrorCode) =>
  error instanceof GitHubClientError && error.kind === "permission_denied"
    ? failure(
        "actions_forbidden",
        "GitHub denied access to grading workflow runs or artifacts. Check Actions read permission."
      )
    : failure(fallbackCode, "GitHub grading evidence could not be retrieved safely.");

const completionTime = (run: GitHubWorkflowRunForCommit): number => {
  const parsed = Date.parse(run.completedAt ?? run.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Latest completion wins, then the highest run attempt, then the highest run ID. */
export const selectAuthoritativeGradingWorkflowRun = (
  runs: readonly GitHubWorkflowRunForCommit[]
): GitHubWorkflowRunForCommit | undefined =>
  [...runs].sort((left, right) => {
    const completionDifference = completionTime(right) - completionTime(left);
    if (completionDifference !== 0) return completionDifference;
    const attemptDifference = right.runAttempt - left.runAttempt;
    return attemptDifference === 0 ? right.id - left.id : attemptDifference;
  })[0];

export const retrieveGradingEvidence = async (
  input: GradingEvidenceRetrievalInput
): Promise<GradingEvidenceRetrievalResult> => {
  if (input.grading === undefined || !isManualManagedGradingWorkflowEligible(input.grading)) {
    return { status: "not_applicable", reason: "managed_preset_not_enabled" };
  }
  if (!COMMIT_SHA_PATTERN.test(input.submissionCommitSha)) {
    return failure("submission_sha_invalid", "The canonical submission commit SHA is invalid.");
  }
  const workflowPath = input.grading.workflow ?? GRAIDER_MANAGED_WORKFLOW_PATH;

  let runs: GitHubWorkflowRunForCommit[];
  try {
    runs = await input.githubClient.listWorkflowRunsForCommit({
      owner: input.repository.owner,
      repo: input.repository.repo,
      workflowPath,
      limit: MAX_RECENT_GRADING_WORKFLOW_RUNS
    });
  } catch (error: unknown) {
    return githubFailure(error, "evidence_retrieval_failed");
  }

  const candidates = [...runs]
    .filter((run) => run.status === "completed" && run.workflowPath === workflowPath)
    .sort((left, right) => {
      const completionDifference = completionTime(right) - completionTime(left);
      if (completionDifference !== 0) return completionDifference;
      const attemptDifference = right.runAttempt - left.runAttempt;
      return attemptDifference === 0 ? right.id - left.id : attemptDifference;
    });
  if (candidates.length === 0) {
    return failure(
      "workflow_run_not_found",
      "No completed managed grading workflow run exists for this submission commit."
    );
  }
  const artifactName = input.grading.artifact ?? DEFAULT_GRADING_EVIDENCE_ARTIFACT_NAME;
  let foundNamedArtifact = false;
  let candidateFailure: GradingEvidenceRetrievalResult | undefined;
  for (const candidate of candidates) {
    let artifacts;
    try {
      artifacts = await input.githubClient.listWorkflowRunArtifacts({
        owner: input.repository.owner,
        repo: input.repository.repo,
        runId: candidate.id
      });
    } catch (error: unknown) {
      return githubFailure(error, "evidence_retrieval_failed");
    }
    const matchingArtifacts = artifacts.filter((artifact) => artifact.name === artifactName);
    if (matchingArtifacts.length === 0) continue;
    foundNamedArtifact = true;
    if (matchingArtifacts.length > 1)
      return failure(
        "evidence_artifact_ambiguous",
        "The selected grading workflow run has multiple configured evidence artifacts."
      );
    const artifact = matchingArtifacts[0];
    if (artifact === undefined) continue;
    if (artifact.expired) {
      candidateFailure ??= failure(
        "evidence_artifact_expired",
        "The grading evidence artifact has expired."
      );
      continue;
    }
    if (artifact.id <= 0 || artifact.sizeInBytes < 0)
      return failure("evidence_retrieval_failed", "GitHub returned invalid artifact metadata.");
    if (artifact.sizeInBytes > MAX_GRADING_EVIDENCE_ARCHIVE_DOWNLOAD_BYTES)
      return failure(
        "evidence_artifact_too_large",
        "The grading evidence artifact exceeds the supported download size."
      );
    let archiveBytes: Uint8Array;
    try {
      archiveBytes = await input.githubClient.downloadArtifactArchive({
        owner: input.repository.owner,
        repo: input.repository.repo,
        artifactId: artifact.id
      });
    } catch (error: unknown) {
      return githubFailure(error, "evidence_artifact_download_failed");
    }
    if (archiveBytes.byteLength > MAX_GRADING_EVIDENCE_ARCHIVE_DOWNLOAD_BYTES)
      return failure(
        "evidence_artifact_too_large",
        "The downloaded grading evidence artifact exceeds the supported size."
      );
    const parsed = await parseGradingEvidenceArtifact(archiveBytes);
    if (parsed.status === "failure") {
      candidateFailure ??= parsed;
      continue;
    }
    const evidenceMetadata = parsed.value.metadata;
    if (
      evidenceMetadata.submissionCommitSha !== input.submissionCommitSha ||
      evidenceMetadata.workflowRunId !== String(candidate.id) ||
      evidenceMetadata.workflowRunAttempt !== String(candidate.runAttempt)
    )
      continue;
    return {
      status: "success",
      value: {
        runId: candidate.id,
        runAttempt: candidate.runAttempt,
        artifactId: artifact.id,
        evidence: parsed.value
      }
    };
  }
  return foundNamedArtifact
    ? (candidateFailure ??
        failure(
          "evidence_identity_mismatch",
          "The grading evidence identity does not match the selected submission workflow run."
        ))
    : failure(
        "evidence_artifact_missing",
        "No recent grading workflow run has the configured evidence artifact."
      );
};
