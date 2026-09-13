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
import { readLocalRepositoryHead, type LocalRepositoryHeadResult } from "./localRepositoryHead.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";

export interface GradingStudentEvidenceRequest extends FacultyScopeServiceRequest {
  readonly courseFolderId: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
}

export interface GradingEvidenceMetadataDto {
  readonly schemaVersion: 1;
  readonly submissionCommitSha: string;
  readonly workflowRunId: string;
  readonly workflowRunAttempt: string;
  readonly compile: { readonly outcome: "success" | "failure" | "skipped" };
  readonly junit: { readonly outcome: "success" | "failure" | "skipped" };
  readonly checkstyle: { readonly outcome: "success" | "failure" | "skipped" };
}

export interface GradingEvidenceDto {
  readonly metadata: GradingEvidenceMetadataDto;
  readonly junit: {
    readonly available: boolean;
    readonly outcome: "success" | "failure" | "skipped";
    readonly summary: {
      readonly total: number;
      readonly passed: number;
      readonly failed: number;
      readonly errors: number;
      readonly skipped: number;
    };
    readonly failures: readonly {
      readonly name: string;
      readonly className?: string;
      readonly kind: "failure" | "error";
      readonly message?: string;
      readonly details?: string;
    }[];
  };
  readonly checkstyle: {
    readonly available: boolean;
    readonly outcome: "success" | "failure" | "skipped";
    readonly violationCount: number;
    readonly violations: readonly {
      readonly file: string;
      readonly fileKind: "repository_relative" | "noncanonical";
      readonly line?: number;
      readonly column?: number;
      readonly severity: string;
      readonly message: string;
      readonly source?: string;
    }[];
  };
}

export type GradingStudentEvidenceResult =
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly submissionCommitSha: string;
      readonly runId: number;
      readonly runAttempt: number;
      readonly evidence: GradingEvidenceDto;
    }
  | { readonly status: "not_applicable"; readonly studentId: string }
  | {
      readonly status:
        | "faculty_identity_required"
        | "no_assigned_sections"
        | "roster_error"
        | "term_config_error"
        | "student_not_accessible"
        | "repository_not_recorded"
        | "repository_unavailable"
        | "registry_error"
        | "submission_commit_unavailable"
        | "github_auth_unavailable";
    }
  | { readonly status: "submission_changed"; readonly studentId: string }
  | {
      readonly status: "assignment_config_error" | "grading_state_error";
      readonly studentId: string;
      readonly code: string;
    }
  | { readonly status: "evidence_error"; readonly studentId: string; readonly code: string };

interface PreparedContext {
  readonly studentId: string;
  readonly submissionCommitSha: string;
  readonly repository: { readonly owner: string; readonly repo: string };
  readonly grading: unknown;
}

type PrepareResult =
  | { readonly status: "success"; readonly value: PreparedContext }
  | Exclude<GradingStudentEvidenceResult, { readonly status: "success" }>;

type RetrievalResult =
  | {
      readonly status: "success";
      readonly value: {
        readonly runId: number;
        readonly runAttempt: number;
        readonly artifactId: number;
        readonly evidence: GradingEvidenceDto;
      };
    }
  | { readonly status: "not_applicable" }
  | { readonly status: "failure"; readonly error: { readonly code: string } };

interface EvidenceBackend {
  prepareGradingStudentEvidenceContext(request: {
    readonly courseFolderPath: string;
    readonly termCode: string;
    readonly assignmentSlug: string;
    readonly studentId: string;
    readonly currentSubmissionCommitSha?: string;
  }): PrepareResult;
  retrievePreparedGradingStudentEvidence(
    prepared: PreparedContext,
    resolvedGithubToken: string
  ): Promise<RetrievalResult>;
}

const toGradingEvidenceDto = (evidence: GradingEvidenceDto): GradingEvidenceDto => ({
  metadata: {
    schemaVersion: evidence.metadata.schemaVersion,
    submissionCommitSha: evidence.metadata.submissionCommitSha,
    workflowRunId: evidence.metadata.workflowRunId,
    workflowRunAttempt: evidence.metadata.workflowRunAttempt,
    compile: { outcome: evidence.metadata.compile.outcome },
    junit: { outcome: evidence.metadata.junit.outcome },
    checkstyle: { outcome: evidence.metadata.checkstyle.outcome }
  },
  junit: {
    available: evidence.junit.available,
    outcome: evidence.junit.outcome,
    summary: {
      total: evidence.junit.summary.total,
      passed: evidence.junit.summary.passed,
      failed: evidence.junit.summary.failed,
      errors: evidence.junit.summary.errors,
      skipped: evidence.junit.summary.skipped
    },
    failures: evidence.junit.failures.map((failure) => ({
      name: failure.name,
      ...(failure.className === undefined ? {} : { className: failure.className }),
      kind: failure.kind,
      ...(failure.message === undefined ? {} : { message: failure.message }),
      ...(failure.details === undefined ? {} : { details: failure.details })
    }))
  },
  checkstyle: {
    available: evidence.checkstyle.available,
    outcome: evidence.checkstyle.outcome,
    violationCount: evidence.checkstyle.violationCount,
    violations: evidence.checkstyle.violations.map((violation) => ({
      file: violation.file,
      fileKind: violation.fileKind,
      ...(violation.line === undefined ? {} : { line: violation.line }),
      ...(violation.column === undefined ? {} : { column: violation.column }),
      severity: violation.severity,
      message: violation.message,
      ...(violation.source === undefined ? {} : { source: violation.source })
    }))
  }
});

export interface GradingStudentEvidenceDependencies {
  readonly resolveFacultyScope: (request: FacultyScopeServiceRequest) => FacultyScopeServiceResult;
  readonly resolveRepository: (request: GradingStudentEvidenceRequest) => LocalRepositoryResolution;
  readonly readHead: (repositoryRoot: string) => Promise<LocalRepositoryHeadResult>;
  readonly resolveToken: () => Promise<GithubTokenResolution>;
  readonly loadBackend: () => EvidenceBackend;
}

const loadBackend = (): EvidenceBackend =>
  (
    require(path.join(__dirname, "gradingStudentEvidenceBackend.cjs")) as {
      gradingStudentEvidenceContextBackend: EvidenceBackend;
    }
  ).gradingStudentEvidenceContextBackend;

export const createGradingStudentEvidenceService = (
  overrides: Partial<GradingStudentEvidenceDependencies> = {}
): ((request: GradingStudentEvidenceRequest) => Promise<GradingStudentEvidenceResult>) => {
  const resolveFacultyScope = overrides.resolveFacultyScope ?? resolveCurrentFacultyScope;
  const resolveRepository =
    overrides.resolveRepository ??
    ((request: GradingStudentEvidenceRequest) =>
      resolveLocalStudentRepository(getLocalRepositoryLocatorPath(request.userDataPath), request));
  const readHead = overrides.readHead ?? readLocalRepositoryHead;
  const resolveToken =
    overrides.resolveToken ??
    (async () => await resolveGithubToken({ runner: createNodeProcessRunner() }));
  const getBackend = overrides.loadBackend ?? loadBackend;

  return async (request) => {
    const scope = resolveFacultyScope(request);
    if (scope.status !== "success") return { status: scope.status };
    if (!scope.students.some((student) => student.studentId === request.studentId))
      return { status: "student_not_accessible" };

    const repository = resolveRepository(request);
    const head =
      repository.status === "success"
        ? await readHead(repository.localPath)
        : ({ status: "submission_commit_unavailable" } as const);

    let backend: EvidenceBackend;
    let prepared: PrepareResult;
    try {
      backend = getBackend();
      prepared = backend.prepareGradingStudentEvidenceContext({
        courseFolderPath: request.courseFolderPath,
        termCode: request.termCode,
        assignmentSlug: request.assignmentSlug,
        studentId: request.studentId,
        ...(head.status === "success"
          ? { currentSubmissionCommitSha: head.submissionCommitSha }
          : {})
      });
    } catch {
      return {
        status: "evidence_error",
        studentId: request.studentId,
        code: "evidence_retrieval_failed"
      };
    }
    if (prepared.status !== "success") return prepared;

    let token: GithubTokenResolution;
    try {
      token = await resolveToken();
    } catch {
      return { status: "github_auth_unavailable" };
    }
    if (token.status === "failure") return { status: "github_auth_unavailable" };
    let retrieved: RetrievalResult;
    try {
      retrieved = await backend.retrievePreparedGradingStudentEvidence(prepared.value, token.token);
    } catch {
      return {
        status: "evidence_error",
        studentId: request.studentId,
        code: "evidence_retrieval_failed"
      };
    }
    if (retrieved.status === "not_applicable")
      return { status: "not_applicable", studentId: request.studentId };
    if (retrieved.status === "failure")
      return { status: "evidence_error", studentId: request.studentId, code: retrieved.error.code };
    return {
      status: "success",
      studentId: request.studentId,
      submissionCommitSha: prepared.value.submissionCommitSha,
      runId: retrieved.value.runId,
      runAttempt: retrieved.value.runAttempt,
      evidence: toGradingEvidenceDto(retrieved.value.evidence)
    };
  };
};

export const loadGradingStudentEvidence = (
  request: GradingStudentEvidenceRequest
): Promise<GradingStudentEvidenceResult> => createGradingStudentEvidenceService()(request);
