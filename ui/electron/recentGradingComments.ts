import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getLocalSettingsPath, loadLocalSettings } from "./localSettings.js";
import type { FacultyScopeServiceRequest } from "./facultyScopeService.js";

import { RECENT_COMMENT_LIMIT } from "./recentCommentLimit.js";
interface RecentComment {
  readonly id: string;
  readonly usedAt: number;
}

const historyPath = (request: FacultyScopeServiceRequest): string => {
  const faculty = loadLocalSettings(
    getLocalSettingsPath(request.userDataPath)
  ).currentFacultyMsoeUsername;
  const scope = createHash("sha256")
    .update(JSON.stringify([path.resolve(request.courseFolderPath), faculty]))
    .digest("hex");
  return path.join(request.userDataPath, "recent-grading-comments", `${scope}.json`);
};

export const loadRecentGradingComments = (
  request: FacultyScopeServiceRequest
): readonly RecentComment[] => {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(historyPath(request), "utf8"));
    return Array.isArray(value)
      ? value
          .filter(
            (entry): entry is RecentComment =>
              typeof entry === "object" &&
              entry !== null &&
              typeof entry.id === "string" &&
              typeof entry.usedAt === "number" &&
              Number.isFinite(entry.usedAt)
          )
          .slice(0, RECENT_COMMENT_LIMIT)
      : [];
  } catch {
    return [];
  }
};

// Preference failures must never turn a successfully saved grade into an error.
export const recordRecentGradingComment = (
  request: FacultyScopeServiceRequest,
  id: string
): void => {
  try {
    const entries = [
      { id, usedAt: Date.now() },
      ...loadRecentGradingComments(request).filter((entry) => entry.id !== id)
    ].slice(0, RECENT_COMMENT_LIMIT);
    const destination = historyPath(request);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(entries)}\n`, "utf8");
  } catch {
    /* Local history is best effort; grading has already succeeded. */
  }
};
