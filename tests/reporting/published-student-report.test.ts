import { describe, expect, it } from "vitest";
import { renderStudentResultsJson } from "../../src/reporting/student-results-json-renderer.js";
import { renderStudentMarkdownReport } from "../../src/reporting/student-markdown-renderer.js";
import type {
  ReportAssignmentIdentity,
  StudentReportSummary
} from "../../src/reporting/report-models.js";

const GENERATED_AT = "2026-09-01T15:30:00.000Z";
const TARGET_STUDENT_ID = "jones";
const OTHER_STUDENT_ID = "smith";
const RAW_LOG_TEXT = "RAW WORKFLOW LOG SHOULD NOT APPEAR";

const assignment: ReportAssignmentIdentity = {
  courseCode: "se2030",
  termCode: "27s1",
  assignmentSlug: "lab04",
  assignmentTitle: "Lab 04"
};

const targetStudent: StudentReportSummary = {
  studentId: TARGET_STUDENT_ID,
  githubUsername: "seanjones",
  section: "001",
  rosterStatus: "active",
  repositoryOwner: "example-org",
  repositoryName: "27s1-se2030-lab04-seanjones",
  repositoryUrl: "https://github.com/example-org/27s1-se2030-lab04-seanjones",
  repositoryStatus: "available",
  grading: {
    workflowStatus: "completed",
    resultStatus: "passed",
    artifactStatus: "found",
    resultFileStatus: "valid",
    score: 10,
    maxScore: 10,
    checks: [
      {
        name: "Unit tests",
        status: "passed",
        message: "All tests passed.",
        pointsEarned: 10,
        pointsPossible: 10,
        details: ["10 tests passed"]
      }
    ]
  },
  warnings: [],
  errors: []
};

describe("published student reports", () => {
  it("TC-REPORT-PUBLISH-001 published grading/report.md contains target student only", () => {
    const markdown = renderStudentMarkdownReport(assignment, targetStudent);

    expect(markdown).toContain(TARGET_STUDENT_ID);
    expect(markdown).not.toContain(OTHER_STUDENT_ID);
  });

  it("TC-REPORT-PUBLISH-002 published grading/results.json contains target student only", () => {
    const rendered = renderStudentResultsJson(assignment, targetStudent, GENERATED_AT);

    expect(rendered).toContain(TARGET_STUDENT_ID);
    expect(rendered).not.toContain(OTHER_STUDENT_ID);
  });

  it("TC-REPORT-PUBLISH-003 published JSON is normalized Graider data, not raw artifact copy", () => {
    const parsed = JSON.parse(
      renderStudentResultsJson(assignment, targetStudent, GENERATED_AT)
    ) as {
      assignment?: unknown;
      grading?: unknown;
      student?: unknown;
      checks?: unknown;
      status?: unknown;
    };

    expect(parsed.assignment).toBeDefined();
    expect(parsed.student).toBeDefined();
    expect(parsed.grading).toBeDefined();
    expect(parsed.checks).toBeUndefined();
    expect(parsed.status).toBeUndefined();
  });

  it("TC-REPORT-PUBLISH-004 published files do not include faculty summary", () => {
    const markdown = renderStudentMarkdownReport(assignment, targetStudent);
    const renderedJson = renderStudentResultsJson(assignment, targetStudent, GENERATED_AT);

    expect(markdown).not.toContain("faculty-summary");
    expect(markdown).not.toContain("Aggregate Summary");
    expect(renderedJson).not.toContain("faculty-summary");
    expect(renderedJson).not.toContain("student_count");
    expect(renderedJson).not.toContain('"students"');
  });

  it("does not include raw workflow logs in published Markdown or JSON", () => {
    const markdown = renderStudentMarkdownReport(assignment, targetStudent);
    const renderedJson = renderStudentResultsJson(assignment, targetStudent, GENERATED_AT);

    expect(markdown).not.toContain(RAW_LOG_TEXT);
    expect(renderedJson).not.toContain(RAW_LOG_TEXT);
  });

  it("published JSON has a generated schema version", () => {
    const parsed = JSON.parse(
      renderStudentResultsJson(assignment, targetStudent, GENERATED_AT)
    ) as {
      schema_version?: unknown;
    };

    expect(parsed.schema_version).toBe(1);
  });
});
