import path from "node:path";
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

export interface GradingStudentCommitHistoryRequest extends FacultyScopeServiceRequest {
  readonly courseFolderId: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
}

export type GradingStudentCommitHistoryResult =
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly submissionCommitSha: string;
      readonly commits: readonly GradingCommitDto[];
    }
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
        | "submission_commit_unavailable";
    }
  | { readonly status: "submission_changed"; readonly studentId: string }
  | {
      readonly status: "grading_state_error" | "commit_history_unavailable";
      readonly studentId: string;
      readonly code?: string;
    };

type SubmissionContextResult =
  | {
      readonly status: "success";
      readonly value: { readonly studentId: string; readonly submissionCommitSha: string };
    }
  | { readonly status: "submission_changed"; readonly studentId: string }
  | {
      readonly status: "grading_state_error";
      readonly studentId: string;
      readonly code: string;
    }
  | { readonly status: "missing_submission_commit" }
  | { readonly status: "submission_commit_unavailable" };

interface CommitHistoryBackend {
  resolveGradingSubmissionContext(request: {
    readonly courseFolderPath: string;
    readonly termCode: string;
    readonly assignmentSlug: string;
    readonly studentId: string;
    readonly currentSubmissionCommitSha: string;
  }): SubmissionContextResult;
}

export interface GradingStudentCommitHistoryDependencies {
  readonly resolveFacultyScope: (request: FacultyScopeServiceRequest) => FacultyScopeServiceResult;
  readonly resolveRepository: (
    request: GradingStudentCommitHistoryRequest
  ) => LocalRepositoryResolution;
  readonly readHead: (repositoryRoot: string) => Promise<LocalRepositoryHeadResult>;
  readonly loadBackend: () => CommitHistoryBackend;
  readonly readHistory: (
    repositoryRoot: string,
    submissionCommitSha: string
  ) => Promise<LocalRepositoryCommitHistoryResult>;
}

const loadBackend = (): CommitHistoryBackend =>
  (
    require(path.join(__dirname, "gradingStudentCommitHistoryBackend.cjs")) as {
      gradingStudentCommitHistoryBackend: CommitHistoryBackend;
    }
  ).gradingStudentCommitHistoryBackend;

const safeCommits = (commits: readonly GradingCommitDto[]): readonly GradingCommitDto[] =>
  commits.map((commit) => ({
    sha: commit.sha,
    committedAt: commit.committedAt,
    message: commit.message
  }));

export const createGradingStudentCommitHistoryService = (
  overrides: Partial<GradingStudentCommitHistoryDependencies> = {}
): ((
  request: GradingStudentCommitHistoryRequest
) => Promise<GradingStudentCommitHistoryResult>) => {
  const resolveFacultyScope = overrides.resolveFacultyScope ?? resolveCurrentFacultyScope;
  const resolveRepository =
    overrides.resolveRepository ??
    ((request: GradingStudentCommitHistoryRequest) =>
      resolveLocalStudentRepository(getLocalRepositoryLocatorPath(request.userDataPath), request));
  const readHead = overrides.readHead ?? readLocalRepositoryHead;
  const getBackend = overrides.loadBackend ?? loadBackend;
  const readHistory = overrides.readHistory ?? readLocalRepositoryCommitHistory;

  return async (request) => {
    const scope = resolveFacultyScope(request);
    if (scope.status !== "success") return { status: scope.status };
    if (!scope.students.some((student) => student.studentId === request.studentId))
      return { status: "student_not_accessible" };

    const repository = resolveRepository(request);
    if (repository.status !== "success") return repository;
    const head = await readHead(repository.localPath);
    if (head.status !== "success") return head;

    let submission: SubmissionContextResult;
    try {
      submission = getBackend().resolveGradingSubmissionContext({
        courseFolderPath: request.courseFolderPath,
        termCode: request.termCode,
        assignmentSlug: request.assignmentSlug,
        studentId: request.studentId,
        currentSubmissionCommitSha: head.submissionCommitSha
      });
    } catch {
      return {
        status: "grading_state_error",
        studentId: request.studentId,
        code: "grading_state_read_failed"
      };
    }
    if (submission.status !== "success")
      return submission.status === "missing_submission_commit"
        ? { status: "submission_commit_unavailable" }
        : submission;

    let history: LocalRepositoryCommitHistoryResult;
    try {
      history = await readHistory(repository.localPath, submission.value.submissionCommitSha);
    } catch {
      return { status: "commit_history_unavailable", studentId: request.studentId };
    }
    if (history.status !== "success")
      return history.status === "submission_commit_unavailable"
        ? history
        : { status: "commit_history_unavailable", studentId: request.studentId };
    return {
      status: "success",
      studentId: request.studentId,
      submissionCommitSha: submission.value.submissionCommitSha,
      commits: safeCommits(history.commits)
    };
  };
};

export const loadGradingStudentCommitHistory = (
  request: GradingStudentCommitHistoryRequest
): Promise<GradingStudentCommitHistoryResult> =>
  createGradingStudentCommitHistoryService()(request);
