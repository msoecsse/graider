export interface DashboardDiagnostic {
  readonly code: string | null;
  readonly severity: string | null;
  readonly message: string;
}

export interface DashboardRosterSummary {
  readonly sectionCount: number | null;
  readonly activeStudentCount: number | null;
  readonly totalStudentCount: number | null;
}

export interface RecentAssignmentSummary {
  readonly slug: string | null;
  readonly title: string | null;
  readonly status: string | null;
  readonly assignmentFile: string | null;
  readonly dueAt: string | null;
  readonly needsAttention: boolean;
  readonly diagnostics: readonly DashboardDiagnostic[];
}

export interface DashboardCard {
  readonly kind: string | null;
  readonly displayName: string | null;
  readonly courseSlug: string | null;
  readonly courseTitle: string | null;
  readonly coursePath: string | null;
  readonly termSlug: string | null;
  readonly termTitle: string | null;
  readonly status: string | null;
  readonly needsAttention: boolean;
  readonly attentionCount: number | null;
  readonly roster: DashboardRosterSummary | null;
  readonly assignmentCount: number | null;
  readonly recentAssignments: readonly RecentAssignmentSummary[];
  readonly diagnostics: readonly DashboardDiagnostic[];
}

export interface CombinedDashboardCard {
  readonly id: string;
  readonly sourceFolderId: string;
  readonly sourceFolderPath: string;
  readonly sourceLastRefreshedAt: string | null;
  readonly dashboardStatus: string;
  readonly card: DashboardCard;
}

export interface FolderDashboardError {
  readonly sourceFolderId: string;
  readonly sourceFolderPath: string;
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
}

export interface AggregatedDashboard {
  readonly cards: readonly CombinedDashboardCard[];
  readonly folderErrors: readonly FolderDashboardError[];
  readonly hasRefreshResults: boolean;
}
