import {
  publishGradingStudentReport,
  type PublishGradingStudentReportRequest,
  type PublishGradingStudentReportResult
} from "./gradingStudentReportPublicationService.js";

export interface BulkPublishGradingStudentReportsServiceRequest extends Omit<
  PublishGradingStudentReportRequest,
  "studentId"
> {
  readonly studentIds: readonly string[];
}

export interface BulkGradingStudentReportPublicationResult {
  readonly studentId: string;
  readonly result: PublishGradingStudentReportResult;
}

export interface BulkPublishGradingStudentReportsResult {
  readonly status: "success";
  readonly results: readonly BulkGradingStudentReportPublicationResult[];
}

export interface GradingBulkReportPublicationDependencies {
  readonly publishOne: (
    request: PublishGradingStudentReportRequest
  ) => Promise<PublishGradingStudentReportResult>;
}

export const createGradingBulkReportPublicationService = (
  overrides: Partial<GradingBulkReportPublicationDependencies> = {}
): ((
  request: BulkPublishGradingStudentReportsServiceRequest
) => Promise<BulkPublishGradingStudentReportsResult>) => {
  const publishOne = overrides.publishOne ?? publishGradingStudentReport;
  return async ({ studentIds, ...assignmentIdentity }) => {
    const results: BulkGradingStudentReportPublicationResult[] = [];
    for (const studentId of studentIds) {
      let result: PublishGradingStudentReportResult;
      try {
        result = await publishOne({ ...assignmentIdentity, studentId });
      } catch {
        result = { status: "report_publish_failed" };
      }
      results.push({ studentId, result });
    }
    return { status: "success", results };
  };
};

export const bulkPublishGradingStudentReports = (
  request: BulkPublishGradingStudentReportsServiceRequest
): Promise<BulkPublishGradingStudentReportsResult> =>
  createGradingBulkReportPublicationService()(request);
