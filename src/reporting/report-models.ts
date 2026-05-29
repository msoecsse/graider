import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type {
  ArtifactStatus,
  GradingCheckResult,
  GradingResultStatus,
  ResultFileStatus,
  WorkflowStatus
} from "../grading/grading-result-models.js";
import type { RosterStatus } from "../roster/roster-models.js";

export const REPORT_SCHEMA_VERSION = 1;

export type RepositoryReportStatus = "available" | "missing" | "archived" | "not_tracked";

export interface ReportAssignmentIdentity {
  courseCode: string;
  termCode: string;
  assignmentSlug: string;
  assignmentTitle: string;
}

export interface ReportSourceSummary {
  inputFingerprint?: string;
}

export interface FacultyReportSummaryCounts {
  studentCount: number;
  activeStudentCount: number;
  droppedStudentCount: number;
  holdStudentCount: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  skippedCount: number;
  notConfiguredCount: number;
  missingArtifactCount: number;
  invalidResultFileCount: number;
  warningCount: number;
  errorCountTotal: number;
}

export interface StudentGradingSummary {
  workflowStatus: WorkflowStatus;
  resultStatus: GradingResultStatus;
  artifactStatus: ArtifactStatus;
  resultFileStatus: ResultFileStatus;
  score?: number | null;
  maxScore?: number | null;
  checks: GradingCheckResult[];
  workflowRunId?: number;
  commitSha?: string;
}

export interface StudentReportSummary {
  studentId: string;
  githubUsername: string;
  section: string;
  rosterStatus: RosterStatus;
  repositoryName?: string;
  repositoryUrl?: string;
  repositoryStatus: RepositoryReportStatus;
  grading: StudentGradingSummary;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

export interface FacultySummaryReport {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  generatedAt: string;
  assignment: ReportAssignmentIdentity;
  source: ReportSourceSummary;
  summary: FacultyReportSummaryCounts;
  students: StudentReportSummary[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}
