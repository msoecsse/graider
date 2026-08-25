import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CourseSetupRequest } from "./ipc";
import { previewCourseSetup, saveCourseSetup } from "./courseSetupService";

const createRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "graider-course-setup-"));

const createRequest = (
  courseFolderPath: string,
  overrides: Partial<CourseSetupRequest> = {}
): CourseSetupRequest => ({
  courseFolderPath,
  courseTitle: "Data Structures",
  courseCode: "csc1120",
  githubOrganization: "graider-sandbox",
  termCode: "27s1",
  sectionIds: ["001"],
  rosterUploads: [],
  confirmed: false,
  replaceExisting: false,
  ...overrides
});

const ROSTER =
  "student_id,github_username,email,first_name,last_name,section,status\nS123,octocat,octo@example.test,Octo,Cat,001,ACTIVE\n";

describe("course setup service", () => {
  it("generates course defaults and derives Fall 2026 for 27s1", () => {
    const preview = previewCourseSetup(createRequest(createRoot()));

    expect(preview.status).toBe("ready");
    expect(preview.files[0]?.content).toContain('code: "csc1120"');
    expect(preview.files[0]?.content).toContain("timezone: America/Chicago");
    expect(preview.files[1]?.content).toContain('display_name: "Fall 2026"');
    expect(preview.files.map((file) => file.path)).toEqual(["course.yml", "terms/27s1/term.yml"]);
  });

  it.each([
    ["27s2", "Spring 2027"],
    ["27s3", "Summer 2027"]
  ])("derives %s as %s", (termCode, displayName) => {
    const preview = previewCourseSetup(createRequest(createRoot(), { termCode }));
    expect(preview.files[1]?.content).toContain(`display_name: "${displayName}"`);
  });

  it("preserves leading-zero sections and writes uploaded rosters in canonical order", () => {
    const preview = previewCourseSetup(
      createRequest(createRoot(), { rosterUploads: [{ sectionId: "001", content: ROSTER }] })
    );
    const roster = preview.files.find((file) => file.path.endsWith("section-001.csv"));

    expect(preview.status).toBe("ready");
    expect(roster?.path).toBe("terms/27s1/rosters/section-001.csv");
    expect(roster?.content).toContain(
      "student_id,github_username,email,first_name,last_name,section,status\nS123,octocat,octo@example.test,Octo,Cat,001,ACTIVE"
    );
  });

  it("rejects blank or duplicate sections and the legacy roster header", () => {
    const duplicate = previewCourseSetup(
      createRequest(createRoot(), { sectionIds: ["001", " 001 "] })
    );
    const legacy = previewCourseSetup(
      createRequest(createRoot(), {
        rosterUploads: [
          {
            sectionId: "001",
            content: "student_id,github_username,section,status\ns1,octocat,001,active\n"
          }
        ]
      })
    );

    expect(duplicate.status).toBe("invalid");
    expect(legacy.diagnostics.map((diagnostic) => diagnostic.message).join(" ")).toContain(
      "legacy four-column"
    );
  });

  it("detects conflicts before save and only writes after explicit confirmation", () => {
    const root = createRoot();
    fs.writeFileSync(path.join(root, "course.yml"), "existing\n", "utf8");
    const request = createRequest(root);

    expect(previewCourseSetup(request).hasConflicts).toBe(true);
    expect(saveCourseSetup(request).status).toBe("failure");
    expect(fs.readFileSync(path.join(root, "course.yml"), "utf8")).toBe("existing\n");
    expect(saveCourseSetup({ ...request, confirmed: true }).status).toBe("failure");
    expect(saveCourseSetup({ ...request, confirmed: true, replaceExisting: true }).status).toBe(
      "success"
    );
  });

  it("creates nested directories in paths containing spaces", () => {
    const parent = createRoot();
    const root = path.join(parent, "Course Folder With Spaces");
    fs.mkdirSync(root);
    const result = saveCourseSetup(createRequest(root, { confirmed: true }));

    expect(result.status).toBe("success");
    expect(fs.existsSync(path.join(root, "terms/27s1/term.yml"))).toBe(true);
  });
});
