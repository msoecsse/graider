import type { GradingWorkspacePrepareRequest } from "./ipc.js";

const REQUEST_KEYS = ["courseFolderId", "courseFolderPath", "termCode", "assignmentSlug"] as const;

export const isPrepareGradingWorkspaceRequest = (
  value: unknown
): value is GradingWorkspacePrepareRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return (
    Object.keys(request).length === REQUEST_KEYS.length &&
    Object.keys(request).every((key) =>
      REQUEST_KEYS.includes(key as (typeof REQUEST_KEYS)[number])
    ) &&
    REQUEST_KEYS.every((key) => typeof request[key] === "string" && request[key].trim() !== "")
  );
};
