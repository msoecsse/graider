import { loadGraiderConfig } from "../config/config-loader.js";
import type { ConfigLoadRequest, ConfigLoadResult } from "../config/config-models.js";
import {
  getEffectiveAssignmentGrading,
  type EffectiveAssignmentGrading
} from "../config/effective-grading.js";
import { loadManifest, type ManifestLoadResult } from "../manifest/manifest-loader.js";
import { createManifestPath } from "../manifest/manifest-paths.js";
import {
  findStudentRepositoryMapping,
  normalizeManifestRepositories
} from "../manifest/repository-targets.js";
import {
  publishGraiderOwnedStudentReportFile,
  resolveGraiderGeneratedStudentReportDestination
} from "../reporting/student-report-publisher.js";
import type { GitHubClient } from "../github/github-client.js";
import { createGitHubClient } from "../github/github-client-factory.js";
import { GitHubClientError } from "../github/github-errors.js";
import { isManagedGradingWorkflowEligible } from "../workflows/managed-workflow-deployment.js";
import { retrievePreparedGradingStudentEvidence } from "./grading-student-evidence-context.js";
import { renderGradingReportHtml } from "./grading-report-html.js";
import { buildGradingReportModel, type GradingReportCommit } from "./grading-report-model.js";
import {
  loadGradingState,
  saveGradingState,
  type GradingState,
  type GradingStatePathRequest,
  type GradingStateResult,
  type LoadGradingStateResult
} from "./grading-state.js";
import { markPublished } from "./grading-state-operations.js";
import {
  resolveGradingSubmissionContext,
  type GradingSubmissionContextRequest,
  type GradingSubmissionContextResult
} from "./grading-submission-context.js";
import {
  buildSubmissionSourceModel,
  type SubmissionSourceRequest,
  type SubmissionSourceResult
} from "./submission-source.js";
import type { GradingEvidenceRetrievalResult } from "./grading-evidence-retrieval.js";
import type { GradingEvidence } from "./grading-evidence-parser.js";

export interface GradingStudentReportPublicationContextRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly repositoryRoot: string;
  readonly currentSubmissionCommitSha: string;
}

interface ReportStateBasis {
  readonly schemaVersion: GradingState["schemaVersion"];
  readonly studentId: string;
  readonly submissionCommitSha: string;
  readonly status: GradingState["status"];
  readonly appliedComments: GradingState["appliedComments"];
  readonly manualAdjustments: GradingState["manualAdjustments"];
}

export interface PreparedGradingStudentReportPublicationContext {
  readonly request: Omit<
    GradingStudentReportPublicationContextRequest,
    "currentSubmissionCommitSha"
  >;
  readonly studentId: string;
  readonly submissionCommitSha: string;
  readonly reportPath: string;
  readonly repository: { readonly owner: string; readonly repo: string };
  readonly managedEvidenceEligible: boolean;
  readonly grading: EffectiveAssignmentGrading;
  readonly state: GradingState;
  readonly stateBasis: string;
  readonly course: { readonly code: string; readonly title: string };
  readonly assignment: { readonly slug: string; readonly title: string };
  readonly rubric: readonly {
    readonly id: string;
    readonly name: string;
    readonly points: number;
  }[];
  readonly source: Extract<SubmissionSourceResult, { readonly status: "success" }>["value"];
}

export type PrepareGradingStudentReportPublicationResult =
  | { readonly status: "success"; readonly value: PreparedGradingStudentReportPublicationContext }
  | {
      readonly status:
        | "grading_state_missing"
        | "grading_not_complete"
        | "submission_changed"
        | "submission_commit_unavailable";
      readonly studentId: string;
    }
  | {
      readonly status:
        | "grading_state_error"
        | "assignment_config_error"
        | "source_unavailable"
        | "report_destination_unavailable"
        | "unsafe_report_destination";
      readonly studentId: string;
      readonly code?: string;
    }
  | { readonly status: "repository_not_recorded" | "repository_unavailable" };

export interface GradingStudentReportPublicationContextDependencies {
  readonly resolveSubmission: (
    request: GradingSubmissionContextRequest,
    overrides: { readonly loadState: (request: GradingStatePathRequest) => LoadGradingStateResult }
  ) => GradingSubmissionContextResult;
  readonly loadState: (request: GradingStatePathRequest) => LoadGradingStateResult;
  readonly saveState: (
    request: GradingStatePathRequest,
    state: GradingState
  ) => GradingStateResult<undefined>;
  readonly loadConfig: (request: ConfigLoadRequest) => ConfigLoadResult;
  readonly loadAssignmentManifest: (manifestPath: string) => ManifestLoadResult;
  readonly buildSource: (request: SubmissionSourceRequest) => SubmissionSourceResult;
}

const dependencies: GradingStudentReportPublicationContextDependencies = {
  resolveSubmission: (request, overrides) => resolveGradingSubmissionContext(request, overrides),
  loadState: loadGradingState,
  saveState: saveGradingState,
  loadConfig: loadGraiderConfig,
  loadAssignmentManifest: (manifestPath) => loadManifest(manifestPath, { required: true }),
  buildSource: buildSubmissionSourceModel
};

const assignmentFile = (termCode: string, assignmentSlug: string): string =>
  `terms/${termCode}/assignments/${assignmentSlug}/assignment.yml`;

const stateRequest = (
  request: Pick<
    GradingStudentReportPublicationContextRequest,
    "courseFolderPath" | "termCode" | "assignmentSlug" | "studentId"
  >
): GradingStatePathRequest => ({
  courseRoot: request.courseFolderPath,
  termCode: request.termCode,
  assignmentSlug: request.assignmentSlug,
  studentId: request.studentId
});

const reportStateBasis = (state: GradingState): string =>
  JSON.stringify({
    schemaVersion: state.schemaVersion,
    studentId: state.studentId,
    submissionCommitSha: state.submissionCommitSha,
    status: state.status,
    appliedComments: state.appliedComments,
    manualAdjustments: state.manualAdjustments
  } satisfies ReportStateBasis);

export type CheckGradingStudentReportPublicationEligibilityResult =
  | { readonly status: "success" }
  | {
      readonly status: "grading_state_missing" | "grading_not_complete";
      readonly studentId: string;
    }
  | {
      readonly status: "grading_state_error";
      readonly studentId: string;
      readonly code: string;
    };

export const checkGradingStudentReportPublicationEligibility = (
  request: Pick<
    GradingStudentReportPublicationContextRequest,
    "courseFolderPath" | "termCode" | "assignmentSlug" | "studentId"
  >,
  overrides: Partial<GradingStudentReportPublicationContextDependencies> = {}
): CheckGradingStudentReportPublicationEligibilityResult => {
  const loaded = (overrides.loadState ?? dependencies.loadState)(stateRequest(request));
  if (loaded.status === "missing")
    return { status: "grading_state_missing", studentId: request.studentId };
  if (loaded.status === "failure")
    return {
      status: "grading_state_error",
      studentId: request.studentId,
      code: loaded.code
    };
  if (loaded.value.studentId !== request.studentId)
    return {
      status: "grading_state_error",
      studentId: request.studentId,
      code: "grading_state_student_mismatch"
    };
  return loaded.value.status === "complete" || loaded.value.status === "published"
    ? { status: "success" }
    : { status: "grading_not_complete", studentId: request.studentId };
};

const ownerForStudent = (
  manifest: Extract<ManifestLoadResult, { readonly status: "loaded" }>["manifest"],
  studentId: string,
  configuredOrganization: string
): string | undefined =>
  manifest.schemaVersion === 1
    ? manifest.repositories.find((record) => record.studentId === studentId)?.repository.owner
    : configuredOrganization;

export const prepareGradingStudentReportPublicationContext = (
  request: GradingStudentReportPublicationContextRequest,
  overrides: Partial<GradingStudentReportPublicationContextDependencies> = {}
): PrepareGradingStudentReportPublicationResult => {
  const resolved = { ...dependencies, ...overrides };
  const loaded = resolved.loadState(stateRequest(request));
  if (loaded.status === "missing")
    return { status: "grading_state_missing", studentId: request.studentId };
  if (loaded.status === "failure")
    return {
      status: "grading_state_error",
      studentId: request.studentId,
      code: loaded.code
    };
  const state = loaded.value;
  if (state.studentId !== request.studentId)
    return {
      status: "grading_state_error",
      studentId: request.studentId,
      code: "grading_state_student_mismatch"
    };
  if (state.status !== "complete" && state.status !== "published")
    return { status: "grading_not_complete", studentId: request.studentId };

  const submission = resolved.resolveSubmission(request, { loadState: resolved.loadState });
  if (submission.status !== "success")
    return submission.status === "grading_state_error"
      ? {
          status: "grading_state_error",
          studentId: request.studentId,
          code: submission.code
        }
      : submission.status === "submission_changed"
        ? submission
        : { status: "submission_commit_unavailable", studentId: request.studentId };
  if (
    state.submissionCommitSha !== submission.value.submissionCommitSha ||
    state.submissionCommitSha !== request.currentSubmissionCommitSha
  )
    return { status: "submission_changed", studentId: request.studentId };

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

  const destination = resolveGraiderGeneratedStudentReportDestination(
    config.config.course.reports.student_publish
  );
  if (destination.status !== "success")
    return { status: destination.status, studentId: request.studentId };

  const source = resolved.buildSource({
    repositoryRoot: request.repositoryRoot,
    requiredFiles: config.config.assignment.grading?.required_files ?? []
  });
  if (source.status === "failure")
    return {
      status: "source_unavailable",
      studentId: request.studentId,
      code: source.code
    };

  const manifest = resolved.loadAssignmentManifest(
    createManifestPath(request.courseFolderPath, request.termCode, request.assignmentSlug)
      .absolutePath
  );
  if (manifest.status === "missing") return { status: "repository_not_recorded" };
  if (
    manifest.status !== "loaded" ||
    manifest.manifest.assignment.termCode !== request.termCode ||
    manifest.manifest.assignment.assignmentSlug !== request.assignmentSlug
  )
    return { status: "repository_unavailable" };
  const mapping = findStudentRepositoryMapping(
    normalizeManifestRepositories(manifest.manifest),
    request.studentId
  );
  if (mapping === undefined) return { status: "repository_not_recorded" };
  const owner = ownerForStudent(
    manifest.manifest,
    request.studentId,
    config.config.course.github.organization
  );
  if (owner === undefined || owner.trim() === "" || mapping.repositoryName.trim() === "")
    return { status: "repository_unavailable" };

  const grading = getEffectiveAssignmentGrading(config.config);
  return {
    status: "success",
    value: {
      request: {
        courseFolderPath: request.courseFolderPath,
        termCode: request.termCode,
        assignmentSlug: request.assignmentSlug,
        studentId: request.studentId,
        repositoryRoot: request.repositoryRoot
      },
      studentId: request.studentId,
      submissionCommitSha: state.submissionCommitSha,
      reportPath: destination.path,
      repository: { owner, repo: mapping.repositoryName },
      managedEvidenceEligible: isManagedGradingWorkflowEligible(grading),
      grading,
      state,
      stateBasis: reportStateBasis(state),
      course: {
        code: config.config.course.course.code,
        title: config.config.course.course.title
      },
      assignment: {
        slug: config.config.assignment.assignment.slug,
        title: config.config.assignment.assignment.title
      },
      rubric: config.config.assignment.grading?.rubric ?? [],
      source: source.value
    }
  };
};

export interface RenderPreparedGradingStudentReportInput {
  readonly evidence?: GradingEvidence;
  readonly commitHistory?: readonly GradingReportCommit[];
}

export type RenderPreparedGradingStudentReportResult =
  | { readonly status: "success"; readonly html: string }
  | { readonly status: "report_render_failed"; readonly code: string };

export const renderPreparedGradingStudentReport = (
  prepared: PreparedGradingStudentReportPublicationContext,
  input: RenderPreparedGradingStudentReportInput
): RenderPreparedGradingStudentReportResult => {
  const model = buildGradingReportModel({
    course: prepared.course,
    assignment: prepared.assignment,
    gradingState: prepared.state,
    rubric: prepared.rubric,
    source: prepared.source,
    ...(input.evidence === undefined
      ? {}
      : {
          evidence: {
            studentId: prepared.studentId,
            submissionCommitSha: prepared.submissionCommitSha,
            evidence: input.evidence
          }
        }),
    ...(input.commitHistory === undefined
      ? {}
      : {
          commitHistory: {
            studentId: prepared.studentId,
            submissionCommitSha: prepared.submissionCommitSha,
            commits: input.commitHistory
          }
        })
  });
  return model.status === "failure"
    ? { status: "report_render_failed", code: model.code }
    : { status: "success", html: renderGradingReportHtml(model.value) };
};

export const retrieveManagedEvidenceForGradingStudentReport = async (
  prepared: PreparedGradingStudentReportPublicationContext,
  resolvedGithubToken: string
): Promise<GradingEvidenceRetrievalResult> =>
  await retrievePreparedGradingStudentEvidence(prepared, resolvedGithubToken);

export type RevalidatePreparedGradingStudentReportPublicationResult =
  | { readonly status: "success" }
  | {
      readonly status: "publication_stale" | "submission_changed" | "grading_state_error";
      readonly studentId: string;
      readonly code?: string;
    };

export const revalidatePreparedGradingStudentReportPublication = (
  prepared: PreparedGradingStudentReportPublicationContext,
  currentSubmissionCommitSha: string,
  overrides: Partial<GradingStudentReportPublicationContextDependencies> = {}
): RevalidatePreparedGradingStudentReportPublicationResult => {
  const resolved = { ...dependencies, ...overrides };
  const submission = resolved.resolveSubmission(
    { ...prepared.request, currentSubmissionCommitSha },
    { loadState: resolved.loadState }
  );
  if (submission.status !== "success")
    return submission.status === "submission_changed"
      ? submission
      : {
          status: "grading_state_error",
          studentId: prepared.studentId,
          ...(submission.status === "grading_state_error" ? { code: submission.code } : {})
        };
  const loaded = resolved.loadState(stateRequest(prepared.request));
  if (loaded.status !== "success")
    return {
      status: "grading_state_error",
      studentId: prepared.studentId,
      ...(loaded.status === "failure" ? { code: loaded.code } : {})
    };
  return submission.value.submissionCommitSha === prepared.submissionCommitSha &&
    reportStateBasis(loaded.value) === prepared.stateBasis
    ? { status: "success" }
    : { status: "publication_stale", studentId: prepared.studentId };
};

export type MarkPreparedGradingStudentReportPublishedResult =
  | { readonly status: "success"; readonly studentId: string; readonly gradingStatus: "published" }
  | {
      readonly status:
        | "publication_stale"
        | "submission_changed"
        | "grading_state_error"
        | "publication_state_record_failed";
      readonly studentId: string;
      readonly code?: string;
    };

export const markPreparedGradingStudentReportPublished = (
  prepared: PreparedGradingStudentReportPublicationContext,
  currentSubmissionCommitSha: string,
  overrides: Partial<GradingStudentReportPublicationContextDependencies> = {}
): MarkPreparedGradingStudentReportPublishedResult => {
  const resolved = { ...dependencies, ...overrides };
  const revalidated = revalidatePreparedGradingStudentReportPublication(
    prepared,
    currentSubmissionCommitSha,
    resolved
  );
  if (revalidated.status !== "success") return revalidated;
  const loaded = resolved.loadState(stateRequest(prepared.request));
  if (loaded.status !== "success" || reportStateBasis(loaded.value) !== prepared.stateBasis)
    return { status: "publication_stale", studentId: prepared.studentId };
  if (loaded.value.status === "published")
    return { status: "success", studentId: prepared.studentId, gradingStatus: "published" };
  const published = markPublished(loaded.value);
  if (published.status === "failure")
    return {
      status: "grading_state_error",
      studentId: prepared.studentId,
      code: published.code
    };
  const saved = resolved.saveState(stateRequest(prepared.request), published.value);
  return saved.status === "success"
    ? { status: "success", studentId: prepared.studentId, gradingStatus: "published" }
    : { status: "publication_state_record_failed", studentId: prepared.studentId };
};

type GradingReportPublicationGitHubClient = Pick<
  GitHubClient,
  "getRepository" | "getRepositoryFileContent" | "writeRepositoryFile"
>;

export interface GradingStudentReportRemotePublicationDependencies {
  readonly createClient: (token: string) => GradingReportPublicationGitHubClient;
}

const remoteDependencies: GradingStudentReportRemotePublicationDependencies = {
  createClient: (token) => createGitHubClient({ token })
};

export type PublishRenderedGradingStudentReportResult =
  | { readonly status: "published"; readonly writePerformed: boolean }
  | { readonly status: "stale" }
  | {
      readonly status:
        | "repository_unavailable"
        | "report_write_permission_unavailable"
        | "report_publish_failed";
    };

export const publishRenderedGradingStudentReport = async (
  prepared: PreparedGradingStudentReportPublicationContext,
  html: string,
  resolvedGithubToken: string,
  beforePublish: () => Promise<boolean>,
  overrides: Partial<GradingStudentReportRemotePublicationDependencies> = {}
): Promise<PublishRenderedGradingStudentReportResult> => {
  try {
    const githubClient = (overrides.createClient ?? remoteDependencies.createClient)(
      resolvedGithubToken
    );
    const repository = await githubClient.getRepository(
      prepared.repository.owner,
      prepared.repository.repo
    );
    if (repository === null) return { status: "repository_unavailable" };
    return await publishGraiderOwnedStudentReportFile({
      githubClient,
      repository: {
        owner: prepared.repository.owner,
        repo: prepared.repository.repo,
        branch: repository.defaultBranch
      },
      path: prepared.reportPath,
      html,
      beforePublish
    });
  } catch (error: unknown) {
    return error instanceof GitHubClientError &&
      (error.kind === "permission_denied" || error.kind === "auth_failed")
      ? { status: "report_write_permission_unavailable" }
      : { status: "report_publish_failed" };
  }
};

export const gradingStudentReportPublicationBackend = {
  checkGradingStudentReportPublicationEligibility,
  prepareGradingStudentReportPublicationContext,
  retrieveManagedEvidenceForGradingStudentReport,
  renderPreparedGradingStudentReport,
  publishRenderedGradingStudentReport,
  revalidatePreparedGradingStudentReportPublication,
  markPreparedGradingStudentReportPublished
};
