import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAssignmentGradePreview } from "../../src/grade-preview/grade-preview-builder.js";
import { DiagnosticCode } from "../../src/diagnostics/error-catalog.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubRepository, GitHubWorkflow } from "../../src/github/github-models.js";

enum TestNumber {
  RepositoryId = 101,
  WorkflowId = 202
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/grade/active-assignment");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const KIM_REPOSITORY = "27s1-se2030-lab04-kimstudent";

const workflow: GitHubWorkflow = {
  id: TestNumber.WorkflowId,
  path: "grade.yml",
  name: "Grade",
  supportsDispatch: true
};

const repository = (name: string): GitHubRepository => ({
  owner: ORGANIZATION,
  name,
  fullName: `${ORGANIZATION}/${name}`,
  id: TestNumber.RepositoryId,
  private: true,
  archived: false,
  defaultBranch: "main",
  htmlUrl: `https://github.com/${ORGANIZATION}/${name}`
});

const createReadyClient = (): FakeGitHubClient =>
  new FakeGitHubClient({
    repositories: [repository(JONES_REPOSITORY), repository(KIM_REPOSITORY)],
    workflows: [
      { owner: ORGANIZATION, repo: JONES_REPOSITORY, workflow },
      { owner: ORGANIZATION, repo: KIM_REPOSITORY, workflow }
    ]
  });

describe("assignment grade preview builder", () => {
  it("summarizes workflow dispatch preview rows without mutating GitHub", async () => {
    const githubClient = createReadyClient();
    const result = await buildAssignmentGradePreview({
      cwd: FIXTURE_ROOT,
      assignmentFile: ASSIGNMENT_FILE,
      githubClient
    });

    expect(result.plan?.summary).toEqual({
      wouldDispatch: 2,
      wouldSkip: 2,
      blocked: 0,
      unknown: 0
    });
    expect(githubClient.mutations.workflowDispatches).toEqual([]);
    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.fileWrites).toEqual([]);
  });

  it("returns local rows with token-required status when no GitHub client is provided", async () => {
    const result = await buildAssignmentGradePreview({
      cwd: FIXTURE_ROOT,
      assignmentFile: ASSIGNMENT_FILE
    });

    expect(result.status).toBe("partial_success");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GithubTokenRequired })
    ]);
    expect(result.plan?.summary).toEqual({
      wouldDispatch: 0,
      wouldSkip: 2,
      blocked: 0,
      unknown: 2
    });
  });
});
