import type { CommandStatus } from "../core/command-result.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

export const ASSIGNMENT_GRADE_STATUS_SCHEMA_VERSION = 1;

export type GradeStatusResolvedFrom = "course_default" | "assignment_override" | "none";

export type GradeStatusRepositoryStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "missing"
  | "unknown"
  | "blocked"
  | "token_required";

export type GradeStatusRepositoryConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "timed_out"
  | "skipped"
  | "neutral"
  | "action_required"
  | "unknown";

export interface GradeStatusAssignment {
  readonly slug: string;
  readonly title: string;
  readonly file: string;
  readonly status: string;
}

export interface GradeStatusCourse {
  readonly slug: string;
  readonly title: string;
}

export interface GradeStatusTerm {
  readonly slug: string;
  readonly title: string;
}

export interface GradeStatusTarget {
  readonly sections: string[];
  readonly sectionCount: number;
  readonly studentCount: number;
  readonly activeStudentCount: number;
}

export interface GradeStatusGrading {
  readonly enabled: boolean;
  readonly resolvedFrom: GradeStatusResolvedFrom;
  readonly mode: string;
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
  readonly studentId: string;
  readonly githubUsername: string;
  readonly section: string;
  /** Present for normalized group repository targets. */
  readonly targetId?: string;
  readonly groupId?: string;
  readonly studentIds?: readonly string[];
  readonly repository: string | null;
  readonly workflow: string | null;
  readonly ref: string | null;
  readonly runId: number | null;
  readonly runUrl: string | null;
  readonly status: GradeStatusRepositoryStatus;
  readonly conclusion: GradeStatusRepositoryConclusion;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly selectionStrategy: string;
  readonly reason: string;
  readonly needsAttention: boolean;
  readonly diagnostics: Diagnostic[];
}

export interface GradeStatusActions {
  readonly refreshStatus: {
    readonly available: true;
    readonly implemented: true;
  };
  readonly generateReport: {
    readonly available: boolean;
    readonly implemented: false;
    readonly reason?: string;
  };
}

export interface AssignmentGradeStatusResult {
  readonly schemaVersion: typeof ASSIGNMENT_GRADE_STATUS_SCHEMA_VERSION;
  readonly commandName: "assignment grade-status";
  readonly status: CommandStatus;
  readonly exitCode: 0 | 1 | 2;
  readonly diagnostics: Diagnostic[];
  readonly repositoryMode?: "individual" | "group";
  readonly assignment: GradeStatusAssignment | null;
  readonly course: GradeStatusCourse | null;
  readonly term: GradeStatusTerm | null;
  readonly target: GradeStatusTarget | null;
  readonly grading: GradeStatusGrading | null;
  readonly summary: GradeStatusSummary | null;
  /** One row per repository target; group members can share a target. */
  readonly targets: GradeStatusRepositoryRow[];
  /** Compatibility projection with one row per selected student. */
  readonly repositories: GradeStatusRepositoryRow[];
  readonly actions: GradeStatusActions | null;
}
