import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveAssignmentPath,
  toForwardSlashPath,
  toRepositoryRelativePath
} from "../../src/core/paths.js";

const REPO_ROOT = path.resolve("tests/fixtures/path-resolution/valid-root");
const ASSIGNMENT_RELATIVE_PATH = "terms/27s1/assignments/lab04/assignment.yml";

describe("path resolution", () => {
  it("TC-PATH-004 assignment path resolves from current working directory", () => {
    const cwd = path.join(REPO_ROOT, "terms", "27s1");
    const assignmentPath = resolveAssignmentPath(cwd, "assignments/lab04/assignment.yml");

    expect(assignmentPath).toBe(path.join(cwd, "assignments", "lab04", "assignment.yml"));
  });

  it("TC-PATH-005 generated repo-relative paths use forward slashes", () => {
    const absolutePath = path.join(
      REPO_ROOT,
      "terms",
      "27s1",
      "assignments",
      "lab04",
      "assignment.yml"
    );

    expect(toRepositoryRelativePath(REPO_ROOT, absolutePath)).toBe(ASSIGNMENT_RELATIVE_PATH);
    expect(toForwardSlashPath("terms\\27s1\\assignments\\lab04\\assignment.yml")).toBe(
      ASSIGNMENT_RELATIVE_PATH
    );
  });

  it("rejects paths outside the repository root", () => {
    const outsidePath = path.resolve("tests/fixtures/path-resolution/no-course-yml/assignment.yml");

    expect(() => toRepositoryRelativePath(REPO_ROOT, outsidePath)).toThrow(
      "outside the repository root"
    );
  });
});
