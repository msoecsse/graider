import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  GitError,
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
  it("reports system Git availability without exposing a version string", async () => {
    await new SystemGitWorkspaceFactory().verifyAvailable();
  });

  it("maps an unavailable engine to a semantic availability error", async () => {
    const unavailableEngine = (): Promise<string> => {
      const error = Object.assign(new Error("missing executable"), { code: "ENOENT" });
      return Promise.reject(error);
    };
    const factory = new SystemGitWorkspaceFactory(unavailableEngine);

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
