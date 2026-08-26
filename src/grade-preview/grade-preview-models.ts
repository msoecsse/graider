import type { CommandStatus } from "../core/command-result.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

export const ASSIGNMENT_GRADE_PREVIEW_SCHEMA_VERSION = 1;

export type GradePreviewResolvedFrom = "course_default" | "assignment_override";

export type GradePreviewWorkflowDispatchStatus =
  | "available"
  | "missing"
  | "not_checked"
  | "not_required";

export type GradePreviewRepositoryStatus =
  | "would_dispatch"
  | "would_skip"
  | "blocked"
  | "unknown"
  | "token_required";

export interface GradePreviewAssignment {
  readonly slug: string;
  readonly title: string;
  readonly file: string;
  readonly status: string;
}

export interface GradePreviewCourse {
  readonly slug: string;
  readonly title: string;
}

export interface GradePreviewTerm {
  readonly slug: string;
  readonly title: string;
}

export interface GradePreviewTarget {
  readonly sections: string[];
  readonly sectionCount: number;
  readonly studentCount: number;
  readonly activeStudentCount: number;
}

export interface GradePreviewGrading {
  readonly enabled: boolean;
  readonly resolvedFrom: GradePreviewResolvedFrom;
  readonly mode: string;
  readonly workflow: string | null;
  readonly artifact: string | null;
  readonly resultFile: string | null;
  readonly workflowDispatch: GradePreviewWorkflowDispatchStatus;
  readonly workflowRef: string | null;
}

export interface GradePreviewRepositoryRow {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly section: string;
  readonly targetId?: string;
  readonly groupId?: string;
  readonly studentIds?: readonly string[];
  readonly githubUsernames?: readonly string[];
  readonly repository: string | null;
  readonly status: GradePreviewRepositoryStatus;
  readonly reason: string;
  readonly workflow: string | null;
  readonly ref: string | null;
  readonly diagnostics: Diagnostic[];
}

export interface GradePreviewPlanSummary {
  readonly wouldDispatch: number;
  readonly wouldSkip: number;
  readonly blocked: number;
  readonly unknown: number;
}

export interface GradePreviewPlan {
  readonly summary: GradePreviewPlanSummary;
  readonly repositories: GradePreviewRepositoryRow[];
}

export interface GradePreviewFiles {
  readonly assignmentFile: string;
  readonly manifestFile: string;
  readonly workflowFile: string | null;
}

export interface GradePreviewAction {
  readonly available: boolean;
  readonly implemented: false;
  readonly previewOnly: true;
  readonly reason?: string;
}

export interface GradePreviewActions {
  readonly grade: GradePreviewAction;
}

export interface AssignmentGradePreviewResult {
  readonly schemaVersion: typeof ASSIGNMENT_GRADE_PREVIEW_SCHEMA_VERSION;
  readonly commandName: "assignment grade-preview";
  readonly status: CommandStatus;
  readonly exitCode: 0 | 1 | 2;
  readonly diagnostics: Diagnostic[];
  readonly repositoryMode?: "individual" | "group";
  readonly assignment: GradePreviewAssignment | null;
  readonly course: GradePreviewCourse | null;
  readonly term: GradePreviewTerm | null;
  readonly target: GradePreviewTarget | null;
  readonly grading: GradePreviewGrading | null;
  readonly plan: GradePreviewPlan | null;
  readonly files: GradePreviewFiles | null;
  readonly actions: GradePreviewActions | null;
}
