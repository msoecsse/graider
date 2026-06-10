import path from "node:path";
import { BrowserWindow, app, dialog, ipcMain } from "electron";
import {
  addCourseFolderToRegistry,
  getCourseRegistryPath,
  getSelectedFolderPath,
  listCourseFolders,
  removeCourseFolderFromRegistry
} from "./courseRegistry.js";
import { IPC_CHANNELS, type AppInfo } from "./ipc.js";

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

export const getRendererEntry = (): string =>
    path.join(__dirname, "..", "dist", "index.html");

export const getRendererDevServerUrl = (
    env: NodeJS.ProcessEnv = process.env
): string | undefined => {
  const configuredUrl = env[VITE_DEV_SERVER_URL_ENV]?.trim();

  return configuredUrl === undefined || configuredUrl.length === 0 ? undefined : configuredUrl;
};

export const registerIpcHandlers = (): void => {
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