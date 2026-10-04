import { execFile } from "node:child_process";
import { access, chmod, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  GitError,
  createBranchName,
  createExactCommitRevision,
  createRelativeGitPath,
  createRemoteName,
  createTrustedGitRemote,
  type ExactCommitRevision,
  type RelativeGitPath
} from "../../../src/git/git-workspace.js";
import { SystemGitWorkspaceFactory } from "../../../src/git/system-git-workspace.js";

const executeFile = promisify(execFile);
const temporaryDirectories: string[] = [];
const SHA_1_LENGTH = 40;
const SHA_256_LENGTH = 64;
const SHORT_SHA_LENGTH = SHA_1_LENGTH - 1;
const HISTORY_LIMIT = 2;
const EXECUTABLE_FILE_MODE = 0o755;
const BYTE_SIX = 6;
const BYTE_SEVEN = 7;
const BYTE_EIGHT = 8;
const BYTE_NINE = 9;
const MAX_BYTE = 0xff;

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

const createBareRemoteFixture = async (branch: string) => {
  const fixture = await createRepository("remote source");
  const remote = join(fixture.parent, "remote with spaces.git");
  await git(fixture.repository, "branch", "-M", branch);
  await git(fixture.parent, "init", "--bare", remote);
  await git(fixture.repository, "remote", "add", "origin", remote);
  await git(fixture.repository, "push", "origin", branch);
  await git(remote, "symbolic-ref", "HEAD", `refs/heads/${branch}`);
  const trustedRemote = createTrustedGitRemote(remote);
  if (trustedRemote === null) throw new Error("The test remote must be trusted.");
  const destination = join(fixture.parent, "prepared clone with spaces");
  const workspace = await new SystemGitWorkspaceFactory().clone({
    remote: trustedRemote,
    destination,
    checkout: "none"
  });
  return { ...fixture, remote, destination, workspace };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("SystemGitWorkspaceFactory reader contract", () => {
  it("reports system Git availability without exposing a version string", async () => {
    await new SystemGitWorkspaceFactory().verifyAvailable();
  });

  it("maps an unavailable engine to a semantic availability error", async () => {
    const unavailableEngine = (): Promise<string> => {
      const error = Object.assign(new Error("missing executable"), { code: "ENOENT" });
      return Promise.reject(error);
    };
    const factory = new SystemGitWorkspaceFactory({ runGit: unavailableEngine });

    await expect(factory.verifyAvailable()).rejects.toMatchObject({
      kind: "engine_unavailable",
      operation: "verify_available"
    });
  });

  it("clones with the default checkout and returns an opened canonical workspace", async () => {
    const fixture = await createRepository("source with spaces");
    const destination = join(fixture.parent, "clone with spaces");
    const remote = createTrustedGitRemote(fixture.repository);
    if (remote === null) throw new Error("The test remote must be trusted.");

    const workspace = await new SystemGitWorkspaceFactory().clone({
      remote,
      destination,
      checkout: "default"
    });

    expect(workspace.root).toBe(await realpath(destination));
    await expect(workspace.resolveHead()).resolves.toBe(fixture.second);
    await expect(readFile(join(destination, "submission.txt"), "utf8")).resolves.toBe("second\n");
  });

  it("clones without checkout while retaining remote refs and resolvable commits", async () => {
    const fixture = await createRepository("no checkout source with spaces");
    const destination = join(fixture.parent, "no checkout clone with spaces");
    const remote = createTrustedGitRemote(fixture.repository);
    if (remote === null) throw new Error("The test remote must be trusted.");

    const workspace = await new SystemGitWorkspaceFactory().clone({
      remote,
      destination,
      checkout: "none"
    });

    expect(workspace.root).toBe(await realpath(destination));
    await expect(access(join(destination, "submission.txt"))).rejects.toBeDefined();
    await expect(workspace.resolveRevision(exactCommit(fixture.second))).resolves.toBe(
      fixture.second
    );
    expect(
      (await git(destination, "for-each-ref", "--format=%(refname)", "refs/remotes")).trim()
    ).toContain("refs/remotes/origin/");
  });

  it("rejects an existing clone destination without modifying it", async () => {
    const fixture = await createRepository();
    const destination = join(fixture.parent, "existing destination");
    await mkdir(destination);
    await writeFile(join(destination, "preserved.txt"), "preserved\n");
    const remote = createTrustedGitRemote(fixture.repository);
    if (remote === null) throw new Error("The test remote must be trusted.");

    await expect(
      new SystemGitWorkspaceFactory().clone({ remote, destination, checkout: "default" })
    ).rejects.toMatchObject({ kind: "operation_rejected", operation: "clone" });
    await expect(readFile(join(destination, "preserved.txt"), "utf8")).resolves.toBe("preserved\n");
  });

  it("maps a failed clone to a safe semantic error", async () => {
    const parent = await mkdtemp(join(tmpdir(), "graider-git-workspace-clone-failure-"));
    temporaryDirectories.push(parent);
    const remote = createTrustedGitRemote(join(parent, "private missing remote"));
    if (remote === null) throw new Error("The test remote must be trusted.");

    await expect(
      new SystemGitWorkspaceFactory().clone({
        remote,
        destination: join(parent, "destination"),
        checkout: "default"
      })
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toMatchObject({ kind: "remote_unavailable", operation: "clone" });
      expect(JSON.stringify(error)).not.toContain("private missing remote");
      return true;
    });
  });

  it("rejects control characters in untrusted clone remotes", () => {
    expect(createTrustedGitRemote("-c\u0000bad.option=true")).toBeNull();
  });

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

describe("SystemGitWorkspace template tree and history contract", () => {
  const origin = createRemoteName("origin");
  if (origin === null) throw new Error("The origin remote must be trusted.");

  it("resolves an exact commit tree and recursively lists structured entries deterministically", async () => {
    const fixture = await createRepository("tree repository with spaces");
    await mkdir(join(fixture.repository, "nested folder"));
    await writeFile(join(fixture.repository, "nested folder", "path with spaces.txt"), "nested\n");
    await writeFile(join(fixture.repository, "executable.sh"), "#!/bin/sh\nexit 0\n");
    await chmod(join(fixture.repository, "executable.sh"), EXECUTABLE_FILE_MODE);
    await git(fixture.repository, "add", ".");
    await git(fixture.repository, "commit", "-m", "Tree fixtures");
    const commit = await (
      await new SystemGitWorkspaceFactory().open(fixture.repository)
    ).resolveHead();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    const tree = await workspace.resolveTree(commit);
    const entries = await workspace.listTree(commit);

    expect(tree).toBe((await git(fixture.repository, "rev-parse", `${commit}^{tree}`)).trim());
    expect(entries.map((entry) => entry.path)).toEqual([
      "executable.sh",
      "nested folder/path with spaces.txt",
      "submission.txt"
    ]);
    expect(entries.find((entry) => entry.path === "executable.sh")).toMatchObject({
      mode: "100755",
      objectType: "blob"
    });
    expect(entries.every((entry) => entry.objectId.length === SHA_1_LENGTH)).toBe(true);
  });

  it("parses unusual valid filenames without line or space splitting", async () => {
    const fixture = await createRepository("unusual tree paths");
    const unusualPath = "line break\nand tab\tand backslash\\name.txt";
    await writeFile(join(fixture.repository, unusualPath), "unusual\n");
    await git(fixture.repository, "add", ".");
    await git(fixture.repository, "commit", "-m", "Unusual path");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    const entries = await workspace.listTree(await workspace.resolveHead());

    expect(entries.map((entry) => entry.path)).toContain(unusualPath);
  });

  it("returns commit and tree IDs from first-parent history only", async () => {
    const fixture = await createRepository();
    await git(fixture.repository, "switch", "-c", "feature");
    await writeFile(join(fixture.repository, "feature.txt"), "feature\n");
    await git(fixture.repository, "add", "feature.txt");
    await git(fixture.repository, "commit", "-m", "Feature");
    const feature = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    await git(fixture.repository, "switch", "-");
    await writeFile(join(fixture.repository, "main.txt"), "main\n");
    await git(fixture.repository, "add", "main.txt");
    await git(fixture.repository, "commit", "-m", "Main");
    const main = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    await git(fixture.repository, "merge", "--no-ff", "feature", "-m", "Merge feature");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    const merge = await workspace.resolveHead();

    const history = await workspace.listFirstParentCommitTrees(merge);

    expect(history.map((item) => item.commit)).toEqual([
      merge,
      main,
      fixture.second,
      fixture.first
    ]);
    expect(history.map((item) => item.commit)).not.toContain(feature);
    for (const item of history) {
      expect(item.tree).toBe(
        (await git(fixture.repository, "rev-parse", `${item.commit}^{tree}`)).trim()
      );
    }
  });

  it("resolves a validated remote-tracking branch to an exact commit", async () => {
    const fixture = await createBareRemoteFixture("release/course");
    const branch = createBranchName("release/course");
    const missing = createBranchName("missing");
    if (branch === null || missing === null) throw new Error("The branches must be trusted.");

    await expect(fixture.workspace.resolveRemoteBranch(origin, branch)).resolves.toBe(
      fixture.second
    );
    await expect(fixture.workspace.resolveRemoteBranch(origin, missing)).rejects.toMatchObject({
      kind: "revision_unavailable",
      operation: "resolve_remote_branch"
    });
  });
});

describe("SystemGitWorkspace binary revision diff contract", () => {
  it("returns binary-safe patch bytes between exact commits and represents an empty diff", async () => {
    const fixture = await createRepository();
    await writeFile(join(fixture.repository, "binary.dat"), Buffer.from([0, 1, 2, 3, MAX_BYTE]));
    await git(fixture.repository, "add", "binary.dat");
    await git(fixture.repository, "commit", "-m", "Add binary");
    const base = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    await writeFile(
      join(fixture.repository, "binary.dat"),
      Buffer.from([0, BYTE_NINE, BYTE_EIGHT, BYTE_SEVEN, MAX_BYTE])
    );
    await git(fixture.repository, "commit", "-am", "Change binary");
    const target = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    const baseCommit = await workspace.resolveRevision(exactCommit(base));
    const targetCommit = await workspace.resolveRevision(exactCommit(target));

    const changed = await workspace.diff({ base: baseCommit, target: targetCommit });
    const empty = await workspace.diff({ base: targetCommit, target: targetCommit });

    expect(changed.patch).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(changed.patch).toString("ascii")).toContain("GIT binary patch");
    expect(empty.patch).toEqual(new Uint8Array());
  });
});

describe("SystemGitWorkspace three-way indexed patch contract", () => {
  const createPatchFixture = async () => {
    const fixture = await createRepository("template source");
    await writeFile(join(fixture.repository, "deleted.txt"), "remove me\n");
    await git(fixture.repository, "add", "deleted.txt");
    await git(fixture.repository, "commit", "-m", "Template base");
    const base = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    const student = join(fixture.parent, "student workspace");
    await git(fixture.parent, "clone", fixture.repository, student);
    await git(student, "config", "user.email", "student@example.test");
    await git(student, "config", "user.name", "Student");
    return { ...fixture, base, student };
  };

  it("applies template changes to index/worktree while preserving unrelated student work", async () => {
    const fixture = await createPatchFixture();
    await writeFile(join(fixture.student, "student-only.txt"), "student work\n");
    await git(fixture.student, "add", "student-only.txt");
    await git(fixture.student, "commit", "-m", "Student work");
    await writeFile(join(fixture.repository, "submission.txt"), "template target\n");
    await writeFile(join(fixture.repository, "added file.txt"), "added\n");
    await rm(join(fixture.repository, "deleted.txt"));
    await git(fixture.repository, "add", ".");
    await git(fixture.repository, "commit", "-m", "Template target");
    const target = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    const templateWorkspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    const studentWorkspace = await new SystemGitWorkspaceFactory().open(fixture.student);
    const patch = await templateWorkspace.diff({
      base: await templateWorkspace.resolveRevision(exactCommit(fixture.base)),
      target: await templateWorkspace.resolveRevision(exactCommit(target))
    });

    await expect(studentWorkspace.applyPatchToIndex({ patch: patch.patch })).resolves.toEqual({
      kind: "applied"
    });

    const state = await studentWorkspace.inspect();
    expect(state.workingTree.conflicts).toEqual([]);
    expect(state.workingTree.trackedChanges).toEqual([]);
    expect(state.workingTree.stagedChanges).toEqual(
      expect.arrayContaining([
        { kind: "modified", path: "submission.txt" },
        { kind: "added", path: "added file.txt" },
        { kind: "deleted", path: "deleted.txt" }
      ])
    );
    await expect(readFile(join(fixture.student, "student-only.txt"), "utf8")).resolves.toBe(
      "student work\n"
    );
    await expect(readFile(join(fixture.student, "submission.txt"), "utf8")).resolves.toBe(
      "template target\n"
    );
  });

  it("returns a typed conflict when student and template edits are incompatible", async () => {
    const fixture = await createPatchFixture();
    await writeFile(join(fixture.student, "submission.txt"), "student version\n");
    await git(fixture.student, "commit", "-am", "Student edit");
    await writeFile(join(fixture.repository, "submission.txt"), "template version\n");
    await git(fixture.repository, "commit", "-am", "Template edit");
    const target = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    const templateWorkspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    const studentWorkspace = await new SystemGitWorkspaceFactory().open(fixture.student);
    const patch = await templateWorkspace.diff({
      base: await templateWorkspace.resolveRevision(exactCommit(fixture.base)),
      target: await templateWorkspace.resolveRevision(exactCommit(target))
    });

    await expect(studentWorkspace.applyPatchToIndex({ patch: patch.patch })).resolves.toEqual({
      kind: "conflict"
    });
    expect((await studentWorkspace.inspect()).workingTree.conflicts).toEqual([
      expect.objectContaining({ path: "submission.txt" })
    ]);
  });

  it("applies a binary-file patch without transforming its bytes", async () => {
    const fixture = await createPatchFixture();
    const baseBytes = Buffer.from([0, 1, 2, 3, 4, MAX_BYTE]);
    const targetBytes = Buffer.from([0, BYTE_EIGHT, BYTE_SEVEN, BYTE_SIX, 5, MAX_BYTE]);
    await writeFile(join(fixture.repository, "asset.bin"), baseBytes);
    await git(fixture.repository, "add", "asset.bin");
    await git(fixture.repository, "commit", "-m", "Binary base");
    const binaryBase = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    await git(fixture.student, "fetch", "origin");
    await git(fixture.student, "reset", "--hard", binaryBase);
    await writeFile(join(fixture.repository, "asset.bin"), targetBytes);
    await git(fixture.repository, "commit", "-am", "Binary target");
    const binaryTarget = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    const templateWorkspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    const studentWorkspace = await new SystemGitWorkspaceFactory().open(fixture.student);
    const patch = await templateWorkspace.diff({
      base: await templateWorkspace.resolveRevision(exactCommit(binaryBase)),
      target: await templateWorkspace.resolveRevision(exactCommit(binaryTarget))
    });

    await expect(studentWorkspace.applyPatchToIndex({ patch: patch.patch })).resolves.toEqual({
      kind: "applied"
    });
    expect(await readFile(join(fixture.student, "asset.bin"))).toEqual(targetBytes);
  });
});

describe("SystemGitWorkspace structured inspection contract", () => {
  const createTrackedRepository = async (name = "repository") => {
    const fixture = await createRepository(name);
    const remote = join(fixture.parent, "upstream.git");
    await git(fixture.parent, "init", "--bare", remote);
    await git(fixture.repository, "remote", "add", "origin", remote);
    await git(fixture.repository, "push", "-u", "origin", "HEAD");
    return { ...fixture, remote };
  };

  it("reports clean attached HEAD and a current configured upstream", async () => {
    const fixture = await createTrackedRepository("repository with spaces");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await expect(workspace.inspect()).resolves.toMatchObject({
      kind: "repository",
      root: await realpath(fixture.repository),
      head: { kind: "attached", commit: fixture.second },
      workingTree: {
        trackedChanges: [],
        stagedChanges: [],
        untrackedPaths: [],
        conflicts: []
      },
      upstream: {
        kind: "configured",
        remote: "origin",
        ahead: 0,
        behind: 0,
        relation: "current"
      }
    });
  });

  it("keeps unstaged, staged, untracked, deletion, and rename changes structured", async () => {
    const fixture = await createTrackedRepository();
    await writeFile(join(fixture.repository, "submission.txt"), "unstaged\n");
    await writeFile(join(fixture.repository, "delete.txt"), "delete\n");
    await writeFile(join(fixture.repository, "rename source.txt"), "rename\n");
    await git(fixture.repository, "add", "delete.txt", "rename source.txt");
    await git(fixture.repository, "commit", "-m", "Add rename fixtures");
    await git(fixture.repository, "push");
    await writeFile(join(fixture.repository, "staged file.txt"), "staged\n");
    await git(fixture.repository, "add", "staged file.txt");
    await writeFile(join(fixture.repository, "untracked file.txt"), "untracked\n");
    await rm(join(fixture.repository, "delete.txt"));
    await git(fixture.repository, "mv", "rename source.txt", "rename destination.txt");

    const state = await (await new SystemGitWorkspaceFactory().open(fixture.repository)).inspect();

    expect(state.workingTree.trackedChanges).toEqual(
      expect.arrayContaining([
        { kind: "modified", path: "submission.txt" },
        { kind: "deleted", path: "delete.txt" }
      ])
    );
    expect(state.workingTree.stagedChanges).toEqual(
      expect.arrayContaining([
        { kind: "added", path: "staged file.txt" },
        {
          kind: "renamed",
          path: "rename destination.txt",
          originalPath: "rename source.txt"
        }
      ])
    );
    expect(state.workingTree.untrackedPaths).toContain("untracked file.txt");
  });

  it("distinguishes realistic merge conflicts from ordinary changes", async () => {
    const fixture = await createTrackedRepository();
    await git(fixture.repository, "checkout", "-b", "other");
    await writeFile(join(fixture.repository, "submission.txt"), "other\n");
    await git(fixture.repository, "commit", "-am", "Other change");
    await git(fixture.repository, "checkout", "-");
    await writeFile(join(fixture.repository, "submission.txt"), "main\n");
    await git(fixture.repository, "commit", "-am", "Main change");
    await expect(git(fixture.repository, "merge", "other")).rejects.toBeDefined();

    const state = await (await new SystemGitWorkspaceFactory().open(fixture.repository)).inspect();

    expect(state.workingTree.conflicts).toEqual([
      expect.objectContaining({ path: "submission.txt" })
    ]);
    expect(state.workingTree.trackedChanges).toEqual([]);
    expect(state.workingTree.stagedChanges).toEqual([]);
  });

  it("limits only working-tree paths while retaining global repository state", async () => {
    const fixture = await createTrackedRepository();
    await writeFile(join(fixture.repository, "submission.txt"), "changed\n");
    await writeFile(join(fixture.repository, "other file.txt"), "other\n");
    const selected = createRelativeGitPath("submission.txt");
    if (selected === null) throw new Error("The test path must be trusted.");

    const state = await (
      await new SystemGitWorkspaceFactory().open(fixture.repository)
    ).inspect({ paths: [selected] });

    expect(state.workingTree.trackedChanges).toEqual([
      { kind: "modified", path: "submission.txt" }
    ]);
    expect(state.workingTree.untrackedPaths).toEqual([]);
    expect(state.upstream).toMatchObject({ kind: "configured", relation: "current" });
  });

  it("validates and normalizes repository-relative paths", () => {
    expect(createRelativeGitPath("folder\\file with spaces.txt")).toBe(
      "folder/file with spaces.txt"
    );
    expect(createRelativeGitPath("/absolute.txt")).toBeNull();
    expect(createRelativeGitPath("../escape.txt")).toBeNull();
    expect(createRelativeGitPath("folder/../escape.txt")).toBeNull();
    expect(createRelativeGitPath("")).toBeNull();
    expect(createRelativeGitPath("bad\u0000path")).toBeNull();
  });

  it("reports missing, ahead, behind, and diverged upstream relations without fetching", async () => {
    const missingFixture = await createRepository("missing upstream");
    const missingWorkspace = await new SystemGitWorkspaceFactory().open(missingFixture.repository);
    await expect(missingWorkspace.inspect()).resolves.toMatchObject({
      upstream: { kind: "missing" }
    });

    const fixture = await createTrackedRepository("local repository");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    await git(fixture.repository, "commit", "--allow-empty", "-m", "Local ahead");
    await expect(workspace.inspect()).resolves.toMatchObject({
      upstream: { relation: "ahead", ahead: 1, behind: 0 }
    });

    const secondClone = join(fixture.parent, "second clone");
    await git(fixture.parent, "clone", fixture.remote, secondClone);
    await git(secondClone, "config", "user.email", "other@example.test");
    await git(secondClone, "config", "user.name", "Other");
    await git(secondClone, "commit", "--allow-empty", "-m", "Remote ahead");
    await git(secondClone, "push");
    await git(fixture.repository, "fetch", "origin");
    await expect(workspace.inspect()).resolves.toMatchObject({
      upstream: { relation: "diverged", ahead: 1, behind: 1 }
    });

    const branch = (await git(fixture.repository, "branch", "--show-current")).trim();
    await git(fixture.repository, "reset", "--hard", `origin/${branch}`);
    await git(secondClone, "commit", "--allow-empty", "-m", "Remote further ahead");
    await git(secondClone, "push");
    await git(fixture.repository, "fetch", "origin");
    await expect(workspace.inspect()).resolves.toMatchObject({
      upstream: { relation: "behind", ahead: 0, behind: 1 }
    });
  });

  it("reports detached and unborn HEAD states", async () => {
    const fixture = await createRepository();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    await git(fixture.repository, "checkout", "--detach", fixture.first);
    await expect(workspace.inspect()).resolves.toMatchObject({
      head: { kind: "detached", commit: fixture.first }
    });

    const unbornRoot = await mkdtemp(join(tmpdir(), "graider-git-unborn-"));
    temporaryDirectories.push(unbornRoot);
    await git(unbornRoot, "init");
    const unborn = await new SystemGitWorkspaceFactory().open(unbornRoot);
    await expect(unborn.inspect()).resolves.toMatchObject({
      head: { kind: "unborn" },
      upstream: { kind: "missing" }
    });
  });

  it("resolves a trusted remote URL and represents a missing remote as null", async () => {
    const fixture = await createTrackedRepository();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    const origin = createRemoteName("origin");
    const missing = createRemoteName("missing");
    if (origin === null || missing === null) throw new Error("The test remotes must be trusted.");

    await expect(workspace.remoteUrl(origin)).resolves.toBe(fixture.remote);
    await expect(workspace.remoteUrl(missing)).resolves.toBeNull();
    expect(createRemoteName("--upload-pack=bad")).toBeNull();
  });
});

describe("SystemGitWorkspace template preparation contract", () => {
  const origin = createRemoteName("origin");
  if (origin === null) throw new Error("The origin remote must be trusted.");

  it("validates trusted branch names without accepting revision expressions", () => {
    expect(createBranchName("main")).toBe("main");
    expect(createBranchName("master")).toBe("master");
    expect(createBranchName("release/course")).toBe("release/course");
    expect(createBranchName("--detach")).toBeNull();
    expect(createBranchName("HEAD~1")).toBeNull();
    expect(createBranchName("main^{commit}")).toBeNull();
    expect(createBranchName("bad\u0000branch")).toBeNull();
    expect(createBranchName("refs/heads/main")).toBeNull();
  });

  it.each(["main", "master", "release/course"])(
    "resolves an existing remote default branch named %s",
    async (branch) => {
      const fixture = await createBareRemoteFixture(branch);
      await expect(fixture.workspace.remoteDefaultBranch(origin)).resolves.toBe(branch);
    }
  );

  it("returns null when the remote default symbolic ref is missing", async () => {
    const fixture = await createBareRemoteFixture("main");
    await git(fixture.destination, "update-ref", "-d", "refs/remotes/origin/HEAD");

    await expect(fixture.workspace.remoteDefaultBranch(origin)).resolves.toBeNull();
  });

  it("returns null when the remote default symbolic ref names a nonexistent branch", async () => {
    const fixture = await createBareRemoteFixture("main");
    await git(
      fixture.destination,
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/remotes/origin/missing"
    );

    await expect(fixture.workspace.remoteDefaultBranch(origin)).resolves.toBeNull();
  });

  it("returns null when the requested remote is missing", async () => {
    const fixture = await createBareRemoteFixture("main");
    const missing = createRemoteName("missing");
    if (missing === null) throw new Error("The missing remote name must be trusted.");

    await expect(fixture.workspace.remoteDefaultBranch(missing)).resolves.toBeNull();
  });

  it("checks out an exact commit with detached HEAD and returns that commit", async () => {
    const fixture = await createBareRemoteFixture("main");

    await expect(fixture.workspace.checkoutDetached(exactCommit(fixture.first))).resolves.toBe(
      fixture.first
    );
    await expect(fixture.workspace.inspect()).resolves.toMatchObject({
      head: { kind: "detached", commit: fixture.first }
    });
    await expect(readFile(join(fixture.destination, "submission.txt"), "utf8")).resolves.toBe(
      "first\n"
    );
  });

  it("reports a missing exact commit as an unavailable revision", async () => {
    const fixture = await createBareRemoteFixture("main");

    await expect(
      fixture.workspace.checkoutDetached(exactCommit("f".repeat(SHA_1_LENGTH)))
    ).rejects.toMatchObject({ kind: "revision_unavailable", operation: "resolve_revision" });
  });

  it("defensively rejects an invalid branded checkout revision", async () => {
    const fixture = await createBareRemoteFixture("main");

    await expect(
      fixture.workspace.checkoutDetached("HEAD --force" as ExactCommitRevision)
    ).rejects.toMatchObject({ kind: "operation_rejected", operation: "checkout" });
  });

  it("does not force checkout over conflicting working-tree changes", async () => {
    const fixture = await createRepository();
    await writeFile(join(fixture.repository, "submission.txt"), "local change\n");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await expect(workspace.checkoutDetached(exactCommit(fixture.first))).rejects.toMatchObject({
      kind: "operation_rejected",
      operation: "checkout"
    });
    await expect(readFile(join(fixture.repository, "submission.txt"), "utf8")).resolves.toBe(
      "local change\n"
    );
  });

  it("creates an absent local branch from the matching remote branch", async () => {
    const fixture = await createBareRemoteFixture("main");
    const main = createBranchName("main");
    if (main === null) throw new Error("The branch must be trusted.");
    await git(fixture.destination, "update-ref", "-d", "refs/heads/main");

    await expect(
      fixture.workspace.createOrResetBranch({
        branch: main,
        startPoint: { remote: origin, branch: main }
      })
    ).resolves.toBe(fixture.second);
    await expect(fixture.workspace.inspect()).resolves.toMatchObject({
      head: { kind: "attached", branch: "main", commit: fixture.second }
    });
  });

  it("resets an existing local branch to the remote-tracking commit without mutating remote refs", async () => {
    const fixture = await createBareRemoteFixture("main");
    const main = createBranchName("main");
    if (main === null) throw new Error("The branch must be trusted.");
    const remoteRefsBefore = await git(
      fixture.destination,
      "for-each-ref",
      "--format=%(refname):%(objectname)",
      "refs/remotes"
    );
    await fixture.workspace.createOrResetBranch({
      branch: main,
      startPoint: { remote: origin, branch: main }
    });
    await git(fixture.destination, "config", "user.email", "faculty@example.test");
    await git(fixture.destination, "config", "user.name", "Faculty");
    await git(fixture.destination, "commit", "--allow-empty", "-m", "Local only");

    await expect(
      fixture.workspace.createOrResetBranch({
        branch: main,
        startPoint: { remote: origin, branch: main }
      })
    ).resolves.toBe(fixture.second);
    await expect(fixture.workspace.inspect()).resolves.toMatchObject({
      head: { kind: "attached", branch: "main", commit: fixture.second }
    });
    expect(
      await git(
        fixture.destination,
        "for-each-ref",
        "--format=%(refname):%(objectname)",
        "refs/remotes"
      )
    ).toBe(remoteRefsBefore);
  });

  it("creates a slash-containing branch from its remote-tracking branch", async () => {
    const fixture = await createBareRemoteFixture("release/course");
    const branch = createBranchName("release/course");
    if (branch === null) throw new Error("The branch must be trusted.");
    await git(fixture.destination, "update-ref", "-d", "refs/heads/release/course");

    await fixture.workspace.createOrResetBranch({
      branch,
      startPoint: { remote: origin, branch }
    });

    await expect(fixture.workspace.inspect()).resolves.toMatchObject({
      head: { kind: "attached", branch: "release/course", commit: fixture.second }
    });
  });

  it("fails safely when the requested remote branch does not exist", async () => {
    const fixture = await createBareRemoteFixture("main");
    const missing = createBranchName("missing");
    if (missing === null) throw new Error("The branch must be trusted.");

    await expect(
      fixture.workspace.createOrResetBranch({
        branch: missing,
        startPoint: { remote: origin, branch: missing }
      })
    ).rejects.toMatchObject({ kind: "revision_unavailable", operation: "branch" });
  });

  it("creates a new local branch at current detached HEAD and switches existing branches", async () => {
    const fixture = await createBareRemoteFixture("main");
    const managed = createBranchName("graider/template-update-123456789abc");
    const main = createBranchName("main");
    if (managed === null || main === null) throw new Error("The branches must be trusted.");
    await fixture.workspace.checkoutDetached(exactCommit(fixture.first));

    await expect(fixture.workspace.createBranch(managed)).resolves.toBe(fixture.first);
    await expect(fixture.workspace.inspect()).resolves.toMatchObject({
      head: { kind: "attached", branch: managed, commit: fixture.first }
    });
    await expect(fixture.workspace.createBranch(managed)).rejects.toMatchObject({
      kind: "operation_rejected",
      operation: "branch"
    });
    await expect(fixture.workspace.switchBranch(main)).resolves.toBe(fixture.second);
    await expect(fixture.workspace.inspect()).resolves.toMatchObject({
      head: { kind: "attached", branch: main, commit: fixture.second }
    });
  });
});

describe("SystemGitWorkspace exact-path staging contract", () => {
  const trustedPath = (value: string) => {
    const relativePath = createRelativeGitPath(value);
    if (relativePath === null) throw new Error("The test path must be trusted.");
    return relativePath;
  };

  it("stages only the explicitly supplied path", async () => {
    const fixture = await createRepository();
    await writeFile(join(fixture.repository, "submission.txt"), "changed\n");
    await writeFile(join(fixture.repository, "unrelated.txt"), "unrelated\n");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await workspace.stage([trustedPath("submission.txt")]);

    const state = await workspace.inspect();
    expect(state.workingTree.stagedChanges).toEqual([{ kind: "modified", path: "submission.txt" }]);
    expect(state.workingTree.untrackedPaths).toEqual(["unrelated.txt"]);
  });

  it("stages a tracked deletion by exact path", async () => {
    const fixture = await createRepository();
    await rm(join(fixture.repository, "submission.txt"));
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await workspace.stage([trustedPath("submission.txt")]);

    await expect(workspace.inspect()).resolves.toMatchObject({
      workingTree: {
        stagedChanges: [{ kind: "deleted", path: "submission.txt" }],
        trackedChanges: []
      }
    });
  });

  it("stages a repository-relative path containing spaces", async () => {
    const fixture = await createRepository();
    await writeFile(join(fixture.repository, "page with spaces.html"), "page\n");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await workspace.stage([trustedPath("page with spaces.html")]);

    await expect(workspace.inspect()).resolves.toMatchObject({
      workingTree: {
        stagedChanges: [{ kind: "added", path: "page with spaces.html" }]
      }
    });
  });

  it("rejects an empty list without staging unrelated changes", async () => {
    const fixture = await createRepository();
    await writeFile(join(fixture.repository, "submission.txt"), "changed\n");
    await writeFile(join(fixture.repository, "unrelated.txt"), "unrelated\n");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await expect(workspace.stage([])).rejects.toMatchObject({
      kind: "operation_rejected",
      operation: "stage"
    });
    await expect(workspace.inspect()).resolves.toMatchObject({
      workingTree: { stagedChanges: [] }
    });
  });

  it("rejects invalid paths before they can reach a workspace operation", () => {
    expect(createRelativeGitPath("../private-course/secret.txt")).toBeNull();
    expect(createRelativeGitPath("-n")).not.toBeNull();
  });

  it("defensively rejects an invalid branded path before Git execution", async () => {
    const fixture = await createRepository();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await expect(
      workspace.stage(["../private-course/secret.txt" as RelativeGitPath])
    ).rejects.toMatchObject({ kind: "operation_rejected", operation: "stage" });
  });
});

describe("SystemGitWorkspace commit contract", () => {
  const trustedPath = (value: string) => {
    const relativePath = createRelativeGitPath(value);
    if (relativePath === null) throw new Error("The test path must be trusted.");
    return relativePath;
  };

  it("commits staged changes and returns the new HEAD object ID", async () => {
    const fixture = await createRepository();
    await writeFile(join(fixture.repository, "submission.txt"), "published\n");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    await workspace.stage([trustedPath("submission.txt")]);

    const commit = await workspace.commit({ message: "Publish course changes" });

    expect(commit).toBe((await git(fixture.repository, "rev-parse", "HEAD")).trim());
    expect((await git(fixture.repository, "log", "-1", "--format=%s")).trim()).toBe(
      "Publish course changes"
    );
  });

  it("fails semantically without staged changes and creates no commit", async () => {
    const fixture = await createRepository();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await expect(workspace.commit({ message: "Nothing to commit" })).rejects.toMatchObject({
      kind: "operation_rejected",
      operation: "commit"
    });
    await expect(workspace.resolveHead()).resolves.toBe(fixture.second);
  });

  it("creates and returns an allow-empty commit only when explicitly requested", async () => {
    const fixture = await createRepository();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    const commit = await workspace.commit({ message: "Apply template update", allowEmpty: true });

    expect(commit).not.toBe(fixture.second);
    expect((await git(fixture.repository, "rev-parse", `${commit}^`)).trim()).toBe(fixture.second);
    expect((await git(fixture.repository, "log", "-1", "--format=%s")).trim()).toBe(
      "Apply template update"
    );
  });

  it("uses the repository-configured author identity", async () => {
    const fixture = await createRepository();
    await git(fixture.repository, "config", "user.name", "Configured Faculty");
    await git(fixture.repository, "config", "user.email", "configured@example.test");
    await writeFile(join(fixture.repository, "submission.txt"), "authored\n");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    await workspace.stage([trustedPath("submission.txt")]);

    await workspace.commit({ message: "Configured identity" });

    expect((await git(fixture.repository, "log", "-1", "--format=%an <%ae>")).trim()).toBe(
      "Configured Faculty <configured@example.test>"
    );
  });

  it("commits punctuation and spaces literally without shell interpretation", async () => {
    const fixture = await createRepository();
    await writeFile(join(fixture.repository, "submission.txt"), "literal\n");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    await workspace.stage([trustedPath("submission.txt")]);
    const message = "Publish: faculty's page; $(touch should-not-run) & finish";

    await workspace.commit({ message });

    expect((await git(fixture.repository, "log", "-1", "--format=%s")).trim()).toBe(message);
    await expect(
      readFile(join(fixture.repository, "should-not-run"), "utf8")
    ).rejects.toBeDefined();
  });

  it("rejects an empty commit message", async () => {
    const fixture = await createRepository();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await expect(workspace.commit({ message: "   " })).rejects.toMatchObject({
      kind: "operation_rejected",
      operation: "commit"
    });
  });
});

describe("SystemGitWorkspace upstream push contract", () => {
  const createUpstreamRepository = async () => {
    const fixture = await createRepository("faculty repository");
    const remote = join(fixture.parent, "private upstream.git");
    await git(fixture.parent, "init", "--bare", remote);
    await git(fixture.repository, "remote", "add", "origin", remote);
    await git(fixture.repository, "push", "-u", "origin", "HEAD");
    return { ...fixture, remote };
  };

  it("pushes the current branch to its already-configured upstream", async () => {
    const fixture = await createUpstreamRepository();
    await git(fixture.repository, "commit", "--allow-empty", "-m", "Local publication");
    const localHead = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await expect(workspace.pushUpstream()).resolves.toEqual({ kind: "pushed" });

    expect((await git(fixture.remote, "rev-parse", "HEAD")).trim()).toBe(localHead);
  });

  it("rejects a divergent push without overwriting the remote or local commit", async () => {
    const fixture = await createUpstreamRepository();
    const secondClone = join(fixture.parent, "other faculty clone");
    await git(fixture.parent, "clone", fixture.remote, secondClone);
    await git(secondClone, "config", "user.name", "Other Faculty");
    await git(secondClone, "config", "user.email", "other@example.test");
    await git(secondClone, "commit", "--allow-empty", "-m", "Remote publication");
    await git(secondClone, "push");
    const remoteHead = (await git(fixture.remote, "rev-parse", "HEAD")).trim();
    await git(fixture.repository, "commit", "--allow-empty", "-m", "Local publication");
    const localHead = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await expect(workspace.pushUpstream()).rejects.toMatchObject({
      kind: "remote_unavailable",
      operation: "push"
    });

    expect((await git(fixture.repository, "rev-parse", "HEAD")).trim()).toBe(localHead);
    expect((await git(fixture.remote, "rev-parse", "HEAD")).trim()).toBe(remoteHead);
  });

  it("fails semantically when the current branch has no upstream", async () => {
    const fixture = await createRepository();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await expect(workspace.pushUpstream()).rejects.toMatchObject({
      kind: "remote_unavailable",
      operation: "push"
    });
    await expect(workspace.inspect()).resolves.toMatchObject({ upstream: { kind: "missing" } });
  });

  it("keeps raw remote errors and private paths out of enumerable error data", async () => {
    const fixture = await createUpstreamRepository();
    const secondClone = join(fixture.parent, "private competing clone");
    await git(fixture.parent, "clone", fixture.remote, secondClone);
    await git(secondClone, "config", "user.name", "Other Faculty");
    await git(secondClone, "config", "user.email", "other@example.test");
    await git(secondClone, "commit", "--allow-empty", "-m", "Remote publication");
    await git(secondClone, "push");
    await git(fixture.repository, "commit", "--allow-empty", "-m", "Local publication");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);

    await expect(workspace.pushUpstream()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(GitError);
      expect(JSON.stringify(error)).not.toContain(fixture.remote);
      expect(JSON.stringify(error)).not.toContain("fetch first");
      expect(String(error)).not.toContain("rejected");
      return true;
    });
  });
});

describe("SystemGitWorkspace explicit branch push contract", () => {
  it("pushes current HEAD non-forcibly to the requested remote branch without requiring upstream", async () => {
    const fixture = await createRepository("explicit push repository");
    const remote = join(fixture.parent, "explicit remote.git");
    await git(fixture.parent, "init", "--bare", remote);
    await git(fixture.repository, "remote", "add", "origin", remote);
    await git(fixture.repository, "commit", "--allow-empty", "-m", "Template update");
    const head = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    const origin = createRemoteName("origin");
    const branch = createBranchName("release/course");
    if (origin === null || branch === null) throw new Error("The push target must be trusted.");

    await expect(workspace.pushBranch({ remote: origin, branch })).resolves.toEqual({
      kind: "pushed"
    });

    expect((await git(remote, "rev-parse", "refs/heads/release/course")).trim()).toBe(head);
    expect((await git(fixture.repository, "branch", "--show-current")).trim()).not.toBe(
      "release/course"
    );
  });

  it("rejects a non-fast-forward explicit push without overwriting either side", async () => {
    const fixture = await createRepository("divergent explicit push repository");
    const remote = join(fixture.parent, "divergent explicit remote.git");
    await git(fixture.parent, "init", "--bare", remote);
    await git(fixture.repository, "branch", "-M", "main");
    await git(fixture.repository, "remote", "add", "origin", remote);
    await git(fixture.repository, "push", "origin", "main");
    await git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
    const competitor = join(fixture.parent, "competitor");
    await git(fixture.parent, "clone", remote, competitor);
    await git(competitor, "config", "user.email", "other@example.test");
    await git(competitor, "config", "user.name", "Other");
    await git(competitor, "commit", "--allow-empty", "-m", "Remote advance");
    await git(competitor, "push");
    const remoteHead = (await git(remote, "rev-parse", "refs/heads/main")).trim();
    await git(fixture.repository, "commit", "--allow-empty", "-m", "Local advance");
    const localHead = (await git(fixture.repository, "rev-parse", "HEAD")).trim();
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    const origin = createRemoteName("origin");
    const main = createBranchName("main");
    if (origin === null || main === null) throw new Error("The push target must be trusted.");

    await expect(workspace.pushBranch({ remote: origin, branch: main })).rejects.toMatchObject({
      kind: "remote_unavailable",
      operation: "push"
    });
    expect((await git(remote, "rev-parse", "refs/heads/main")).trim()).toBe(remoteHead);
    expect((await git(fixture.repository, "rev-parse", "HEAD")).trim()).toBe(localHead);
  });
});

describe("SystemGitWorkspace disposable-attempt restoration contract", () => {
  it("restores exact HEAD, discards index/worktree changes, removes untracked content, and preserves siblings", async () => {
    const fixture = await createRepository("disposable repository");
    const outside = join(fixture.parent, "outside sibling.txt");
    await writeFile(outside, "preserve me\n");
    await git(fixture.repository, "commit", "--allow-empty", "-m", "Attempt commit");
    await writeFile(join(fixture.repository, "staged.txt"), "staged\n");
    await git(fixture.repository, "add", "staged.txt");
    await writeFile(join(fixture.repository, "submission.txt"), "unstaged\n");
    await writeFile(join(fixture.repository, "untracked.txt"), "untracked\n");
    await mkdir(join(fixture.repository, "untracked directory"));
    await writeFile(join(fixture.repository, "untracked directory", "nested.txt"), "nested\n");
    const workspace = await new SystemGitWorkspaceFactory().open(fixture.repository);
    const expectedHead = await workspace.resolveRevision(exactCommit(fixture.second));

    await workspace.restoreDisposableAttempt({ expectedHead, removeUntracked: true });

    await expect(workspace.resolveHead()).resolves.toBe(fixture.second);
    await expect(workspace.inspect()).resolves.toMatchObject({
      workingTree: {
        trackedChanges: [],
        stagedChanges: [],
        untrackedPaths: [],
        conflicts: []
      }
    });
    await expect(readFile(join(fixture.repository, "submission.txt"), "utf8")).resolves.toBe(
      "second\n"
    );
    await expect(access(join(fixture.repository, "staged.txt"))).rejects.toBeDefined();
    await expect(access(join(fixture.repository, "untracked.txt"))).rejects.toBeDefined();
    await expect(access(join(fixture.repository, "untracked directory"))).rejects.toBeDefined();
    await expect(readFile(outside, "utf8")).resolves.toBe("preserve me\n");
  });
});

describe("SystemGitWorkspace managed branch deletion contract", () => {
  const origin = createRemoteName("origin");
  if (origin === null) throw new Error("The origin remote must be trusted.");

  it("deletes the named remote branch then force-deletes an inactive local managed branch", async () => {
    const fixture = await createBareRemoteFixture("main");
    const managed = createBranchName("graider/template-update-123456789abc");
    const main = createBranchName("main");
    if (managed === null || main === null) throw new Error("The branches must be trusted.");
    await fixture.workspace.createBranch(managed);
    await git(fixture.destination, "config", "user.email", "faculty@example.test");
    await git(fixture.destination, "config", "user.name", "Faculty");
    await git(fixture.destination, "commit", "--allow-empty", "-m", "Managed branch");
    await fixture.workspace.pushBranch({ remote: origin, branch: managed });
    await fixture.workspace.switchBranch(main);

    await fixture.workspace.deleteRemoteBranch({ remote: origin, branch: managed });
    await fixture.workspace.deleteLocalBranch({ branch: managed, force: true });

    await expect(
      git(fixture.remote, "show-ref", "--verify", `refs/heads/${managed}`)
    ).rejects.toBeDefined();
    await expect(
      git(fixture.destination, "show-ref", "--verify", `refs/heads/${managed}`)
    ).rejects.toBeDefined();
  });

  it("refuses to delete the currently checked-out local branch", async () => {
    const fixture = await createBareRemoteFixture("main");
    const main = createBranchName("main");
    if (main === null) throw new Error("The branch must be trusted.");

    await expect(
      fixture.workspace.deleteLocalBranch({ branch: main, force: true })
    ).rejects.toMatchObject({ kind: "operation_rejected", operation: "branch" });
    await expect(fixture.workspace.inspect()).resolves.toMatchObject({
      head: { kind: "attached", branch: main }
    });
  });
});
