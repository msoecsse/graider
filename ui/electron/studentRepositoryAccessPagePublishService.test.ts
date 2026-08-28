import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { StudentRepositoryAccessPageRequest } from "./ipc";
import { publishStudentRepositoryAccessPage } from "./studentRepositoryAccessPagePublishService";

const assignmentFile = "terms/27s1/assignments/lab02/assignment.yml";
const outputPath = "terms/27s1/notifications/lab02/student-repositories.html";
const mappings = { manifestStatus: "not_applied" as const, mappings: [], diagnostics: [] };
const pagesRoot = (root: string): string => path.join(root, "pages repo");
const git = (root: string, arguments_: readonly string[]): string =>
  execFileSync("git", arguments_, { cwd: root, encoding: "utf8" }).trim();
const request = (root: string): StudentRepositoryAccessPageRequest => ({
  courseFolderId: "course",
  courseFolderPath: root,
  assignmentFile,
  pagesRepositoryFolderPath: pagesRoot(root)
});

const createFixture = (withUpstream = true): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-publish-action-"));
  fs.writeFileSync(
    path.join(root, "course.yml"),
    "notifications:\n  student_access_pages:\n    repository: csc1120/csc1120pages\n    base_url: https://csc1120.github.io/csc1120pages\n    branch: main\n",
    "utf8"
  );
  fs.mkdirSync(path.dirname(path.join(root, assignmentFile)), { recursive: true });
  fs.writeFileSync(
    path.join(root, assignmentFile),
    'assignment:\n  title: Lab 02\n  status: active\ntemplate:\n  repository: owner/template\n  branch: main\nsections:\n  - "001"\ndeadline:\n  due_at: "2027-06-15T23:59:00-05:00"\n  late_policy: standard\nmetadata:\n  faculty_owner: professor\n  grading_category: labs\n  points: 100\n',
    "utf8"
  );
  fs.mkdirSync(path.dirname(path.join(pagesRoot(root), outputPath)), { recursive: true });
  fs.writeFileSync(path.join(pagesRoot(root), outputPath), "<!doctype html>\n", "utf8");
  git(pagesRoot(root), ["init"]);
  git(pagesRoot(root), ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(pagesRoot(root), ["config", "user.email", "test@example.invalid"]);
  git(pagesRoot(root), ["config", "user.name", "Test User"]);
  git(pagesRoot(root), ["add", "."]);
  git(pagesRoot(root), ["commit", "-m", "Initial"]);
  if (withUpstream) {
    const remote = path.join(root, "remotes", "csc1120", "csc1120pages");
    fs.mkdirSync(remote, { recursive: true });
    git(remote, ["init", "--bare"]);
    git(pagesRoot(root), ["remote", "add", "origin", remote]);
    git(pagesRoot(root), ["push", "-u", "origin", "HEAD"]);
  }
  fs.writeFileSync(
    path.join(pagesRoot(root), outputPath),
    "<!doctype html><title>Updated</title>\n"
  );
  return root;
};

describe("studentRepositoryAccessPagePublishService", () => {
  it("stages, commits, and pushes only the generated access page", async () => {
    const root = createFixture();
    fs.writeFileSync(path.join(pagesRoot(root), "unrelated.txt"), "do not publish\n", "utf8");

    const result = await publishStudentRepositoryAccessPage(request(root), mappings);

    expect(result.status).toBe("success");
    expect(result.commitMessage).toBe("Publish student access page for lab02");
    expect(git(pagesRoot(root), ["show", "--format=", "--name-only", "HEAD"])).toBe(outputPath);
    expect(git(pagesRoot(root), ["status", "--porcelain"])).toContain("unrelated.txt");
  });

  it("blocks publishing when the generated page is missing", async () => {
    const root = createFixture();
    fs.unlinkSync(path.join(pagesRoot(root), outputPath));

    const result = await publishStudentRepositoryAccessPage(request(root), mappings);

    expect(result.status).toBe("failure");
    expect(result.diagnostics[0]?.message).toMatch(/Generate/u);
  });

  it("blocks an uncommitted page before staging when no upstream is configured", async () => {
    const root = createFixture(false);
    const headBefore = git(pagesRoot(root), ["rev-parse", "HEAD"]);

    const result = await publishStudentRepositoryAccessPage(request(root), mappings);

    expect(result.status).toBe("failure");
    expect(result.diagnostics[0]?.message).toMatch(/upstream/u);
    expect(git(pagesRoot(root), ["rev-parse", "HEAD"])).toBe(headBefore);
  });
});
