import { execFile as executeFile } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import type { GitCredentialResolver } from "../../../src/git/git-credential-resolver.js";
import {
  GitError,
  createBranchName,
  createGitAuthenticationContext,
  type DeleteRemoteBranchRequest,
  type PushBranchRequest,
  type GitWorkspacePreparer,
  type GitWorkspacePreparationFactory
} from "../../../src/git/git-workspace.js";
import { GitHubClientError } from "../../../src/github/github-errors.js";
import {
  createGitHubPullRequestGateway,
  withProductionTemplateSyncWorkspace
} from "../../../src/template-sync/production-template-sync-workspace.js";
import { getTemplateSyncFailure } from "../../../src/template-sync/template-sync-failure.js";

const SHA_LENGTH = 40;
const MAX_GIT_OUTPUT_BYTES = 10_485_760;
const TEMPLATE_SHA = "a".repeat(SHA_LENGTH);
const STUDENT_SHA = "b".repeat(SHA_LENGTH);
const UPDATED_SHA = "c".repeat(SHA_LENGTH);
const TOKEN = "distinctive-secret-token-42";
const input = {
  templateCloneUrl: "https://github.com/course/template.git",
  studentCloneUrl: "https://github.com/course/student.git",
  templateCommitSha: TEMPLATE_SHA,
  studentDefaultBranch: "legacy-hint",
  token: TOKEN,
  githubClient: {} as never
};
const executeGit = promisify(executeFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    })
  );
});

interface FakeWorkspace {
  readonly root: string;
  remoteDefaultBranch: ReturnType<typeof vi.fn>;
  checkoutDetached: ReturnType<typeof vi.fn>;
  createOrResetBranch: ReturnType<typeof vi.fn>;
  deleteRemoteBranch: Mock<(request: DeleteRemoteBranchRequest) => Promise<void>>;
  deleteLocalBranch: ReturnType<typeof vi.fn>;
  resolveHead: ReturnType<typeof vi.fn>;
  resolveRevision: ReturnType<typeof vi.fn>;
  inspect: ReturnType<typeof vi.fn>;
  diff: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  pushBranch: Mock<(request: PushBranchRequest) => Promise<{ kind: "pushed" }>>;
  restoreDisposableAttempt: ReturnType<typeof vi.fn>;
}

const fakeWorkspace = (root: string, branch = "release/course"): FakeWorkspace => {
  const trustedBranch = createBranchName(branch);
  if (trustedBranch === null) throw new Error("The fake branch must be trusted.");
  return {
    root,
    remoteDefaultBranch: vi.fn(() => Promise.resolve(trustedBranch)),
    checkoutDetached: vi.fn(() => Promise.resolve(TEMPLATE_SHA)),
    createOrResetBranch: vi.fn(() => Promise.resolve(STUDENT_SHA)),
    deleteRemoteBranch: vi.fn(() => Promise.resolve()),
    deleteLocalBranch: vi.fn(() => Promise.resolve()),
    resolveHead: vi.fn(() => Promise.resolve(STUDENT_SHA)),
    resolveRevision: vi.fn((revision: string) => Promise.resolve(revision)),
    inspect: vi.fn(() =>
      Promise.resolve({
        workingTree: {
          trackedChanges: [],
          stagedChanges: [],
          untrackedPaths: [],
          conflicts: []
        }
      })
    ),
    diff: vi.fn(() => Promise.resolve({ patch: new Uint8Array() })),
    commit: vi.fn(() => Promise.resolve(UPDATED_SHA)),
    pushBranch: vi.fn(() => Promise.resolve({ kind: "pushed" as const })),
    restoreDisposableAttempt: vi.fn(() => Promise.resolve())
  };
};

const semanticFixture = (
  template = fakeWorkspace("/canonical/template"),
  student = fakeWorkspace("/canonical/student")
) => {
  const clone = vi
    .fn<GitWorkspacePreparationFactory["clone"]>()
    .mockResolvedValueOnce(template as unknown as GitWorkspacePreparer)
    .mockResolvedValueOnce(student as unknown as GitWorkspacePreparer);
  const context = createGitAuthenticationContext("opaque-operation-context");
  if (context === null) throw new Error("The fake context must be trusted.");
  let resolver: GitCredentialResolver | undefined;
  return {
    template,
    student,
    clone,
    context,
    resolver: () => resolver,
    dependencies: {
      createAuthenticationContext: () => context,
      createGitWorkspaceFactory: (candidate?: GitCredentialResolver) => {
        resolver = candidate;
        return { clone } as unknown as GitWorkspacePreparationFactory;
      }
    }
  };
};

describe("production template-sync semantic preparation", () => {
  it("uses semantic no-checkout clones, exact checkout, and the authoritative remote branch", async () => {
    const fixture = semanticFixture();

    await expect(
      withProductionTemplateSyncWorkspace(
        input,
        ({ gateway, pullRequests, studentDefaultBranch }) => {
          expect(gateway).toMatchObject({
            options: {
              templateWorkspace: fixture.template,
              studentWorkspace: fixture.student,
              authentication: fixture.context
            }
          });
          expect(pullRequests).toBeDefined();
          expect(studentDefaultBranch).toBe("release/course");
          return Promise.resolve("prepared");
        },
        fixture.dependencies
      )
    ).resolves.toBe("prepared");

    expect(fixture.clone).toHaveBeenCalledTimes(2);
    const templateRequest = fixture.clone.mock.calls[0]?.[0];
    const studentRequest = fixture.clone.mock.calls[1]?.[0];
    expect(templateRequest).toMatchObject({
      remote: input.templateCloneUrl,
      checkout: "none",
      authentication: fixture.context
    });
    expect(studentRequest).toMatchObject({
      remote: input.studentCloneUrl,
      checkout: "none",
      authentication: fixture.context
    });
    expect(templateRequest?.destination).toMatch(/graider-template-sync-.*\/template$/u);
    expect(studentRequest?.destination).toMatch(/graider-template-sync-.*\/student$/u);
    expect(JSON.stringify([templateRequest, studentRequest])).not.toContain(TOKEN);
    expect(fixture.context.id).not.toContain(TOKEN);
    expect(fixture.template.checkoutDetached).toHaveBeenCalledWith(TEMPLATE_SHA);
    expect(fixture.student.remoteDefaultBranch).toHaveBeenCalledWith("origin");
    expect(fixture.student.createOrResetBranch).toHaveBeenCalledWith({
      branch: "release/course",
      startPoint: { remote: "origin", branch: "release/course" }
    });
    await expect(fixture.resolver()?.resolve(fixture.context)).resolves.toEqual({
      kind: "github_token",
      host: "github.com",
      token: TOKEN
    });
    const unrelatedContext = createGitAuthenticationContext("unrelated-context");
    if (unrelatedContext === null) throw new Error("The unrelated context must be trusted.");
    await expect(fixture.resolver()?.resolve(unrelatedContext)).resolves.toBeNull();
  });

  it("omits the resolver and authentication context when token is null", async () => {
    const fixture = semanticFixture();
    await withProductionTemplateSyncWorkspace(
      { ...input, token: null },
      ({ gateway }) => {
        expect(gateway).toMatchObject({
          options: {
            templateWorkspace: fixture.template,
            studentWorkspace: fixture.student
          }
        });
        const options = gateway as unknown as {
          readonly options: { readonly authentication?: unknown };
        };
        expect(options.options.authentication).toBeUndefined();
        return Promise.resolve();
      },
      fixture.dependencies
    );
    expect(fixture.resolver()).toBeUndefined();
    expect(
      fixture.clone.mock.calls.every(([request]) => request.authentication === undefined)
    ).toBe(true);
  });

  it("passes opaque authentication to gateway branch deletion and keeps failures redacted", async () => {
    const fixture = semanticFixture();
    fixture.student.deleteRemoteBranch.mockImplementation((request: DeleteRemoteBranchRequest) => {
      expect(request.authentication).toBe(fixture.context);
      return Promise.reject(
        new GitError("remote_unavailable", "delete_remote_branch", new Error(TOKEN))
      );
    });

    await withProductionTemplateSyncWorkspace(
      input,
      async ({ gateway }) => {
        const error = await gateway
          .deleteRemoteBranch(
            { owner: "course", name: "student", defaultBranch: "main" },
            "graider/template-update-123456789abc"
          )
          .catch((caught: unknown) => caught);

        expect(getTemplateSyncFailure(error)).toEqual({
          stage: "push_failed",
          message: "Unable to delete the template-update branch."
        });
        expect(JSON.stringify(error)).not.toContain(TOKEN);
        expect(JSON.stringify(getTemplateSyncFailure(error))).not.toContain(TOKEN);
      },
      fixture.dependencies
    );

    expect(fixture.student.deleteRemoteBranch).toHaveBeenCalledOnce();
    expect(fixture.student.deleteLocalBranch).not.toHaveBeenCalled();
  });

  it("passes opaque authentication to gateway push and keeps push failures redacted", async () => {
    const fixture = semanticFixture();
    fixture.student.pushBranch.mockImplementation((request: PushBranchRequest) => {
      expect(request.authentication).toBe(fixture.context);
      return Promise.reject(new GitError("remote_unavailable", "push", new Error(TOKEN)));
    });

    await withProductionTemplateSyncWorkspace(
      input,
      async ({ gateway }) => {
        const error = await gateway
          .applyAndPushTemplateDelta({
            templateRepository: { owner: "course", name: "template" },
            studentRepository: { owner: "course", name: "student", defaultBranch: "main" },
            templateBaseCommitSha: TEMPLATE_SHA,
            templateTargetCommitSha: TEMPLATE_SHA,
            studentBaseCommitSha: STUDENT_SHA,
            studentCurrentCommitSha: STUDENT_SHA,
            changes: []
          })
          .catch((caught: unknown) => caught);

        expect(getTemplateSyncFailure(error)).toEqual({
          stage: "push_failed",
          message: "Push to student repository was rejected."
        });
        expect(JSON.stringify(error)).not.toContain(TOKEN);
        expect(JSON.stringify(getTemplateSyncFailure(error))).not.toContain(TOKEN);
      },
      fixture.dependencies
    );

    expect(fixture.student.pushBranch).toHaveBeenCalledOnce();
    expect(fixture.student.restoreDisposableAttempt).toHaveBeenCalledWith({
      expectedHead: STUDENT_SHA,
      removeUntracked: true
    });
  });

  it.each([
    [1, "template_clone_failed", "Unable to clone template repository."],
    [2, "student_clone_failed", "Unable to clone student repository."]
  ])("maps clone failure %i and stops preparation", async (failureCall, stage, message) => {
    const fixture = semanticFixture();
    fixture.clone.mockReset();
    if (failureCall === 1) fixture.clone.mockRejectedValueOnce(new Error("private clone detail"));
    else
      fixture.clone
        .mockResolvedValueOnce(fixture.template as unknown as GitWorkspacePreparer)
        .mockRejectedValueOnce(new Error("private clone detail"));
    const operation = vi.fn(() => Promise.resolve());

    const error = await withProductionTemplateSyncWorkspace(
      input,
      operation,
      fixture.dependencies
    ).catch((caught: unknown) => caught);

    expect(getTemplateSyncFailure(error)).toEqual({ stage, message });
    expect(JSON.stringify(getTemplateSyncFailure(error))).not.toMatch(/token|private|workspace/iu);
    expect(fixture.clone).toHaveBeenCalledTimes(failureCall);
    expect(fixture.template.checkoutDetached).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });

  it("maps malformed and failed detached checkout to the fixed template stage", async () => {
    const malformedFixture = semanticFixture();
    const malformed = await withProductionTemplateSyncWorkspace(
      { ...input, templateCommitSha: "HEAD" },
      () => Promise.resolve(),
      malformedFixture.dependencies
    ).catch((caught: unknown) => caught);
    expect(getTemplateSyncFailure(malformed)).toEqual({
      stage: "template_checkout_failed",
      message: "Unable to check out the requested template revision."
    });
    expect(malformedFixture.template.checkoutDetached).not.toHaveBeenCalled();

    const failedFixture = semanticFixture();
    failedFixture.template.checkoutDetached = vi.fn(() => Promise.reject(new Error("stderr")));
    const failed = await withProductionTemplateSyncWorkspace(
      input,
      () => Promise.resolve(),
      failedFixture.dependencies
    ).catch((caught: unknown) => caught);
    expect(getTemplateSyncFailure(failed)).toEqual({
      stage: "template_checkout_failed",
      message: "Unable to check out the requested template revision."
    });
  });

  it.each(["failure", "missing"])("maps default branch %s safely", async (mode) => {
    const fixture = semanticFixture();
    fixture.student.remoteDefaultBranch =
      mode === "failure"
        ? vi.fn(() => Promise.reject(new Error("stderr")))
        : vi.fn(() => Promise.resolve(null));
    const operation = vi.fn(() => Promise.resolve());

    const error = await withProductionTemplateSyncWorkspace(
      input,
      operation,
      fixture.dependencies
    ).catch((caught: unknown) => caught);

    expect(getTemplateSyncFailure(error)).toEqual({
      stage: "student_checkout_failed",
      message: "Graider could not determine the repository default branch."
    });
    expect(fixture.student.createOrResetBranch).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });

  it("maps local branch preparation failure and never invokes the callback", async () => {
    const fixture = semanticFixture();
    fixture.student.createOrResetBranch = vi.fn(() => Promise.reject(new Error("stderr")));
    const operation = vi.fn(() => Promise.resolve());
    const error = await withProductionTemplateSyncWorkspace(
      input,
      operation,
      fixture.dependencies
    ).catch((caught: unknown) => caught);
    expect(getTemplateSyncFailure(error)).toEqual({
      stage: "student_checkout_failed",
      message: "Unable to check out the student default branch."
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it("cleans the operation directory and preserves callback results and errors", async () => {
    const fixture = semanticFixture();
    let operationDirectory = "";
    fixture.clone.mockImplementation((request) => {
      operationDirectory = join(request.destination, "..");
      return Promise.resolve(
        (request.destination.endsWith("template")
          ? fixture.template
          : fixture.student) as unknown as GitWorkspacePreparer
      );
    });
    await expect(
      withProductionTemplateSyncWorkspace(input, () => Promise.resolve("ok"), fixture.dependencies)
    ).resolves.toBe("ok");
    await expect(access(operationDirectory)).rejects.toBeDefined();

    const primary = new Error("primary callback error");
    await expect(
      withProductionTemplateSyncWorkspace(
        input,
        () => Promise.reject(primary),
        semanticFixture().dependencies
      )
    ).rejects.toBe(primary);
  });
});

const git = async (directory: string | undefined, ...args: readonly string[]): Promise<string> =>
  (
    await executeGit("git", [...(directory === undefined ? [] : ["-C", directory]), ...args], {
      maxBuffer: MAX_GIT_OUTPUT_BYTES
    })
  ).stdout.trim();

const createBareRemote = async (root: string, name: string, branch: string) => {
  const source = join(root, `${name}-source`);
  const remote = join(root, `${name}.git`);
  await git(undefined, "init", source);
  await git(source, "config", "user.name", "Graider Test");
  await git(source, "config", "user.email", "graider@example.test");
  await writeFile(join(source, "README.md"), `${name}\n`);
  await git(source, "add", "README.md");
  await git(source, "commit", "-m", "Initial commit");
  await git(source, "branch", "-M", branch);
  await git(undefined, "init", "--bare", remote);
  await git(source, "remote", "add", "origin", remote);
  await git(source, "push", "origin", branch);
  await git(undefined, "--git-dir", remote, "symbolic-ref", "HEAD", `refs/heads/${branch}`);
  return { remote, sha: await git(source, "rev-parse", "HEAD") };
};

const realFixture = async (studentBranch: string) => {
  const root = await mkdtemp(join(tmpdir(), "graider-workspace-test-"));
  temporaryDirectories.push(root);
  return {
    template: await createBareRemote(root, "template", "main"),
    student: await createBareRemote(root, "student", studentBranch)
  };
};

describe("production template-sync local integration", () => {
  it("uses bundled Git for the default production workspace when PATH is unavailable", async () => {
    const { template, student } = await realFixture("release/course");
    const originalPath = process.env.PATH;
    let prepared:
      | {
          readonly templateRoot: string;
          readonly studentRoot: string;
          readonly studentDefaultBranch: string;
        }
      | undefined;

    process.env.PATH = "";
    try {
      prepared = await withProductionTemplateSyncWorkspace(
        {
          ...input,
          templateCloneUrl: template.remote,
          studentCloneUrl: student.remote,
          templateCommitSha: template.sha,
          token: null
        },
        ({ gateway, studentDefaultBranch }) => {
          const options = gateway as unknown as {
            readonly options: {
              readonly templateWorkspace: { readonly root: string };
              readonly studentWorkspace: { readonly root: string };
            };
          };
          return Promise.resolve({
            templateRoot: options.options.templateWorkspace.root,
            studentRoot: options.options.studentWorkspace.root,
            studentDefaultBranch
          });
        }
      );
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }

    expect(prepared.studentDefaultBranch).toBe("release/course");
    expect(prepared.templateRoot).toMatch(/graider-template-sync-.*\/template$/u);
    expect(prepared.studentRoot).toMatch(/graider-template-sync-.*\/student$/u);
  });

  it.each([
    ["main", "master"],
    ["master", "main"],
    ["main", "release/course"]
  ])("ignores legacy %s and prepares remote default %s", async (legacy, branch) => {
    const { template, student } = await realFixture(branch);
    const remoteRefsBefore = await git(
      undefined,
      "--git-dir",
      student.remote,
      "for-each-ref",
      "--format=%(refname):%(objectname)",
      "refs/heads"
    );
    await withProductionTemplateSyncWorkspace(
      {
        ...input,
        templateCloneUrl: template.remote,
        studentCloneUrl: student.remote,
        templateCommitSha: template.sha,
        studentDefaultBranch: legacy,
        token: null
      },
      async (workspace) => {
        const gateway = workspace.gateway as unknown as {
          options: {
            templateWorkspace: { root: string };
            studentWorkspace: { root: string };
          };
        };
        expect(workspace.studentDefaultBranch).toBe(branch);
        expect(await git(gateway.options.templateWorkspace.root, "branch", "--show-current")).toBe(
          ""
        );
        expect(await git(gateway.options.templateWorkspace.root, "rev-parse", "HEAD")).toBe(
          template.sha
        );
        expect(await git(gateway.options.studentWorkspace.root, "branch", "--show-current")).toBe(
          branch
        );
        expect(await git(gateway.options.studentWorkspace.root, "rev-parse", "HEAD")).toBe(
          student.sha
        );
      }
    );
    expect(
      await git(
        undefined,
        "--git-dir",
        student.remote,
        "for-each-ref",
        "--format=%(refname):%(objectname)",
        "refs/heads"
      )
    ).toBe(remoteRefsBefore);
  });

  it("does not fall back when remote HEAD points to a missing branch", async () => {
    const { template, student } = await realFixture("main");
    await git(undefined, "--git-dir", student.remote, "symbolic-ref", "HEAD", "refs/heads/missing");
    const operation = vi.fn(() => Promise.resolve());
    const error = await withProductionTemplateSyncWorkspace(
      {
        ...input,
        templateCloneUrl: template.remote,
        studentCloneUrl: student.remote,
        templateCommitSha: template.sha,
        studentDefaultBranch: "main",
        token: null
      },
      operation
    ).catch((caught: unknown) => caught);
    expect(getTemplateSyncFailure(error)).toEqual({
      stage: "student_checkout_failed",
      message: "Graider could not determine the repository default branch."
    });
    expect(operation).not.toHaveBeenCalled();
  });
});

describe("production template-sync diagnostics", () => {
  it("keeps GitHub permission failures fixed and safe", async () => {
    const gateway = createGitHubPullRequestGateway({
      findPullRequest: vi.fn(() =>
        Promise.reject(new GitHubClientError("permission_denied", `denied ${TOKEN}`))
      )
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
    expect(JSON.stringify(getTemplateSyncFailure(error))).not.toContain(TOKEN);
  });
});
