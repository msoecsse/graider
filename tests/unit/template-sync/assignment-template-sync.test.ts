import { describe, expect, it } from "vitest";
import {
  syncAssignmentTemplate,
  type AssignmentTemplateSyncInput
} from "../../../src/template-sync/assignment-template-sync.js";
import type { Manifest, ManifestRepositoryRecord } from "../../../src/manifest/manifest-models.js";
import type {
  TemplateSyncAnchors,
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

  getTree(_repository: typeof template, sha: string): Promise<TemplateTree> {
    return Promise.resolve(sha === "template-base" ? tree : updatedTree);
  }
  getDefaultBranchCommitSha(input: { name: string }): Promise<string> {
    return Promise.resolve(`${input.name}-head`);
  }
  recoverStudentBaseline() {
    return Promise.resolve({ status: "not_found" as const });
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
  persistManifest: AssignmentTemplateSyncInput["persistManifest"] = () =>
    Promise.resolve(undefined),
  yes = true
): AssignmentTemplateSyncInput => ({
  manifest: currentManifest,
  options: { yes, json: false, verbose: false },
  resolveCurrentTemplateCommitSha: () => Promise.resolve("template-new"),
  runRepositorySync: async (record: ManifestRepositoryRecord, currentTemplateCommitSha: string) => {
    let anchors: Required<TemplateSyncAnchors> | undefined;
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
          : {
              studentDefaultBranchCommitSha: record.repository.studentDefaultBranchCommitSha
            }),
        templateSyncBaselineStatus:
          record.repository.templateSyncBaselineStatus ?? "baseline_required"
      },
      gateway,
      pullRequests,
      updateAnchors: (updated) => {
        anchors = updated;
        return Promise.resolve(undefined);
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
        (next) => {
          persisted = next;
          return Promise.resolve(undefined);
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
        () => Promise.resolve(undefined),
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
