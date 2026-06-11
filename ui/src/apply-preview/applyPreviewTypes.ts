import type { AssignmentApplyPreviewResult } from "../../electron/ipc";
import type {
  AssignmentDetailDiagnostic,
  AssignmentDetailSelection,
  NormalizedAssignmentDetail
} from "../assignment-detail/assignmentDetailTypes";

export type ApplyPreviewLoadResult = AssignmentApplyPreviewResult;

export type ApplyPreviewRepositoryStatus =
  | "would_create"
  | "would_update"
  | "would_skip"
  | "blocked"
  | "unknown"
  | "token_required";

export interface ApplyPreviewPageProps {
  readonly selection: AssignmentDetailSelection;
  readonly assignmentDetail: NormalizedAssignmentDetail | null;
  readonly onBack: () => void;
}

export interface ApplyPreviewAssignment {
  readonly slug: string | null;
  readonly title: string | null;
  readonly file: string | null;
  readonly status: string | null;
}

export interface ApplyPreviewCourse {
  readonly slug: string | null;
  readonly title: string | null;
}

export interface ApplyPreviewTerm {
  readonly slug: string | null;
  readonly title: string | null;
}

export interface ApplyPreviewTarget {
  readonly sections: readonly string[];
  readonly sectionCount: number | null;
  readonly studentCount: number | null;
}

export interface ApplyPreviewTemplate {
  readonly repository: string | null;
  readonly branch: string | null;
  readonly status: string | null;
  readonly repositoryStatus: string | null;
  readonly branchStatus: string | null;
}

export interface ApplyPreviewGrading {
  readonly enabled: boolean;
  readonly mode: string | null;
  readonly workflow: string | null;
  readonly artifact: string | null;
  readonly resultFile: string | null;
  readonly workflowStatus: string | null;
  readonly workflowDispatch: string | null;
}

export interface ApplyPreviewPlanSummary {
  readonly wouldCreateRepositories: number;
  readonly wouldUpdateRepositories: number;
  readonly wouldSkipRepositories: number;
  readonly blockedRepositories: number;
  readonly unknownRepositories: number;
}

export interface ApplyPreviewRepositoryRow {
  readonly studentId: string | null;
  readonly githubUsername: string | null;
  readonly section: string | null;
  readonly repository: string | null;
  readonly status: ApplyPreviewRepositoryStatus;
  readonly reason: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}

export interface ApplyPreviewPlan {
  readonly summary: ApplyPreviewPlanSummary;
  readonly repositories: readonly ApplyPreviewRepositoryRow[];
}

export interface ApplyPreviewFiles {
  readonly assignmentFile: string | null;
  readonly workflowFile: string | null;
  readonly templateSource: string | null;
}

export interface ApplyPreviewAction {
  readonly available: boolean;
  readonly implemented: boolean;
  readonly previewOnly: boolean;
  readonly reason: string | null;
}

export interface ApplyPreviewActions {
  readonly apply: ApplyPreviewAction;
}

export interface NormalizedApplyPreview {
  readonly status: string;
  readonly refreshedAt: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
  readonly assignment: ApplyPreviewAssignment;
  readonly course: ApplyPreviewCourse;
  readonly term: ApplyPreviewTerm;
  readonly target: ApplyPreviewTarget;
  readonly template: ApplyPreviewTemplate;
  readonly grading: ApplyPreviewGrading;
  readonly plan: ApplyPreviewPlan;
  readonly files: ApplyPreviewFiles;
  readonly actions: ApplyPreviewActions;
}

export type ApplyPreviewReadinessStatus = "ready" | "needs_attention" | "partial" | "unknown";

export interface ApplyPreviewReadinessSummary {
  readonly status: ApplyPreviewReadinessStatus;
  readonly label: string;
  readonly description: string;
  readonly items: readonly string[];
}
