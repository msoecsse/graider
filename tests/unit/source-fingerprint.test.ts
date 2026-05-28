import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInputFingerprint,
  createSourceFingerprint,
  getSourceFingerprintPaths
} from "../../src/config/source-fingerprint.js";
import { hashFileSha256 } from "../../src/core/hash.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/source-fingerprint");
const VALID_ROOT = path.join(FIXTURE_ROOT, "valid-course");
const CHANGED_ROSTER_A_ROOT = path.join(FIXTURE_ROOT, "changed-roster-a");
const CHANGED_ROSTER_B_ROOT = path.join(FIXTURE_ROOT, "changed-roster-b");
const OUTSIDE_FILE = path.join(FIXTURE_ROOT, "outside", "outside.txt");
const ASSIGNMENT_PATH = "terms/27s1/assignments/lab04/assignment.yml";
const TERM_PATH = "terms/27s1/term.yml";
const COURSE_PATH = "course.yml";
const ROSTER_ONE_PATH = "terms/27s1/rosters/section-001.csv";
const ROSTER_TWO_PATH = "terms/27s1/rosters/section-002.csv";
const COURSE_COPY_PATH = "terms/27s1/course-copy.yml";
const DIGEST_LENGTH = 64;

const sourcePaths = [ROSTER_TWO_PATH, ASSIGNMENT_PATH, COURSE_PATH, TERM_PATH, ROSTER_ONE_PATH];

const expectSha256 = (value: string): void => {
  expect(value).toMatch(/^[a-f0-9]{64}$/u);
};

describe("source hashing and fingerprinting", () => {
  it("TC-HASH-001 source hash support produces separate source file hashes", () => {
    const result = createSourceFingerprint({
      repoRoot: VALID_ROOT,
      sourceFilePaths: sourcePaths
    });

    expect(result.errors).toEqual([]);
    expect(result.sourceFiles).toHaveLength(sourcePaths.length);
    result.sourceFiles.forEach((sourceFile) => {
      expectSha256(sourceFile.sha256);
    });
  });

  it("TC-HASH-002 source hash support can be used by future plan source hashes", () => {
    const result = hashFileSha256(path.join(VALID_ROOT, COURSE_PATH));

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.sha256).toHaveLength(DIGEST_LENGTH);
      expectSha256(result.sha256);
    }
  });

  it("TC-HASH-003 source fingerprint support produces combined input fingerprint", () => {
    const result = createSourceFingerprint({
      repoRoot: VALID_ROOT,
      sourceFilePaths: sourcePaths
    });

    expect(result.errors).toEqual([]);
    expectSha256(result.inputFingerprint);
  });

  it("TC-HASH-004 source fingerprint support can be used by future plan fingerprint", () => {
    const result = createSourceFingerprint({
      repoRoot: VALID_ROOT,
      sourceFilePaths: sourcePaths
    });

    expect(result.inputFingerprint).toHaveLength(DIGEST_LENGTH);
    expect(result.sourceFiles.map((sourceFile) => sourceFile.path)).toEqual([
      COURSE_PATH,
      ASSIGNMENT_PATH,
      ROSTER_ONE_PATH,
      ROSTER_TWO_PATH,
      TERM_PATH
    ]);
  });

  it("TC-HASH-005 changing one roster changes that roster hash and input fingerprint", () => {
    const firstResult = createSourceFingerprint({
      repoRoot: CHANGED_ROSTER_A_ROOT,
      sourceFilePaths: [COURSE_PATH, TERM_PATH, ASSIGNMENT_PATH, ROSTER_ONE_PATH]
    });
    const secondResult = createSourceFingerprint({
      repoRoot: CHANGED_ROSTER_B_ROOT,
      sourceFilePaths: [COURSE_PATH, TERM_PATH, ASSIGNMENT_PATH, ROSTER_ONE_PATH]
    });

    expect(firstResult.errors).toEqual([]);
    expect(secondResult.errors).toEqual([]);
    expect(firstResult.inputFingerprint).not.toBe(secondResult.inputFingerprint);
    expect(
      firstResult.sourceFiles.find((sourceFile) => sourceFile.path === ROSTER_ONE_PATH)?.sha256
    ).not.toBe(
      secondResult.sourceFiles.find((sourceFile) => sourceFile.path === ROSTER_ONE_PATH)?.sha256
    );
  });

  it("TC-HASH-006 fingerprint is deterministic for same ordered path/hash inputs", () => {
    const sourceFiles = [
      { path: "b.yml", sha256: "b".repeat(DIGEST_LENGTH) },
      { path: "a.yml", sha256: "a".repeat(DIGEST_LENGTH) }
    ] as const;

    expect(createInputFingerprint(sourceFiles)).toBe(createInputFingerprint(sourceFiles));
    expect(createInputFingerprint(sourceFiles)).toBe(
      createInputFingerprint([sourceFiles[1], sourceFiles[0]])
    );
  });

  it("source file paths are repository-relative and use forward slashes", () => {
    const result = createSourceFingerprint({
      repoRoot: VALID_ROOT,
      sourceFilePaths: [path.join(VALID_ROOT, ASSIGNMENT_PATH)]
    });

    expect(result.sourceFiles).toEqual([
      expect.objectContaining({
        path: ASSIGNMENT_PATH
      })
    ]);
    expect(result.sourceFiles[0]?.path).not.toContain(VALID_ROOT);
    expect(result.sourceFiles[0]?.path).not.toContain("\\");
  });

  it("source files are sorted lexicographically before fingerprinting", () => {
    const result = createSourceFingerprint({
      repoRoot: VALID_ROOT,
      sourceFilePaths: sourcePaths
    });

    expect(result.sourceFiles.map((sourceFile) => sourceFile.path)).toEqual([
      COURSE_PATH,
      ASSIGNMENT_PATH,
      ROSTER_ONE_PATH,
      ROSTER_TWO_PATH,
      TERM_PATH
    ]);
  });

  it("missing source file returns structured diagnostic", () => {
    const result = createSourceFingerprint({
      repoRoot: VALID_ROOT,
      sourceFilePaths: ["missing.yml"]
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: "source_file_missing" })]);
  });

  it("source path outside repo returns structured diagnostic", () => {
    const result = createSourceFingerprint({
      repoRoot: VALID_ROOT,
      sourceFilePaths: [OUTSIDE_FILE]
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: "source_file_outside_repo" })]);
  });

  it("directory source path returns structured diagnostic", () => {
    const result = createSourceFingerprint({
      repoRoot: VALID_ROOT,
      sourceFilePaths: [path.join(VALID_ROOT, "terms")]
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: "source_file_not_file" })]);
  });

  it("builds source paths from loaded config and roster files", () => {
    const result = getSourceFingerprintPaths({
      courseConfigPath: COURSE_PATH,
      termConfigPath: TERM_PATH,
      assignmentConfigPath: ASSIGNMENT_PATH,
      rosterFiles: [ROSTER_ONE_PATH, ROSTER_TWO_PATH]
    });

    expect(result).toEqual([
      COURSE_PATH,
      TERM_PATH,
      ASSIGNMENT_PATH,
      ROSTER_ONE_PATH,
      ROSTER_TWO_PATH
    ]);
  });

  it("hashes file content only", () => {
    const expectedHash = hashFileSha256(path.join(VALID_ROOT, COURSE_PATH));
    const copiedHash = hashFileSha256(path.join(VALID_ROOT, COURSE_COPY_PATH));

    expect(copiedHash).toEqual(expectedHash);
  });
});
