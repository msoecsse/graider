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

export interface ManualAdjustmentDto {
  readonly id: string;
  readonly rubricCategoryId: string;
  readonly amount: number;
  readonly note?: string;
}

export interface ManualAdjustmentReplacementDto {
  readonly rubricCategoryId: string;
  readonly amount: number;
  readonly note?: string | undefined;
}

export interface GradingStudentManualAdjustmentRequest extends FacultyScopeServiceRequest {
  readonly courseFolderId: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
}

export interface AddGradingStudentManualAdjustmentRequest extends GradingStudentManualAdjustmentRequest {
  readonly adjustment: ManualAdjustmentDto;
}

export interface EditGradingStudentManualAdjustmentRequest extends GradingStudentManualAdjustmentRequest {
  readonly adjustmentId: string;
  readonly replacement: ManualAdjustmentReplacementDto;
}

export interface DeleteGradingStudentManualAdjustmentRequest extends GradingStudentManualAdjustmentRequest {
  readonly adjustmentId: string;
}

export type GradingStudentManualAdjustmentResult =
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly gradingStatus: "not_started" | "in_progress" | "complete" | "published";
      readonly manualAdjustments: readonly ManualAdjustmentDto[];
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

export interface GradingStudentManualAdjustmentBackend {
  addGradingStudentManualAdjustmentContext(
    request: BackendRequest,
    adjustment: ManualAdjustmentDto
  ): GradingStudentManualAdjustmentResult;
  editGradingStudentManualAdjustmentContext(
    request: BackendRequest,
    adjustmentId: string,
    replacement: ManualAdjustmentReplacementDto
  ): GradingStudentManualAdjustmentResult;
  deleteGradingStudentManualAdjustmentContext(
    request: BackendRequest,
    adjustmentId: string
  ): GradingStudentManualAdjustmentResult;
}

export interface GradingStudentManualAdjustmentDependencies {
  readonly resolveFacultyScope: (request: FacultyScopeServiceRequest) => FacultyScopeServiceResult;
  readonly resolveRepository: (
    request: GradingStudentManualAdjustmentRequest
  ) => LocalRepositoryResolution;
  readonly readHead: (repositoryRoot: string) => Promise<LocalRepositoryHeadResult>;
  readonly loadBackend: () => GradingStudentManualAdjustmentBackend;
}

const loadBackend = (): GradingStudentManualAdjustmentBackend =>
  require(
    path.join(__dirname, "gradingStudentManualAdjustmentBackend.cjs")
  ) as GradingStudentManualAdjustmentBackend;

type Prepared =
  | { readonly status: "failure"; readonly result: GradingStudentManualAdjustmentResult }
  | { readonly status: "success"; readonly backendRequest: BackendRequest };

export const createGradingStudentManualAdjustmentService = (
  dependencies: Partial<GradingStudentManualAdjustmentDependencies> = {}
): {
  readonly add: (
    request: AddGradingStudentManualAdjustmentRequest
  ) => Promise<GradingStudentManualAdjustmentResult>;
  readonly edit: (
    request: EditGradingStudentManualAdjustmentRequest
  ) => Promise<GradingStudentManualAdjustmentResult>;
  readonly delete: (
    request: DeleteGradingStudentManualAdjustmentRequest
  ) => Promise<GradingStudentManualAdjustmentResult>;
} => {
  const resolveFacultyScope = dependencies.resolveFacultyScope ?? resolveCurrentFacultyScope;
  const resolveRepository =
    dependencies.resolveRepository ??
    ((request: GradingStudentManualAdjustmentRequest) =>
      resolveLocalStudentRepository(getLocalRepositoryLocatorPath(request.userDataPath), request));
  const readHead = dependencies.readHead ?? readLocalRepositoryHead;
  const getBackend = dependencies.loadBackend ?? loadBackend;
  const prepare = async (request: GradingStudentManualAdjustmentRequest): Promise<Prepared> => {
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
        : getBackend().addGradingStudentManualAdjustmentContext(
            prepared.backendRequest,
            request.adjustment
          );
    },
    edit: async (request) => {
      const prepared = await prepare(request);
      return prepared.status === "failure"
        ? prepared.result
        : getBackend().editGradingStudentManualAdjustmentContext(
            prepared.backendRequest,
            request.adjustmentId,
            request.replacement
          );
    },
    delete: async (request) => {
      const prepared = await prepare(request);
      return prepared.status === "failure"
        ? prepared.result
        : getBackend().deleteGradingStudentManualAdjustmentContext(
            prepared.backendRequest,
            request.adjustmentId
          );
    }
  };
};

export const addGradingStudentManualAdjustment = (
  request: AddGradingStudentManualAdjustmentRequest
) => createGradingStudentManualAdjustmentService().add(request);
export const editGradingStudentManualAdjustment = (
  request: EditGradingStudentManualAdjustmentRequest
) => createGradingStudentManualAdjustmentService().edit(request);
export const deleteGradingStudentManualAdjustment = (
  request: DeleteGradingStudentManualAdjustmentRequest
) => createGradingStudentManualAdjustmentService().delete(request);
