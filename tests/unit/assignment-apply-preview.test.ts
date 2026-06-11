import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAssignmentApplyPreview } from "../../src/apply-preview/apply-preview-builder.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubRepository, GitHubTemplateRepository } from "../../src/github/github-models.js";

enum TestNumber {
  TemplateRepositoryId = 101,
  ExistingRepositoryId = 202
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/apply/active-assignment");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPOSITORY = "lab04-template";
const TEMPLATE_BRANCH = "main";
const WORKFLOW_PATH = "grade.yml";
const PATEL_REPOSITORY = "27s1-se2030-lab04-mayapatel";

const WORKFLOW_WITH_DISPATCH = `name: Grade
on:
  workflow_dispatch:
`;

const templateRepository: GitHubTemplateRepository = {
  owner: ORGANIZATION,
  name: TEMPLATE_REPOSITORY,
  fullName: `${ORGANIZATION}/${TEMPLATE_REPOSITORY}`,
  id: TestNumber.TemplateRepositoryId,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${TEMPLATE_REPOSITORY}`,
  isTemplate: true,
  branches: [TEMPLATE_BRANCH],
  files: ["README.md"],
  latestCommitSha: "template-sha"
};

const repository = (name: string): GitHubRepository => ({
  owner: ORGANIZATION,
  name,
  fullName: `${ORGANIZATION}/${name}`,
  id: TestNumber.ExistingRepositoryId,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${name}`
});

const createReadyClient = (): FakeGitHubClient =>
  new FakeGitHubClient({
    templateRepositories: [templateRepository],
    repositories: [repository(PATEL_REPOSITORY)],
    repositoryFiles: [
      {
        owner: ORGANIZATION,
        repo: TEMPLATE_REPOSITORY,
        path: WORKFLOW_PATH,
        content: WORKFLOW_WITH_DISPATCH,
        message: "Seed workflow",
        commitSha: "workflow-sha",
        branch: TEMPLATE_BRANCH
      }
    ]
  });

describe("assignment apply preview builder", () => {
  it("summarizes repository preview statuses without mutating GitHub", async () => {
    const githubClient = createReadyClient();
    const result = await buildAssignmentApplyPreview({
      cwd: FIXTURE_ROOT,
      assignmentFile: ASSIGNMENT_FILE,
      githubClient
    });

    expect(result.plan?.summary).toEqual({
      wouldCreateRepositories: 1,
      wouldUpdateRepositories: 1,
      wouldSkipRepositories: 2,
      blockedRepositories: 0,
      unknownRepositories: 0
    });
    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.fileWrites).toEqual([]);
    expect(githubClient.mutations.workflowDispatches).toEqual([]);
  });

  it("returns local rows with unknown repository status when no GitHub client is provided", async () => {
    const result = await buildAssignmentApplyPreview({
      cwd: FIXTURE_ROOT,
      assignmentFile: ASSIGNMENT_FILE
    });

    expect(result.status).toBe("partial_success");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "github_token_required" })
    ]);
    expect(result.plan?.summary).toMatchObject({
      wouldSkipRepositories: 2,
      unknownRepositories: 2
    });
  });
});
