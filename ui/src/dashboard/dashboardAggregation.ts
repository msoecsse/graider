import type { CourseFolderDashboardResult } from "../../electron/ipc";
import type {
  AggregatedDashboard,
  CombinedDashboardCard,
  DashboardCard,
  DashboardDiagnostic,
  DashboardRosterSummary,
  FolderDashboardError,
  RecentAssignmentSummary
} from "./dashboardTypes";

const UNKNOWN_COURSE_TITLE = "Untitled course";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];

  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const getNumber = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const getBoolean = (record: Record<string, unknown>, key: string): boolean => {
  const value = record[key];

  return typeof value === "boolean" ? value : false;
};

const getOptionalBoolean = (record: Record<string, unknown>, key: string): boolean | null => {
  const value = record[key];

  return typeof value === "boolean" ? value : null;
};

const getArray = (record: Record<string, unknown>, key: string): readonly unknown[] => {
  const value = record[key];

  return Array.isArray(value) ? value : [];
};

const getStringArray = (record: Record<string, unknown>, key: string): readonly string[] =>
  getArray(record, key).filter((value): value is string => typeof value === "string");

export const getCardTitle = (card: DashboardCard): string => {
  if (card.displayName !== null) {
    return card.displayName;
  }

  if (card.termSlug !== null && card.courseSlug !== null) {
    return `${card.termSlug}-${card.courseSlug}`;
  }

  return UNKNOWN_COURSE_TITLE;
};

const normalizeDiagnostic = (value: unknown): DashboardDiagnostic => {
  if (!isRecord(value)) {
    return {
      code: null,
      severity: null,
      message: "Diagnostic details were unavailable."
    };
  }

  return {
    code: getString(value, "code"),
    severity: getString(value, "severity"),
    message: getString(value, "message") ?? "Diagnostic details were unavailable."
  };
};

const normalizeRoster = (value: unknown): DashboardRosterSummary | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    sectionCount: getNumber(value, "sectionCount"),
    activeStudentCount: getNumber(value, "activeStudentCount"),
    totalStudentCount: getNumber(value, "totalStudentCount")
  };
};

const normalizeAssignment = (value: unknown): RecentAssignmentSummary => {
  if (!isRecord(value)) {
    return {
      slug: null,
      title: null,
      status: null,
      gradingEnabled: null,
      assignmentFile: null,
      applyState: null,
      sections: [],
      dueAt: null,
      needsAttention: true,
      diagnostics: [
        {
          code: null,
          severity: "error",
          message: "Assignment details were unavailable."
        }
      ]
    };
  }

  return {
    slug: getString(value, "slug"),
    title: getString(value, "title"),
    status: getString(value, "status"),
    gradingEnabled: getOptionalBoolean(value, "gradingEnabled"),
    assignmentFile: getString(value, "assignmentFile"),
    applyState: getString(value, "applyState"),
    sections: getStringArray(value, "sections"),
    dueAt: getString(value, "dueAt"),
    needsAttention: getBoolean(value, "needsAttention"),
    diagnostics: getArray(value, "diagnostics").map(normalizeDiagnostic)
  };
};

const normalizeCard = (value: unknown): DashboardCard => {
  if (!isRecord(value)) {
    return {
      kind: null,
      displayName: null,
      courseSlug: null,
      courseTitle: null,
      coursePath: null,
      termSlug: null,
      termTitle: null,
      status: null,
      needsAttention: true,
      attentionCount: null,
      roster: null,
      assignmentCount: null,
      assignments: [],
      recentAssignments: [],
      diagnostics: [
        {
          code: null,
          severity: "error",
          message: "Course card details were unavailable."
        }
      ]
    };
  }

  const recentAssignments = getArray(value, "recentAssignments").map(normalizeAssignment);
  const assignments = getArray(value, "assignments").map(normalizeAssignment);

  return {
    kind: getString(value, "kind"),
    displayName: getString(value, "displayName"),
    courseSlug: getString(value, "courseSlug"),
    courseTitle: getString(value, "courseTitle"),
    coursePath: getString(value, "coursePath"),
    termSlug: getString(value, "termSlug"),
    termTitle: getString(value, "termTitle"),
    status: getString(value, "status"),
    needsAttention: getBoolean(value, "needsAttention"),
    attentionCount: getNumber(value, "attentionCount"),
    roster: normalizeRoster(value.roster),
    assignmentCount: getNumber(value, "assignmentCount"),
    assignments: assignments.length > 0 ? assignments : recentAssignments,
    recentAssignments,
    diagnostics: getArray(value, "diagnostics").map(normalizeDiagnostic)
  };
};

const createCardId = (
  result: CourseFolderDashboardResult,
  card: DashboardCard,
  cardIndex: number
): string => {
  const cardKey = card.displayName ?? `${card.termSlug ?? "term"}-${card.courseSlug ?? "course"}`;

  return `${result.courseFolderId}:${cardKey}:${cardIndex}`;
};

const getSafeFolderErrorMessage = (result: CourseFolderDashboardResult): string => {
  const errorCode = result.error?.code;

  if (errorCode === "github_token_unavailable" || errorCode === "github_token_missing") {
    return "GitHub token required. Run gh auth login, then refresh.";
  }

  if (errorCode === "github_cli_not_found") {
    return "GitHub CLI was not found. Install GitHub CLI or set GRAIDER_GITHUB_TOKEN before launching Graider.";
  }

  if (errorCode === "github_cli_auth_failed") {
    return "GitHub CLI is installed, but no authenticated token was available. Run gh auth login, then refresh.";
  }

  if (errorCode === "graider_cli_not_found") {
    return "Graider CLI not found. Install Graider or make sure graider is available on PATH.";
  }

  if (errorCode === "bundled_graider_cli_not_found") {
    return "Bundled Graider CLI could not be started. Rebuild or reinstall the Graider app.";
  }

  if (errorCode === "invalid_dashboard_json") {
    return "Graider dashboard returned invalid JSON.";
  }

  if (errorCode === "dashboard_command_failed") {
    return "Dashboard command failed while reading this course folder. The selected folder exists and contains course.yml, but the Graider CLI returned an error.";
  }

  return "Could not refresh this course folder.";
};

const appendDetail = (details: string[], label: string, value: string | number | null): void => {
  if (value !== null && String(value).trim().length > 0) {
    details.push(`${label}: ${String(value)}`);
  }
};

const getFolderErrorDetails = (result: CourseFolderDashboardResult): readonly string[] => {
  if (result.error === null) {
    return [];
  }

  const details: string[] = [];

  appendDetail(details, "Command", result.error.commandName ?? null);
  appendDetail(details, "Course folder", result.error.cwd ?? result.courseFolderPath);
  appendDetail(details, "Exit code", result.error.exitCode);
  appendDetail(details, "Signal", result.error.signal ?? null);
  appendDetail(details, "Runner mode", result.error.runnerMode ?? null);
  appendDetail(details, "Executable", result.error.executablePath ?? null);
  appendDetail(details, "Helper", result.error.helperPath ?? null);
  appendDetail(
    details,
    "Argv",
    result.error.argv === undefined ? null : JSON.stringify(result.error.argv)
  );
  appendDetail(details, "stderr", result.error.stderrSnippet);
  appendDetail(details, "stdout", result.error.stdoutSnippet);

  return details;
};

const getFolderError = (result: CourseFolderDashboardResult): FolderDashboardError | null => {
  if (result.dashboard !== null) {
    return null;
  }

  if (result.error === null) {
    return null;
  }

  return {
    sourceFolderId: result.courseFolderId,
    sourceFolderPath: result.courseFolderPath,
    code: result.error.code,
    message: getSafeFolderErrorMessage(result),
    details: getFolderErrorDetails(result)
  };
};

export const aggregateDashboardResults = (
  refreshResults: Readonly<Record<string, CourseFolderDashboardResult>>
): AggregatedDashboard => {
  const results = Object.values(refreshResults);
  const cards: CombinedDashboardCard[] = [];
  const folderErrors: FolderDashboardError[] = [];

  for (const result of results) {
    const folderError = getFolderError(result);

    if (folderError !== null) {
      folderErrors.push(folderError);
    }

    if (result.dashboard !== null) {
      result.dashboard.cards.forEach((rawCard, cardIndex) => {
        const card = normalizeCard(rawCard);

        cards.push({
          id: createCardId(result, card, cardIndex),
          sourceFolderId: result.courseFolderId,
          sourceFolderPath: result.courseFolderPath,
          sourceLastRefreshedAt: result.refreshedAt,
          dashboardStatus: result.dashboard?.status ?? result.status,
          card
        });
      });
    }
  }

  return {
    cards,
    folderErrors,
    hasRefreshResults: results.length > 0
  };
};
