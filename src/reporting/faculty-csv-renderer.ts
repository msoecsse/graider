import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { FacultySummaryReport, StudentReportSummary } from "./report-models.js";

const CSV_HEADERS = [
  "section",
  "student_id",
  "github_username",
  "roster_status",
  "repository_name",
  "repository_url",
  "repository_status",
  "workflow_status",
  "result_status",
  "artifact_status",
  "result_file_status",
  "score",
  "max_score",
  "warning_codes",
  "error_codes"
] as const;

const EMPTY_FIELD = "";
const COMMA = ",";
const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const NEWLINE = "\n";
const CSV_NEEDS_QUOTES_PATTERN = /[",\n\r]/;

const renderDiagnosticCodes = (diagnostics: readonly Diagnostic[]): string =>
  diagnostics.map((diagnostic) => diagnostic.code).join(";");

type CsvValue = string | number | null | undefined;

const renderValue = (value: CsvValue): string => {
  const rawValue = value === undefined || value === null ? EMPTY_FIELD : String(value);
  const escaped = rawValue.replaceAll(QUOTE, ESCAPED_QUOTE);

  return CSV_NEEDS_QUOTES_PATTERN.test(escaped) ? `${QUOTE}${escaped}${QUOTE}` : escaped;
};

const createRow = (student: StudentReportSummary): CsvValue[] => [
  student.section,
  student.studentId,
  student.githubUsername,
  student.rosterStatus,
  student.repositoryName ?? EMPTY_FIELD,
  student.repositoryUrl ?? EMPTY_FIELD,
  student.repositoryStatus,
  student.grading.workflowStatus,
  student.grading.resultStatus,
  student.grading.artifactStatus,
  student.grading.resultFileStatus,
  student.grading.score ?? EMPTY_FIELD,
  student.grading.maxScore ?? EMPTY_FIELD,
  renderDiagnosticCodes(student.warnings),
  renderDiagnosticCodes(student.errors)
];

export const renderFacultyCsvReport = (report: FacultySummaryReport): string =>
  [
    CSV_HEADERS.join(COMMA),
    ...report.students.map((student) => createRow(student).map(renderValue).join(COMMA))
  ].join(NEWLINE) + NEWLINE;
