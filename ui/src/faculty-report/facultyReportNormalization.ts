import type { FacultyReportJsonResponse } from "../../electron/ipc";
import { normalizeAssignmentDetailDiagnostics } from "../assignment-detail/assignmentDetailNormalization";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";
import type {
  FacultyReportStudentRow,
  FacultyReportSummary,
  NormalizedFacultyReport
} from "./facultyReportTypes";

const EMPTY_SUMMARY_VALUE = 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];

  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const getNumber = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const getRecord = (record: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = record[key];

  return isRecord(value) ? value : {};
};

const getArray = (record: Record<string, unknown>, key: string): readonly unknown[] => {
  const value = record[key];

  return Array.isArray(value) ? value : [];
};

const getNumberAlias = (
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string
): number | null => getNumber(record, camelKey) ?? getNumber(record, snakeKey);

const getStringAlias = (
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string
): string | null => getString(record, camelKey) ?? getString(record, snakeKey);

const getReportRecord = (report: FacultyReportJsonResponse): Record<string, unknown> =>
  isRecord(report.report) ? report.report : {};

const getReportSummaryRecord = (report: FacultyReportJsonResponse): Record<string, unknown> => {
  const reportRecord = getReportRecord(report);
  const reportSummary = getRecord(reportRecord, "summary");

  return Object.keys(reportSummary).length > EMPTY_SUMMARY_VALUE ? reportSummary : report.summary;
};

const normalizeSummary = (summary: Record<string, unknown>): FacultyReportSummary => ({
  studentCount: getNumberAlias(summary, "studentCount", "student_count"),
  activeStudentCount: getNumberAlias(summary, "activeStudentCount", "active_student_count"),
  passedCount: getNumberAlias(summary, "passedCount", "passed_count"),
  failedCount: getNumberAlias(summary, "failedCount", "failed_count"),
  errorCount: getNumberAlias(summary, "errorCount", "error_count"),
  skippedCount: getNumberAlias(summary, "skippedCount", "skipped_count"),
  notConfiguredCount: getNumberAlias(summary, "notConfiguredCount", "not_configured_count"),
  missingArtifactCount: getNumberAlias(summary, "missingArtifactCount", "missing_artifact_count"),
  invalidResultFileCount: getNumberAlias(
    summary,
    "invalidResultFileCount",
    "invalid_result_file_count"
  ),
  warningCount: getNumberAlias(summary, "warningCount", "warning_count"),
  errorCountTotal: getNumberAlias(summary, "errorCountTotal", "error_count_total"),
  reportFileCount: getNumber(summary, "reportFileCount"),
  studentsReported: getNumber(summary, "studentsReported")
});

const normalizeStudent = (value: unknown): FacultyReportStudentRow => {
  const row = isRecord(value) ? value : {};
  const grading = getRecord(row, "grading");
  const diagnostics = [
    ...normalizeAssignmentDetailDiagnostics(getArray(row, "warnings")),
    ...normalizeAssignmentDetailDiagnostics(getArray(row, "errors"))
  ];

  return {
    studentId: getStringAlias(row, "studentId", "student_id"),
    githubUsername: getStringAlias(row, "githubUsername", "github_username"),
    section: getString(row, "section"),
    repository: getStringAlias(row, "repository", "repository_name"),
    repositoryStatus: getStringAlias(row, "repositoryStatus", "repository_status"),
    workflowStatus: getStringAlias(grading, "workflowStatus", "workflow_status"),
    artifactStatus: getStringAlias(grading, "artifactStatus", "artifact_status"),
    resultFileStatus: getStringAlias(grading, "resultFileStatus", "result_file_status"),
    resultStatus: getStringAlias(grading, "resultStatus", "result_status"),
    score: getNumber(grading, "score"),
    maxScore: getNumberAlias(grading, "maxScore", "max_score"),
    checkCount: getArray(grading, "checks").length,
    diagnostics
  };
};

const getStudents = (report: FacultyReportJsonResponse): readonly FacultyReportStudentRow[] => {
  const reportRecord = getReportRecord(report);
  const reportStudents = getArray(reportRecord, "students");
  const topLevelStudents = Array.isArray(report.students) ? report.students : [];
  const students = reportStudents.length > EMPTY_SUMMARY_VALUE ? reportStudents : topLevelStudents;

  return students.map((student) => normalizeStudent(student));
};

const hasMissingData = (
  summary: FacultyReportSummary,
  students: readonly FacultyReportStudentRow[],
  diagnosticsCount: number
): boolean =>
  diagnosticsCount > EMPTY_SUMMARY_VALUE ||
  (summary.missingArtifactCount ?? EMPTY_SUMMARY_VALUE) > EMPTY_SUMMARY_VALUE ||
  (summary.invalidResultFileCount ?? EMPTY_SUMMARY_VALUE) > EMPTY_SUMMARY_VALUE ||
  (summary.errorCountTotal ?? EMPTY_SUMMARY_VALUE) > EMPTY_SUMMARY_VALUE ||
  students.some(
    (student) =>
      student.repositoryStatus === "missing" ||
      student.repositoryStatus === "not_tracked" ||
      student.artifactStatus === "missing" ||
      student.resultFileStatus === "missing" ||
      student.resultStatus === "missing_result_file" ||
      student.resultStatus === "invalid_result_file"
  );

export const normalizeFacultyReport = (
  report: FacultyReportJsonResponse,
  selection: AssignmentDetailSelection,
  refreshedAt: string | null
): NormalizedFacultyReport => {
  const reportRecord = getReportRecord(report);
  const reportAssignment = getRecord(reportRecord, "assignment");
  const summaryRecord = getReportSummaryRecord(report);
  const summary = normalizeSummary(summaryRecord);
  const students = getStudents(report);
  const diagnostics = normalizeAssignmentDetailDiagnostics(report.diagnostics);

  return {
    status: report.status,
    exitCode: report.exitCode,
    refreshedAt,
    generatedFiles: report.generatedFiles.filter(
      (generatedFile): generatedFile is string => typeof generatedFile === "string"
    ),
    diagnostics,
    assignment: {
      courseCode:
        getStringAlias(reportAssignment, "courseCode", "course_code") ??
        getString(summaryRecord, "courseCode") ??
        selection.courseSlug,
      termCode:
        getStringAlias(reportAssignment, "termCode", "term_code") ??
        getString(summaryRecord, "termCode") ??
        selection.termSlug,
      assignmentSlug:
        getStringAlias(reportAssignment, "assignmentSlug", "assignment_slug") ??
        getString(summaryRecord, "assignmentSlug") ??
        selection.assignmentSlug,
      assignmentTitle:
        getStringAlias(reportAssignment, "assignmentTitle", "assignment_title") ??
        selection.assignmentTitle,
      assignmentFile: report.assignmentFile ?? selection.assignmentFile
    },
    summary,
    students,
    hasMissingData: hasMissingData(summary, students, diagnostics.length)
  };
};
