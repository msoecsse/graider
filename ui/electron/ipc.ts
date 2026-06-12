export const IPC_CHANNELS = {
  getAppInfo: "graider-ui:get-app-info",
  listCourseFolders: "graider-ui:course-registry:list",
  selectCourseFolder: "graider-ui:course-registry:select-folder",
  removeCourseFolder: "graider-ui:course-registry:remove",
  refreshCourseFolder: "graider-ui:dashboard:refresh-course-folder",
  refreshDashboard: "graider-ui:dashboard:refresh-all",
  getAssignmentDetail: "graider-ui:assignment-detail:get",
  getAssignmentApplyPreview: "graider-ui:assignment-apply-preview:get",
  getAssignmentGradePreview: "graider-ui:assignment-grade-preview:get",
  getAssignmentGradeStatus: "graider-ui:assignment-grade-status:get",
  applyAssignment: "graider-ui:assignment-apply:run",
  gradeAssignment: "graider-ui:assignment-grade:run"
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

export interface AssignmentDetailRequest {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly assignmentFile: string;
}

export type AssignmentApplyPreviewRequest = AssignmentDetailRequest;

export type AssignmentGradePreviewRequest = AssignmentDetailRequest;

export interface AssignmentGradeStatusRequest extends AssignmentDetailRequest {
  readonly studentIds?: readonly string[];
}

export type AssignmentApplyRequest = AssignmentDetailRequest;

export type AssignmentGradeRequest = AssignmentDetailRequest;

export interface AssignmentDetailJsonResponse {
  readonly schemaVersion: 1;
  readonly commandName: "assignment detail";
  readonly status: string;
  readonly exitCode: number;
  readonly diagnostics: readonly unknown[];
  readonly course: unknown;
  readonly term: unknown;
  readonly assignment: unknown;
  readonly metadata: unknown;
  readonly deadline: unknown;
  readonly sections: readonly unknown[];
  readonly roster: unknown;
  readonly template: unknown;
  readonly grading: unknown;
  readonly studentReports: unknown;
  readonly applyState: unknown;
  readonly actions: unknown;
}

export interface AssignmentDetailResult {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly assignmentFile: string;
  readonly status: "success" | "failure";
  readonly detail: AssignmentDetailJsonResponse | null;
  readonly error: DashboardCommandError | null;
  readonly refreshedAt: string | null;
}

export interface AssignmentApplyPreviewJsonResponse {
  readonly schemaVersion: 1;
  readonly commandName: "assignment apply-preview";
  readonly status: string;
  readonly exitCode: number;
  readonly diagnostics: readonly unknown[];
  readonly assignment: unknown;
  readonly course: unknown;
  readonly term: unknown;
  readonly target: unknown;
  readonly template: unknown;
  readonly grading: unknown;
  readonly plan: unknown;
  readonly files: unknown;
  readonly actions: unknown;
}

export interface AssignmentApplyPreviewResult {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly assignmentFile: string;
  readonly status: "success" | "failure";
  readonly preview: AssignmentApplyPreviewJsonResponse | null;
  readonly error: DashboardCommandError | null;
  readonly refreshedAt: string | null;
}

export interface AssignmentGradePreviewJsonResponse {
  readonly schemaVersion: 1;
  readonly commandName: "assignment grade-preview";
  readonly status: string;
  readonly exitCode: number;
  readonly diagnostics: readonly unknown[];
  readonly assignment: unknown;
  readonly course: unknown;
  readonly term: unknown;
  readonly target: unknown;
  readonly grading: unknown;
  readonly plan: unknown;
  readonly files: unknown;
  readonly actions: unknown;
}

export interface AssignmentGradePreviewResult {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly assignmentFile: string;
  readonly status: "success" | "failure";
  readonly preview: AssignmentGradePreviewJsonResponse | null;
  readonly error: DashboardCommandError | null;
  readonly refreshedAt: string | null;
}

export interface AssignmentGradeStatusJsonResponse {
  readonly schemaVersion: 1;
  readonly commandName: "assignment grade-status";
  readonly status: string;
  readonly exitCode: number;
  readonly diagnostics: readonly unknown[];
  readonly assignment: unknown;
  readonly course: unknown;
  readonly term: unknown;
  readonly target: unknown;
  readonly grading: unknown;
  readonly summary: unknown;
  readonly repositories: readonly unknown[];
  readonly actions: unknown;
}

export interface AssignmentGradeStatusResult {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly assignmentFile: string;
  readonly studentIds?: readonly string[];
  readonly status: "success" | "failure";
  readonly gradeStatus: AssignmentGradeStatusJsonResponse | null;
  readonly error: DashboardCommandError | null;
  readonly refreshedAt: string | null;
}

export interface AssignmentApplyJsonResponse {
  readonly schemaVersion: 1;
  readonly commandName: "assignment apply";
  readonly assignmentFile: string;
  readonly status: string;
  readonly exitCode: number;
  readonly diagnostics: readonly unknown[];
  readonly warnings: readonly unknown[];
  readonly errors: readonly unknown[];
  readonly generatedFiles: readonly string[];
  readonly summary: Readonly<Record<string, unknown>>;
}

export interface AssignmentApplyResult {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly assignmentFile: string;
  readonly status: "success" | "failure";
  readonly apply: AssignmentApplyJsonResponse | null;
  readonly error: DashboardCommandError | null;
  readonly appliedAt: string | null;
}

export interface AssignmentGradeJsonResponse {
  readonly schemaVersion: 1;
  readonly commandName: "assignment grade";
  readonly assignmentFile: string;
  readonly status: string;
  readonly exitCode: number;
  readonly diagnostics: readonly unknown[];
  readonly warnings: readonly unknown[];
  readonly errors: readonly unknown[];
  readonly generatedFiles: readonly string[];
  readonly summary: Readonly<Record<string, unknown>>;
}

export interface AssignmentGradeResult {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly assignmentFile: string;
  readonly status: "success" | "failure";
  readonly grade: AssignmentGradeJsonResponse | null;
  readonly error: DashboardCommandError | null;
  readonly dispatchedAt: string | null;
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
  readonly getAssignmentDetail: (
    request: AssignmentDetailRequest
  ) => Promise<AssignmentDetailResult>;
  readonly getAssignmentApplyPreview: (
    request: AssignmentApplyPreviewRequest
  ) => Promise<AssignmentApplyPreviewResult>;
  readonly getAssignmentGradePreview: (
    request: AssignmentGradePreviewRequest
  ) => Promise<AssignmentGradePreviewResult>;
  readonly getAssignmentGradeStatus: (
    request: AssignmentGradeStatusRequest
  ) => Promise<AssignmentGradeStatusResult>;
  readonly applyAssignment: (request: AssignmentApplyRequest) => Promise<AssignmentApplyResult>;
  readonly gradeAssignment: (request: AssignmentGradeRequest) => Promise<AssignmentGradeResult>;
}
