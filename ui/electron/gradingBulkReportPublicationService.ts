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

export interface GradingReportPublicationOutcome {
  readonly status: PublishGradingStudentReportResult["status"];
  readonly warnings: readonly string[];
  readonly remoteWrite?: "unchanged" | "created_or_updated";
}

export interface GradingBulkReportPublicationProgress {
  readonly total: number;
  readonly completed: number;
  readonly currentStudentId?: string;
  readonly lastCompleted?: {
    readonly studentId: string;
    readonly result: GradingReportPublicationOutcome;
  };
}

export interface GradingBulkReportPublicationDependencies {
  readonly onProgress?: (progress: GradingBulkReportPublicationProgress) => void;
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
    const total = studentIds.length;
    const onProgress = overrides.onProgress;
    onProgress?.({ total, completed: 0 });
    for (const studentId of studentIds) {
      onProgress?.({ total, completed: results.length, currentStudentId: studentId });
      let result: PublishGradingStudentReportResult;
      try {
        result = await publishOne({ ...assignmentIdentity, studentId });
      } catch {
        result = { status: "report_publish_failed" };
      }
      results.push({ studentId, result });
      onProgress?.({
        total,
        completed: results.length,
        lastCompleted: {
          studentId,
          result: {
            status: result.status,
            warnings: result.status === "success" ? result.warnings : [],
            ...(result.status === "success" ? { remoteWrite: result.remoteWrite } : {})
          }
        }
      });
    }
    return { status: "success", results };
  };
};

export const bulkPublishGradingStudentReports = (
  request: BulkPublishGradingStudentReportsServiceRequest
): Promise<BulkPublishGradingStudentReportsResult> =>
  createGradingBulkReportPublicationService()(request);
