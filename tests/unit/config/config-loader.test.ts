import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/config");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const BAD_TERM_ASSIGNMENT_FILE = "terms/badterm/assignments/lab04/assignment.yml";
const TEMP_FIXTURE_PREFIX = "graider-config-modes-";
const COURSE_FILE = "course.yml";
const COURSE_GRADING_BLOCK = `grading:
  enabled: true
  workflow: grade.yml
  artifact: grading-results
  result_file: results.json
`;
const COURSE_REPORTS_BLOCK = `reports:
  formats:
    - markdown
`;

const loadFixture = (fixtureName: string, assignmentFile = ASSIGNMENT_FILE) =>
  loadGraiderConfig({
    cwd: path.join(FIXTURE_ROOT, fixtureName),
    assignmentFile
  });

const loadTempFixture = (cwd: string, assignmentFile = ASSIGNMENT_FILE) =>
  loadGraiderConfig({
    cwd,
    assignmentFile
  });

const copyValidFixtureToTemp = (): string => {
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_FIXTURE_PREFIX));
  fs.cpSync(path.join(FIXTURE_ROOT, "valid-course"), destinationRoot, { recursive: true });
  return destinationRoot;
};

const writeCourseConfig = (cwd: string, transform: (content: string) => string): void => {
  const coursePath = path.join(cwd, COURSE_FILE);
  fs.writeFileSync(coursePath, transform(fs.readFileSync(coursePath, "utf8")));
};

const replaceCourseGrading = (cwd: string, grading: string): void => {
  writeCourseConfig(cwd, (content) => content.replace(COURSE_GRADING_BLOCK, grading));
};

const replaceCourseReports = (cwd: string, reports: string): void => {
  writeCourseConfig(cwd, (content) => content.replace(COURSE_REPORTS_BLOCK, reports));
};

const appendAssignmentGrading = (cwd: string, grading: string): void => {
  const assignmentPath = path.join(cwd, ASSIGNMENT_FILE);
  fs.appendFileSync(assignmentPath, `\n${grading}`);
};

const expectFailureCode = (fixtureName: string, code: string, assignmentFile = ASSIGNMENT_FILE) => {
  const result = loadFixture(fixtureName, assignmentFile);

  expect(result.status).toBe("failure");
  expect(result.diagnostics).toEqual([
    expect.objectContaining({
      code
    })
  ]);
};

const expectTempSuccess = (cwd: string) => {
  const result = loadTempFixture(cwd);

  expect(result.status).toBe("success");
  if (result.status === "failure") {
    throw new Error(`Expected config to pass. Diagnostics: ${JSON.stringify(result.diagnostics)}`);
  }

  return result;
};

const expectTempFailureCode = (cwd: string, code: string) => {
  const result = loadTempFixture(cwd);

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

  it("accepts preset grading mode with supported preset", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseGrading(
      cwd,
      `grading:
  enabled: true
  mode: preset
  preset: java-junit-checkstyle
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`
    );

    expectTempSuccess(cwd);
  });

  it("accepts custom-workflow grading mode", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseGrading(
      cwd,
      `grading:
  enabled: true
  mode: custom-workflow
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`
    );

    expectTempSuccess(cwd);
  });

  it("accepts contract-only grading mode", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseGrading(
      cwd,
      `grading:
  enabled: true
  mode: contract-only
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`
    );

    expectTempSuccess(cwd);
  });

  it("accepts disabled grading without workflow, artifact, or result file", () => {
    const result = loadFixture("grading-disabled");

    expect(result.status).toBe("success");
  });

  it("accepts explicit no-grading mode for disabled grading", () => {
    const cwd = copyValidFixtureToTemp();
    appendAssignmentGrading(
      cwd,
      `grading:
  enabled: false
  mode: no-grading
`
    );

    expectTempSuccess(cwd);
  });

  it("keeps legacy enabled grading config without mode valid", () => {
    expectTempSuccess(copyValidFixtureToTemp());
  });

  it("rejects unsupported grading mode", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseGrading(
      cwd,
      `grading:
  enabled: true
  mode: made-up-mode
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`
    );

    expectTempFailureCode(cwd, "unsupported_grading_mode");
  });

  it("rejects preset mode without preset", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseGrading(
      cwd,
      `grading:
  enabled: true
  mode: preset
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`
    );

    expectTempFailureCode(cwd, "missing_grading_preset");
  });

  it("rejects unsupported grading preset", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseGrading(
      cwd,
      `grading:
  enabled: true
  mode: preset
  preset: python-pytest
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`
    );

    expectTempFailureCode(cwd, "unsupported_grading_preset");
  });

  it("rejects enabled grading without workflow", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseGrading(
      cwd,
      `grading:
  enabled: true
  mode: custom-workflow
  artifact: grading-results
  result_file: grading-results.json
`
    );

    expectTempFailureCode(cwd, "missing_grading_workflow");
  });

  it("rejects enabled grading without artifact", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseGrading(
      cwd,
      `grading:
  enabled: true
  mode: custom-workflow
  workflow: .github/workflows/grade.yml
  result_file: grading-results.json
`
    );

    expectTempFailureCode(cwd, "missing_grading_artifact");
  });

  it("rejects enabled grading without result_file", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseGrading(
      cwd,
      `grading:
  enabled: true
  mode: custom-workflow
  workflow: .github/workflows/grade.yml
  artifact: grading-results
`
    );

    expectTempFailureCode(cwd, "missing_grading_result_file");
  });

  it("accepts graider-generated student publish mode", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseReports(
      cwd,
      `reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: graider-generated
    destination_file: grading/report.md
`
    );

    expectTempSuccess(cwd);
  });

  it("accepts faculty-provided student publish mode", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseReports(
      cwd,
      `reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: faculty-provided
    artifact: grading-results
    source_file: student-report.md
    destination_file: grading/report.md
`
    );

    expectTempSuccess(cwd);
  });

  it("accepts both student publish mode", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseReports(
      cwd,
      `reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: both
    graider_report_destination: grading/graider-report.md
    faculty_report_source: graider-output/student-report.md
    faculty_report_destination: grading/report.md
    artifact: grading-results
`
    );

    expectTempSuccess(cwd);
  });

  it("accepts disabled student publish mode without publish paths", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseReports(
      cwd,
      `reports:
  formats:
    - markdown
  student_publish:
    enabled: false
    mode: disabled
`
    );

    expectTempSuccess(cwd);
  });

  it("keeps omitted student_publish valid", () => {
    expectTempSuccess(copyValidFixtureToTemp());
  });

  it("rejects unsupported student publish mode", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseReports(
      cwd,
      `reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: unknown
    destination_file: grading/report.md
`
    );

    expectTempFailureCode(cwd, "unsupported_student_publish_mode");
  });

  it("rejects graider-generated student publish mode without destination", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseReports(
      cwd,
      `reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: graider-generated
`
    );

    expectTempFailureCode(cwd, "missing_student_publish_destination");
  });

  it("rejects faculty-provided student publish mode without source file", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseReports(
      cwd,
      `reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: faculty-provided
    artifact: grading-results
    destination_file: grading/report.md
`
    );

    expectTempFailureCode(cwd, "missing_student_publish_source_file");
  });

  it("rejects faculty-provided student publish mode without destination", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseReports(
      cwd,
      `reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: faculty-provided
    artifact: grading-results
    source_file: student-report.md
`
    );

    expectTempFailureCode(cwd, "missing_student_publish_destination");
  });

  it("rejects faculty-provided student publish mode without artifact", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseReports(
      cwd,
      `reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: faculty-provided
    source_file: student-report.md
    destination_file: grading/report.md
`
    );

    expectTempFailureCode(cwd, "missing_student_publish_artifact");
  });

  it("rejects both student publish mode without Graider report destination", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseReports(
      cwd,
      `reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: both
    faculty_report_source: graider-output/student-report.md
    faculty_report_destination: grading/report.md
    artifact: grading-results
`
    );

    expectTempFailureCode(cwd, "missing_graider_report_destination");
  });

  it("rejects both student publish mode without faculty report source", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseReports(
      cwd,
      `reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: both
    graider_report_destination: grading/graider-report.md
    faculty_report_destination: grading/report.md
    artifact: grading-results
`
    );

    expectTempFailureCode(cwd, "missing_faculty_report_source");
  });

  it("rejects both student publish mode without faculty report destination", () => {
    const cwd = copyValidFixtureToTemp();
    replaceCourseReports(
      cwd,
      `reports:
  formats:
    - markdown
  student_publish:
    enabled: true
    mode: both
    graider_report_destination: grading/graider-report.md
    faculty_report_source: graider-output/student-report.md
    artifact: grading-results
`
    );

    expectTempFailureCode(cwd, "missing_faculty_report_destination");
  });
});
