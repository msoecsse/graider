import type { CommandStatus } from "../core/command-result.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { AssignmentDetailCheckStatus } from "../assignment-detail/assignment-detail-models.js";
import type { GroupApplyPreviewTarget } from "../groups/group-preview-planner.js";

export const ASSIGNMENT_APPLY_PREVIEW_SCHEMA_VERSION = 1;

export type ApplyPreviewRepositoryStatus =
  | "would_create"
  | "would_update"
  | "would_skip"
  | "blocked"
  | "unknown";

export interface ApplyPreviewAssignment {
  readonly slug: string;
  readonly title: string;
  readonly file: string;
  readonly status: string;
}

export interface ApplyPreviewCourse {
  readonly slug: string;
  readonly title: string;
}

export interface ApplyPreviewTerm {
  readonly slug: string;
  readonly title: string;
}

export interface ApplyPreviewTarget {
  readonly sections: string[];
  readonly sectionCount: number;
  readonly studentCount: number;
}

export interface ApplyPreviewTemplate {
  readonly repository: string;
  readonly branch: string;
  readonly status: AssignmentDetailCheckStatus;
  readonly repositoryStatus: AssignmentDetailCheckStatus;
  readonly branchStatus: AssignmentDetailCheckStatus;
}

export interface ApplyPreviewGrading {
  readonly enabled: boolean;
  readonly mode: string;
  readonly workflow: string | null;
  readonly artifact: string | null;
  readonly resultFile: string | null;
  readonly workflowStatus: AssignmentDetailCheckStatus;
  readonly workflowDispatch: AssignmentDetailCheckStatus;
}

export interface ApplyPreviewRepositoryRow {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly section: string;
  readonly repository: string;
  readonly status: ApplyPreviewRepositoryStatus;
  readonly reason: string;
  readonly diagnostics: Diagnostic[];
}

export interface ApplyPreviewPlanSummary {
  readonly wouldCreateRepositories: number;
  readonly wouldUpdateRepositories: number;
  readonly wouldSkipRepositories: number;
  readonly blockedRepositories: number;
  readonly unknownRepositories: number;
}

export interface ApplyPreviewPlan {
  readonly summary: ApplyPreviewPlanSummary;
  readonly repositories: ApplyPreviewRepositoryRow[];
  readonly groupTargets?: GroupApplyPreviewTarget[];
}

export interface ApplyPreviewFiles {
  readonly assignmentFile: string;
  readonly workflowFile: string | null;
  readonly templateSource: string;
}

export interface ApplyPreviewAction {
  readonly available: boolean;
  readonly implemented: false;
  readonly previewOnly: true;
  readonly reason?: string;
}

export interface ApplyPreviewActions {
  readonly apply: ApplyPreviewAction;
}

export interface AssignmentApplyPreviewResult {
  readonly schemaVersion: typeof ASSIGNMENT_APPLY_PREVIEW_SCHEMA_VERSION;
  readonly commandName: "assignment apply-preview";
  readonly status: CommandStatus;
  readonly exitCode: 0 | 1 | 2;
  readonly diagnostics: Diagnostic[];
  readonly repositoryMode?: "individual" | "group";
  readonly applySupported?: boolean;
  readonly assignment: ApplyPreviewAssignment | null;
  readonly course: ApplyPreviewCourse | null;
  readonly term: ApplyPreviewTerm | null;
  readonly target: ApplyPreviewTarget | null;
  readonly template: ApplyPreviewTemplate | null;
  readonly grading: ApplyPreviewGrading | null;
  readonly plan: ApplyPreviewPlan | null;
  readonly files: ApplyPreviewFiles | null;
  readonly actions: ApplyPreviewActions | null;
}
