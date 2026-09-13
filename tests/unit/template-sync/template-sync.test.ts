import { describe, expect, it } from "vitest";
import {
  reconcileTemplateUpdatePullRequest,
  syncTemplateUpdate,
  type InitializedTemplateSyncAnchors,
  type TemplateSyncGitGateway,
  type TemplateSyncInput,
  type TemplateSyncBaselineRecoveryResult,
  type TemplateSyncPullRequestGateway,
  type TemplateTree
} from "../../../src/template-sync/template-sync.js";

const templateRepository = { owner: "course", name: "template" };
const studentRepository = { owner: "course", name: "student", defaultBranch: "main" };
const baseTree: TemplateTree = { "README.md": "base", "starter.ts": "old" };
const changedTree: TemplateTree = { "README.md": "faculty", "starter.ts": "old" };

class FakeGateway implements TemplateSyncGitGateway {
  readonly commits = new Map<string, TemplateTree>();
  readonly applied: Parameters<TemplateSyncGitGateway["applyAndPushTemplateDelta"]>[0][] = [];
  pushed = false;
  readonly preparedBranches: Parameters<TemplateSyncGitGateway["prepareConflictBranch"]>[0][] = [];
  result: "clean" | "conflict" | "failure" = "clean";
  deletedBranches: string[] = [];
  failBranchCleanup = false;
  recoveryResult: TemplateSyncBaselineRecoveryResult = { status: "not_found" };
  readonly recoveryAttempts: Parameters<TemplateSyncGitGateway["recoverStudentBaseline"]>[0][] = [];

  getTree(_repository: { owner: string; name: string }, commitSha: string): Promise<TemplateTree> {
    const tree = this.commits.get(commitSha);
    return tree === undefined
      ? Promise.reject(new Error(`Missing ${commitSha}`))
      : Promise.resolve(tree);
  }

  getDefaultBranchCommitSha(): Promise<string> {
    return Promise.resolve("student-current");
  }

  recoverStudentBaseline(
    input: Parameters<TemplateSyncGitGateway["recoverStudentBaseline"]>[0]
  ): Promise<TemplateSyncBaselineRecoveryResult> {
    this.recoveryAttempts.push(input);
    return Promise.resolve(this.recoveryResult);
  }

  applyAndPushTemplateDelta(
    input: Parameters<TemplateSyncGitGateway["applyAndPushTemplateDelta"]>[0]
  ) {
    this.applied.push(input);
    if (this.result === "conflict") return Promise.resolve({ status: "conflict" as const });
    if (this.result === "failure") return Promise.reject(new Error("push failed"));
    this.pushed = true;
    return Promise.resolve({ status: "clean" as const, commitSha: "student-after-push" });
  }

  prepareConflictBranch(
    input: Parameters<TemplateSyncGitGateway["prepareConflictBranch"]>[0]
  ): Promise<void> {
    this.preparedBranches.push(input);
    return Promise.resolve();
  }

  deleteRemoteBranch(_repository: typeof studentRepository, branchName: string): Promise<void> {
    this.deletedBranches.push(branchName);
    return this.failBranchCleanup
      ? Promise.reject(new Error("branch cleanup failed"))
      : Promise.resolve();
  }
}

class FakePullRequests implements TemplateSyncPullRequestGateway {
  readonly created: Parameters<TemplateSyncPullRequestGateway["createPullRequest"]>[0][] = [];
  fail = false;
  existing: { number: number; url: string; state: "open" | "closed"; merged: boolean } | null =
    null;

  createPullRequest(input: Parameters<TemplateSyncPullRequestGateway["createPullRequest"]>[0]) {
    this.created.push(input);
    if (this.fail) return Promise.reject(new Error("PR creation failed"));
    return Promise.resolve({ number: 42, url: "https://github.test/course/student/pull/42" });
  }

  findPullRequest(): Promise<{
    number: number;
    url: string;
    state: "open" | "closed";
    merged: boolean;
  } | null> {
    return Promise.resolve(this.existing);
  }
}

const input = (
  overrides: Partial<Omit<TemplateSyncInput, "gateway">> = {}
): Omit<TemplateSyncInput, "gateway"> => ({
  templateRepository,
  studentRepository,
  currentTemplateCommitSha: "template-new",
  anchors: {
    templateCommitSha: "template-base",
    studentDefaultBranchCommitSha: "student-base",
    templateSyncBaselineStatus: "initialized"
  },
  pullRequests: new FakePullRequests(),
  updateAnchors: () => Promise.resolve(),
  ...overrides
});

const gatewayWithTrees = (): FakeGateway => {
  const gateway = new FakeGateway();
  gateway.commits.set("template-base", baseTree);
  gateway.commits.set("template-new", changedTree);
  gateway.commits.set("student-current", { ...baseTree });
  return gateway;
};

describe("syncTemplateUpdate", () => {
  it("updates a clean faculty-only file change and advances anchors after push", async () => {
    const gateway = gatewayWithTrees();
    const storedAnchors: TemplateSyncInput["anchors"][] = [];

    await expect(
      syncTemplateUpdate({
        ...input({
          updateAnchors: (anchors) => {
            storedAnchors.push(anchors);
            return Promise.resolve();
          }
        }),
        gateway
      })
    ).resolves.toEqual({ status: "updated", commitSha: "student-after-push" });
    expect(gateway.applied[0]?.changes).toEqual([
      { path: "README.md", status: "modified", before: "base", after: "faculty" }
    ]);
    expect(storedAnchors).toEqual([
      {
        templateCommitSha: "template-new",
        studentDefaultBranchCommitSha: "student-after-push",
        templateSyncBaselineStatus: "initialized"
      }
    ]);
  });

  it("passes the template delta to a three-way gateway so nonconflicting student edits survive", async () => {
    const gateway = gatewayWithTrees();
    gateway.commits.set("student-current", { "README.md": "base", "starter.ts": "student edit" });

    await syncTemplateUpdate({ ...input(), gateway });

    expect(gateway.applied[0]).toMatchObject({
      studentCurrentCommitSha: "student-current",
      changes: [{ path: "README.md", status: "modified" }]
    });
  });

  it.each([
    ["added template file", {}, { "new.txt": "new" }, "added"],
    ["deleted template file", { "old.txt": "old" }, {}, "deleted"]
  ])("propagates an %s when clean", async (_label, before, after, status) => {
    const gateway = gatewayWithTrees();
    gateway.commits.set("template-base", before);
    gateway.commits.set("template-new", after);

    await syncTemplateUpdate({ ...input(), gateway });

    expect(gateway.applied[0]?.changes[0]).toMatchObject({
      path: Object.keys({ ...before, ...after })[0],
      status
    });
  });

  it("creates a conflict PR from the recorded student baseline without advancing anchors", async () => {
    const gateway = gatewayWithTrees();
    gateway.result = "conflict";
    const updateAnchors = () => Promise.resolve(expect.unreachable("anchors must not advance"));
    const pullRequests = new FakePullRequests();

    await expect(
      syncTemplateUpdate({
        ...input({
          studentRepository: { ...studentRepository, defaultBranch: "release/course" },
          updateAnchors,
          pullRequests
        }),
        gateway
      })
    ).resolves.toEqual({
      status: "pull_request_created",
      pullRequest: { number: 42, url: "https://github.test/course/student/pull/42" },
      branchName: "graider/template-update-template-new",
      templateCommitSha: "template-new"
    });
    expect(gateway.pushed).toBe(false);
    expect(gateway.preparedBranches[0]).toMatchObject({
      branchName: "graider/template-update-template-new",
      studentBaseCommitSha: "student-base",
      templateTargetCommitSha: "template-new"
    });
    expect(pullRequests.created).toEqual([
      expect.objectContaining({
        sourceBranch: "graider/template-update-template-new",
        targetBranch: "release/course",
        title: "Template update"
      })
    ]);
  });

  it("returns failure without anchor changes when PR creation fails", async () => {
    const gateway = gatewayWithTrees();
    gateway.result = "conflict";
    const pullRequests = new FakePullRequests();
    pullRequests.fail = true;
    const updateAnchors = () => Promise.resolve(expect.unreachable("anchors must not advance"));

    await expect(
      syncTemplateUpdate({ ...input({ pullRequests, updateAnchors }), gateway })
    ).resolves.toMatchObject({ status: "failure" });
    expect(gateway.pushed).toBe(false);
  });

  it("returns AlreadyCurrent without Git or anchor mutation", async () => {
    const gateway = gatewayWithTrees();
    const updateAnchors = () => Promise.resolve(expect.unreachable("anchors must not advance"));

    await expect(
      syncTemplateUpdate({
        ...input({ currentTemplateCommitSha: "template-base", updateAnchors }),
        gateway
      })
    ).resolves.toEqual({ status: "already_current" });
    expect(gateway.applied).toEqual([]);
    expect(gateway.preparedBranches).toEqual([]);
  });

  it("returns BaselineRequired without mutation", async () => {
    const gateway = gatewayWithTrees();

    await expect(
      syncTemplateUpdate({
        ...input({ anchors: { templateSyncBaselineStatus: "baseline_required" } }),
        gateway
      })
    ).resolves.toEqual({ status: "baseline_required" });
    expect(gateway.recoveryAttempts).toEqual([]);
    expect(gateway.applied).toEqual([]);
  });

  it.each([
    {
      templateCommitSha: "template-base",
      templateSyncBaselineStatus: "initialized" as const
    },
    {
      templateCommitSha: "template-base",
      studentDefaultBranchCommitSha: "student-base",
      templateSyncBaselineStatus: "baseline_required" as const
    }
  ])("does not attempt recovery outside the exact legacy anchor state", async (anchors) => {
    const gateway = gatewayWithTrees();

    await expect(syncTemplateUpdate({ ...input({ anchors }), gateway })).resolves.toEqual({
      status: "baseline_required"
    });
    expect(gateway.recoveryAttempts).toEqual([]);
  });

  it("recovers an eligible legacy baseline and continues with a clean update", async () => {
    const gateway = gatewayWithTrees();
    gateway.recoveryResult = {
      status: "recovered",
      studentDefaultBranchCommitSha: "student-historical"
    };
    const anchors: InitializedTemplateSyncAnchors[] = [];

    await expect(
      syncTemplateUpdate({
        ...input({
          anchors: {
            templateCommitSha: "template-base",
            templateSyncBaselineStatus: "baseline_required"
          },
          updateAnchors: (updated) => {
            anchors.push(updated);
            return Promise.resolve();
          }
        }),
        gateway
      })
    ).resolves.toEqual({ status: "updated", commitSha: "student-after-push" });

    expect(gateway.recoveryAttempts).toEqual([
      {
        templateRepository,
        studentRepository,
        templateCommitSha: "template-base"
      }
    ]);
    expect(gateway.applied[0]?.studentBaseCommitSha).toBe("student-historical");
    expect(anchors).toEqual([
      {
        templateCommitSha: "template-base",
        studentDefaultBranchCommitSha: "student-historical",
        templateSyncBaselineStatus: "initialized"
      },
      {
        templateCommitSha: "template-new",
        studentDefaultBranchCommitSha: "student-after-push",
        templateSyncBaselineStatus: "initialized"
      }
    ]);
  });

  it.each([
    ["not_found", "no_reliable_match"],
    ["ambiguous", "ambiguous_matches"]
  ] as const)(
    "keeps an eligible legacy repository baseline-required when recovery is %s",
    async (recoveryStatus, reason) => {
      const gateway = gatewayWithTrees();
      gateway.recoveryResult = { status: recoveryStatus };
      const updateAnchors = () => Promise.resolve(expect.unreachable("anchors must not advance"));

      await expect(
        syncTemplateUpdate({
          ...input({
            anchors: {
              templateCommitSha: "template-base",
              templateSyncBaselineStatus: "baseline_required"
            },
            updateAnchors
          }),
          gateway
        })
      ).resolves.toMatchObject({ status: "baseline_required", reason });
      expect(gateway.applied).toEqual([]);
      expect(gateway.preparedBranches).toEqual([]);
    }
  );

  it("recovers an eligible legacy baseline and uses it for the normal conflict PR", async () => {
    const gateway = gatewayWithTrees();
    gateway.recoveryResult = {
      status: "recovered",
      studentDefaultBranchCommitSha: "student-historical"
    };
    gateway.result = "conflict";
    const pullRequests = new FakePullRequests();
    const anchors: InitializedTemplateSyncAnchors[] = [];

    await expect(
      syncTemplateUpdate({
        ...input({
          anchors: {
            templateCommitSha: "template-base",
            templateSyncBaselineStatus: "baseline_required"
          },
          pullRequests,
          updateAnchors: (updated) => {
            anchors.push(updated);
            return Promise.resolve();
          }
        }),
        gateway
      })
    ).resolves.toMatchObject({ status: "pull_request_created" });

    expect(gateway.preparedBranches[0]?.studentBaseCommitSha).toBe("student-historical");
    expect(pullRequests.created).toHaveLength(1);
    expect(anchors).toEqual([
      {
        templateCommitSha: "template-base",
        studentDefaultBranchCommitSha: "student-historical",
        templateSyncBaselineStatus: "initialized"
      }
    ]);
  });

  it("does not advance stored anchors when push fails", async () => {
    const gateway = gatewayWithTrees();
    gateway.result = "failure";
    let updated = false;

    await expect(
      syncTemplateUpdate({
        ...input({
          updateAnchors: () => {
            updated = true;
            return Promise.resolve();
          }
        }),
        gateway
      })
    ).resolves.toMatchObject({ status: "failure" });
    expect(updated).toBe(false);
  });
});

describe("reconcileTemplateUpdatePullRequest", () => {
  const reconcileInput = (overrides: Partial<Omit<TemplateSyncInput, "gateway">> = {}) =>
    input(overrides);

  it("returns pending for an existing open Graider PR without mutation", async () => {
    const gateway = gatewayWithTrees();
    const pullRequests = new FakePullRequests();
    pullRequests.existing = {
      number: 8,
      url: "https://github.test/pr/8",
      state: "open",
      merged: false
    };

    await expect(
      syncTemplateUpdate({ ...reconcileInput({ pullRequests }), gateway })
    ).resolves.toEqual({
      status: "pull_request_pending",
      pullRequest: { number: 8, url: "https://github.test/pr/8" },
      branchName: "graider/template-update-template-new",
      templateCommitSha: "template-new"
    });
    expect(gateway.deletedBranches).toEqual([]);
    expect(gateway.preparedBranches).toEqual([]);
    expect(pullRequests.created).toEqual([]);
  });

  it("reconciles a merged PR to the current default-branch head and deletes its branch", async () => {
    const gateway = gatewayWithTrees();
    const pullRequests = new FakePullRequests();
    pullRequests.existing = {
      number: 8,
      url: "https://github.test/pr/8",
      state: "closed",
      merged: true
    };
    const anchors: TemplateSyncInput["anchors"][] = [];

    await expect(
      reconcileTemplateUpdatePullRequest({
        ...reconcileInput({
          pullRequests,
          updateAnchors: (updated) => {
            anchors.push(updated);
            return Promise.resolve();
          }
        }),
        gateway
      })
    ).resolves.toMatchObject({ status: "pull_request_reconciled" });
    expect(anchors).toEqual([
      {
        templateCommitSha: "template-new",
        studentDefaultBranchCommitSha: "student-current",
        templateSyncBaselineStatus: "initialized"
      }
    ]);
    expect(gateway.deletedBranches).toEqual(["graider/template-update-template-new"]);
  });

  it("keeps merged reconciliation valid when branch cleanup fails", async () => {
    const gateway = gatewayWithTrees();
    gateway.failBranchCleanup = true;
    const pullRequests = new FakePullRequests();
    pullRequests.existing = {
      number: 8,
      url: "https://github.test/pr/8",
      state: "closed",
      merged: true
    };
    let anchorsUpdated = false;

    await expect(
      reconcileTemplateUpdatePullRequest({
        ...reconcileInput({
          pullRequests,
          updateAnchors: () => {
            anchorsUpdated = true;
            return Promise.resolve();
          }
        }),
        gateway
      })
    ).resolves.toMatchObject({ status: "pull_request_reconciled", branchCleanup: "failed" });
    expect(anchorsUpdated).toBe(true);
  });

  it("cleans a closed unmerged branch without advancing anchors", async () => {
    const gateway = gatewayWithTrees();
    const pullRequests = new FakePullRequests();
    pullRequests.existing = {
      number: 8,
      url: "https://github.test/pr/8",
      state: "closed",
      merged: false
    };
    const updateAnchors = () => Promise.resolve(expect.unreachable("anchors must not advance"));

    await expect(
      reconcileTemplateUpdatePullRequest({
        ...reconcileInput({ pullRequests, updateAnchors }),
        gateway
      })
    ).resolves.toMatchObject({ status: "pull_request_closed" });
    expect(gateway.deletedBranches).toEqual(["graider/template-update-template-new"]);
  });

  it("can create a replacement conflict PR after a closed unmerged PR is reconciled", async () => {
    const gateway = gatewayWithTrees();
    gateway.result = "conflict";
    const pullRequests = new FakePullRequests();
    pullRequests.existing = {
      number: 8,
      url: "https://github.test/pr/8",
      state: "closed",
      merged: false
    };

    await reconcileTemplateUpdatePullRequest({ ...reconcileInput({ pullRequests }), gateway });
    pullRequests.existing = null;

    await expect(
      syncTemplateUpdate({ ...reconcileInput({ pullRequests }), gateway })
    ).resolves.toMatchObject({
      status: "pull_request_created"
    });
    expect(pullRequests.created).toHaveLength(1);
  });

  it("is already current after a merged reconciliation advances anchors", async () => {
    const gateway = gatewayWithTrees();
    const pullRequests = new FakePullRequests();
    pullRequests.existing = {
      number: 8,
      url: "https://github.test/pr/8",
      state: "closed",
      merged: true
    };
    let anchors: TemplateSyncInput["anchors"] = {
      templateCommitSha: "template-base",
      studentDefaultBranchCommitSha: "student-base",
      templateSyncBaselineStatus: "initialized"
    };

    await expect(
      reconcileTemplateUpdatePullRequest({
        ...reconcileInput({
          pullRequests,
          anchors,
          updateAnchors: (updated) => {
            anchors = updated;
            return Promise.resolve();
          }
        }),
        gateway
      })
    ).resolves.toMatchObject({ status: "pull_request_reconciled" });
    await expect(
      reconcileTemplateUpdatePullRequest({
        ...reconcileInput({ anchors, pullRequests }),
        gateway
      })
    ).resolves.toEqual({ status: "already_current" });
  });
});
