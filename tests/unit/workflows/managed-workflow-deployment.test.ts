import { describe, expect, it } from "vitest";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import { GitHubClientError } from "../../../src/github/github-errors.js";
import type { GitHubRepository } from "../../../src/github/github-models.js";
import { renderJavaJunitCheckstyleWorkflow } from "../../../src/workflows/java-junit-checkstyle-workflow.js";
import {
  MANAGED_GRADING_WORKFLOW_COMMIT_MESSAGE,
  WorkflowDeploymentPermissionError,
  ensureManagedGradingWorkflow
} from "../../../src/workflows/managed-workflow-deployment.js";
import {
  GRAIDER_MANAGED_WORKFLOW_MARKER,
  GRAIDER_MANAGED_WORKFLOW_PATH
} from "../../../src/workflows/managed-workflow-policy.js";

const OWNER = "example-org";
const REPOSITORY_NAME = "27s1-se2030-lab04-seanjones";
const DEFAULT_BRANCH = "main";
const grading = {
  enabled: true,
  mode: "preset",
  preset: "java-junit-checkstyle",
  workflow: GRAIDER_MANAGED_WORKFLOW_PATH,
  artifact: "grading-results",
  result_file: "results.json"
};
const canonicalContent = renderJavaJunitCheckstyleWorkflow({ grading });
const repository: GitHubRepository = {
  owner: OWNER,
  name: REPOSITORY_NAME,
  fullName: `${OWNER}/${REPOSITORY_NAME}`,
  id: 1,
  private: true,
  archived: false,
  defaultBranch: DEFAULT_BRANCH,
  htmlUrl: `https://github.com/${OWNER}/${REPOSITORY_NAME}`
};

const ensure = (client: FakeGitHubClient) =>
  ensureManagedGradingWorkflow({
    githubClient: client,
    owner: OWNER,
    repo: REPOSITORY_NAME,
    defaultBranch: DEFAULT_BRANCH,
    grading
  });

describe("managed workflow deployment", () => {
  it("creates the canonical workflow as the first and only repository file", async () => {
    const client = new FakeGitHubClient({ repositories: [repository] });

    await expect(ensure(client)).resolves.toEqual({ status: "created" });
    expect(client.fileReads).toEqual([
      {
        owner: OWNER,
        repo: REPOSITORY_NAME,
        path: GRAIDER_MANAGED_WORKFLOW_PATH,
        ref: DEFAULT_BRANCH
      }
    ]);
    expect(client.mutations.fileWrites).toEqual([
      expect.objectContaining({
        owner: OWNER,
        repo: REPOSITORY_NAME,
        path: GRAIDER_MANAGED_WORKFLOW_PATH,
        content: canonicalContent,
        message: MANAGED_GRADING_WORKFLOW_COMMIT_MESSAGE
      })
    ]);
    expect(client.mutations.fileWrites[0]).not.toHaveProperty("branch");
  });

  it("performs no write when the current canonical workflow is already installed", async () => {
    const client = new FakeGitHubClient({
      repositories: [repository],
      repositoryFiles: [
        {
          owner: OWNER,
          repo: REPOSITORY_NAME,
          path: GRAIDER_MANAGED_WORKFLOW_PATH,
          content: canonicalContent,
          message: "Configure Graider grading workflow",
          commitSha: "existing-sha"
        }
      ]
    });

    await expect(ensure(client)).resolves.toEqual({ status: "noop" });
    expect(client.mutations.fileWrites).toEqual([]);
  });

  it("updates an older recognized Graider-managed workflow", async () => {
    const client = new FakeGitHubClient({
      repositories: [repository],
      repositoryFiles: [
        {
          owner: OWNER,
          repo: REPOSITORY_NAME,
          path: GRAIDER_MANAGED_WORKFLOW_PATH,
          content: `${GRAIDER_MANAGED_WORKFLOW_MARKER}\n# graider-workflow-version: 1\nname: Older\n`,
          message: "Older workflow",
          commitSha: "existing-sha"
        }
      ]
    });

    await expect(ensure(client)).resolves.toEqual({ status: "updated" });
    expect(client.mutations.fileWrites).toEqual([
      expect.objectContaining({ content: canonicalContent, path: GRAIDER_MANAGED_WORKFLOW_PATH })
    ]);
  });

  it("protects unmanaged and unsupported-version workflows without writing", async () => {
    for (const [content, status] of [
      ["name: Faculty workflow\n", "conflict_unmanaged"],
      [
        `${GRAIDER_MANAGED_WORKFLOW_MARKER}\n# graider-workflow-version: 999\nname: Future\n`,
        "conflict_unsupported_version"
      ]
    ] as const) {
      const client = new FakeGitHubClient({
        repositories: [repository],
        repositoryFiles: [
          {
            owner: OWNER,
            repo: REPOSITORY_NAME,
            path: GRAIDER_MANAGED_WORKFLOW_PATH,
            content,
            message: "Existing workflow",
            commitSha: "existing-sha"
          }
        ]
      });

      await expect(ensure(client)).resolves.toEqual({ status });
      expect(client.mutations.fileWrites).toEqual([]);
    }
  });

  it("maps only a forbidden workflow write to the workflow permission failure", async () => {
    const client = new FakeGitHubClient({ repositories: [repository] });
    client.failNext("writeRepositoryFile", "permission_denied");

    await expect(ensure(client)).rejects.toBeInstanceOf(WorkflowDeploymentPermissionError);

    const readFailureClient = new FakeGitHubClient({ repositories: [repository] });
    readFailureClient.failNext("getRepositoryFileContent", "permission_denied");
    await expect(ensure(readFailureClient)).rejects.toBeInstanceOf(GitHubClientError);
    await expect(ensure(readFailureClient)).resolves.toEqual({ status: "created" });
  });
});
