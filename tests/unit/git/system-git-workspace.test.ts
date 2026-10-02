import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  GitError,
  createExactCommitRevision,
  type ExactCommitRevision
} from "../../../src/git/git-workspace.js";
import { SystemGitWorkspaceFactory } from "../../../src/git/system-git-workspace.js";

const executeFile = promisify(execFile);
const temporaryDirectories: string[] = [];
const SHA_1_LENGTH = 40;
const SHA_256_LENGTH = 64;
const SHORT_SHA_LENGTH = SHA_1_LENGTH - 1;
const HISTORY_LIMIT = 2;

const exactCommit = (value: string): ExactCommitRevision => {
  const revision = createExactCommitRevision(value);
  if (revision === null) throw new Error("The test fixture must provide an exact commit ID.");
  return revision;
};

const git = async (directory: string, ...arguments_: readonly string[]): Promise<string> =>
  (await executeFile("git", ["-C", directory, ...arguments_])).stdout;

const createRepository = async (name = "repository") => {
  const parent = await mkdtemp(join(tmpdir(), "graider-git-workspace-"));
  temporaryDirectories.push(parent);
  const repository = join(parent, name);
  await mkdir(repository);
  await git(repository, "init");
  await git(repository, "config", "user.email", "faculty@example.test");
  await git(repository, "config", "user.name", "Faculty");
  await writeFile(join(repository, "submission.txt"), "first\n");
  await git(repository, "add", "submission.txt");
  await git(repository, "commit", "-m", "First subject");
  const first = (await git(repository, "rev-parse", "HEAD")).trim();
  await writeFile(join(repository, "submission.txt"), "second\n");
  await git(repository, "commit", "-am", "Second subject");
  const second = (await git(repository, "rev-parse", "HEAD")).trim();
  return { parent, repository, first, second };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("SystemGitWorkspaceFactory reader contract", () => {
  it("opens a repository from an interior path and returns its canonical root", async () => {
    const fixture = await createRepository("repository with spaces");
    const interior = join(fixture.repository, "nested", "directory");
    await mkdir(interior, { recursive: true });
    const factory = new SystemGitWorkspaceFactory();
    const canonicalRoot = await realpath(fixture.repository);

    await expect(factory.inspect(interior)).resolves.toEqual({
      kind: "repository",
      root: canonicalRoot
    });
    await expect(factory.open(interior)).resolves.toMatchObject({ root: canonicalRoot });
  });

  it("distinguishes a non-repository from an unavailable path", async () => {
    const parent = await mkdtemp(join(tmpdir(), "graider-git-workspace-non-repository-"));
    temporaryDirectories.push(parent);
    const missing = join(parent, "private missing path");
    const factory = new SystemGitWorkspaceFactory();

    await expect(factory.inspect(parent)).resolves.toEqual({ kind: "not_repository" });
    const unavailable = await factory.inspect(missing);
    expect(unavailable.kind).toBe("unavailable");
    if (unavailable.kind === "unavailable") {
      expect(unavailable.error).toMatchObject({
        kind: "repository_unavailable",
        operation: "open"
      });
      expect(unavailable.error.message).not.toContain(missing);
      expect(JSON.stringify(unavailable.error)).not.toContain(missing);
    }
  });

  it("resolves attached and detached HEAD to canonical object IDs", async () => {
    const fixture = await createRepository();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await expect(workspace.resolveHead()).resolves.toBe(fixture.second);
    await git(fixture.repository, "checkout", "--detach", fixture.first);
    await expect(workspace.resolveHead()).resolves.toBe(fixture.first);
  });

  it("reports an unborn HEAD as an unavailable revision", async () => {
    const parent = await mkdtemp(join(tmpdir(), "graider-git-workspace-unborn-"));
    temporaryDirectories.push(parent);
    await git(parent, "init");
    const workspace = await new SystemGitWorkspaceFactory().open(parent);

    await expect(workspace.resolveHead()).rejects.toMatchObject({
      kind: "revision_unavailable",
      operation: "resolve_head"
    });
  });

  it("resolves exact commits and rejects missing commits semantically", async () => {
    const fixture = await createRepository();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    const exact = exactCommit(fixture.first);
    const missing = exactCommit("f".repeat(SHA_1_LENGTH));

    await expect(workspace.resolveRevision(exact)).resolves.toBe(fixture.first);
    await expect(workspace.resolveRevision(missing)).rejects.toMatchObject({
      kind: "revision_unavailable",
      operation: "resolve_revision"
    });
  });

  it("rejects untrusted revision expressions before any workspace operation", () => {
    expect(createExactCommitRevision("HEAD --all")).toBeNull();
    expect(createExactCommitRevision("a".repeat(SHORT_SHA_LENGTH))).toBeNull();
    expect(createExactCommitRevision("a".repeat(SHA_1_LENGTH))).not.toBeNull();
    expect(createExactCommitRevision("a".repeat(SHA_256_LENGTH))).not.toBeNull();
  });

  it("returns bounded structured history newest-to-oldest from the exact anchor", async () => {
    const fixture = await createRepository();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    const anchor = await workspace.resolveRevision(exactCommit(fixture.second));

    const commits = await workspace.listCommits({ anchor, maximumCount: HISTORY_LIMIT });

    expect(commits).toHaveLength(HISTORY_LIMIT);
    expect(commits.map((commit) => commit.id)).toEqual([fixture.second, fixture.first]);
    expect(commits.map((commit) => commit.subject)).toEqual(["Second subject", "First subject"]);
    expect(commits.every((commit) => Number.isFinite(Date.parse(commit.committedAt)))).toBe(true);
  });

  it("rejects invalid history bounds with a safe semantic error", async () => {
    const fixture = await createRepository();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    const anchor = await workspace.resolveRevision(exactCommit(fixture.second));

    await expect(workspace.listCommits({ anchor, maximumCount: 0 })).rejects.toEqual(
      expect.objectContaining({ kind: "operation_rejected", operation: "list_commits" })
    );
  });

  it("does not expose raw Git stderr or private paths in enumerable errors", async () => {
    const privatePath = join(tmpdir(), "faculty-private-course-path");
    const factory = new SystemGitWorkspaceFactory();

    await expect(factory.open(privatePath)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(GitError);
      expect(error).toMatchObject({ kind: "repository_unavailable", operation: "open" });
      expect(String(error)).not.toContain(privatePath);
      expect(JSON.stringify(error)).not.toContain(privatePath);
      return true;
    });
  });
});
