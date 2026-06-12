import type { AssignmentGradeResult, AssignmentGradePreviewResult } from "../../electron/ipc";
import type {
  AssignmentDetailDiagnostic,
  AssignmentDetailSelection,
  NormalizedAssignmentDetail
} from "../assignment-detail/assignmentDetailTypes";

export type GradePreviewLoadResult = AssignmentGradePreviewResult;

export type GradeExecutionLoadResult = AssignmentGradeResult;

export type GradePreviewRepositoryStatus =
  | "would_dispatch"
  | "would_skip"
  | "blocked"
  | "unknown"
  | "token_required";

export interface GradePreviewPageProps {
  readonly selection: AssignmentDetailSelection;
  readonly assignmentDetail: NormalizedAssignmentDetail | null;
  readonly onBack: () => void;
  readonly onRefreshAssignmentDetail?: () => void;
  readonly onBackToDashboard?: () => void;
}

export interface GradePreviewAssignment {
  readonly slug: string | null;
  readonly title: string | null;
  readonly file: string | null;
  readonly status: string | null;
}

export interface GradePreviewCourse {
  readonly slug: string | null;
  readonly title: string | null;
}

export interface GradePreviewTerm {
  readonly slug: string | null;
  readonly title: string | null;
}

export interface GradePreviewTarget {
  readonly sections: readonly string[];
  readonly sectionCount: number | null;
  readonly studentCount: number | null;
  readonly activeStudentCount: number | null;
}

export interface GradePreviewGrading {
  readonly enabled: boolean;
  readonly resolvedFrom: string | null;
  readonly mode: string | null;
  readonly workflow: string | null;
  readonly artifact: string | null;
  readonly resultFile: string | null;
  readonly workflowDispatch: string | null;
  readonly workflowRef: string | null;
}

export interface GradePreviewPlanSummary {
  readonly wouldDispatch: number;
  readonly wouldSkip: number;
  readonly blocked: number;
  readonly unknown: number;
}

export interface GradePreviewRepositoryRow {
  readonly studentId: string | null;
  readonly githubUsername: string | null;
  readonly section: string | null;
  readonly repository: string | null;
  readonly status: GradePreviewRepositoryStatus;
  readonly reason: string | null;
  readonly workflow: string | null;
  readonly ref: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}

export interface GradePreviewPlan {
  readonly summary: GradePreviewPlanSummary;
  readonly repositories: readonly GradePreviewRepositoryRow[];
}

export interface GradePreviewFiles {
  readonly assignmentFile: string | null;
  readonly manifestFile: string | null;
  readonly workflowFile: string | null;
}

export interface GradePreviewAction {
  readonly available: boolean;
  readonly implemented: boolean;
  readonly previewOnly: boolean;
  readonly reason: string | null;
}

export interface GradePreviewActions {
  readonly grade: GradePreviewAction;
}

export interface NormalizedGradePreview {
  readonly status: string;
  readonly refreshedAt: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
  readonly assignment: GradePreviewAssignment;
  readonly course: GradePreviewCourse;
  readonly term: GradePreviewTerm;
  readonly target: GradePreviewTarget;
  readonly grading: GradePreviewGrading;
  readonly plan: GradePreviewPlan;
  readonly files: GradePreviewFiles;
  readonly actions: GradePreviewActions;
}

export type GradeDispatchResultRepositoryStatus = "dispatched" | "skipped" | "failed" | "blocked";

export interface GradeDispatchResultSummary {
  readonly targetsSelected: number;
  readonly dispatchAttempted: number;
  readonly dispatchSucceeded: number;
  readonly skipped: number;
  readonly failedOrBlocked: number;
}

export interface GradeDispatchResultRepositoryRow {
  readonly studentId: string | null;
  readonly githubUsername: string | null;
  readonly section: string | null;
  readonly repository: string | null;
  readonly status: GradeDispatchResultRepositoryStatus;
  readonly reason: string | null;
  readonly workflow: string | null;
  readonly ref: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}

export interface NormalizedGradeDispatchResult {
  readonly status: string;
  readonly exitCode: number;
  readonly dispatchedAt: string | null;
  readonly assignmentFile: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
  readonly generatedFiles: readonly string[];
  readonly summary: GradeDispatchResultSummary;
  readonly rows: readonly GradeDispatchResultRepositoryRow[];
  readonly rawSummary: Readonly<Record<string, unknown>>;
}
