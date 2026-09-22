import fs from "node:fs";
import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { getSelectedFolderPath } from "./courseRegistry.js";
import { loadLastChooserDirectory, saveLastChooserDirectory } from "./localSettings.js";

interface NativeDirectoryChooserOptions {
  readonly properties: OpenDialogOptions["properties"];
  readonly settingsPath: string;
  readonly showOpenDialog: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>;
}

const isExistingDirectory = (directory: string): boolean => {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
};

export const selectNativeDirectory = async ({
  properties,
  settingsPath,
  showOpenDialog
}: NativeDirectoryChooserOptions): Promise<string | null> => {
  const savedDirectory = loadLastChooserDirectory(settingsPath);
  const defaultPath =
    savedDirectory !== null && isExistingDirectory(savedDirectory) ? savedDirectory : null;
  const result = await showOpenDialog({
    properties,
    ...(defaultPath === null ? {} : { defaultPath })
  });
  const selectedDirectory = result.canceled ? null : getSelectedFolderPath(result.filePaths);

  if (selectedDirectory !== null) saveLastChooserDirectory(settingsPath, selectedDirectory);
  return selectedDirectory;
};
