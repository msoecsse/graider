import type { AssignmentDetailResult } from "../../electron/ipc";

export interface AssignmentDetailSelection {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly assignmentFile: string;
  readonly assignmentTitle: string | null;
  readonly assignmentSlug: string | null;
  readonly assignmentStatus: string | null;
  readonly courseTitle: string | null;
  readonly courseSlug: string | null;
  readonly termTitle: string | null;
  readonly termSlug: string | null;
}

export interface AssignmentDetailDiagnostic {
  readonly code: string | null;
  readonly severity: string | null;
  readonly message: string;
  readonly context: Readonly<Record<string, string>>;
}

export interface AssignmentDetailDiagnosticGroup {
  readonly key: "needs_attention" | "warnings" | "info";
  readonly label: string;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}

export interface AssignmentNeedsAttentionItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
}

export type AssignmentReadinessStatus =
  | "ready"
  | "needs_attention"
  | "partial"
  | "not_required"
  | "unknown";

export interface AssignmentReadinessSummary {
  readonly status: AssignmentReadinessStatus;
  readonly label: string;
  readonly description: string;
}

export interface AssignmentDetailCourse {
  readonly slug: string | null;
  readonly title: string | null;
  readonly file: string | null;
}

export interface AssignmentDetailTerm {
  readonly slug: string | null;
  readonly title: string | null;
  readonly file: string | null;
}

export interface AssignmentDetailAssignment {
  readonly slug: string | null;
  readonly title: string | null;
  readonly type: string | null;
  readonly status: string | null;
  readonly file: string | null;
}

export interface AssignmentDetailMetadata {
  readonly facultyOwner: string | null;
  readonly lmsAssignmentId: string | null;
  readonly gradingCategory: string | null;
  readonly points: number | null;
}

export interface AssignmentDetailDeadline {
  readonly dueAt: string | null;
  readonly latePolicy: string | null;
}

export interface AssignmentDetailRoster {
  readonly sectionCount: number | null;
  readonly activeStudentCount: number | null;
  readonly totalStudentCount: number | null;
}

export interface AssignmentDetailTemplate {
  readonly repository: string | null;
  readonly branch: string | null;
  readonly status: string | null;
  readonly repositoryStatus: string | null;
  readonly branchStatus: string | null;
}

export interface AssignmentDetailGrading {
  readonly enabled: boolean;
  readonly mode: string | null;
  readonly workflow: string | null;
  readonly artifact: string | null;
  readonly resultFile: string | null;
  readonly workflowStatus: string | null;
  readonly workflowDispatch: string | null;
}

export interface AssignmentDetailStudentReports {
  readonly enabled: boolean;
  readonly mode: string | null;
}

export interface AssignmentDetailApplyState {
  readonly status: string | null;
}

export interface AssignmentDetailAction {
  readonly available: boolean;
  readonly implemented: boolean;
  readonly reason: string | null;
}

export interface AssignmentDetailActions {
  readonly validate: AssignmentDetailAction;
  readonly apply: AssignmentDetailAction;
  readonly grade: AssignmentDetailAction;
  readonly report: AssignmentDetailAction;
  readonly publishStudentReports: AssignmentDetailAction;
  readonly generateWorkflow: AssignmentDetailAction;
}

export interface NormalizedAssignmentDetail {
  readonly status: string;
  readonly refreshedAt: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
  readonly course: AssignmentDetailCourse;
  readonly term: AssignmentDetailTerm;
  readonly assignment: AssignmentDetailAssignment;
  readonly metadata: AssignmentDetailMetadata;
  readonly deadline: AssignmentDetailDeadline;
  readonly sections: readonly string[];
  readonly roster: AssignmentDetailRoster | null;
  readonly template: AssignmentDetailTemplate;
  readonly grading: AssignmentDetailGrading;
  readonly studentReports: AssignmentDetailStudentReports;
  readonly applyState: AssignmentDetailApplyState;
  readonly actions: AssignmentDetailActions;
}

export interface AssignmentDetailPageProps {
  readonly selection: AssignmentDetailSelection;
  readonly initialLoadResult?: AssignmentDetailLoadResult | null;
  readonly onBack: () => void;
  readonly onEditAssignment?: () => void;
  readonly onDeleted?: () => void;
  readonly onPreviewApply: (
    selection: AssignmentDetailSelection,
    detail: NormalizedAssignmentDetail | null,
    loadResult: AssignmentDetailLoadResult | null
  ) => void;
  readonly onPreviewGrade: (
    selection: AssignmentDetailSelection,
    detail: NormalizedAssignmentDetail | null,
    loadResult: AssignmentDetailLoadResult | null
  ) => void;
  readonly onViewFacultyReport: (
    selection: AssignmentDetailSelection,
    detail: NormalizedAssignmentDetail | null,
    loadResult: AssignmentDetailLoadResult | null
  ) => void;
  readonly onViewGradeStatus: (
    selection: AssignmentDetailSelection,
    detail: NormalizedAssignmentDetail | null,
    loadResult: AssignmentDetailLoadResult | null
  ) => void;
  readonly onDetailLoaded?: (loadResult: AssignmentDetailLoadResult | null) => void;
}

export type AssignmentDetailLoadResult = AssignmentDetailResult;
