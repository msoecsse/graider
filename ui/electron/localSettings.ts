import fs from "node:fs";
import path from "node:path";

export const LOCAL_SETTINGS_FILE_NAME = "local-settings.json";

export interface LocalSettings {
  readonly currentFacultyMsoeUsername: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readSettings = (settingsPath: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const getLocalSettingsPath = (userDataPath: string): string =>
  path.join(userDataPath, LOCAL_SETTINGS_FILE_NAME);

export const loadLocalSettings = (settingsPath: string): LocalSettings => {
  const value = readSettings(settingsPath).currentFacultyMsoeUsername;
  return {
    currentFacultyMsoeUsername: typeof value === "string" && value.trim() !== "" ? value : null
  };
};

export const saveCurrentFacultyMsoeUsername = (
  settingsPath: string,
  value: string
): LocalSettings => {
  const settings = readSettings(settingsPath);
  const username = value.trim();
  if (username === "") delete settings.currentFacultyMsoeUsername;
  else settings.currentFacultyMsoeUsername = username;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, undefined, 2)}\n`, "utf8");
  return loadLocalSettings(settingsPath);
};
