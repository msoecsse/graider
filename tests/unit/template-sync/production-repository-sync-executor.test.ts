import { describe, expect, it, vi } from "vitest";
import type {
  PreparedTemplateSyncWorkspace,
  ProductionTemplateSyncWorkspaceInput
} from "../../../src/template-sync/production-template-sync-workspace.js";
import type {
  TemplateSyncGitGateway,
  TemplateSyncPullRequestGateway
} from "../../../src/template-sync/template-sync.js";

const workspace = vi.hoisted(() => vi.fn());

vi.mock("../../../src/template-sync/production-template-sync-workspace.js", () => ({
  withProductionTemplateSyncWorkspace: workspace
}));

import { runProductionRepositoryTemplateSync } from "../../../src/template-sync/production-repository-sync-executor.js";

describe("production repository template-sync resolved branch", () => {
  it("uses the workspace's remote default branch for the conflict PR base", async () => {
    const applied: Parameters<TemplateSyncGitGateway["applyAndPushTemplateDelta"]>[0][] = [];
    const createdPullRequests: Parameters<
      TemplateSyncPullRequestGateway["createPullRequest"]
    >[0][] = [];
    const gateway: TemplateSyncGitGateway = {
      getTree: (_repository, sha) => Promise.resolve({ "README.md": sha }),
      getDefaultBranchCommitSha: () => Promise.resolve("student-head"),
      recoverStudentBaseline: () =>
        Promise.resolve({
          status: "recovered" as const,
          studentDefaultBranchCommitSha: "student-historical"
        }),
      applyAndPushTemplateDelta: (input) => {
        applied.push(input);
        return Promise.resolve({ status: "conflict" as const });
      },
      prepareConflictBranch: () => Promise.resolve(),
      deleteRemoteBranch: () => Promise.resolve()
    };
    const pullRequests: TemplateSyncPullRequestGateway = {
      findPullRequest: () => Promise.resolve(null),
      createPullRequest: (input) => {
        createdPullRequests.push(input);
        return Promise.resolve({ number: 7, url: "https://github.test/pull/7" });
      }
    };
    workspace.mockImplementationOnce(
      async (
        input: ProductionTemplateSyncWorkspaceInput,
        operation: (workspace: PreparedTemplateSyncWorkspace) => Promise<unknown>
      ) => {
        expect(input).not.toHaveProperty("studentDefaultBranch");
        return await operation({
          gateway: gateway as never,
          pullRequests,
          studentDefaultBranch: "master"
        });
      }
    );

    const result = await runProductionRepositoryTemplateSync(
      {
        studentId: "student",
        repository: {
          owner: "course",
          name: "student",
          templateRepository: "course/template",
          templateCommitSha: "template-base",
          templateSyncBaselineStatus: "baseline_required"
        }
      } as never,
      "template-target",
      {
        templateCloneUrl: "https://github.test/course/template.git",
        studentCloneUrl: "https://github.test/course/student.git",
        token: null,
        githubClient: {} as never
      }
    );

    expect(result.result.status).toBe("pull_request_created");
    expect(result.anchors).toEqual({
      templateCommitSha: "template-base",
      studentDefaultBranchCommitSha: "student-historical",
      templateSyncBaselineStatus: "initialized"
    });
    expect(applied[0]?.studentRepository.defaultBranch).toBe("master");
    expect(createdPullRequests[0]?.repository.defaultBranch).toBe("master");
    expect(createdPullRequests[0]?.targetBranch).toBe("master");
  });
});
