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

export interface AppliedCommentDto {
  readonly id: string;
  readonly sourceCommentId?: string;
  readonly text: string;
  readonly deduction: number;
  readonly rubricCategoryId?: string;
  readonly sourceLocation?: {
    readonly file: string;
    readonly startLine: number;
    readonly endLine: number;
  };
}

export interface AppliedCommentReplacementDto {
  readonly text: string;
  readonly deduction: number;
  readonly rubricCategoryId?: string | undefined;
  readonly sourceLocation?: AppliedCommentDto["sourceLocation"] | undefined;
}

export interface GradingStudentCommentRequest extends FacultyScopeServiceRequest {
  readonly courseFolderId: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
}

export interface AddGradingStudentCommentRequest extends GradingStudentCommentRequest {
  readonly comment: AppliedCommentDto;
}

export interface EditGradingStudentCommentRequest extends GradingStudentCommentRequest {
  readonly commentId: string;
  readonly replacement: AppliedCommentReplacementDto;
}

export interface DeleteGradingStudentCommentRequest extends GradingStudentCommentRequest {
  readonly commentId: string;
}

export type GradingStudentCommentResult =
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly gradingStatus: "not_started" | "in_progress" | "complete" | "published";
      readonly appliedComments: readonly AppliedCommentDto[];
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
  | {
      readonly status: "submission_changed" | "not_found";
      readonly studentId: string;
      readonly code?: string;
    }
  | {
      readonly status: "grading_state_error" | "assignment_config_error";
      readonly studentId: string;
      readonly code: string;
    };

interface BackendRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha: string;
}

export interface GradingStudentCommentBackend {
  addGradingStudentCommentContext(
    request: BackendRequest,
    comment: AppliedCommentDto
  ): GradingStudentCommentResult;
  editGradingStudentCommentContext(
    request: BackendRequest,
    commentId: string,
    replacement: AppliedCommentReplacementDto
  ): GradingStudentCommentResult;
  deleteGradingStudentCommentContext(
    request: BackendRequest,
    commentId: string
  ): GradingStudentCommentResult;
}

export interface GradingStudentCommentDependencies {
  readonly resolveFacultyScope: (request: FacultyScopeServiceRequest) => FacultyScopeServiceResult;
  readonly resolveRepository: (request: GradingStudentCommentRequest) => LocalRepositoryResolution;
  readonly readHead: (repositoryRoot: string) => Promise<LocalRepositoryHeadResult>;
  readonly loadBackend: () => GradingStudentCommentBackend;
}

const loadBackend = (): GradingStudentCommentBackend =>
  require(path.join(__dirname, "gradingStudentCommentBackend.cjs")) as GradingStudentCommentBackend;

type Prepared =
  | { readonly status: "failure"; readonly result: GradingStudentCommentResult }
  | { readonly status: "success"; readonly backendRequest: BackendRequest };

export const createGradingStudentCommentService = (
  dependencies: Partial<GradingStudentCommentDependencies> = {}
): {
  readonly add: (request: AddGradingStudentCommentRequest) => Promise<GradingStudentCommentResult>;
  readonly edit: (
    request: EditGradingStudentCommentRequest
  ) => Promise<GradingStudentCommentResult>;
  readonly delete: (
    request: DeleteGradingStudentCommentRequest
  ) => Promise<GradingStudentCommentResult>;
} => {
  const resolveFacultyScope = dependencies.resolveFacultyScope ?? resolveCurrentFacultyScope;
  const resolveRepository =
    dependencies.resolveRepository ??
    ((request: GradingStudentCommentRequest) =>
      resolveLocalStudentRepository(getLocalRepositoryLocatorPath(request.userDataPath), request));
  const readHead = dependencies.readHead ?? readLocalRepositoryHead;
  const getBackend = dependencies.loadBackend ?? loadBackend;
  const prepare = async (request: GradingStudentCommentRequest): Promise<Prepared> => {
    const scope = resolveFacultyScope(request);
    if (scope.status !== "success") return { status: "failure", result: { status: scope.status } };
    if (!scope.students.some((student) => student.studentId === request.studentId))
      return { status: "failure", result: { status: "student_not_accessible" } };
    const repository = resolveRepository(request);
    if (repository.status !== "success") return { status: "failure", result: repository };
    const head = await readHead(repository.localPath);
    if (head.status !== "success") return { status: "failure", result: head };
    return {
      status: "success",
      backendRequest: {
        courseFolderPath: request.courseFolderPath,
        termCode: request.termCode,
        assignmentSlug: request.assignmentSlug,
        studentId: request.studentId,
        currentSubmissionCommitSha: head.submissionCommitSha
      }
    };
  };
  return {
    add: async (request) => {
      const prepared = await prepare(request);
      return prepared.status === "failure"
        ? prepared.result
        : getBackend().addGradingStudentCommentContext(prepared.backendRequest, request.comment);
    },
    edit: async (request) => {
      const prepared = await prepare(request);
      return prepared.status === "failure"
        ? prepared.result
        : getBackend().editGradingStudentCommentContext(
            prepared.backendRequest,
            request.commentId,
            request.replacement
          );
    },
    delete: async (request) => {
      const prepared = await prepare(request);
      return prepared.status === "failure"
        ? prepared.result
        : getBackend().deleteGradingStudentCommentContext(
            prepared.backendRequest,
            request.commentId
          );
    }
  };
};

export const addGradingStudentComment = (request: AddGradingStudentCommentRequest) =>
  createGradingStudentCommentService().add(request);
export const editGradingStudentComment = (request: EditGradingStudentCommentRequest) =>
  createGradingStudentCommentService().edit(request);
export const deleteGradingStudentComment = (request: DeleteGradingStudentCommentRequest) =>
  createGradingStudentCommentService().delete(request);
