import path from "node:path";
import {
  resolveCurrentFacultyScope,
  type FacultyScopeServiceRequest
} from "./facultyScopeService.js";
import {
  getLocalRepositoryLocatorPath,
  resolveLocalStudentRepository,
  type LocalRepositoryResolution
} from "./localRepositoryLocator.js";
import { readLocalRepositoryHead, type LocalRepositoryHeadResult } from "./localRepositoryHead.js";
export interface GradingStudentSourceRequest extends FacultyScopeServiceRequest {
  readonly courseFolderId: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
}
export type GradingStudentSourceResult = unknown;
export interface GradingStudentSourceBackend {
  loadGradingStudentSourceContext(request: {
    readonly courseFolderPath: string;
    readonly termCode: string;
    readonly assignmentSlug: string;
    readonly studentId: string;
    readonly repositoryRoot: string;
    readonly currentSubmissionCommitSha: string;
  }): GradingStudentSourceResult;
}
export interface GradingStudentSourceDependencies {
  readonly resolveFacultyScope: typeof resolveCurrentFacultyScope;
  readonly resolveRepository: (request: GradingStudentSourceRequest) => LocalRepositoryResolution;
  readonly readHead: (repositoryRoot: string) => Promise<LocalRepositoryHeadResult>;
  readonly loadBackend: () => GradingStudentSourceBackend;
}
const loadBackend = (): GradingStudentSourceBackend =>
  require(path.join(__dirname, "gradingStudentSourceBackend.cjs")) as GradingStudentSourceBackend;

export const createGradingStudentSourceService = (
  dependencies: Partial<GradingStudentSourceDependencies> = {}
): ((request: GradingStudentSourceRequest) => Promise<GradingStudentSourceResult>) => {
  const resolveFacultyScope = dependencies.resolveFacultyScope ?? resolveCurrentFacultyScope;
  const resolveRepository =
    dependencies.resolveRepository ??
    ((request: GradingStudentSourceRequest) =>
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
    return getBackend().loadGradingStudentSourceContext({
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId: request.studentId,
      repositoryRoot: repository.localPath,
      currentSubmissionCommitSha: head.submissionCommitSha
    });
  };
};

export const loadGradingStudentSource = (
  request: GradingStudentSourceRequest
): Promise<GradingStudentSourceResult> => createGradingStudentSourceService()(request);
