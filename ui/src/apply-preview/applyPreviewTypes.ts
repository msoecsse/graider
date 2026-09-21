import type { AssignmentApplyResult, AssignmentApplyPreviewResult } from "../../electron/ipc";
import type {
  AssignmentDetailDiagnostic,
  AssignmentDetailSelection,
  NormalizedAssignmentDetail
} from "../assignment-detail/assignmentDetailTypes";

export type ApplyPreviewLoadResult = AssignmentApplyPreviewResult;

export type ApplyExecutionLoadResult = AssignmentApplyResult;

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
  readonly onRefreshAssignmentDetail?: () => void;
  readonly onBackToDashboard?: () => void;
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
  readonly groupTargets: readonly ApplyPreviewGroupTarget[];
}

export interface ApplyPreviewGroupTarget {
  readonly targetId: string | null;
  readonly groupId: string | null;
  readonly repositoryName: string | null;
  readonly sectionIds: readonly string[];
  readonly studentIds: readonly string[];
  readonly githubUsernames: readonly string[];
  readonly plannedStudentPermission: string | null;
  readonly facultyTeam: string | null;
  readonly facultyTeamPermission: string | null;
  readonly graderTeam: string | null;
  readonly graderTeamPermission: string | null;
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
  readonly repositoryMode: "individual" | "group";
  readonly applySupported: boolean;
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

export type ApplyResultRepositoryStatus = "created" | "updated" | "skipped" | "failed" | "blocked";

export interface ApplyResultSummary {
  readonly createdRepositories: number;
  readonly updatedRepositories: number;
  readonly skippedRepositories: number;
  readonly failedRepositories: number;
  readonly blockedRepositories: number;
}

export interface ApplyResultRepositoryRow {
  readonly studentId: string | null;
  readonly githubUsername: string | null;
  readonly section: string | null;
  readonly repository: string | null;
  readonly status: ApplyResultRepositoryStatus;
  readonly reason: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}

export interface ApplyResultGroupTarget {
  readonly groupId: string | null;
  readonly repositoryName: string | null;
  readonly htmlUrl: string | null;
  readonly cloneUrl: string | null;
  readonly studentIds: readonly string[];
  readonly githubUsernames: readonly string[];
  readonly status: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}

export interface NormalizedApplyResult {
  readonly status: string;
  readonly exitCode: number;
  readonly appliedAt: string | null;
  readonly assignmentFile: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
  readonly generatedFiles: readonly string[];
  readonly summary: ApplyResultSummary;
  readonly rows: readonly ApplyResultRepositoryRow[];
  readonly manifestFile: string | null;
  readonly repositoryMode: "individual" | "group";
  readonly targetCount: number | null;
  readonly studentMappingCount: number | null;
  readonly groupTargets: readonly ApplyResultGroupTarget[];
  readonly rawSummary: Readonly<Record<string, unknown>>;
}

/**
 * One merged individual-repository row: preview and (once apply has run)
 * result, joined by student identity. README section 5.4 -- "one plan
 * table," not a preview table and a separate result table. `resultStatus`
 * is null until apply runs for this row; the presentation layer prefers it
 * over `previewStatus` once it is set, which is what makes the table's
 * Status column "update in place" instead of a second table appearing.
 */
export interface ApplyRowState {
  readonly studentId: string | null;
  readonly githubUsername: string | null;
  readonly section: string | null;
  readonly repository: string | null;
  readonly previewStatus: ApplyPreviewRepositoryStatus;
  readonly previewReason: string | null;
  readonly resultStatus: ApplyResultRepositoryStatus | null;
  readonly resultReason: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}

/**
 * One merged group-repository row, the group-mode equivalent of
 * `ApplyRowState`. `previewStatus` is synthesized (see
 * applyPreviewMerge.ts) since preview group targets carry no per-target
 * status of their own -- group apply is all-or-nothing at preview time.
 * `resultStatus` is the raw backend value (`created` / `updated` / `failed`
 * / `blocked` / `pending`, from src/groups/group-target-executor.ts and
 * src/cli/commands/apply.command.ts) since it is not the same enum as
 * `ApplyResultRepositoryStatus`.
 */
export interface ApplyGroupRowState {
  readonly groupId: string | null;
  readonly repositoryName: string | null;
  readonly sectionIds: readonly string[];
  readonly studentIds: readonly string[];
  readonly githubUsernames: readonly string[];
  readonly plannedStudentPermission: string | null;
  readonly facultyTeam: string | null;
  readonly facultyTeamPermission: string | null;
  readonly graderTeam: string | null;
  readonly graderTeamPermission: string | null;
  readonly previewStatus: ApplyPreviewRepositoryStatus;
  readonly resultStatus: string | null;
  readonly htmlUrl: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}
