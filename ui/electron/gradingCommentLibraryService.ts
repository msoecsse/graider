import path from "node:path";
import {
  resolveCurrentFacultyScope,
  type FacultyScopeServiceRequest,
  type FacultyScopeServiceResult
} from "./facultyScopeService.js";

export interface ReusableCommentDto {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly defaultDeduction: number;
  readonly defaultRubricCategoryId?: string;
  readonly tags: readonly string[];
}

export interface ReusableCommentFieldsDto {
  readonly title: string;
  readonly text: string;
  readonly defaultDeduction: number;
  readonly defaultRubricCategoryId?: string | undefined;
  readonly tags: readonly string[];
}

export interface GradingCommentLibraryServiceRequest extends FacultyScopeServiceRequest {}

export interface CreateGradingLibraryCommentServiceRequest extends GradingCommentLibraryServiceRequest {
  readonly comment: ReusableCommentFieldsDto;
}

export interface EditGradingLibraryCommentServiceRequest extends GradingCommentLibraryServiceRequest {
  readonly commentId: string;
  readonly replacement: ReusableCommentFieldsDto;
}

export interface DeleteGradingLibraryCommentServiceRequest extends GradingCommentLibraryServiceRequest {
  readonly commentId: string;
}

export type GradingCommentLibraryResult =
  | { readonly status: "success"; readonly comments: readonly ReusableCommentDto[] }
  | { readonly status: "success"; readonly comment: ReusableCommentDto }
  | { readonly status: "success" }
  | {
      readonly status:
        | "faculty_identity_required"
        | "no_assigned_sections"
        | "roster_error"
        | "term_config_error";
    }
  | { readonly status: "not_found" | "failure"; readonly code: string };

interface GradingCommentLibraryBackend {
  loadGradingCommentLibraryContext(request: {
    readonly courseFolderPath: string;
  }): GradingCommentLibraryResult;
  createGradingLibraryCommentContext(request: {
    readonly courseFolderPath: string;
    readonly comment: ReusableCommentFieldsDto;
  }): GradingCommentLibraryResult;
  editGradingLibraryCommentContext(request: {
    readonly courseFolderPath: string;
    readonly commentId: string;
    readonly replacement: ReusableCommentFieldsDto;
  }): GradingCommentLibraryResult;
  deleteGradingLibraryCommentContext(request: {
    readonly courseFolderPath: string;
    readonly commentId: string;
  }): GradingCommentLibraryResult;
}

export interface GradingCommentLibraryDependencies {
  readonly resolveFacultyScope: (request: FacultyScopeServiceRequest) => FacultyScopeServiceResult;
  readonly loadBackend: () => GradingCommentLibraryBackend;
}

const loadBackend = (): GradingCommentLibraryBackend =>
  require(path.join(__dirname, "gradingCommentLibraryBackend.cjs")) as GradingCommentLibraryBackend;

export const createGradingCommentLibraryService = (
  dependencies: Partial<GradingCommentLibraryDependencies> = {}
): {
  readonly load: (request: GradingCommentLibraryServiceRequest) => GradingCommentLibraryResult;
  readonly create: (
    request: CreateGradingLibraryCommentServiceRequest
  ) => GradingCommentLibraryResult;
  readonly edit: (request: EditGradingLibraryCommentServiceRequest) => GradingCommentLibraryResult;
  readonly delete: (
    request: DeleteGradingLibraryCommentServiceRequest
  ) => GradingCommentLibraryResult;
} => {
  const resolveFacultyScope = dependencies.resolveFacultyScope ?? resolveCurrentFacultyScope;
  const getBackend = dependencies.loadBackend ?? loadBackend;
  const authorize = (
    request: GradingCommentLibraryServiceRequest
  ): GradingCommentLibraryResult | undefined => {
    const scope = resolveFacultyScope(request);
    if (scope.status !== "success") return { status: scope.status };
    if (scope.sections.length === 0) return { status: "no_assigned_sections" };
    return undefined;
  };
  return {
    load: (request) =>
      authorize(request) ??
      getBackend().loadGradingCommentLibraryContext({
        courseFolderPath: request.courseFolderPath
      }),
    create: (request) =>
      authorize(request) ??
      getBackend().createGradingLibraryCommentContext({
        courseFolderPath: request.courseFolderPath,
        comment: request.comment
      }),
    edit: (request) =>
      authorize(request) ??
      getBackend().editGradingLibraryCommentContext({
        courseFolderPath: request.courseFolderPath,
        commentId: request.commentId,
        replacement: request.replacement
      }),
    delete: (request) =>
      authorize(request) ??
      getBackend().deleteGradingLibraryCommentContext({
        courseFolderPath: request.courseFolderPath,
        commentId: request.commentId
      })
  };
};

export const loadGradingCommentLibrary = (request: GradingCommentLibraryServiceRequest) =>
  createGradingCommentLibraryService().load(request);
export const createGradingLibraryComment = (request: CreateGradingLibraryCommentServiceRequest) =>
  createGradingCommentLibraryService().create(request);
export const editGradingLibraryComment = (request: EditGradingLibraryCommentServiceRequest) =>
  createGradingCommentLibraryService().edit(request);
export const deleteGradingLibraryComment = (request: DeleteGradingLibraryCommentServiceRequest) =>
  createGradingCommentLibraryService().delete(request);
