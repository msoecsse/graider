import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { describe, expect, it, vi } from "vitest";
import {
  getLocalSettingsPath,
  loadLastChooserDirectory,
  saveLastChooserDirectory
} from "./localSettings";
import { selectNativeDirectory } from "./nativeDirectoryChooser";

const createSettingsPath = (): string =>
  getLocalSettingsPath(fs.mkdtempSync(path.join(os.tmpdir(), "graider-directory-chooser-")));

const selectDirectory = async (
  settingsPath: string,
  result: OpenDialogReturnValue
): Promise<{ selectedDirectory: string | null; options: OpenDialogOptions }> => {
  const showOpenDialog = vi.fn<(options: OpenDialogOptions) => Promise<OpenDialogReturnValue>>();
  showOpenDialog.mockResolvedValue(result);
  const selectedDirectory = await selectNativeDirectory({
    properties: ["openDirectory"],
    settingsPath,
    showOpenDialog
  });
  return { selectedDirectory, options: showOpenDialog.mock.calls[0]?.[0] as OpenDialogOptions };
};

describe("native directory chooser", () => {
  it("uses a valid saved directory as the dialog default path and saves a successful selection", async () => {
    const settingsPath = createSettingsPath();
    const defaultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "graider-default-directory-"));
    const selectedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "graider-selected-directory-"));
    saveLastChooserDirectory(settingsPath, defaultDirectory);

    const result = await selectDirectory(settingsPath, {
      canceled: false,
      filePaths: [selectedDirectory]
    });

    expect(result.options).toEqual({
      properties: ["openDirectory"],
      defaultPath: defaultDirectory
    });
    expect(result.selectedDirectory).toBe(selectedDirectory);
    expect(loadLastChooserDirectory(settingsPath)).toBe(selectedDirectory);
  });

  it("returns the existing cancellation shape without changing the saved directory", async () => {
    const settingsPath = createSettingsPath();
    const savedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "graider-saved-directory-"));
    saveLastChooserDirectory(settingsPath, savedDirectory);

    const result = await selectDirectory(settingsPath, { canceled: true, filePaths: [] });

    expect(result.selectedDirectory).toBeNull();
    expect(loadLastChooserDirectory(settingsPath)).toBe(savedDirectory);
  });

  it("ignores a nonexistent saved directory and opens the dialog without a default path", async () => {
    const settingsPath = createSettingsPath();
    saveLastChooserDirectory(
      settingsPath,
      path.join(os.tmpdir(), "graider-directory-that-does-not-exist")
    );

    const result = await selectDirectory(settingsPath, { canceled: true, filePaths: [] });

    expect(result.options).toEqual({ properties: ["openDirectory"] });
    expect(result.selectedDirectory).toBeNull();
  });
});
