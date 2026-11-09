import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RemoteCourse } from "./remoteCourseTypes.js";

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_MODE = 0o600;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const parseCourse = (value: unknown): RemoteCourse | null => {
  if (
    !isRecord(value) ||
    !isId(value.repositoryId) ||
    !isId(value.organizationId) ||
    !(value.nodeId === null || typeof value.nodeId === "string") ||
    typeof value.organizationLogin !== "string" ||
    !/^[A-Za-z0-9-]+$/.test(value.organizationLogin) ||
    typeof value.name !== "string" ||
    !/^[A-Za-z0-9._-]+$/.test(value.name) ||
    value.name === "." ||
    value.name === ".." ||
    typeof value.defaultBranch !== "string" ||
    !value.defaultBranch ||
    typeof value.code !== "string" ||
    typeof value.title !== "string" ||
    !isId(value.schemaVersion) ||
    typeof value.archived !== "boolean" ||
    !Array.isArray(value.localFolderIds) ||
    !value.localFolderIds.every((id: unknown) => typeof id === "string") ||
    !["private", "public", "internal"].includes(String(value.visibility)) ||
    !["registered_local", "remote_only", "local_origin_mismatch", "local_unverified"].includes(
      String(value.localStatus)
    ) ||
    (value.lifecycle !== undefined &&
      value.lifecycle !== "archived" &&
      value.lifecycle !== "unarchived")
  )
    return null;
  return {
    repositoryId: value.repositoryId,
    organizationId: value.organizationId,
    nodeId: value.nodeId,
    organizationLogin: value.organizationLogin,
    name: value.name,
    fullName: `${value.organizationLogin}/${value.name}`,
    url: `https://github.com/${value.organizationLogin}/${value.name}`,
    defaultBranch: value.defaultBranch,
    code: value.code,
    title: value.title,
    schemaVersion: value.schemaVersion,
    archived: value.archived,
    visibility: value.visibility as RemoteCourse["visibility"],
    localStatus: value.localStatus as RemoteCourse["localStatus"],
    localFolderIds: value.localFolderIds as string[],
    ...(value.lifecycle ? { lifecycle: value.lifecycle } : {}),
    authorization: "unavailable",
    freshness: "cached",
    discoveryHints: [],
    diagnostics: []
  };
};
const snapshotPath = (root: string, userId: number): string => {
  if (!isId(userId)) throw new Error("Invalid snapshot account.");
  return path.join(root, `course-discovery-${userId}.json`);
};
/** Display metadata only. Authorization and local readiness are never restored from disk. */
export const loadCourseSnapshot = (root: string, userId: number): RemoteCourse[] => {
  try {
    const target = snapshotPath(root, userId);
    if (fs.statSync(target).size > MAX_SNAPSHOT_BYTES) return [];
    const parsed: unknown = JSON.parse(fs.readFileSync(target, "utf8"));
    if (
      !isRecord(parsed) ||
      parsed.version !== SNAPSHOT_VERSION ||
      parsed.userId !== userId ||
      !Array.isArray(parsed.courses)
    )
      return [];
    const courses = parsed.courses.map(parseCourse);
    return courses.some((entry) => entry === null)
      ? []
      : courses.filter((entry): entry is RemoteCourse => entry !== null);
  } catch {
    return [];
  }
};
export const saveCourseSnapshot = (
  root: string,
  userId: number,
  courses: readonly RemoteCourse[]
): void => {
  const target = snapshotPath(root, userId);
  const data = courses.map(parseCourse);
  if (data.some((entry) => entry === null)) throw new Error("Invalid snapshot course.");
  const serialized = JSON.stringify({ version: SNAPSHOT_VERSION, userId, courses: data });
  if (Buffer.byteLength(serialized) > MAX_SNAPSHOT_BYTES)
    throw new Error("Course snapshot exceeds size limit.");
  fs.mkdirSync(root, { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, serialized, { encoding: "utf8", flag: "wx", mode: SNAPSHOT_MODE });
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
};
