import { loadGraiderConfig } from "../config/config-loader.js";
import type { ConfigLoadResult } from "../config/config-models.js";
import {
  getEffectiveAssignmentGrading,
  type EffectiveAssignmentGrading
} from "../config/effective-grading.js";
import type { GitHubClient } from "../github/github-client.js";
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
import { createDugiteGitWorkspaceFactory } from "../git/dugite-git-workspace-context.js";
import { isObjectId, type ObjectId } from "../git/git-workspace.js";
import {
  generatedSubmissionPaths,
  readStudentSubmissionTree,
  submissionTreesDiffer,
  type SubmissionTreeReader
} from "./submission-content.js";

const MAX_FEEDBACK_COMMIT_COMPARISONS = 100;

interface EvidenceWorkspace extends SubmissionTreeReader {
  resolveHead(): Promise<string>;
  listFirstParentCommitTrees(anchor: ObjectId): Promise<readonly { readonly commit: string }[]>;
}

export interface GradingStudentEvidenceContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha?: string;
  readonly repositoryRoot?: string;
}

export interface PreparedGradingStudentEvidenceContext {
  readonly studentId: string;
  readonly submissionCommitSha: string;
  readonly previousSubmissionCommitShas?: readonly string[];
  /** Locally proven consecutive revisions with identical submission content. */
  readonly equivalentSubmissionCommitShas?: readonly string[];
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
  readonly retrieve: typeof retrieveGradingEvidence;
  readonly openWorkspace: (repositoryRoot: string) => Promise<EvidenceWorkspace>;
}

const dependencies: GradingStudentEvidenceContextDependencies = {
  loadConfig: loadGraiderConfig,
  loadState: loadGradingState,
  loadAssignmentManifest: (manifestPath) => loadManifest(manifestPath, { required: true }),
  retrieve: retrieveGradingEvidence,
  openWorkspace: (repositoryRoot) => createDugiteGitWorkspaceFactory().open(repositoryRoot)
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
      ...historicalEvidenceRevisions(
        resolved.loadState({
          courseRoot: request.courseFolderPath,
          termCode: request.termCode,
          assignmentSlug: request.assignmentSlug,
          studentId: request.studentId
        })
      ),
      repository: { owner, repo: mapping.repositoryName },
      grading
    }
  };
};

export const historicalEvidenceRevisions = (
  loaded: ReturnType<typeof loadGradingState>
): { readonly previousSubmissionCommitShas?: readonly string[] } =>
  loaded.status === "success" && loaded.value.repositoryUpdates !== undefined
    ? {
        previousSubmissionCommitShas: [...loaded.value.repositoryUpdates]
          .reverse()
          .map((update) => update.previousSha)
      }
    : {};

/** Read-only reload preparation. Never use repository-update history as proof that
 * an old artifact still grades the current source. Keep the saved grading anchor
 * and all faculty edits intact; only evidence selection accepts equivalent SHAs.
 */
export const prepareLocalGradingStudentEvidenceContext = async (
  request: GradingStudentEvidenceContextRequest,
  overrides: Partial<GradingStudentEvidenceContextDependencies> = {}
): Promise<PrepareGradingStudentEvidenceContextResult> => {
  const resolved = { ...dependencies, ...overrides };
  let prepared = prepareGradingStudentEvidenceContext(request, resolved);
  if (prepared.status !== "success" && prepared.status !== "submission_changed") return prepared;
  const equivalentShas: string[] = [];
  if (
    request.repositoryRoot !== undefined &&
    request.currentSubmissionCommitSha !== undefined &&
    isObjectId(request.currentSubmissionCommitSha)
  ) {
    try {
      const workspace = await resolved.openWorkspace(request.repositoryRoot);
      const head = request.currentSubmissionCommitSha;
      if ((await workspace.resolveHead()) !== head)
        return { status: "submission_changed", studentId: request.studentId };
      const history = await workspace.listFirstParentCommitTrees(head);
      if (history[0]?.commit === head) {
        const generatedPaths = generatedSubmissionPaths({
          courseRoot: request.courseFolderPath,
          termCode: request.termCode,
          assignmentSlug: request.assignmentSlug,
          studentId: request.studentId
        });
        let tree = await readStudentSubmissionTree(workspace, head, generatedPaths);
        equivalentShas.push(head);
        let comparing = true;
        const count = Math.min(history.length, MAX_FEEDBACK_COMMIT_COMPARISONS + 1);
        for (let index = 1; index < count && comparing; index += 1) {
          const revision = history[index]?.commit;
          if (revision === undefined || !isObjectId(revision)) {
            comparing = false;
          } else {
            const previousTree = await readStudentSubmissionTree(
              workspace,
              revision,
              generatedPaths
            );
            if (submissionTreesDiffer(tree, previousTree)) {
              comparing = false;
            } else {
              equivalentShas.push(revision);
              tree = previousTree;
            }
          }
        }
      }
      if ((await workspace.resolveHead()) !== head)
        return { status: "submission_changed", studentId: request.studentId };
    } catch {
      // No local proof: retain exact-SHA behavior and persisted/offline anchors.
      equivalentShas.length = 0;
    }
  }
  if (prepared.status === "submission_changed") {
    const saved = resolved.loadState({
      courseRoot: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId: request.studentId
    });
    if (saved.status !== "success" || !equivalentShas.includes(saved.value.submissionCommitSha))
      return prepared;
    prepared = prepareGradingStudentEvidenceContext(
      {
        ...request,
        currentSubmissionCommitSha: saved.value.submissionCommitSha
      },
      resolved
    );
  }
  if (prepared.status !== "success") return prepared;
  const value: PreparedGradingStudentEvidenceContext = {
    studentId: prepared.value.studentId,
    submissionCommitSha: prepared.value.submissionCommitSha,
    repository: prepared.value.repository,
    grading: prepared.value.grading
  };
  return {
    status: "success",
    value: {
      ...value,
      ...(equivalentShas.length > 0 ? { equivalentSubmissionCommitShas: equivalentShas } : {})
    }
  };
};

export const retrievePreparedGradingStudentEvidence = async (
  prepared: PreparedGradingStudentEvidenceContext,
  githubClient: GitHubClient,
  overrides: Partial<GradingStudentEvidenceContextDependencies> = {}
): Promise<GradingEvidenceRetrievalResult> => {
  const resolved = { ...dependencies, ...overrides };
  const retrieve = (submissionCommitSha: string) =>
    resolved.retrieve({
      githubClient,
      repository: prepared.repository,
      grading: prepared.grading,
      submissionCommitSha,
      ...(prepared.equivalentSubmissionCommitShas === undefined
        ? {}
        : {
            equivalentSubmissionCommitShas: prepared.equivalentSubmissionCommitShas
          })
    });
  const current = await retrieve(prepared.submissionCommitSha);
  if (
    current.status !== "failure" ||
    !["workflow_run_not_found", "evidence_artifact_missing", "evidence_artifact_expired"].includes(
      current.error.code
    )
  )
    return current;
  for (const sha of prepared.previousSubmissionCommitShas ?? []) {
    const previous = await retrieve(sha);
    if (previous.status === "success") return previous;
  }
  return current;
};

export const gradingStudentEvidenceContextBackend = {
  prepareGradingStudentEvidenceContext: prepareLocalGradingStudentEvidenceContext,
  retrievePreparedGradingStudentEvidence
};
