// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveCourseSetup } from "./courseSetupService";
import { deleteAssignment } from "./assignmentDeleteService";
import { saveStudentAccessPagesConfig } from "./studentAccessPagesConfigService";
import { removeRoster, removeSection } from "./rosterManagerService";
import { standaloneSetupHasRepository } from "./legacyCourseCompatibility";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
describe("direct legacy-writer Schema 2 isolation", () => {
  it.each([2, 3, 99])("rejects schema %s with zero local course mutations", (schema) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-direct-compatibility-"));
    roots.push(root);
    const course = `schema_version: ${schema}\n`;
    const assignmentFile = "terms/27s1/assignments/lab01/assignment.yml";
    fs.writeFileSync(path.join(root, "course.yml"), course);
    fs.mkdirSync(path.join(root, path.dirname(assignmentFile)), { recursive: true });
    fs.writeFileSync(path.join(root, assignmentFile), "legacy preserved evidence\n");
    fs.writeFileSync(
      path.join(root, "terms/27s1/term.yml"),
      "schema_version: 1\nterm:\n  code: 27s1\nsections:\n  - id: '001'\n    faculty: [local-name]\n"
    );
    expect(
      saveCourseSetup({
        courseFolderPath: root,
        courseCode: "CSC",
        courseTitle: "Course",
        githubOrganization: "fixture",
        termCode: "27s1",
        sections: [{ id: "001", faculty: ["local-name"] }],
        rosterUploads: [],
        confirmed: true,
        replaceExisting: true
      }).status
    ).toBe("failure");
    expect(
      deleteAssignment({
        courseFolderId: "fixture",
        courseFolderPath: root,
        assignmentFile,
        confirmed: true
      }).status
    ).toBe("failure");
    expect(
      saveStudentAccessPagesConfig({
        courseFolderPath: root,
        repository: "fixture/pages",
        baseUrl: "https://fixture.github.io/pages",
        branch: "main"
      }).status
    ).toBe("failure");
    const removal = {
      courseFolderId: "fixture",
      courseFolderPath: root,
      termCode: "27s1",
      sectionId: "001",
      confirmed: true
    };
    expect(removeRoster(removal).status).toBe("failure");
    expect(removeSection(removal).status).toBe("failure");
    expect(fs.readFileSync(path.join(root, "course.yml"), "utf8")).toBe(course);
    expect(fs.readFileSync(path.join(root, assignmentFile), "utf8")).toBe(
      "legacy preserved evidence\n"
    );
  });
  it("does not treat a missing course file inside an existing repository as fresh standalone setup", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-standalone-origin-"));
    roots.push(root);
    const nested = path.join(root, "new", "course");
    fs.mkdirSync(nested, { recursive: true });
    expect(standaloneSetupHasRepository(nested)).toBe(false);
    fs.mkdirSync(path.join(root, ".git"));
    expect(standaloneSetupHasRepository(nested)).toBe(true);
  });
});
