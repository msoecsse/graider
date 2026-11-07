import { mkdtemp, mkdir, writeFile, readFile, readdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  describeGitIntegration,
  removeGitFixture
} from "../../support/git/integration-fixtures.js";
import { createDugiteGitRunners } from "../../../src/git/dugite-git-runners.js";
import { GitCommandWorkspaceFactory } from "../../../src/git/git-command-workspace.js";
import * as dugiteContext from "../../../src/git/dugite-git-workspace-context.js";
import {
  verifyMigrationCheckpoint,
  withMigrationCheckpointWorkspace
} from "../../../src/migration/migration-checkpoint.js";
import {
  createExactCommitRevision,
  createGitAuthenticationContext,
  createTrustedGitRemote
} from "../../../src/git/git-workspace.js";

const required = <T>(value: T | null): T => {
  if (value === null) throw new Error("Invalid fixture value");
  return value;
};
const LAST_ARGUMENT = -1;
const SHA_LENGTH = 40;
const directories: string[] = [];
const REMOTE = "https://github.com/example/course.git";
const TOKEN = "fake-checkpoint-token";
const setup = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "graider checkpoint "));
  directories.push(root);
  const repository = path.join(root, "active cache");
  const bare = path.join(root, "remote.git");
  const home = path.join(root, "empty home");
  await mkdir(repository);
  await mkdir(home);
  const runners = createDugiteGitRunners();
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(home, "missing-config")
  };
  const git = (cwd: string, args: readonly string[]) => runners.runGit({ cwd, args, env });
  await git(repository, ["init", "--initial-branch=main"]);
  await git(repository, ["config", "user.name", "Test Faculty"]);
  await git(repository, ["config", "user.email", "faculty@example.test"]);
  await writeFile(path.join(repository, "course.yml"), "schema_version: 1\n");
  await git(repository, ["add", "course.yml"]);
  await git(repository, ["commit", "-m", "v1"]);
  const source = required(
    createExactCommitRevision((await git(repository, ["rev-parse", "HEAD"])).trim())
  );
  await git(root, ["init", "--bare", "--initial-branch=main", bare]);
  await git(repository, ["push", bare, "main"]);
  // Local HEAD and a local checkpoint deliberately disagree with the reviewed source.
  await writeFile(path.join(repository, "course.yml"), "schema_version: 1\n# advanced\n");
  await git(repository, ["commit", "-am", "local only"]);
  const localHead = (await git(repository, ["rev-parse", "HEAD"])).trim();
  const ref = `refs/tags/graider-migration-v1/${source}`;
  await git(repository, ["tag", ref.slice("refs/tags/".length)]);
  await writeFile(path.join(repository, "unsaved.txt"), "preserve me\n");
  const calls: readonly string[][] = [];
  const runGit = vi.fn(async (request: Parameters<typeof runners.runGit>[0]) => {
    (calls as string[][]).push([...request.args]);
    const args = request.args.map((arg) => (arg === REMOTE ? bare : arg));
    return runners.runGit({
      ...request,
      args,
      env: {
        ...env,
        ...request.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: path.join(home, "missing-config")
      }
    });
  });
  const authentication = required(createGitAuthenticationContext("checkpoint-session"));
  const resolve = vi.fn(() =>
    Promise.resolve({
      kind: "github_token" as const,
      host: "github.com",
      token: TOKEN
    })
  );
  const factory = new GitCommandWorkspaceFactory({
    runGit,
    runGitBinary: runners.runGitBinary,
    credentialResolver: { resolve }
  });
  const workspace = await factory.openCheckpoint(repository);
  const request = {
    remote: required(createTrustedGitRemote(REMOTE)),
    sourceCommit: source,
    authentication
  };
  return {
    root,
    repository,
    bare,
    git,
    workspace,
    request,
    source,
    ref,
    localHead,
    calls,
    resolve,
    runGit,
    factory
  };
};
afterEach(async () => {
  await Promise.all(directories.splice(0).map(removeGitFixture));
});

describeGitIntegration("bundled Git remote checkpoint capability", () => {
  it("isolates the real bundled clone, recovers an actual lost push response and cleans up its attempt", async () => {
    const f = await setup();
    vi.spyOn(dugiteContext, "createAuthenticatedDugiteGitWorkspace").mockReturnValue({
      factory: f.factory,
      authentication: f.request.authentication
    });
    const before = await f.git(f.repository, ["status", "--porcelain=v2", "--branch"]);
    const result = await withMigrationCheckpointWorkspace(
      f.request.remote,
      TOKEN,
      async (workspace, authentication) => {
        const transport = {
          readRemoteCheckpoint: workspace.readRemoteCheckpoint.bind(workspace),
          createRemoteCheckpoint: async (request: typeof f.request) => {
            await workspace.createRemoteCheckpoint(request);
            throw new Error("Lost response");
          }
        };
        return verifyMigrationCheckpoint(transport, { ...f.request, authentication }, () =>
          Promise.resolve()
        );
      }
    );
    expect(result).toMatchObject({ status: "verified", commit: f.source });
    const clone = f.calls.find((args) => args.includes("clone"));
    expect(clone).toContain("--no-checkout");
    const destination = clone?.at(LAST_ARGUMENT);
    if (!destination) throw new Error("Missing clone attempt");
    expect(destination).not.toBe(f.repository);
    await expect(access(path.dirname(destination))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await f.git(f.repository, ["status", "--porcelain=v2", "--branch"])).toBe(before);
    expect((await f.git(f.bare, ["rev-parse", "refs/heads/main"])).trim()).toBe(f.source);
  });
  it("cleans an isolated attempt after callback failure and creates no checkpoint", async () => {
    const f = await setup();
    vi.spyOn(dugiteContext, "createAuthenticatedDugiteGitWorkspace").mockReturnValue({
      factory: f.factory,
      authentication: f.request.authentication
    });
    await expect(
      withMigrationCheckpointWorkspace(f.request.remote, TOKEN, () =>
        Promise.reject(new Error("validation failed"))
      )
    ).rejects.toThrow("validation failed");
    const destination = f.calls.find((args) => args.includes("clone"))?.at(LAST_ARGUMENT);
    if (!destination) throw new Error("Missing clone attempt");
    await expect(access(path.dirname(destination))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await f.workspace.readRemoteCheckpoint(f.request)).toBeNull();
  });
  it("never accepts the peeled target of an annotated tag as a lightweight checkpoint", async () => {
    const f = await setup();
    await f.git(f.repository, ["tag", "-a", "checkpoint-fixture", f.source, "-m", "Annotated"]);
    await f.git(f.repository, ["push", f.bare, `refs/tags/checkpoint-fixture:${f.ref}`]);
    expect(await f.workspace.readRemoteCheckpoint(f.request)).not.toBe(f.source);
    expect(
      await verifyMigrationCheckpoint(f.workspace, f.request, () => Promise.resolve())
    ).toMatchObject({ status: "needs_attention", reason: "checkpoint_conflict" });
  });
  it.each([
    "garbage",
    `invalid\trefs/tags/other\n`,
    `${"a".repeat(SHA_LENGTH)}\trefs/tags/other\n`
  ])("fails closed for malformed remote evidence %s", async (output) => {
    const f = await setup();
    f.runGit.mockResolvedValueOnce(output);
    await expect(f.workspace.readRemoteCheckpoint(f.request)).rejects.toMatchObject({
      kind: "operation_rejected"
    });
  });
  it("reads remote absence despite a local tag, pushes the reviewed commit and independently reads the remote", async () => {
    const f = await setup();
    const before = await f.git(f.repository, ["status", "--porcelain=v2", "--branch"]);
    const index = await readFile(path.join(f.repository, ".git", "index"));
    expect(await f.workspace.readRemoteCheckpoint(f.request)).toBeNull();
    await f.workspace.createRemoteCheckpoint(f.request);
    expect(await f.workspace.readRemoteCheckpoint(f.request)).toBe(f.source);
    expect((await f.git(f.bare, ["rev-parse", "refs/heads/main"])).trim()).toBe(f.source);
    expect((await f.git(f.repository, ["rev-parse", "HEAD"])).trim()).toBe(f.localHead);
    expect((await f.git(f.repository, ["rev-parse", f.ref])).trim()).toBe(f.localHead);
    expect(await f.git(f.repository, ["status", "--porcelain=v2", "--branch"])).toBe(before);
    expect(await readFile(path.join(f.repository, ".git", "index"))).toEqual(index);
    expect(await readFile(path.join(f.repository, "unsaved.txt"), "utf8")).toBe("preserve me\n");
    expect(await readdir(path.join(f.bare, "refs", "tags", "graider-migration-v1"))).toEqual([
      f.source
    ]);
    expect(f.calls.filter((args) => args.includes("push"))).toEqual([
      [
        "-c",
        "push.followTags=false",
        "push",
        "--no-follow-tags",
        "--no-mirror",
        "--no-verify",
        "--recurse-submodules=no",
        "--",
        REMOTE,
        `${f.source}:${f.ref}`
      ]
    ]);
    expect(f.calls.flat()).not.toContain("--force");
    expect(f.calls.flat()).not.toContain("--delete");
    expect(f.calls.flat().some((arg) => arg.startsWith("+") || arg === `:${f.ref}`)).toBe(false);
    expect(f.resolve).toHaveBeenCalledWith(f.request.authentication);
  });
  it("cannot replace a conflicting remote checkpoint", async () => {
    const f = await setup();
    await f.git(f.repository, ["push", f.bare, `${f.localHead}:${f.ref}`]);
    expect(await f.workspace.readRemoteCheckpoint(f.request)).toBe(f.localHead);
    await expect(f.workspace.createRemoteCheckpoint(f.request)).rejects.toMatchObject({
      operation: "create_remote_checkpoint"
    });
    expect((await f.git(f.bare, ["rev-parse", f.ref])).trim()).toBe(f.localHead);
  });
  it("rejects malformed source and unsafe authenticated destinations before executing transport", async () => {
    const f = await setup();
    const count = f.runGit.mock.calls.length;
    await expect(
      f.workspace.createRemoteCheckpoint({ ...f.request, sourceCommit: "HEAD" as typeof f.source })
    ).rejects.toMatchObject({ kind: "operation_rejected" });
    await expect(
      f.workspace.readRemoteCheckpoint({
        ...f.request,
        remote: required(createTrustedGitRemote("https://attacker.test/course.git"))
      })
    ).rejects.toMatchObject({ kind: "operation_rejected" });
    expect(f.runGit).toHaveBeenCalledTimes(count);
  });
  it("rejects missing credentials without persisting or exposing authentication", async () => {
    const f = await setup();
    const unauthenticated = {
      ...f.request,
      authentication: undefined
    } as unknown as typeof f.request;
    await expect(f.workspace.readRemoteCheckpoint(unauthenticated)).rejects.toMatchObject({
      kind: "authentication_failed"
    });
    await expect(f.workspace.createRemoteCheckpoint(unauthenticated)).rejects.toMatchObject({
      kind: "authentication_failed"
    });
    f.resolve.mockResolvedValueOnce(null as never);
    await expect(f.workspace.readRemoteCheckpoint(f.request)).rejects.toMatchObject({
      kind: "authentication_failed"
    });
    f.runGit.mockRejectedValueOnce(new Error(`Authorization: ${TOKEN}`));
    try {
      await f.workspace.readRemoteCheckpoint(f.request);
      throw new Error("Expected failure");
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(TOKEN);
      expect(String(error)).not.toContain(TOKEN);
    }
    expect(await readFile(path.join(f.repository, ".git", "config"), "utf8")).not.toContain(TOKEN);
  });
});
