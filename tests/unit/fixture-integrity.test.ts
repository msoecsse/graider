import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FIXTURE_ROOT = path.resolve("tests/fixtures");
const JSON_EXTENSION = ".json";
const EMPTY_CHECK_COUNT = 0;

const findJsonFixtures = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return findJsonFixtures(entryPath);
    }

    return entry.isFile() && entry.name.endsWith(JSON_EXTENSION) ? [entryPath] : [];
  });

describe("fixture JSON integrity", () => {
  it("parses every .json fixture with JSON.parse", () => {
    const jsonFixtures = findJsonFixtures(FIXTURE_ROOT);

    expect(jsonFixtures.length).toBeGreaterThan(EMPTY_CHECK_COUNT);

    for (const fixturePath of jsonFixtures) {
      const content = fs.readFileSync(fixturePath, "utf8");

      expect(() => {
        JSON.parse(content);
      }, fixturePath).not.toThrow();
    }
  });

  it("keeps the empty-checks grading fixture as a valid empty array", () => {
    const fixturePath = path.join(
      FIXTURE_ROOT,
      "grading",
      "valid-empty-checks",
      "grading-results.json"
    );
    const parsed = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as { checks?: unknown };

    expect(parsed.checks).toEqual([]);
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.checks).toHaveLength(EMPTY_CHECK_COUNT);
  });
});
