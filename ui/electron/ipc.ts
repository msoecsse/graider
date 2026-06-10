export const IPC_CHANNELS = {
  getAppInfo: "graider-ui:get-app-info",
  listCourseFolders: "graider-ui:course-registry:list",
  selectCourseFolder: "graider-ui:course-registry:select-folder",
  removeCourseFolder: "graider-ui:course-registry:remove",
  refreshCourseFolder: "graider-ui:dashboard:refresh-course-folder",
  refreshDashboard: "graider-ui:dashboard:refresh-all"
} as const;

export interface AppInfo {
  readonly name: string;
  readonly version: string;
}

export interface CourseFolderRecord {
  readonly id: string;
  readonly path: string;
  readonly displayAlias: string | null;
  readonly lastOpenedAt: string;
  readonly lastRefreshedAt: string | null;
  readonly lastDashboardStatus: string | null;
}

export interface SelectCourseFolderResult {
  readonly canceled: boolean;
  readonly courseFolder: CourseFolderRecord | null;
}

export interface DashboardJsonResponse {
  readonly schemaVersion: 1;
  readonly commandName: "dashboard";
  readonly status: string;
  readonly exitCode: number;
  readonly diagnostics: readonly unknown[];
  readonly summary: Readonly<Record<string, unknown>>;
  readonly cards: readonly unknown[];
}

export interface DashboardCommandError {
  readonly code: string;
  readonly message: string;
  readonly exitCode: number | null;
  readonly stderrSnippet: string | null;
  readonly stdoutSnippet: string | null;
}

export interface CourseFolderDashboardResult {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly status: "success" | "failure";
  readonly dashboard: DashboardJsonResponse | null;
  readonly error: DashboardCommandError | null;
  readonly refreshedAt: string | null;
}

export interface CombinedDashboardResult {
  readonly status: "success" | "partial_failure" | "failure";
  readonly results: readonly CourseFolderDashboardResult[];
}

export interface GraiderUIApi {
  readonly getAppInfo: () => Promise<AppInfo>;
  readonly selectCourseFolder: () => Promise<SelectCourseFolderResult>;
  readonly listCourseFolders: () => Promise<CourseFolderRecord[]>;
  readonly removeCourseFolder: (id: string) => Promise<void>;
  readonly refreshCourseFolder: (id: string) => Promise<CourseFolderDashboardResult>;
  readonly refreshDashboard: () => Promise<CombinedDashboardResult>;
}
