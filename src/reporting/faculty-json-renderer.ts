import { stringifyStableJson } from "../io/stable-json.js";
import type { FacultySummaryReport, StudentReportSummary } from "./report-models.js";

const mapStudent = (student: StudentReportSummary) => ({
  student_id: student.studentId,
  github_username: student.githubUsername,
  section: student.section,
  roster_status: student.rosterStatus,
  ...(student.repositoryName === undefined ? {} : { repository_name: student.repositoryName }),
  ...(student.repositoryUrl === undefined ? {} : { repository_url: student.repositoryUrl }),
  repository_status: student.repositoryStatus,
  grading: {
    workflow_status: student.grading.workflowStatus,
    result_status: student.grading.resultStatus,
    artifact_status: student.grading.artifactStatus,
    result_file_status: student.grading.resultFileStatus,
    ...(student.grading.score === undefined ? {} : { score: student.grading.score }),
    ...(student.grading.maxScore === undefined ? {} : { max_score: student.grading.maxScore }),
    ...(student.grading.workflowRunId === undefined
      ? {}
      : { workflow_run_id: student.grading.workflowRunId }),
    ...(student.grading.commitSha === undefined ? {} : { commit_sha: student.grading.commitSha }),
    ...(student.grading.artifactFileKeys === undefined
      ? {}
      : { artifact_file_keys: student.grading.artifactFileKeys }),
    ...(student.grading.configuredResultFile === undefined
      ? {}
      : { configured_result_file: student.grading.configuredResultFile }),
    ...(student.grading.normalizedResultFile === undefined
      ? {}
      : { normalized_result_file: student.grading.normalizedResultFile }),
    checks: student.grading.checks.map((check) => ({
      name: check.name,
      status: check.status,
      ...(check.message === undefined ? {} : { message: check.message }),
      ...(check.pointsEarned === undefined ? {} : { points_earned: check.pointsEarned }),
      ...(check.pointsPossible === undefined ? {} : { points_possible: check.pointsPossible }),
      ...(check.details === undefined ? {} : { details: check.details })
    }))
  },
  warnings: student.warnings,
  errors: student.errors
});

export const toFacultyJsonValue = (report: FacultySummaryReport) => ({
  schema_version: report.schemaVersion,
  generated_at: report.generatedAt,
  assignment: {
    course_code: report.assignment.courseCode,
    term_code: report.assignment.termCode,
    assignment_slug: report.assignment.assignmentSlug,
    assignment_title: report.assignment.assignmentTitle
  },
  source: {
    ...(report.source.inputFingerprint === undefined
      ? {}
      : { input_fingerprint: report.source.inputFingerprint })
  },
  summary: {
    student_count: report.summary.studentCount,
    active_student_count: report.summary.activeStudentCount,
    dropped_student_count: report.summary.droppedStudentCount,
    hold_student_count: report.summary.holdStudentCount,
    passed_count: report.summary.passedCount,
    failed_count: report.summary.failedCount,
    error_count: report.summary.errorCount,
    skipped_count: report.summary.skippedCount,
    not_configured_count: report.summary.notConfiguredCount,
    missing_artifact_count: report.summary.missingArtifactCount,
    invalid_result_file_count: report.summary.invalidResultFileCount,
    warning_count: report.summary.warningCount,
    error_count_total: report.summary.errorCountTotal
  },
  students: report.students.map(mapStudent),
  warnings: report.warnings,
  errors: report.errors
});

export const renderFacultyJsonReport = (report: FacultySummaryReport): string =>
  `${stringifyStableJson(toFacultyJsonValue(report))}\n`;
