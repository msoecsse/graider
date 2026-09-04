import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { ProcessRunner } from "./commandRunner.js";
import type { RosterRemoveRequest, RosterSaveRequest } from "./ipc.js";
import {
  removeRosterWithStudentRepositoryAccessPageRefresh,
  saveRosterWithStudentRepositoryAccessPageRefresh
} from "./rosterStudentRepositoryAccessPageService.js";

const createRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "graider-roster-page-"));
const pagesRoot = (root: string): string => path.join(root, "pages");
const git = (root: string, arguments_: readonly string[]): string =>
  execFileSync("git", arguments_, { cwd: root, encoding: "utf8" }).trim();
const assignmentFile = (slug: string): string => `terms/27s1/assignments/${slug}/assignment.yml`;
const pagePath = (slug: string): string =>
  `terms/27s1/notifications/${slug}/student-repositories.html`;

const writeAssignment = (root: string, slug: string, section: string): void => {
  const file = path.join(root, assignmentFile(slug));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `assignment:\n  title: ${slug}\n  status: active\ntemplate:\n  repository: owner/template\n  branch: main\nsections:\n  - "${section}"\ndeadline:\n  due_at: "2027-06-15T23:59:00-05:00"\n  late_policy: standard\nmetadata:\n  faculty_owner: professor\n  grading_category: labs\n  points: 100\n`,
    "utf8"
  );
};

const writeFixture = (root: string, configured = true): void => {
  fs.writeFileSync(
    path.join(root, "course.yml"),
    configured
      ? "course:\n  code: CSC1120\ngithub:\n  organization: graider-sandbox\nnotifications:\n  student_access_pages:\n    repository: csc1120/csc1120pages\n    base_url: https://csc1120.github.io/csc1120pages\n    branch: main\n"
      : "course:\n  code: CSC1120\n",
    "utf8"
  );
  fs.mkdirSync(path.join(root, "terms/27s1/rosters"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "terms/27s1/term.yml"),
    'term:\n  code: 27s1\nsections:\n  - id: "001"\n  - id: "002"\n',
    "utf8"
  );
  fs.writeFileSync(
    path.join(root, "terms/27s1/rosters/section-001.csv"),
    "student_id,github_username,section,status\na001,ada,001,active\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(root, "terms/27s1/rosters/section-002.csv"),
    "student_id,github_username,section,status\nb001,bob,002,active\n",
    "utf8"
  );
  writeAssignment(root, "lab02", "001");
  writeAssignment(root, "lab03", "002");
  fs.mkdirSync(pagesRoot(root));
};

const initializePagesRepository = (root: string): void => {
  const pages = pagesRoot(root);
  const remote = path.join(root, "remotes", "csc1120", "csc1120pages");
  fs.mkdirSync(remote, { recursive: true });
  git(pages, ["init"]);
  git(pages, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(pages, ["config", "user.email", "test@example.invalid"]);
  git(pages, ["config", "user.name", "Test User"]);
  git(pages, ["commit", "--allow-empty", "-m", "Initial"]);
  git(remote, ["init", "--bare"]);
  git(pages, ["remote", "add", "origin", remote]);
  git(pages, ["push", "-u", "origin", "HEAD"]);
};

const saveRequest = (root: string, rows: RosterSaveRequest["rows"]): RosterSaveRequest => ({
  courseFolderId: "course",
  courseFolderPath: root,
  termCode: "27s1",
  sectionId: "001",
  rows,
  confirmed: true
});

const runner = (): ProcessRunner =>
  vi.fn(async (command) => {
    const slug = command.args[2]?.split("/").at(-2) ?? "";
    return {
      stdout: JSON.stringify({
        schemaVersion: 1,
        commandName: "assignment repository-mappings",
        manifest: { status: "present" },
        studentMappings:
          slug === "lab02"
            ? [
                {
                  studentId: "a001",
                  githubUsername: "ada",
                  targetId: "a001",
                  repositoryName: "lab02-ada",
                  repositoryUrl: "https://github.com/example/lab02-ada"
                },
                {
                  studentId: "a002",
                  githubUsername: "newstudent",
                  targetId: "a002",
                  repositoryName: "lab02-newstudent",
                  repositoryUrl: "https://github.com/example/lab02-newstudent"
                }
              ]
            : [
                {
                  studentId: "b001",
                  githubUsername: "bob",
                  targetId: "b001",
                  repositoryName: "lab03-bob",
                  repositoryUrl: "https://github.com/example/lab03-bob"
                }
              ],
        diagnostics: []
      }),
      stderr: "",
      exitCode: 0,
      error: null
    };
  });

const options = (root: string) => ({
  runner: runner(),
  pagesRepositoryFolderPath: pagesRoot(root)
});

describe("roster student repository access page lifecycle", () => {
  it("regenerates and publishes the affected page for student add/update and replacement", async () => {
    const root = createRoot();
    writeFixture(root);
    initializePagesRepository(root);

    const result = await saveRosterWithStudentRepositoryAccessPageRefresh(
      saveRequest(root, [
        { studentId: "a001", githubUsername: "ada", section: "001", status: "active" },
        { studentId: "a002", githubUsername: "newstudent", section: "001", status: "active" }
      ]),
      options(root)
    );

    expect(result.status).toBe("success");
    expect(fs.readFileSync(path.join(pagesRoot(root), pagePath("lab02")), "utf8")).toContain(
      "a002"
    );
    expect(fs.existsSync(path.join(pagesRoot(root), pagePath("lab03")))).toBe(false);
  });

  it("regenerates and publishes when students are removed or the roster is replaced", async () => {
    const root = createRoot();
    writeFixture(root);
    initializePagesRepository(root);
    const lifecycleOptions = options(root);

    await saveRosterWithStudentRepositoryAccessPageRefresh(
      saveRequest(root, [
        { studentId: "a002", githubUsername: "newstudent", section: "001", status: "active" }
      ]),
      lifecycleOptions
    );
    const firstHead = git(pagesRoot(root), ["rev-parse", "HEAD"]);
    const result = await saveRosterWithStudentRepositoryAccessPageRefresh(
      saveRequest(root, []),
      lifecycleOptions
    );

    expect(result.status).toBe("success");
    expect(git(pagesRoot(root), ["rev-parse", "HEAD"])).not.toBe(firstHead);
  });

  it("handles unchanged output without another commit and leaves unrelated assignments/files untouched", async () => {
    const root = createRoot();
    writeFixture(root);
    initializePagesRepository(root);
    fs.writeFileSync(path.join(pagesRoot(root), "unrelated.txt"), "keep", "utf8");
    const lifecycleOptions = options(root);
    const roster = [{ studentId: "a001", githubUsername: "ada", section: "001", status: "active" }];

    await saveRosterWithStudentRepositoryAccessPageRefresh(
      saveRequest(root, roster),
      lifecycleOptions
    );
    const firstHead = git(pagesRoot(root), ["rev-parse", "HEAD"]);
    const result = await saveRosterWithStudentRepositoryAccessPageRefresh(
      saveRequest(root, roster),
      lifecycleOptions
    );

    expect(result.status).toBe("success");
    expect(git(pagesRoot(root), ["rev-parse", "HEAD"])).toBe(firstHead);
    expect(fs.readFileSync(path.join(pagesRoot(root), "unrelated.txt"), "utf8")).toBe("keep");
    expect(fs.existsSync(path.join(pagesRoot(root), pagePath("lab03")))).toBe(false);
  });

  it("keeps a roster mutation successful when no Student Repository Page is configured", async () => {
    const root = createRoot();
    writeFixture(root, false);

    const result = await saveRosterWithStudentRepositoryAccessPageRefresh(
      saveRequest(root, [
        { studentId: "a002", githubUsername: "newstudent", section: "001", status: "active" }
      ]),
      options(root)
    );

    expect(result.status).toBe("success");
  });

  it("surfaces publication failures after a successful roster mutation", async () => {
    const root = createRoot();
    writeFixture(root);
    initializePagesRepository(root);
    git(pagesRoot(root), [
      "remote",
      "set-url",
      "origin",
      path.join(root, "missing", "csc1120", "csc1120pages")
    ]);

    const result = await saveRosterWithStudentRepositoryAccessPageRefresh(
      saveRequest(root, [
        { studentId: "a002", githubUsername: "newstudent", section: "001", status: "active" }
      ]),
      options(root)
    );

    expect(result.status).toBe("failure");
    expect(result.diagnostics.map((item) => item.message).join(" ")).toMatch(/publish.*push/u);
  });

  it("regenerates affected pages when a roster section is removed", async () => {
    const root = createRoot();
    writeFixture(root);
    initializePagesRepository(root);
    const request: RosterRemoveRequest = {
      courseFolderId: "course",
      courseFolderPath: root,
      termCode: "27s1",
      sectionId: "001",
      confirmed: true
    };

    const result = await removeRosterWithStudentRepositoryAccessPageRefresh(request, options(root));

    expect(result.status).toBe("success");
    expect(fs.existsSync(path.join(pagesRoot(root), pagePath("lab02")))).toBe(true);
    expect(fs.existsSync(path.join(pagesRoot(root), pagePath("lab03")))).toBe(false);
  });
});
