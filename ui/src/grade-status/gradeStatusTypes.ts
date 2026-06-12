import type { AssignmentGradeStatusResult } from "../../electron/ipc";
import type {
  AssignmentDetailDiagnostic,
  AssignmentDetailSelection,
  NormalizedAssignmentDetail
} from "../assignment-detail/assignmentDetailTypes";

export type GradeStatusLoadResult = AssignmentGradeStatusResult;

export type GradeStatusRepositoryStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "missing"
  | "unknown"
  | "blocked"
  | "token_required";

export interface GradeStatusPageProps {
  readonly selection: AssignmentDetailSelection;
  readonly assignmentDetail: NormalizedAssignmentDetail | null;
  readonly onBack: () => void;
}

export interface GradeStatusAssignment {
  readonly slug: string | null;
  readonly title: string | null;
  readonly file: string | null;
  readonly status: string | null;
}

export interface GradeStatusCourse {
  readonly slug: string | null;
  readonly title: string | null;
}

export interface GradeStatusTerm {
  readonly slug: string | null;
  readonly title: string | null;
}

export interface GradeStatusTarget {
  readonly sections: readonly string[];
  readonly sectionCount: number | null;
  readonly studentCount: number | null;
  readonly activeStudentCount: number | null;
}

export interface GradeStatusGrading {
  readonly enabled: boolean;
  readonly resolvedFrom: string | null;
  readonly mode: string | null;
  readonly workflow: string | null;
  readonly artifact: string | null;
  readonly resultFile: string | null;
  readonly workflowRef: string | null;
}

export interface GradeStatusSummary {
  readonly totalRepositories: number;
  readonly queued: number;
  readonly inProgress: number;
  readonly completed: number;
  readonly successful: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly timedOut: number;
  readonly missing: number;
  readonly unknown: number;
  readonly blocked: number;
  readonly needsAttention: number;
  readonly readyForReport: boolean;
}

export interface GradeStatusRepositoryRow {
  readonly studentId: string | null;
  readonly githubUsername: string | null;
  readonly section: string | null;
  readonly repository: string | null;
  readonly workflow: string | null;
  readonly ref: string | null;
  readonly runId: number | null;
  readonly runUrl: string | null;
  readonly status: GradeStatusRepositoryStatus;
  readonly conclusion: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly selectionStrategy: string | null;
  readonly reason: string | null;
  readonly needsAttention: boolean;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}

export interface NormalizedGradeStatus {
  readonly status: string;
  readonly exitCode: number;
  readonly refreshedAt: string | null;
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
  readonly assignment: GradeStatusAssignment;
  readonly course: GradeStatusCourse;
  readonly term: GradeStatusTerm;
  readonly target: GradeStatusTarget;
  readonly grading: GradeStatusGrading;
  readonly summary: GradeStatusSummary;
  readonly repositories: readonly GradeStatusRepositoryRow[];
}
