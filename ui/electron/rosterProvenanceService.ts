import { loadLocalSettings } from "./localSettings.js";
import type { RosterSaveDependencies } from "./rosterManagerService.js";

export const createRosterSaveDependencies = (
  settingsPath: string,
  now: () => Date = () => new Date()
): RosterSaveDependencies => ({
  updatedBy: loadLocalSettings(settingsPath).currentFacultyMsoeUsername,
  now
});
