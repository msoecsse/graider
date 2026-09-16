import { describe, expect, it, vi } from "vitest";
import { syncAssignmentTemplate } from "../../../src/template-sync/assignment-template-sync.js";
import type { Manifest, ManifestRepositoryRecord } from "../../../src/manifest/manifest-models.js";
import type {
  InitializedTemplateSyncAnchors,
  TemplateAndStudentBaselineRecoveryResult,
  TemplateSyncGitGateway,
  TemplateSyncPullRequestGateway,
  TemplateTree
} from "../../../src/template-sync/template-sync.js";
import { syncTemplateUpdate } from "../../../src/template-sync/template-sync.js";

const template = { owner: "course", name: "template" };
const tree: TemplateTree = { "README.md": "base" };
const updatedTree: TemplateTree = { "README.md": "faculty" };

class Gateway implements TemplateSyncGitGateway {
  readonly applied: string[] = [];
  templateAndStudentRecoveryResult: TemplateAndStudentBaselineRecoveryResult = {
    status: "not_found"
  };

  getTree(_repository: typeof template, sha: string): Promise<TemplateTree> {
    return Promise.resolve(sha === "template-base" ? tree : updatedTree);
  }
  getDefaultBranchCommitSha(input: { name: string }): Promise<string> {
    return Promise.resolve(`${input.name}-head`);
  }
  recoverStudentBaseline() {
    return Promise.resolve({ status: "not_found" as const });
  }

  recoverTemplateAndStudentBaseline() {
    return Promise.resolve(this.templateAndStudentRecoveryResult);
  }
  applyAndPushTemplateDelta(
    input: Parameters<TemplateSyncGitGateway["applyAndPushTemplateDelta"]>[0]
  ) {
    this.applied.push(input.studentRepository.name);
    if (input.studentRepository.name === "failure") return Promise.reject(new Error("push failed"));
    if (input.studentRepository.name === "conflict")
      return Promise.resolve({ status: "conflict" as const });
    return Promise.resolve({
      status: "clean" as const,
      commitSha: `${input.studentRepository.name}-updated`
    });
  }
  prepareConflictBranch(): Promise<void> {
    return Promise.resolve();
  }
  deleteRemoteBranch(): Promise<void> {
    return Promise.resolve();
  }
}

class PullRequests implements TemplateSyncPullRequestGateway {
  readonly created: string[] = [];
  private openBranches = new Set<string>();

  private key(repository: { name: string }, branchName: string): string {
    return `${repository.name}:${branchName}`;
  }

  createPullRequest(input: Parameters<TemplateSyncPullRequestGateway["createPullRequest"]>[0]) {
    this.created.push(input.sourceBranch);
    this.openBranches.add(this.key(input.repository, input.sourceBranch));
    return Promise.resolve({ number: 10, url: "https://github.test/pr/10" });
  }
  findPullRequest(input: Parameters<TemplateSyncPullRequestGateway["findPullRequest"]>[0]) {
    return Promise.resolve(
      this.openBranches.has(this.key(input.repository, input.sourceBranch))
        ? { number: 10, url: "https://github.test/pr/10", state: "open" as const, merged: false }
        : null
    );
  }
}

const repository = (
  studentId: string,
  name: string,
  templateCommitSha = "template-base"
): ManifestRepositoryRecord => ({
  studentId,
  githubUsername: studentId,
  section: "001",
  rosterStatus: "active",
  repository: {
    owner: "course",
    name,
    fullName: `course/${name}`,
    createdFromTemplate: true,
    templateRepository: "course/template",
    templateCommitSha,
    studentDefaultBranchCommitSha: `${name}-base`,
    templateSyncBaselineStatus: "initialized"
  },
  permissions: {},
  actions: { enabled: true },
  lifecycle: { repositoryArchived: false, studentAccessRemoved: false, status: "active" },
  warnings: [],
  errors: []
});

const manifest = (repositories: ManifestRepositoryRecord[]): Manifest => ({
  schemaVersion: 1,
  assignment: { termCode: "27s1", courseCode: "CS", assignmentSlug: "lab", assignmentTitle: "Lab" },
  source: { sourceFiles: [], inputFingerprint: "source" },
  template: { repository: "course/template", branch: "main" },
  repositories,
  operationHistory: [],
  warnings: [],
  errors: []
});

const batchInput = (
  currentManifest: Manifest,
  gateway: Gateway,
  pullRequests: PullRequests,
  persistManifest: (next: Manifest) => Promise<void> = () => Promise.resolve(),
  yes = true
) => ({
  manifest: currentManifest,
  options: { yes, json: false, verbose: false },
  resolveCurrentTemplateCommitSha: () => Promise.resolve("template-new"),
  runRepositorySync: async (record: ManifestRepositoryRecord, currentTemplateCommitSha: string) => {
    let anchors: InitializedTemplateSyncAnchors | undefined;
    const result = await syncTemplateUpdate({
      templateRepository: template,
      studentRepository: {
        owner: record.repository.owner,
        name: record.repository.name,
        defaultBranch: "main"
      },
      currentTemplateCommitSha,
      anchors: {
        ...(record.repository.templateCommitSha === undefined
          ? {}
          : { templateCommitSha: record.repository.templateCommitSha }),
        ...(record.repository.studentDefaultBranchCommitSha === undefined
          ? {}
          : { studentDefaultBranchCommitSha: record.repository.studentDefaultBranchCommitSha }),
        templateSyncBaselineStatus:
          record.repository.templateSyncBaselineStatus ?? "baseline_required"
      },
      gateway,
      pullRequests,
      updateAnchors: (updated) => {
        anchors = updated;
        return Promise.resolve();
      }
    });
    return anchors === undefined ? { result } : { result, anchors };
  },
  persistManifest
});

describe("syncAssignmentTemplate", () => {
  it("reports trusted repository heartbeats in execution order, including after a failure", async () => {
    const progress = vi.fn();
    const runRepositorySync = vi.fn((record: ManifestRepositoryRecord) => {
      if (record.studentId === "beta") throw new Error("push failed");
      return Promise.resolve({ result: { status: "already_current" as const } });
    });
    const archived = repository("archived", "archived");
    archived.lifecycle.status = "archived";

    await syncAssignmentTemplate({
      ...batchInput(
        manifest([
          repository("alpha", "alpha"),
          repository("beta", "beta"),
          archived,
          repository("gamma", "gamma")
        ]),
        new Gateway(),
        new PullRequests()
      ),
      runRepositorySync,
      onProgress: progress
    });

    expect(progress).toHaveBeenCalledTimes(3);
    expect(progress).toHaveBeenNthCalledWith(1, {
      current: 1,
      total: 3,
      studentId: "alpha",
      repository: "course/alpha"
    });
    expect(progress).toHaveBeenNthCalledWith(2, {
      current: 2,
      total: 3,
      studentId: "beta",
      repository: "course/beta"
    });
    expect(progress).toHaveBeenNthCalledWith(3, {
      current: 3,
      total: 3,
      studentId: "gamma",
      repository: "course/gamma"
    });
    expect(runRepositorySync.mock.invocationCallOrder[0]).toBeGreaterThan(
      progress.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("keeps repository synchronization independent from progress delivery failures", async () => {
    const gateway = new Gateway();

    await expect(
      syncAssignmentTemplate({
        ...batchInput(manifest([repository("alpha", "alpha")]), gateway, new PullRequests()),
        onProgress: () => {
          throw new Error("Renderer unavailable");
        }
      })
    ).resolves.toMatchObject({ status: "completed" });

    expect(gateway.applied).toEqual(["alpha"]);
  });

  it("emits no heartbeat when template resolution fails before repository processing", async () => {
    const progress = vi.fn();

    await expect(
      syncAssignmentTemplate({
        ...batchInput(manifest([repository("alpha", "alpha")]), new Gateway(), new PullRequests()),
        resolveCurrentTemplateCommitSha: () => Promise.reject(new Error("template unavailable")),
        onProgress: progress
      })
    ).resolves.toMatchObject({ status: "failure", outcomes: [] });

    expect(progress).not.toHaveBeenCalled();
  });

  it("selects only one trusted applicable student repository when studentId is supplied", async () => {
    const gateway = new Gateway();
    const persisted: Manifest[] = [];

    const progress = vi.fn();
    await expect(
      syncAssignmentTemplate({
        ...batchInput(
          manifest([repository("alpha", "alpha"), repository("beta", "beta")]),
          gateway,
          new PullRequests(),
          (next) => {
            persisted.push(next);
            return Promise.resolve();
          }
        ),
        studentId: "beta",
        onProgress: progress
      })
    ).resolves.toMatchObject({
      status: "completed",
      outcomes: [{ studentId: "beta", repository: "course/beta", result: { status: "updated" } }]
    });
    expect(gateway.applied).toEqual(["beta"]);
    expect(persisted).toHaveLength(1);
    expect(progress).toHaveBeenCalledExactlyOnceWith({
      current: 1,
      total: 1,
      studentId: "beta",
      repository: "course/beta"
    });
  });

  it.each([
    ["unknown", undefined],
    ["alpha", "archived"]
  ] as const)(
    "does not synchronize any repository for an unknown or ineligible selected student",
    async (studentId, lifecycleStatus) => {
      const gateway = new Gateway();
      const selected = repository("alpha", "alpha");
      if (lifecycleStatus !== undefined) selected.lifecycle.status = lifecycleStatus;
      const runRepositorySync = vi.fn();

      await expect(
        syncAssignmentTemplate({
          ...batchInput(manifest([selected]), gateway, new PullRequests()),
          studentId,
          runRepositorySync
        })
      ).resolves.toMatchObject({ status: "failure", outcomes: [] });
      expect(runRepositorySync).not.toHaveBeenCalled();
      expect(gateway.applied).toEqual([]);
    }
  );

  it("persists recovered two-anchor baselines through the assignment manifest path", async () => {
    const gateway = new Gateway();
    gateway.templateAndStudentRecoveryResult = {
      status: "recovered",
      templateCommitSha: "template-new",
      studentDefaultBranchCommitSha: "legacy-student-base"
    };
    const initializedRecord = repository("legacy", "legacy", "template-new");
    const record: ManifestRepositoryRecord = {
      ...initializedRecord,
      repository: {
        owner: "course",
        name: "legacy",
        fullName: "course/legacy",
        createdFromTemplate: true,
        templateRepository: "course/template",
        templateSyncBaselineStatus: "baseline_required"
      }
    };
    let persisted: Manifest | undefined;

    await expect(
      syncAssignmentTemplate(
        batchInput(manifest([record]), gateway, new PullRequests(), (next) => {
          persisted = next;
          return Promise.resolve();
        })
      )
    ).resolves.toMatchObject({ status: "completed" });
    expect(persisted?.repositories[0]?.repository).toMatchObject({
      templateCommitSha: "template-new",
      studentDefaultBranchCommitSha: "legacy-student-base",
      templateSyncBaselineStatus: "initialized"
    });
    expect(gateway.applied).toEqual([]);
  });

  it("returns independent outcomes for mixed repositories and continues after failures", async () => {
    const gateway = new Gateway();
    const pullRequests = new PullRequests();
    let persisted: Manifest | undefined;
    const result = await syncAssignmentTemplate(
      batchInput(
        manifest([
          repository("updated", "updated"),
          repository("current", "current", "template-new"),
          repository("conflict", "conflict"),
          repository("failure", "failure"),
          repository("later", "later")
        ]),
        gateway,
        pullRequests,
        (next) => {
          persisted = next;
          return Promise.resolve();
        }
      )
    );

    expect(result).toMatchObject({
      status: "completed_with_failures",
      templateCommitSha: "template-new"
    });
    expect(result.outcomes.map((outcome) => outcome.result.status)).toEqual([
      "updated",
      "already_current",
      "pull_request_created",
      "failure",
      "updated"
    ]);
    expect(gateway.applied).toEqual(["updated", "conflict", "failure", "later"]);
    expect(
      persisted?.repositories.find((item) => item.studentId === "updated")?.repository
    ).toMatchObject({
      templateCommitSha: "template-new",
      studentDefaultBranchCommitSha: "updated-updated"
    });
    expect(
      persisted?.repositories.find((item) => item.studentId === "conflict")?.repository
        .templateCommitSha
    ).toBe("template-base");
  });

  it("blocks the entire batch before resolving or mutating repositories without confirmation", async () => {
    const gateway = new Gateway();
    const pullRequests = new PullRequests();
    const result = await syncAssignmentTemplate(
      batchInput(
        manifest([repository("updated", "updated")]),
        gateway,
        pullRequests,
        () => Promise.resolve(),
        false
      )
    );

    expect(result).toMatchObject({ status: "blocked" });
    expect(gateway.applied).toEqual([]);
    const progress = vi.fn();
    await syncAssignmentTemplate({
      ...batchInput(
        manifest([repository("updated", "updated")]),
        gateway,
        pullRequests,
        () => Promise.resolve(),
        false
      ),
      onProgress: progress
    });
    expect(progress).not.toHaveBeenCalled();
  });

  it("is idempotent: updated repos are current and existing conflict PRs become pending", async () => {
    const gateway = new Gateway();
    const pullRequests = new PullRequests();
    const first = await syncAssignmentTemplate(
      batchInput(
        manifest([repository("updated", "updated"), repository("conflict", "conflict")]),
        gateway,
        pullRequests
      )
    );
    if (first.status === "blocked" || first.status === "failure")
      throw new Error("Expected completed batch.");

    const second = await syncAssignmentTemplate(batchInput(first.manifest, gateway, pullRequests));
    if (second.status === "blocked" || second.status === "failure")
      throw new Error("Expected completed batch.");
    expect(second.outcomes.map((outcome) => outcome.result.status)).toEqual([
      "pull_request_pending",
      "already_current"
    ]);
    expect(pullRequests.created).toHaveLength(1);
  });
});
