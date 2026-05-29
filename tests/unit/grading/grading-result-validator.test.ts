import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DiagnosticCode } from "../../../src/diagnostics/error-catalog.js";
import {
  parseGradingResultsJsonText,
  validateGradingResultsJson
} from "../../../src/grading/grading-result-validator.js";
import {
  isArtifactStatus,
  isGradingResultStatus,
  isResultFileStatus,
  isWorkflowStatus
} from "../../../src/grading/grading-status-mapper.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/grading");
const RESULT_FILE = "grading-results.json";

const readFixture = (fixtureName: string): string =>
  fs.readFileSync(path.join(FIXTURE_ROOT, fixtureName, RESULT_FILE), "utf8");

describe("grading result validation", () => {
  it("TC-GRADING-001 valid passed result validates", () => {
    const result = parseGradingResultsJsonText(readFixture("valid-passed"));

    expect(result.errors).toEqual([]);
    expect(result.result).toMatchObject({
      schemaVersion: 1,
      studentId: "jones",
      githubUsername: "seanjones",
      assignmentSlug: "lab04",
      status: "passed",
      score: 10,
      maxScore: 10,
      checks: [expect.objectContaining({ name: "Unit tests", status: "passed" })]
    });
  });

  it("TC-GRADING-002 valid failed result validates", () => {
    const result = parseGradingResultsJsonText(readFixture("valid-failed"));

    expect(result.errors).toEqual([]);
    expect(result.result?.status).toBe("failed");
  });

  it("TC-GRADING-003 valid result with empty checks validates", () => {
    const result = parseGradingResultsJsonText(readFixture("valid-empty-checks"));

    expect(result.errors).toEqual([]);
    expect(result.result?.checks).toEqual([]);
  });

  it("invalid grading result schema version fails", () => {
    const result = parseGradingResultsJsonText(readFixture("invalid-schema-version"));

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.InvalidGradingResultSchemaVersion })
    ]);
  });

  it("invalid top-level grading result status fails", () => {
    const result = parseGradingResultsJsonText(readFixture("invalid-status"));

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.InvalidGradingResultStatus })
    ]);
  });

  it("invalid check status fails", () => {
    const result = parseGradingResultsJsonText(readFixture("invalid-check-status"));

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.InvalidGradingCheckStatus })
    ]);
  });

  it("missing check name fails", () => {
    const result = parseGradingResultsJsonText(readFixture("missing-check-name"));

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.MissingGradingCheckName })
    ]);
  });

  it("invalid JSON text returns structured diagnostic", () => {
    const result = parseGradingResultsJsonText(readFixture("malformed-json"));

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.InvalidGradingResult })
    ]);
  });

  it("invalid score fails with structured diagnostic", () => {
    const result = validateGradingResultsJson({
      schema_version: 1,
      status: "passed",
      score: "ten",
      checks: []
    });

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.InvalidGradingScore })
    ]);
  });

  it("TC-CONFIG-014 invalid report status value fails validation", () => {
    expect(isWorkflowStatus("almost_done")).toBe(false);
    expect(isGradingResultStatus("almost_passed")).toBe(false);
    expect(isArtifactStatus("present")).toBe(false);
    expect(isResultFileStatus("parseable")).toBe(false);
  });

  it("recognizes all closed report status vocabularies", () => {
    expect(
      [
        "completed",
        "not_run",
        "missing_workflow",
        "workflow_failed_no_results",
        "not_configured",
        "unknown"
      ].every(isWorkflowStatus)
    ).toBe(true);
    expect(
      [
        "passed",
        "failed",
        "error",
        "skipped",
        "missing_artifact",
        "missing_result_file",
        "invalid_result_file",
        "not_run",
        "missing_workflow",
        "workflow_failed_no_results",
        "not_configured",
        "unknown"
      ].every(isGradingResultStatus)
    ).toBe(true);
    expect(["found", "missing", "not_checked"].every(isArtifactStatus)).toBe(true);
    expect(["valid", "missing", "invalid", "not_checked"].every(isResultFileStatus)).toBe(true);
  });
});
