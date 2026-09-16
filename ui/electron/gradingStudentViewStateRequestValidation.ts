import path from "node:path";
import type {
  GradingEditorViewState,
  AddGradingStudentCommentRequest,
  AddGradingStudentManualAdjustmentRequest,
  EditGradingStudentCommentRequest,
  EditGradingStudentManualAdjustmentRequest,
  DeleteGradingStudentCommentRequest,
  DeleteGradingStudentManualAdjustmentRequest,
  GradingStudentViewStateRequest,
  SaveGradingStudentViewStateRequest
} from "./ipc.js";
import type { GradingStudentWorkflowRepairRequest } from "./gradingStudentWorkflowRepairService.js";
import type { GradingBulkWorkflowRepairRequest } from "./gradingBulkWorkflowRepairService.js";

type GradingEditorSelection = NonNullable<GradingEditorViewState["selection"]>;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key));

const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const relativeFile = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim() !== "" &&
  !path.isAbsolute(value) &&
  !path.win32.isAbsolute(value);

const isSelection = (value: unknown): value is GradingEditorSelection => {
  const selection = record(value);
  if (
    selection === null ||
    !hasOnlyKeys(selection, ["file", "startLine", "startColumn", "endLine", "endColumn"]) ||
    !relativeFile(selection.file) ||
    !positiveInteger(selection.startLine) ||
    !positiveInteger(selection.startColumn) ||
    !positiveInteger(selection.endLine) ||
    !positiveInteger(selection.endColumn)
  )
    return false;
  return (
    selection.startLine < selection.endLine ||
    (selection.startLine === selection.endLine && selection.startColumn <= selection.endColumn)
  );
};

const isViewState = (value: unknown): value is GradingEditorViewState => {
  const viewState = record(value);
  if (viewState === null) return false;
  const keys =
    viewState.selection === undefined
      ? ["scrollTop", "cursor"]
      : ["scrollTop", "cursor", "selection"];
  const cursor = record(viewState.cursor);
  return (
    hasOnlyKeys(viewState, keys) &&
    typeof viewState.scrollTop === "number" &&
    Number.isFinite(viewState.scrollTop) &&
    viewState.scrollTop >= 0 &&
    cursor !== null &&
    hasOnlyKeys(cursor, ["file", "line", "column"]) &&
    relativeFile(cursor.file) &&
    positiveInteger(cursor.line) &&
    positiveInteger(cursor.column) &&
    (viewState.selection === undefined || isSelection(viewState.selection))
  );
};

const IDENTITY_KEYS = [
  "courseFolderId",
  "courseFolderPath",
  "termCode",
  "assignmentSlug",
  "studentId"
] as const;

const hasIdentity = (request: Record<string, unknown>): boolean =>
  IDENTITY_KEYS.every((key) => typeof request[key] === "string" && request[key].trim() !== "");

export const isGradingStudentViewStateRequest = (
  value: unknown
): value is GradingStudentViewStateRequest => {
  const request = record(value);
  return request !== null && hasOnlyKeys(request, IDENTITY_KEYS) && hasIdentity(request);
};

export const isLoadGradingStudentSourceRequest = isGradingStudentViewStateRequest;
export const isMarkGradingStudentCompleteRequest = isGradingStudentViewStateRequest;
export const isLoadGradingStudentEvidenceRequest = isGradingStudentViewStateRequest;
export const isLoadGradingStudentCommitHistoryRequest = isGradingStudentViewStateRequest;
export const isPublishGradingStudentReportRequest = isGradingStudentViewStateRequest;

export const isGradingStudentWorkflowRepairRequest = (
  value: unknown
): value is GradingStudentWorkflowRepairRequest => {
  const request = record(value);
  return (
    request !== null &&
    hasOnlyKeys(request, [...IDENTITY_KEYS, "confirmed"]) &&
    hasIdentity(request) &&
    typeof request.confirmed === "boolean"
  );
};

export const isGradingBulkWorkflowRepairRequest = (
  value: unknown
): value is GradingBulkWorkflowRepairRequest => {
  const request = record(value);
  const keys = ["courseFolderId", "courseFolderPath", "termCode", "assignmentSlug"];
  return (
    request !== null &&
    hasOnlyKeys(request, [...keys, "confirmed"]) &&
    keys.every((key) => typeof request[key] === "string" && request[key].trim() !== "") &&
    typeof request.confirmed === "boolean"
  );
};

export const isSaveGradingStudentViewStateRequest = (
  value: unknown
): value is SaveGradingStudentViewStateRequest => {
  const request = record(value);
  return (
    request !== null &&
    hasOnlyKeys(request, [...IDENTITY_KEYS, "viewState"]) &&
    hasIdentity(request) &&
    isViewState(request.viewState)
  );
};

const isSourceLocation = (value: unknown): boolean => {
  const location = record(value);
  return (
    location !== null &&
    hasOnlyKeys(location, ["file", "startLine", "endLine"]) &&
    relativeFile(location.file) &&
    positiveInteger(location.startLine) &&
    positiveInteger(location.endLine) &&
    location.endLine >= location.startLine
  );
};

const isCommentFields = (value: unknown, includeId: boolean, requireTitle: boolean): boolean => {
  const comment = record(value);
  if (comment === null) return false;
  const optional = [
    ...(includeId ? ["id", "sourceCommentId"] : []),
    "title",
    "rubricCategoryId",
    "sourceLocation"
  ];
  const required = ["text", "deduction"];
  if (!Object.keys(comment).every((key) => [...required, ...optional].includes(key))) return false;
  if (!required.every((key) => key in comment)) return false;
  return (
    (!includeId || (typeof comment.id === "string" && comment.id.trim() !== "")) &&
    (comment.sourceCommentId === undefined ||
      (typeof comment.sourceCommentId === "string" && comment.sourceCommentId.trim() !== "")) &&
    (requireTitle
      ? typeof comment.title === "string" && comment.title.trim() !== ""
      : comment.title === undefined ||
        (typeof comment.title === "string" && comment.title.trim() !== "")) &&
    typeof comment.text === "string" &&
    typeof comment.deduction === "number" &&
    Number.isFinite(comment.deduction) &&
    (comment.rubricCategoryId === undefined ||
      (typeof comment.rubricCategoryId === "string" && comment.rubricCategoryId.trim() !== "")) &&
    (comment.sourceLocation === undefined || isSourceLocation(comment.sourceLocation))
  );
};

export const isAddGradingStudentCommentRequest = (
  value: unknown
): value is AddGradingStudentCommentRequest => {
  const request = record(value);
  return (
    request !== null &&
    hasOnlyKeys(request, [...IDENTITY_KEYS, "comment"]) &&
    hasIdentity(request) &&
    isCommentFields(request.comment, true, true)
  );
};

export const isEditGradingStudentCommentRequest = (
  value: unknown
): value is EditGradingStudentCommentRequest => {
  const request = record(value);
  return (
    request !== null &&
    hasOnlyKeys(request, [...IDENTITY_KEYS, "commentId", "replacement"]) &&
    hasIdentity(request) &&
    typeof request.commentId === "string" &&
    request.commentId.trim() !== "" &&
    isCommentFields(request.replacement, false, false)
  );
};

export const isDeleteGradingStudentCommentRequest = (
  value: unknown
): value is DeleteGradingStudentCommentRequest => {
  const request = record(value);
  return (
    request !== null &&
    hasOnlyKeys(request, [...IDENTITY_KEYS, "commentId"]) &&
    hasIdentity(request) &&
    typeof request.commentId === "string" &&
    request.commentId.trim() !== ""
  );
};

const isManualAdjustmentFields = (value: unknown, includeId: boolean): boolean => {
  const adjustment = record(value);
  if (adjustment === null) return false;
  const allowedKeys = [...(includeId ? ["id"] : []), "rubricCategoryId", "amount", "note"];
  const requiredKeys = [...(includeId ? ["id"] : []), "rubricCategoryId", "amount"];
  return (
    Object.keys(adjustment).every((key) => allowedKeys.includes(key)) &&
    requiredKeys.every((key) => key in adjustment) &&
    (!includeId || (typeof adjustment.id === "string" && adjustment.id.trim() !== "")) &&
    typeof adjustment.rubricCategoryId === "string" &&
    adjustment.rubricCategoryId.trim() !== "" &&
    typeof adjustment.amount === "number" &&
    Number.isFinite(adjustment.amount) &&
    (adjustment.note === undefined || typeof adjustment.note === "string")
  );
};

export const isAddGradingStudentManualAdjustmentRequest = (
  value: unknown
): value is AddGradingStudentManualAdjustmentRequest => {
  const request = record(value);
  return (
    request !== null &&
    hasOnlyKeys(request, [...IDENTITY_KEYS, "adjustment"]) &&
    hasIdentity(request) &&
    isManualAdjustmentFields(request.adjustment, true)
  );
};

export const isEditGradingStudentManualAdjustmentRequest = (
  value: unknown
): value is EditGradingStudentManualAdjustmentRequest => {
  const request = record(value);
  return (
    request !== null &&
    hasOnlyKeys(request, [...IDENTITY_KEYS, "adjustmentId", "replacement"]) &&
    hasIdentity(request) &&
    typeof request.adjustmentId === "string" &&
    request.adjustmentId.trim() !== "" &&
    isManualAdjustmentFields(request.replacement, false)
  );
};

export const isDeleteGradingStudentManualAdjustmentRequest = (
  value: unknown
): value is DeleteGradingStudentManualAdjustmentRequest => {
  const request = record(value);
  return (
    request !== null &&
    hasOnlyKeys(request, [...IDENTITY_KEYS, "adjustmentId"]) &&
    hasIdentity(request) &&
    typeof request.adjustmentId === "string" &&
    request.adjustmentId.trim() !== ""
  );
};
