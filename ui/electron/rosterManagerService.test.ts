import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RosterRemoveRequest, RosterSaveRequest, RosterSectionRequest } from "./ipc";
import {
  getRosterForSection,
  removeSection,
  removeRoster,
  previewRosterSave,
  saveRoster
} from "./rosterManagerService";

const CANONICAL_HEADER = "student_id,github_username,section,status";
const createRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "graider-roster-manager-"));

const createTerm = (root: string): void => {
  fs.writeFileSync(path.join(root, "course.yml"), "schema_version: 1\n", "utf8");
  const termPath = path.join(root, "terms", "27s1", "term.yml");
  fs.mkdirSync(path.dirname(termPath), { recursive: true });
  fs.writeFileSync(
    termPath,
    `schema_version: 1
term:
  code: "27s1"
  academic_year: 2027
  semester: 1
  display_name: "Fall 2026"
sections:
  - id: "001"
    roster: rosters/section-001.csv
`,
    "utf8"
  );
};

const request = (root: string, overrides: Partial<RosterSaveRequest> = {}): RosterSaveRequest => ({
  courseFolderId: "course-folder-test",
  courseFolderPath: root,
  termCode: "27s1",
  sectionId: "001",
  rows: [
    {
      studentId: "S001",
      githubUsername: "octocat",
      section: "001",
      status: "active"
    }
  ],
  confirmed: false,
  ...overrides
});

const loadRequest = (root: string): RosterSectionRequest => ({
  courseFolderId: "course-folder-test",
  courseFolderPath: root,
  termCode: "27s1",
  sectionId: "001"
});

const removeRequest = (root: string, confirmed = false): RosterRemoveRequest => ({
  ...loadRequest(root),
  confirmed
});

describe("roster manager service", () => {
  it("loads canonical rows and returns an empty roster when the file is missing", () => {
    const root = createRoot();
    createTerm(root);
    expect(getRosterForSection(loadRequest(root))).toMatchObject({
      status: "ready",
      exists: false,
      rows: []
    });

    const rosterPath = path.join(root, "terms/27s1/rosters/section-001.csv");
    fs.mkdirSync(path.dirname(rosterPath), { recursive: true });
    fs.writeFileSync(rosterPath, `${CANONICAL_HEADER}\nS001,octocat,001,active\n`, "utf8");

    expect(getRosterForSection(loadRequest(root))).toMatchObject({
      status: "ready",
      exists: true,
      rows: [request(root).rows[0]]
    });
  });

  it("generates canonical four-column LF CSV", () => {
    const root = createRoot();
    createTerm(root);
    const preview = previewRosterSave(
      request(root, {
        rows: [{ ...request(root).rows[0]!, githubUsername: "octocat" }]
      })
    );

    expect(preview.status).toBe("ready");
    expect(preview.path).toBe("terms/27s1/rosters/section-001.csv");
    expect(preview.content).toBe(`${CANONICAL_HEADER}\nS001,octocat,001,active\n`);
    expect(preview.content).not.toContain("\r");
  });

  it("rejects missing retained fields, invalid statuses, duplicates, and wrong sections", () => {
    const root = createRoot();
    createTerm(root);
    const first = request(root).rows[0]!;
    const preview = previewRosterSave(
      request(root, {
        rows: [
          { ...first, status: "unknown", section: "002" },
          { ...first, githubUsername: "" }
        ]
      })
    );

    expect(preview.status).toBe("invalid");
    expect(preview.diagnostics.map((item) => item.message).join(" ")).toContain(
      "missing githubUsername"
    );
    expect(preview.diagnostics.map((item) => item.message).join(" ")).toContain("invalid status");
    expect(preview.diagnostics.map((item) => item.message).join(" ")).toContain(
      "Duplicate student_id"
    );
    expect(preview.diagnostics.map((item) => item.message).join(" ")).toContain("expected 001");
  });

  it("accepts the MVP header and rejects unknown headers without silently replacing them", () => {
    const root = createRoot();
    createTerm(root);
    const rosterPath = path.join(root, "terms/27s1/rosters/section-001.csv");
    fs.mkdirSync(path.dirname(rosterPath), { recursive: true });
    fs.writeFileSync(
      rosterPath,
      "student_id,github_username,section,status\nS001,octocat,001,active\n",
      "utf8"
    );

    expect(getRosterForSection(loadRequest(root)).status).toBe("ready");
    fs.writeFileSync(rosterPath, "name,email\nOcto,octo@example.test\n", "utf8");
    expect(getRosterForSection(loadRequest(root)).status).toBe("invalid");
  });

  it("loads the former seven-column header while retaining only MVP fields", () => {
    const root = createRoot();
    createTerm(root);
    const rosterPath = path.join(root, "terms/27s1/rosters/section-001.csv");
    fs.mkdirSync(path.dirname(rosterPath), { recursive: true });
    fs.writeFileSync(
      rosterPath,
      "student_id,github_username,email,first_name,last_name,section,status\nS001,octocat,octo@example.test,Octo,Cat,001,active\n",
      "utf8"
    );

    expect(getRosterForSection(loadRequest(root))).toMatchObject({
      status: "ready",
      rows: [
        {
          studentId: "S001",
          githubUsername: "octocat",
          section: "001",
          status: "active"
        }
      ]
    });
  });

  it("does not write during preview and writes only after confirmation in paths with spaces", () => {
    const parent = createRoot();
    const root = path.join(parent, "Course Folder With Spaces");
    fs.mkdirSync(root);
    createTerm(root);
    const saveRequest = request(root);
    const rosterPath = path.join(root, "terms/27s1/rosters/section-001.csv");

    expect(previewRosterSave(saveRequest).status).toBe("ready");
    expect(fs.existsSync(rosterPath)).toBe(false);
    expect(saveRoster(saveRequest).status).toBe("failure");
    expect(saveRoster({ ...saveRequest, confirmed: true }).status).toBe("success");
    expect(fs.readFileSync(rosterPath, "utf8")).toContain(CANONICAL_HEADER);
  });

  it("rejects term or section traversal before writing", () => {
    const root = createRoot();
    createTerm(root);
    const result = saveRoster(
      request(root, { termCode: "../outside", sectionId: "../outside", confirmed: true })
    );

    expect(result.status).toBe("failure");
    expect(fs.existsSync(path.join(root, "../outside"))).toBe(false);
  });

  it("adds a safe section with an empty canonical roster while preserving term fields", () => {
    const root = createRoot();
    createTerm(root);
    const termPath = path.join(root, "terms/27s1/term.yml");
    fs.appendFileSync(termPath, "advanced_setting: keep-me\n", "utf8");
    const createRequest = request(root, {
      sectionId: "high-school",
      rows: [],
      createSection: true
    });

    const preview = previewRosterSave(createRequest);
    expect(preview.status).toBe("ready");
    expect(preview.termContent).toContain("id: high-school");
    expect(saveRoster({ ...createRequest, confirmed: true })).toMatchObject({ status: "success" });
    expect(fs.readFileSync(termPath, "utf8")).toContain("advanced_setting: keep-me");
    expect(fs.readFileSync(termPath, "utf8")).toContain('id: "001"');
    expect(fs.readFileSync(termPath, "utf8")).toContain("id: high-school");
    expect(
      fs.readFileSync(path.join(root, "terms/27s1/rosters/section-high-school.csv"), "utf8")
    ).toBe(`${CANONICAL_HEADER}\n`);
  });

  it("supports row add, remove, replacement, and clear through the same confirmed write", () => {
    const root = createRoot();
    createTerm(root);
    const rosterPath = path.join(root, "terms/27s1/rosters/section-001.csv");
    const first = request(root).rows[0]!;
    const second = { ...first, studentId: "S002", githubUsername: "hubot" };

    expect(saveRoster(request(root, { rows: [first, second], confirmed: true })).status).toBe(
      "success"
    );
    expect(saveRoster(request(root, { rows: [second], confirmed: true })).status).toBe("success");
    expect(fs.readFileSync(rosterPath, "utf8")).not.toContain("S001");
    expect(saveRoster(request(root, { rows: [], confirmed: true })).status).toBe("success");
    expect(fs.readFileSync(rosterPath, "utf8")).toBe(`${CANONICAL_HEADER}\n`);
  });

  it("removes the roster CSV and section only after confirmation, then allows re-adding", () => {
    const root = createRoot();
    createTerm(root);
    const rosterPath = path.join(root, "terms/27s1/rosters/section-001.csv");
    const termPath = path.join(root, "terms/27s1/term.yml");
    expect(saveRoster({ ...request(root), confirmed: true }).status).toBe("success");

    expect(removeRoster(removeRequest(root))).toMatchObject({ status: "failure" });
    expect(fs.existsSync(rosterPath)).toBe(true);
    expect(removeRoster(removeRequest(root, true))).toMatchObject({ status: "success" });
    expect(fs.existsSync(rosterPath)).toBe(false);
    expect(fs.readFileSync(termPath, "utf8")).not.toContain('id: "001"');
    expect(fs.readFileSync(termPath, "utf8")).not.toContain("roster:");
    expect(getRosterForSection(loadRequest(root))).toMatchObject({
      status: "invalid",
      exists: false
    });

    expect(saveRoster({ ...request(root, { createSection: true }), confirmed: true }).status).toBe(
      "success"
    );
    expect(fs.existsSync(rosterPath)).toBe(true);
    expect(fs.readFileSync(termPath, "utf8")).toContain("roster: rosters/section-001.csv");
  });

  it("removes a section without a roster after confirmation, then allows it to be re-added", () => {
    const root = createRoot();
    createTerm(root);
    const termPath = path.join(root, "terms/27s1/term.yml");
    const rosterPath = path.join(root, "terms/27s1/rosters/section-001.csv");
    fs.writeFileSync(
      termPath,
      fs.readFileSync(termPath, "utf8").replace("    roster: rosters/section-001.csv\n", ""),
      "utf8"
    );

    expect(removeSection(removeRequest(root))).toMatchObject({ status: "failure" });
    expect(removeSection(removeRequest(root, true))).toMatchObject({ status: "success" });
    expect(fs.readFileSync(termPath, "utf8")).not.toContain('id: "001"');
    expect(fs.existsSync(rosterPath)).toBe(false);

    expect(saveRoster({ ...request(root, { createSection: true }), confirmed: true }).status).toBe(
      "success"
    );
    expect(fs.existsSync(rosterPath)).toBe(true);
  });

  it("adds canonical roster rows and rejects invalid new section requests", () => {
    const root = createRoot();
    createTerm(root);
    const canonical = request(root, {
      sectionId: "121",
      createSection: true,
      rows: [{ ...request(root).rows[0]!, section: "121" }]
    });
    expect(saveRoster({ ...canonical, confirmed: true }).status).toBe("success");
    expect(
      fs.readFileSync(path.join(root, "terms/27s1/rosters/section-121.csv"), "utf8")
    ).toContain("121,active");
    for (const invalid of ["", "001", "../outside"]) {
      expect(
        previewRosterSave(request(root, { sectionId: invalid, createSection: true })).status
      ).toBe("invalid");
    }
    expect(
      previewRosterSave(
        request(root, {
          sectionId: "111",
          createSection: true,
          rows: [{ ...request(root).rows[0]!, section: "999" }]
        })
      )
        .diagnostics.map((item) => item.message)
        .join(" ")
    ).toContain("expected 111");
  });
});
