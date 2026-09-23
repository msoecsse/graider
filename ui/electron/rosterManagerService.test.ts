import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { RosterRemoveRequest, RosterSaveRequest, RosterSectionRequest } from "./ipc";
import {
  getRosterForSection,
  removeSection,
  removeRoster,
  previewRosterSave,
  saveRoster
} from "./rosterManagerService";

const CANONICAL_HEADER = "student_id,github_username,section,status";
const SAVE_TIME = new Date("2026-09-22T22:00:00.000Z");
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
  sourceKind: "manual_edit",
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

const sourcePath = (root: string, sectionId = "001"): string =>
  path.join(root, `terms/27s1/rosters/section-${sectionId}.source.json`);

const saveDependencies = (updatedBy: string | null = "jones") => ({
  updatedBy,
  now: () => SAVE_TIME
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

  it("rejects a configured section whose derived roster/source paths escape the course", () => {
    const root = createRoot();
    createTerm(root);
    const termPath = path.join(root, "terms/27s1/term.yml");
    fs.appendFileSync(termPath, '  - id: "../../../../../../outside"\n', "utf8");

    const result = getRosterForSection({
      ...loadRequest(root),
      sectionId: "../../../../../../outside"
    });

    expect(result.status).toBe("invalid");
    expect(result.diagnostics[0]?.message).toMatch(/outside the selected course folder/u);
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

  it("preserves faculty assignments when rendering a term after a roster update", () => {
    const root = createRoot();
    createTerm(root);
    const termPath = path.join(root, "terms/27s1/term.yml");
    fs.writeFileSync(
      termPath,
      fs
        .readFileSync(termPath, "utf8")
        .replace(
          "    roster: rosters/section-001.csv\n",
          "    faculty:\n      - jones\n      - smith\n"
        ),
      "utf8"
    );
    expect(saveRoster({ ...request(root), confirmed: true }).status).toBe("success");

    expect(fs.readFileSync(termPath, "utf8")).toContain("faculty:\n      - jones\n      - smith");
    expect(fs.readFileSync(termPath, "utf8")).toContain("roster: rosters/section-001.csv");
  });

  it("loads a legacy section with no faculty as an empty editable list", () => {
    const root = createRoot();
    createTerm(root);

    expect(getRosterForSection(loadRequest(root)).faculty).toEqual([]);
  });

  it("saves trimmed, unique faculty assignments without altering another section", () => {
    const root = createRoot();
    createTerm(root);
    const termPath = path.join(root, "terms/27s1/term.yml");
    fs.appendFileSync(
      termPath,
      '  - id: "002"\n    roster: rosters/section-002.csv\n    faculty:\n      - smith\n# preserve-me\n',
      "utf8"
    );

    expect(
      saveRoster({
        ...request(root),
        faculty: [" jones ", "smith", "jones"],
        confirmed: true
      }).status
    ).toBe("success");

    expect(getRosterForSection(loadRequest(root)).faculty).toEqual(["jones", "smith"]);
    expect(fs.readFileSync(termPath, "utf8")).toContain('id: "002"');
    expect(fs.readFileSync(termPath, "utf8")).toContain("faculty:\n      - smith");
    expect(fs.readFileSync(termPath, "utf8")).toContain("# preserve-me");
  });

  it("allows all faculty assignments to be removed", () => {
    const root = createRoot();
    createTerm(root);
    const termPath = path.join(root, "terms/27s1/term.yml");
    fs.writeFileSync(
      termPath,
      fs
        .readFileSync(termPath, "utf8")
        .replace("    roster:", "    faculty:\n      - jones\n    roster:"),
      "utf8"
    );

    expect(saveRoster({ ...request(root), faculty: [], confirmed: true }).status).toBe("success");
    expect(getRosterForSection(loadRequest(root)).faculty).toEqual([]);
    expect(fs.readFileSync(termPath, "utf8")).toContain("faculty: []");
  });

  it("rejects blank faculty usernames without persisting them", () => {
    const root = createRoot();
    createTerm(root);

    const result = saveRoster({ ...request(root), faculty: ["  "], confirmed: true });

    expect(result.status).toBe("failure");
    expect(result.diagnostics.map((item) => item.message)).toContain(
      "Faculty usernames cannot be blank."
    );
    expect(getRosterForSection(loadRequest(root)).faculty).toEqual([]);
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

  it("round-trips trusted CSV and manual provenance, including a null author", () => {
    const root = createRoot();
    createTerm(root);

    const csvResult = saveRoster(
      request(root, { confirmed: true, sourceKind: "csv_upload" }),
      saveDependencies()
    );
    expect(csvResult).toMatchObject({
      status: "success",
      source: {
        kind: "csv_upload",
        updatedAt: SAVE_TIME.toISOString(),
        updatedBy: "jones"
      }
    });
    expect(getRosterForSection(loadRequest(root)).source).toEqual(csvResult.source);

    const manualResult = saveRoster(
      request(root, { confirmed: true, sourceKind: "manual_edit", rows: [] }),
      saveDependencies(null)
    );
    expect(manualResult.source).toEqual({
      kind: "manual_edit",
      updatedAt: SAVE_TIME.toISOString(),
      updatedBy: null
    });
    expect(getRosterForSection(loadRequest(root)).source).toEqual(manualResult.source);
    expect(JSON.parse(fs.readFileSync(sourcePath(root), "utf8"))).toEqual({
      schemaVersion: 1,
      source: manualResult.source
    });
  });

  it("loads legacy rosters without source and fails soft for malformed or unsupported metadata", () => {
    const root = createRoot();
    createTerm(root);
    const rosterPath = path.join(root, "terms/27s1/rosters/section-001.csv");
    fs.mkdirSync(path.dirname(rosterPath), { recursive: true });
    fs.writeFileSync(rosterPath, `${CANONICAL_HEADER}\nS001,octocat,001,active\n`, "utf8");

    expect(getRosterForSection(loadRequest(root))).toMatchObject({
      status: "ready",
      rows: request(root).rows
    });
    expect(getRosterForSection(loadRequest(root)).source).toBeUndefined();

    for (const content of [
      "not json\n",
      '{"schemaVersion":2,"source":{"kind":"csv_upload","updatedAt":"2026-09-22T22:00:00.000Z","updatedBy":"jones"}}\n',
      '{"schemaVersion":1,"source":{"kind":"canvas","updatedAt":"2026-09-22T22:00:00.000Z","updatedBy":"jones"}}\n'
    ]) {
      fs.writeFileSync(sourcePath(root), content, "utf8");
      const result = getRosterForSection(loadRequest(root));
      expect(result.status).toBe("ready");
      expect(result.rows).toEqual(request(root).rows);
      expect(result.source).toBeUndefined();
      expect(result.diagnostics[0]?.message).toMatch(/source metadata/u);
    }
  });

  it("preserves source on faculty-only saves and replaces it on roster-data saves", () => {
    const root = createRoot();
    createTerm(root);
    const initial = saveRoster(
      request(root, { confirmed: true, sourceKind: "csv_upload" }),
      saveDependencies()
    );

    const facultyOnly = saveRoster(
      request(root, { confirmed: true, sourceKind: undefined, faculty: ["smith"] }),
      { updatedBy: "smith", now: () => new Date("2026-09-23T12:00:00.000Z") }
    );
    expect(facultyOnly.source).toEqual(initial.source);

    const manual = saveRoster(
      request(root, { confirmed: true, sourceKind: "manual_edit", rows: [] }),
      { updatedBy: "smith", now: () => new Date("2026-09-23T12:00:00.000Z") }
    );
    expect(manual.source).toEqual({
      kind: "manual_edit",
      updatedAt: "2026-09-23T12:00:00.000Z",
      updatedBy: "smith"
    });
    const secondFacultyOnly = saveRoster(
      request(root, { confirmed: true, sourceKind: undefined, rows: [], faculty: ["jones"] }),
      { updatedBy: "jones", now: () => new Date("2026-09-24T12:00:00.000Z") }
    );
    expect(secondFacultyOnly.source).toEqual(manual.source);
  });

  it("does not write provenance for previews, unconfirmed saves, or invalid saves", () => {
    const root = createRoot();
    createTerm(root);
    const saveRequest = request(root, { sourceKind: "csv_upload" });

    expect(previewRosterSave(saveRequest).status).toBe("ready");
    expect(saveRoster(saveRequest, saveDependencies()).status).toBe("failure");
    expect(
      saveRoster(
        { ...saveRequest, confirmed: true, rows: [{ ...saveRequest.rows[0]!, status: "bad" }] },
        saveDependencies()
      ).status
    ).toBe("failure");
    expect(fs.existsSync(sourcePath(root))).toBe(false);
  });

  it("rolls the roster back when the source write cannot complete", () => {
    const root = createRoot();
    createTerm(root);
    const rosterPath = path.join(root, "terms/27s1/rosters/section-001.csv");
    fs.mkdirSync(path.dirname(rosterPath), { recursive: true });
    const original = `${CANONICAL_HEADER}\nS001,octocat,001,active\n`;
    fs.writeFileSync(rosterPath, original, "utf8");
    const originalRename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(to).endsWith(".source.json")) throw new Error("source rename failed");
      originalRename(from, to);
    });

    const result = saveRoster(
      request(root, { confirmed: true, sourceKind: "manual_edit", rows: [] }),
      saveDependencies()
    );
    vi.restoreAllMocks();

    expect(result.status).toBe("failure");
    expect(fs.readFileSync(rosterPath, "utf8")).toBe(original);
    expect(fs.existsSync(sourcePath(root))).toBe(false);
  });

  it("removes source metadata with roster and section deletion", () => {
    const root = createRoot();
    createTerm(root);
    expect(saveRoster(request(root, { confirmed: true }), saveDependencies()).status).toBe(
      "success"
    );
    expect(fs.existsSync(sourcePath(root))).toBe(true);
    expect(removeRoster(removeRequest(root, true)).status).toBe("success");
    expect(fs.existsSync(sourcePath(root))).toBe(false);

    expect(
      saveRoster(request(root, { createSection: true, confirmed: true }), saveDependencies()).status
    ).toBe("success");
    expect(getRosterForSection(loadRequest(root)).source?.kind).toBe("manual_edit");
    expect(removeSection(removeRequest(root, true)).status).toBe("success");
    expect(fs.existsSync(sourcePath(root))).toBe(false);
  });
});
