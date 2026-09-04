import type { RosterRemoveRequest, RosterSaveRequest, RosterSectionRequest } from "./ipc.js";

const isRosterSectionRequest = (value: unknown): value is RosterSectionRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    typeof request.courseFolderId === "string" &&
    typeof request.courseFolderPath === "string" &&
    typeof request.termCode === "string" &&
    typeof request.sectionId === "string"
  );
};

export const isRosterSaveRequest = (value: unknown): value is RosterSaveRequest => {
  if (!isRosterSectionRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    Array.isArray(request.rows) &&
    request.rows.every(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        !Array.isArray(row) &&
        ["studentId", "githubUsername", "section", "status"].every(
          (key) => typeof (row as Record<string, unknown>)[key] === "string"
        )
    ) &&
    (typeof request.createSection === "boolean" || request.createSection === undefined) &&
    typeof request.confirmed === "boolean"
  );
};

export const isRosterRemoveRequest = (value: unknown): value is RosterRemoveRequest =>
  isRosterSectionRequest(value) &&
  typeof (value as unknown as Record<string, unknown>).confirmed === "boolean";

export { isRosterSectionRequest };
