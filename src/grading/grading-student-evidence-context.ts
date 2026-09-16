import { loadGraiderConfig } from "../config/config-loader.js";
import type { ConfigLoadResult } from "../config/config-models.js";
import {
  getEffectiveAssignmentGrading,
  type EffectiveAssignmentGrading
} from "../config/effective-grading.js";
import {
  createGitHubClient,
  type GitHubClientFactoryOptions
} from "../github/github-client-factory.js";
import { loadManifest, type ManifestLoadResult } from "../manifest/manifest-loader.js";
import { createManifestPath } from "../manifest/manifest-paths.js";
import {
  findStudentRepositoryMapping,
  normalizeManifestRepositories
} from "../manifest/repository-targets.js";
import { isManualManagedGradingWorkflowEligible } from "../workflows/manual-managed-grading-workflow.js";
import {
  retrieveGradingEvidence,
  type GradingEvidenceRetrievalResult
} from "./grading-evidence-retrieval.js";
import {
  resolveGradingSubmissionContext,
  type GradingSubmissionContextDependencies
} from "./grading-submission-context.js";
import { loadGradingState } from "./grading-state.js";

export interface GradingStudentEvidenceContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha?: string;
}

export interface PreparedGradingStudentEvidenceContext {
  readonly studentId: string;
  readonly submissionCommitSha: string;
  readonly repository: { readonly owner: string; readonly repo: string };
  readonly grading: EffectiveAssignmentGrading;
}

export type PrepareGradingStudentEvidenceContextResult =
  | { readonly status: "success"; readonly value: PreparedGradingStudentEvidenceContext }
  | { readonly status: "not_applicable"; readonly studentId: string }
  | { readonly status: "submission_changed"; readonly studentId: string }
  | {
      readonly status: "assignment_config_error" | "grading_state_error";
      readonly studentId: string;
      readonly code: string;
    }
  | { readonly status: "submission_commit_unavailable" }
  | { readonly status: "repository_not_recorded" | "repository_unavailable" };

export interface GradingStudentEvidenceContextDependencies extends GradingSubmissionContextDependencies {
  readonly loadConfig: (request: {
    readonly cwd: string;
    readonly assignmentFile: string;
  }) => ConfigLoadResult;
  readonly loadAssignmentManifest: (manifestPath: string) => ManifestLoadResult;
  readonly createClient: (
    options: GitHubClientFactoryOptions
  ) => ReturnType<typeof createGitHubClient>;
  readonly retrieve: typeof retrieveGradingEvidence;
}

const dependencies: GradingStudentEvidenceContextDependencies = {
  loadConfig: loadGraiderConfig,
  loadState: loadGradingState,
  loadAssignmentManifest: (manifestPath) => loadManifest(manifestPath, { required: true }),
  createClient: createGitHubClient,
  retrieve: retrieveGradingEvidence
};

const assignmentFile = (termCode: string, assignmentSlug: string): string =>
  `terms/${termCode}/assignments/${assignmentSlug}/assignment.yml`;

export const prepareGradingStudentEvidenceContext = (
  request: GradingStudentEvidenceContextRequest,
  overrides: Partial<GradingStudentEvidenceContextDependencies> = {}
): PrepareGradingStudentEvidenceContextResult => {
  const resolved = { ...dependencies, ...overrides };
  const submission = resolveGradingSubmissionContext(
    request,
    { loadState: resolved.loadState },
    { deferMissingSubmissionCommit: true }
  );
  if (submission.status !== "success" && submission.status !== "missing_submission_commit")
    return submission;

  const config = resolved.loadConfig({
    cwd: request.courseFolderPath,
    assignmentFile: assignmentFile(request.termCode, request.assignmentSlug)
  });
  if (
    config.status === "failure" ||
    config.config.summary.termCode !== request.termCode ||
    config.config.summary.assignmentSlug !== request.assignmentSlug
  )
    return {
      status: "assignment_config_error",
      studentId: request.studentId,
      code: "assignment_config_error"
    };

  const grading = getEffectiveAssignmentGrading(config.config);
  if (!isManualManagedGradingWorkflowEligible(grading))
    return { status: "not_applicable", studentId: request.studentId };

  if (submission.status === "missing_submission_commit")
    return { status: "submission_commit_unavailable" };
  const submissionCommitSha = submission.value.submissionCommitSha;

  const manifest = resolved.loadAssignmentManifest(
    createManifestPath(request.courseFolderPath, request.termCode, request.assignmentSlug)
      .absolutePath
  );
  if (manifest.status === "missing") return { status: "repository_not_recorded" };
  if (manifest.status !== "loaded") return { status: "repository_unavailable" };
  if (
    manifest.manifest.assignment.termCode !== request.termCode ||
    manifest.manifest.assignment.assignmentSlug !== request.assignmentSlug
  )
    return { status: "repository_unavailable" };

  const normalized = normalizeManifestRepositories(manifest.manifest);
  const mapping = findStudentRepositoryMapping(normalized, request.studentId);
  if (mapping === undefined) return { status: "repository_not_recorded" };
  const owner =
    manifest.manifest.schemaVersion === 1
      ? manifest.manifest.repositories.find((record) => record.studentId === request.studentId)
          ?.repository.owner
      : config.config.course.github.organization;
  if (owner === undefined || owner.trim() === "" || mapping.repositoryName.trim() === "")
    return { status: "repository_unavailable" };

  return {
    status: "success",
    value: {
      studentId: request.studentId,
      submissionCommitSha,
      repository: { owner, repo: mapping.repositoryName },
      grading
    }
  };
};

export const retrievePreparedGradingStudentEvidence = async (
  prepared: PreparedGradingStudentEvidenceContext,
  resolvedGithubToken: string,
  overrides: Partial<GradingStudentEvidenceContextDependencies> = {}
): Promise<GradingEvidenceRetrievalResult> => {
  const resolved = { ...dependencies, ...overrides };
  return await resolved.retrieve({
    githubClient: resolved.createClient({ token: resolvedGithubToken }),
    repository: prepared.repository,
    grading: prepared.grading,
    submissionCommitSha: prepared.submissionCommitSha
  });
};

export const gradingStudentEvidenceContextBackend = {
  prepareGradingStudentEvidenceContext,
  retrievePreparedGradingStudentEvidence
};
