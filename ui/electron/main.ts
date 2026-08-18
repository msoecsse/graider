import { BrowserWindow, app, dialog, ipcMain } from "electron";
import { applyAssignment } from "./assignmentApplyRunner.js";
import { gradeAssignment } from "./assignmentGradeRunner.js";
import { getAssignmentApplyPreview } from "./assignmentApplyPreviewRunner.js";
import { getAssignmentGradePreview } from "./assignmentGradePreviewRunner.js";
import { getAssignmentGradeStatus } from "./assignmentGradeStatusRunner.js";
import { createNodeProcessRunner } from "./commandRunner.js";
import { getAssignmentDetail } from "./assignmentDetailRunner.js";
import { getFacultyReport } from "./facultyReportRunner.js";
import { previewCourseSetup, saveCourseSetup } from "./courseSetupService.js";
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
import { getStudentRepoEmailPreview } from "./studentRepoEmailPreviewService.js";
import { getStudentRepoEmailSendHistory } from "./studentRepoEmailNotificationLogService.js";
import { getStudentRepoEmailTransportStatus } from "./studentRepoEmailTransportStatusService.js";
import {
  getRosterForSection,
  loadRosterTerms,
  previewRosterSave,
  saveRoster
} from "./rosterManagerService.js";
import { checkGitHubAuth } from "./githubAuthChecker.js";
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
  removeCourseFolderFromRegistry
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
  type StudentRepoEmailPreviewRequest,
  type RosterSaveRequest,
  type RosterSectionRequest,
  type TemplateWorkflowRequest,
  type TemplateWorkflowSaveRequest
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
    typeof request.termCode === "string" &&
    Array.isArray(request.sectionIds) &&
    request.sectionIds.every((sectionId) => typeof sectionId === "string") &&
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
    typeof request.points === "number" &&
    typeof request.gradingCategory === "string" &&
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
    typeof request.points === "number" &&
    typeof request.gradingCategory === "string" &&
    typeof request.originalContent === "string" &&
    typeof request.confirmed === "boolean"
  );
};

const isStudentRepoEmailPreviewRequest = (
  value: unknown
): value is StudentRepoEmailPreviewRequest => {
  if (!isAssignmentSetupTermsRequest(value)) return false;
  return typeof (value as unknown as Record<string, unknown>).assignmentFile === "string";
};

const isRosterSectionRequest = (value: unknown): value is RosterSectionRequest => {
  if (!isAssignmentSetupTermsRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return typeof request.termCode === "string" && typeof request.sectionId === "string";
};

const isRosterSaveRequest = (value: unknown): value is RosterSaveRequest => {
  if (!isRosterSectionRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    Array.isArray(request.rows) &&
    request.rows.every(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        !Array.isArray(row) &&
        [
          "studentId",
          "githubUsername",
          "email",
          "firstName",
          "lastName",
          "section",
          "status"
        ].every((key) => typeof (row as Record<string, unknown>)[key] === "string")
    ) &&
    typeof request.confirmed === "boolean"
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

  ipcMain.handle(IPC_CHANNELS.getAppInfo, () => getAppInfo());

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

  ipcMain.handle(IPC_CHANNELS.loadAssignmentSetupTerms, (_event, request: unknown) => {
    if (!isAssignmentSetupTermsRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for assignment setup.");
    }
    return loadAssignmentSetupTerms(request.courseFolderPath);
  });

  ipcMain.handle(IPC_CHANNELS.previewAssignmentSetup, (_event, request: unknown) => {
    if (!isAssignmentSetupRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for assignment setup.");
    }
    return previewAssignmentSetup(request);
  });

  ipcMain.handle(IPC_CHANNELS.saveAssignmentSetup, (_event, request: unknown) => {
    if (!isAssignmentSetupRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for assignment setup.");
    }
    return saveAssignmentSetup(request);
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
  ipcMain.handle(IPC_CHANNELS.previewAssignmentEdit, (_event, request: unknown) => {
    if (!isAssignmentEditRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid assignment edit request.");
    return previewAssignmentEdit(request);
  });
  ipcMain.handle(IPC_CHANNELS.saveAssignmentEdit, (_event, request: unknown) => {
    if (!isAssignmentEditRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid assignment edit request.");
    return saveAssignmentEdit(request);
  });
  ipcMain.handle(IPC_CHANNELS.getStudentRepoEmailPreview, (_event, request: unknown) => {
    if (!isStudentRepoEmailPreviewRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid student repository email preview request.");
    return getStudentRepoEmailPreview(request);
  });
  ipcMain.handle(IPC_CHANNELS.getStudentRepoEmailSendHistory, (_event, request: unknown) => {
    if (!isStudentRepoEmailPreviewRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid student repository email history request.");
    const loaded = getAssignmentForEdit(request.courseFolderPath, request.assignmentFile);
    if (loaded.model === null) {
      return {
        status: "invalid" as const,
        path: "",
        exists: false,
        assignmentFile: request.assignmentFile,
        sender: null,
        transport: null,
        createdAt: null,
        updatedAt: null,
        messages: [],
        diagnostics: loaded.diagnostics
      };
    }
    return getStudentRepoEmailSendHistory(
      request.courseFolderPath,
      request.assignmentFile,
      loaded.model.termCode,
      loaded.model.assignmentSlug
    );
  });
  ipcMain.handle(IPC_CHANNELS.getStudentRepoEmailTransportStatus, (_event, request: unknown) => {
    if (!isStudentRepoEmailPreviewRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid student repository email transport status request.");
    return getStudentRepoEmailTransportStatus();
  });

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

  ipcMain.handle(IPC_CHANNELS.saveRoster, (_event, request: unknown) => {
    if (!isRosterSaveRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    return saveRoster(request);
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

    return await applyAssignment(request, {
      runner: processRunner,
      env: process.env
    });
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
