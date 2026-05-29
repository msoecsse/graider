import {
  createConfigDiagnostic,
  createWarningDiagnostic,
  DiagnosticCode
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError } from "../github/github-errors.js";
import type { ReportAssignmentIdentity, StudentReportSummary } from "./report-models.js";
import { renderStudentMarkdownReport } from "./student-markdown-renderer.js";
import { renderStudentResultsJson } from "./student-results-json-renderer.js";

export const PUBLISHED_STUDENT_REPORT_PATH = "grading/report.md";
export const PUBLISHED_STUDENT_RESULTS_PATH = "grading/results.json";
export const PUBLISHED_STUDENT_REPORT_COMMIT_MESSAGE = "Update Graider student report";

const PUBLISHED_FILE_COUNT_PER_STUDENT = 2;
const FIRST_PUBLISHED_FILE_COUNT = 1;

export interface StudentReportPublishInput {
  githubClient: GitHubClient;
  assignment: ReportAssignmentIdentity;
  student: StudentReportSummary;
  generatedAt: string;
}

export interface StudentReportPublishResult {
  studentId: string;
  githubUsername: string;
  publishedFiles: string[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
  skipped: boolean;
}

const createPublishedFileReference = (owner: string, repo: string, filePath: string): string =>
  `${owner}/${repo}:${filePath}`;

const createRepositoryMissingWarning = (student: StudentReportSummary): Diagnostic =>
  createWarningDiagnostic(
    DiagnosticCode.StudentReportRepositoryMissing,
    "Student report was not published because the student repository is unavailable.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      repositoryName: student.repositoryName,
      repositoryStatus: student.repositoryStatus
    }
  );

const createWriteDiagnostic = (
  student: StudentReportSummary,
  filePath: string,
  error: unknown
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.StudentReportWriteFailed,
    "Student report publish failed.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      repositoryName: student.repositoryName,
      path: filePath,
      operation: "writeRepositoryFile",
      ...(error instanceof GitHubClientError
        ? {
            underlyingDiagnosticCode: error.diagnosticCode,
            kind: error.kind
          }
        : {})
    }
  );

export const publishStudentReport = async ({
  githubClient,
  assignment,
  student,
  generatedAt
}: StudentReportPublishInput): Promise<StudentReportPublishResult> => {
  if (
    student.repositoryOwner === undefined ||
    student.repositoryName === undefined ||
    student.repositoryStatus !== "available"
  ) {
    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles: [],
      warnings: [createRepositoryMissingWarning(student)],
      errors: [],
      skipped: true
    };
  }

  const publishedFiles: string[] = [];

  try {
    await githubClient.writeRepositoryFile({
      owner: student.repositoryOwner,
      repo: student.repositoryName,
      path: PUBLISHED_STUDENT_REPORT_PATH,
      content: renderStudentMarkdownReport(assignment, student),
      message: PUBLISHED_STUDENT_REPORT_COMMIT_MESSAGE
    });
    publishedFiles.push(
      createPublishedFileReference(
        student.repositoryOwner,
        student.repositoryName,
        PUBLISHED_STUDENT_REPORT_PATH
      )
    );

    await githubClient.writeRepositoryFile({
      owner: student.repositoryOwner,
      repo: student.repositoryName,
      path: PUBLISHED_STUDENT_RESULTS_PATH,
      content: renderStudentResultsJson(assignment, student, generatedAt),
      message: PUBLISHED_STUDENT_REPORT_COMMIT_MESSAGE
    });
    publishedFiles.push(
      createPublishedFileReference(
        student.repositoryOwner,
        student.repositoryName,
        PUBLISHED_STUDENT_RESULTS_PATH
      )
    );

    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles,
      warnings: [],
      errors: [],
      skipped: false
    };
  } catch (error: unknown) {
    const attemptedPath =
      publishedFiles.length === PUBLISHED_FILE_COUNT_PER_STUDENT - FIRST_PUBLISHED_FILE_COUNT
        ? PUBLISHED_STUDENT_RESULTS_PATH
        : PUBLISHED_STUDENT_REPORT_PATH;

    return {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      publishedFiles,
      warnings: [],
      errors: [createWriteDiagnostic(student, attemptedPath, error)],
      skipped: false
    };
  }
};
