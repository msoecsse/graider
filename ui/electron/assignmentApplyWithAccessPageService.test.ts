import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ProcessRunner } from "./commandRunner.js";
import type { AssignmentApplyRequest } from "./ipc.js";
import { applyAssignmentWithStudentRepositoryAccessPage } from "./assignmentApplyWithAccessPageService.js";

const assignmentFile = "terms/27s1/assignments/lab02/assignment.yml";
const createRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "graider-apply-page-"));
const pagesRoot = (root: string): string => path.join(root, "pages");
const outputPath = "terms/27s1/notifications/lab02/student-repositories.html";
const git = (root: string, arguments_: readonly string[]): string =>
  execFileSync("git", arguments_, { cwd: root, encoding: "utf8" }).trim();

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

const initializePagesRepository = (root: string): void => {
  const pages = pagesRoot(root);
  const remote = path.join(root, "remotes", "csc1120", "csc1120pages");
  fs.mkdirSync(remote, { recursive: true });
  git(pages, ["init"]);
  git(pages, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(pages, ["config", "user.email", "test@example.invalid"]);
  git(pages, ["config", "user.name", "Test User"]);
  git(pages, ["add", "."]);
  git(pages, ["commit", "--allow-empty", "-m", "Initial"]);
  git(remote, ["init", "--bare"]);
  git(pages, ["remote", "add", "origin", remote]);
  git(pages, ["push", "-u", "origin", "HEAD"]);
};

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
  it("generates and publishes the student repository access page after a successful apply", async () => {
    const root = createRoot();
    writeFixture(root);
    initializePagesRepository(root);

    const result = await applyAssignmentWithStudentRepositoryAccessPage(request(root), {
      runner: runner(),
      env: {},
      pagesRepositoryFolderPath: pagesRoot(root)
    });

    expect(result.status).toBe("success");
    expect(fs.existsSync(path.join(pagesRoot(root), outputPath))).toBe(true);
    expect(git(pagesRoot(root), ["show", "--format=", "--name-only", "HEAD"])).toBe(outputPath);
  });

  it("replaces an existing generated page without creating another file", async () => {
    const root = createRoot();
    writeFixture(root);
    fs.mkdirSync(path.dirname(path.join(pagesRoot(root), outputPath)), { recursive: true });
    fs.writeFileSync(path.join(pagesRoot(root), outputPath), "old page", "utf8");
    initializePagesRepository(root);

    const result = await applyAssignmentWithStudentRepositoryAccessPage(request(root), {
      runner: runner(),
      env: {},
      pagesRepositoryFolderPath: pagesRoot(root)
    });

    expect(result.status).toBe("success");
    expect(fs.readFileSync(path.join(pagesRoot(root), outputPath), "utf8")).not.toBe("old page");
    expect(fs.readdirSync(path.join(pagesRoot(root), "terms/27s1/notifications/lab02"))).toEqual([
      "student-repositories.html"
    ]);
  });

  it("treats unchanged generated content as a successful, idempotent publish", async () => {
    const root = createRoot();
    writeFixture(root);
    initializePagesRepository(root);
    const options = { runner: runner(), env: {}, pagesRepositoryFolderPath: pagesRoot(root) };

    await applyAssignmentWithStudentRepositoryAccessPage(request(root), options);
    const firstHead = git(pagesRoot(root), ["rev-parse", "HEAD"]);
    const result = await applyAssignmentWithStudentRepositoryAccessPage(request(root), options);

    expect(result.status).toBe("success");
    expect(git(pagesRoot(root), ["rev-parse", "HEAD"])).toBe(firstHead);
  });

  it("publishes only the generated page and leaves unrelated page-repository files untouched", async () => {
    const root = createRoot();
    writeFixture(root);
    initializePagesRepository(root);
    fs.writeFileSync(path.join(pagesRoot(root), "unrelated.txt"), "leave me alone", "utf8");

    const result = await applyAssignmentWithStudentRepositoryAccessPage(request(root), {
      runner: runner(),
      env: {},
      pagesRepositoryFolderPath: pagesRoot(root)
    });

    expect(result.status).toBe("success");
    expect(fs.readFileSync(path.join(pagesRoot(root), "unrelated.txt"), "utf8")).toBe(
      "leave me alone"
    );
    expect(git(pagesRoot(root), ["show", "--format=", "--name-only", "HEAD"])).toBe(outputPath);
    expect(git(pagesRoot(root), ["status", "--porcelain"])).toContain("unrelated.txt");
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

  it("surfaces actionable publication failures after Apply", async () => {
    const root = createRoot();
    writeFixture(root);
    initializePagesRepository(root);
    git(pagesRoot(root), [
      "remote",
      "set-url",
      "origin",
      path.join(root, "missing", "csc1120", "csc1120pages")
    ]);

    const result = await applyAssignmentWithStudentRepositoryAccessPage(request(root), {
      runner: runner(),
      env: {},
      pagesRepositoryFolderPath: pagesRoot(root)
    });

    expect(result.status).toBe("failure");
    expect(result.error).toMatchObject({
      code: "student_repository_access_page_publication_failed",
      message: expect.stringMatching(/Unable to push/u)
    });
  });
});
