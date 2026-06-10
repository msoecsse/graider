import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type AppInfo,
  type CourseFolderRecord,
  type GraiderUIApi,
  type SelectCourseFolderResult
} from "./ipc.js";

const invoke = async <T>(channel: string, ...args: readonly unknown[]): Promise<T> =>
  (await ipcRenderer.invoke(channel, ...args)) as T;

const graiderUI: GraiderUIApi = {
  getAppInfo: async (): Promise<AppInfo> => await invoke<AppInfo>(IPC_CHANNELS.getAppInfo),
  selectCourseFolder: async (): Promise<SelectCourseFolderResult> =>
    await invoke<SelectCourseFolderResult>(IPC_CHANNELS.selectCourseFolder),
  listCourseFolders: async (): Promise<CourseFolderRecord[]> =>
    await invoke<CourseFolderRecord[]>(IPC_CHANNELS.listCourseFolders),
  removeCourseFolder: async (id: string): Promise<void> => {
    await invoke<void>(IPC_CHANNELS.removeCourseFolder, id);
  }
};

contextBridge.exposeInMainWorld("graiderUI", graiderUI);
