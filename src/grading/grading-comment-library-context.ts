import {
  createReusableCommentWithGeneratedId,
  deleteReusableComment,
  editReusableComment,
  listReusableComments,
  type ReusableComment,
  type ReusableCommentFields
} from "./comment-library.js";

export interface GradingCommentLibraryContextRequest {
  readonly courseFolderPath: string;
}

export type GradingCommentLibraryContextFailure =
  | { readonly status: "not_found"; readonly code: string }
  | { readonly status: "failure"; readonly code: string };

export type GradingCommentLibraryLoadContextResult =
  | { readonly status: "success"; readonly comments: readonly ReusableComment[] }
  | GradingCommentLibraryContextFailure;

export type GradingCommentLibraryCommentMutationContextResult =
  | { readonly status: "success"; readonly comment: ReusableComment }
  | GradingCommentLibraryContextFailure;

export type GradingCommentLibraryDeleteContextResult =
  | { readonly status: "success" }
  | GradingCommentLibraryContextFailure;

export type GradingCommentLibraryContextResult =
  | GradingCommentLibraryLoadContextResult
  | GradingCommentLibraryCommentMutationContextResult
  | GradingCommentLibraryDeleteContextResult;

const failure = (result: { readonly status: "failure"; readonly code: string }) => ({
  status: "failure" as const,
  code: result.code
});

export const loadGradingCommentLibraryContext = (
  request: GradingCommentLibraryContextRequest
): GradingCommentLibraryLoadContextResult => {
  const loaded = listReusableComments(request.courseFolderPath);
  return loaded.status === "success"
    ? { status: "success", comments: loaded.value }
    : failure(loaded);
};

export const createGradingLibraryCommentContext = (
  request: GradingCommentLibraryContextRequest & { readonly comment: ReusableCommentFields },
  generateId?: () => string
): GradingCommentLibraryCommentMutationContextResult => {
  const created = createReusableCommentWithGeneratedId(
    request.courseFolderPath,
    request.comment,
    generateId
  );
  return created.status === "success"
    ? { status: "success", comment: created.value }
    : failure(created);
};

export const editGradingLibraryCommentContext = (
  request: GradingCommentLibraryContextRequest & {
    readonly commentId: string;
    readonly replacement: ReusableCommentFields;
  }
): GradingCommentLibraryCommentMutationContextResult => {
  const edited = editReusableComment(
    request.courseFolderPath,
    request.commentId,
    request.replacement
  );
  if (edited.status === "not_found") return { status: "not_found", code: edited.code };
  return edited.status === "success"
    ? { status: "success", comment: edited.value }
    : failure(edited);
};

export const deleteGradingLibraryCommentContext = (
  request: GradingCommentLibraryContextRequest & { readonly commentId: string }
): GradingCommentLibraryDeleteContextResult => {
  const deleted = deleteReusableComment(request.courseFolderPath, request.commentId);
  if (deleted.status === "not_found") return { status: "not_found", code: deleted.code };
  return deleted.status === "success" ? { status: "success" } : failure(deleted);
};
