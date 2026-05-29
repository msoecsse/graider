import { describe, expect, it } from "vitest";
import { renderFacultyCsvReport } from "../../src/reporting/faculty-csv-renderer.js";
import { renderFacultyJsonReport } from "../../src/reporting/faculty-json-renderer.js";
import { renderFacultyMarkdownReport } from "../../src/reporting/faculty-markdown-renderer.js";
import type { FacultySummaryReport } from "../../src/reporting/report-models.js";
import {
  createStudentReportPath,
  renderStudentMarkdownReport
} from "../../src/reporting/student-markdown-renderer.js";

const RAW_LOG_TEXT = "RAW WORKFLOW LOG SHOULD NOT APPEAR";

const report: FacultySummaryReport = {
  schemaVersion: 1,
  generatedAt: "2026-09-01T15:30:00.000Z",
  assignment: {
    courseCode: "se2030",
    termCode: "27s1",
    assignmentSlug: "lab04",
    assignmentTitle: "Lab 04"
  },
  source: {
    inputFingerprint: "fingerprint"
  },
  summary: {
    studentCount: 2,
    activeStudentCount: 1,
    droppedStudentCount: 1,
    holdStudentCount: 0,
    passedCount: 1,
    failedCount: 1,
    errorCount: 0,
    skippedCount: 0,
    notConfiguredCount: 0,
    missingArtifactCount: 0,
    invalidResultFileCount: 0,
    warningCount: 1,
    errorCountTotal: 1
  },
  students: [
    {
      studentId: "jones",
      githubUsername: "seanjones",
      section: "001",
      rosterStatus: "active",
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
      warnings: [{ code: "repo_warning", severity: "warning", message: "Repository warning." }],
      errors: []
    },
    {
      studentId: "smith",
      githubUsername: "janesmith",
      section: "001",
      rosterStatus: "dropped",
      repositoryName: "27s1-se2030-lab04-janesmith",
      repositoryUrl: "https://github.com/example-org/27s1-se2030-lab04-janesmith",
      repositoryStatus: "available",
      grading: {
        workflowStatus: "completed",
        resultStatus: "failed",
        artifactStatus: "found",
        resultFileStatus: "valid",
        checks: [
          { name: "Style", status: "failed", message: "Style check failed." },
          { name: "Runtime", status: "error", message: "Runtime error." },
          { name: "Extra credit", status: "skipped", details: ["Prerequisite failed."] }
        ]
      },
      warnings: [],
      errors: [{ code: "repo_error", severity: "error", message: "Repository error." }]
    }
  ],
  warnings: [],
  errors: []
};

const jones = report.students[0] as NonNullable<(typeof report.students)[number]>;
const smith = report.students[1] as NonNullable<(typeof report.students)[number]>;

describe("report renderers", () => {
  it("TC-REPORT-FACULTY-001 Markdown includes assignment header", () => {
    expect(renderFacultyMarkdownReport(report)).toContain("# Lab 04 (se2030 27s1)");
  });

  it("TC-REPORT-FACULTY-002 Markdown includes aggregate summary", () => {
    expect(renderFacultyMarkdownReport(report)).toContain("## Summary");
  });

  it("TC-REPORT-FACULTY-003 Markdown includes student table", () => {
    expect(renderFacultyMarkdownReport(report)).toContain("| Section | Student ID | GitHub |");
  });

  it("TC-REPORT-FACULTY-004 CSV has stable column order", () => {
    expect(renderFacultyCsvReport(report).split("\n")[0]).toBe(
      "section,student_id,github_username,roster_status,repository_name,repository_url,repository_status,workflow_status,result_status,artifact_status,result_file_status,score,max_score,warning_codes,error_codes"
    );
  });

  it("TC-REPORT-FACULTY-005 JSON includes schema version", () => {
    const json = JSON.parse(renderFacultyJsonReport(report)) as { schema_version: number };

    expect(json.schema_version).toBe(1);
  });

  it("TC-REPORT-FACULTY-006 Warning/error code lists render correctly", () => {
    const csv = renderFacultyCsvReport(report);

    expect(csv).toContain("repo_warning");
    expect(csv).toContain("repo_error");
  });

  it("TC-REPORT-FACULTY-007 Repo links render when URLs exist", () => {
    expect(renderFacultyMarkdownReport(report)).toContain(
      "[27s1-se2030-lab04-seanjones](https://github.com/example-org/27s1-se2030-lab04-seanjones)"
    );
  });

  it("TC-REPORT-FACULTY-008 Active student missing repo appears in report", () => {
    const missingRepoStudent = {
      studentId: jones.studentId,
      githubUsername: jones.githubUsername,
      section: jones.section,
      rosterStatus: jones.rosterStatus,
      repositoryStatus: "missing" as const,
      grading: jones.grading,
      warnings: jones.warnings,
      errors: jones.errors
    };
    const missingRepoReport = {
      ...report,
      students: [missingRepoStudent]
    };

    expect(renderFacultyMarkdownReport(missingRepoReport)).toContain("missing");
  });

  it("TC-REPORT-FACULTY-009 Hold and dropped students appear according to report rules", () => {
    expect(renderFacultyMarkdownReport(report)).toContain("dropped");
  });

  it("TC-REPORT-FACULTY-010 Faculty report contains no raw workflow logs", () => {
    expect(renderFacultyMarkdownReport(report)).not.toContain(RAW_LOG_TEXT);
    expect(renderFacultyJsonReport(report)).not.toContain(RAW_LOG_TEXT);
    expect(renderFacultyCsvReport(report)).not.toContain(RAW_LOG_TEXT);
  });

  it("TC-REPORT-STUDENT-001 Student report path includes section and student ID", () => {
    expect(createStudentReportPath(jones)).toBe("students/001/jones.md");
  });

  it("TC-REPORT-STUDENT-002 Student report contains no other student data", () => {
    const markdown = renderStudentMarkdownReport(report.assignment, jones);

    expect(markdown).toContain("seanjones");
    expect(markdown).not.toContain("janesmith");
  });

  it("TC-REPORT-STUDENT-003 not_configured wording is clear", () => {
    const markdown = renderStudentMarkdownReport(report.assignment, {
      ...jones,
      grading: {
        workflowStatus: "not_configured",
        resultStatus: "not_configured",
        artifactStatus: "not_checked",
        resultFileStatus: "not_checked",
        checks: []
      }
    });

    expect(markdown).toContain("Grading was not configured for this assignment.");
  });

  it("TC-REPORT-STUDENT-004 Passed checks render correctly", () => {
    expect(renderStudentMarkdownReport(report.assignment, jones)).toContain(
      "| Unit tests | passed |"
    );
  });

  it("TC-REPORT-STUDENT-005 Failed checks render correctly", () => {
    expect(renderStudentMarkdownReport(report.assignment, smith)).toContain("| Style | failed |");
  });

  it("TC-REPORT-STUDENT-006 Error/skipped checks render correctly", () => {
    const markdown = renderStudentMarkdownReport(report.assignment, smith);

    expect(markdown).toContain("| Runtime | error |");
    expect(markdown).toContain("| Extra credit | skipped |");
  });

  it("TC-REPORT-STUDENT-007 Details section renders", () => {
    expect(renderStudentMarkdownReport(report.assignment, jones)).toContain("10 tests passed");
  });

  it("TC-REPORT-STUDENT-008 Student report contains no raw workflow logs", () => {
    expect(renderStudentMarkdownReport(report.assignment, jones)).not.toContain(RAW_LOG_TEXT);
  });
});
