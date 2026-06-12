import { BrowserWindow, app, dialog, ipcMain } from "electron";
import { applyAssignment } from "./assignmentApplyRunner.js";
import { gradeAssignment } from "./assignmentGradeRunner.js";
import { getAssignmentApplyPreview } from "./assignmentApplyPreviewRunner.js";
import { getAssignmentGradePreview } from "./assignmentGradePreviewRunner.js";
import { getAssignmentGradeStatus } from "./assignmentGradeStatusRunner.js";
import { createNodeProcessRunner } from "./commandRunner.js";
import { getAssignmentDetail } from "./assignmentDetailRunner.js";
import { getFacultyReport } from "./facultyReportRunner.js";
import {
  addCourseFolderToRegistry,
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
  type FacultyReportRequest
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

  const request = value as Record<string, unknown>;

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

export const registerIpcHandlers = (): void => {
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

  ipcMain.handle(IPC_CHANNELS.getAppInfo, () => getAppInfo());

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

    return {
      canceled: false,
      courseFolder: addCourseFolderToRegistry(
        getCourseRegistryPath(app.getPath("userData")),
        selectedFolder
      )
    };
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
