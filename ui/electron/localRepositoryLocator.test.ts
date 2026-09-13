import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  recordLocalRepository,
  recordSuccessfulDownloadLocators,
  resolveLocalStudentRepository
} from "./localRepositoryLocator";

const roots: string[] = [];
const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-locator-"));
  roots.push(root);
  return { root, file: path.join(root, "locators.json") };
};
const key = (overrides = {}) => ({
  courseFolderId: "course-a",
  termCode: "27s1",
  assignmentSlug: "lab",
  studentId: "jones",
  ...overrides
});
afterEach(() =>
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }))
);

describe("local repository locator", () => {
  it("handles missing, stale, non-directory, malformed, and existing records", () => {
    const { root, file } = setup();
    const directory = path.join(root, "repo");
    fs.mkdirSync(directory);
    expect(resolveLocalStudentRepository(file, key())).toEqual({
      status: "repository_not_recorded"
    });
    recordLocalRepository(file, { ...key(), localPath: directory });
    expect(resolveLocalStudentRepository(file, key())).toEqual({
      status: "success",
      localPath: fs.realpathSync(directory)
    });
    fs.rmSync(directory, { recursive: true });
    expect(resolveLocalStudentRepository(file, key())).toEqual({
      status: "repository_unavailable"
    });
    fs.writeFileSync(directory, "x");
    expect(resolveLocalStudentRepository(file, key())).toEqual({
      status: "repository_unavailable"
    });
    fs.writeFileSync(file, "{bad");
    expect(resolveLocalStudentRepository(file, key())).toEqual({ status: "registry_error" });
  });
  it("keeps independent identities and replaces only the matching locator", () => {
    const { root, file } = setup();
    const paths = ["a", "b", "c", "d", "e"].map((name) => {
      const target = path.join(root, name);
      fs.mkdirSync(target);
      return target;
    });
    recordLocalRepository(file, { ...key(), localPath: paths[0]! });
    recordLocalRepository(file, { ...key({ studentId: "smith" }), localPath: paths[1]! });
    recordLocalRepository(file, { ...key({ assignmentSlug: "lab2" }), localPath: paths[2]! });
    recordLocalRepository(file, { ...key({ termCode: "27s2" }), localPath: paths[3]! });
    recordLocalRepository(file, { ...key({ courseFolderId: "course-b" }), localPath: paths[4]! });
    recordLocalRepository(file, { ...key(), localPath: paths[1]! });
    expect(resolveLocalStudentRepository(file, key())).toMatchObject({
      status: "success",
      localPath: fs.realpathSync(paths[1]!)
    });
    expect(resolveLocalStudentRepository(file, key({ assignmentSlug: "lab2" }))).toMatchObject({
      status: "success",
      localPath: fs.realpathSync(paths[2]!)
    });
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toMatchObject({
      schemaVersion: 1,
      locators: expect.any(Array)
    });
  });
});

describe("successful download locator integration", () => {
  it("records successful targets, including every mapped student, but ignores failed targets", () => {
    const { root, file } = setup();
    const good = path.join(root, "good");
    const failed = path.join(root, "failed");
    fs.mkdirSync(good);
    fs.mkdirSync(failed);
    recordSuccessfulDownloadLocators(
      file,
      { courseFolderId: "course-a", termCode: "27s1", assignmentSlug: "lab" },
      [
        { status: "cloned", localPath: good, studentIds: ["jones", "smith"] },
        { status: "failed", localPath: failed, studentIds: ["lee"] }
      ]
    );
    expect(resolveLocalStudentRepository(file, key())).toMatchObject({
      status: "success",
      localPath: fs.realpathSync(good)
    });
    expect(resolveLocalStudentRepository(file, key({ studentId: "smith" }))).toMatchObject({
      status: "success"
    });
    expect(resolveLocalStudentRepository(file, key({ studentId: "lee" }))).toEqual({
      status: "repository_not_recorded"
    });
  });
  it("replaces a prior successful download at a new destination", () => {
    const { root, file } = setup();
    const first = path.join(root, "first");
    const second = path.join(root, "second");
    fs.mkdirSync(first);
    fs.mkdirSync(second);
    recordSuccessfulDownloadLocators(
      file,
      { courseFolderId: "course-a", termCode: "27s1", assignmentSlug: "lab" },
      [{ status: "cloned", localPath: first, studentIds: ["jones"] }]
    );
    recordSuccessfulDownloadLocators(
      file,
      { courseFolderId: "course-a", termCode: "27s1", assignmentSlug: "lab" },
      [{ status: "cloned", localPath: second, studentIds: ["jones"] }]
    );
    expect(resolveLocalStudentRepository(file, key())).toMatchObject({
      status: "success",
      localPath: fs.realpathSync(second)
    });
  });
});
