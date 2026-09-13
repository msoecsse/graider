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
import { readLocalRepositoryHead, type LocalRepositoryHeadResult } from "./localRepositoryHead.js";

export interface MarkGradingStudentCompleteRequest extends FacultyScopeServiceRequest {
  readonly courseFolderId: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
}

export type MarkGradingStudentCompleteResult =
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly gradingStatus: "not_started" | "in_progress" | "complete" | "published";
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
  | { readonly status: "grading_state_error"; readonly studentId: string; readonly code: string };

interface BackendRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha: string;
}

export interface GradingStudentCompleteBackend {
  markGradingStudentCompleteContext(request: BackendRequest): MarkGradingStudentCompleteResult;
}

export interface GradingStudentCompleteDependencies {
  readonly resolveFacultyScope: (request: FacultyScopeServiceRequest) => FacultyScopeServiceResult;
  readonly resolveRepository: (
    request: MarkGradingStudentCompleteRequest
  ) => LocalRepositoryResolution;
  readonly readHead: (repositoryRoot: string) => Promise<LocalRepositoryHeadResult>;
  readonly loadBackend: () => GradingStudentCompleteBackend;
}

const loadBackend = (): GradingStudentCompleteBackend =>
  require(
    path.join(__dirname, "gradingStudentCompleteBackend.cjs")
  ) as GradingStudentCompleteBackend;

export const createGradingStudentCompleteService = (
  dependencies: Partial<GradingStudentCompleteDependencies> = {}
): ((request: MarkGradingStudentCompleteRequest) => Promise<MarkGradingStudentCompleteResult>) => {
  const resolveFacultyScope = dependencies.resolveFacultyScope ?? resolveCurrentFacultyScope;
  const resolveRepository =
    dependencies.resolveRepository ??
    ((request: MarkGradingStudentCompleteRequest) =>
      resolveLocalStudentRepository(getLocalRepositoryLocatorPath(request.userDataPath), request));
  const readHead = dependencies.readHead ?? readLocalRepositoryHead;
  const getBackend = dependencies.loadBackend ?? loadBackend;
  return async (request) => {
    const scope = resolveFacultyScope(request);
    if (scope.status !== "success") return { status: scope.status };
    if (!scope.students.some((student) => student.studentId === request.studentId))
      return { status: "student_not_accessible" };
    const repository = resolveRepository(request);
    if (repository.status !== "success") return repository;
    const head = await readHead(repository.localPath);
    if (head.status !== "success") return head;
    return getBackend().markGradingStudentCompleteContext({
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId: request.studentId,
      currentSubmissionCommitSha: head.submissionCommitSha
    });
  };
};

export const markGradingStudentComplete = (
  request: MarkGradingStudentCompleteRequest
): Promise<MarkGradingStudentCompleteResult> => createGradingStudentCompleteService()(request);
