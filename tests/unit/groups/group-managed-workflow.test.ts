import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import { GitHubClientError } from "../../../src/github/github-errors.js";
import { executeGroupTargets } from "../../../src/groups/group-target-executor.js";
import type { GroupApplyPreviewTarget } from "../../../src/groups/group-preview-planner.js";
import { GRAIDER_MANAGED_WORKFLOW_PATH } from "../../../src/workflows/managed-workflow-policy.js";

const OWNER = "example-org";
const FORBIDDEN_STATUS = 403;
const SERVER_ERROR_STATUS = 500;
const REPOSITORY = "27s1-se2030-lab04-team-1";
const target: GroupApplyPreviewTarget = {
  targetId: "team-1",
  mode: "group",
  groupId: "team-1",
  repositoryName: REPOSITORY,
  sectionIds: ["001"],
  studentIds: ["alpha", "beta"],
  githubUsernames: ["alpha-gh", "beta-gh"],
  plannedStudentPermission: "admin",
  facultyTeam: "faculty",
  facultyTeamPermission: "admin",
  diagnostics: []
};
const createConfig = () => {
  const loaded = loadGraiderConfig({
    cwd: path.resolve("tests/fixtures/plan/active-assignment"),
    assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
  });
  if (loaded.status === "failure") throw new Error("Fixture config must load.");
  const config = {
    ...loaded.config,
    assignment: {
      ...loaded.config.assignment,
      grading: {
        enabled: true,
        mode: "preset",
        preset: "java-junit-checkstyle",
        workflow: GRAIDER_MANAGED_WORKFLOW_PATH,
        artifact: "grading-results",
        result_file: "results.json"
      }
    }
  };
  delete config.assignment.template;
  return config;
};
const workflow = { id: 1, name: "Grade", path: "grade.yml", supportsDispatch: true };

describe("group managed workflow verification and recovery", () => {
  it.each([
    ["missing", "grading_workflow_missing", "verify_grading_workflow"],
    ["unsupported", "workflow_dispatch_unsupported", "verify_workflow_dispatch"],
    ["forbidden", "workflow_deployment_forbidden", "ensure_managed_grading_workflow"],
    ["write error", "github_api_error", "ensure_managed_grading_workflow"],
    ["read error", "github_permission_denied", "verify_grading_workflow"]
  ])(
    "fails safely after setup for %s and recovers without recreation",
    async (scenario, code, operationType) => {
      const config = createConfig();
      const githubClient = new FakeGitHubClient();
      const write = githubClient.writeRepositoryFile.bind(githubClient);
      const lookup = vi.spyOn(githubClient, "getWorkflow");
      lookup.mockImplementation(() => {
        if (scenario === "read error")
          return Promise.reject(
            new GitHubClientError("permission_denied", "Read denied", {
              statusCode: FORBIDDEN_STATUS
            })
          );
        return Promise.resolve(
          scenario === "unsupported" ? { ...workflow, supportsDispatch: false } : null
        );
      });
      if (scenario === "forbidden" || scenario === "write error") {
        githubClient.writeRepositoryFile = () =>
          Promise.reject(
            new GitHubClientError(
              scenario === "forbidden" ? "permission_denied" : "api_error",
              "Write rejected; Authorization: Bearer ghp_fake_secret",
              { statusCode: scenario === "forbidden" ? FORBIDDEN_STATUS : SERVER_ERROR_STATUS }
            )
          );
      }
      const checkpoint = vi.fn(() => []);
      const result = await executeGroupTargets({
        config,
        githubClient,
        targets: [
          target,
          { ...target, targetId: "later", groupId: "later", repositoryName: "later" }
        ],
        onRepositoryObserved: checkpoint
      });
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]).toMatchObject({
        status: "failed",
        htmlUrl: `https://github.com/${OWNER}/${REPOSITORY}`
      });
      expect(checkpoint).toHaveBeenCalledWith(
        expect.objectContaining({ status: "created", target })
      );
      expect(githubClient.mutations.createdRepositoriesWithoutTemplate).toHaveLength(1);
      expect(githubClient.mutations.addedCollaborators).toHaveLength(2);
      expect(githubClient.mutations.teamPermissions).toHaveLength(1);
      expect(githubClient.mutations.enabledActions).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code,
        severity: "error",
        context: {
          operationType,
          groupId: "team-1",
          targetId: "team-1",
          repositoryName: REPOSITORY,
          repositoryOwner: OWNER,
          workflowPath: GRAIDER_MANAGED_WORKFLOW_PATH
        }
      });
      expect(result.errors[0]?.context?.remediation).toContain("rerun Apply");
      expect(result.targets[0]?.diagnostics).toEqual(result.errors);
      expect(JSON.stringify(result)).not.toContain("ghp_fake_secret");
      expect(JSON.stringify(result)).not.toContain("Authorization:");
      const writeFailed = scenario === "forbidden" || scenario === "write error";
      expect(lookup).toHaveBeenCalledTimes(writeFailed ? 0 : 1);
      const writesBeforeRecovery = githubClient.mutations.fileWrites.length;
      githubClient.writeRepositoryFile = write;
      lookup.mockResolvedValue(workflow);
      const retry = await executeGroupTargets({
        config,
        githubClient,
        targets: [target],
        trackedTargetIds: new Set([target.targetId])
      });
      expect(retry.errors).toEqual([]);
      expect(retry.targets[0]).toMatchObject({ status: "updated", diagnostics: [] });
      expect(githubClient.mutations.createdRepositoriesWithoutTemplate).toHaveLength(1);
      expect(githubClient.mutations.fileWrites).toHaveLength(
        writesBeforeRecovery + (writeFailed ? 1 : 0)
      );
      expect(githubClient.mutations.workflowDispatches).toEqual([]);
    }
  );

  it.each([
    ["name: Faculty workflow\n", "workflow_deployment_conflict"],
    [
      "# Managed by Graider\n# graider-workflow-version: 999\nname: Future workflow\n",
      "workflow_deployment_version_unsupported"
    ]
  ])("preserves ownership conflicts: %s", async (content, code) => {
    const githubClient = new FakeGitHubClient({
      repositoryFiles: [
        {
          owner: OWNER,
          repo: REPOSITORY,
          path: GRAIDER_MANAGED_WORKFLOW_PATH,
          content,
          message: "Existing workflow fixture",
          commitSha: "existing-workflow-sha"
        }
      ]
    });
    const result = await executeGroupTargets({
      config: createConfig(),
      githubClient,
      targets: [target]
    });
    expect(result.targets[0]?.status).toBe("failed");
    expect(result.errors[0]).toMatchObject({
      code,
      context: {
        operationType: "ensure_managed_grading_workflow",
        workflowPath: GRAIDER_MANAGED_WORKFLOW_PATH
      }
    });
    expect(githubClient.mutations.fileWrites).toEqual([]);
    expect(githubClient.workflowReads).toEqual([]);
    expect(
      await githubClient.getRepositoryFileContent(
        OWNER,
        REPOSITORY,
        GRAIDER_MANAGED_WORKFLOW_PATH,
        "main"
      )
    ).toBe(content);
  });
});
