import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/config");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const BAD_TERM_ASSIGNMENT_FILE = "terms/badterm/assignments/lab04/assignment.yml";

const loadFixture = (fixtureName: string, assignmentFile = ASSIGNMENT_FILE) =>
  loadGraiderConfig({
    cwd: path.join(FIXTURE_ROOT, fixtureName),
    assignmentFile
  });

const expectFailureCode = (fixtureName: string, code: string, assignmentFile = ASSIGNMENT_FILE) => {
  const result = loadFixture(fixtureName, assignmentFile);

  expect(result.status).toBe("failure");
  expect(result.diagnostics).toEqual([
    expect.objectContaining({
      code
    })
  ]);
};

describe("config loading and validation", () => {
  it("TC-CONFIG-001 valid course config passes", () => {
    const result = loadFixture("valid-course");

    expect(result.status).toBe("success");
    if (result.status === "failure") {
      throw new Error("Expected valid config to pass.");
    }

    expect(result.diagnostics).toEqual([]);
    expect(result.config.summary).toMatchObject({
      courseConfigPath: "course.yml",
      termConfigPath: "terms/27s1/term.yml",
      assignmentConfigPath: ASSIGNMENT_FILE,
      termCode: "27s1",
      assignmentSlug: "lab04",
      gradingEnabled: true
    });
  });

  it("TC-CONFIG-002 missing course.yml fails with missing_required_file", () => {
    expectFailureCode("missing-course-yml", "missing_required_file");
  });

  it("TC-CONFIG-003 malformed YAML fails with invalid_yaml", () => {
    expectFailureCode("malformed-yaml", "invalid_yaml");
  });

  it("TC-CONFIG-004 unsupported schema version fails with invalid_schema_version", () => {
    expectFailureCode("invalid-schema-version", "invalid_schema_version");
  });

  it("TC-CONFIG-005 invalid term code fails with invalid_term_code", () => {
    expectFailureCode("invalid-term-code", "invalid_term_code", BAD_TERM_ASSIGNMENT_FILE);
  });

  it("TC-CONFIG-006 assignment slug/folder mismatch fails", () => {
    expectFailureCode("assignment-slug-mismatch", "assignment_slug_mismatch");
  });

  it("TC-CONFIG-007 omitted grading block inherits course grading", () => {
    const result = loadFixture("valid-course");

    expect(result.status).toBe("success");
    if (result.status === "failure") {
      throw new Error("Expected omitted assignment grading to pass.");
    }

    expect(result.config.summary.gradingEnabled).toBe(true);
    expect(result.config.summary.gradingSource).toBe("course");
  });

  it("TC-CONFIG-008 grading.enabled false disables grading", () => {
    const result = loadFixture("grading-disabled");

    expect(result.status).toBe("success");
    if (result.status === "failure") {
      throw new Error("Expected disabled assignment grading to pass.");
    }

    expect(result.config.summary.gradingEnabled).toBe(false);
    expect(result.config.summary.gradingSource).toBe("assignment");
  });

  it("TC-CONFIG-009 partial grading override fails", () => {
    expectFailureCode("partial-grading-override", "invalid_grading_config");
  });

  it("TC-CONFIG-010 missing required term.yml field fails", () => {
    expectFailureCode("missing-term-field", "missing_required_field");
  });

  it("TC-CONFIG-011 missing required assignment.yml field fails", () => {
    expectFailureCode("missing-assignment-field", "missing_required_field");
  });
});
