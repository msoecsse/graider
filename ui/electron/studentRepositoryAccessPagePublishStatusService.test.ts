import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createRelativeGitPath,
  type GitRepositoryState,
  type GitWorkspaceInspectionFactory
} from "./gitWorkspaceReader";
import type { StudentRepositoryAccessPageRequest } from "./ipc";
import { getStudentRepositoryAccessPagePublishStatus } from "./studentRepositoryAccessPagePublishStatusService";

const assignmentFile = "terms/27s1/assignments/lab02/assignment.yml";
const outputPath = "terms/27s1/notifications/lab02/student-repositories.html";
const pagesRoot = (root: string): string => path.join(root, "pages repo");
const createRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "graider-publish-status "));
const git = (root: string, arguments_: readonly string[]): void => {
  execFileSync("git", arguments_, { cwd: root, stdio: "ignore" });
};
const request = (root: string): StudentRepositoryAccessPageRequest => ({
  courseFolderId: "course",
  courseFolderPath: root,
  assignmentFile,
  pagesRepositoryFolderPath: pagesRoot(root)
});
const writeFixture = (root: string, pageExists = true, pagesSettings = true): void => {
  fs.writeFileSync(
    path.join(root, "course.yml"),
    pagesSettings
      ? "course:\n  code: CSC1120\n  title: Data Structures\n  repository: csc1120\ngithub:\n  organization: graider-sandbox\nnotifications:\n  student_access_pages:\n    repository: csc1120/csc1120pages\n    base_url: https://csc1120.github.io/csc1120pages\n    branch: main\n"
      : "course:\n  code: CSC1120\n  title: Data Structures\n",
    "utf8"
  );
  fs.mkdirSync(pagesRoot(root), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(root, assignmentFile)), { recursive: true });
  fs.writeFileSync(
    path.join(root, assignmentFile),
    'assignment:\n  title: Lab 02\n  status: active\ntemplate:\n  repository: owner/template\n  branch: main\nsections:\n  - "001"\ndeadline:\n  due_at: "2027-06-15T23:59:00-05:00"\n  late_policy: standard\nmetadata:\n  faculty_owner: professor\n  grading_category: labs\n  points: 100\n',
    "utf8"
  );
  if (pageExists) {
    fs.mkdirSync(path.dirname(path.join(pagesRoot(root), outputPath)), { recursive: true });
    fs.writeFileSync(path.join(pagesRoot(root), outputPath), "<!doctype html>\n", "utf8");
  }
};
const initializeRepository = (root: string): void => {
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Test User"]);
};
const commitAll = (root: string): void => {
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "Initial"]);
};

describe("studentRepositoryAccessPagePublishStatusService", () => {
  const mappings = { manifestStatus: "not_applied" as const, mappings: [], diagnostics: [] };
  it("reports a missing generated page without running publish actions", async () => {
    const root = createRoot();
    writeFixture(root, false);
    const result = await getStudentRepositoryAccessPagePublishStatus(request(root), mappings);
    expect(result.status).toBe("not_generated");
    expect(result.checks.fileExists).toBe(false);
    expect(result.suggestedCommands).toEqual([]);
  });

  it("reports non-git folders and uncommitted generated files using the exact output path", async () => {
    const nonGitRoot = createRoot();
    writeFixture(nonGitRoot);
    expect(
      (await getStudentRepositoryAccessPagePublishStatus(request(nonGitRoot), mappings)).status
    ).toBe("not_git_repo");

    const root = createRoot();
    writeFixture(root);
    initializeRepository(pagesRoot(root));
    const result = await getStudentRepositoryAccessPagePublishStatus(request(root), mappings);
    expect(result.status).toBe("uncommitted");
    expect(result.checks.hasUncommittedAccessPage).toBe(true);
    expect(result.suggestedCommands.join(" ")).toContain(outputPath);
  });

  it("distinguishes no upstream, unpushed commits, and ready local checks without a network remote", async () => {
    const root = createRoot();
    writeFixture(root);
    initializeRepository(pagesRoot(root));
    commitAll(pagesRoot(root));
    expect(
      (await getStudentRepositoryAccessPagePublishStatus(request(root), mappings)).status
    ).toBe("no_upstream");

    const remote = fs.mkdtempSync(path.join(os.tmpdir(), "graider-publish-remote-"));
    git(remote, ["init", "--bare"]);
    git(pagesRoot(root), ["remote", "add", "origin", remote]);
    git(pagesRoot(root), ["commit", "--allow-empty", "-m", "Ahead"]);
    git(pagesRoot(root), ["push", "-u", "origin", "HEAD"]);
    git(pagesRoot(root), ["commit", "--allow-empty", "-m", "Unpushed"]);
    expect(
      (await getStudentRepositoryAccessPagePublishStatus(request(root), mappings)).status
    ).toBe("unpushed");
    git(pagesRoot(root), ["push"]);
    expect(
      (await getStudentRepositoryAccessPagePublishStatus(request(root), mappings)).status
    ).toBe("ready_to_publish");
  });

  it("does not guess a Pages URL when course settings are incomplete", async () => {
    const root = createRoot();
    writeFixture(root, true, false);
    initializeRepository(pagesRoot(root));
    commitAll(pagesRoot(root));
    const result = await getStudentRepositoryAccessPagePublishStatus(request(root), mappings);
    expect(result.pagesUrl).toBeNull();
    expect(result.status).toBe("failure");
    expect(result.diagnostics.map((item) => item.message).join(" ")).toContain("not configured");
  });
});

describe("student access page semantic publish-status projection", () => {
  const mappings = { manifestStatus: "not_applied" as const, mappings: [], diagnostics: [] };
  const trustedPath = (value: string) => {
    const trusted = createRelativeGitPath(value);
    if (trusted === null) throw new Error("Expected a trusted fixture path.");
    return trusted;
  };
  const state = (overrides: Partial<GitRepositoryState> = {}): GitRepositoryState => ({
    kind: "repository",
    root: "/pages",
    head: { kind: "attached", branch: "main", commit: "a".repeat(40) },
    workingTree: {
      trackedChanges: [],
      stagedChanges: [],
      untrackedPaths: [],
      conflicts: []
    },
    upstream: {
      kind: "configured",
      remote: "origin",
      branch: "origin/main",
      ahead: 0,
      behind: 0,
      relation: "current"
    },
    ...overrides
  });
  const factory = (
    fullState: GitRepositoryState,
    pageState = state(),
    remoteUrl: string | null = "https://github.com/csc1120/csc1120pages.git"
  ): GitWorkspaceInspectionFactory => {
    const inspect = vi
      .fn()
      .mockImplementation((options?: { readonly paths?: readonly string[] }) =>
        Promise.resolve(options?.paths === undefined ? fullState : pageState)
      );
    return {
      inspect: vi.fn().mockResolvedValue({ kind: "repository", root: fullState.root }),
      open: vi.fn().mockResolvedValue({
        root: fullState.root,
        inspect,
        remoteUrl: vi.fn().mockResolvedValue(remoteUrl)
      })
    };
  };
  const preparedRoot = (): string => {
    const root = createRoot();
    writeFixture(root);
    return root;
  };

  it("uses exact path inspection while retaining unrelated full-tree changes", async () => {
    const root = preparedRoot();
    const page = trustedPath(outputPath);
    const other = trustedPath("notes.txt");
    const result = await getStudentRepositoryAccessPagePublishStatus(
      request(root),
      mappings,
      factory(
        state({
          workingTree: {
            trackedChanges: [{ kind: "modified", path: page }],
            stagedChanges: [],
            untrackedPaths: [other],
            conflicts: []
          }
        }),
        state({
          workingTree: {
            trackedChanges: [{ kind: "modified", path: page }],
            stagedChanges: [],
            untrackedPaths: [],
            conflicts: []
          }
        })
      )
    );

    expect(result.status).toBe("uncommitted");
    expect(result.checks.hasUncommittedAccessPage).toBe(true);
    expect(result.checks.hasUncommittedOtherChanges).toBe(true);
  });

  it("projects missing, behind, ahead, and current upstream states", async () => {
    const root = preparedRoot();
    const opened = (repositoryState: GitRepositoryState) =>
      getStudentRepositoryAccessPagePublishStatus(
        request(root),
        mappings,
        factory(repositoryState)
      );

    await expect(opened(state({ upstream: { kind: "missing" } }))).resolves.toMatchObject({
      status: "no_upstream",
      checks: { currentBranch: "main", upstreamBranch: null }
    });
    await expect(
      opened(
        state({
          upstream: {
            kind: "configured",
            remote: "origin",
            branch: "origin/main",
            ahead: 0,
            behind: 1,
            relation: "behind"
          }
        })
      )
    ).resolves.toMatchObject({ status: "behind_upstream", checks: { behindCount: 1 } });
    await expect(
      opened(
        state({
          upstream: {
            kind: "configured",
            remote: "origin",
            branch: "origin/main",
            ahead: 1,
            behind: 0,
            relation: "ahead"
          }
        })
      )
    ).resolves.toMatchObject({ status: "unpushed", checks: { aheadCount: 1 } });
    await expect(opened(state())).resolves.toMatchObject({
      status: "ready_to_publish",
      checks: { aheadCount: 0, behindCount: 0 }
    });
  });

  it("preserves true, false, and unknown origin matching semantics", async () => {
    const root = preparedRoot();
    const inspect = (remote: string | null) =>
      getStudentRepositoryAccessPagePublishStatus(
        request(root),
        mappings,
        factory(state(), state(), remote)
      );

    await expect(inspect("https://github.com/csc1120/csc1120pages.git")).resolves.toMatchObject({
      checks: { remoteMatchesConfiguredRepository: true }
    });
    await expect(inspect("https://github.com/csc1120/other.git")).resolves.toMatchObject({
      checks: { remoteMatchesConfiguredRepository: false }
    });
    await expect(inspect(null)).resolves.toMatchObject({
      checks: { remoteMatchesConfiguredRepository: null }
    });
  });

  it("maps semantic non-repositories and inspection failures to fixed results", async () => {
    const root = preparedRoot();
    const nonRepository = factory(state());
    vi.mocked(nonRepository.inspect).mockResolvedValueOnce({ kind: "not_repository" });
    await expect(
      getStudentRepositoryAccessPagePublishStatus(request(root), mappings, nonRepository)
    ).resolves.toMatchObject({ status: "not_git_repo" });

    const failed = factory(state());
    vi.mocked(failed.open).mockRejectedValueOnce(new Error("private raw failure"));
    const result = await getStudentRepositoryAccessPagePublishStatus(
      request(root),
      mappings,
      failed
    );
    expect(result.status).toBe("failure");
    expect(result.diagnostics.map(({ message }) => message).join(" ")).not.toContain("private");
  });
});
