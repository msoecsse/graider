import { stringifyStableJson } from "../io/stable-json.js";
import type { ReportAssignmentIdentity, StudentReportSummary } from "./report-models.js";

export const PUBLISHED_STUDENT_RESULTS_SCHEMA_VERSION = 1;

const mapChecks = (student: StudentReportSummary) =>
  student.grading.checks.map((check) => ({
    name: check.name,
    status: check.status,
    ...(check.message === undefined ? {} : { message: check.message }),
    ...(check.pointsEarned === undefined ? {} : { points_earned: check.pointsEarned }),
    ...(check.pointsPossible === undefined ? {} : { points_possible: check.pointsPossible }),
    ...(check.details === undefined ? {} : { details: check.details })
  }));

const toStudentResultsJsonValue = (
  assignment: ReportAssignmentIdentity,
  student: StudentReportSummary,
  generatedAt: string
) => ({
  schema_version: PUBLISHED_STUDENT_RESULTS_SCHEMA_VERSION,
  generated_at: generatedAt,
  assignment: {
    course_code: assignment.courseCode,
    term_code: assignment.termCode,
    assignment_slug: assignment.assignmentSlug,
    assignment_title: assignment.assignmentTitle
  },
  student: {
    student_id: student.studentId,
    github_username: student.githubUsername,
    section: student.section,
    roster_status: student.rosterStatus
  },
  repository: {
    ...(student.repositoryName === undefined ? {} : { name: student.repositoryName }),
    ...(student.repositoryUrl === undefined ? {} : { url: student.repositoryUrl }),
    status: student.repositoryStatus
  },
  grading: {
    workflow_status: student.grading.workflowStatus,
    result_status: student.grading.resultStatus,
    artifact_status: student.grading.artifactStatus,
    result_file_status: student.grading.resultFileStatus,
    ...(student.grading.score === undefined ? {} : { score: student.grading.score }),
    ...(student.grading.maxScore === undefined ? {} : { max_score: student.grading.maxScore }),
    checks: mapChecks(student)
  },
  warnings: student.warnings,
  errors: student.errors
});

export const renderStudentResultsJson = (
  assignment: ReportAssignmentIdentity,
  student: StudentReportSummary,
  generatedAt: string
): string =>
  `${stringifyStableJson(toStudentResultsJsonValue(assignment, student, generatedAt))}\n`;
