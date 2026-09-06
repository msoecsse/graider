import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { LocalGitTemplateSyncGateway } from "../../../src/template-sync/local-git-template-sync-gateway.js";

const run = promisify(execFile);
const temporaryDirectories: string[] = [];
const template = { owner: "course", name: "template" };
const student = { owner: "course", name: "student", defaultBranch: "main" };

const git = async (directory: string, ...args: string[]): Promise<string> =>
  (await run("git", ["-C", directory, ...args])).stdout;

const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), "graider-template-sync-"));
  temporaryDirectories.push(root);
  const templateRemote = join(root, "template-remote.git");
  const studentRemote = join(root, "student-remote.git");
  const templateDirectory = join(root, "template");
  const studentDirectory = join(root, "student");
  await run("git", ["init", "--bare", templateRemote]);
  await run("git", ["clone", templateRemote, templateDirectory]);
  await git(templateDirectory, "config", "user.email", "faculty@example.test");
  await git(templateDirectory, "config", "user.name", "Faculty");
  await writeFile(join(templateDirectory, "shared.txt"), "base\n");
  await writeFile(join(templateDirectory, "student.txt"), "base\n");
  await writeFile(join(templateDirectory, "deleted.txt"), "delete me\n");
  await git(templateDirectory, "add", ".");
  await git(templateDirectory, "commit", "-m", "base");
  await git(templateDirectory, "branch", "-M", "main");
  await git(templateDirectory, "push", "-u", "origin", "main");
  await run("git", ["--git-dir", templateRemote, "symbolic-ref", "HEAD", "refs/heads/main"]);
  const base = (await git(templateDirectory, "rev-parse", "HEAD")).trim();

  await run("git", ["clone", templateRemote, studentDirectory]);
  await git(studentDirectory, "config", "user.email", "student@example.test");
  await git(studentDirectory, "config", "user.name", "Student");
  await run("git", ["init", "--bare", studentRemote]);
  await git(studentDirectory, "remote", "set-url", "origin", studentRemote);
  await git(studentDirectory, "push", "-u", "origin", "main");

  return { templateDirectory, studentDirectory, base };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("LocalGitTemplateSyncGateway", () => {
  it("three-way applies only template changes, including additions and deletions", async () => {
    const fixture = await setup();
    await writeFile(join(fixture.studentDirectory, "student.txt"), "student edit\n");
    await git(fixture.studentDirectory, "commit", "-am", "student work");
    await git(fixture.studentDirectory, "push");
    await writeFile(join(fixture.templateDirectory, "shared.txt"), "faculty edit\n");
    await writeFile(join(fixture.templateDirectory, "added.txt"), "new\n");
    await git(fixture.templateDirectory, "rm", "deleted.txt");
    await git(fixture.templateDirectory, "add", ".");
    await git(fixture.templateDirectory, "commit", "-m", "template update");
    const target = (await git(fixture.templateDirectory, "rev-parse", "HEAD")).trim();
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    const result = await gateway.applyAndPushTemplateDelta({
      templateRepository: template,
      studentRepository: student,
      templateBaseCommitSha: fixture.base,
      templateTargetCommitSha: target,
      studentBaseCommitSha: fixture.base,
      studentCurrentCommitSha: await gateway.getDefaultBranchCommitSha(student),
      changes: []
    });

    expect(result.status).toBe("clean");
    await expect(git(fixture.studentDirectory, "show", "HEAD:shared.txt")).resolves.toBe(
      "faculty edit\n"
    );
    await expect(git(fixture.studentDirectory, "show", "HEAD:student.txt")).resolves.toBe(
      "student edit\n"
    );
    await expect(git(fixture.studentDirectory, "show", "HEAD:added.txt")).resolves.toBe("new\n");
    await expect(
      git(fixture.studentDirectory, "cat-file", "-e", "HEAD:deleted.txt")
    ).rejects.toThrow();
  });

  it("prepares a faculty branch from the recorded student baseline after a conflict", async () => {
    const fixture = await setup();
    await writeFile(join(fixture.studentDirectory, "shared.txt"), "student edit\n");
    await git(fixture.studentDirectory, "commit", "-am", "student work");
    await git(fixture.studentDirectory, "push");
    const before = (await git(fixture.studentDirectory, "rev-parse", "HEAD")).trim();
    await writeFile(join(fixture.templateDirectory, "shared.txt"), "faculty edit\n");
    await git(fixture.templateDirectory, "commit", "-am", "template update");
    const target = (await git(fixture.templateDirectory, "rev-parse", "HEAD")).trim();
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    await expect(
      gateway.applyAndPushTemplateDelta({
        templateRepository: template,
        studentRepository: student,
        templateBaseCommitSha: fixture.base,
        templateTargetCommitSha: target,
        studentBaseCommitSha: fixture.base,
        studentCurrentCommitSha: before,
        changes: []
      })
    ).resolves.toEqual({ status: "conflict" });
    await expect(git(fixture.studentDirectory, "rev-parse", "HEAD")).resolves.toBe(`${before}\n`);
    await expect(git(fixture.studentDirectory, "status", "--porcelain")).resolves.toBe("");

    await gateway.prepareConflictBranch({
      templateRepository: template,
      studentRepository: student,
      templateBaseCommitSha: fixture.base,
      templateTargetCommitSha: target,
      studentBaseCommitSha: fixture.base,
      studentCurrentCommitSha: before,
      changes: [],
      branchName: "graider/template-update-123456789abc"
    });

    await expect(
      git(fixture.studentDirectory, "rev-parse", "graider/template-update-123456789abc^")
    ).resolves.toBe(`${fixture.base}\n`);
    await expect(
      git(fixture.studentDirectory, "show", "graider/template-update-123456789abc:shared.txt")
    ).resolves.toBe("faculty edit\n");
    await expect(git(fixture.studentDirectory, "rev-parse", "main")).resolves.toBe(`${before}\n`);
  });
});
