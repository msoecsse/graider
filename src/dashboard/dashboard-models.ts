import type { Diagnostic } from "../diagnostics/diagnostic.js";

export const DASHBOARD_SCHEMA_VERSION = 1;

export type DashboardStatus = "success" | "partial_success" | "failure";
export type DashboardApplyState = "not_applied" | "applied" | "partially_applied" | "unknown";
export type DashboardGithubStatus =
  | "available"
  | "missing"
  | "not_required"
  | "not_checked"
  | "unknown"
  | "error";

export interface DashboardAssignmentGithubStatus {
  readonly templateRepository: DashboardGithubStatus;
  readonly templateBranch: DashboardGithubStatus;
  readonly gradingWorkflow: DashboardGithubStatus;
  readonly workflowDispatch: DashboardGithubStatus;
}

export interface DashboardSummary {
  readonly cardCount: number;
  readonly courseCount: number;
  readonly termCount: number;
  readonly assignmentCount: number;
  readonly needsAttentionCount: number;
}

export interface DashboardRosterSummary {
  readonly sectionCount: number;
  readonly activeStudentCount: number;
  readonly totalStudentCount: number;
}

export interface DashboardAssignmentSummary {
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly gradingEnabled: boolean;
  readonly assignmentFile: string;
  readonly applyState: DashboardApplyState;
  readonly needsAttention: boolean;
  readonly diagnostics: Diagnostic[];
  readonly gradingMode?: string;
  readonly studentPublishEnabled?: boolean;
  readonly dueAt?: string;
  readonly points?: number | null;
  readonly sections?: string[];
  readonly templateRepository?: string;
  readonly templateBranch?: string;
  readonly workflow?: string;
  readonly github?: DashboardAssignmentGithubStatus;
}

export interface DashboardCard {
  readonly kind: "course-term";
  readonly displayName: string;
  readonly courseSlug: string;
  readonly courseTitle: string;
  readonly coursePath: string;
  readonly termSlug: string;
  readonly termTitle: string;
  readonly status: string;
  readonly needsAttention: boolean;
  readonly attentionCount: number;
  readonly roster: DashboardRosterSummary;
  readonly assignmentCount: number;
  /** Complete, deterministic assignment set for the course term. */
  readonly assignments: DashboardAssignmentSummary[];
  /** Compatibility summary for clients that only render recent assignments. */
  readonly recentAssignments: DashboardAssignmentSummary[];
  readonly diagnostics: Diagnostic[];
}

export interface DashboardResult {
  readonly schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  readonly commandName: "dashboard";
  readonly status: DashboardStatus;
  readonly exitCode: number;
  readonly diagnostics: Diagnostic[];
  readonly summary: DashboardSummary;
  readonly cards: DashboardCard[];
}
