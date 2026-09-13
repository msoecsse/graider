import type { BulkPublishGradingStudentReportsRequest } from "./ipc.js";

const REQUEST_KEYS = [
  "courseFolderId",
  "courseFolderPath",
  "termCode",
  "assignmentSlug",
  "studentIds"
] as const;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const isBulkPublishGradingStudentReportsRequest = (
  value: unknown
): value is BulkPublishGradingStudentReportsRequest => {
  const request = record(value);
  if (
    request === null ||
    Object.keys(request).length !== REQUEST_KEYS.length ||
    !Object.keys(request).every((key) =>
      REQUEST_KEYS.includes(key as (typeof REQUEST_KEYS)[number])
    )
  )
    return false;
  const identityValues = [
    request.courseFolderId,
    request.courseFolderPath,
    request.termCode,
    request.assignmentSlug
  ];
  if (
    !identityValues.every((field) => typeof field === "string" && field.trim() !== "") ||
    !Array.isArray(request.studentIds) ||
    request.studentIds.length === 0 ||
    !request.studentIds.every(
      (studentId) => typeof studentId === "string" && studentId.trim() !== ""
    )
  )
    return false;
  return new Set(request.studentIds).size === request.studentIds.length;
};
