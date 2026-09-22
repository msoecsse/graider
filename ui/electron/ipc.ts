import type { GradingEditorViewStateDto } from "./gradingStudentViewStateService.js";
import type {
  AppliedCommentDto,
  AppliedCommentReplacementDto
} from "./gradingStudentCommentService.js";
import type {
  ManualAdjustmentDto,
  ManualAdjustmentReplacementDto
} from "./gradingStudentManualAdjustmentService.js";
import type { ReusableCommentFieldsDto } from "./gradingCommentLibraryService.js";
import type { MarkGradingStudentCompleteResult } from "./gradingStudentCompleteService.js";
import type { PublishGradingStudentReportResult } from "./gradingStudentReportPublicationService.js";
import type {
  AssignmentGradingLifecycleRequest,
  AssignmentGradingLifecycleResult
} from "./assignmentGradingLifecycleService.js";

export const IPC_CHANNELS = {
  getAppInfo: "graider-ui:get-app-info",
  getLocalSettings: "graider-ui:local-settings:get",
  saveLocalSettings: "graider-ui:local-settings:save",
  checkGitHubAuth: "graider-ui:github-auth:check",
  listCourseFolders: "graider-ui:course-registry:list",
  selectCourseFolder: "graider-ui:course-registry:select-folder",
  selectStudentAccessPagesRepositoryFolder:
    "graider-ui:student-repository-access-page:select-pages-folder",
  selectRepositoryDownloadFolder: "graider-ui:assignment-download:select-folder",
  selectCourseSetupFolder: "graider-ui:course-setup:select-folder",
  previewCourseSetup: "graider-ui:course-setup:preview",
  saveCourseSetup: "graider-ui:course-setup:save",
  saveStudentAccessPagesConfig: "graider-ui:student-access-pages:save-config",
  loadAssignmentSetupTerms: "graider-ui:assignment-setup:terms",
  previewAssignmentSetup: "graider-ui:assignment-setup:preview",
  saveAssignmentSetup: "graider-ui:assignment-setup:save",
  getAssignmentForEdit: "graider-ui:assignment-edit:get",
  previewAssignmentEdit: "graider-ui:assignment-edit:preview",
  saveAssignmentEdit: "graider-ui:assignment-edit:save",
  deleteAssignment: "graider-ui:assignment-delete:remove",
  getAssignmentGroupConfig: "graider-ui:assignment-groups:get",
  saveAssignmentGroupConfig: "graider-ui:assignment-groups:save",
  getStudentRepositoryAccessPageStatus: "graider-ui:student-repository-access-page:status",
  generateStudentRepositoryAccessPage: "graider-ui:student-repository-access-page:generate",
  getStudentRepositoryAccessPagePublishStatus:
    "graider-ui:student-repository-access-page:publish-status",
  publishStudentRepositoryAccessPage: "graider-ui:student-repository-access-page:publish",
  getCoursePublishStatus: "graider-ui:course-publish:status",
  publishCourseChanges: "graider-ui:course-publish:publish",
  loadRosterTerms: "graider-ui:roster-manager:terms",
  getRosterForSection: "graider-ui:roster-manager:get",
  previewRosterSave: "graider-ui:roster-manager:preview",
  saveRoster: "graider-ui:roster-manager:save",
  removeRoster: "graider-ui:roster-manager:remove",
  removeSection: "graider-ui:roster-manager:remove-section",
  getTemplateWorkflow: "graider-ui:template-workflow:get",
  previewTemplateWorkflowSave: "graider-ui:template-workflow:preview-save",
  saveTemplateWorkflow: "graider-ui:template-workflow:save",
  removeCourseFolder: "graider-ui:course-registry:remove",
  refreshCourseFolder: "graider-ui:dashboard:refresh-course-folder",
  refreshDashboard: "graider-ui:dashboard:refresh-all",
  getAssignmentDetail: "graider-ui:assignment-detail:get",
  prepareGradingWorkspace: "graider-ui:grading-workspace:prepare",
  loadGradingStudentSource: "graider-ui:grading-student-source:load",
  loadGradingStudentViewState: "graider-ui:grading-student-view-state:load",
  saveGradingStudentViewState: "graider-ui:grading-student-view-state:save",
  clearGradingStudentViewState: "graider-ui:grading-student-view-state:clear",
  loadGradingStudentSnapshot: "graider-ui:grading-student-snapshot:load",
  loadGradingStudentEvidence: "graider-ui:grading-student-evidence:load",
  repairGradingStudentWorkflow: "graider-ui:grading-student-workflow:repair",
  repairGradingAssignmentWorkflows: "graider-ui:grading-assignment-workflows:repair",
  previewGradingStudentReport: "graider-ui:grading-student-report:preview",
  loadGradingStudentCommitHistory: "graider-ui:grading-student-commit-history:load",
  addGradingStudentComment: "graider-ui:grading-student-comment:add",
  editGradingStudentComment: "graider-ui:grading-student-comment:edit",
  deleteGradingStudentComment: "graider-ui:grading-student-comment:delete",
  addGradingStudentManualAdjustment: "graider-ui:grading-student-manual-adjustment:add",
  editGradingStudentManualAdjustment: "graider-ui:grading-student-manual-adjustment:edit",
  deleteGradingStudentManualAdjustment: "graider-ui:grading-student-manual-adjustment:delete",
  markGradingStudentComplete: "graider-ui:grading-student:mark-complete",
  publishGradingStudentReport: "graider-ui:grading-student-report:publish",
  bulkPublishGradingStudentReports: "graider-ui:grading-student-reports:publish",
  loadGradingCommentLibrary: "graider-ui:grading-comment-library:load",
  createGradingLibraryComment: "graider-ui:grading-comment-library:create",
  editGradingLibraryComment: "graider-ui:grading-comment-library:edit",
  deleteGradingLibraryComment: "graider-ui:grading-comment-library:delete",
  prepareAssignmentTemplateSync: "graider-ui:assignment-template-sync:prepare",
  executeAssignmentTemplateSync: "graider-ui:assignment-template-sync:execute",
  assignmentTemplateSyncProgress: "graider-ui:assignment-template-sync:progress",
  getAssignmentApplyPreview: "graider-ui:assignment-apply-preview:get",
  getAssignmentGradePreview: "graider-ui:assignment-grade-preview:get",
  getAssignmentGradeStatus: "graider-ui:assignment-grade-status:get",
  getAssignmentGradingLifecycle: "graider-ui:assignment-grading-lifecycle:get",
  getFacultyReport: "graider-ui:faculty-report:get",
  applyAssignment: "graider-ui:assignment-apply:run",
  assignmentApplyProgress: "graider-ui:assignment-apply:progress",
  downloadAssignmentRepositories: "graider-ui:assignment-download:run",
  gradeAssignment: "graider-ui:assignment-grade:run"
} as const;

export interface AppInfo {
  readonly name: string;
  readonly version: string;
}

export interface LocalSettingsResult {
  readonly currentFacultyMsoeUsername: string | null;
}

export interface StudentAccessPagesConfigRequest {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly repository: string;
  readonly baseUrl: string;
  readonly branch: string;
}

export interface StudentAccessPagesConfigResult {
  readonly status: "success" | "failure";
  readonly diagnostics: readonly CourseSetupDiagnostic[];
  readonly changed: boolean;
}

export type CoursePublishStatus =
  | "changes_pending"
  | "unpushed"
  | "up_to_date"
  | "unrelated_changes"
  | "not_git_repo"
  | "no_upstream"
  | "failure";

export interface CoursePublishStatusResult {
  readonly status: CoursePublishStatus;
  readonly courseFolderPath: string;
  readonly currentBranch: string | null;
  readonly upstreamBranch: string | null;
  readonly aheadCount: number | null;
  readonly allowedChangedFiles: readonly string[];
  readonly unrelatedChangedFiles: readonly string[];
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export interface CoursePublishActionResult {
  readonly status: "success" | "up_to_date" | "failure";
  readonly diagnostics: readonly CourseSetupDiagnostic[];
  readonly commitMessage: string | null;
}

export interface CourseMutationPublicationResult {
  readonly status: "success" | "failure";
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export type GitHubAuthStatus = "connected" | "not_connected";

export interface GitHubAuthResult {
  readonly status: GitHubAuthStatus;
  readonly username: string | null;
  readonly diagnostic: string | null;
  readonly diagnosticCode: string | null;
}

export interface CourseFolderRecord {
  readonly id: string;
  readonly path: string;
  readonly displayAlias: string | null;
  readonly lastOpenedAt: string;
  readonly lastRefreshedAt: string | null;
  readonly lastDashboardStatus: string | null;
  readonly pagesRepositoryFolderPath?: string | null;
}

export interface SelectCourseFolderResult {
  readonly canceled: boolean;
  readonly courseFolder: CourseFolderRecord | null;
  readonly error?: CourseFolderSelectionError;
}

export interface CourseSetupFolderSelectionResult {
  readonly canceled: boolean;
  readonly courseFolderPath: string | null;
}

export interface CourseSetupRosterUpload {
  readonly sectionId: string;
  readonly content: string;
}

export interface CourseSetupSection {
  readonly id: string;
  readonly faculty: readonly string[];
}

export interface CourseSetupRequest {
  readonly courseFolderPath: string;
  readonly courseTitle: string;
  readonly courseCode: string;
  readonly githubOrganization: string;
  readonly gradingEnabled?: boolean;
  readonly studentAccessPagesRepository?: string;
  readonly studentAccessPagesBaseUrl?: string;
  readonly studentAccessPagesBranch?: string;
  readonly termCode: string;
  readonly sections: readonly CourseSetupSection[];
  readonly rosterUploads: readonly CourseSetupRosterUpload[];
  readonly confirmed: boolean;
  readonly replaceExisting: boolean;
}

export interface CourseSetupDiagnostic {
  readonly message: string;
}
export interface CourseSetupFilePreview {
  readonly path: string;
  readonly content: string;
  readonly exists: boolean;
}
export interface CourseSetupPreviewResult {
  readonly status: "ready" | "invalid";
  readonly files: readonly CourseSetupFilePreview[];
  readonly diagnostics: readonly CourseSetupDiagnostic[];
  readonly hasConflicts: boolean;
}
export interface CourseSetupSaveResult {
  readonly status: "success" | "failure";
  readonly writtenFiles: readonly string[];
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export interface AssignmentSetupTerm {
  readonly code: string;
  readonly sections: readonly string[];
}

export interface AssignmentSetupTermsRequest {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
}

export interface AssignmentSetupTermsResult {
  readonly terms: readonly AssignmentSetupTerm[];
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export interface AssignmentSetupRequest extends AssignmentSetupTermsRequest {
  readonly assignmentTitle: string;
  readonly assignmentSlug: string;
  readonly termCode: string;
  readonly sectionIds: readonly string[];
  readonly templateRepository: string;
  readonly templateBranch: string;
  readonly dueAt: string;
  readonly gradingEnabled: boolean;
  readonly points: number | null;
  readonly facultyOwner: string;
  readonly lmsAssignmentId: string;
  readonly gradingCategory: string;
  readonly requiredFiles: readonly string[];
  readonly rubric: readonly AssignmentRubricCategory[];
  readonly confirmed: boolean;
  readonly replaceExisting: boolean;
}

export interface AssignmentSetupFilePreview {
  readonly path: string;
  readonly content: string;
  readonly exists: boolean;
}

export interface AssignmentSetupPreviewResult {
  readonly status: "ready" | "invalid";
  readonly files: readonly AssignmentSetupFilePreview[];
  readonly diagnostics: readonly CourseSetupDiagnostic[];
  readonly hasConflicts: boolean;
}

export interface AssignmentSetupSaveResult {
  readonly status: "success" | "failure";
  readonly writtenFiles: readonly string[];
  readonly diagnostics: readonly CourseSetupDiagnostic[];
  readonly publication?: CourseMutationPublicationResult;
}

export interface AssignmentEditRequest extends AssignmentSetupTermsRequest {
  readonly assignmentFile: string;
  readonly assignmentTitle: string;
  readonly sectionIds: readonly string[];
  readonly templateRepository: string;
  readonly templateBranch: string;
  readonly dueAt: string;
  readonly latePolicy: string;
  readonly assignmentStatus: string;
  readonly gradingEnabled: boolean;
  readonly points: number | null;
  readonly facultyOwner: string;
  readonly lmsAssignmentId: string;
  readonly gradingCategory: string;
  readonly gradingMode: string | null;
  readonly gradingPreset: string | null;
  readonly requiredFiles: readonly string[];
  readonly rubric: readonly AssignmentRubricCategory[];
  readonly originalContent: string;
  readonly confirmed: boolean;
}

export interface AssignmentRubricCategory {
  readonly id: string;
  readonly name: string;
  readonly points: number;
}

export interface AssignmentEditModel {
  readonly assignmentFile: string;
  readonly assignmentSlug: string;
  readonly termCode: string;
  readonly assignmentTitle: string;
  readonly assignmentStatus: string;
  readonly sectionIds: readonly string[];
  readonly templateRepository: string;
  readonly templateBranch: string;
  readonly dueAt: string;
  readonly latePolicy: string;
  readonly gradingEnabled: boolean;
  readonly points: number | null;
  readonly gradingCategory: string;
  readonly facultyOwner: string;
  readonly lmsAssignmentId: string | null;
  readonly workflow: string;
  readonly gradingMode: string | null;
  readonly gradingPreset: string | null;
  readonly artifact: string;
  readonly resultFile: string;
  readonly requiredFiles: readonly string[];
  readonly rubric: readonly AssignmentRubricCategory[];
  readonly gradingConfigurationPresent: boolean;
  readonly originalContent: string;
}

export interface AssignmentEditLoadResult {
  readonly status: "ready" | "error";
  readonly model: AssignmentEditModel | null;
  readonly terms: readonly AssignmentSetupTerm[];
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export interface AssignmentEditPreviewResult {
  readonly status: "ready" | "invalid" | "conflict";
  readonly path: string;
  readonly content: string;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export interface AssignmentEditSaveResult {
  readonly status: "success" | "failure" | "conflict";
  readonly path: string;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
  readonly publication?: CourseMutationPublicationResult;
}

export interface AssignmentDeleteRequest extends AssignmentSetupTermsRequest {
  readonly assignmentFile: string;
  readonly confirmed: boolean;
}

export interface AssignmentDeleteResult {
  readonly status: "success" | "failure";
  readonly path: string;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
  readonly publication?: CourseMutationPublicationResult;
}

export interface AssignmentGroupConfigRequest extends AssignmentSetupTermsRequest {
  readonly assignmentFile: string;
}

export interface AssignmentGroupConfigSaveRequest extends AssignmentGroupConfigRequest {
  readonly repositoryMode: "individual" | "group";
  readonly groupsCsv: string;
}

export interface AssignmentGroupConfigResult {
  readonly status: "ready" | "success" | "failure";
  readonly repositoryMode: "individual" | "group";
  readonly groupsFile: string;
  readonly groupsCsv: string;
  readonly groupCount: number;
  readonly groupedStudentCount: number;
  readonly ungroupedActiveStudentCount: number;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
  readonly publication?: CourseMutationPublicationResult;
}

export interface StudentRepositoryAccessPageRequest extends AssignmentSetupTermsRequest {
  readonly assignmentFile: string;
  readonly pagesRepositoryFolderPath?: string | null;
}

export interface SelectStudentAccessPagesRepositoryFolderResult {
  readonly canceled: boolean;
  readonly folderPath: string | null;
  readonly error?: CourseFolderSelectionError;
}
export interface SelectRepositoryDownloadFolderResult {
  readonly canceled: boolean;
  readonly folderPath: string | null;
}
export interface AssignmentRepositoryDownloadRequest extends AssignmentDetailRequest {
  readonly destination: string;
}
export interface AssignmentRepositoryDownloadResult {
  readonly status: "success" | "partial_success" | "failure";
  readonly destination: string;
  readonly repositoryMode: "individual" | "group";
  readonly totalTargets: number;
  readonly clonedCount: number;
  readonly failedCount: number;
  readonly targets: readonly {
    readonly targetId: string;
    readonly groupId?: string;
    readonly repositoryName: string;
    readonly localPath: string;
    readonly status: "cloned" | "failed";
    readonly studentIds: readonly string[];
    readonly githubUsernames: readonly string[];
    readonly diagnostics: readonly { readonly message: string }[];
  }[];
  readonly diagnostics: readonly { readonly message: string }[];
}

export type StudentRepositoryAccessPageStatus =
  | "ready"
  | "generated"
  | "partial"
  | "not_ready"
  | "failure";

export type StudentRepositoryAccessPageRowStatus =
  | "included"
  | "missing_repository"
  | "skipped_inactive";

export interface StudentRepositoryAccessPageRow {
  readonly section: string;
  readonly studentId: string;
  readonly githubUsername: string;
  readonly repositoryUrl: string | null;
  readonly status: StudentRepositoryAccessPageRowStatus;
}

export interface StudentRepositoryAccessPageSummary {
  readonly activeStudents: number;
  readonly includedStudents: number;
  readonly skippedInactive: number;
  readonly missingRepository: number;
}

export interface StudentRepositoryAccessPageResult {
  readonly schemaVersion: 1;
  readonly assignmentFile: string;
  readonly termCode: string | null;
  readonly assignmentSlug: string | null;
  readonly outputPath: string;
  readonly githubOrganization?: string | null;
  readonly pagesRepository: string | null;
  readonly pagesBaseUrl?: string | null;
  readonly pagesBranch?: string | null;
  readonly pagesRepositoryFolderSelected: boolean;
  readonly pagesUrl: string | null;
  readonly generatedAt: string | null;
  readonly exists: boolean;
  readonly status: StudentRepositoryAccessPageStatus;
  readonly summary: StudentRepositoryAccessPageSummary;
  readonly rows: readonly StudentRepositoryAccessPageRow[];
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export type StudentRepositoryAccessPagePublishStatus =
  | "ready_to_publish"
  | "not_generated"
  | "uncommitted"
  | "unpushed"
  | "behind_upstream"
  | "no_upstream"
  | "not_git_repo"
  | "pages_folder_not_selected"
  | "pages_unknown"
  | "failure";

export interface StudentRepositoryAccessPagePublishChecks {
  readonly pagesRepositoryFolderSelected: boolean;
  readonly fileExists: boolean;
  readonly isGitRepository: boolean;
  readonly currentBranch: string | null;
  readonly hasUncommittedAccessPage: boolean;
  readonly hasUncommittedOtherChanges: boolean;
  readonly upstreamBranch: string | null;
  readonly aheadCount: number | null;
  readonly behindCount: number | null;
  readonly pagesUrlAvailable: boolean;
  readonly remoteMatchesConfiguredRepository: boolean | null;
}

export interface StudentRepositoryAccessPagePublishResult {
  readonly schemaVersion: 1;
  readonly assignmentFile: string;
  readonly termCode: string | null;
  readonly assignmentSlug: string | null;
  readonly outputPath: string;
  readonly pagesRepositoryFolderPath: string | null;
  readonly pagesUrl: string | null;
  readonly status: StudentRepositoryAccessPagePublishStatus;
  readonly checks: StudentRepositoryAccessPagePublishChecks;
  readonly suggestedCommands: readonly string[];
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export interface StudentRepositoryAccessPagePublishActionResult {
  readonly status: "success" | "up_to_date" | "failure";
  readonly diagnostics: readonly CourseSetupDiagnostic[];
  readonly commitMessage: string | null;
}

export interface RosterRow {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly section: string;
  readonly status: string;
}

export interface RosterSectionRequest extends AssignmentSetupTermsRequest {
  readonly termCode: string;
  readonly sectionId: string;
}

export interface RosterLoadResult {
  readonly status: "ready" | "migration_required" | "invalid";
  readonly path: string;
  readonly exists: boolean;
  readonly rows: readonly RosterRow[];
  readonly faculty: readonly string[];
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export interface RosterSaveRequest extends RosterSectionRequest {
  readonly rows: readonly RosterRow[];
  readonly faculty?: readonly string[];
  readonly createSection?: boolean;
  readonly confirmed: boolean;
}

export interface RosterPreviewResult {
  readonly status: "ready" | "invalid";
  readonly path: string;
  readonly content: string;
  readonly exists: boolean;
  readonly termPath?: string | null;
  readonly termContent?: string | null;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export interface RosterSaveResult {
  readonly status: "success" | "failure";
  readonly path: string;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
  readonly publication?: CourseMutationPublicationResult;
}

export interface RosterRemoveRequest extends RosterSectionRequest {
  readonly confirmed: boolean;
}

export interface RosterRemoveResult {
  readonly status: "success" | "failure";
  readonly path: string;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
  readonly publication?: CourseMutationPublicationResult;
}

export interface TemplateWorkflowRequest {
  readonly templateRepository: string | null;
  readonly templateBranch: string | null;
  readonly workflowPath: string | null;
  readonly gradingEnabled: boolean;
}

export interface TemplateWorkflowResult {
  readonly status: "success" | "missing" | "not_configured" | "auth_required" | "error";
  readonly repository: string | null;
  readonly branch: string | null;
  readonly path: string;
  readonly content: string | null;
  readonly sha: string | null;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export interface TemplateWorkflowSaveRequest extends TemplateWorkflowRequest {
  readonly assignmentSlug: string | null;
  readonly content: string;
  readonly loadedSha: string | null;
  readonly confirmed: boolean;
}

export interface TemplateWorkflowSavePreview {
  readonly status:
    | "ready"
    | "no_changes"
    | "conflict"
    | "not_configured"
    | "auth_required"
    | "error";
  readonly operation: "create" | "update" | null;
  readonly repository: string | null;
  readonly branch: string | null;
  readonly path: string;
  readonly commitMessage: string | null;
  readonly diagnostics: readonly CourseSetupDiagnostic[];
}

export interface TemplateWorkflowSaveResult extends Omit<TemplateWorkflowSavePreview, "status"> {
  readonly status: TemplateWorkflowSavePreview["status"] | "success";
  readonly commitSha: string | null;
  readonly commitUrl: string | null;
}

export interface CourseFolderSelectionError {
  readonly code: string;
  readonly message: string;
  readonly folderPath: string;
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
  readonly commandName?: string;
  readonly cwd?: string;
  readonly argv?: readonly string[];
  readonly runnerMode?: string;
  readonly executablePath?: string;
  readonly helperPath?: string | null;
  readonly signal?: string | null;
}

export interface AssignmentDetailRequest {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly assignmentFile: string;
}
export interface GradingWorkspacePrepareRequest {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
}
export interface GradingStudentSourceRequest extends GradingWorkspacePrepareRequest {
  readonly studentId: string;
}
export type GradingStudentViewStateRequest = GradingStudentSourceRequest;
export type GradingEditorViewState = GradingEditorViewStateDto;
export interface SaveGradingStudentViewStateRequest extends GradingStudentViewStateRequest {
  readonly viewState: GradingEditorViewState;
}
export type { GradingStudentViewStateResult } from "./gradingStudentViewStateService.js";
export type GradingStudentSnapshotRequest = GradingStudentSourceRequest;
export type { GradingStudentSnapshotResult } from "./gradingStudentSnapshotService.js";
export type GradingStudentEvidenceRequest = GradingStudentSourceRequest;
export type { GradingStudentEvidenceResult } from "./gradingStudentEvidenceService.js";
export interface GradingStudentWorkflowRepairRequest extends GradingStudentSourceRequest {
  readonly confirmed: boolean;
}

export interface GradingBulkWorkflowRepairRequest extends Omit<
  GradingStudentSourceRequest,
  "studentId"
> {
  readonly confirmed: boolean;
}

export type GradingBulkWorkflowRepairResult =
  import("./gradingBulkWorkflowRepairService.js").GradingBulkWorkflowRepairResult;
export type { GradingStudentWorkflowRepairResult } from "./gradingStudentWorkflowRepairService.js";
export type GradingStudentCommitHistoryRequest = GradingStudentSourceRequest;
export type { GradingStudentCommitHistoryResult } from "./gradingStudentCommitHistoryService.js";
export interface AddGradingStudentCommentRequest extends GradingStudentViewStateRequest {
  readonly comment: AppliedCommentDto;
}
export interface EditGradingStudentCommentRequest extends GradingStudentViewStateRequest {
  readonly commentId: string;
  readonly replacement: AppliedCommentReplacementDto;
}
export interface DeleteGradingStudentCommentRequest extends GradingStudentViewStateRequest {
  readonly commentId: string;
}
export type { GradingStudentCommentResult } from "./gradingStudentCommentService.js";
export interface AddGradingStudentManualAdjustmentRequest extends GradingStudentViewStateRequest {
  readonly adjustment: ManualAdjustmentDto;
}
export interface EditGradingStudentManualAdjustmentRequest extends GradingStudentViewStateRequest {
  readonly adjustmentId: string;
  readonly replacement: ManualAdjustmentReplacementDto;
}
export interface DeleteGradingStudentManualAdjustmentRequest extends GradingStudentViewStateRequest {
  readonly adjustmentId: string;
}
export type { GradingStudentManualAdjustmentResult } from "./gradingStudentManualAdjustmentService.js";
export type MarkGradingStudentCompleteRequest = GradingStudentViewStateRequest;
export type { MarkGradingStudentCompleteResult } from "./gradingStudentCompleteService.js";
export type PublishGradingStudentReportRequest = GradingStudentViewStateRequest;
export type { PublishGradingStudentReportResult } from "./gradingStudentReportPublicationService.js";
export type { PreviewGradingStudentReportResult } from "./gradingStudentReportPublicationService.js";
export interface BulkPublishGradingStudentReportsRequest extends Omit<
  GradingStudentViewStateRequest,
  "studentId"
> {
  readonly studentIds: readonly string[];
}
export type { BulkPublishGradingStudentReportsResult } from "./gradingBulkReportPublicationService.js";
export interface LoadGradingCommentLibraryRequest {
  readonly courseFolderId: string;
  readonly termCode: string;
}
export interface CreateGradingLibraryCommentRequest extends LoadGradingCommentLibraryRequest {
  readonly comment: ReusableCommentFieldsDto;
}
export interface EditGradingLibraryCommentRequest extends LoadGradingCommentLibraryRequest {
  readonly commentId: string;
  readonly replacement: ReusableCommentFieldsDto;
}
export interface DeleteGradingLibraryCommentRequest extends LoadGradingCommentLibraryRequest {
  readonly commentId: string;
}
export type { GradingCommentLibraryResult } from "./gradingCommentLibraryService.js";
export type {
  AssignmentGradingLifecycleRequest,
  AssignmentGradingLifecycleResult
} from "./assignmentGradingLifecycleService.js";

export type {
  AssignmentTemplateSyncAvailability,
  AssignmentTemplateSyncExecuteRequest,
  AssignmentTemplateSyncExecutionResult,
  AssignmentTemplateSyncFailureStage,
  AssignmentTemplateSyncOutcome,
  AssignmentTemplateSyncProgress,
  AssignmentTemplateSyncRequest,
  TemplateSyncBlocker
} from "./assignmentTemplateSyncService.js";
export type { AssignmentApplyRepositoryProgress } from "./assignmentApplyRunner.js";

export type AssignmentApplyPreviewRequest = AssignmentDetailRequest;

export type AssignmentGradePreviewRequest = AssignmentDetailRequest;

export interface AssignmentGradeStatusRequest extends AssignmentDetailRequest {
  readonly studentIds?: readonly string[];
}

export type FacultyReportRequest = AssignmentDetailRequest;

export type AssignmentApplyRequest = AssignmentDetailRequest;

export interface AssignmentApplyProgressEvent {
  readonly courseFolderId: string;
  readonly assignmentFile: string;
  readonly progress: import("./assignmentApplyRunner.js").AssignmentApplyRepositoryProgress;
}

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
  readonly repositoryMode?: "individual" | "group";
  readonly applySupported?: boolean;
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

export interface FacultyReportJsonResponse {
  readonly schemaVersion: 1;
  readonly commandName: "report";
  readonly assignmentFile?: string;
  readonly status: string;
  readonly exitCode: number;
  readonly diagnostics: readonly unknown[];
  readonly warnings: readonly unknown[];
  readonly errors: readonly unknown[];
  readonly generatedFiles: readonly string[];
  readonly summary: Readonly<Record<string, unknown>>;
  readonly report?: unknown;
  readonly students?: readonly unknown[];
}

export interface FacultyReportResult {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly assignmentFile: string;
  readonly status: "success" | "failure";
  readonly report: FacultyReportJsonResponse | null;
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
  readonly getLocalSettings?: () => Promise<LocalSettingsResult>;
  readonly saveLocalSettings?: (currentFacultyMsoeUsername: string) => Promise<LocalSettingsResult>;
  readonly checkGitHubAuth: () => Promise<GitHubAuthResult>;
  readonly selectCourseFolder: () => Promise<SelectCourseFolderResult>;
  readonly selectStudentAccessPagesRepositoryFolder?: (
    courseFolderId: string
  ) => Promise<SelectStudentAccessPagesRepositoryFolderResult>;
  readonly selectRepositoryDownloadFolder?: () => Promise<SelectRepositoryDownloadFolderResult>;
  readonly saveStudentAccessPagesConfig?: (
    request: StudentAccessPagesConfigRequest
  ) => Promise<StudentAccessPagesConfigResult>;
  readonly getCoursePublishStatus?: (courseFolderId: string) => Promise<CoursePublishStatusResult>;
  readonly publishCourseChanges?: (courseFolderId: string) => Promise<CoursePublishActionResult>;
  readonly selectCourseSetupFolder?: () => Promise<CourseSetupFolderSelectionResult>;
  readonly previewCourseSetup?: (request: CourseSetupRequest) => Promise<CourseSetupPreviewResult>;
  readonly saveCourseSetup?: (request: CourseSetupRequest) => Promise<CourseSetupSaveResult>;
  readonly loadAssignmentSetupTerms?: (
    request: AssignmentSetupTermsRequest
  ) => Promise<AssignmentSetupTermsResult>;
  readonly previewAssignmentSetup?: (
    request: AssignmentSetupRequest
  ) => Promise<AssignmentSetupPreviewResult>;
  readonly saveAssignmentSetup?: (
    request: AssignmentSetupRequest
  ) => Promise<AssignmentSetupSaveResult>;
  readonly getAssignmentForEdit?: (
    request: AssignmentSetupTermsRequest & { readonly assignmentFile: string }
  ) => Promise<AssignmentEditLoadResult>;
  readonly previewAssignmentEdit?: (
    request: AssignmentEditRequest
  ) => Promise<AssignmentEditPreviewResult>;
  readonly saveAssignmentEdit?: (
    request: AssignmentEditRequest
  ) => Promise<AssignmentEditSaveResult>;
  readonly deleteAssignment?: (request: AssignmentDeleteRequest) => Promise<AssignmentDeleteResult>;
  readonly getAssignmentGroupConfig?: (
    request: AssignmentGroupConfigRequest
  ) => Promise<AssignmentGroupConfigResult>;
  readonly saveAssignmentGroupConfig?: (
    request: AssignmentGroupConfigSaveRequest
  ) => Promise<AssignmentGroupConfigResult>;
  readonly getStudentRepositoryAccessPageStatus?: (
    request: StudentRepositoryAccessPageRequest
  ) => Promise<StudentRepositoryAccessPageResult>;
  readonly generateStudentRepositoryAccessPage?: (
    request: StudentRepositoryAccessPageRequest
  ) => Promise<StudentRepositoryAccessPageResult>;
  readonly getStudentRepositoryAccessPagePublishStatus?: (
    request: StudentRepositoryAccessPageRequest
  ) => Promise<StudentRepositoryAccessPagePublishResult>;
  readonly publishStudentRepositoryAccessPage?: (
    request: StudentRepositoryAccessPageRequest
  ) => Promise<StudentRepositoryAccessPagePublishActionResult>;
  readonly loadRosterTerms?: (
    request: AssignmentSetupTermsRequest
  ) => Promise<AssignmentSetupTermsResult>;
  readonly getRosterForSection?: (request: RosterSectionRequest) => Promise<RosterLoadResult>;
  readonly previewRosterSave?: (request: RosterSaveRequest) => Promise<RosterPreviewResult>;
  readonly saveRoster?: (request: RosterSaveRequest) => Promise<RosterSaveResult>;
  readonly removeRoster?: (request: RosterRemoveRequest) => Promise<RosterRemoveResult>;
  readonly removeSection?: (request: RosterRemoveRequest) => Promise<RosterRemoveResult>;
  readonly getTemplateWorkflow?: (
    request: TemplateWorkflowRequest
  ) => Promise<TemplateWorkflowResult>;
  readonly previewTemplateWorkflowSave?: (
    request: TemplateWorkflowSaveRequest
  ) => Promise<TemplateWorkflowSavePreview>;
  readonly saveTemplateWorkflow?: (
    request: TemplateWorkflowSaveRequest
  ) => Promise<TemplateWorkflowSaveResult>;
  readonly listCourseFolders: () => Promise<CourseFolderRecord[]>;
  readonly removeCourseFolder: (id: string) => Promise<void>;
  readonly refreshCourseFolder: (id: string) => Promise<CourseFolderDashboardResult>;
  readonly refreshDashboard: () => Promise<CombinedDashboardResult>;
  readonly getAssignmentDetail: (
    request: AssignmentDetailRequest
  ) => Promise<AssignmentDetailResult>;
  readonly prepareGradingWorkspace: (request: GradingWorkspacePrepareRequest) => Promise<unknown>;
  readonly loadGradingStudentSource: (request: GradingStudentSourceRequest) => Promise<unknown>;
  readonly loadGradingStudentViewState: (
    request: GradingStudentViewStateRequest
  ) => Promise<import("./gradingStudentViewStateService.js").GradingStudentViewStateResult>;
  readonly saveGradingStudentViewState: (
    request: SaveGradingStudentViewStateRequest
  ) => Promise<import("./gradingStudentViewStateService.js").GradingStudentViewStateResult>;
  readonly clearGradingStudentViewState: (
    request: GradingStudentViewStateRequest
  ) => Promise<import("./gradingStudentViewStateService.js").GradingStudentViewStateResult>;
  readonly loadGradingStudentSnapshot?: (
    request: GradingStudentSnapshotRequest
  ) => Promise<import("./gradingStudentSnapshotService.js").GradingStudentSnapshotResult>;
  readonly loadGradingStudentEvidence?: (
    request: GradingStudentEvidenceRequest
  ) => Promise<import("./gradingStudentEvidenceService.js").GradingStudentEvidenceResult>;
  readonly repairGradingStudentWorkflow?: (
    request: GradingStudentWorkflowRepairRequest
  ) => Promise<
    import("./gradingStudentWorkflowRepairService.js").GradingStudentWorkflowRepairResult
  >;
  readonly repairGradingAssignmentWorkflows?: (
    request: GradingBulkWorkflowRepairRequest
  ) => Promise<import("./gradingBulkWorkflowRepairService.js").GradingBulkWorkflowRepairResult>;
  readonly loadGradingStudentCommitHistory?: (
    request: GradingStudentCommitHistoryRequest
  ) => Promise<import("./gradingStudentCommitHistoryService.js").GradingStudentCommitHistoryResult>;
  readonly addGradingStudentComment?: (
    request: AddGradingStudentCommentRequest
  ) => Promise<import("./gradingStudentCommentService.js").GradingStudentCommentResult>;
  readonly editGradingStudentComment?: (
    request: EditGradingStudentCommentRequest
  ) => Promise<import("./gradingStudentCommentService.js").GradingStudentCommentResult>;
  readonly deleteGradingStudentComment?: (
    request: DeleteGradingStudentCommentRequest
  ) => Promise<import("./gradingStudentCommentService.js").GradingStudentCommentResult>;
  readonly addGradingStudentManualAdjustment?: (
    request: AddGradingStudentManualAdjustmentRequest
  ) => Promise<
    import("./gradingStudentManualAdjustmentService.js").GradingStudentManualAdjustmentResult
  >;
  readonly previewGradingStudentReport?: (
    request: PublishGradingStudentReportRequest
  ) => Promise<
    import("./gradingStudentReportPublicationService.js").PreviewGradingStudentReportResult
  >;
  readonly editGradingStudentManualAdjustment?: (
    request: EditGradingStudentManualAdjustmentRequest
  ) => Promise<
    import("./gradingStudentManualAdjustmentService.js").GradingStudentManualAdjustmentResult
  >;
  readonly deleteGradingStudentManualAdjustment?: (
    request: DeleteGradingStudentManualAdjustmentRequest
  ) => Promise<
    import("./gradingStudentManualAdjustmentService.js").GradingStudentManualAdjustmentResult
  >;
  readonly markGradingStudentComplete?: (
    request: MarkGradingStudentCompleteRequest
  ) => Promise<MarkGradingStudentCompleteResult>;
  readonly publishGradingStudentReport?: (
    request: PublishGradingStudentReportRequest
  ) => Promise<PublishGradingStudentReportResult>;
  readonly bulkPublishGradingStudentReports?: (
    request: BulkPublishGradingStudentReportsRequest
  ) => Promise<
    import("./gradingBulkReportPublicationService.js").BulkPublishGradingStudentReportsResult
  >;
  readonly loadGradingCommentLibrary?: (
    request: LoadGradingCommentLibraryRequest
  ) => Promise<import("./gradingCommentLibraryService.js").GradingCommentLibraryResult>;
  readonly createGradingLibraryComment?: (
    request: CreateGradingLibraryCommentRequest
  ) => Promise<import("./gradingCommentLibraryService.js").GradingCommentLibraryResult>;
  readonly editGradingLibraryComment?: (
    request: EditGradingLibraryCommentRequest
  ) => Promise<import("./gradingCommentLibraryService.js").GradingCommentLibraryResult>;
  readonly deleteGradingLibraryComment?: (
    request: DeleteGradingLibraryCommentRequest
  ) => Promise<import("./gradingCommentLibraryService.js").GradingCommentLibraryResult>;
  readonly prepareAssignmentTemplateSync: (
    request: import("./assignmentTemplateSyncService.js").AssignmentTemplateSyncRequest
  ) => Promise<import("./assignmentTemplateSyncService.js").AssignmentTemplateSyncAvailability>;
  readonly executeAssignmentTemplateSync: (
    request: import("./assignmentTemplateSyncService.js").AssignmentTemplateSyncExecuteRequest
  ) => Promise<import("./assignmentTemplateSyncService.js").AssignmentTemplateSyncExecutionResult>;
  readonly onAssignmentTemplateSyncProgress: (
    listener: (
      progress: import("./assignmentTemplateSyncService.js").AssignmentTemplateSyncProgress
    ) => void
  ) => () => void;
  readonly getAssignmentApplyPreview: (
    request: AssignmentApplyPreviewRequest
  ) => Promise<AssignmentApplyPreviewResult>;
  readonly getAssignmentGradePreview: (
    request: AssignmentGradePreviewRequest
  ) => Promise<AssignmentGradePreviewResult>;
  readonly getAssignmentGradeStatus: (
    request: AssignmentGradeStatusRequest
  ) => Promise<AssignmentGradeStatusResult>;
  readonly getAssignmentGradingLifecycle?: (
    request: AssignmentGradingLifecycleRequest
  ) => Promise<AssignmentGradingLifecycleResult>;
  readonly getFacultyReport: (request: FacultyReportRequest) => Promise<FacultyReportResult>;
  readonly applyAssignment: (request: AssignmentApplyRequest) => Promise<AssignmentApplyResult>;
  readonly onAssignmentApplyProgress: (
    listener: (event: AssignmentApplyProgressEvent) => void
  ) => () => void;
  readonly downloadAssignmentRepositories?: (
    request: AssignmentRepositoryDownloadRequest
  ) => Promise<AssignmentRepositoryDownloadResult>;
  readonly gradeAssignment: (request: AssignmentGradeRequest) => Promise<AssignmentGradeResult>;
}
