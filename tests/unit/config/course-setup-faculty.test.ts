import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { saveCourseSetup } from "../../../ui/electron/courseSetupService.js";
import { loadTermConfig } from "../../../src/config/load-term-config.js";

describe("course setup faculty mappings", () => {
  it("reloads generated faculty mappings through the canonical term config loader", () => {
    const courseFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), "graider-course-faculty-"));
    const result = saveCourseSetup({
      courseFolderPath,
      courseTitle: "Data Structures",
      courseCode: "csc1120",
      githubOrganization: "graider-sandbox",
      termCode: "27s1",
      sections: [
        { id: "001", faculty: [" jones ", "smith"] },
        { id: "002", faculty: ["jones"] }
      ],
      rosterUploads: [],
      confirmed: true,
      replaceExisting: false
    });

    expect(result.status).toBe("success");
    const loaded = loadTermConfig(path.join(courseFolderPath, "terms/27s1/term.yml"));
    expect(loaded.status).toBe("success");
    if (loaded.status === "failure") {
      throw new Error("Expected generated term.yml to load.");
    }
    expect(loaded.value.sections).toEqual([
      { id: "001", roster: "rosters/section-001.csv", faculty: ["jones", "smith"] },
      { id: "002", roster: "rosters/section-002.csv", faculty: ["jones"] }
    ]);
  });
});
