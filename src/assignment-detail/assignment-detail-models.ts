import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { CommandStatus } from "../core/command-result.js";

export const ASSIGNMENT_DETAIL_SCHEMA_VERSION = 1;

export type AssignmentDetailCheckStatus =
  | "available"
  | "missing"
  | "inaccessible"
  | "branch_missing"
  | "token_required"
  | "not_checked"
  | "not_required"
  | "error";
export type AssignmentDetailApplyState =
  | "not_applied"
  | "applied"
  | "partially_applied"
  | "unknown";

export interface AssignmentDetailCourse {
  readonly slug: string;
  readonly title: string;
  readonly file: string;
}

export interface AssignmentDetailTerm {
  readonly slug: string;
  readonly title: string;
  readonly file: string;
}

export interface AssignmentDetailAssignment {
  readonly slug: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly file: string;
}

export interface AssignmentDetailMetadata {
  readonly facultyOwner: string | null;
  readonly lmsAssignmentId: string | null;
  readonly gradingCategory: string | null;
  readonly points: number | null;
}

export interface AssignmentDetailDeadline {
  readonly dueAt: string;
  readonly latePolicy: string;
}

export interface AssignmentDetailRoster {
  readonly sectionCount: number;
  readonly activeStudentCount: number;
  readonly totalStudentCount: number;
}

export interface AssignmentDetailTemplate {
  readonly repository: string;
  readonly branch: string;
  readonly status: AssignmentDetailCheckStatus;
  readonly repositoryStatus: AssignmentDetailCheckStatus;
  readonly branchStatus: AssignmentDetailCheckStatus;
}

export interface AssignmentDetailGrading {
  readonly enabled: boolean;
  readonly mode: string;
  readonly workflow: string | null;
  readonly artifact: string | null;
  readonly resultFile: string | null;
  readonly workflowStatus: AssignmentDetailCheckStatus;
  readonly workflowDispatch: AssignmentDetailCheckStatus;
}

export interface AssignmentDetailStudentReports {
  readonly enabled: boolean;
  readonly mode: string;
  readonly artifact: string | null;
  readonly sourceFile: string | null;
  readonly destinationFile: string | null;
  readonly graiderReportDestination: string | null;
  readonly facultyReportSource: string | null;
  readonly facultyReportDestination: string | null;
}

export interface AssignmentDetailApplyStateSummary {
  readonly status: AssignmentDetailApplyState;
}

export interface AssignmentDetailAction {
  readonly available: boolean;
  readonly implemented: boolean;
}

export interface AssignmentDetailActions {
  readonly validate: AssignmentDetailAction;
  readonly apply: AssignmentDetailAction;
  readonly grade: AssignmentDetailAction;
  readonly report: AssignmentDetailAction;
  readonly publishStudentReports: AssignmentDetailAction;
  readonly generateWorkflow: AssignmentDetailAction;
}

export interface AssignmentDetailResult {
  readonly schemaVersion: typeof ASSIGNMENT_DETAIL_SCHEMA_VERSION;
  readonly commandName: "assignment detail";
  readonly status: CommandStatus;
  readonly exitCode: 0 | 1 | 2;
  readonly diagnostics: Diagnostic[];
  readonly course: AssignmentDetailCourse | null;
  readonly term: AssignmentDetailTerm | null;
  readonly assignment: AssignmentDetailAssignment | null;
  readonly metadata: AssignmentDetailMetadata | null;
  readonly deadline: AssignmentDetailDeadline | null;
  readonly sections: string[];
  readonly roster: AssignmentDetailRoster | null;
  readonly template: AssignmentDetailTemplate | null;
  readonly grading: AssignmentDetailGrading | null;
  readonly studentReports: AssignmentDetailStudentReports | null;
  readonly applyState: AssignmentDetailApplyStateSummary | null;
  readonly actions: AssignmentDetailActions | null;
}
