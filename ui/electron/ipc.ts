export const IPC_CHANNELS = {
  getAppInfo: "graider-ui:get-app-info",
  listCourseFolders: "graider-ui:course-registry:list",
  selectCourseFolder: "graider-ui:course-registry:select-folder",
  removeCourseFolder: "graider-ui:course-registry:remove"
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

export interface GraiderUIApi {
  readonly getAppInfo: () => Promise<AppInfo>;
  readonly selectCourseFolder: () => Promise<SelectCourseFolderResult>;
  readonly listCourseFolders: () => Promise<CourseFolderRecord[]>;
  readonly removeCourseFolder: (id: string) => Promise<void>;
}
