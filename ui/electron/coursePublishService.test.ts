import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getCoursePublishStatus, publishCourseChanges } from "./coursePublishService";

const git = (root: string, arguments_: readonly string[]): string =>
  execFileSync("git", arguments_, { cwd: root, encoding: "utf8" }).trim();

const fixture = (withUpstream = true): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-course-publish-"));
  fs.mkdirSync(path.join(root, "terms", "27s1", "rosters"), { recursive: true });
  fs.writeFileSync(path.join(root, "course.yml"), "course:\n  code: CSC1120\n", "utf8");
  fs.writeFileSync(path.join(root, "terms", "27s1", "term.yml"), "term: 27s1\n", "utf8");
  git(root, ["init"]);
  git(root, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Test User"]);
  git(root, ["add", "course.yml", "terms/27s1/term.yml"]);
  git(root, ["commit", "-m", "Initial"]);
  if (withUpstream) {
    const remote = path.join(root, "remote");
    fs.mkdirSync(remote);
    git(remote, ["init", "--bare"]);
    git(root, ["remote", "add", "origin", remote]);
    git(root, ["push", "-u", "origin", "HEAD"]);
    git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  }
  return root;
};

const writeCommentLibrary = (root: string, title: string): string => {
  const libraryPath = path.join(root, ".graider", "grading", "comments.json");
  fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
  fs.writeFileSync(
    libraryPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        comments: [
          {
            id: title.toLowerCase().replaceAll(" ", "-"),
            title,
            text: `${title} text`,
            defaultDeduction: -1,
            tags: []
          }
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return libraryPath;
};

describe("coursePublishService", () => {
  it("stages and commits only allowlisted Graider course files", async () => {
    const root = fixture();
    const roster = path.join(root, "terms", "27s1", "rosters", "section-001.csv");
    fs.writeFileSync(roster, "student_id\nada\n", "utf8");
    fs.writeFileSync(path.join(root, "notes.txt"), "unrelated\n", "utf8");

    const status = await getCoursePublishStatus(root);
    const result = await publishCourseChanges(root);

    expect(status.allowedChangedFiles).toContain("terms/27s1/rosters/section-001.csv");
    expect(result.status).toBe("success");
    expect(result.commitMessage).toBe("Publish Graider course changes");
    expect(git(root, ["show", "--format=", "--name-only", "HEAD"])).toBe(
      "terms/27s1/rosters/section-001.csv"
    );
    expect(git(root, ["status", "--porcelain"])).toContain("notes.txt");
  });

  it("publishes assignment groups without staging unrelated files", async () => {
    const root = fixture();
    const groups = path.join(root, "terms", "27s1", "assignments", "lab01", "groups.csv");
    fs.mkdirSync(path.dirname(groups), { recursive: true });
    fs.writeFileSync(groups, "group_id,student_id\nteam-1,ada\n", "utf8");
    fs.writeFileSync(path.join(root, "notes.txt"), "unrelated\n", "utf8");

    const result = await publishCourseChanges(root);

    expect(result.status).toBe("success");
    expect(git(root, ["show", "--format=", "--name-only", "HEAD"])).toBe(
      "terms/27s1/assignments/lab01/groups.csv"
    );
    expect(git(root, ["status", "--porcelain"])).toContain("notes.txt");
  });

  it("allows only the exact canonical comment-library path under .graider", async () => {
    const root = fixture();
    writeCommentLibrary(root, "Canonical");
    for (const relativePath of [
      ".graider/grading/other.json",
      ".graider/grading/comments.json.bak",
      ".graider/comments.json",
      ".graider/grading/subdir/comments.json"
    ]) {
      const unrelatedPath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(unrelatedPath), { recursive: true });
      fs.writeFileSync(unrelatedPath, "{}\n", "utf8");
    }

    const status = await getCoursePublishStatus(root);
    const result = await publishCourseChanges(root);

    expect(status.allowedChangedFiles).toEqual([".graider/grading/comments.json"]);
    expect(status.unrelatedChangedFiles).toEqual(
      expect.arrayContaining([
        ".graider/comments.json",
        ".graider/grading/comments.json.bak",
        ".graider/grading/other.json",
        ".graider/grading/subdir/comments.json"
      ])
    );
    expect(result.status).toBe("success");
    expect(git(root, ["show", "--format=", "--name-only", "HEAD"])).toBe(
      ".graider/grading/comments.json"
    );
    expect(git(root, ["status", "--porcelain"])).toContain(".graider/grading/other.json");
  });

  it("publishes tracked comment-library edits including an entry deletion rewrite", async () => {
    const root = fixture();
    const libraryPath = writeCommentLibrary(root, "Original");
    expect((await publishCourseChanges(root)).status).toBe("success");

    writeCommentLibrary(root, "Edited");
    expect((await publishCourseChanges(root)).status).toBe("success");
    expect(git(root, ["show", "--format=", "--name-only", "HEAD"])).toBe(
      ".graider/grading/comments.json"
    );

    fs.writeFileSync(
      libraryPath,
      `${JSON.stringify({ schemaVersion: 1, comments: [] }, null, 2)}\n`,
      "utf8"
    );
    expect((await publishCourseChanges(root)).status).toBe("success");
    expect(git(root, ["show", "HEAD:.graider/grading/comments.json"])).toContain('"comments": []');
  });

  it("commits an allowed tracked file deletion", async () => {
    const root = fixture();
    const roster = path.join(root, "terms", "27s1", "rosters", "section-001.csv");
    fs.writeFileSync(roster, "student_id\nada\n", "utf8");
    git(root, ["add", "terms/27s1/rosters/section-001.csv"]);
    git(root, ["commit", "-m", "Add roster"]);
    git(root, ["push"]);
    fs.rmSync(roster);

    const result = await publishCourseChanges(root);

    expect(result.status).toBe("success");
    expect(git(root, ["show", "--format=", "--name-status", "HEAD"])).toBe(
      "D\tterms/27s1/rosters/section-001.csv"
    );
  });

  it("reports unrelated-only changes without committing them", async () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "notes.txt"), "unrelated\n", "utf8");

    const status = await getCoursePublishStatus(root);
    const result = await publishCourseChanges(root);

    expect(status.status).toBe("unrelated_changes");
    expect(result.status).toBe("up_to_date");
    expect(git(root, ["log", "-1", "--format=%s"])).toBe("Initial");
  });

  it("blocks changes before staging when the course branch has no upstream", async () => {
    const root = fixture(false);
    const libraryPath = writeCommentLibrary(root, "Saved locally");
    const before = git(root, ["rev-parse", "HEAD"]);

    const result = await publishCourseChanges(root);

    expect(result.status).toBe("failure");
    expect(result.diagnostics[0]?.message).toMatch(/upstream/u);
    expect(git(root, ["rev-parse", "HEAD"])).toBe(before);
    expect(fs.readFileSync(libraryPath, "utf8")).toContain("Saved locally");
  });

  it("blocks publishing when an unrelated file is already staged", async () => {
    const root = fixture();
    const libraryPath = writeCommentLibrary(root, "Saved locally");
    fs.writeFileSync(path.join(root, "notes.txt"), "unrelated\n", "utf8");
    git(root, ["add", "notes.txt"]);
    const before = git(root, ["rev-parse", "HEAD"]);

    const result = await publishCourseChanges(root);

    expect(result.status).toBe("failure");
    expect(result.diagnostics[0]?.message).toMatch(/already staged/u);
    expect(git(root, ["rev-parse", "HEAD"])).toBe(before);
    expect(git(root, ["diff", "--cached", "--name-only"])).toBe("notes.txt");
    expect(fs.readFileSync(libraryPath, "utf8")).toContain("Saved locally");
  });

  it("preserves a stale faculty clone's local comment commit when push diverges", async () => {
    const staleFaculty = fixture();
    const remote = path.join(staleFaculty, "remote");
    const currentFaculty = fs.mkdtempSync(path.join(os.tmpdir(), "graider-course-faculty-a-"));
    execFileSync("git", ["clone", remote, currentFaculty], { encoding: "utf8" });
    git(currentFaculty, ["config", "user.email", "faculty-a@example.invalid"]);
    git(currentFaculty, ["config", "user.name", "Faculty A"]);
    writeCommentLibrary(currentFaculty, "Faculty A comment");
    git(currentFaculty, ["add", ".graider/grading/comments.json"]);
    git(currentFaculty, ["commit", "-m", "Add faculty A comment"]);
    git(currentFaculty, ["push"]);

    const staleLibraryPath = writeCommentLibrary(staleFaculty, "Faculty B comment");
    const before = git(staleFaculty, ["rev-parse", "HEAD"]);
    const result = await publishCourseChanges(staleFaculty);
    const status = await getCoursePublishStatus(staleFaculty);

    expect(result.status).toBe("failure");
    expect(result.diagnostics[0]?.message).toMatch(/push/u);
    expect(git(staleFaculty, ["rev-parse", "HEAD"])).not.toBe(before);
    expect(status.status).toBe("unpushed");
    expect(status.aheadCount).toBe(1);
    expect(fs.readFileSync(staleLibraryPath, "utf8")).toContain("Faculty B comment");
    expect(git(remote, ["show", "main:.graider/grading/comments.json"])).toContain(
      "Faculty A comment"
    );
    expect(git(remote, ["show", "main:.graider/grading/comments.json"])).not.toContain(
      "Faculty B comment"
    );
  });
});
