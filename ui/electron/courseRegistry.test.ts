import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addCourseFolder,
  addCourseFolderToRegistry,
  createCourseFolderPathKey,
  createEmptyCourseRegistry,
  getCourseRegistryPath,
  loadCourseRegistry,
  removeCourseFolder,
  removeCourseFolderFromRegistry,
  saveCourseRegistry,
  selectCourseFolderWithPicker
} from "./courseRegistry";

const TEMP_PREFIX = "graider-ui-registry-";
const FIRST_OPENED_AT = new Date("2026-06-09T19:30:00.000Z");
const SECOND_OPENED_AT = new Date("2026-06-09T20:00:00.000Z");
const REGISTRY_SCHEMA_VERSION = 1;
const EMPTY_LENGTH = 0;
const SINGLE_FOLDER_COUNT = 1;

const tempRoots: string[] = [];

const createTempRoot = (): string => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));

  tempRoots.push(tempRoot);

  return tempRoot;
};

afterEach(() => {
  for (const tempRoot of tempRoots.splice(EMPTY_LENGTH)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe("course registry", () => {
  it("loads a missing registry as empty", () => {
    const registry = loadCourseRegistry(getCourseRegistryPath(createTempRoot()));

    expect(registry).toEqual({
      schemaVersion: REGISTRY_SCHEMA_VERSION,
      courseFolders: []
    });
  });

  it("saves and loads course folder records", () => {
    const registryPath = getCourseRegistryPath(createTempRoot());
    const addResult = addCourseFolder(
      createEmptyCourseRegistry(),
      "/Users/sean/dev/csc1120",
      FIRST_OPENED_AT
    );

    saveCourseRegistry(registryPath, addResult.registry);

    expect(loadCourseRegistry(registryPath).courseFolders).toEqual([addResult.courseFolder]);
  });

  it("adds a folder record with stable id, normalized path, and timestamp", () => {
    const addResult = addCourseFolder(
      createEmptyCourseRegistry(),
      "/Users/sean/dev/../dev/csc1120",
      FIRST_OPENED_AT
    );

    expect(addResult.courseFolder).toMatchObject({
      id: expect.stringMatching(/^course-folder-[a-f0-9]+$/),
      path: "/Users/sean/dev/csc1120",
      displayAlias: null,
      lastOpenedAt: "2026-06-09T19:30:00.000Z",
      lastRefreshedAt: null,
      lastDashboardStatus: null
    });
  });

  it("deduplicates the same folder path and updates lastOpenedAt", () => {
    const firstAdd = addCourseFolder(
      createEmptyCourseRegistry(),
      "/Users/sean/dev/csc1120",
      FIRST_OPENED_AT
    );
    const secondAdd = addCourseFolder(
      firstAdd.registry,
      "/Users/sean/dev/../dev/csc1120",
      SECOND_OPENED_AT
    );

    expect(secondAdd.registry.courseFolders).toHaveLength(SINGLE_FOLDER_COUNT);
    expect(secondAdd.courseFolder.id).toBe(firstAdd.courseFolder.id);
    expect(secondAdd.courseFolder.lastOpenedAt).toBe("2026-06-09T20:00:00.000Z");
  });

  it("uses case-insensitive path keys on macOS and Windows", () => {
    expect(createCourseFolderPathKey("/Users/Sean/Course", "darwin")).toBe("/users/sean/course");
    expect(createCourseFolderPathKey("C:\\Users\\Sean\\Course", "win32")).toBe(
      "c:\\users\\sean\\course"
    );
    expect(createCourseFolderPathKey("/Users/Sean/Course", "linux")).toBe("/Users/Sean/Course");
  });

  it("removes matching ids and safely ignores unknown ids", () => {
    const addResult = addCourseFolder(
      createEmptyCourseRegistry(),
      "/Users/sean/dev/csc1120",
      FIRST_OPENED_AT
    );
    const unknownRemoval = removeCourseFolder(addResult.registry, "missing-id");
    const knownRemoval = removeCourseFolder(addResult.registry, addResult.courseFolder.id);

    expect(unknownRemoval.courseFolders).toEqual(addResult.registry.courseFolders);
    expect(knownRemoval.courseFolders).toEqual([]);
  });

  it("recovers from corrupt registry JSON without crashing", () => {
    const registryPath = getCourseRegistryPath(createTempRoot());

    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, "{ not valid json", "utf8");

    expect(loadCourseRegistry(registryPath)).toEqual(createEmptyCourseRegistry());
  });

  it("persists add and remove operations", () => {
    const registryPath = getCourseRegistryPath(createTempRoot());
    const courseFolder = addCourseFolderToRegistry(
      registryPath,
      "/Users/sean/dev/csc1120",
      FIRST_OPENED_AT
    );

    removeCourseFolderFromRegistry(registryPath, courseFolder.id);

    expect(loadCourseRegistry(registryPath).courseFolders).toEqual([]);
  });

  it("does not store token fields", () => {
    const registryPath = getCourseRegistryPath(createTempRoot());

    addCourseFolderToRegistry(registryPath, "/Users/sean/dev/csc1120", FIRST_OPENED_AT);

    const content = fs.readFileSync(registryPath, "utf8");

    expect(content).not.toContain("token");
    expect(content).not.toContain("GRAIDER_GITHUB_TOKEN");
  });

  it("returns canceled folder selection without saving", async () => {
    const registryPath = getCourseRegistryPath(createTempRoot());
    const result = await selectCourseFolderWithPicker(registryPath, {
      selectFolder: async () => null
    });

    expect(result).toEqual({ canceled: true, courseFolder: null });
    expect(loadCourseRegistry(registryPath).courseFolders).toEqual([]);
  });

  it("adds selected folders through a picker adapter", async () => {
    const registryPath = getCourseRegistryPath(createTempRoot());
    const result = await selectCourseFolderWithPicker(
      registryPath,
      {
        selectFolder: async () => "/Users/sean/dev/csc1120"
      },
      FIRST_OPENED_AT
    );

    expect(result.canceled).toBe(false);
    expect(result.courseFolder?.path).toBe("/Users/sean/dev/csc1120");
    expect(loadCourseRegistry(registryPath).courseFolders).toHaveLength(SINGLE_FOLDER_COUNT);
  });
});
