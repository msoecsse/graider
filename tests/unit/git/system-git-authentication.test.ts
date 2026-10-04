import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import type {
  GitCredentialResolver,
  GitResolvedCredential
} from "../../../src/git/git-credential-resolver.js";
import {
  GitError,
  createBranchName,
  createGitAuthenticationContext,
  createRemoteName,
  createTrustedGitRemote,
  type GitAuthenticationContext
} from "../../../src/git/git-workspace.js";
import {
  SystemGitWorkspaceFactory,
  type SystemGitExecutionRequest
} from "../../../src/git/system-git-workspace.js";

const executeFile = promisify(execFile);
const temporaryDirectories: string[] = [];
const GITHUB_REMOTE = "https://github.com/msoecsse/private-course.git";
const OTHER_HTTPS_REMOTE = "https://example.test/msoecsse/private-course.git";
const TOKEN_A = "graider-auth-fixture-A-4f8d1c";
const TOKEN_B = "graider-auth-fixture-B-91ae77";
const GITHUB_TOKEN_USERNAME = "x-access-token";

const authenticationContext = (id: string): GitAuthenticationContext => {
  const context = createGitAuthenticationContext(id);
  if (context === null) throw new Error("The test authentication context must be valid.");
  return context;
};

const trustedRemote = (value: string) => {
  const remote = createTrustedGitRemote(value);
  if (remote === null) throw new Error("The test remote must be trusted.");
  return remote;
};

const createResolver = (
  credentials: Readonly<Record<string, GitResolvedCredential>>
): GitCredentialResolver => ({
  resolve: (context) => Promise.resolve(credentials[context.id] ?? null)
});

const githubCredential = (token: string): GitResolvedCredential => ({
  kind: "github_token",
  host: "github.com",
  token
});

const encodedCredential = (token: string): string =>
  Buffer.from(`${GITHUB_TOKEN_USERNAME}:${token}`).toString("base64");

const lastValue = <T>(values: readonly T[]): T | undefined => values[values.length - 1];

const runtimeConfig = (env: NodeJS.ProcessEnv): ReadonlyMap<string, string> => {
  const count = Number(env.GIT_CONFIG_COUNT);
  const entries = new Map<string, string>();
  for (let index = 0; index < count; index += 1) {
    const key = env[`GIT_CONFIG_KEY_${String(index)}`];
    const value = env[`GIT_CONFIG_VALUE_${String(index)}`];
    if (key !== undefined && value !== undefined) entries.set(key, value);
  }
  return entries;
};

const createFakeCloneRunner =
  (
    requests: SystemGitExecutionRequest[]
  ): ((request: SystemGitExecutionRequest) => Promise<string>) =>
  async (request) => {
    requests.push(request);
    if (request.args[0] === "clone") {
      const destination = lastValue(request.args);
      if (destination === undefined) throw new Error("Clone destination missing.");
      await mkdir(destination);
      return "";
    }
    if (request.args[0] === "rev-parse" && request.args[1] === "--show-toplevel") {
      return `${request.cwd}\n`;
    }
    throw new Error(`Unexpected Git test operation: ${request.args.join(" ")}`);
  };

const createTemporaryDirectory = async (prefix: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("Git authentication context contract", () => {
  it("serializes only an assigned opaque identifier", () => {
    const context = authenticationContext("template-sync-operation-17");

    expect(context).toEqual({ id: "template-sync-operation-17" });
    expect(JSON.stringify(context)).toBe('{"id":"template-sync-operation-17"}');
    expect(JSON.stringify(context)).not.toContain(TOKEN_A);
  });

  it("rejects empty and control-character context identifiers", () => {
    expect(createGitAuthenticationContext("")).toBeNull();
    expect(createGitAuthenticationContext("operation\u0000token")).toBeNull();
  });
});

describe("System Git authenticated execution contract", () => {
  it("supplies GitHub no-checkout clone credentials only through a fresh process environment", async () => {
    const parent = await createTemporaryDirectory("graider-auth-clone-");
    const requests: SystemGitExecutionRequest[] = [];
    const context = authenticationContext("clone-context");
    const originalRuntimeCount = process.env.GIT_CONFIG_COUNT;
    const originalTerminalPrompt = process.env.GIT_TERMINAL_PROMPT;
    const factory = new SystemGitWorkspaceFactory({
      runGit: createFakeCloneRunner(requests),
      credentialResolver: createResolver({ [context.id]: githubCredential(TOKEN_A) })
    });

    await factory.clone({
      remote: trustedRemote(GITHUB_REMOTE),
      destination: join(parent, "clone"),
      checkout: "none",
      authentication: context
    });

    const cloneRequest = requests.find((request) => request.args[0] === "clone");
    expect(cloneRequest).toBeDefined();
    if (cloneRequest?.env === undefined) throw new Error("Authenticated environment missing.");
    const config = runtimeConfig(cloneRequest.env);
    expect(cloneRequest.env.GIT_CONFIG_COUNT).toBe("2");
    expect(cloneRequest.env.PATH).toBe(process.env.PATH);
    expect(config.get("http.https://github.com/.extraHeader")).toBe(
      `AUTHORIZATION: basic ${encodedCredential(TOKEN_A)}`
    );
    expect(config.get("credential.helper")).toBe("");
    expect(cloneRequest.env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(cloneRequest.args).toEqual([
      "clone",
      "--no-checkout",
      "--",
      GITHUB_REMOTE,
      join(parent, "clone")
    ]);
    const argv = cloneRequest.args.join(" ");
    expect(argv).not.toContain(TOKEN_A);
    expect(argv).not.toContain(encodedCredential(TOKEN_A));
    expect(argv).not.toMatch(/authorization/iu);
    expect(argv).not.toContain("http.extraHeader");
    expect(argv).not.toContain(GITHUB_TOKEN_USERNAME);
    expect(process.env.GIT_CONFIG_COUNT).toBe(originalRuntimeCount);
    expect(process.env.GIT_TERMINAL_PROMPT).toBe(originalTerminalPrompt);
  });

  it("uses the same protected environment path for authenticated push", async () => {
    const root = await createTemporaryDirectory("graider-auth-push-");
    const requests: SystemGitExecutionRequest[] = [];
    const context = authenticationContext("push-context");
    const runGit = (request: SystemGitExecutionRequest): Promise<string> => {
      requests.push(request);
      if (request.args.join(" ") === "rev-parse --show-toplevel")
        return Promise.resolve(`${root}\n`);
      if (request.args.join(" ") === "symbolic-ref --quiet --short HEAD")
        return Promise.resolve("main\n");
      if (request.args[0] === "for-each-ref") return Promise.resolve("origin\n");
      if (request.args.join(" ") === "config --get-all remote.origin.pushurl")
        return Promise.resolve("");
      if (request.args.join(" ") === "config --get-all remote.origin.url")
        return Promise.resolve(`${GITHUB_REMOTE}\n`);
      if (request.args.join(" ") === "push") return Promise.resolve("");
      return Promise.reject(new Error(`Unexpected Git test operation: ${request.args.join(" ")}`));
    };
    const factory = new SystemGitWorkspaceFactory({
      runGit,
      credentialResolver: createResolver({ [context.id]: githubCredential(TOKEN_A) })
    });
    const workspace = await factory.open(root);

    await expect(workspace.pushUpstream({ authentication: context })).resolves.toEqual({
      kind: "pushed"
    });

    const pushRequest = requests.find((request) => request.args[0] === "push");
    expect(pushRequest?.args).toEqual(["push"]);
    if (pushRequest?.env === undefined) throw new Error("Authenticated environment missing.");
    expect(runtimeConfig(pushRequest.env).get("http.https://github.com/.extraHeader")).toBe(
      `AUTHORIZATION: basic ${encodedCredential(TOKEN_A)}`
    );
    expect(pushRequest.args.join(" ")).not.toContain(TOKEN_A);
    expect(pushRequest.args.join(" ")).not.toMatch(/authorization|extraheader/iu);
    expect(pushRequest.args.join(" ")).not.toContain(GITHUB_TOKEN_USERNAME);
  });

  it("uses the protected environment for an authenticated explicit branch push", async () => {
    const root = await createTemporaryDirectory("graider-auth-explicit-push-");
    const requests: SystemGitExecutionRequest[] = [];
    const context = authenticationContext("explicit-push-context");
    const runGit = (request: SystemGitExecutionRequest): Promise<string> => {
      requests.push(request);
      if (request.args.join(" ") === "rev-parse --show-toplevel")
        return Promise.resolve(`${root}\n`);
      if (request.args.join(" ") === "config --get-all remote.origin.pushurl")
        return Promise.resolve("");
      if (request.args.join(" ") === "config --get-all remote.origin.url")
        return Promise.resolve(`${GITHUB_REMOTE}\n`);
      if (request.args[0] === "push") return Promise.resolve("");
      return Promise.reject(new Error(`Unexpected Git test operation: ${request.args.join(" ")}`));
    };
    const factory = new SystemGitWorkspaceFactory({
      runGit,
      credentialResolver: createResolver({ [context.id]: githubCredential(TOKEN_A) })
    });
    const workspace = await factory.open(root);
    const origin = createRemoteName("origin");
    const branch = createBranchName("release/course");
    if (origin === null || branch === null) throw new Error("The push target must be trusted.");

    await workspace.pushBranch({ remote: origin, branch, authentication: context });

    const pushRequest = requests.find((request) => request.args[0] === "push");
    expect(pushRequest?.args).toEqual(["push", "origin", "HEAD:refs/heads/release/course"]);
    if (pushRequest?.env === undefined) throw new Error("Authenticated environment missing.");
    expect(runtimeConfig(pushRequest.env).get("http.https://github.com/.extraHeader")).toBe(
      `AUTHORIZATION: basic ${encodedCredential(TOKEN_A)}`
    );
    expect(JSON.stringify(pushRequest.args)).not.toContain(TOKEN_A);
  });

  it("uses the protected environment for authenticated remote branch deletion", async () => {
    const root = await createTemporaryDirectory("graider-auth-delete-branch-");
    const requests: SystemGitExecutionRequest[] = [];
    const context = authenticationContext("delete-branch-context");
    const runGit = (request: SystemGitExecutionRequest): Promise<string> => {
      requests.push(request);
      if (request.args.join(" ") === "rev-parse --show-toplevel")
        return Promise.resolve(`${root}\n`);
      if (request.args.join(" ") === "config --get-all remote.origin.pushurl")
        return Promise.resolve("");
      if (request.args.join(" ") === "config --get-all remote.origin.url")
        return Promise.resolve(`${GITHUB_REMOTE}\n`);
      if (request.args[0] === "push") return Promise.resolve("");
      return Promise.reject(new Error(`Unexpected Git test operation: ${request.args.join(" ")}`));
    };
    const factory = new SystemGitWorkspaceFactory({
      runGit,
      credentialResolver: createResolver({ [context.id]: githubCredential(TOKEN_A) })
    });
    const workspace = await factory.open(root);
    const origin = createRemoteName("origin");
    const branch = createBranchName("graider/template-update-123456789abc");
    if (origin === null || branch === null) throw new Error("The delete target must be trusted.");

    await workspace.deleteRemoteBranch({ remote: origin, branch, authentication: context });

    const deleteRequest = requests.find((request) => request.args[0] === "push");
    expect(deleteRequest?.args).toEqual([
      "push",
      "origin",
      "--delete",
      "graider/template-update-123456789abc"
    ]);
    if (deleteRequest?.env === undefined) throw new Error("Authenticated environment missing.");
    expect(runtimeConfig(deleteRequest.env).get("http.https://github.com/.extraHeader")).toBe(
      `AUTHORIZATION: basic ${encodedCredential(TOKEN_A)}`
    );
    expect(JSON.stringify(deleteRequest.args)).not.toContain(TOKEN_A);
  });

  it("isolates authenticated, ambient, and differently authenticated operations", async () => {
    const parent = await createTemporaryDirectory("graider-auth-isolation-");
    const requests: SystemGitExecutionRequest[] = [];
    const contextA = authenticationContext("context-a");
    const contextB = authenticationContext("context-b");
    const factory = new SystemGitWorkspaceFactory({
      runGit: createFakeCloneRunner(requests),
      credentialResolver: createResolver({
        [contextA.id]: githubCredential(TOKEN_A),
        [contextB.id]: githubCredential(TOKEN_B)
      })
    });

    await factory.clone({
      remote: trustedRemote(GITHUB_REMOTE),
      destination: join(parent, "a"),
      checkout: "default",
      authentication: contextA
    });
    await factory.clone({
      remote: trustedRemote(GITHUB_REMOTE),
      destination: join(parent, "ambient"),
      checkout: "default"
    });
    await factory.clone({
      remote: trustedRemote(GITHUB_REMOTE),
      destination: join(parent, "b"),
      checkout: "default",
      authentication: contextB
    });

    const cloneRequests = requests.filter((request) => request.args[0] === "clone");
    expect(cloneRequests).toHaveLength(3);
    expect(cloneRequests[0]?.env?.GIT_CONFIG_VALUE_1).toContain(encodedCredential(TOKEN_A));
    expect(cloneRequests[0]?.env?.GIT_CONFIG_VALUE_1).not.toContain(TOKEN_B);
    expect(cloneRequests[1]?.env).toBeUndefined();
    expect(cloneRequests[2]?.env?.GIT_CONFIG_VALUE_1).toContain(encodedCredential(TOKEN_B));
    expect(cloneRequests[2]?.env?.GIT_CONFIG_VALUE_1).not.toContain(TOKEN_A);
  });

  it("keeps concurrent authentication contexts isolated", async () => {
    const parent = await createTemporaryDirectory("graider-auth-concurrent-");
    const requests: SystemGitExecutionRequest[] = [];
    const contextA = authenticationContext("concurrent-a");
    const contextB = authenticationContext("concurrent-b");
    const factory = new SystemGitWorkspaceFactory({
      runGit: createFakeCloneRunner(requests),
      credentialResolver: createResolver({
        [contextA.id]: githubCredential(TOKEN_A),
        [contextB.id]: githubCredential(TOKEN_B)
      })
    });

    await Promise.all([
      factory.clone({
        remote: trustedRemote(GITHUB_REMOTE),
        destination: join(parent, "a"),
        checkout: "default",
        authentication: contextA
      }),
      factory.clone({
        remote: trustedRemote(GITHUB_REMOTE),
        destination: join(parent, "b"),
        checkout: "default",
        authentication: contextB
      })
    ]);

    const cloneRequests = requests.filter((request) => request.args[0] === "clone");
    const requestA = cloneRequests.find((request) => lastValue(request.args)?.endsWith("/a"));
    const requestB = cloneRequests.find((request) => lastValue(request.args)?.endsWith("/b"));
    expect(requestA?.env?.GIT_CONFIG_VALUE_1).toContain(encodedCredential(TOKEN_A));
    expect(requestA?.env?.GIT_CONFIG_VALUE_1).not.toContain(TOKEN_B);
    expect(requestB?.env?.GIT_CONFIG_VALUE_1).toContain(encodedCredential(TOKEN_B));
    expect(requestB?.env?.GIT_CONFIG_VALUE_1).not.toContain(TOKEN_A);
    expect(requestA?.env).not.toBe(requestB?.env);
  });

  it("rejects an authenticated non-GitHub remote before invoking child Git", async () => {
    const parent = await createTemporaryDirectory("graider-auth-host-");
    const requests: SystemGitExecutionRequest[] = [];
    const context = authenticationContext("host-context");
    const factory = new SystemGitWorkspaceFactory({
      runGit: createFakeCloneRunner(requests),
      credentialResolver: createResolver({ [context.id]: githubCredential(TOKEN_A) })
    });

    await expect(
      factory.clone({
        remote: trustedRemote(OTHER_HTTPS_REMOTE),
        destination: join(parent, "rejected"),
        checkout: "default",
        authentication: context
      })
    ).rejects.toMatchObject({ kind: "operation_rejected", operation: "clone" });

    expect(requests).toEqual([]);
  });

  it("rejects authenticated local remotes before invoking child Git", async () => {
    const parent = await createTemporaryDirectory("graider-auth-local-host-");
    const requests: SystemGitExecutionRequest[] = [];
    const context = authenticationContext("local-host-context");
    const factory = new SystemGitWorkspaceFactory({
      runGit: createFakeCloneRunner(requests),
      credentialResolver: createResolver({ [context.id]: githubCredential(TOKEN_A) })
    });

    await expect(
      factory.clone({
        remote: trustedRemote(join(parent, "local.git")),
        destination: join(parent, "rejected"),
        checkout: "none",
        authentication: context
      })
    ).rejects.toMatchObject({ kind: "operation_rejected", operation: "clone" });

    expect(requests).toEqual([]);
  });

  it("rejects an authenticated push whose effective push URL is not GitHub HTTPS", async () => {
    const root = await createTemporaryDirectory("graider-auth-push-host-");
    const requests: SystemGitExecutionRequest[] = [];
    const context = authenticationContext("push-host-context");
    const runGit = (request: SystemGitExecutionRequest): Promise<string> => {
      requests.push(request);
      if (request.args.join(" ") === "rev-parse --show-toplevel")
        return Promise.resolve(`${root}\n`);
      if (request.args.join(" ") === "symbolic-ref --quiet --short HEAD")
        return Promise.resolve("main\n");
      if (request.args[0] === "for-each-ref") return Promise.resolve("origin\n");
      if (request.args.join(" ") === "config --get-all remote.origin.pushurl")
        return Promise.resolve(`${OTHER_HTTPS_REMOTE}\n`);
      if (request.args.join(" ") === "config --get-all remote.origin.url")
        return Promise.resolve(`${GITHUB_REMOTE}\n`);
      if (request.args.join(" ") === "push") return Promise.resolve("");
      return Promise.reject(new Error(`Unexpected Git test operation: ${request.args.join(" ")}`));
    };
    const factory = new SystemGitWorkspaceFactory({
      runGit,
      credentialResolver: createResolver({ [context.id]: githubCredential(TOKEN_A) })
    });
    const workspace = await factory.open(root);

    await expect(workspace.pushUpstream({ authentication: context })).rejects.toMatchObject({
      kind: "operation_rejected",
      operation: "push"
    });

    expect(requests.some((request) => request.args[0] === "push")).toBe(false);
    expect(requests.every((request) => request.env === undefined)).toBe(true);
  });

  it("classifies an unknown authentication context without invoking child Git", async () => {
    const parent = await createTemporaryDirectory("graider-auth-missing-");
    const requests: SystemGitExecutionRequest[] = [];
    const factory = new SystemGitWorkspaceFactory({
      runGit: createFakeCloneRunner(requests),
      credentialResolver: createResolver({})
    });

    await expect(
      factory.clone({
        remote: trustedRemote(GITHUB_REMOTE),
        destination: join(parent, "missing"),
        checkout: "default",
        authentication: authenticationContext("unknown-context")
      })
    ).rejects.toMatchObject({ kind: "authentication_failed", operation: "clone" });
    expect(requests).toEqual([]);
  });

  it("redacts raw and encoded credentials from semantic failures and retained causes", async () => {
    const parent = await createTemporaryDirectory("graider-auth-redaction-");
    const context = authenticationContext("redaction-context");
    const encoded = encodedCredential(TOKEN_A);
    const runner = (request: SystemGitExecutionRequest): Promise<string> => {
      const error = Object.assign(new Error(`git clone failed with ${TOKEN_A} and ${encoded}`), {
        stderr: `remote: Invalid username or token ${TOKEN_A} ${encoded}`,
        command: `git -c http.extraHeader=AUTHORIZATION: basic ${encoded}`
      });
      expect(request.env?.GIT_CONFIG_VALUE_1).toContain(encoded);
      return Promise.reject(error);
    };
    const factory = new SystemGitWorkspaceFactory({
      runGit: runner,
      credentialResolver: createResolver({ [context.id]: githubCredential(TOKEN_A) })
    });

    await expect(
      factory.clone({
        remote: trustedRemote(GITHUB_REMOTE),
        destination: join(parent, "failure"),
        checkout: "default",
        authentication: context
      })
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(GitError);
      expect(error).toMatchObject({ kind: "authentication_failed", operation: "clone" });
      const gitError = error as GitError & { readonly cause?: unknown };
      const exposed = [
        gitError.message,
        gitError.stack ?? "",
        ...Object.values(gitError).map(String),
        JSON.stringify(gitError),
        String(gitError.cause),
        JSON.stringify(gitError.cause)
      ].join("\n");
      expect(exposed).not.toContain(TOKEN_A);
      expect(exposed).not.toContain(encoded);
      expect(exposed).not.toMatch(/authorization: basic/iu);
      return true;
    });
  });

  it("does not persist authenticated runtime configuration or alter the clean remote URL", async () => {
    const parent = await createTemporaryDirectory("graider-auth-config-");
    const source = join(parent, "source");
    const destination = join(parent, "clone");
    await mkdir(source);
    await executeFile("git", ["-C", source, "init"]);
    const context = authenticationContext("config-context");
    const runner = async (request: SystemGitExecutionRequest): Promise<string> => {
      if (request.args[0] === "clone") {
        const result = await executeFile(
          "git",
          ["clone", "--", source, lastValue(request.args) ?? destination],
          {
            cwd: request.cwd,
            encoding: "utf8",
            env: request.env
          }
        );
        await executeFile("git", ["-C", destination, "remote", "set-url", "origin", GITHUB_REMOTE]);
        return result.stdout;
      }
      return (
        await executeFile(
          "git",
          ["-c", "color.ui=false", "-c", "core.quotepath=false", ...request.args],
          {
            cwd: request.cwd,
            encoding: "utf8",
            env: request.env
          }
        )
      ).stdout;
    };
    const factory = new SystemGitWorkspaceFactory({
      runGit: runner,
      credentialResolver: createResolver({ [context.id]: githubCredential(TOKEN_A) })
    });

    await factory.clone({
      remote: trustedRemote(GITHUB_REMOTE),
      destination,
      checkout: "default",
      authentication: context
    });

    const configText = await readFile(join(destination, ".git", "config"), "utf8");
    expect(configText).not.toContain(TOKEN_A);
    expect(configText).not.toContain(encodedCredential(TOKEN_A));
    expect(configText).not.toMatch(/extraheader|credential\.helper|authorization/iu);
    expect(configText).toContain(`url = ${GITHUB_REMOTE}`);
  });
});
