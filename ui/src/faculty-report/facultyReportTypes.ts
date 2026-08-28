import type { FacultyReportResult } from "../../electron/ipc";
import type {
  AssignmentDetailDiagnostic,
  AssignmentDetailSelection,
  NormalizedAssignmentDetail
} from "../assignment-detail/assignmentDetailTypes";
import type { NormalizedGradeStatus } from "../grade-status/gradeStatusTypes";

export type FacultyReportLoadResult = FacultyReportResult;

export interface FacultyReportPageProps {
  readonly selection: AssignmentDetailSelection;
  readonly assignmentDetail: NormalizedAssignmentDetail | null;
  readonly gradeStatus: NormalizedGradeStatus | null;
  readonly onBackToGradeStatus: () => void;
  readonly onBackToAssignmentDetail: () => void;
}

export interface FacultyReportAssignment {
  readonly courseCode: string | null;
  readonly termCode: string | null;
  readonly assignmentSlug: string | null;
  readonly assignmentTitle: string | null;
  readonly assignmentFile: string | null;
}

export interface FacultyReportSummary {
  readonly studentCount: number | null;
  readonly activeStudentCount: number | null;
  readonly passedCount: number | null;
  readonly failedCount: number | null;
  readonly errorCount: number | null;
  readonly skippedCount: number | null;
  readonly notConfiguredCount: number | null;
  readonly missingArtifactCount: number | null;
  readonly invalidResultFileCount: number | null;
  readonly warningCount: number | null;
  readonly errorCountTotal: number | null;
  readonly reportFileCount: number | null;
  readonly studentsReported: number | null;
}

export interface FacultyReportStudentRow {
  readonly studentId: string | null;
  readonly githubUsername: string | null;
  readonly section: string | null;
  readonly repository: string | null;
  readonly repositoryStatus: string | null;
  readonly workflowStatus: string | null;
  readonly artifactStatus: string | null;
  readonly resultFileStatus: string | null;
  readonly resultStatus: string | null;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly checkCount: number;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}

export interface NormalizedFacultyReport {
  readonly status: string;
  readonly exitCode: number;
  readonly refreshedAt: string | null;
  readonly generatedFiles: readonly string[];
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
  readonly assignment: FacultyReportAssignment;
  readonly summary: FacultyReportSummary;
  readonly students: readonly FacultyReportStudentRow[];
  readonly hasMissingData: boolean;
}
