import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getLocalSettingsPath,
  saveCurrentFacultyMsoeUsername
} from "../../../ui/electron/localSettings.js";
import { resolveFacultyScopeContext } from "../../../src/faculty/faculty-scope-context.js";
import { createFacultyScopeService } from "../../../ui/electron/facultyScopeService.js";

const temporaryPaths: string[] = [];

const createCourse = (
  rosterContents: string
): { courseFolderPath: string; userDataPath: string } => {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graider-faculty-scope-"));
  temporaryPaths.push(rootPath);
  const courseFolderPath = path.join(rootPath, "course");
  const userDataPath = path.join(rootPath, "user-data");
  fs.mkdirSync(path.join(courseFolderPath, "terms/27s1/rosters"), { recursive: true });
  fs.writeFileSync(
    path.join(courseFolderPath, "terms/27s1/term.yml"),
    [
      "schema_version: 1",
      "term:",
      "  code: 27s1",
      "  academic_year: 2027",
      "  semester: 1",
      "  display_name: Spring 2027",
      "sections:",
      '  - id: "001"',
      "    roster: rosters/001.csv",
      "    faculty:",
      "      - jones",
      '  - id: "002"',
      "    roster: rosters/002.csv",
      "    faculty:",
      "      - smith"
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(courseFolderPath, "terms/27s1/rosters/001.csv"),
    rosterContents,
    "utf8"
  );
  fs.writeFileSync(
    path.join(courseFolderPath, "terms/27s1/rosters/002.csv"),
    "student_id,github_username,section,status\nstudent2,student2hub,002,active\n",
    "utf8"
  );
  return { courseFolderPath, userDataPath };
};

const requestFor = (paths: { courseFolderPath: string; userDataPath: string }) => ({
  ...paths,
  termCode: "27s1"
});

afterEach(() => {
  for (const temporaryPath of temporaryPaths.splice(0)) {
    fs.rmSync(temporaryPath, { recursive: true, force: true });
  }
});

describe("current faculty scope service", () => {
  it("reads the persisted faculty identity and resolves canonical term rosters", () => {
    const paths = createCourse(
      "student_id,github_username,section,status\nstudent1,student1hub,001,active\n"
    );
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(paths.userDataPath), " jones ");

    expect(
      createFacultyScopeService({ resolveFacultyScopeContext })(requestFor(paths))
    ).toMatchObject({
      status: "success",
      sections: ["001"],
      students: [{ studentId: "student1", githubUsername: "student1hub", section: "001" }]
    });
  });

  it("fails closed for an unset identity and reflects later local identity changes", () => {
    const paths = createCourse(
      "student_id,github_username,section,status\nstudent1,student1hub,001,active\n"
    );
    expect(
      createFacultyScopeService({ resolveFacultyScopeContext })(requestFor(paths))
    ).toMatchObject({
      status: "faculty_identity_required",
      students: []
    });

    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(paths.userDataPath), "smith");
    expect(
      createFacultyScopeService({ resolveFacultyScopeContext })(requestFor(paths))
    ).toMatchObject({
      status: "success",
      sections: ["002"],
      students: [{ studentId: "student2", section: "002" }]
    });
  });

  it("returns no_assigned_sections when the persisted identity has no mapping", () => {
    const paths = createCourse(
      "student_id,github_username,section,status\nstudent1,student1hub,001,active\n"
    );
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(paths.userDataPath), "lee");

    expect(
      createFacultyScopeService({ resolveFacultyScopeContext })(requestFor(paths))
    ).toMatchObject({
      status: "no_assigned_sections",
      students: []
    });
  });

  it("preserves canonical roster errors", () => {
    const paths = createCourse(
      "student_id,github_username,section,status\nstudent1,student1hub,002,active\n"
    );
    saveCurrentFacultyMsoeUsername(getLocalSettingsPath(paths.userDataPath), "jones");

    expect(
      createFacultyScopeService({ resolveFacultyScopeContext })(requestFor(paths))
    ).toMatchObject({
      status: "roster_error",
      errors: [expect.objectContaining({ code: "section_mismatch" })]
    });
  });
});
