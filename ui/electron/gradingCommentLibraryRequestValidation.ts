import type {
  CreateGradingLibraryCommentRequest,
  DeleteGradingLibraryCommentRequest,
  EditGradingLibraryCommentRequest,
  LoadGradingCommentLibraryRequest
} from "./ipc.js";

const TERM_CODE_PATTERN = /^\d{2}s[123]$/u;
const IDENTITY_KEYS = ["courseFolderId", "termCode"] as const;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key));

const hasIdentity = (request: Record<string, unknown>): boolean =>
  typeof request.courseFolderId === "string" &&
  request.courseFolderId.trim() !== "" &&
  typeof request.termCode === "string" &&
  TERM_CODE_PATTERN.test(request.termCode);

const isCommentFields = (value: unknown): boolean => {
  const fields = record(value);
  if (fields === null) return false;
  const keys =
    fields.defaultRubricCategoryId === undefined
      ? ["title", "text", "defaultDeduction", "tags"]
      : ["title", "text", "defaultDeduction", "defaultRubricCategoryId", "tags"];
  return (
    hasOnlyKeys(fields, keys) &&
    typeof fields.title === "string" &&
    fields.title.trim() !== "" &&
    typeof fields.text === "string" &&
    fields.text.length > 0 &&
    typeof fields.defaultDeduction === "number" &&
    Number.isFinite(fields.defaultDeduction) &&
    (fields.defaultRubricCategoryId === undefined ||
      (typeof fields.defaultRubricCategoryId === "string" &&
        fields.defaultRubricCategoryId.trim() !== "")) &&
    Array.isArray(fields.tags) &&
    fields.tags.every((tag) => typeof tag === "string")
  );
};

export const isLoadGradingCommentLibraryRequest = (
  value: unknown
): value is LoadGradingCommentLibraryRequest => {
  const request = record(value);
  return request !== null && hasOnlyKeys(request, IDENTITY_KEYS) && hasIdentity(request);
};

export const isCreateGradingLibraryCommentRequest = (
  value: unknown
): value is CreateGradingLibraryCommentRequest => {
  const request = record(value);
  return (
    request !== null &&
    hasOnlyKeys(request, [...IDENTITY_KEYS, "comment"]) &&
    hasIdentity(request) &&
    isCommentFields(request.comment)
  );
};

export const isEditGradingLibraryCommentRequest = (
  value: unknown
): value is EditGradingLibraryCommentRequest => {
  const request = record(value);
  return (
    request !== null &&
    hasOnlyKeys(request, [...IDENTITY_KEYS, "commentId", "replacement"]) &&
    hasIdentity(request) &&
    typeof request.commentId === "string" &&
    request.commentId.trim() !== "" &&
    isCommentFields(request.replacement)
  );
};

export const isDeleteGradingLibraryCommentRequest = (
  value: unknown
): value is DeleteGradingLibraryCommentRequest => {
  const request = record(value);
  return (
    request !== null &&
    hasOnlyKeys(request, [...IDENTITY_KEYS, "commentId"]) &&
    hasIdentity(request) &&
    typeof request.commentId === "string" &&
    request.commentId.trim() !== ""
  );
};
