import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createRosterSaveDependencies } from "./rosterProvenanceService";

describe("roster provenance service", () => {
  it("resolves the trusted current faculty identity and injected save clock", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-roster-provenance-"));
    const settingsPath = path.join(root, "local-settings.json");
    fs.writeFileSync(settingsPath, '{"currentFacultyMsoeUsername":"jones"}\n', "utf8");
    const instant = new Date("2026-09-22T22:00:00.000Z");

    const dependencies = createRosterSaveDependencies(settingsPath, () => instant);

    expect(dependencies.updatedBy).toBe("jones");
    expect(dependencies.now?.()).toBe(instant);
  });

  it("uses null when no faculty identity is configured", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-roster-provenance-"));
    expect(createRosterSaveDependencies(path.join(root, "missing.json")).updatedBy).toBeNull();
  });
});
