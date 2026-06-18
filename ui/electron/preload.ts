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
  type FacultyReportRequest,
  type FacultyReportResult,
  type GraiderUIApi,
  type GitHubAuthResult,
  type SelectCourseFolderResult
} from "./ipc.js";

const invoke = async <T>(channel: string, ...args: readonly unknown[]): Promise<T> =>
  (await ipcRenderer.invoke(channel, ...args)) as T;

const graiderUI: GraiderUIApi = {
  getAppInfo: async (): Promise<AppInfo> => await invoke<AppInfo>(IPC_CHANNELS.getAppInfo),
  checkGitHubAuth: async (): Promise<GitHubAuthResult> =>
    await invoke<GitHubAuthResult>(IPC_CHANNELS.checkGitHubAuth),
  selectCourseFolder: async (): Promise<SelectCourseFolderResult> =>
    await invoke<SelectCourseFolderResult>(IPC_CHANNELS.selectCourseFolder),
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
