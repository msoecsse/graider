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
import {
  isManualManagedGradingWorkflowEligible,
  manuallyInstallAndDispatchManagedGradingWorkflow,
  type ManualManagedGradingWorkflowResult
} from "../workflows/manual-managed-grading-workflow.js";
import {
  resolveGradingSubmissionContext,
  type GradingSubmissionContextDependencies
} from "./grading-submission-context.js";
import { loadGradingState } from "./grading-state.js";

export interface GradingStudentWorkflowRepairContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha?: string;
}

export interface PreparedGradingStudentWorkflowRepairContext {
  readonly studentId: string;
  readonly repository: { readonly owner: string; readonly name: string };
  readonly grading: EffectiveAssignmentGrading;
  readonly submissionCommitSha: string;
}

export type PrepareGradingStudentWorkflowRepairResult =
  | { readonly status: "success"; readonly value: PreparedGradingStudentWorkflowRepairContext }
  | {
      readonly status:
        | "assignment_config_error"
        | "grading_not_eligible"
        | "grading_state_error"
        | "submission_commit_unavailable"
        | "repository_not_recorded"
        | "repository_unavailable";
      readonly studentId: string;
    };

export type ExecutePreparedGradingStudentWorkflowRepairResult =
  | {
      readonly status: "ready";
      readonly studentId: string;
      readonly repositoryFullName: string;
    }
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly result: ManualManagedGradingWorkflowResult;
    }
  | {
      readonly status: "repository_unavailable" | "github_operation_failed";
      readonly studentId: string;
    };

export interface GradingStudentWorkflowRepairContextDependencies extends GradingSubmissionContextDependencies {
  readonly loadConfig: (request: {
    readonly cwd: string;
    readonly assignmentFile: string;
  }) => ConfigLoadResult;
  readonly loadAssignmentManifest: (manifestPath: string) => ManifestLoadResult;
  readonly createClient: (
    options: GitHubClientFactoryOptions
  ) => ReturnType<typeof createGitHubClient>;
  readonly repair: typeof manuallyInstallAndDispatchManagedGradingWorkflow;
}

const dependencies: GradingStudentWorkflowRepairContextDependencies = {
  loadConfig: loadGraiderConfig,
  loadAssignmentManifest: (manifestPath) => loadManifest(manifestPath, { required: true }),
  createClient: createGitHubClient,
  repair: manuallyInstallAndDispatchManagedGradingWorkflow,
  loadState: loadGradingState
};

const assignmentFile = (termCode: string, assignmentSlug: string): string =>
  `terms/${termCode}/assignments/${assignmentSlug}/assignment.yml`;

export const prepareGradingStudentWorkflowRepairContext = (
  request: GradingStudentWorkflowRepairContextRequest,
  overrides: Partial<GradingStudentWorkflowRepairContextDependencies> = {}
): PrepareGradingStudentWorkflowRepairResult => {
  const resolved = { ...dependencies, ...overrides };
  const config = resolved.loadConfig({
    cwd: request.courseFolderPath,
    assignmentFile: assignmentFile(request.termCode, request.assignmentSlug)
  });
  if (
    config.status === "failure" ||
    config.config.summary.termCode !== request.termCode ||
    config.config.summary.assignmentSlug !== request.assignmentSlug
  )
    return { status: "assignment_config_error", studentId: request.studentId };

  const grading = getEffectiveAssignmentGrading(config.config);
  if (!isManualManagedGradingWorkflowEligible(grading))
    return { status: "grading_not_eligible", studentId: request.studentId };

  const manifest = resolved.loadAssignmentManifest(
    createManifestPath(request.courseFolderPath, request.termCode, request.assignmentSlug)
      .absolutePath
  );
  if (manifest.status === "missing")
    return { status: "repository_not_recorded", studentId: request.studentId };
  if (
    manifest.status !== "loaded" ||
    manifest.manifest.assignment.termCode !== request.termCode ||
    manifest.manifest.assignment.assignmentSlug !== request.assignmentSlug
  )
    return { status: "repository_unavailable", studentId: request.studentId };

  const mapping = findStudentRepositoryMapping(
    normalizeManifestRepositories(manifest.manifest),
    request.studentId
  );
  if (mapping === undefined)
    return { status: "repository_not_recorded", studentId: request.studentId };
  const owner =
    manifest.manifest.schemaVersion === 1
      ? manifest.manifest.repositories.find((record) => record.studentId === request.studentId)
          ?.repository.owner
      : config.config.course.github.organization;
  if (owner === undefined || owner.trim() === "" || mapping.repositoryName.trim() === "")
    return { status: "repository_unavailable", studentId: request.studentId };

  const submission = resolveGradingSubmissionContext(request, { loadState: resolved.loadState });
  if (submission.status !== "success") {
    if (submission.status === "grading_state_error") return submission;
    return { status: "submission_commit_unavailable", studentId: request.studentId };
  }

  return {
    status: "success",
    value: {
      studentId: request.studentId,
      repository: { owner, name: mapping.repositoryName },
      grading,
      submissionCommitSha: submission.value.submissionCommitSha
    }
  };
};

export const executePreparedGradingStudentWorkflowRepair = async (
  prepared: PreparedGradingStudentWorkflowRepairContext,
  resolvedGithubToken: string,
  confirmed: boolean,
  overrides: Partial<GradingStudentWorkflowRepairContextDependencies> = {}
): Promise<ExecutePreparedGradingStudentWorkflowRepairResult> => {
  const resolved = { ...dependencies, ...overrides };
  const githubClient = resolved.createClient({ token: resolvedGithubToken });
  try {
    const repository = await githubClient.getRepository(
      prepared.repository.owner,
      prepared.repository.name
    );
    if (
      repository === null ||
      repository.owner !== prepared.repository.owner ||
      repository.name !== prepared.repository.name ||
      repository.defaultBranch.trim() === ""
    )
      return { status: "repository_unavailable", studentId: prepared.studentId };
    if (!confirmed)
      return {
        status: "ready",
        studentId: prepared.studentId,
        repositoryFullName: repository.fullName
      };

    return {
      status: "success",
      studentId: prepared.studentId,
      result: await resolved.repair({
        githubClient,
        repository: {
          owner: repository.owner,
          name: repository.name,
          defaultBranch: repository.defaultBranch
        },
        grading: prepared.grading,
        submissionCommitSha: prepared.submissionCommitSha,
        confirmed: true
      })
    };
  } catch {
    return { status: "github_operation_failed", studentId: prepared.studentId };
  }
};

export const gradingStudentWorkflowRepairBackend = {
  prepareGradingStudentWorkflowRepairContext,
  executePreparedGradingStudentWorkflowRepair
};
