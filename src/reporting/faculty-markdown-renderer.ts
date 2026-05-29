import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { FacultySummaryReport, StudentReportSummary } from "./report-models.js";

const EMPTY_DISPLAY = "";
const NEWLINE = "\n";

const escapeCell = (value: string): string => value.replaceAll("|", "\\|");

const formatCount = (value: number): string => String(value);

const diagnosticCodes = (diagnostics: readonly Diagnostic[]): string =>
  diagnostics.map((diagnostic) => diagnostic.code).join("; ");

const renderRepository = (student: StudentReportSummary): string => {
  if (student.repositoryName === undefined) {
    return EMPTY_DISPLAY;
  }

  return student.repositoryUrl === undefined
    ? student.repositoryName
    : `[${student.repositoryName}](${student.repositoryUrl})`;
};

const renderStudentRow = (student: StudentReportSummary): string =>
  [
    student.section,
    student.studentId,
    student.githubUsername,
    student.rosterStatus,
    renderRepository(student),
    student.repositoryStatus,
    student.grading.workflowStatus,
    student.grading.resultStatus,
    diagnosticCodes(student.warnings),
    diagnosticCodes(student.errors)
  ]
    .map(escapeCell)
    .join(" | ");

export const renderFacultyMarkdownReport = (report: FacultySummaryReport): string =>
  [
    `# ${report.assignment.assignmentTitle} (${report.assignment.courseCode} ${report.assignment.termCode})`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Students | ${formatCount(report.summary.studentCount)} |`,
    `| Active | ${formatCount(report.summary.activeStudentCount)} |`,
    `| Dropped | ${formatCount(report.summary.droppedStudentCount)} |`,
    `| Hold | ${formatCount(report.summary.holdStudentCount)} |`,
    `| Passed | ${formatCount(report.summary.passedCount)} |`,
    `| Failed | ${formatCount(report.summary.failedCount)} |`,
    `| Not configured | ${formatCount(report.summary.notConfiguredCount)} |`,
    `| Warnings | ${formatCount(report.summary.warningCount)} |`,
    `| Errors | ${formatCount(report.summary.errorCountTotal)} |`,
    "",
    "## Students",
    "",
    "| Section | Student ID | GitHub | Roster | Repository | Repo Status | Workflow | Result | Warnings | Errors |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...report.students.map((student) => `| ${renderStudentRow(student)} |`),
    ""
  ].join(NEWLINE);
