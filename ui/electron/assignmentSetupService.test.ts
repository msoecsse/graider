import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AssignmentSetupRequest } from "./ipc";
import {
  loadAssignmentSetupTerms,
  normalizeTemplateRepository,
  previewAssignmentSetup,
  saveAssignmentSetup
} from "./assignmentSetupService";

const createRoot = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), "graider-assignment-setup-"));

const createTerm = (root: string, termCode = "27s1", sections = ["001", "002"]): void => {
  fs.writeFileSync(path.join(root, "course.yml"), "schema_version: 1\n", "utf8");
  const termPath = path.join(root, "terms", termCode, "term.yml");
  fs.mkdirSync(path.dirname(termPath), { recursive: true });
  fs.writeFileSync(
    termPath,
    `schema_version: 1
term:
  code: "${termCode}"
  academic_year: 2027
  semester: 1
  display_name: "Fall 2026"
sections:
${sections.map((section) => `  - id: "${section}"\n    roster: rosters/section-${section}.csv\n`).join("")}`,
    "utf8"
  );
};

const createRequest = (
  courseFolderPath: string,
  overrides: Partial<AssignmentSetupRequest> = {}
): AssignmentSetupRequest => ({
  courseFolderId: "course-folder-test",
  courseFolderPath,
  assignmentTitle: "Lab 02",
  assignmentSlug: "lab02",
  termCode: "27s1",
  sectionIds: ["001"],
  templateRepository: "graider-sandbox/lab02-template",
  templateBranch: "main",
  dueAt: "2027-06-15T23:59:00-05:00",
  gradingEnabled: true,
  points: 100,
  gradingCategory: "labs",
  confirmed: false,
  replaceExisting: false,
  ...overrides
});

describe("assignment setup service", () => {
  it("loads existing terms and preserves leading-zero section IDs", () => {
    const root = createRoot();
    createTerm(root);

    expect(loadAssignmentSetupTerms(root)).toEqual({
      terms: [{ code: "27s1", sections: ["001", "002"] }],
      diagnostics: []
    });
  });

  it("loads a term with no sections so assignment setup can explain the empty state", () => {
    const root = createRoot();
    createTerm(root, "27s1", []);

    expect(loadAssignmentSetupTerms(root)).toEqual({
      terms: [{ code: "27s1", sections: [] }],
      diagnostics: []
    });
  });

  it("generates assignment YAML with faculty input and grading defaults", () => {
    const root = createRoot();
    createTerm(root);
    const preview = previewAssignmentSetup(createRequest(root));

    expect(preview.status).toBe("ready");
    expect(preview.files[0]?.path).toBe("terms/27s1/assignments/lab02/assignment.yml");
    expect(preview.files[0]?.content).toContain('title: "Lab 02"');
    expect(preview.files[0]?.content).toContain("type: individual");
    expect(preview.files[0]?.content).toContain("status: active");
    expect(preview.files[0]?.content).toContain("workflow: .github/workflows/grade.yml");
    expect(preview.files[0]?.content).toContain("points: 100");
  });

  it("normalizes GitHub template URLs and accepts direct owner/repo input", () => {
    expect(normalizeTemplateRepository("owner/repo")).toBe("owner/repo");
    expect(normalizeTemplateRepository("https://github.com/owner/repo")).toBe("owner/repo");
    expect(normalizeTemplateRepository("https://github.com/owner/repo.git")).toBe("owner/repo");
    expect(normalizeTemplateRepository("github.com/owner/repo")).toBeNull();
  });

  it("rejects missing required fields and sections not in the selected term", () => {
    const root = createRoot();
    createTerm(root);
    const preview = previewAssignmentSetup(
      createRequest(root, {
        assignmentTitle: "",
        assignmentSlug: "../escape",
        sectionIds: ["003"],
        templateRepository: "not a repo",
        points: 0,
        gradingCategory: ""
      })
    );

    expect(preview.status).toBe("invalid");
    expect(preview.diagnostics.map((item) => item.message).join(" ")).toContain(
      "Selected sections must exist"
    );
    expect(preview.diagnostics.map((item) => item.message).join(" ")).toContain(
      "Template repository"
    );
  });

  it("writes disabled grading in the loader-compatible no-grading shape", () => {
    const root = createRoot();
    createTerm(root);
    const preview = previewAssignmentSetup(createRequest(root, { gradingEnabled: false }));

    expect(preview.status).toBe("ready");
    expect(preview.files[0]?.content).toContain("enabled: false\n  mode: no-grading");
    expect(preview.files[0]?.content).not.toContain("artifact: grading-results");
  });

  it("does not write during preview and blocks conflicts without explicit replacement", () => {
    const root = createRoot();
    createTerm(root);
    const request = createRequest(root);
    const assignmentPath = path.join(root, "terms/27s1/assignments/lab02/assignment.yml");

    expect(previewAssignmentSetup(request).hasConflicts).toBe(false);
    expect(fs.existsSync(assignmentPath)).toBe(false);
    expect(saveAssignmentSetup(request).status).toBe("failure");
    expect(saveAssignmentSetup({ ...request, confirmed: true }).status).toBe("success");
    expect(previewAssignmentSetup(request).hasConflicts).toBe(true);
    expect(saveAssignmentSetup({ ...request, confirmed: true }).status).toBe("failure");
    expect(saveAssignmentSetup({ ...request, confirmed: true, replaceExisting: true }).status).toBe(
      "success"
    );
  });

  it("creates nested directories in course paths containing spaces", () => {
    const parent = createRoot();
    const root = path.join(parent, "Course Folder With Spaces");
    fs.mkdirSync(root);
    createTerm(root);

    const result = saveAssignmentSetup(createRequest(root, { confirmed: true }));

    expect(result.status).toBe("success");
    expect(fs.existsSync(path.join(root, "terms/27s1/assignments/lab02/assignment.yml"))).toBe(
      true
    );
  });
});
