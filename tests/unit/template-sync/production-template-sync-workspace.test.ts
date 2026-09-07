import { execFile as executeFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubClientError } from "../../../src/github/github-errors.js";
import {
  createGitHubPullRequestGateway,
  withProductionTemplateSyncWorkspace
} from "../../../src/template-sync/production-template-sync-workspace.js";
import { getTemplateSyncFailure } from "../../../src/template-sync/template-sync-failure.js";

const input = {
  templateCloneUrl: "https://github.com/course/template.git",
  studentCloneUrl: "https://github.com/course/student.git",
  templateCommitSha: "target",
  studentDefaultBranch: "main",
  token: "secret-token",
  githubClient: {} as never
};

const execFile = promisify(executeFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    })
  );
});

const runGit = async (directory: string | undefined, args: string[]): Promise<string> => {
  const { stdout } = await execFile(
    "git",
    [...(directory === undefined ? [] : ["-C", directory]), ...args],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  return stdout.trim();
};

const createBareRemote = async (
  root: string,
  name: string,
  branch: string
): Promise<{ remote: string; sha: string }> => {
  const source = join(root, `${name}-source`);
  const remote = join(root, `${name}.git`);
  await runGit(undefined, ["init", source]);
  await runGit(source, ["config", "user.name", "Graider Test"]);
  await runGit(source, ["config", "user.email", "graider@example.test"]);
  await writeFile(join(source, "README.md"), `${name}\n`);
  await runGit(source, ["add", "README.md"]);
  await runGit(source, ["commit", "-m", "Initial commit"]);
  await runGit(source, ["branch", "-M", branch]);
  await runGit(undefined, ["init", "--bare", remote]);
  await runGit(source, ["remote", "add", "origin", remote]);
  await runGit(source, ["push", "origin", branch]);
  await runGit(undefined, ["--git-dir", remote, "symbolic-ref", "HEAD", `refs/heads/${branch}`]);
  return { remote, sha: await runGit(source, ["rev-parse", "HEAD"]) };
};

const createWorkspaceFixture = async (studentBranch: string) => {
  const root = await mkdtemp(join(tmpdir(), "graider-workspace-test-"));
  temporaryDirectories.push(root);
  const template = await createBareRemote(root, "template", "main");
  const student = await createBareRemote(root, "student", studentBranch);
  return { template, student };
};

describe("production template-sync diagnostics", () => {
  it.each([
    [1, "template_clone_failed", "Unable to clone template repository."],
    [2, "student_clone_failed", "Unable to clone student repository."]
  ])("classifies clone failure at Git call %i", async (failureCall, stage, message) => {
    let calls = 0;
    const runGit = vi.fn(async () => {
      calls += 1;
      if (calls === failureCall) {
        throw new Error(
          "AUTHORIZATION: basic secret-token https://github.com/private/repo /tmp/workspace"
        );
      }
      return { stdout: "" };
    });

    const error = await withProductionTemplateSyncWorkspace(input, async () => "unused", {
      runGit
    }).catch((caught: unknown) => caught);

    expect(getTemplateSyncFailure(error)).toEqual({ stage, message });
    expect(JSON.stringify(getTemplateSyncFailure(error))).not.toMatch(
      /secret-token|authorization|private|workspace/iu
    );
  });

  it("classifies GitHub permission failures with a fixed safe message", async () => {
    const gateway = createGitHubPullRequestGateway({
      findPullRequest: vi.fn(async () => {
        throw new GitHubClientError("permission_denied", "denied secret-token");
      })
    } as never);

    const error = await gateway
      .findPullRequest({
        repository: { owner: "course", name: "student", defaultBranch: "main" },
        sourceBranch: "graider/template-update-target",
        targetBranch: "main"
      })
      .catch((caught: unknown) => caught);

    expect(getTemplateSyncFailure(error)).toEqual({
      stage: "permission_denied",
      message: "GitHub denied access to the repository."
    });
    expect(JSON.stringify(getTemplateSyncFailure(error))).not.toContain("secret-token");
  });
});

describe("production student default-branch checkout", () => {
  it.each([
    ["main", "master"],
    ["master", "main"],
    ["main", "release/course"]
  ])(
    "ignores supplied branch %s and creates local remote default branch %s",
    async (suppliedBranch, remoteDefaultBranch) => {
      const { template, student } = await createWorkspaceFixture(remoteDefaultBranch);
      const remoteRefsBefore = await runGit(undefined, [
        "--git-dir",
        student.remote,
        "for-each-ref",
        "--format=%(refname):%(objectname)",
        "refs/heads"
      ]);
      const calls: string[][] = [];
      let studentDirectory: string | undefined;
      let cloneCount = 0;

      await withProductionTemplateSyncWorkspace(
        {
          ...input,
          templateCloneUrl: template.remote,
          studentCloneUrl: student.remote,
          templateCommitSha: template.sha,
          studentDefaultBranch: suppliedBranch,
          token: null
        },
        async (workspace) => {
          expect(workspace.studentDefaultBranch).toBe(remoteDefaultBranch);
          expect(studentDirectory).toBeDefined();
          expect(await runGit(studentDirectory, ["branch", "--show-current"])).toBe(
            remoteDefaultBranch
          );
          expect(await runGit(studentDirectory, ["rev-parse", "HEAD"])).toBe(student.sha);
          expect(
            await runGit(studentDirectory, [
              "rev-parse",
              `refs/remotes/origin/${remoteDefaultBranch}`
            ])
          ).toBe(student.sha);
        },
        {
          runGit: async (directory, args) => {
            calls.push(args);
            if (args[0] === "clone") {
              cloneCount += 1;
              if (cloneCount === 2) studentDirectory = args.at(-1);
            }
            return { stdout: await runGit(directory, args) };
          }
        }
      );

      expect(calls).toContainEqual([
        "symbolic-ref",
        "--quiet",
        "--short",
        "refs/remotes/origin/HEAD"
      ]);
      expect(calls).toContainEqual([
        "show-ref",
        "--verify",
        "--quiet",
        `refs/remotes/origin/${remoteDefaultBranch}`
      ]);
      expect(calls).toContainEqual([
        "checkout",
        "-B",
        remoteDefaultBranch,
        `origin/${remoteDefaultBranch}`
      ]);
      expect(
        await runGit(undefined, [
          "--git-dir",
          student.remote,
          "for-each-ref",
          "--format=%(refname):%(objectname)",
          "refs/heads"
        ])
      ).toBe(remoteRefsBefore);
    }
  );

  it("fails safely when origin/HEAD does not identify an existing remote branch", async () => {
    const { template, student } = await createWorkspaceFixture("main");
    await runGit(undefined, [
      "--git-dir",
      student.remote,
      "symbolic-ref",
      "HEAD",
      "refs/heads/missing"
    ]);
    const operation = vi.fn(async () => "unused");
    const calls: string[][] = [];

    const error = await withProductionTemplateSyncWorkspace(
      {
        ...input,
        templateCloneUrl: template.remote,
        studentCloneUrl: student.remote,
        templateCommitSha: template.sha,
        studentDefaultBranch: "main",
        token: null
      },
      operation,
      {
        runGit: async (directory, args) => {
          calls.push(args);
          return { stdout: await runGit(directory, args) };
        }
      }
    ).catch((caught: unknown) => caught);

    expect(getTemplateSyncFailure(error)).toEqual({
      stage: "student_checkout_failed",
      message: "Graider could not determine the repository default branch."
    });
    expect(calls).toContainEqual([
      "symbolic-ref",
      "--quiet",
      "--short",
      "refs/remotes/origin/HEAD"
    ]);
    expect(operation).not.toHaveBeenCalled();
  });
});
