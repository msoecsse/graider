import path from "node:path";
import type {
  CourseMutationPublicationResult,
  CoursePublishActionResult,
  CourseSetupDiagnostic
} from "./ipc.js";
import { publishSuccessfulCourseMutation } from "./courseMutationPublicationService.js";
import { publishCourseChanges } from "./coursePublishService.js";
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
  readonly defaultRubricCategoryId?: string | undefined;
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

type GradingCommentLibraryAccessFailure = {
  readonly status:
    | "faculty_identity_required"
    | "no_assigned_sections"
    | "roster_error"
    | "term_config_error";
};

type GradingCommentLibraryOperationFailure = {
  readonly status: "not_found" | "failure";
  readonly code: string;
};

export type GradingCommentLibraryLoadResult =
  | { readonly status: "success"; readonly comments: readonly ReusableCommentDto[] }
  | GradingCommentLibraryAccessFailure
  | GradingCommentLibraryOperationFailure;

type GradingCommentLibraryLocalMutationResult =
  | { readonly status: "success"; readonly comment: ReusableCommentDto }
  | { readonly status: "success" }
  | GradingCommentLibraryAccessFailure
  | GradingCommentLibraryOperationFailure;

export type GradingCommentLibraryMutationResult =
  | {
      readonly status: "success";
      readonly comment: ReusableCommentDto;
      readonly diagnostics: readonly CourseSetupDiagnostic[];
      readonly publication: CourseMutationPublicationResult;
    }
  | {
      readonly status: "success";
      readonly diagnostics: readonly CourseSetupDiagnostic[];
      readonly publication: CourseMutationPublicationResult;
    }
  | GradingCommentLibraryAccessFailure
  | GradingCommentLibraryOperationFailure;

export type GradingCommentLibraryResult =
  | GradingCommentLibraryLoadResult
  | GradingCommentLibraryMutationResult;

interface GradingCommentLibraryBackend {
  loadGradingCommentLibraryContext(request: {
    readonly courseFolderPath: string;
  }): GradingCommentLibraryLoadResult;
  createGradingLibraryCommentContext(request: {
    readonly courseFolderPath: string;
    readonly comment: ReusableCommentFieldsDto;
  }): GradingCommentLibraryLocalMutationResult;
  editGradingLibraryCommentContext(request: {
    readonly courseFolderPath: string;
    readonly commentId: string;
    readonly replacement: ReusableCommentFieldsDto;
  }): GradingCommentLibraryLocalMutationResult;
  deleteGradingLibraryCommentContext(request: {
    readonly courseFolderPath: string;
    readonly commentId: string;
  }): GradingCommentLibraryLocalMutationResult;
}

export interface GradingCommentLibraryDependencies {
  readonly resolveFacultyScope: (request: FacultyScopeServiceRequest) => FacultyScopeServiceResult;
  readonly loadBackend: () => GradingCommentLibraryBackend;
  readonly publishCourseChanges: (courseFolderPath: string) => Promise<CoursePublishActionResult>;
}

const loadBackend = (): GradingCommentLibraryBackend =>
  require(path.join(__dirname, "gradingCommentLibraryBackend.cjs")) as GradingCommentLibraryBackend;

export const createGradingCommentLibraryService = (
  dependencies: Partial<GradingCommentLibraryDependencies> = {}
): {
  readonly load: (request: GradingCommentLibraryServiceRequest) => GradingCommentLibraryLoadResult;
  readonly create: (
    request: CreateGradingLibraryCommentServiceRequest
  ) => Promise<GradingCommentLibraryMutationResult>;
  readonly edit: (
    request: EditGradingLibraryCommentServiceRequest
  ) => Promise<GradingCommentLibraryMutationResult>;
  readonly delete: (
    request: DeleteGradingLibraryCommentServiceRequest
  ) => Promise<GradingCommentLibraryMutationResult>;
} => {
  const resolveFacultyScope = dependencies.resolveFacultyScope ?? resolveCurrentFacultyScope;
  const getBackend = dependencies.loadBackend ?? loadBackend;
  const publish = dependencies.publishCourseChanges ?? publishCourseChanges;
  const authorize = (
    request: GradingCommentLibraryServiceRequest
  ): GradingCommentLibraryAccessFailure | undefined => {
    const scope = resolveFacultyScope(request);
    if (scope.status !== "success") return { status: scope.status };
    if (scope.sections.length === 0) return { status: "no_assigned_sections" };
    return undefined;
  };
  const publishMutation = async (
    courseFolderPath: string,
    result: GradingCommentLibraryLocalMutationResult
  ): Promise<GradingCommentLibraryMutationResult> => {
    if (result.status !== "success") return result;
    return await publishSuccessfulCourseMutation(
      courseFolderPath,
      { ...result, diagnostics: [] },
      publish
    );
  };
  return {
    load: (request) =>
      authorize(request) ??
      getBackend().loadGradingCommentLibraryContext({
        courseFolderPath: request.courseFolderPath
      }),
    create: async (request) => {
      const authorizationFailure = authorize(request);
      if (authorizationFailure !== undefined) return authorizationFailure;
      const result = getBackend().createGradingLibraryCommentContext({
        courseFolderPath: request.courseFolderPath,
        comment: request.comment
      });
      return await publishMutation(request.courseFolderPath, result);
    },
    edit: async (request) => {
      const authorizationFailure = authorize(request);
      if (authorizationFailure !== undefined) return authorizationFailure;
      const result = getBackend().editGradingLibraryCommentContext({
        courseFolderPath: request.courseFolderPath,
        commentId: request.commentId,
        replacement: request.replacement
      });
      return await publishMutation(request.courseFolderPath, result);
    },
    delete: async (request) => {
      const authorizationFailure = authorize(request);
      if (authorizationFailure !== undefined) return authorizationFailure;
      const result = getBackend().deleteGradingLibraryCommentContext({
        courseFolderPath: request.courseFolderPath,
        commentId: request.commentId
      });
      return await publishMutation(request.courseFolderPath, result);
    }
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
