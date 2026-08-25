import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type AppInfo,
  type AssignmentApplyRequest,
  type AssignmentApplyResult,
  type AssignmentApplyPreviewRequest,
  type AssignmentApplyPreviewResult,
  type AssignmentDetailRequest,
  type AssignmentDetailResult,
  type AssignmentGradeRequest,
  type AssignmentGradeResult,
  type AssignmentGradePreviewRequest,
  type AssignmentGradePreviewResult,
  type AssignmentGradeStatusRequest,
  type AssignmentGradeStatusResult,
  type CombinedDashboardResult,
  type CourseFolderDashboardResult,
  type CourseFolderRecord,
  type CourseSetupFolderSelectionResult,
  type CourseSetupPreviewResult,
  type CourseSetupRequest,
  type CourseSetupSaveResult,
  type AssignmentSetupPreviewResult,
  type AssignmentSetupRequest,
  type AssignmentSetupSaveResult,
  type AssignmentSetupTermsRequest,
  type AssignmentSetupTermsResult,
  type AssignmentEditLoadResult,
  type AssignmentEditRequest,
  type AssignmentEditSaveResult,
  type AssignmentEditPreviewResult,
  type AssignmentGroupConfigRequest,
  type AssignmentGroupConfigResult,
  type AssignmentGroupConfigSaveRequest,
  type StudentRepoEmailPreviewRequest,
  type StudentRepoEmailPreviewResult,
  type StudentRepoEmailSendHistoryResult,
  type StudentRepoEmailTransportStatusResult,
  type StudentRepositoryAccessPageRequest,
  type StudentRepositoryAccessPageResult,
  type StudentRepositoryAccessPagePublishResult,
  type StudentRepositoryAccessPagePublishActionResult,
  type RosterLoadResult,
  type RosterPreviewResult,
  type RosterSaveRequest,
  type RosterSaveResult,
  type RosterSectionRequest,
  type TemplateWorkflowRequest,
  type TemplateWorkflowResult,
  type TemplateWorkflowSavePreview,
  type TemplateWorkflowSaveRequest,
  type TemplateWorkflowSaveResult,
  type FacultyReportRequest,
  type FacultyReportResult,
  type GraiderUIApi,
  type GitHubAuthResult,
  type SelectCourseFolderResult,
  type SelectStudentAccessPagesRepositoryFolderResult,
  type StudentAccessPagesConfigRequest,
  type StudentAccessPagesConfigResult,
  type CoursePublishStatusResult,
  type CoursePublishActionResult
} from "./ipc.js";

const invoke = async <T>(channel: string, ...args: readonly unknown[]): Promise<T> =>
  (await ipcRenderer.invoke(channel, ...args)) as T;

const graiderUI: GraiderUIApi = {
  getAppInfo: async (): Promise<AppInfo> => await invoke<AppInfo>(IPC_CHANNELS.getAppInfo),
  checkGitHubAuth: async (): Promise<GitHubAuthResult> =>
    await invoke<GitHubAuthResult>(IPC_CHANNELS.checkGitHubAuth),
  selectCourseFolder: async (): Promise<SelectCourseFolderResult> =>
    await invoke<SelectCourseFolderResult>(IPC_CHANNELS.selectCourseFolder),
  selectStudentAccessPagesRepositoryFolder: async (
    courseFolderId: string
  ): Promise<SelectStudentAccessPagesRepositoryFolderResult> =>
    await invoke<SelectStudentAccessPagesRepositoryFolderResult>(
      IPC_CHANNELS.selectStudentAccessPagesRepositoryFolder,
      courseFolderId
    ),
  saveStudentAccessPagesConfig: async (
    request: StudentAccessPagesConfigRequest
  ): Promise<StudentAccessPagesConfigResult> =>
    await invoke<StudentAccessPagesConfigResult>(
      IPC_CHANNELS.saveStudentAccessPagesConfig,
      request
    ),
  getCoursePublishStatus: async (courseFolderId: string): Promise<CoursePublishStatusResult> =>
    await invoke<CoursePublishStatusResult>(IPC_CHANNELS.getCoursePublishStatus, courseFolderId),
  publishCourseChanges: async (courseFolderId: string): Promise<CoursePublishActionResult> =>
    await invoke<CoursePublishActionResult>(IPC_CHANNELS.publishCourseChanges, courseFolderId),
  selectCourseSetupFolder: async (): Promise<CourseSetupFolderSelectionResult> =>
    await invoke<CourseSetupFolderSelectionResult>(IPC_CHANNELS.selectCourseSetupFolder),
  previewCourseSetup: async (request: CourseSetupRequest): Promise<CourseSetupPreviewResult> =>
    await invoke<CourseSetupPreviewResult>(IPC_CHANNELS.previewCourseSetup, request),
  saveCourseSetup: async (request: CourseSetupRequest): Promise<CourseSetupSaveResult> =>
    await invoke<CourseSetupSaveResult>(IPC_CHANNELS.saveCourseSetup, request),
  loadAssignmentSetupTerms: async (
    request: AssignmentSetupTermsRequest
  ): Promise<AssignmentSetupTermsResult> =>
    await invoke<AssignmentSetupTermsResult>(IPC_CHANNELS.loadAssignmentSetupTerms, request),
  previewAssignmentSetup: async (
    request: AssignmentSetupRequest
  ): Promise<AssignmentSetupPreviewResult> =>
    await invoke<AssignmentSetupPreviewResult>(IPC_CHANNELS.previewAssignmentSetup, request),
  saveAssignmentSetup: async (
    request: AssignmentSetupRequest
  ): Promise<AssignmentSetupSaveResult> =>
    await invoke<AssignmentSetupSaveResult>(IPC_CHANNELS.saveAssignmentSetup, request),
  getAssignmentForEdit: async (request): Promise<AssignmentEditLoadResult> =>
    await invoke<AssignmentEditLoadResult>(IPC_CHANNELS.getAssignmentForEdit, request),
  previewAssignmentEdit: async (
    request: AssignmentEditRequest
  ): Promise<AssignmentEditPreviewResult> =>
    await invoke<AssignmentEditPreviewResult>(IPC_CHANNELS.previewAssignmentEdit, request),
  saveAssignmentEdit: async (request: AssignmentEditRequest): Promise<AssignmentEditSaveResult> =>
    await invoke<AssignmentEditSaveResult>(IPC_CHANNELS.saveAssignmentEdit, request),
  getAssignmentGroupConfig: async (
    request: AssignmentGroupConfigRequest
  ): Promise<AssignmentGroupConfigResult> =>
    await invoke<AssignmentGroupConfigResult>(IPC_CHANNELS.getAssignmentGroupConfig, request),
  saveAssignmentGroupConfig: async (
    request: AssignmentGroupConfigSaveRequest
  ): Promise<AssignmentGroupConfigResult> =>
    await invoke<AssignmentGroupConfigResult>(IPC_CHANNELS.saveAssignmentGroupConfig, request),
  getStudentRepoEmailPreview: async (
    request: StudentRepoEmailPreviewRequest
  ): Promise<StudentRepoEmailPreviewResult> =>
    await invoke<StudentRepoEmailPreviewResult>(IPC_CHANNELS.getStudentRepoEmailPreview, request),
  getStudentRepoEmailSendHistory: async (
    request: StudentRepoEmailPreviewRequest
  ): Promise<StudentRepoEmailSendHistoryResult> =>
    await invoke<StudentRepoEmailSendHistoryResult>(
      IPC_CHANNELS.getStudentRepoEmailSendHistory,
      request
    ),
  getStudentRepoEmailTransportStatus: async (
    request: StudentRepoEmailPreviewRequest
  ): Promise<StudentRepoEmailTransportStatusResult> =>
    await invoke<StudentRepoEmailTransportStatusResult>(
      IPC_CHANNELS.getStudentRepoEmailTransportStatus,
      request
    ),
  getStudentRepositoryAccessPageStatus: async (
    request: StudentRepositoryAccessPageRequest
  ): Promise<StudentRepositoryAccessPageResult> =>
    await invoke<StudentRepositoryAccessPageResult>(
      IPC_CHANNELS.getStudentRepositoryAccessPageStatus,
      request
    ),
  generateStudentRepositoryAccessPage: async (
    request: StudentRepositoryAccessPageRequest
  ): Promise<StudentRepositoryAccessPageResult> =>
    await invoke<StudentRepositoryAccessPageResult>(
      IPC_CHANNELS.generateStudentRepositoryAccessPage,
      request
    ),
  getStudentRepositoryAccessPagePublishStatus: async (
    request: StudentRepositoryAccessPageRequest
  ): Promise<StudentRepositoryAccessPagePublishResult> =>
    await invoke<StudentRepositoryAccessPagePublishResult>(
      IPC_CHANNELS.getStudentRepositoryAccessPagePublishStatus,
      request
    ),
  publishStudentRepositoryAccessPage: async (
    request: StudentRepositoryAccessPageRequest
  ): Promise<StudentRepositoryAccessPagePublishActionResult> =>
    await invoke<StudentRepositoryAccessPagePublishActionResult>(
      IPC_CHANNELS.publishStudentRepositoryAccessPage,
      request
    ),
  loadRosterTerms: async (
    request: AssignmentSetupTermsRequest
  ): Promise<AssignmentSetupTermsResult> =>
    await invoke<AssignmentSetupTermsResult>(IPC_CHANNELS.loadRosterTerms, request),
  getRosterForSection: async (request: RosterSectionRequest): Promise<RosterLoadResult> =>
    await invoke<RosterLoadResult>(IPC_CHANNELS.getRosterForSection, request),
  previewRosterSave: async (request: RosterSaveRequest): Promise<RosterPreviewResult> =>
    await invoke<RosterPreviewResult>(IPC_CHANNELS.previewRosterSave, request),
  saveRoster: async (request: RosterSaveRequest): Promise<RosterSaveResult> =>
    await invoke<RosterSaveResult>(IPC_CHANNELS.saveRoster, request),
  getTemplateWorkflow: async (request: TemplateWorkflowRequest): Promise<TemplateWorkflowResult> =>
    await invoke<TemplateWorkflowResult>(IPC_CHANNELS.getTemplateWorkflow, request),
  previewTemplateWorkflowSave: async (
    request: TemplateWorkflowSaveRequest
  ): Promise<TemplateWorkflowSavePreview> =>
    await invoke<TemplateWorkflowSavePreview>(IPC_CHANNELS.previewTemplateWorkflowSave, request),
  saveTemplateWorkflow: async (
    request: TemplateWorkflowSaveRequest
  ): Promise<TemplateWorkflowSaveResult> =>
    await invoke<TemplateWorkflowSaveResult>(IPC_CHANNELS.saveTemplateWorkflow, request),
  listCourseFolders: async (): Promise<CourseFolderRecord[]> =>
    await invoke<CourseFolderRecord[]>(IPC_CHANNELS.listCourseFolders),
  removeCourseFolder: async (id: string): Promise<void> => {
    await invoke<void>(IPC_CHANNELS.removeCourseFolder, id);
  },
  refreshCourseFolder: async (id: string): Promise<CourseFolderDashboardResult> =>
    await invoke<CourseFolderDashboardResult>(IPC_CHANNELS.refreshCourseFolder, id),
  refreshDashboard: async (): Promise<CombinedDashboardResult> =>
    await invoke<CombinedDashboardResult>(IPC_CHANNELS.refreshDashboard),
  getAssignmentDetail: async (request: AssignmentDetailRequest): Promise<AssignmentDetailResult> =>
    await invoke<AssignmentDetailResult>(IPC_CHANNELS.getAssignmentDetail, request),
  getAssignmentApplyPreview: async (
    request: AssignmentApplyPreviewRequest
  ): Promise<AssignmentApplyPreviewResult> =>
    await invoke<AssignmentApplyPreviewResult>(IPC_CHANNELS.getAssignmentApplyPreview, request),
  getAssignmentGradePreview: async (
    request: AssignmentGradePreviewRequest
  ): Promise<AssignmentGradePreviewResult> =>
    await invoke<AssignmentGradePreviewResult>(IPC_CHANNELS.getAssignmentGradePreview, request),
  getAssignmentGradeStatus: async (
    request: AssignmentGradeStatusRequest
  ): Promise<AssignmentGradeStatusResult> =>
    await invoke<AssignmentGradeStatusResult>(IPC_CHANNELS.getAssignmentGradeStatus, request),
  getFacultyReport: async (request: FacultyReportRequest): Promise<FacultyReportResult> =>
    await invoke<FacultyReportResult>(IPC_CHANNELS.getFacultyReport, request),
  applyAssignment: async (request: AssignmentApplyRequest): Promise<AssignmentApplyResult> =>
    await invoke<AssignmentApplyResult>(IPC_CHANNELS.applyAssignment, request),
  gradeAssignment: async (request: AssignmentGradeRequest): Promise<AssignmentGradeResult> =>
    await invoke<AssignmentGradeResult>(IPC_CHANNELS.gradeAssignment, request)
};

contextBridge.exposeInMainWorld("graiderUI", graiderUI);
