import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { LocalGitTemplateSyncGateway } from "../../../src/template-sync/local-git-template-sync-gateway.js";
import { getTemplateSyncFailure } from "../../../src/template-sync/template-sync-failure.js";

const run = promisify(execFile);
const temporaryDirectories: string[] = [];
const template = { owner: "course", name: "template" };
const student = { owner: "course", name: "student", defaultBranch: "main" };

const git = async (directory: string, ...args: string[]): Promise<string> =>
  (await run("git", ["-C", directory, ...args])).stdout;

const setup = async (
  studentDefaultBranch = "main",
  independentStudentHistory = false,
  includeStudentOnlyFile = false
) => {
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
  if (independentStudentHistory) {
    await git(studentDirectory, "checkout", "--orphan", "student-initial");
    if (includeStudentOnlyFile)
      await writeFile(join(studentDirectory, "student-only.txt"), "student only\n");
    await git(studentDirectory, "add", ".");
    await git(studentDirectory, "commit", "-m", "Independent student initial commit");
  }
  const studentBase = (await git(studentDirectory, "rev-parse", "HEAD")).trim();
  await run("git", ["init", "--bare", studentRemote]);
  await git(studentDirectory, "remote", "set-url", "origin", studentRemote);
  await git(studentDirectory, "branch", "-M", studentDefaultBranch);
  await git(studentDirectory, "push", "-u", "origin", studentDefaultBranch);
  await run("git", [
    "--git-dir",
    studentRemote,
    "symbolic-ref",
    "HEAD",
    `refs/heads/${studentDefaultBranch}`
  ]);

  return { templateDirectory, studentDirectory, studentRemote, base, studentBase };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("LocalGitTemplateSyncGateway", () => {
  it("recovers both anchors from the sole exact full-tree first-parent history match", async () => {
    const fixture = await setup("main", true);
    await writeFile(join(fixture.templateDirectory, "shared.txt"), "faculty update\n");
    await git(fixture.templateDirectory, "commit", "-am", "template update");
    const target = (await git(fixture.templateDirectory, "rev-parse", "HEAD")).trim();
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    await expect(
      gateway.recoverTemplateAndStudentBaseline({
        templateRepository: template,
        studentRepository: student,
        currentTemplateCommitSha: target
      })
    ).resolves.toEqual({
      status: "recovered",
      templateCommitSha: fixture.base,
      studentDefaultBranchCommitSha: fixture.studentBase
    });
  });

  it("does not recover both anchors when template files are only a subset of student state", async () => {
    const fixture = await setup("main", true, true);
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    await expect(
      gateway.recoverTemplateAndStudentBaseline({
        templateRepository: template,
        studentRepository: student,
        currentTemplateCommitSha: fixture.base
      })
    ).resolves.toEqual({ status: "not_found" });
  });

  it("does not choose among multiple exact full-tree history pairings", async () => {
    const fixture = await setup("main", true);
    await git(fixture.templateDirectory, "commit", "--allow-empty", "-m", "same template tree");
    const target = (await git(fixture.templateDirectory, "rev-parse", "HEAD")).trim();
    await git(fixture.studentDirectory, "commit", "--allow-empty", "-m", "same student tree");
    await git(fixture.studentDirectory, "push");
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    await expect(
      gateway.recoverTemplateAndStudentBaseline({
        templateRepository: template,
        studentRepository: student,
        currentTemplateCommitSha: target
      })
    ).resolves.toEqual({ status: "ambiguous" });
  });

  it("ignores a matching template commit outside first-parent history", async () => {
    const fixture = await setup("main", true, true);
    await git(fixture.templateDirectory, "switch", "-c", "feature");
    await writeFile(join(fixture.templateDirectory, "shared.txt"), "feature\n");
    await git(fixture.templateDirectory, "commit", "-am", "feature change");
    const feature = (await git(fixture.templateDirectory, "rev-parse", "HEAD")).trim();
    await git(fixture.templateDirectory, "switch", "main");
    await writeFile(join(fixture.templateDirectory, "student.txt"), "main\n");
    await git(fixture.templateDirectory, "commit", "-am", "main change");
    await git(fixture.templateDirectory, "merge", "--no-ff", "feature", "-m", "merge feature");
    const target = (await git(fixture.templateDirectory, "rev-parse", "HEAD")).trim();
    await git(fixture.studentDirectory, "rm", "student-only.txt");
    await writeFile(join(fixture.studentDirectory, "shared.txt"), "feature\n");
    await git(fixture.studentDirectory, "add", ".");
    await git(fixture.studentDirectory, "commit", "-m", "matches feature only");
    await git(fixture.studentDirectory, "push");
    expect((await git(fixture.templateDirectory, "rev-parse", `${feature}^{tree}`)).trim()).toBe(
      (await git(fixture.studentDirectory, "rev-parse", "HEAD^{tree}")).trim()
    );
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    await expect(
      gateway.recoverTemplateAndStudentBaseline({
        templateRepository: template,
        studentRepository: student,
        currentTemplateCommitSha: target
      })
    ).resolves.toEqual({ status: "not_found" });
  });

  it("recovers an independent initial student commit with an identical tree", async () => {
    const fixture = await setup("main", true);
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    expect(fixture.studentBase).not.toBe(fixture.base);
    await expect(
      gateway.recoverStudentBaseline({
        templateRepository: template,
        studentRepository: student,
        templateCommitSha: fixture.base
      })
    ).resolves.toEqual({
      status: "recovered",
      studentDefaultBranchCommitSha: fixture.studentBase
    });
  });

  it("finds the historical matching commit instead of current HEAD", async () => {
    const fixture = await setup("main", true);
    await writeFile(join(fixture.studentDirectory, "shared.txt"), "student edit\n");
    await git(fixture.studentDirectory, "commit", "-am", "student work");
    await git(fixture.studentDirectory, "push");
    const currentHead = (await git(fixture.studentDirectory, "rev-parse", "HEAD")).trim();
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    await expect(
      gateway.recoverStudentBaseline({
        templateRepository: template,
        studentRepository: student,
        templateCommitSha: fixture.base
      })
    ).resolves.toEqual({
      status: "recovered",
      studentDefaultBranchCommitSha: fixture.studentBase
    });
    expect(currentHead).not.toBe(fixture.studentBase);
  });

  it("uses exact template-managed path state when the student tree has extra paths", async () => {
    const fixture = await setup("main", true, true);
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    await expect(
      gateway.recoverStudentBaseline({
        templateRepository: template,
        studentRepository: student,
        templateCommitSha: fixture.base
      })
    ).resolves.toEqual({
      status: "recovered",
      studentDefaultBranchCommitSha: fixture.studentBase
    });
  });

  it("does not recover when no historical commit matches", async () => {
    const fixture = await setup("main", true);
    await writeFile(join(fixture.templateDirectory, "shared.txt"), "never in student history\n");
    await git(fixture.templateDirectory, "commit", "-am", "unmatched template revision");
    const unmatchedTemplateCommit = (
      await git(fixture.templateDirectory, "rev-parse", "HEAD")
    ).trim();
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    await expect(
      gateway.recoverStudentBaseline({
        templateRepository: template,
        studentRepository: student,
        templateCommitSha: unmatchedTemplateCommit
      })
    ).resolves.toEqual({ status: "not_found" });
  });

  it("does not recover when multiple historical commits have the same valid state", async () => {
    const fixture = await setup("main", true);
    await writeFile(join(fixture.studentDirectory, "shared.txt"), "temporary edit\n");
    await git(fixture.studentDirectory, "commit", "-am", "temporary student edit");
    await writeFile(join(fixture.studentDirectory, "shared.txt"), "base\n");
    await git(fixture.studentDirectory, "commit", "-am", "restore template state");
    await git(fixture.studentDirectory, "push");
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    await expect(
      gateway.recoverStudentBaseline({
        templateRepository: template,
        studentRepository: student,
        templateCommitSha: fixture.base
      })
    ).resolves.toEqual({ status: "ambiguous" });
  });

  it("does not mutate the remote student branch while recovering", async () => {
    const fixture = await setup("main", true);
    const before = (
      await run("git", ["--git-dir", fixture.studentRemote, "show-ref", "refs/heads/main"])
    ).stdout;
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    await gateway.recoverStudentBaseline({
      templateRepository: template,
      studentRepository: student,
      templateCommitSha: fixture.base
    });

    const after = (
      await run("git", ["--git-dir", fixture.studentRemote, "show-ref", "refs/heads/main"])
    ).stdout;
    expect(after).toBe(before);
  });

  it("pushes a clean update to the resolved nonstandard default branch", async () => {
    const defaultBranch = "release/course";
    const fixture = await setup(defaultBranch);
    await writeFile(join(fixture.templateDirectory, "shared.txt"), "faculty edit\n");
    await git(fixture.templateDirectory, "commit", "-am", "template update");
    const target = (await git(fixture.templateDirectory, "rev-parse", "HEAD")).trim();
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    const result = await gateway.applyAndPushTemplateDelta({
      templateRepository: template,
      studentRepository: { ...student, defaultBranch },
      templateBaseCommitSha: fixture.base,
      templateTargetCommitSha: target,
      studentBaseCommitSha: fixture.base,
      studentCurrentCommitSha: await gateway.getDefaultBranchCommitSha(),
      changes: []
    });

    expect(result.status).toBe("clean");
    expect(
      (
        await run("git", [
          "--git-dir",
          fixture.studentRemote,
          "rev-parse",
          `refs/heads/${defaultBranch}`
        ])
      ).stdout.trim()
    ).toBe(result.status === "clean" ? result.commitSha : "");
  });

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
      studentCurrentCommitSha: await gateway.getDefaultBranchCommitSha(),
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

  it("classifies a rejected student push without exposing Git command details", async () => {
    const fixture = await setup();
    await writeFile(join(fixture.templateDirectory, "shared.txt"), "faculty edit\n");
    await git(fixture.templateDirectory, "commit", "-am", "template update");
    const target = (await git(fixture.templateDirectory, "rev-parse", "HEAD")).trim();
    await git(fixture.studentDirectory, "remote", "set-url", "origin", join("missing", "repo.git"));
    const gateway = new LocalGitTemplateSyncGateway(fixture);

    const error = await gateway
      .applyAndPushTemplateDelta({
        templateRepository: template,
        studentRepository: student,
        templateBaseCommitSha: fixture.base,
        templateTargetCommitSha: target,
        studentBaseCommitSha: fixture.base,
        studentCurrentCommitSha: await gateway.getDefaultBranchCommitSha(),
        changes: []
      })
      .catch((caught: unknown) => caught);

    expect(getTemplateSyncFailure(error)).toEqual({
      stage: "push_failed",
      message: "Push to student repository was rejected."
    });
    expect(JSON.stringify(getTemplateSyncFailure(error))).not.toMatch(
      /missing|git|authorization/iu
    );
  });
});
