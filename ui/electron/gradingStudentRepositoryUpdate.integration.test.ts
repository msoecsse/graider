// @vitest-environment node
import { removeGitFixture } from "./gitIntegrationFixtures.js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { exec as executeDugite } from "dugite";
import {
  getProductionGitWorkspaceFactory,
  type AuthenticatedGitWorkspaceContext
} from "./gitWorkspaceReader.js";
import type { RepositoryUpdateBackend } from "./gradingStudentRepositoryUpdateService.js";
const load = createRequire(path.join(process.cwd(), "package.json"));
const { updateGradingStudentRepository } = load(
  "./dist-electron/gradingStudentRepositoryUpdateBackend.cjs"
) as RepositoryUpdateBackend;
type GradingState = {
  schemaVersion: 1;
  studentId: string;
  submissionCommitSha: string;
  status: string;
  appliedComments: readonly {
    readonly sourceAnchor?: { readonly status: string };
    readonly [key: string]: unknown;
  }[];
  manualAdjustments: readonly unknown[];
  viewState?: unknown;
};
const stateFile = (request: { courseRoot: string }) =>
  path.join(request.courseRoot, ".graider/grading/27s1/lab1/state/ada.json");
const saveGradingState = (request: { courseRoot: string }, state: GradingState) => {
  fs.mkdirSync(path.dirname(stateFile(request)), { recursive: true });
  fs.writeFileSync(stateFile(request), JSON.stringify(state));
  return { status: "success" };
};
const loadGradingState = (request: { courseRoot: string }) => ({
  status: "success",
  value: JSON.parse(fs.readFileSync(stateFile(request), "utf8")) as GradingState
});
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
  vi.unstubAllEnvs();
});
const git = (root: string, ...args: string[]): string =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
const identity = (root: string): void => {
  git(root, "config", "user.name", "Faculty");
  git(root, "config", "user.email", "faculty@example.test");
  // Keep host-wide ignore rules (notably .DS_Store) out of these fixtures.
  fs.writeFileSync(path.join(root, ".git/info/exclude"), "");
  git(root, "config", "core.excludesFile", path.join(root, ".git/info/exclude"));
};
const fixture = async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-student-update-"));
  roots.push(root);
  const remote = path.join(root, "remote.git"),
    student = path.join(root, "student"),
    local = path.join(root, "instructor");
  git(root, "init", "--bare", remote);
  git(root, "clone", remote, student);
  identity(student);
  fs.writeFileSync(
    path.join(student, "Main.java"),
    "header\nunique source\nrepeat\nremoved\nfooter\n"
  );
  fs.writeFileSync(path.join(student, "feedback.txt"), "Original report");
  git(student, "add", ".");
  git(student, "commit", "-m", "Student submission");
  git(student, "push", "-u", "origin", "HEAD");
  git(root, "clone", remote, local);
  identity(local);
  const sha = git(local, "rev-parse", "HEAD");
  const request = { courseRoot: root, termCode: "27s1", assignmentSlug: "lab1", studentId: "ada" };
  const state: GradingState = {
    schemaVersion: 1,
    studentId: "ada",
    submissionCommitSha: sha,
    status: "published",
    appliedComments: [
      {
        id: "reusable",
        sourceCommentId: "library-1",
        text: "Source deduction",
        deduction: -2,
        rubricCategoryId: "code",
        sourceLocation: { file: "Main.java", startLine: 2, endLine: 2 }
      },
      {
        id: "ambiguous",
        text: "Keep ambiguous",
        deduction: -1,
        sourceLocation: { file: "Main.java", startLine: 3, endLine: 3 }
      },
      {
        id: "deleted",
        text: "Keep deleted",
        deduction: -1,
        sourceLocation: { file: "Main.java", startLine: 4, endLine: 4 }
      },
      { id: "automated", text: "Existing automated deduction", deduction: -3 }
    ],
    manualAdjustments: [
      { id: "score", rubricCategoryId: "code", amount: -1, note: "Instructor notes" }
    ],
    viewState: { scrollTop: 10, cursor: { file: "Main.java", line: 2, column: 1 } }
  };
  expect(saveGradingState(request, state).status).toBe("success");
  const workspace = await getProductionGitWorkspaceFactory().open(local);
  const read = (): GradingState => {
    const result = loadGradingState(request);
    if (result.status !== "success") throw new Error(result.status);
    return result.value;
  };
  const advance = (text = "inserted\nheader\nunique source\nrepeat\nrepeat\nfooter\n"): void => {
    fs.writeFileSync(path.join(student, "Main.java"), text);
    git(student, "commit", "-am", "Student corrections");
    git(student, "push");
  };
  return { root, request, state, workspace, read, advance, student, local, sha, remote };
};

it.each(["sign-out", "account-switch", "success", "scp", "ssh"])(
  "OAuth production service with isolated remote: %s",
  { timeout: 30_000 },
  async (mode) => {
    const f = await fixture();
    const { GithubOAuthSession } = await import("./githubOAuthSession.js");
    const { createGradingStudentRepositoryUpdateService } =
      await import("./gradingStudentRepositoryUpdateService.js");
    const { recordLocalRepository, getLocalRepositoryLocatorPath } =
      await import("./localRepositoryLocator.js");
    type Command = { cwd: string; args: readonly string[]; env?: NodeJS.ProcessEnv };
    type Runners = {
      runGit: (command: Command) => Promise<string>;
      runGitBinary: (command: Command) => Promise<{ stdout: Uint8Array; stderr: Uint8Array }>;
    };
    const { createAuthenticatedDugiteGitWorkspace } = load(
      "./dist-electron/dugiteGitWorkspaceBackend.cjs"
    ) as {
      createAuthenticatedDugiteGitWorkspace(
        token: string,
        runners: Runners
      ): AuthenticatedGitWorkspaceContext;
    };
    const execute = async (command: Command) => {
      const result = await executeDugite([...command.args], command.cwd, {
        encoding: "buffer",
        env: command.env
      });
      if (result.exitCode !== 0) throw new Error("Isolated Git command failed");
      return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
    };
    const runners: Runners = {
      runGit: async (command) => Buffer.from((await execute(command)).stdout).toString("utf8"),
      runGitBinary: execute
    };
    vi.stubEnv("GRAIDER_GITHUB_TOKEN", "");
    vi.stubEnv("GITHUB_TOKEN", "");
    const token = "isolated-oauth-test-token";
    const session = new GithubOAuthSession({
      store: { load: async () => token, save: async () => {}, delete: async () => {} },
      secret: () => "test-secret",
      openBrowser: async () => {},
      callback: async () => ({
        redirectUri: "http://127.0.0.1/callback",
        code: Promise.resolve("code"),
        cancel: () => {}
      }),
      network: {
        verifyAccount: async () => ({
          identity: { id: 42, login: "faculty", name: null },
          scopes: ["repo", "read:org"],
          organizationCapability: true,
          repositoryCapability: true
        }),
        exchange: async () => token,
        discoverOrganizations: async () => ({
          status: "ready",
          organizations: [],
          message: null,
          stale: false
        })
      }
    });
    await session.restore();
    const directory = path.join(f.root, "terms/27s1/manifests/lab1");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, "manifest.yml"),
      fs
        .readFileSync("../tests/fixtures/manifest/valid-manifest/manifest.yml", "utf8")
        .replaceAll("lab04", "lab1")
        .replaceAll("student_id: jones", "student_id: ada")
    );
    const remote = "https://github.com/example-org/27s1-se2030-lab1-seanjones.git";
    git(
      f.local,
      "remote",
      "set-url",
      "origin",
      mode === "scp"
        ? "git@github.com:example-org/27s1-se2030-lab1-seanjones.git"
        : mode === "ssh"
          ? "ssh://git@github.com/example-org/27s1-se2030-lab1-seanjones.git"
          : remote
    );
    const identity = {
      courseFolderId: "trusted-course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada"
    };
    expect(
      recordLocalRepository(getLocalRepositoryLocatorPath(f.root), {
        ...identity,
        localPath: f.local
      })
    ).toBe(true);
    f.advance();
    let fetches = 0;
    let authorized = false;
    const result = await session
      .withAuthenticatedAccount(async (account) => {
        const authenticated = createAuthenticatedDugiteGitWorkspace(account.token, {
          ...runners,
          runGit: async (command) => {
            if (command.args.includes("fetch")) {
              fetches += 1;
              authorized = Object.values(command.env ?? {}).some(
                (value) =>
                  typeof value === "string" &&
                  value.includes(Buffer.from(`x-access-token:${token}`).toString("base64"))
              );
              // Only the transport destination is substituted. Production credential
              // resolution, safety inspection, fetch, merge and persistence all run.
              const response = await runners.runGit({
                ...command,
                args: command.args.map((arg) => (arg === remote ? f.remote : arg))
              });
              if (mode === "sign-out") await session.signOut();
              if (mode === "account-switch") await session.signIn(true);
              return response;
            }
            return runners.runGit(command);
          }
        });
        return createGradingStudentRepositoryUpdateService({
          resolveFacultyScope: () => ({
            status: "success",
            sections: ["001"],
            students: [{ studentId: "ada", githubUsername: "seanjones", section: "001" }],
            errors: []
          }),
          authenticate: async () =>
            authenticated as unknown as import("./gitWorkspaceReader.js").AuthenticatedGitWorkspaceContext,
          revalidate: async () => {
            if (!(await account.revalidateSession())) throw new Error("Session changed");
          },
          loadBackend: () => ({ updateGradingStudentRepository })
        })({ ...identity, courseFolderPath: f.root, userDataPath: f.root });
      })
      .catch(() => ({ status: "github_auth_unavailable" }));
    expect(fetches).toBe(1);
    expect(authorized).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token);
    if (["success", "scp", "ssh"].includes(mode)) {
      expect(result.status).toBe("success");
      expect(await f.workspace.resolveHead()).toBe(git(f.student, "rev-parse", "HEAD"));
      expect(f.read().status).toBe("published");
      expect(f.read().manualAdjustments).toEqual(f.state.manualAdjustments);
      expect(
        await f.workspace.readRevisionFile?.(f.read().submissionCommitSha, "Main.java")
      ).toContain("inserted");
      expect(f.read().appliedComments[0]?.sourceAnchor?.status).toBe("relocated");
    } else {
      expect(result.status).not.toBe("success");
      expect(await f.workspace.resolveHead()).toBe(f.sha);
      expect(f.read()).toEqual(f.state);
    }
    session.shutdown();
  }
);
