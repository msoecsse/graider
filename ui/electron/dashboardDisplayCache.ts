import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CourseFolderDashboardResult } from "./ipc.js";
import type { RemoteCourse } from "./remoteCourseTypes.js";
import { measureGradingPhaseSync } from "./gradingPerformance.js";

const VERSION = 1;
const MAX_BYTES = 2 * 1024 * 1024;
const PRIVATE_MODE = 0o600;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const file = (root: string, userId: number) => {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Invalid display account.");
  return path.join(root, `dashboard-display-${userId}.json`);
};
const binding = (course: RemoteCourse) =>
  JSON.stringify([
    course.repositoryId,
    course.organizationId,
    course.defaultBranch,
    course.schemaVersion,
    course.localStatus,
    course.localFolderIds
  ]);
const courseFor = (courses: readonly RemoteCourse[], userId: number, id: string) =>
  courses.find(
    (course) =>
      course.localFolderIds.includes(id) || id === `managed-course:${userId}:${course.repositoryId}`
  );
// Deliberate allowlist: no roster rows, grading data, diagnostics, credentials or write revisions.
const fields = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!record(value)) throw new Error("Invalid display metadata.");
  return Object.fromEntries(
    keys
      .filter(
        (key) =>
          value[key] === null ||
          typeof value[key] === "string" ||
          typeof value[key] === "boolean" ||
          (typeof value[key] === "number" && Number.isFinite(value[key]))
      )
      .map((key) => [key, value[key]])
  );
};
const assignment = (value: unknown) =>
  fields(value, [
    "slug",
    "title",
    "status",
    "gradingEnabled",
    "assignmentFile",
    "applyState",
    "dueAt",
    "needsAttention"
  ]);
const card = (value: unknown) => {
  if (!record(value)) throw new Error("Invalid display card.");
  return {
    ...fields(value, [
      "kind",
      "displayName",
      "courseSlug",
      "courseTitle",
      "coursePath",
      "termSlug",
      "termTitle",
      "status",
      "needsAttention",
      "attentionCount",
      "assignmentCount"
    ]),
    assignments: Array.isArray(value.assignments) ? value.assignments.map(assignment) : [],
    recentAssignments: Array.isArray(value.recentAssignments)
      ? value.recentAssignments.map(assignment)
      : []
  };
};
interface Entry {
  readonly binding: string;
  readonly result: CourseFolderDashboardResult;
}
const read = (root: string, userId: number): Entry[] => {
  try {
    const target = file(root, userId);
    if (fs.statSync(target).size > MAX_BYTES) return [];
    const data: unknown = JSON.parse(fs.readFileSync(target, "utf8"));
    if (
      !record(data) ||
      data.version !== VERSION ||
      data.userId !== userId ||
      !Array.isArray(data.entries)
    )
      return [];
    return data.entries.map((entry: unknown) => {
      if (!record(entry) || typeof entry.binding !== "string" || !record(entry.result))
        throw new Error("Invalid display entry.");
      const result = entry.result;
      if (
        typeof result.courseFolderId !== "string" ||
        typeof result.courseFolderPath !== "string" ||
        typeof result.refreshedAt !== "string" ||
        !record(result.dashboard) ||
        !Array.isArray(result.dashboard.cards)
      )
        throw new Error("Invalid display result.");
      return {
        binding: entry.binding,
        result: {
          courseFolderId: result.courseFolderId,
          courseFolderPath: result.courseFolderPath,
          status: "success" as const,
          error: null,
          refreshedAt: result.refreshedAt,
          dashboard: {
            schemaVersion: 1 as const,
            commandName: "dashboard" as const,
            status: "cached",
            exitCode: 0,
            summary: {},
            diagnostics: [],
            cards: result.dashboard.cards.map(card)
          }
        }
      };
    });
  } catch {
    return [];
  }
};
/** Only called after live account verification. Results are display-only, never guard inputs. */
export const loadDashboardDisplay = (
  root: string,
  userId: number,
  courses: readonly RemoteCourse[]
) =>
  measureGradingPhaseSync("dashboard_cache", () =>
    read(root, userId)
      .filter((entry) => {
        const course = courseFor(courses, userId, entry.result.courseFolderId);
        return (
          course && binding(course) === entry.binding && course.freshness !== "needs_attention"
        );
      })
      .map((entry) => entry.result)
  );
/** Best effort atomic persistence after an authorized dashboard read. */
export const saveDashboardDisplay = (
  root: string,
  userId: number,
  courses: readonly RemoteCourse[],
  result: CourseFolderDashboardResult
): void => {
  const course = courseFor(courses, userId, result.courseFolderId);
  if (
    !course ||
    course.authorization !== "authorized" ||
    !result.dashboard ||
    result.status !== "success"
  )
    return;
  let temporary: string | undefined;
  try {
    const entries = read(root, userId).filter(
      (entry) => entry.result.courseFolderId !== result.courseFolderId
    );
    entries.push({
      binding: binding(course),
      result: {
        courseFolderId: result.courseFolderId,
        courseFolderPath: result.courseFolderPath,
        status: "success",
        error: null,
        refreshedAt: result.refreshedAt,
        dashboard: {
          schemaVersion: 1,
          commandName: "dashboard",
          status: "cached",
          exitCode: 0,
          summary: {},
          diagnostics: [],
          cards: result.dashboard.cards.map(card)
        }
      }
    });
    const data = JSON.stringify({ version: VERSION, userId, entries });
    if (Buffer.byteLength(data) > MAX_BYTES) return;
    fs.mkdirSync(root, { recursive: true });
    const target = file(root, userId);
    temporary = `${target}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, data, { flag: "wx", mode: PRIVATE_MODE });
    fs.renameSync(temporary, target);
  } catch {
    /* Display persistence cannot fail an authorized read. */
  } finally {
    if (temporary) {
      try {
        fs.rmSync(temporary, { force: true });
      } catch {
        /* Best effort cleanup. */
      }
    }
  }
};
