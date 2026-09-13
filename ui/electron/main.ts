import { BrowserWindow, app, dialog, ipcMain } from "electron";
import { applyAssignmentWithStudentRepositoryAccessPage } from "./assignmentApplyWithAccessPageService.js";
import { gradeAssignment } from "./assignmentGradeRunner.js";
import { getAssignmentApplyPreview } from "./assignmentApplyPreviewRunner.js";
import { getAssignmentGradePreview } from "./assignmentGradePreviewRunner.js";
import { getAssignmentGradeStatus } from "./assignmentGradeStatusRunner.js";
import { createNodeProcessRunner } from "./commandRunner.js";
import { getAssignmentDetail } from "./assignmentDetailRunner.js";
import { prepareGradingWorkspace } from "./gradingWorkspaceService.js";
import { loadGradingStudentSource } from "./gradingStudentSourceService.js";
import {
  clearGradingStudentViewState,
  loadGradingStudentViewState,
  saveGradingStudentViewState
} from "./gradingStudentViewStateService.js";
import { loadGradingStudentSnapshot } from "./gradingStudentSnapshotService.js";
import { loadGradingStudentEvidence } from "./gradingStudentEvidenceService.js";
import { loadGradingStudentCommitHistory } from "./gradingStudentCommitHistoryService.js";
import { markGradingStudentComplete } from "./gradingStudentCompleteService.js";
import { publishGradingStudentReport } from "./gradingStudentReportPublicationService.js";
import { bulkPublishGradingStudentReports } from "./gradingBulkReportPublicationService.js";
import { isBulkPublishGradingStudentReportsRequest } from "./gradingBulkReportPublicationRequestValidation.js";
import {
  addGradingStudentComment,
  deleteGradingStudentComment,
  editGradingStudentComment
} from "./gradingStudentCommentService.js";
import {
  addGradingStudentManualAdjustment,
  deleteGradingStudentManualAdjustment,
  editGradingStudentManualAdjustment
} from "./gradingStudentManualAdjustmentService.js";
import {
  createGradingLibraryComment,
  deleteGradingLibraryComment,
  editGradingLibraryComment,
  loadGradingCommentLibrary
} from "./gradingCommentLibraryService.js";
import {
  isCreateGradingLibraryCommentRequest,
  isDeleteGradingLibraryCommentRequest,
  isEditGradingLibraryCommentRequest,
  isLoadGradingCommentLibraryRequest
} from "./gradingCommentLibraryRequestValidation.js";
import {
  isAddGradingStudentCommentRequest,
  isAddGradingStudentManualAdjustmentRequest,
  isDeleteGradingStudentCommentRequest,
  isDeleteGradingStudentManualAdjustmentRequest,
  isEditGradingStudentCommentRequest,
  isEditGradingStudentManualAdjustmentRequest,
  isGradingStudentViewStateRequest,
  isLoadGradingStudentSourceRequest,
  isLoadGradingStudentCommitHistoryRequest,
  isLoadGradingStudentEvidenceRequest,
  isMarkGradingStudentCompleteRequest,
  isPublishGradingStudentReportRequest,
  isSaveGradingStudentViewStateRequest
} from "./gradingStudentViewStateRequestValidation.js";
import { isPrepareGradingWorkspaceRequest } from "./gradingWorkspaceRequestValidation.js";
import {
  getLocalRepositoryLocatorPath,
  recordSuccessfulDownloadLocators
} from "./localRepositoryLocator.js";
import { registerAssignmentTemplateSyncIpc } from "./assignmentTemplateSyncIpc.js";
import { assignmentTemplateSyncService } from "./assignmentTemplateSyncService.js";
import { saveStudentAccessPagesConfig } from "./studentAccessPagesConfigService.js";
import { getCoursePublishStatus, publishCourseChanges } from "./coursePublishService.js";
import { getAssignmentRepositoryMappings } from "./assignmentRepositoryMappingsRunner.js";
import { getFacultyReport } from "./facultyReportRunner.js";
import { previewCourseSetup, saveCourseSetup } from "./courseSetupService.js";
import {
  getLocalSettingsPath,
  loadLocalSettings,
  saveCurrentFacultyMsoeUsername
} from "./localSettings.js";
import {
  loadAssignmentSetupTerms,
  previewAssignmentSetup,
  saveAssignmentSetup
} from "./assignmentSetupService.js";
import {
  getAssignmentForEdit,
  previewAssignmentEdit,
  saveAssignmentEdit
} from "./assignmentEditService.js";
import { deleteAssignment } from "./assignmentDeleteService.js";
import {
  getAssignmentGroupConfig,
  saveAssignmentGroupConfig
} from "./assignmentGroupConfigService.js";
import {
  generateStudentRepositoryAccessPage,
  getStudentRepositoryAccessPageStatus
} from "./studentRepositoryAccessPageService.js";
import { getStudentRepositoryAccessPagePublishStatus } from "./studentRepositoryAccessPagePublishStatusService.js";
import { publishStudentRepositoryAccessPage } from "./studentRepositoryAccessPagePublishService.js";
import { getRosterForSection, loadRosterTerms, previewRosterSave } from "./rosterManagerService.js";
import {
  removeRosterWithStudentRepositoryAccessPageRefresh,
  removeSectionWithStudentRepositoryAccessPageRefresh,
  saveRosterWithStudentRepositoryAccessPageRefresh
} from "./rosterStudentRepositoryAccessPageService.js";
import {
  isRosterRemoveRequest,
  isRosterSaveRequest,
  isRosterSectionRequest
} from "./rosterRequestValidation.js";
import { checkGitHubAuth } from "./githubAuthChecker.js";
import { validateTemplateRepository } from "./templateRepositoryValidationService.js";
import {
  getTemplateWorkflow,
  previewTemplateWorkflowSave,
  saveTemplateWorkflow
} from "./templateWorkflowService.js";
import {
  addValidatedCourseFolderToRegistry,
  getCourseRegistryPath,
  getSelectedFolderPath,
  listCourseFolders,
  removeCourseFolderFromRegistry,
  setStudentAccessPagesRepositoryFolder
} from "./courseRegistry.js";
import { refreshCourseFolder, refreshDashboard } from "./dashboardRunner.js";
import { getPreloadPath, getRendererDevServerUrl, getRendererEntry } from "./rendererPaths.js";
import {
  IPC_CHANNELS,
  type AppInfo,
  type AssignmentApplyRequest,
  type AssignmentApplyPreviewRequest,
  type AssignmentDetailRequest,
  type AssignmentGradeRequest,
  type AssignmentGradePreviewRequest,
  type AssignmentGradeStatusRequest,
  type FacultyReportRequest,
  type CourseSetupRequest,
  type AssignmentSetupRequest,
  type AssignmentSetupTermsRequest,
  type AssignmentEditRequest,
  type AssignmentDeleteRequest,
  type AssignmentGroupConfigRequest,
  type AssignmentGroupConfigSaveRequest,
  type StudentRepositoryAccessPageRequest,
  type TemplateWorkflowRequest,
  type TemplateWorkflowSaveRequest,
  type StudentAccessPagesConfigRequest,
  type AssignmentRepositoryDownloadRequest
} from "./ipc.js";

const DEFAULT_WINDOW_WIDTH = 1180;
const DEFAULT_WINDOW_HEIGHT = 760;
const MIN_WINDOW_WIDTH = 860;
const MIN_WINDOW_HEIGHT = 620;
const DEBUG_ENV_NAME = "GRAIDER_UI_DEBUG";
const DEBUG_ENABLED_VALUE = "1";

export const getAppInfo = (): AppInfo => ({
  name: app.getName(),
  version: app.getVersion()
});

const isDebugEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env[DEBUG_ENV_NAME]?.trim() === DEBUG_ENABLED_VALUE;

const logDebugDiagnostic = (message: string): void => {
  if (isDebugEnabled()) {
    console.error(`[graider-ui] ${message}`);
  }
};

const logRendererDiagnostic = (message: string): void => {
  console.error(`[graider-ui] ${message}`);
};

const registerRendererDiagnostics = (window: BrowserWindow): void => {
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      logRendererDiagnostic(
        `Renderer failed to load: code=${String(errorCode)} description=${errorDescription} mainFrame=${String(isMainFrame)} url=${validatedUrl}`
      );
    }
  );

  window.webContents.on("render-process-gone", (_event, details) => {
    logRendererDiagnostic(
      `Renderer process exited: reason=${details.reason} exitCode=${String(details.exitCode)}`
    );
  });

  window.on("unresponsive", () => {
    logRendererDiagnostic("Renderer window became unresponsive.");
  });
};

const loadRenderer = (window: BrowserWindow): void => {
  const devServerUrl = getRendererDevServerUrl();
  const loadPromise =
    devServerUrl === undefined ? window.loadFile(getRendererEntry()) : window.loadURL(devServerUrl);

  loadPromise.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logRendererDiagnostic(`Renderer load failed: ${message}`);
  });
};

const isAssignmentDetailRequest = (value: unknown): value is AssignmentDetailRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const request = value as unknown as Record<string, unknown>;

  return (
    typeof request.courseFolderId === "string" &&
    typeof request.courseFolderPath === "string" &&
    typeof request.assignmentFile === "string"
  );
};
const isAssignmentApplyPreviewRequest = (value: unknown): value is AssignmentApplyPreviewRequest =>
  isAssignmentDetailRequest(value);

const isAssignmentGradePreviewRequest = (value: unknown): value is AssignmentGradePreviewRequest =>
  isAssignmentDetailRequest(value);

const isAssignmentGradeStatusRequest = (value: unknown): value is AssignmentGradeStatusRequest => {
  if (!isAssignmentDetailRequest(value)) {
    return false;
  }

  const request = value as unknown as Record<string, unknown>;
  const studentIds = request.studentIds;

  return (
    studentIds === undefined ||
    (Array.isArray(studentIds) && studentIds.every((studentId) => typeof studentId === "string"))
  );
};

const isFacultyReportRequest = (value: unknown): value is FacultyReportRequest =>
  isAssignmentDetailRequest(value);

const isAssignmentApplyRequest = (value: unknown): value is AssignmentApplyRequest =>
  isAssignmentDetailRequest(value);
const isAssignmentRepositoryDownloadRequest = (
  value: unknown
): value is AssignmentRepositoryDownloadRequest =>
  isAssignmentDetailRequest(value) &&
  typeof (value as unknown as Record<string, unknown>).destination === "string";

const isAssignmentGradeRequest = (value: unknown): value is AssignmentGradeRequest =>
  isAssignmentDetailRequest(value);

const isCourseSetupRequest = (value: unknown): value is CourseSetupRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  const rosterUploads = request.rosterUploads;
  return (
    typeof request.courseFolderPath === "string" &&
    typeof request.courseTitle === "string" &&
    typeof request.courseCode === "string" &&
    typeof request.githubOrganization === "string" &&
    (request.gradingEnabled === undefined || typeof request.gradingEnabled === "boolean") &&
    typeof request.termCode === "string" &&
    Array.isArray(request.sections) &&
    request.sections.every(
      (section) =>
        typeof section === "object" &&
        section !== null &&
        !Array.isArray(section) &&
        typeof (section as Record<string, unknown>).id === "string" &&
        Array.isArray((section as Record<string, unknown>).faculty) &&
        ((section as Record<string, unknown>).faculty as unknown[]).every(
          (username) => typeof username === "string"
        )
    ) &&
    Array.isArray(rosterUploads) &&
    rosterUploads.every(
      (upload) =>
        typeof upload === "object" &&
        upload !== null &&
        !Array.isArray(upload) &&
        typeof (upload as Record<string, unknown>).sectionId === "string" &&
        typeof (upload as Record<string, unknown>).content === "string"
    ) &&
    typeof request.confirmed === "boolean" &&
    typeof request.replaceExisting === "boolean"
  );
};

const isAssignmentSetupTermsRequest = (value: unknown): value is AssignmentSetupTermsRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return typeof request.courseFolderId === "string" && typeof request.courseFolderPath === "string";
};

const isAssignmentSetupRequest = (value: unknown): value is AssignmentSetupRequest => {
  if (!isAssignmentSetupTermsRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    typeof request.assignmentTitle === "string" &&
    typeof request.assignmentSlug === "string" &&
    typeof request.termCode === "string" &&
    Array.isArray(request.sectionIds) &&
    request.sectionIds.every((sectionId) => typeof sectionId === "string") &&
    typeof request.templateRepository === "string" &&
    typeof request.templateBranch === "string" &&
    typeof request.dueAt === "string" &&
    typeof request.gradingEnabled === "boolean" &&
    (typeof request.points === "number" || request.points === null) &&
    typeof request.facultyOwner === "string" &&
    typeof request.lmsAssignmentId === "string" &&
    typeof request.gradingCategory === "string" &&
    Array.isArray(request.requiredFiles) &&
    request.requiredFiles.every((file) => typeof file === "string") &&
    Array.isArray(request.rubric) &&
    request.rubric.every(
      (category) =>
        typeof category === "object" &&
        category !== null &&
        typeof (category as Record<string, unknown>).id === "string" &&
        typeof (category as Record<string, unknown>).name === "string" &&
        typeof (category as Record<string, unknown>).points === "number"
    ) &&
    typeof request.confirmed === "boolean" &&
    typeof request.replaceExisting === "boolean"
  );
};

const isAssignmentEditRequest = (value: unknown): value is AssignmentEditRequest => {
  if (!isAssignmentSetupTermsRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    typeof request.assignmentFile === "string" &&
    typeof request.assignmentTitle === "string" &&
    Array.isArray(request.sectionIds) &&
    request.sectionIds.every((section) => typeof section === "string") &&
    typeof request.templateRepository === "string" &&
    typeof request.templateBranch === "string" &&
    typeof request.dueAt === "string" &&
    typeof request.latePolicy === "string" &&
    typeof request.assignmentStatus === "string" &&
    typeof request.gradingEnabled === "boolean" &&
    (typeof request.points === "number" || request.points === null) &&
    typeof request.facultyOwner === "string" &&
    typeof request.lmsAssignmentId === "string" &&
    typeof request.gradingCategory === "string" &&
    (typeof request.gradingMode === "string" || request.gradingMode === null) &&
    (typeof request.gradingPreset === "string" || request.gradingPreset === null) &&
    Array.isArray(request.requiredFiles) &&
    request.requiredFiles.every((file) => typeof file === "string") &&
    Array.isArray(request.rubric) &&
    request.rubric.every(
      (category) =>
        typeof category === "object" &&
        category !== null &&
        typeof (category as Record<string, unknown>).id === "string" &&
        typeof (category as Record<string, unknown>).name === "string" &&
        typeof (category as Record<string, unknown>).points === "number"
    ) &&
    typeof request.originalContent === "string" &&
    typeof request.confirmed === "boolean"
  );
};

const isAssignmentDeleteRequest = (value: unknown): value is AssignmentDeleteRequest => {
  if (!isAssignmentSetupTermsRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return typeof request.assignmentFile === "string" && typeof request.confirmed === "boolean";
};

const isAssignmentGroupConfigRequest = (value: unknown): value is AssignmentGroupConfigRequest =>
  isAssignmentDetailRequest(value);

const isAssignmentGroupConfigSaveRequest = (
  value: unknown
): value is AssignmentGroupConfigSaveRequest => {
  if (!isAssignmentGroupConfigRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    (request.repositoryMode === "individual" || request.repositoryMode === "group") &&
    typeof request.groupsCsv === "string"
  );
};

const isStudentRepositoryAccessPageRequest = (
  value: unknown
): value is StudentRepositoryAccessPageRequest => {
  if (!isAssignmentSetupTermsRequest(value)) return false;
  return typeof (value as unknown as Record<string, unknown>).assignmentFile === "string";
};

const isStudentAccessPagesConfigRequest = (
  value: unknown
): value is StudentAccessPagesConfigRequest => {
  if (!isAssignmentSetupTermsRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    typeof request.repository === "string" &&
    typeof request.baseUrl === "string" &&
    typeof request.branch === "string"
  );
};

const isTemplateWorkflowRequest = (value: unknown): value is TemplateWorkflowRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return (
    (typeof request.templateRepository === "string" || request.templateRepository === null) &&
    (typeof request.templateBranch === "string" || request.templateBranch === null) &&
    (typeof request.workflowPath === "string" || request.workflowPath === null) &&
    typeof request.gradingEnabled === "boolean"
  );
};

const isTemplateWorkflowSaveRequest = (value: unknown): value is TemplateWorkflowSaveRequest => {
  if (!isTemplateWorkflowRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    (typeof request.assignmentSlug === "string" || request.assignmentSlug === null) &&
    typeof request.content === "string" &&
    (typeof request.loadedSha === "string" || request.loadedSha === null) &&
    typeof request.confirmed === "boolean"
  );
};

export const registerIpcHandlers = (): void => {
  const approvedCourseSetupRoots = new Set<string>();
  const processRunner = createNodeProcessRunner({
    graiderCli: app.isPackaged
      ? {
          mode: "bundled",
          appPath: app.getAppPath(),
          execPath: process.execPath
        }
      : {
          mode: "external"
        }
  });
  const isRegisteredAssignmentSetupCourse = (request: AssignmentSetupTermsRequest): boolean =>
    listCourseFolders(getCourseRegistryPath(app.getPath("userData"))).some(
      (courseFolder) =>
        courseFolder.id === request.courseFolderId && courseFolder.path === request.courseFolderPath
    );
  const withRegisteredPagesFolder = (
    request: StudentRepositoryAccessPageRequest
  ): StudentRepositoryAccessPageRequest => {
    return {
      ...request,
      pagesRepositoryFolderPath: getRegisteredPagesRepositoryFolderPath(request.courseFolderId)
    };
  };
  const getRegisteredPagesRepositoryFolderPath = (courseFolderId: string): string | null =>
    listCourseFolders(getCourseRegistryPath(app.getPath("userData"))).find(
      (courseFolder) => courseFolder.id === courseFolderId
    )?.pagesRepositoryFolderPath ?? null;
  const getRegisteredCourseFolderPath = (courseFolderId: unknown): string | null => {
    if (typeof courseFolderId !== "string") return null;
    return (
      listCourseFolders(getCourseRegistryPath(app.getPath("userData"))).find(
        (courseFolder) => courseFolder.id === courseFolderId
      )?.path ?? null
    );
  };

  ipcMain.handle(IPC_CHANNELS.getAppInfo, () => getAppInfo());
  ipcMain.handle(IPC_CHANNELS.getLocalSettings, () =>
    loadLocalSettings(getLocalSettingsPath(app.getPath("userData")))
  );
  ipcMain.handle(IPC_CHANNELS.saveLocalSettings, (_event, username: unknown) => {
    if (typeof username !== "string") throw new Error("Faculty MSOE username is required.");
    return saveCurrentFacultyMsoeUsername(getLocalSettingsPath(app.getPath("userData")), username);
  });
  ipcMain.handle(IPC_CHANNELS.getCoursePublishStatus, async (_event, courseFolderId: unknown) => {
    const courseFolderPath = getRegisteredCourseFolderPath(courseFolderId);
    if (courseFolderPath === null) throw new Error("A registered course folder is required.");
    return await getCoursePublishStatus(courseFolderPath);
  });
  ipcMain.handle(IPC_CHANNELS.publishCourseChanges, async (_event, courseFolderId: unknown) => {
    const courseFolderPath = getRegisteredCourseFolderPath(courseFolderId);
    if (courseFolderPath === null) throw new Error("A registered course folder is required.");
    return await publishCourseChanges(courseFolderPath);
  });

  ipcMain.handle(
    IPC_CHANNELS.checkGitHubAuth,
    async () =>
      await checkGitHubAuth({
        runner: processRunner,
        env: process.env
      })
  );

  ipcMain.handle(IPC_CHANNELS.listCourseFolders, () =>
    listCourseFolders(getCourseRegistryPath(app.getPath("userData")))
  );

  ipcMain.handle(IPC_CHANNELS.removeCourseFolder, (_event, id: unknown) => {
    if (typeof id !== "string") {
      throw new Error("Course folder id is required.");
    }

    removeCourseFolderFromRegistry(getCourseRegistryPath(app.getPath("userData")), id);
  });

  ipcMain.handle(IPC_CHANNELS.selectCourseFolder, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"]
    });

    const selectedFolder = result.canceled ? null : getSelectedFolderPath(result.filePaths);

    if (selectedFolder === null) {
      return {
        canceled: true,
        courseFolder: null
      };
    }

    const selectionResult = addValidatedCourseFolderToRegistry(
      getCourseRegistryPath(app.getPath("userData")),
      selectedFolder
    );

    logDebugDiagnostic(
      `Course folder selection: selectedPath=${selectedFolder} validation=${
        selectionResult.courseFolder === null ? selectionResult.error?.code : "success"
      } registeredPath=${selectionResult.courseFolder?.path ?? ""}`
    );

    return selectionResult;
  });

  ipcMain.handle(
    IPC_CHANNELS.selectStudentAccessPagesRepositoryFolder,
    async (_event, courseFolderId: unknown) => {
      if (typeof courseFolderId !== "string") throw new Error("Course folder id is required.");
      const selected = await dialog.showOpenDialog({ properties: ["openDirectory"] });
      if (selected.canceled) return { canceled: true, folderPath: null };
      const folderPath = getSelectedFolderPath(selected.filePaths);
      if (folderPath === null) return { canceled: true, folderPath: null };
      const registered = setStudentAccessPagesRepositoryFolder(
        getCourseRegistryPath(app.getPath("userData")),
        courseFolderId,
        folderPath
      );
      return registered === null
        ? {
            canceled: false,
            folderPath: null,
            error: {
              code: "pages_folder_invalid",
              message: "Selected Pages repository folder must exist and be a directory.",
              folderPath
            }
          }
        : { canceled: false, folderPath: registered.pagesRepositoryFolderPath ?? null };
    }
  );
  ipcMain.handle(IPC_CHANNELS.selectRepositoryDownloadFolder, async () => {
    const selected = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });
    const folderPath = selected.canceled ? null : getSelectedFolderPath(selected.filePaths);
    return { canceled: folderPath === null, folderPath };
  });

  ipcMain.handle(IPC_CHANNELS.selectCourseSetupFolder, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });
    const selectedFolder = result.canceled ? null : getSelectedFolderPath(result.filePaths);
    if (selectedFolder !== null) approvedCourseSetupRoots.add(selectedFolder);
    return { canceled: selectedFolder === null, courseFolderPath: selectedFolder };
  });

  ipcMain.handle(IPC_CHANNELS.previewCourseSetup, (_event, request: unknown) => {
    if (!isCourseSetupRequest(request) || !approvedCourseSetupRoots.has(request.courseFolderPath))
      throw new Error("Approved course setup request is required.");
    return previewCourseSetup(request);
  });

  ipcMain.handle(IPC_CHANNELS.saveCourseSetup, (_event, request: unknown) => {
    if (!isCourseSetupRequest(request) || !approvedCourseSetupRoots.has(request.courseFolderPath))
      throw new Error("Approved course setup request is required.");
    const result = saveCourseSetup(request);
    if (result.status === "success")
      addValidatedCourseFolderToRegistry(
        getCourseRegistryPath(app.getPath("userData")),
        request.courseFolderPath
      );
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.saveStudentAccessPagesConfig, (_event, request: unknown) => {
    if (!isStudentAccessPagesConfigRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for Student Access Pages settings.");
    return saveStudentAccessPagesConfig(request);
  });

  ipcMain.handle(IPC_CHANNELS.loadAssignmentSetupTerms, (_event, request: unknown) => {
    if (!isAssignmentSetupTermsRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for assignment setup.");
    }
    return loadAssignmentSetupTerms(request.courseFolderPath);
  });

  ipcMain.handle(IPC_CHANNELS.previewAssignmentSetup, async (_event, request: unknown) => {
    if (!isAssignmentSetupRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for assignment setup.");
    }
    const preview = previewAssignmentSetup(request);
    if (preview.status !== "ready") return preview;
    if (request.templateRepository.trim() === "") return saveAssignmentSetup(request);
    const validation = await validateTemplateRepository(
      request.templateRepository,
      request.templateBranch,
      {
        env: process.env,
        runner: processRunner
      }
    );
    const resolvedRequest = {
      ...request,
      templateRepository: validation.repository ?? request.templateRepository,
      templateBranch: validation.branch ?? request.templateBranch
    };
    return validation.valid
      ? {
          ...previewAssignmentSetup(resolvedRequest),
          diagnostics: [...preview.diagnostics, ...validation.diagnostics]
        }
      : {
          ...preview,
          status: "invalid" as const,
          diagnostics: [...preview.diagnostics, ...validation.diagnostics]
        };
  });

  ipcMain.handle(IPC_CHANNELS.saveAssignmentSetup, async (_event, request: unknown) => {
    if (!isAssignmentSetupRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for assignment setup.");
    }
    const localPreview = previewAssignmentSetup(request);
    if (localPreview.status !== "ready")
      return {
        status: "failure" as const,
        writtenFiles: [],
        diagnostics: localPreview.diagnostics
      };
    const validation = await validateTemplateRepository(
      request.templateRepository,
      request.templateBranch,
      { env: process.env, runner: processRunner }
    );
    if (!validation.valid)
      return { status: "failure" as const, writtenFiles: [], diagnostics: validation.diagnostics };
    return saveAssignmentSetup({
      ...request,
      templateRepository: validation.repository ?? request.templateRepository,
      templateBranch: validation.branch ?? request.templateBranch
    });
  });
  ipcMain.handle(IPC_CHANNELS.getAssignmentForEdit, (_event, request: unknown) => {
    if (
      !isAssignmentSetupTermsRequest(request) ||
      typeof (request as unknown as Record<string, unknown>).assignmentFile !== "string" ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("Invalid assignment edit request.");
    return getAssignmentForEdit(
      request.courseFolderPath,
      (request as unknown as Record<string, unknown>).assignmentFile as string
    );
  });
  ipcMain.handle(IPC_CHANNELS.previewAssignmentEdit, async (_event, request: unknown) => {
    if (!isAssignmentEditRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid assignment edit request.");
    const preview = previewAssignmentEdit(request);
    const original = getAssignmentForEdit(request.courseFolderPath, request.assignmentFile).model;
    const changed =
      original !== null &&
      (original.templateRepository !== request.templateRepository ||
        original.templateBranch !== request.templateBranch);
    if (preview.status !== "ready" || !changed || request.templateRepository.trim() === "")
      return preview;
    const validation = await validateTemplateRepository(
      request.templateRepository,
      request.templateBranch,
      { env: process.env, runner: processRunner }
    );
    return validation.valid
      ? {
          ...previewAssignmentEdit({
            ...request,
            templateRepository: validation.repository ?? request.templateRepository,
            templateBranch: validation.branch ?? request.templateBranch
          }),
          diagnostics: [...preview.diagnostics, ...validation.diagnostics]
        }
      : {
          ...preview,
          status: "invalid" as const,
          diagnostics: [...preview.diagnostics, ...validation.diagnostics]
        };
  });
  ipcMain.handle(IPC_CHANNELS.saveAssignmentEdit, async (_event, request: unknown) => {
    if (!isAssignmentEditRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid assignment edit request.");
    const original = getAssignmentForEdit(request.courseFolderPath, request.assignmentFile).model;
    const changed =
      original !== null &&
      (original.templateRepository !== request.templateRepository ||
        original.templateBranch !== request.templateBranch);
    if (changed && request.templateRepository.trim() !== "") {
      const validation = await validateTemplateRepository(
        request.templateRepository,
        request.templateBranch,
        { env: process.env, runner: processRunner }
      );
      if (!validation.valid)
        return {
          status: "failure" as const,
          path: request.assignmentFile,
          diagnostics: validation.diagnostics
        };
      return saveAssignmentEdit({
        ...request,
        templateRepository: validation.repository ?? request.templateRepository,
        templateBranch: validation.branch ?? request.templateBranch
      });
    }
    return saveAssignmentEdit(request);
  });
  ipcMain.handle(IPC_CHANNELS.deleteAssignment, (_event, request: unknown) => {
    if (!isAssignmentDeleteRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid assignment delete request.");
    return deleteAssignment(request);
  });
  ipcMain.handle(IPC_CHANNELS.getAssignmentGroupConfig, (_event, request: unknown) => {
    if (!isAssignmentGroupConfigRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid assignment group settings request.");
    return getAssignmentGroupConfig(request);
  });
  ipcMain.handle(IPC_CHANNELS.saveAssignmentGroupConfig, (_event, request: unknown) => {
    if (!isAssignmentGroupConfigSaveRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid assignment group settings request.");
    return saveAssignmentGroupConfig(request);
  });
  ipcMain.handle(
    IPC_CHANNELS.getStudentRepositoryAccessPageStatus,
    async (_event, request: unknown) => {
      if (
        !isStudentRepositoryAccessPageRequest(request) ||
        !isRegisteredAssignmentSetupCourse(request)
      )
        throw new Error("Invalid student repository access page request.");
      const accessRequest = withRegisteredPagesFolder(request);
      const mappings = await getAssignmentRepositoryMappings({
        ...accessRequest,
        runner: processRunner
      });
      return await getStudentRepositoryAccessPageStatus(accessRequest, mappings);
    }
  );
  ipcMain.handle(
    IPC_CHANNELS.generateStudentRepositoryAccessPage,
    async (_event, request: unknown) => {
      if (
        !isStudentRepositoryAccessPageRequest(request) ||
        !isRegisteredAssignmentSetupCourse(request)
      )
        throw new Error("Invalid student repository access page request.");
      const accessRequest = withRegisteredPagesFolder(request);
      const mappings = await getAssignmentRepositoryMappings({
        ...accessRequest,
        runner: processRunner
      });
      return await generateStudentRepositoryAccessPage(accessRequest, mappings);
    }
  );
  ipcMain.handle(
    IPC_CHANNELS.getStudentRepositoryAccessPagePublishStatus,
    async (_event, request: unknown) => {
      if (
        !isStudentRepositoryAccessPageRequest(request) ||
        !isRegisteredAssignmentSetupCourse(request)
      )
        throw new Error("Invalid student repository access page publish status request.");
      const accessRequest = withRegisteredPagesFolder(request);
      const mappings = await getAssignmentRepositoryMappings({
        ...accessRequest,
        runner: processRunner
      });
      return await getStudentRepositoryAccessPagePublishStatus(accessRequest, mappings);
    }
  );
  ipcMain.handle(
    IPC_CHANNELS.publishStudentRepositoryAccessPage,
    async (_event, request: unknown) => {
      if (
        !isStudentRepositoryAccessPageRequest(request) ||
        !isRegisteredAssignmentSetupCourse(request)
      )
        throw new Error("Invalid student repository access page publish request.");
      const accessRequest = withRegisteredPagesFolder(request);
      const mappings = await getAssignmentRepositoryMappings({
        ...accessRequest,
        runner: processRunner
      });
      return await publishStudentRepositoryAccessPage(accessRequest, mappings);
    }
  );

  ipcMain.handle(IPC_CHANNELS.loadRosterTerms, (_event, request: unknown) => {
    if (!isAssignmentSetupTermsRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    return loadRosterTerms(request.courseFolderPath);
  });

  ipcMain.handle(IPC_CHANNELS.getRosterForSection, (_event, request: unknown) => {
    if (!isRosterSectionRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    return getRosterForSection(request);
  });

  ipcMain.handle(IPC_CHANNELS.previewRosterSave, (_event, request: unknown) => {
    if (!isRosterSaveRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    return previewRosterSave(request);
  });

  ipcMain.handle(IPC_CHANNELS.saveRoster, async (_event, request: unknown) => {
    if (!isRosterSaveRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    return await saveRosterWithStudentRepositoryAccessPageRefresh(request, {
      runner: processRunner,
      pagesRepositoryFolderPath: getRegisteredPagesRepositoryFolderPath(request.courseFolderId)
    });
  });
  ipcMain.handle(IPC_CHANNELS.removeRoster, async (_event, request: unknown) => {
    if (!isRosterRemoveRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    return await removeRosterWithStudentRepositoryAccessPageRefresh(request, {
      runner: processRunner,
      pagesRepositoryFolderPath: getRegisteredPagesRepositoryFolderPath(request.courseFolderId)
    });
  });
  ipcMain.handle(IPC_CHANNELS.removeSection, async (_event, request: unknown) => {
    if (!isRosterRemoveRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    return await removeSectionWithStudentRepositoryAccessPageRefresh(request, {
      runner: processRunner,
      pagesRepositoryFolderPath: getRegisteredPagesRepositoryFolderPath(request.courseFolderId)
    });
  });

  ipcMain.handle(IPC_CHANNELS.getTemplateWorkflow, async (_event, request: unknown) => {
    if (!isTemplateWorkflowRequest(request))
      throw new Error("Template workflow request is required.");
    return await getTemplateWorkflow(request, { env: process.env, runner: processRunner });
  });

  ipcMain.handle(IPC_CHANNELS.previewTemplateWorkflowSave, async (_event, request: unknown) => {
    if (!isTemplateWorkflowSaveRequest(request))
      throw new Error("Template workflow save request is required.");
    return await previewTemplateWorkflowSave(request, { env: process.env, runner: processRunner });
  });

  ipcMain.handle(IPC_CHANNELS.saveTemplateWorkflow, async (_event, request: unknown) => {
    if (!isTemplateWorkflowSaveRequest(request))
      throw new Error("Template workflow save request is required.");
    return await saveTemplateWorkflow(request, { env: process.env, runner: processRunner });
  });

  ipcMain.handle(IPC_CHANNELS.refreshCourseFolder, async (_event, id: unknown) => {
    if (typeof id !== "string") {
      throw new Error("Course folder id is required.");
    }

    return await refreshCourseFolder(getCourseRegistryPath(app.getPath("userData")), id, {
      runner: processRunner,
      env: process.env
    });
  });

  ipcMain.handle(
    IPC_CHANNELS.refreshDashboard,
    async () =>
      await refreshDashboard(getCourseRegistryPath(app.getPath("userData")), {
        runner: processRunner,
        env: process.env
      })
  );

  ipcMain.handle(IPC_CHANNELS.getAssignmentDetail, async (_event, request: unknown) => {
    if (!isAssignmentDetailRequest(request)) {
      throw new Error("Assignment detail request is required.");
    }

    return await getAssignmentDetail(request, {
      runner: processRunner,
      env: process.env
    });
  });
  ipcMain.handle(IPC_CHANNELS.prepareGradingWorkspace, (_event, request: unknown) => {
    if (!isPrepareGradingWorkspaceRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for grading preparation.");
    return prepareGradingWorkspace({
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.loadGradingStudentSource, (_event, request: unknown) => {
    if (!isLoadGradingStudentSourceRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for grading source loading.");
    return loadGradingStudentSource({
      courseFolderId: request.courseFolderId,
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId: request.studentId,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.loadGradingStudentViewState, (_event, request: unknown) => {
    if (!isGradingStudentViewStateRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for grading view-state loading.");
    return loadGradingStudentViewState({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.saveGradingStudentViewState, (_event, request: unknown) => {
    if (
      !isSaveGradingStudentViewStateRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for grading view-state saving.");
    return saveGradingStudentViewState({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.clearGradingStudentViewState, (_event, request: unknown) => {
    if (!isGradingStudentViewStateRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for grading view-state clearing.");
    return clearGradingStudentViewState({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.loadGradingStudentSnapshot, (_event, request: unknown) => {
    if (!isGradingStudentViewStateRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for grading snapshot loading.");
    return loadGradingStudentSnapshot({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.loadGradingStudentEvidence, (_event, request: unknown) => {
    if (
      !isLoadGradingStudentEvidenceRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for grading evidence loading.");
    return loadGradingStudentEvidence({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.loadGradingStudentCommitHistory, (_event, request: unknown) => {
    if (
      !isLoadGradingStudentCommitHistoryRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for grading commit-history loading.");
    return loadGradingStudentCommitHistory({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.markGradingStudentComplete, (_event, request: unknown) => {
    if (
      !isMarkGradingStudentCompleteRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for marking grading complete.");
    return markGradingStudentComplete({ ...request, userDataPath: app.getPath("userData") });
  });
  ipcMain.handle(IPC_CHANNELS.publishGradingStudentReport, (_event, request: unknown) => {
    if (
      !isPublishGradingStudentReportRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for publishing a grading report.");
    return publishGradingStudentReport({ ...request, userDataPath: app.getPath("userData") });
  });
  ipcMain.handle(IPC_CHANNELS.bulkPublishGradingStudentReports, (_event, request: unknown) => {
    if (
      !isBulkPublishGradingStudentReportsRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for publishing grading reports.");
    return bulkPublishGradingStudentReports({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.addGradingStudentComment, (_event, request: unknown) => {
    if (!isAddGradingStudentCommentRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder and a valid grading comment are required.");
    return addGradingStudentComment({ ...request, userDataPath: app.getPath("userData") });
  });
  ipcMain.handle(IPC_CHANNELS.editGradingStudentComment, (_event, request: unknown) => {
    if (!isEditGradingStudentCommentRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder and a valid grading comment are required.");
    return editGradingStudentComment({ ...request, userDataPath: app.getPath("userData") });
  });
  ipcMain.handle(IPC_CHANNELS.deleteGradingStudentComment, (_event, request: unknown) => {
    if (
      !isDeleteGradingStudentCommentRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder and a valid grading comment are required.");
    return deleteGradingStudentComment({ ...request, userDataPath: app.getPath("userData") });
  });
  ipcMain.handle(IPC_CHANNELS.addGradingStudentManualAdjustment, (_event, request: unknown) => {
    if (
      !isAddGradingStudentManualAdjustmentRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder and a valid manual adjustment are required.");
    return addGradingStudentManualAdjustment({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.editGradingStudentManualAdjustment, (_event, request: unknown) => {
    if (
      !isEditGradingStudentManualAdjustmentRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder and a valid manual adjustment are required.");
    return editGradingStudentManualAdjustment({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.deleteGradingStudentManualAdjustment, (_event, request: unknown) => {
    if (
      !isDeleteGradingStudentManualAdjustmentRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder and a valid manual adjustment are required.");
    return deleteGradingStudentManualAdjustment({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.loadGradingCommentLibrary, (_event, request: unknown) => {
    if (!isLoadGradingCommentLibraryRequest(request))
      throw new Error(
        "A registered course and valid term are required for comment-library loading."
      );
    const courseFolderPath = getRegisteredCourseFolderPath(request.courseFolderId);
    if (courseFolderPath === null) throw new Error("A registered course folder is required.");
    return loadGradingCommentLibrary({
      courseFolderPath,
      termCode: request.termCode,
      userDataPath: app.getPath("userData")
    });
  });
  ipcMain.handle(IPC_CHANNELS.createGradingLibraryComment, (_event, request: unknown) => {
    if (!isCreateGradingLibraryCommentRequest(request))
      throw new Error("A registered course and valid reusable comment are required.");
    const courseFolderPath = getRegisteredCourseFolderPath(request.courseFolderId);
    if (courseFolderPath === null) throw new Error("A registered course folder is required.");
    return createGradingLibraryComment({
      courseFolderPath,
      termCode: request.termCode,
      userDataPath: app.getPath("userData"),
      comment: request.comment
    });
  });
  ipcMain.handle(IPC_CHANNELS.editGradingLibraryComment, (_event, request: unknown) => {
    if (!isEditGradingLibraryCommentRequest(request))
      throw new Error("A registered course and valid reusable comment are required.");
    const courseFolderPath = getRegisteredCourseFolderPath(request.courseFolderId);
    if (courseFolderPath === null) throw new Error("A registered course folder is required.");
    return editGradingLibraryComment({
      courseFolderPath,
      termCode: request.termCode,
      userDataPath: app.getPath("userData"),
      commentId: request.commentId,
      replacement: request.replacement
    });
  });
  ipcMain.handle(IPC_CHANNELS.deleteGradingLibraryComment, (_event, request: unknown) => {
    if (!isDeleteGradingLibraryCommentRequest(request))
      throw new Error("A registered course and reusable comment ID are required.");
    const courseFolderPath = getRegisteredCourseFolderPath(request.courseFolderId);
    if (courseFolderPath === null) throw new Error("A registered course folder is required.");
    return deleteGradingLibraryComment({
      courseFolderPath,
      termCode: request.termCode,
      userDataPath: app.getPath("userData"),
      commentId: request.commentId
    });
  });

  registerAssignmentTemplateSyncIpc(
    ipcMain,
    assignmentTemplateSyncService,
    isRegisteredAssignmentSetupCourse
  );

  ipcMain.handle(IPC_CHANNELS.getAssignmentApplyPreview, async (_event, request: unknown) => {
    if (!isAssignmentApplyPreviewRequest(request)) {
      throw new Error("Assignment apply preview request is required.");
    }

    return await getAssignmentApplyPreview(request, {
      runner: processRunner,
      env: process.env
    });
  });

  ipcMain.handle(IPC_CHANNELS.getAssignmentGradePreview, async (_event, request: unknown) => {
    if (!isAssignmentGradePreviewRequest(request)) {
      throw new Error("Assignment grade preview request is required.");
    }

    return await getAssignmentGradePreview(request, {
      runner: processRunner,
      env: process.env
    });
  });

  ipcMain.handle(IPC_CHANNELS.getAssignmentGradeStatus, async (_event, request: unknown) => {
    if (!isAssignmentGradeStatusRequest(request)) {
      throw new Error("Assignment grade status request is required.");
    }

    return await getAssignmentGradeStatus(request, {
      runner: processRunner,
      env: process.env
    });
  });

  ipcMain.handle(IPC_CHANNELS.getFacultyReport, async (_event, request: unknown) => {
    if (!isFacultyReportRequest(request)) {
      throw new Error("Faculty report request is required.");
    }

    return await getFacultyReport(request, {
      runner: processRunner,
      env: process.env
    });
  });

  ipcMain.handle(IPC_CHANNELS.applyAssignment, async (_event, request: unknown) => {
    if (!isAssignmentApplyRequest(request)) {
      throw new Error("Assignment apply request is required.");
    }

    return await applyAssignmentWithStudentRepositoryAccessPage(request, {
      runner: processRunner,
      env: process.env,
      pagesRepositoryFolderPath:
        withRegisteredPagesFolder(request).pagesRepositoryFolderPath ?? null
    });
  });
  ipcMain.handle(IPC_CHANNELS.downloadAssignmentRepositories, async (_event, request: unknown) => {
    if (!isAssignmentRepositoryDownloadRequest(request))
      throw new Error("Assignment download request is required.");
    const result = await processRunner({
      command: "graider",
      args: [
        "assignment",
        "download-repositories",
        request.assignmentFile,
        "--destination",
        request.destination,
        "--json"
      ],
      cwd: request.courseFolderPath,
      env: process.env
    });
    if (result.error !== null) throw new Error("Repository download command could not be started.");
    try {
      const parsed = JSON.parse(result.stdout) as {
        targets?: { status?: string; localPath?: string; studentIds?: string[] }[];
      };
      const match = request.assignmentFile
        .replaceAll("\\", "/")
        .match(
          /^terms\/(\d{2}s[123])\/assignments\/([A-Za-z0-9][A-Za-z0-9._-]*)\/assignment\.yml$/u
        );
      if (match !== null)
        recordSuccessfulDownloadLocators(
          getLocalRepositoryLocatorPath(app.getPath("userData")),
          {
            courseFolderId: request.courseFolderId,
            termCode: match[1] ?? "",
            assignmentSlug: match[2] ?? ""
          },
          parsed.targets ?? []
        );
      return parsed as unknown;
    } catch {
      throw new Error("Repository download returned invalid JSON.");
    }
  });

  ipcMain.handle(IPC_CHANNELS.gradeAssignment, async (_event, request: unknown) => {
    if (!isAssignmentGradeRequest(request)) {
      throw new Error("Assignment grade request is required.");
    }

    return await gradeAssignment(request, {
      runner: processRunner,
      env: process.env
    });
  });
};

export const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: "Graider",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  registerRendererDiagnostics(window);

  if (isDebugEnabled()) {
    window.webContents.openDevTools({ mode: "detach" });
  }

  loadRenderer(window);

  return window;
};

registerIpcHandlers();

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
