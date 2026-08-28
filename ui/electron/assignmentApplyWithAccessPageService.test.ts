import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ProcessRunner } from "./commandRunner.js";
import type { AssignmentApplyRequest } from "./ipc.js";
import { applyAssignmentWithStudentRepositoryAccessPage } from "./assignmentApplyWithAccessPageService.js";

const assignmentFile = "terms/27s1/assignments/lab02/assignment.yml";
const createRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "graider-apply-page-"));

const writeFixture = (root: string, withPagesFolder = true): void => {
  fs.writeFileSync(
    path.join(root, "course.yml"),
    "course:\n  code: CSC1120\n  title: Data Structures\ngithub:\n  organization: graider-sandbox\nnotifications:\n  student_access_pages:\n    repository: csc1120/csc1120pages\n    base_url: https://csc1120.github.io/csc1120pages\n    branch: main\n",
    "utf8"
  );
  if (withPagesFolder) fs.mkdirSync(path.join(root, "pages"));
  fs.mkdirSync(path.join(root, "terms/27s1/rosters"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "terms/27s1/term.yml"),
    'term:\n  code: 27s1\nsections:\n  - id: "001"\n'
  );
  fs.writeFileSync(
    path.join(root, "terms/27s1/rosters/section-001.csv"),
    "student_id,github_username,section,status\na001,ada,001,active\n"
  );
  fs.mkdirSync(path.dirname(path.join(root, assignmentFile)), { recursive: true });
  fs.writeFileSync(
    path.join(root, assignmentFile),
    'assignment:\n  title: Lab 02\n  status: active\ntemplate:\n  repository: owner/template\n  branch: main\nsections:\n  - "001"\n',
    "utf8"
  );
};

const request = (root: string): AssignmentApplyRequest => ({
  courseFolderId: "course",
  courseFolderPath: root,
  assignmentFile
});

const applyJson = {
  schemaVersion: 1,
  commandName: "assignment apply",
  assignmentFile,
  status: "success",
  exitCode: 0,
  diagnostics: [],
  warnings: [],
  errors: [],
  generatedFiles: [],
  summary: {}
};

const mappingsJson = {
  schemaVersion: 1,
  commandName: "assignment repository-mappings",
  manifest: { status: "present" },
  studentMappings: [
    {
      studentId: "a001",
      githubUsername: "ada",
      targetId: "a001",
      repositoryName: "lab02-ada",
      repositoryUrl: "https://github.com/example/lab02-ada"
    }
  ],
  diagnostics: []
};

const runner = (): ProcessRunner =>
  vi.fn(async (command) => {
    if (command.command === "gh")
      return { stdout: "token\n", stderr: "", exitCode: 0, error: null };
    if (command.args[1] === "apply")
      return { stdout: JSON.stringify(applyJson), stderr: "", exitCode: 0, error: null };
    return { stdout: JSON.stringify(mappingsJson), stderr: "", exitCode: 0, error: null };
  });

describe("assignmentApplyWithAccessPageService", () => {
  it("generates the student repository access page after a successful apply", async () => {
    const root = createRoot();
    writeFixture(root);

    const result = await applyAssignmentWithStudentRepositoryAccessPage(request(root), {
      runner: runner(),
      env: {},
      pagesRepositoryFolderPath: path.join(root, "pages")
    });

    expect(result.status).toBe("success");
    expect(
      fs.existsSync(
        path.join(root, "pages/terms/27s1/notifications/lab02/student-repositories.html")
      )
    ).toBe(true);
  });

  it("reports Apply failure when the required student access page cannot be generated", async () => {
    const root = createRoot();
    writeFixture(root, false);

    const result = await applyAssignmentWithStudentRepositoryAccessPage(request(root), {
      runner: runner(),
      env: {},
      pagesRepositoryFolderPath: path.join(root, "pages")
    });

    expect(result.status).toBe("failure");
    expect(result.error).toMatchObject({
      code: "student_repository_access_page_generation_failed"
    });
  });
});
