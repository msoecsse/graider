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
import { createAssignmentRepositoryUpdateService } from "./assignmentRepositoryUpdateService.js";
import { createGradingStudentRepositoryUpdateService } from "./gradingStudentRepositoryUpdateService.js";
import { getLocalRepositoryLocatorPath, recordLocalRepository } from "./localRepositoryLocator.js";
const load = createRequire(path.join(process.cwd(), "package.json"));
const { updateGradingStudentRepository } = load(
  "./dist-electron/gradingStudentRepositoryUpdateBackend.cjs"
) as RepositoryUpdateBackend;
type GradingState = {
  schemaVersion: 1;
  studentId: string;
  submissionCommitSha: string;
  status: string;
  updatedSinceGrading?: boolean;
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

// Keep identity resolution real; substitute only the network transport after the
// production Git backend has checked the recorded GitHub origin and expected SHA.
const mappedUpdate = (f: Awaited<ReturnType<typeof fixture>>, memberIds: readonly string[]) => {
  fs.cpSync(path.resolve("../tests/fixtures/roster/valid-course"), f.root, { recursive: true });
  const assignmentDirectory = path.join(f.root, "terms/27s1/assignments/lab1");
  fs.mkdirSync(assignmentDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(assignmentDirectory, "assignment.yml"),
    fs
      .readFileSync(path.join(f.root, "terms/27s1/assignments/lab04/assignment.yml"), "utf8")
      .replaceAll("lab04", "lab1") + "\nrepository_mode: group\n"
  );
  const repositoryName = "27s1-se2030-lab1-team";
  const remote = `https://github.com/example-org/${repositoryName}.git`;
  const manifestDirectory = path.join(f.root, "terms/27s1/manifests/lab1");
  fs.mkdirSync(manifestDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(manifestDirectory, "manifest.yml"),
    JSON.stringify({
      schema_version: 2,
      repository_mode: "group",
      targets: [
        {
          target_id: "team",
          mode: "group",
          group_id: "team",
          repository_name: repositoryName,
          section_ids: ["001"],
          student_ids: memberIds,
          github_usernames: memberIds,
          diagnostics: []
        }
      ],
      student_mappings: memberIds.map((studentId) => ({
        student_id: studentId,
        github_username: studentId,
        target_id: "team",
        repository_name: repositoryName
      })),
      diagnostics: []
    })
  );
  git(f.local, "remote", "set-url", "origin", remote);
  for (const studentId of memberIds)
    expect(
      recordLocalRepository(getLocalRepositoryLocatorPath(f.root), {
        courseFolderId: "group-course",
        termCode: "27s1",
        assignmentSlug: "lab1",
        studentId,
        localPath: f.local
      })
    ).toBe(true);
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
  let fetches = 0;
  const execute = async (command: Command) => {
    if (command.args.includes("fetch")) fetches += 1;
    const args = command.args.map((arg) => (arg === remote ? f.remote : arg));
    // No unexpected destination may escape this isolated fixture.
    if (args.some((arg) => arg.includes("github.com"))) throw new Error("Unexpected remote");
    const result = await executeDugite(args, command.cwd, { encoding: "buffer", env: command.env });
    if (result.exitCode !== 0) throw new Error("Isolated Git command failed");
    return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
  };
  const authenticated = createAuthenticatedDugiteGitWorkspace("isolated-test-token", {
    runGit: async (command) => Buffer.from((await execute(command)).stdout).toString("utf8"),
    runGitBinary: execute
  });
  const resolveFacultyScope = () => ({
    status: "success" as const,
    sections: ["001"],
    students: memberIds.map((studentId) => ({
      studentId,
      githubUsername: studentId,
      section: "001"
    })),
    errors: []
  });
  return {
    resolveFacultyScope,
    fetches: () => fetches,
    updateStudent: createGradingStudentRepositoryUpdateService({
      resolveFacultyScope,
      authenticate: async () => authenticated,
      loadBackend: () => ({ updateGradingStudentRepository })
    })
  };
};

it.each(["student source", "managed feedback"])(
  "assignment batch reconciles both members of one clone after %s changes",
  { timeout: 30_000 },
  async (change) => {
    const f = await fixture();
    const memberIds = ["ada", "grace"];
    const graceFile = path.join(path.dirname(stateFile(f.request)), "grace.json");
    fs.writeFileSync(
      graceFile,
      JSON.stringify({ ...f.state, studentId: "grace", status: "complete", finalScoreOverride: 0 })
    );
    fs.writeFileSync(path.join(f.local, "instructor-notes.txt"), "Keep untracked notes");
    if (change === "student source") f.advance();
    else {
      fs.mkdirSync(path.join(f.student, "grading"));
      fs.writeFileSync(path.join(f.student, "grading/report.html"), "Updated Graider feedback");
      git(f.student, "add", "grading/report.html");
      git(f.student, "commit", "-m", "Graider feedback");
      git(f.student, "push");
    }
    const mapped = mappedUpdate(f, memberIds);
    const update = createAssignmentRepositoryUpdateService(mapped);
    const request = {
      courseFolderId: "group-course",
      courseFolderPath: f.root,
      termCode: "27s1",
      assignmentSlug: "lab1",
      userDataPath: f.root
    };
    expect(await update(request)).toMatchObject({ counts: { total: 2, updated: 2, failure: 0 } });
    const grace = JSON.parse(fs.readFileSync(graceFile, "utf8")) as GradingState & {
      finalScoreOverride: number;
    };
    for (const member of [f.read(), grace]) {
      expect(member.submissionCommitSha).toBe(git(f.student, "rev-parse", "HEAD"));
      expect(member.manualAdjustments).toEqual(f.state.manualAdjustments);
      expect(member.appliedComments.map((comment) => comment.text)).toEqual(
        f.state.appliedComments.map((comment) => comment.text)
      );
    }
    expect(f.read().status).toBe(change === "student source" ? "in_progress" : "published");
    expect(grace.status).toBe(change === "student source" ? "in_progress" : "complete");
    expect(f.read().updatedSinceGrading).toBe(change === "student source");
    expect(grace.updatedSinceGrading).toBe(change === "student source");
    expect(grace.finalScoreOverride).toBe(0);
    expect(fs.readFileSync(path.join(f.local, "instructor-notes.txt"), "utf8")).toBe(
      "Keep untracked notes"
    );
    expect(await update(request)).toMatchObject({ counts: { total: 2, unchanged: 2, failure: 0 } });
  }
);

it.each([
  "other assignment",
  "wrong term metadata",
  "wrong assignment metadata",
  "missing locator"
])(
  "v2 production pull refuses %s without changing HEAD or grading",
  { timeout: 30_000 },
  async (mode) => {
    const f = await fixture();
    const mapped = mappedUpdate(f, ["ada"]);
    f.advance();
    const request = {
      courseFolderId: "group-course",
      courseFolderPath: f.root,
      userDataPath: f.root,
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada"
    };
    if (mode === "wrong term metadata") {
      const file = path.join(f.root, "terms/27s1/term.yml");
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("code: 27s1", "code: 28s1"));
    }
    if (mode === "wrong assignment metadata") {
      const file = path.join(f.root, "terms/27s1/assignments/lab1/assignment.yml");
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("slug: lab1", "slug: lab2"));
    }
    if (mode === "other assignment") {
      // Both assignments are valid and accessible; a locator pointing at the
      // first assignment's clone must not authorize the second assignment's pull.
      request.assignmentSlug = "lab2";
      for (const category of ["assignments", "manifests"]) {
        const source = path.join(f.root, "terms/27s1", category, "lab1");
        const destination = path.join(f.root, "terms/27s1", category, "lab2");
        fs.cpSync(source, destination, { recursive: true });
        const file = path.join(
          destination,
          category === "assignments" ? "assignment.yml" : "manifest.yml"
        );
        fs.writeFileSync(file, fs.readFileSync(file, "utf8").replaceAll("lab1", "lab2"));
      }
      expect(
        recordLocalRepository(getLocalRepositoryLocatorPath(f.root), {
          ...request,
          localPath: f.local
        })
      ).toBe(true);
      const otherState = path.join(f.root, ".graider/grading/27s1/lab2/state/ada.json");
      fs.mkdirSync(path.dirname(otherState), { recursive: true });
      fs.writeFileSync(otherState, JSON.stringify(f.state));
    }
    if (mode === "missing locator") request.assignmentSlug = "lab2";
    expect((await mapped.updateStudent(request)).status).toBe(
      mode === "missing locator" ? "repository_not_recorded" : "submission_changed"
    );
    expect(mapped.fetches()).toBe(0);
    expect(await f.workspace.resolveHead()).toBe(f.sha);
    expect(f.read()).toEqual(f.state);
    if (mode === "other assignment")
      expect(
        JSON.parse(
          fs.readFileSync(path.join(f.root, ".graider/grading/27s1/lab2/state/ada.json"), "utf8")
        )
      ).toEqual(f.state);
    expect(fs.existsSync(path.join(f.local, ".git/FETCH_HEAD"))).toBe(false);
  }
);

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
      expect(f.read().status).toBe("in_progress");
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
