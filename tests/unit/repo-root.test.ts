import path from "node:path";
import { describe, expect, it } from "vitest";
import { findRepositoryRoot } from "../../src/core/repo-root.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/path-resolution");
const VALID_ROOT = path.join(FIXTURE_ROOT, "valid-root");
const NESTED_ROOT = path.join(FIXTURE_ROOT, "nested-root");
const NESTED_SUBDIRECTORY = path.join(NESTED_ROOT, "nested", "deeper");
const MISSING_ROOT = path.join(FIXTURE_ROOT, "no-course-yml");

describe("repository root discovery", () => {
  it("TC-PATH-001 run from repo root finds course.yml", () => {
    const result = findRepositoryRoot(VALID_ROOT);

    expect(result).toEqual({
      found: true,
      repoRoot: VALID_ROOT
    });
  });

  it("TC-PATH-002 run from subdirectory finds nearest parent course.yml", () => {
    const result = findRepositoryRoot(NESTED_SUBDIRECTORY);

    expect(result).toEqual({
      found: true,
      repoRoot: NESTED_ROOT
    });
  });

  it("TC-PATH-003 missing course.yml returns missing_required_file", () => {
    const result = findRepositoryRoot(MISSING_ROOT);

    expect(result.found).toBe(false);
    if (result.found) {
      throw new Error("Expected repository root discovery to fail.");
    }

    expect(result.diagnostic).toMatchObject({
      code: "missing_required_file",
      severity: "error"
    });
    expect(result.diagnostic.message).toContain("course.yml");
  });
});
