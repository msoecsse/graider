import { describe, expect, it } from "vitest";
import { syncAssignmentTemplate } from "../../../src/template-sync/assignment-template-sync.js";
import type { Manifest, ManifestRepositoryRecord } from "../../../src/manifest/manifest-models.js";
import type {
  TemplateSyncGitGateway,
  TemplateSyncInput,
  TemplateSyncPullRequestGateway,
  TemplateTree
} from "../../../src/template-sync/template-sync.js";
import { syncTemplateUpdate } from "../../../src/template-sync/template-sync.js";

const template = { owner: "course", name: "template" };
const tree: TemplateTree = { "README.md": "base" };
const updatedTree: TemplateTree = { "README.md": "faculty" };

class Gateway implements TemplateSyncGitGateway {
  readonly applied: string[] = [];

  async getTree(_repository: typeof template, sha: string): Promise<TemplateTree> {
    return sha === "template-base" ? tree : updatedTree;
  }
  async getDefaultBranchCommitSha(input: { name: string }): Promise<string> {
    return `${input.name}-head`;
  }
  async recoverStudentBaseline() {
    return { status: "not_found" as const };
  }
  async applyAndPushTemplateDelta(
    input: Parameters<TemplateSyncGitGateway["applyAndPushTemplateDelta"]>[0]
  ) {
    this.applied.push(input.studentRepository.name);
    if (input.studentRepository.name === "failure") throw new Error("push failed");
    if (input.studentRepository.name === "conflict") return { status: "conflict" as const };
    return { status: "clean" as const, commitSha: `${input.studentRepository.name}-updated` };
  }
  async prepareConflictBranch(): Promise<void> {}
  async deleteRemoteBranch(): Promise<void> {}
}

class PullRequests implements TemplateSyncPullRequestGateway {
  readonly created: string[] = [];
  private openBranches = new Set<string>();

  private key(repository: { name: string }, branchName: string): string {
    return `${repository.name}:${branchName}`;
  }

  async createPullRequest(
    input: Parameters<TemplateSyncPullRequestGateway["createPullRequest"]>[0]
  ) {
    this.created.push(input.sourceBranch);
    this.openBranches.add(this.key(input.repository, input.sourceBranch));
    return { number: 10, url: "https://github.test/pr/10" };
  }
  async findPullRequest(input: Parameters<TemplateSyncPullRequestGateway["findPullRequest"]>[0]) {
    return this.openBranches.has(this.key(input.repository, input.sourceBranch))
      ? { number: 10, url: "https://github.test/pr/10", state: "open" as const, merged: false }
      : null;
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
  persistManifest = async () => undefined,
  yes = true
) => ({
  manifest: currentManifest,
  options: { yes, json: false, verbose: false },
  resolveCurrentTemplateCommitSha: async () => "template-new",
  runRepositorySync: async (record: ManifestRepositoryRecord, currentTemplateCommitSha: string) => {
    let anchors: TemplateSyncInput["anchors"] | undefined;
    const result = await syncTemplateUpdate({
      templateRepository: template,
      studentRepository: {
        owner: record.repository.owner,
        name: record.repository.name,
        defaultBranch: "main"
      },
      currentTemplateCommitSha,
      anchors: {
        templateCommitSha: record.repository.templateCommitSha,
        studentDefaultBranchCommitSha: record.repository.studentDefaultBranchCommitSha,
        templateSyncBaselineStatus:
          record.repository.templateSyncBaselineStatus ?? "baseline_required"
      },
      gateway,
      pullRequests,
      updateAnchors: async (updated) => {
        anchors = updated;
      }
    });
    return anchors === undefined ? { result } : { result, anchors };
  },
  persistManifest
});

describe("syncAssignmentTemplate", () => {
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
        async (next) => {
          persisted = next;
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
        async () => undefined,
        false
      )
    );

    expect(result).toMatchObject({ status: "blocked" });
    expect(gateway.applied).toEqual([]);
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
