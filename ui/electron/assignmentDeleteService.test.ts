import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AssignmentDeleteRequest } from "./ipc";
import { deleteAssignment } from "./assignmentDeleteService";

const assignmentFile = "terms/27s1/assignments/lab02/assignment.yml";

const createRoot = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), "graider-assignment-delete-"));

const request = (root: string, confirmed = false): AssignmentDeleteRequest => ({
  courseFolderId: "course-folder-test",
  courseFolderPath: root,
  assignmentFile,
  confirmed
});

const writeAssignment = (root: string): void => {
  const assignmentPath = path.join(root, assignmentFile);
  fs.mkdirSync(path.dirname(assignmentPath), { recursive: true });
  fs.writeFileSync(assignmentPath, "schema_version: 1\nassignment:\n  slug: lab02\n", "utf8");
  const manifestPath = path.join(root, "terms/27s1/manifests/lab02/manifest.yml");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, "assignment: lab02\n", "utf8");
};

describe("assignmentDeleteService", () => {
  it("requires confirmation, deletes only assignment.yml, and allows recreation", () => {
    const root = createRoot();
    const assignmentPath = path.join(root, assignmentFile);
    const manifestPath = path.join(root, "terms/27s1/manifests/lab02/manifest.yml");
    writeAssignment(root);

    expect(deleteAssignment(request(root))).toMatchObject({ status: "failure" });
    expect(fs.existsSync(assignmentPath)).toBe(true);
    expect(deleteAssignment(request(root, true))).toMatchObject({
      status: "success",
      path: assignmentFile
    });
    expect(fs.existsSync(assignmentPath)).toBe(false);
    expect(fs.existsSync(manifestPath)).toBe(true);

    fs.mkdirSync(path.dirname(assignmentPath), { recursive: true });
    fs.writeFileSync(assignmentPath, "schema_version: 1\nassignment:\n  slug: lab02\n", "utf8");
    expect(fs.existsSync(assignmentPath)).toBe(true);
  });
});
