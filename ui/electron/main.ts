import path from "node:path";
import { BrowserWindow, app, dialog, ipcMain } from "electron";
import { getAssignmentApplyPreview } from "./assignmentApplyPreviewRunner.js";
import { createNodeProcessRunner } from "./commandRunner.js";
import { getAssignmentDetail } from "./assignmentDetailRunner.js";
import {
  addCourseFolderToRegistry,
  getCourseRegistryPath,
  getSelectedFolderPath,
  listCourseFolders,
  removeCourseFolderFromRegistry
} from "./courseRegistry.js";
import { refreshCourseFolder, refreshDashboard } from "./dashboardRunner.js";
import {
  IPC_CHANNELS,
  type AppInfo,
  type AssignmentApplyPreviewRequest,
  type AssignmentDetailRequest
} from "./ipc.js";

const DEFAULT_WINDOW_WIDTH = 1180;
const DEFAULT_WINDOW_HEIGHT = 760;
const MIN_WINDOW_WIDTH = 860;
const MIN_WINDOW_HEIGHT = 620;
const VITE_DEV_SERVER_URL_ENV = "VITE_DEV_SERVER_URL";

export const getAppInfo = (): AppInfo => ({
  name: app.getName(),
  version: app.getVersion()
});

export const getPreloadPath = (): string => path.join(__dirname, "preload.js");

export const getRendererEntry = (): string => path.join(__dirname, "..", "dist", "index.html");

export const getRendererDevServerUrl = (
  env: NodeJS.ProcessEnv = process.env
): string | undefined => {
  const configuredUrl = env[VITE_DEV_SERVER_URL_ENV]?.trim();

  return configuredUrl === undefined || configuredUrl.length === 0 ? undefined : configuredUrl;
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

export const registerIpcHandlers = (): void => {
  const processRunner = createNodeProcessRunner();

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

  const devServerUrl = getRendererDevServerUrl();

  if (devServerUrl === undefined) {
    void window.loadFile(getRendererEntry());
  } else {
    void window.loadURL(devServerUrl);
  }

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
