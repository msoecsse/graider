import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolveGitBinary } from "dugite";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBranchName,
  createExactCommitRevision,
  createGitAuthenticationContext,
  createRelativeGitPath,
  createRemoteName,
  createTrustedGitRemote,
  type GitAuthenticationContext
} from "../../../src/git/git-workspace.js";
import type { GitCredentialResolver } from "../../../src/git/git-credential-resolver.js";
import {
  GitCommandWorkspaceFactory,
  type GitCommandExecutionRequest,
  type GitCommandRunner
} from "../../../src/git/git-command-workspace.js";
import { createDugiteGitRunners } from "../../support/git/dugite-git-runners.js";

const executeFile = promisify(execFile);
const temporaryDirectories: string[] = [];
const MAX_BYTE = 0xff;
const BYTE_NINE = 9;
const BYTE_EIGHT = 8;
const BYTE_SEVEN = 7;
const OBJECT_ID_LENGTH = 40;

const git = async (cwd: string, args: readonly string[]): Promise<string> =>
  (await executeFile("git", ["-C", cwd, ...args])).stdout;

const exactCommit = (value: string) => {
  const revision = createExactCommitRevision(value);
  if (revision === null) throw new Error("The fixture commit must be exact.");
  return revision;
};

const required = <Value>(value: Value | null, description: string): Value => {
  if (value === null) throw new Error(`The fixture ${description} must be valid.`);
  return value;
};

const createRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "graider dugite workspace transport "));
  temporaryDirectories.push(root);
  return root;
};

const createRepository = async (
  root: string,
  name: string
): Promise<{ readonly repository: string; readonly head: string }> => {
  const repository = join(root, name);
  await mkdir(repository);
  await git(repository, ["init"]);
  await git(repository, ["config", "user.email", "faculty@example.test"]);
  await git(repository, ["config", "user.name", "Faculty"]);
  await writeFile(join(repository, "course file.txt"), "base\n");
  await git(repository, ["add", "--all", "--"]);
  await git(repository, ["commit", "-m", "Base"]);
  await git(repository, ["branch", "-M", "main"]);
  return { repository, head: (await git(repository, ["rev-parse", "HEAD"])).trim() };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    })
  );
});

describe("Dugite command workspace transport conformance", () => {
  it("uses embedded Git with no PATH lookup across creation, inspection, mutation, and push", async () => {
    const root = await createRoot();
    const source = await createRepository(root, "source with spaces");
    const remote = join(root, "bare remote with spaces.git");
    await git(root, ["init", "--bare", remote]);
    await git(source.repository, ["remote", "add", "origin", remote]);
    await git(source.repository, ["push", "--set-upstream", "origin", "main"]);
    await git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
    const spawnedFiles: string[] = [];
    const runners = createDugiteGitRunners({
      onSpawn: (child) => spawnedFiles.push(child.spawnfile)
    });
    const factory = new GitCommandWorkspaceFactory(runners);
    const trustedRemote = required(createTrustedGitRemote(remote), "remote");
    const normalClone = join(root, "normal clone with spaces");
    const noCheckoutClone = join(root, "no checkout clone with spaces");

    await factory.verifyAvailable();
    const normalWorkspace = await factory.clone({
      remote: trustedRemote,
      destination: normalClone,
      checkout: "default"
    });
    const workspace = await factory.clone({
      remote: trustedRemote,
      destination: noCheckoutClone,
      checkout: "none"
    });
    const reopened = await factory.open(noCheckoutClone);
    const origin = required(createRemoteName("origin"), "remote name");
    const main = required(createBranchName("main"), "main branch");
    const feature = required(createBranchName("proof/dugite"), "feature branch");
    const courseFile = required(createRelativeGitPath("course file.txt"), "course path");
    const sourceHead = await workspace.resolveHead();

    await expect(normalWorkspace.resolveHead()).resolves.toBe(source.head);
    await expect(factory.inspect(noCheckoutClone)).resolves.toMatchObject({ kind: "repository" });
    await expect(reopened.resolveHead()).resolves.toBe(source.head);
    await expect(workspace.remoteUrl(origin)).resolves.toBe(remote);
    await expect(workspace.remoteDefaultBranch(origin)).resolves.toBe(main);
    await expect(workspace.resolveRevision(exactCommit(source.head))).resolves.toBe(source.head);
    await expect(workspace.resolveTree(sourceHead)).resolves.toMatch(/^[0-9a-f]{40}$/u);
    await expect(workspace.listTree(sourceHead)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "course file.txt" })])
    );
    await expect(
      workspace.listCommits({ anchor: sourceHead, maximumCount: 1 })
    ).resolves.toHaveLength(1);
    await workspace.switchBranch(main);
    await writeFile(join(noCheckoutClone, "course file.txt"), "changed\n");
    await expect(workspace.inspect({ paths: [courseFile] })).resolves.toMatchObject({
      workingTree: { trackedChanges: [{ kind: "modified", path: "course file.txt" }] }
    });
    await workspace.stage([courseFile]);
    await workspace.commit({ message: "Dugite staged change" });
    await workspace.commit({ message: "Dugite empty change", allowEmpty: true });
    await workspace.pushUpstream();
    await workspace.createBranch(feature);
    await workspace.commit({ message: "Dugite branch change", allowEmpty: true });
    await workspace.pushBranch({ remote: origin, branch: feature });
    await workspace.switchBranch(main);
    await workspace.deleteRemoteBranch({ remote: origin, branch: feature });
    await workspace.restoreDisposableAttempt({
      expectedHead: await workspace.resolveHead(),
      removeUntracked: true
    });

    await expect(
      git(remote, ["show-ref", "--verify", "refs/heads/proof/dugite"])
    ).rejects.toBeDefined();
    expect(spawnedFiles.length).toBeGreaterThan(0);
    expect(new Set(spawnedFiles)).toEqual(new Set([resolveGitBinary()]));
  });

  it("carries binary diff bytes through the injected binary runner and returns typed conflicts", async () => {
    const root = await createRoot();
    const template = await createRepository(root, "template with spaces");
    const student = join(root, "student with spaces");
    await git(root, ["clone", template.repository, student]);
    await git(student, ["config", "user.email", "student@example.test"]);
    await git(student, ["config", "user.name", "Student"]);
    const baseBytes = Buffer.from([0, 1, 2, 3, MAX_BYTE]);
    const targetBytes = Buffer.from([0, BYTE_NINE, BYTE_EIGHT, BYTE_SEVEN, MAX_BYTE]);
    await writeFile(join(template.repository, "asset.bin"), baseBytes);
    await git(template.repository, ["add", "asset.bin"]);
    await git(template.repository, ["commit", "-m", "Binary base"]);
    const binaryBase = (await git(template.repository, ["rev-parse", "HEAD"])).trim();
    await git(student, ["fetch", "origin"]);
    await git(student, ["reset", "--hard", binaryBase]);
    await writeFile(join(template.repository, "asset.bin"), targetBytes);
    await git(template.repository, ["commit", "-am", "Binary target"]);
    const binaryTarget = (await git(template.repository, ["rev-parse", "HEAD"])).trim();
    const runners = createDugiteGitRunners();
    const factory = new GitCommandWorkspaceFactory(runners);
    const templateWorkspace = await factory.open(template.repository);
    const studentWorkspace = await factory.open(student);
    const binaryPatch = await templateWorkspace.diff({
      base: await templateWorkspace.resolveRevision(exactCommit(binaryBase)),
      target: await templateWorkspace.resolveRevision(exactCommit(binaryTarget))
    });

    await expect(studentWorkspace.applyPatchToIndex({ patch: binaryPatch.patch })).resolves.toEqual(
      {
        kind: "applied"
      }
    );
    expect(await readFile(join(student, "asset.bin"))).toEqual(targetBytes);

    await writeFile(join(student, "course file.txt"), "student change\n");
    await git(student, ["commit", "-am", "Student change"]);
    await writeFile(join(template.repository, "course file.txt"), "template change\n");
    await git(template.repository, ["commit", "-am", "Template change"]);
    const conflictPatch = await templateWorkspace.diff({
      base: await templateWorkspace.resolveRevision(exactCommit(binaryTarget)),
      target: await templateWorkspace.resolveHead()
    });

    await expect(
      studentWorkspace.applyPatchToIndex({ patch: conflictPatch.patch })
    ).resolves.toEqual({
      kind: "conflict"
    });
  });

  it("preserves semantic errors and supplies scoped authentication configuration without leaks", async () => {
    const root = await createRoot();
    const repository = await createRepository(root, "error repository with spaces");
    const runners = createDugiteGitRunners();
    const factory = new GitCommandWorkspaceFactory(runners);
    const workspace = await factory.open(repository.repository);
    const missing = exactCommit("0".repeat(OBJECT_ID_LENGTH));

    await expect(workspace.resolveRevision(missing)).rejects.toMatchObject({
      kind: "revision_unavailable",
      operation: "resolve_revision"
    });
    await expect(workspace.pushUpstream()).rejects.toMatchObject({
      kind: "remote_unavailable",
      operation: "push"
    });

    const token = "dugite transport fake token";
    const authentication = required(
      createGitAuthenticationContext("dugite-transport"),
      "auth context"
    );
    const resolverCalls: GitAuthenticationContext[] = [];
    const credentialResolver: GitCredentialResolver = {
      resolve: (context) => {
        resolverCalls.push(context);
        return Promise.resolve({ kind: "github_token", host: "github.com", token });
      }
    };
    const requests: GitCommandExecutionRequest[] = [];
    const spawnedArguments: (readonly string[])[] = [];
    const authenticatedDugite = createDugiteGitRunners({
      onSpawn: (child) => spawnedArguments.push(child.spawnargs),
      onRequest: (request) => requests.push(request)
    });
    const authRunner: GitCommandRunner = async (request) => {
      if (request.args[0] !== "clone") return await authenticatedDugite.runGit(request);
      requests.push(request);
      await authenticatedDugite.runGit({
        cwd: request.cwd,
        args: ["--version"],
        ...(request.env === undefined ? {} : { env: request.env })
      });
      throw Object.assign(new Error(`authentication failed: ${token}`), {
        stderr: `authentication failed: ${token}`
      });
    };
    const parentEnvironment = { ...process.env };
    const authenticatedFactory = new GitCommandWorkspaceFactory({
      runGit: authRunner,
      runGitBinary: authenticatedDugite.runGitBinary,
      credentialResolver
    });
    const remote = required(
      createTrustedGitRemote("https://github.com/example/private.git"),
      "GitHub remote"
    );

    await authenticatedFactory.verifyAvailable();
    await expect(
      authenticatedFactory.clone({
        remote,
        destination: join(root, "authenticated clone with spaces"),
        checkout: "default",
        authentication
      })
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toMatchObject({ kind: "authentication_failed", operation: "clone" });
      expect(JSON.stringify(error)).not.toContain(token);
      expect(String(error)).not.toContain(token);
      return true;
    });

    expect(resolverCalls).toEqual([authentication]);
    const cloneRequest = requests.find((request) => request.args[0] === "clone");
    expect(cloneRequest?.args).not.toContain(token);
    expect(cloneRequest?.env?.GIT_CONFIG_VALUE_1).toContain(
      Buffer.from(`x-access-token:${token}`).toString("base64")
    );
    expect(spawnedArguments.flat()).not.toContain(token);
    expect(process.env).toEqual(parentEnvironment);
  });
});
