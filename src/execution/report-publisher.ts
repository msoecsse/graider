import type { RawCourseConfig } from "../config/config-models.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import type { FacultySummaryReport } from "../reporting/report-models.js";
import { publishStudentReport } from "../reporting/student-report-publisher.js";

const EMPTY_COUNT = 0;

export interface ReportPublishInput {
  report: FacultySummaryReport;
  githubClient: GitHubClient;
  studentPublishConfig?: RawCourseConfig["reports"]["student_publish"];
}

export interface ReportPublishResult {
  publishedFiles: string[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
  studentsReported: number;
  studentsPublished: number;
  publishFailed: number;
  publishSkipped: number;
}

export const publishStudentReports = async ({
  report,
  githubClient,
  studentPublishConfig
}: ReportPublishInput): Promise<ReportPublishResult> => {
  const publishedFiles: string[] = [];
  const warnings: Diagnostic[] = [];
  const errors: Diagnostic[] = [];
  let studentsPublished = EMPTY_COUNT;
  let publishFailed = EMPTY_COUNT;
  let publishSkipped = EMPTY_COUNT;

  for (const student of report.students) {
    const result = await publishStudentReport({
      githubClient,
      assignment: report.assignment,
      student,
      generatedAt: report.generatedAt,
      studentPublishConfig
    });

    publishedFiles.push(...result.publishedFiles);
    warnings.push(...result.warnings);
    errors.push(...result.errors);

    if (result.skipped) {
      publishSkipped += 1;
    } else if (result.errors.length > EMPTY_COUNT) {
      publishFailed += 1;
    } else {
      studentsPublished += 1;
    }
  }

  return {
    publishedFiles,
    warnings,
    errors,
    studentsReported: report.students.length,
    studentsPublished,
    publishFailed,
    publishSkipped
  };
};
