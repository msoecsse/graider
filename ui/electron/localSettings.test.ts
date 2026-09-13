import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getLocalSettingsPath,
  loadLocalSettings,
  saveCurrentFacultyMsoeUsername
} from "./localSettings";

describe("local settings", () => {
  it("keeps missing legacy settings valid and persists a trimmed faculty MSOE username", () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "graider-local-settings-"));
    const settingsPath = getLocalSettingsPath(userDataPath);
    expect(loadLocalSettings(settingsPath)).toEqual({ currentFacultyMsoeUsername: null });

    saveCurrentFacultyMsoeUsername(settingsPath, " jones ");
    expect(loadLocalSettings(settingsPath)).toEqual({ currentFacultyMsoeUsername: "jones" });
  });

  it("changes or clears the identity without losing unrelated local settings", () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "graider-local-settings-"));
    const settingsPath = getLocalSettingsPath(userDataPath);
    fs.writeFileSync(
      settingsPath,
      '{"unrelatedSetting":"keep","currentFacultyMsoeUsername":"smith"}\n'
    );

    saveCurrentFacultyMsoeUsername(settingsPath, "jones");
    expect(loadLocalSettings(settingsPath)).toEqual({ currentFacultyMsoeUsername: "jones" });
    expect(fs.readFileSync(settingsPath, "utf8")).toContain('"unrelatedSetting": "keep"');
    saveCurrentFacultyMsoeUsername(settingsPath, "   ");
    expect(loadLocalSettings(settingsPath)).toEqual({ currentFacultyMsoeUsername: null });
    expect(fs.readFileSync(settingsPath, "utf8")).not.toContain("currentFacultyMsoeUsername");
  });
});
