import type { EffectiveAssignmentGrading } from "../config/effective-grading.js";
import type { GitHubClient } from "../github/github-client.js";
import type { GitHubWorkflowRun } from "../github/github-models.js";
import { decodeGradingEvidenceArtifact } from "../grading/grading-evidence-artifact.js";
import {
  parseGradingEvidence,
  parseGradingEvidenceMetadata
} from "../grading/grading-evidence-parser.js";
import { MAX_GRADING_EVIDENCE_ARCHIVE_DOWNLOAD_BYTES } from "../grading/grading-evidence-retrieval.js";
import { parseGradingResultsJsonText } from "../grading/grading-result-validator.js";

export type GradeStatusResult =
  | "not_checked"
  | "passed"
  | "failed"
  | "skipped"
  | "missing"
  | "invalid"
  | "expired"
  | "stale"
  | "contradictory"
  | "unavailable";

const SHA_PATTERN = /^[0-9a-f]{40}$/iu;
const FIRST_RUN_ATTEMPT = 1;

/** One selected run, one bounded artifact; never fall back to an older pass. */
export const readGradeStatusResult = async (input: {
  readonly githubClient: GitHubClient;
  readonly owner: string;
  readonly repo: string;
  readonly grading: EffectiveAssignmentGrading;
  readonly run: GitHubWorkflowRun;
  readonly submissionSha: string | undefined;
  readonly assignmentSlug: string;
  readonly studentIds: readonly string[];
  readonly githubUsernames: readonly string[];
}): Promise<GradeStatusResult> => {
  const { githubClient, owner, repo, grading, run, submissionSha } = input;
  if (submissionSha === undefined || !SHA_PATTERN.test(submissionSha)) return "unavailable";
  if (!Number.isSafeInteger(run.id) || run.id <= 0) return "unavailable";
  if (!Number.isSafeInteger(run.runAttempt) || (run.runAttempt ?? 0) < FIRST_RUN_ATTEMPT)
    return "unavailable";
  try {
    const artifacts = await githubClient.listWorkflowRunArtifacts({ owner, repo, runId: run.id });
    const matches = artifacts.filter((artifact) => artifact.name === grading.artifact);
    if (matches.length === 0) return "missing";
    if (matches.length !== 1) return "invalid";
    const artifact = matches[0];
    if (artifact === undefined) return "missing";
    if (artifact.expired) return "expired";
    if (
      !Number.isSafeInteger(artifact.id) ||
      artifact.id <= 0 ||
      !Number.isSafeInteger(artifact.sizeInBytes) ||
      artifact.sizeInBytes < 0 ||
      artifact.sizeInBytes > MAX_GRADING_EVIDENCE_ARCHIVE_DOWNLOAD_BYTES
    )
      return "invalid";
    const archive = await githubClient.downloadArtifactArchive({
      owner,
      repo,
      artifactId: artifact.id
    });
    if (archive.byteLength > MAX_GRADING_EVIDENCE_ARCHIVE_DOWNLOAD_BYTES) return "invalid";
    const decoded = await decodeGradingEvidenceArtifact(
      archive,
      grading.result_file ?? "grading-results.json"
    );
    if (decoded.status === "failure") return "invalid";
    const { metadataJson, resultJson } = decoded.value;
    let evidenceFailed = false;
    let evidenceIncomplete = false;
    if (metadataJson.length > 0) {
      const metadata = parseGradingEvidenceMetadata(metadataJson);
      if ("code" in metadata) return "invalid";
      if (
        metadata.submissionCommitSha !== submissionSha ||
        metadata.workflowRunId !== String(run.id) ||
        metadata.workflowRunAttempt !== String(run.runAttempt)
      )
        return "stale";
      const evidence = parseGradingEvidence(decoded.value);
      if (evidence.status === "failure") return "contradictory";
      evidenceFailed =
        [metadata.compile, metadata.junit, metadata.checkstyle].some(
          (phase) => phase.outcome === "failure"
        ) ||
        evidence.value.junit.summary.failed > 0 ||
        evidence.value.junit.summary.errors > 0 ||
        evidence.value.checkstyle.violationCount > 0;
      evidenceIncomplete = [metadata.compile, metadata.junit, metadata.checkstyle].some(
        (phase) => phase.outcome === "skipped"
      );
    } else if (
      run.event !== "push" ||
      run.runAttempt !== FIRST_RUN_ATTEMPT ||
      grading.preset === "java-junit-checkstyle"
    ) {
      // Dispatch head_sha describes the workflow ref, not necessarily the graded checkout.
      // Reruns can retain artifacts from previous attempts, so they require metadata too.
      return "unavailable";
    }
    if (metadataJson.length === 0 && run.headSha !== submissionSha) return "stale";
    if (resultJson === undefined) return "missing";
    const validated = parseGradingResultsJsonText(resultJson);
    const result = validated.result;
    if (result === undefined) return "invalid";
    if (
      (result.commit !== undefined && result.commit !== submissionSha) ||
      (result.assignmentSlug !== undefined && result.assignmentSlug !== input.assignmentSlug) ||
      (result.studentId !== undefined && !input.studentIds.includes(result.studentId)) ||
      (result.githubUsername !== undefined &&
        !input.githubUsernames.some(
          (username) => username.toLowerCase() === result.githubUsername?.toLowerCase()
        ))
    )
      return "stale";
    // Explicit check failures take precedence even if the overall field says passed.
    if (
      result.status === "failed" ||
      result.status === "error" ||
      result.checks.some((check) => check.status === "failed" || check.status === "error")
    )
      return "failed";
    if (result.status === "passed") {
      if (
        result.checks.length === 0 ||
        (grading.preset === "java-junit-checkstyle" &&
          !["CheckStyle", "Unit Tests"].every((name) =>
            result.checks.some((check) => check.name === name && check.status === "passed")
          )) ||
        evidenceFailed ||
        evidenceIncomplete ||
        result.errors.length > 0 ||
        result.checks.some((check) => check.status !== "passed")
      )
        return "contradictory";
      return "passed";
    }
    return result.status === "skipped" ? "skipped" : "invalid";
  } catch {
    return "unavailable";
  }
};
