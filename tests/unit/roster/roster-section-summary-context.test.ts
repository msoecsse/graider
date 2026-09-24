import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRosterSectionSummariesContext } from "../../../src/roster/roster-section-summary-context.js";

const createRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "graider-roster-summary-"));

const createTerm = (root: string): void => {
  const termPath = path.join(root, "terms/27s1/term.yml");
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
  - id: "002"
    roster: rosters/section-002.csv
  - id: "003"
    roster: rosters/section-003.csv
  - id: "004"
    roster: rosters/section-004.csv
`,
    "utf8"
  );
};

const writeRoster = (root: string, sectionId: string, content: string): void => {
  const rosterPath = path.join(root, `terms/27s1/rosters/section-${sectionId}.csv`);
  fs.mkdirSync(path.dirname(rosterPath), { recursive: true });
  fs.writeFileSync(rosterPath, content, "utf8");
};

describe("roster section summary context", () => {
  it("returns canonical counts for every valid section and isolates missing and invalid rosters", () => {
    const root = createRoot();
    createTerm(root);
    writeRoster(
      root,
      "001",
      "status,section,github_username,student_id\nhold,001,ada,S001\nactive,001,beau,S002\ndropped,001,cam,S003\n"
    );
    writeRoster(root, "003", "student_id,github_username,section,status\nS004,dee,003,unknown\n");
    writeRoster(root, "004", "student_id,github_username,section,status\n");

    expect(
      resolveRosterSectionSummariesContext({ courseFolderPath: root, termCode: "27s1" })
    ).toEqual({
      status: "ready",
      diagnostics: [],
      summaries: [
        {
          sectionId: "001",
          status: "ready",
          exists: true,
          studentCount: 3,
          activeStudentCount: 1,
          droppedStudentCount: 1,
          holdStudentCount: 1,
          diagnostics: [
            { code: "student_id_normalized", message: "student_id was normalized to lowercase." },
            { code: "student_id_normalized", message: "student_id was normalized to lowercase." },
            { code: "student_id_normalized", message: "student_id was normalized to lowercase." }
          ]
        },
        { sectionId: "002", status: "missing", exists: false, diagnostics: [] },
        {
          sectionId: "003",
          status: "invalid",
          exists: true,
          diagnostics: [
            {
              code: "invalid_roster_status",
              message: "Roster row 2 has invalid status unknown."
            }
          ]
        },
        {
          sectionId: "004",
          status: "ready",
          exists: true,
          studentCount: 0,
          activeStudentCount: 0,
          droppedStudentCount: 0,
          holdStudentCount: 0,
          diagnostics: []
        }
      ]
    });
  });

  it("returns a structured term configuration error for an unknown term", () => {
    const root = createRoot();
    createTerm(root);

    expect(
      resolveRosterSectionSummariesContext({ courseFolderPath: root, termCode: "27s2" })
    ).toMatchObject({
      status: "term_config_error",
      summaries: []
    });
  });

  it("reports a retained section with no roster reference as missing", () => {
    const root = createRoot();
    createTerm(root);
    const termPath = path.join(root, "terms/27s1/term.yml");
    fs.writeFileSync(
      termPath,
      fs
        .readFileSync(termPath, "utf8")
        .replace("    roster: rosters/section-001.csv\n", "    faculty:\n      - jones\n"),
      "utf8"
    );

    expect(
      resolveRosterSectionSummariesContext({ courseFolderPath: root, termCode: "27s1" }).summaries
    ).toContainEqual({ sectionId: "001", status: "missing", exists: false, diagnostics: [] });
  });
});
