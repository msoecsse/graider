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
  }
  return root;
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
    fs.writeFileSync(path.join(root, "course.yml"), "course:\n  code: Updated\n", "utf8");
    const before = git(root, ["rev-parse", "HEAD"]);

    const result = await publishCourseChanges(root);

    expect(result.status).toBe("failure");
    expect(result.diagnostics[0]?.message).toMatch(/upstream/u);
    expect(git(root, ["rev-parse", "HEAD"])).toBe(before);
  });

  it("blocks publishing when an unrelated file is already staged", async () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "course.yml"), "course:\n  code: Updated\n", "utf8");
    fs.writeFileSync(path.join(root, "notes.txt"), "unrelated\n", "utf8");
    git(root, ["add", "notes.txt"]);
    const before = git(root, ["rev-parse", "HEAD"]);

    const result = await publishCourseChanges(root);

    expect(result.status).toBe("failure");
    expect(result.diagnostics[0]?.message).toMatch(/already staged/u);
    expect(git(root, ["rev-parse", "HEAD"])).toBe(before);
  });
});
