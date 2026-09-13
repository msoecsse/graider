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

export interface GradingEditorCursorDto {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface GradingEditorSelectionDto {
  readonly file: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface GradingEditorViewStateDto {
  readonly scrollTop: number;
  readonly cursor: GradingEditorCursorDto;
  readonly selection?: GradingEditorSelectionDto;
}

export interface GradingStudentViewStateRequest extends FacultyScopeServiceRequest {
  readonly courseFolderId: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
}

export interface SaveGradingStudentViewStateRequest extends GradingStudentViewStateRequest {
  readonly viewState: GradingEditorViewStateDto;
}

export type GradingStudentViewStateResult =
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly submissionCommitSha: string;
      readonly gradingStatus: "not_started" | "in_progress" | "complete" | "published";
      readonly viewState: GradingEditorViewStateDto | null;
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

interface GradingStudentViewStateBackendRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha: string;
}

export interface GradingStudentViewStateBackend {
  loadGradingStudentViewStateContext(
    request: GradingStudentViewStateBackendRequest
  ): GradingStudentViewStateResult;
  saveGradingStudentViewStateContext(
    request: GradingStudentViewStateBackendRequest & {
      readonly viewState: GradingEditorViewStateDto;
    }
  ): GradingStudentViewStateResult;
  clearGradingStudentViewStateContext(
    request: GradingStudentViewStateBackendRequest
  ): GradingStudentViewStateResult;
}

export interface GradingStudentViewStateDependencies {
  readonly resolveFacultyScope: (request: FacultyScopeServiceRequest) => FacultyScopeServiceResult;
  readonly resolveRepository: (
    request: GradingStudentViewStateRequest
  ) => LocalRepositoryResolution;
  readonly readHead: (repositoryRoot: string) => Promise<LocalRepositoryHeadResult>;
  readonly loadBackend: () => GradingStudentViewStateBackend;
}

const loadBackend = (): GradingStudentViewStateBackend =>
  require(
    path.join(__dirname, "gradingStudentViewStateBackend.cjs")
  ) as GradingStudentViewStateBackend;

type PreparedRequest =
  | { readonly status: "failure"; readonly result: GradingStudentViewStateResult }
  | {
      readonly status: "success";
      readonly backendRequest: GradingStudentViewStateBackendRequest;
    };

export const createGradingStudentViewStateService = (
  dependencies: Partial<GradingStudentViewStateDependencies> = {}
): {
  readonly load: (
    request: GradingStudentViewStateRequest
  ) => Promise<GradingStudentViewStateResult>;
  readonly save: (
    request: SaveGradingStudentViewStateRequest
  ) => Promise<GradingStudentViewStateResult>;
  readonly clear: (
    request: GradingStudentViewStateRequest
  ) => Promise<GradingStudentViewStateResult>;
} => {
  const resolveFacultyScope = dependencies.resolveFacultyScope ?? resolveCurrentFacultyScope;
  const resolveRepository =
    dependencies.resolveRepository ??
    ((request: GradingStudentViewStateRequest) =>
      resolveLocalStudentRepository(getLocalRepositoryLocatorPath(request.userDataPath), request));
  const readHead = dependencies.readHead ?? readLocalRepositoryHead;
  const getBackend = dependencies.loadBackend ?? loadBackend;

  const prepare = async (request: GradingStudentViewStateRequest): Promise<PreparedRequest> => {
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
    load: async (request) => {
      const prepared = await prepare(request);
      return prepared.status === "failure"
        ? prepared.result
        : getBackend().loadGradingStudentViewStateContext(prepared.backendRequest);
    },
    save: async (request) => {
      const prepared = await prepare(request);
      return prepared.status === "failure"
        ? prepared.result
        : getBackend().saveGradingStudentViewStateContext({
            ...prepared.backendRequest,
            viewState: request.viewState
          });
    },
    clear: async (request) => {
      const prepared = await prepare(request);
      return prepared.status === "failure"
        ? prepared.result
        : getBackend().clearGradingStudentViewStateContext(prepared.backendRequest);
    }
  };
};

export const loadGradingStudentViewState = (
  request: GradingStudentViewStateRequest
): Promise<GradingStudentViewStateResult> => createGradingStudentViewStateService().load(request);

export const saveGradingStudentViewState = (
  request: SaveGradingStudentViewStateRequest
): Promise<GradingStudentViewStateResult> => createGradingStudentViewStateService().save(request);

export const clearGradingStudentViewState = (
  request: GradingStudentViewStateRequest
): Promise<GradingStudentViewStateResult> => createGradingStudentViewStateService().clear(request);
