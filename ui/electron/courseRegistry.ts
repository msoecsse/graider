import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CourseFolderRecord, SelectCourseFolderResult } from "./ipc.js";

export const COURSE_REGISTRY_FILE_NAME = "course-registry.json";
export const COURSE_REGISTRY_SCHEMA_VERSION = 1;

const COURSE_FOLDER_ID_PREFIX = "course-folder";
const COURSE_FOLDER_ID_HASH_LENGTH = 16;
const HASH_ALGORITHM = "sha256";
const HASH_ENCODING = "hex";
const EMPTY_LENGTH = 0;
const FIRST_FILE_PATH_INDEX = 0;

export interface CourseRegistry {
  readonly schemaVersion: typeof COURSE_REGISTRY_SCHEMA_VERSION;
  readonly courseFolders: CourseFolderRecord[];
}

export interface CourseFolderPicker {
  readonly selectFolder: () => Promise<string | null>;
}

export const createEmptyCourseRegistry = (): CourseRegistry => ({
  schemaVersion: COURSE_REGISTRY_SCHEMA_VERSION,
  courseFolders: []
});

export const getCourseRegistryPath = (userDataPath: string): string =>
  path.join(userDataPath, COURSE_REGISTRY_FILE_NAME);

export const normalizeCourseFolderPath = (folderPath: string): string =>
  path.normalize(path.resolve(folderPath));

export const createCourseFolderPathKey = (
  normalizedPath: string,
  platform: NodeJS.Platform = process.platform
): string =>
  platform === "darwin" || platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;

const createCourseFolderId = (normalizedPath: string): string => {
  const pathKey = createCourseFolderPathKey(normalizedPath);
  const hash = crypto
    .createHash(HASH_ALGORITHM)
    .update(pathKey)
    .digest(HASH_ENCODING)
    .slice(EMPTY_LENGTH, COURSE_FOLDER_ID_HASH_LENGTH);

  return `${COURSE_FOLDER_ID_PREFIX}-${hash}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringOrNull = (value: unknown): value is string | null =>
  typeof value === "string" || value === null;

const parseCourseFolderRecord = (value: unknown): CourseFolderRecord | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.path !== "string" ||
    typeof value.lastOpenedAt !== "string" ||
    !isStringOrNull(value.displayAlias) ||
    !isStringOrNull(value.lastRefreshedAt) ||
    !isStringOrNull(value.lastDashboardStatus)
  ) {
    return undefined;
  }

  return {
    id: value.id,
    path: value.path,
    displayAlias: value.displayAlias,
    lastOpenedAt: value.lastOpenedAt,
    lastRefreshedAt: value.lastRefreshedAt,
    lastDashboardStatus: value.lastDashboardStatus
  };
};

const parseCourseRegistry = (value: unknown): CourseRegistry | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    value.schemaVersion !== COURSE_REGISTRY_SCHEMA_VERSION ||
    !Array.isArray(value.courseFolders)
  ) {
    return undefined;
  }

  const courseFolders = value.courseFolders.map(parseCourseFolderRecord);

  if (courseFolders.some((courseFolder) => courseFolder === undefined)) {
    return undefined;
  }

  return {
    schemaVersion: COURSE_REGISTRY_SCHEMA_VERSION,
    courseFolders: courseFolders.filter(
      (courseFolder): courseFolder is CourseFolderRecord => courseFolder !== undefined
    )
  };
};

export const loadCourseRegistry = (registryPath: string): CourseRegistry => {
  try {
    const content = fs.readFileSync(registryPath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    const registry = parseCourseRegistry(parsed);

    return registry ?? createEmptyCourseRegistry();
  } catch {
    return createEmptyCourseRegistry();
  }
};

export const saveCourseRegistry = (registryPath: string, registry: CourseRegistry): void => {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, undefined, 2)}\n`, "utf8");
};

export const addCourseFolder = (
  registry: CourseRegistry,
  folderPath: string,
  openedAt: Date = new Date()
): {
  readonly registry: CourseRegistry;
  readonly courseFolder: CourseFolderRecord;
} => {
  const normalizedPath = normalizeCourseFolderPath(folderPath);
  const normalizedPathKey = createCourseFolderPathKey(normalizedPath);
  const openedAtIso = openedAt.toISOString();
  const existingFolder = registry.courseFolders.find(
    (courseFolder) => createCourseFolderPathKey(courseFolder.path) === normalizedPathKey
  );

  if (existingFolder !== undefined) {
    const updatedFolder = {
      ...existingFolder,
      path: normalizedPath,
      lastOpenedAt: openedAtIso
    };

    return {
      registry: {
        ...registry,
        courseFolders: registry.courseFolders.map((courseFolder) =>
          courseFolder.id === existingFolder.id ? updatedFolder : courseFolder
        )
      },
      courseFolder: updatedFolder
    };
  }

  const courseFolder: CourseFolderRecord = {
    id: createCourseFolderId(normalizedPath),
    path: normalizedPath,
    displayAlias: null,
    lastOpenedAt: openedAtIso,
    lastRefreshedAt: null,
    lastDashboardStatus: null
  };

  return {
    registry: {
      ...registry,
      courseFolders: [...registry.courseFolders, courseFolder]
    },
    courseFolder
  };
};

export const removeCourseFolder = (registry: CourseRegistry, id: string): CourseRegistry => ({
  ...registry,
  courseFolders: registry.courseFolders.filter((courseFolder) => courseFolder.id !== id)
});

export const listCourseFolders = (registryPath: string): CourseFolderRecord[] =>
  loadCourseRegistry(registryPath).courseFolders;

export const addCourseFolderToRegistry = (
  registryPath: string,
  folderPath: string,
  openedAt: Date = new Date()
): CourseFolderRecord => {
  const addResult = addCourseFolder(loadCourseRegistry(registryPath), folderPath, openedAt);

  saveCourseRegistry(registryPath, addResult.registry);

  return addResult.courseFolder;
};

export const removeCourseFolderFromRegistry = (registryPath: string, id: string): void => {
  const registry = removeCourseFolder(loadCourseRegistry(registryPath), id);

  saveCourseRegistry(registryPath, registry);
};

export const getSelectedFolderPath = (filePaths: readonly string[]): string | null =>
  filePaths[FIRST_FILE_PATH_INDEX] ?? null;

export const selectCourseFolderWithPicker = async (
  registryPath: string,
  picker: CourseFolderPicker,
  openedAt: Date = new Date()
): Promise<SelectCourseFolderResult> => {
  const selectedFolder = await picker.selectFolder();

  if (selectedFolder === null) {
    return {
      canceled: true,
      courseFolder: null
    };
  }

  return {
    canceled: false,
    courseFolder: addCourseFolderToRegistry(registryPath, selectedFolder, openedAt)
  };
};
