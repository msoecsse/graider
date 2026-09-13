import path from "node:path";
import { createNodeProcessRunner } from "./commandRunner.js";
import {
  resolveCurrentFacultyScope,
  type FacultyScopeServiceRequest,
  type FacultyScopeServiceResult
} from "./facultyScopeService.js";
import {
  getLocalRepositoryLocatorPath,
  resolveLocalStudentRepository,
  type LocalRepositoryResolution
} from "./localRepositoryLocator.js";
import {
  readLocalRepositoryCommitHistory,
  type GradingCommitDto,
  type LocalRepositoryCommitHistoryResult
} from "./localRepositoryCommitHistory.js";
import { readLocalRepositoryHead, type LocalRepositoryHeadResult } from "./localRepositoryHead.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";

export const GRADING_REPORT_PUBLICATION_WARNINGS = [
  "automated_evidence_unavailable",
  "automated_evidence_invalid",
  "commit_history_unavailable"
] as const;
export type GradingReportPublicationWarning = (typeof GRADING_REPORT_PUBLICATION_WARNINGS)[number];

export interface PublishGradingStudentReportRequest extends FacultyScopeServiceRequest {
  readonly courseFolderId: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
}

interface PreparedContext {
  readonly studentId: string;
  readonly submissionCommitSha: string;
  readonly reportPath: string;
  readonly repository: { readonly owner: string; readonly repo: string };
  readonly managedEvidenceEligible: boolean;
}

type SafeContextFailure =
  | {
      readonly status:
        | "grading_state_missing"
        | "grading_not_complete"
        | "submission_changed"
        | "submission_commit_unavailable"
        | "grading_state_error"
        | "assignment_config_error"
        | "source_unavailable"
        | "report_destination_unavailable"
        | "unsafe_report_destination";
      readonly studentId: string;
      readonly code?: string;
    }
  | { readonly status: "repository_not_recorded" | "repository_unavailable" };

type PrepareResult =
  | { readonly status: "success"; readonly value: PreparedContext }
  | SafeContextFailure;

interface EvidenceValue {
  readonly evidence: {
    readonly metadata: { readonly submissionCommitSha: string };
  };
}

type EvidenceResult =
  | { readonly status: "success"; readonly value: EvidenceValue }
  | { readonly status: "not_applicable" }
  | { readonly status: "failure"; readonly error: { readonly code: string } };

type RevalidationResult =
  | { readonly status: "success" }
  | {
      readonly status: "publication_stale" | "submission_changed" | "grading_state_error";
      readonly studentId: string;
      readonly code?: string;
    };

type MarkPublishedResult =
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

interface PublicationBackend {
  checkGradingStudentReportPublicationEligibility(request: {
    readonly courseFolderPath: string;
    readonly termCode: string;
    readonly assignmentSlug: string;
    readonly studentId: string;
  }):
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
  prepareGradingStudentReportPublicationContext(request: {
    readonly courseFolderPath: string;
    readonly termCode: string;
    readonly assignmentSlug: string;
    readonly studentId: string;
    readonly repositoryRoot: string;
    readonly currentSubmissionCommitSha: string;
  }): PrepareResult;
  retrieveManagedEvidenceForGradingStudentReport(
    prepared: PreparedContext,
    token: string
  ): Promise<EvidenceResult>;
  renderPreparedGradingStudentReport(
    prepared: PreparedContext,
    input: {
      readonly evidence?: EvidenceValue["evidence"];
      readonly commitHistory?: readonly GradingCommitDto[];
    }
  ):
    | { readonly status: "success"; readonly html: string }
    | { readonly status: "report_render_failed"; readonly code: string };
  revalidatePreparedGradingStudentReportPublication(
    prepared: PreparedContext,
    currentSubmissionCommitSha: string
  ): RevalidationResult;
  publishRenderedGradingStudentReport(
    prepared: PreparedContext,
    html: string,
    token: string,
    beforePublish: () => Promise<boolean>
  ): Promise<
    | { readonly status: "published"; readonly writePerformed: boolean }
    | { readonly status: "stale" }
    | {
        readonly status:
          | "repository_unavailable"
          | "report_write_permission_unavailable"
          | "report_publish_failed";
      }
  >;
  markPreparedGradingStudentReportPublished(
    prepared: PreparedContext,
    currentSubmissionCommitSha: string
  ): MarkPublishedResult;
}

export type PublishGradingStudentReportResult =
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly gradingStatus: "published";
      readonly reportPath: string;
      readonly remoteWrite: "created_or_updated" | "unchanged";
      readonly warnings: readonly GradingReportPublicationWarning[];
    }
  | {
      readonly status: "publication_state_record_failed";
      readonly studentId: string;
      readonly reportPath: string;
      readonly remoteReportPublished: true;
      readonly warnings: readonly GradingReportPublicationWarning[];
    }
  | {
      readonly status: "publication_stale" | "submission_changed";
      readonly studentId: string;
      readonly remoteReportPublished: boolean;
    }
  | SafeContextFailure
  | { readonly status: "submission_commit_unavailable" }
  | {
      readonly status:
        | "faculty_identity_required"
        | "no_assigned_sections"
        | "roster_error"
        | "term_config_error"
        | "student_not_accessible"
        | "registry_error"
        | "github_auth_unavailable"
        | "report_write_permission_unavailable"
        | "report_publish_failed"
        | "report_render_failed";
    };

export interface GradingStudentReportPublicationDependencies {
  readonly resolveFacultyScope: (request: FacultyScopeServiceRequest) => FacultyScopeServiceResult;
  readonly resolveRepository: (
    request: PublishGradingStudentReportRequest
  ) => LocalRepositoryResolution;
  readonly readHead: (repositoryRoot: string) => Promise<LocalRepositoryHeadResult>;
  readonly readHistory: (
    repositoryRoot: string,
    submissionCommitSha: string
  ) => Promise<LocalRepositoryCommitHistoryResult>;
  readonly resolveToken: () => Promise<GithubTokenResolution>;
  readonly loadBackend: () => PublicationBackend;
}

const loadBackend = (): PublicationBackend =>
  (
    require(path.join(__dirname, "gradingStudentReportPublicationBackend.cjs")) as {
      gradingStudentReportPublicationBackend: PublicationBackend;
    }
  ).gradingStudentReportPublicationBackend;

const INVALID_EVIDENCE_CODES = new Set([
  "metadata_invalid",
  "metadata_version_unsupported",
  "junit_report_invalid",
  "checkstyle_report_invalid",
  "evidence_inconsistent",
  "evidence_identity_mismatch"
]);

export const createGradingStudentReportPublicationService = (
  overrides: Partial<GradingStudentReportPublicationDependencies> = {}
): ((
  request: PublishGradingStudentReportRequest
) => Promise<PublishGradingStudentReportResult>) => {
  const resolveFacultyScope = overrides.resolveFacultyScope ?? resolveCurrentFacultyScope;
  const resolveRepository =
    overrides.resolveRepository ??
    ((request: PublishGradingStudentReportRequest) =>
      resolveLocalStudentRepository(getLocalRepositoryLocatorPath(request.userDataPath), request));
  const readHead = overrides.readHead ?? readLocalRepositoryHead;
  const readHistory = overrides.readHistory ?? readLocalRepositoryCommitHistory;
  const resolveToken =
    overrides.resolveToken ??
    (async () => await resolveGithubToken({ runner: createNodeProcessRunner() }));
  const getBackend = overrides.loadBackend ?? loadBackend;

  return async (request) => {
    const scope = resolveFacultyScope(request);
    if (scope.status !== "success") return { status: scope.status };
    if (!scope.students.some((student) => student.studentId === request.studentId))
      return { status: "student_not_accessible" };

    let backend: PublicationBackend;
    try {
      backend = getBackend();
      const eligibility = backend.checkGradingStudentReportPublicationEligibility({
        courseFolderPath: request.courseFolderPath,
        termCode: request.termCode,
        assignmentSlug: request.assignmentSlug,
        studentId: request.studentId
      });
      if (eligibility.status !== "success") return eligibility;
    } catch {
      return { status: "report_render_failed" };
    }

    const localRepository = resolveRepository(request);
    if (localRepository.status !== "success") return localRepository;
    const initialHead = await readHead(localRepository.localPath);
    if (initialHead.status !== "success") return initialHead;

    let preparedResult: PrepareResult;
    try {
      preparedResult = backend.prepareGradingStudentReportPublicationContext({
        courseFolderPath: request.courseFolderPath,
        termCode: request.termCode,
        assignmentSlug: request.assignmentSlug,
        studentId: request.studentId,
        repositoryRoot: localRepository.localPath,
        currentSubmissionCommitSha: initialHead.submissionCommitSha
      });
    } catch {
      return { status: "report_render_failed" };
    }
    if (preparedResult.status !== "success") return preparedResult;
    const prepared = preparedResult.value;
    const warnings: GradingReportPublicationWarning[] = [];
    const reportInput: {
      evidence?: EvidenceValue["evidence"];
      commitHistory?: readonly GradingCommitDto[];
    } = {};

    try {
      const history = await readHistory(localRepository.localPath, prepared.submissionCommitSha);
      if (history.status === "success") reportInput.commitHistory = history.commits;
      else if (history.status === "submission_commit_unavailable") return history;
      else warnings.push("commit_history_unavailable");
    } catch {
      warnings.push("commit_history_unavailable");
    }

    let token: GithubTokenResolution;
    try {
      token = await resolveToken();
    } catch {
      return { status: "github_auth_unavailable" };
    }
    if (token.status === "failure") return { status: "github_auth_unavailable" };

    if (prepared.managedEvidenceEligible) {
      try {
        const evidence = await backend.retrieveManagedEvidenceForGradingStudentReport(
          prepared,
          token.token
        );
        if (
          evidence.status === "success" &&
          evidence.value.evidence.metadata.submissionCommitSha === prepared.submissionCommitSha
        )
          reportInput.evidence = evidence.value.evidence;
        else if (
          evidence.status === "success" ||
          (evidence.status === "failure" && INVALID_EVIDENCE_CODES.has(evidence.error.code))
        )
          warnings.push("automated_evidence_invalid");
        else if (evidence.status === "failure") warnings.push("automated_evidence_unavailable");
      } catch {
        warnings.push("automated_evidence_unavailable");
      }
    }

    let rendered: ReturnType<PublicationBackend["renderPreparedGradingStudentReport"]>;
    try {
      rendered = backend.renderPreparedGradingStudentReport(prepared, reportInput);
    } catch {
      return { status: "report_render_failed" };
    }
    if (rendered.status !== "success") return { status: "report_render_failed" };

    try {
      let prewriteFailure: Exclude<RevalidationResult, { readonly status: "success" }> | undefined;
      const published = await backend.publishRenderedGradingStudentReport(
        prepared,
        rendered.html,
        token.token,
        async () => {
          const head = await readHead(localRepository.localPath);
          if (head.status !== "success") {
            prewriteFailure = { status: "submission_changed", studentId: prepared.studentId };
            return false;
          }
          const revalidated = backend.revalidatePreparedGradingStudentReportPublication(
            prepared,
            head.submissionCommitSha
          );
          if (revalidated.status !== "success") {
            prewriteFailure = revalidated;
            return false;
          }
          return true;
        }
      );
      if (published.status === "stale")
        return {
          status:
            prewriteFailure?.status === "submission_changed"
              ? "submission_changed"
              : "publication_stale",
          studentId: prepared.studentId,
          remoteReportPublished: false
        };
      if (published.status !== "published") return published;

      const finalHead = await readHead(localRepository.localPath);
      if (finalHead.status !== "success")
        return {
          status: "publication_stale",
          studentId: prepared.studentId,
          remoteReportPublished: true
        };
      const marked = backend.markPreparedGradingStudentReportPublished(
        prepared,
        finalHead.submissionCommitSha
      );
      if (marked.status === "publication_state_record_failed")
        return {
          status: "publication_state_record_failed",
          studentId: prepared.studentId,
          reportPath: prepared.reportPath,
          remoteReportPublished: true,
          warnings
        };
      if (marked.status !== "success")
        return {
          status:
            marked.status === "submission_changed" ? "submission_changed" : "publication_stale",
          studentId: prepared.studentId,
          remoteReportPublished: true
        };
      return {
        status: "success",
        studentId: prepared.studentId,
        gradingStatus: "published",
        reportPath: prepared.reportPath,
        remoteWrite: published.writePerformed ? "created_or_updated" : "unchanged",
        warnings
      };
    } catch {
      return { status: "report_publish_failed" };
    }
  };
};

export const publishGradingStudentReport = (
  request: PublishGradingStudentReportRequest
): Promise<PublishGradingStudentReportResult> =>
  createGradingStudentReportPublicationService()(request);
