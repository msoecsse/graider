import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const UI_FIXTURES_ROOT = path.resolve("examples/ui");
const JSON_EXTENSION = ".json";
const CONTRACT_SCHEMA_VERSION = 1;
const EMPTY_COUNT = 0;
const EXPECTED_UI_FIXTURES = [
  "validate-success.json",
  "validate-errors.json",
  "apply-success.json",
  "apply-partial-success.json",
  "grade-dispatched.json",
  "grade-no-grading-not-configured.json",
  "report-summary-passed-failed.json",
  "report-missing-artifact.json",
  "report-no-grading.json",
  "publish-student-reports-success.json",
  "publish-faculty-provided-missing-source.json",
  "workflow-generate-success.json",
  "workflow-generate-no-grading-not-configured.json"
] as const;
const SECRET_MARKERS = [
  "GRAIDER_GITHUB_TOKEN",
  "Authorization:",
  "github_pat_",
  "ghp_",
  "RAW WORKFLOW LOG",
  "Private Faculty Summary",
  "Stack trace"
] as const;

interface UiFixture {
  readonly schemaVersion?: unknown;
  readonly commandName?: unknown;
  readonly status?: unknown;
  readonly exitCode?: unknown;
  readonly diagnostics?: unknown;
  readonly summary?: unknown;
}

const readJson = (filePath: string): UiFixture =>
  JSON.parse(fs.readFileSync(filePath, "utf8")) as UiFixture;

const findJsonFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    return entry.isDirectory()
      ? findJsonFiles(entryPath)
      : entry.isFile() && entry.name.endsWith(JSON_EXTENSION)
        ? [entryPath]
        : [];
  });

const expectNoSecretMarkers = (content: string): void => {
  for (const marker of SECRET_MARKERS) {
    expect(content).not.toContain(marker);
  }
};

describe("UI JSON fixtures", () => {
  it("includes representative command outputs for UI work", () => {
    for (const fixtureName of EXPECTED_UI_FIXTURES) {
      expect(fs.existsSync(path.join(UI_FIXTURES_ROOT, fixtureName)), fixtureName).toBe(true);
    }
  });

  it("parses and matches the basic CLI JSON contract", () => {
    const fixtureFiles = findJsonFiles(UI_FIXTURES_ROOT);

    expect(fixtureFiles.length).toBeGreaterThan(EMPTY_COUNT);

    for (const fixtureFile of fixtureFiles) {
      const content = fs.readFileSync(fixtureFile, "utf8");
      const fixture = readJson(fixtureFile);

      expect(fixture.schemaVersion, fixtureFile).toBe(CONTRACT_SCHEMA_VERSION);
      expect(typeof fixture.commandName, fixtureFile).toBe("string");
      expect(typeof fixture.status, fixtureFile).toBe("string");
      expect(typeof fixture.exitCode, fixtureFile).toBe("number");
      expect(Array.isArray(fixture.diagnostics), fixtureFile).toBe(true);
      expect(typeof fixture.summary, fixtureFile).toBe("object");
      expectNoSecretMarkers(content);
    }
  });

  it("uses safe fake data for student-facing fixture records", () => {
    const reportFixture = readJson(
      path.join(UI_FIXTURES_ROOT, "report-summary-passed-failed.json")
    ) as {
      summary?: {
        students?: Array<{
          studentId?: string;
          githubUsername?: string;
          resultStatus?: string;
        }>;
      };
    };

    expect(reportFixture.summary?.students).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: "student01",
          githubUsername: "student01",
          resultStatus: "passed"
        }),
        expect.objectContaining({
          studentId: "student02",
          githubUsername: "student02",
          resultStatus: "failed"
        })
      ])
    );
  });
});
