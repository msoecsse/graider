import { describe, expect, it } from "vitest";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import { GitHubClientError } from "../../src/github/github-errors.js";
import type {
  GitHubRepository,
  GitHubTemplateRepository,
  GitHubWorkflow
} from "../../src/github/github-models.js";

enum TestNumber {
  RepositoryId = 101,
  TemplateRepositoryId = 102,
  CreatedRepositoryId = 1000,
  WorkflowId = 201,
  WorkflowRunId = 301
}

const OWNER = "se2030";
const REPOSITORY_NAME = "lab04-jones";
const TEMPLATE_REPOSITORY_NAME = "lab04-template";
const USERNAME = "jones";
const TEAM_SLUG = "graders";
const WORKFLOW_PATH = ".github/workflows/grade.yml";
const ARTIFACT_NAME = "grading-results";
const FILE_PATH = "reports/lab04/students/001/jones.md";
const FILE_CONTENT = "# Report";
const GENERATED_COMMIT_SHA = "fake-commit-1";

const repository: GitHubRepository = {
  owner: OWNER,
  name: REPOSITORY_NAME,
  fullName: `${OWNER}/${REPOSITORY_NAME}`,
  id: TestNumber.RepositoryId,
  private: true,
  archived: false,
  defaultBranch: "main",
  htmlUrl: `https://github.com/${OWNER}/${REPOSITORY_NAME}`
};

const templateRepository: GitHubTemplateRepository = {
  owner: OWNER,
  name: TEMPLATE_REPOSITORY_NAME,
  fullName: `${OWNER}/${TEMPLATE_REPOSITORY_NAME}`,
  id: TestNumber.TemplateRepositoryId,
  private: true,
  archived: false,
  defaultBranch: "main",
  htmlUrl: `https://github.com/${OWNER}/${TEMPLATE_REPOSITORY_NAME}`,
  isTemplate: true,
  branches: ["main"],
  files: ["README.md", WORKFLOW_PATH],
  latestCommitSha: "template-commit-sha"
};

const workflow: GitHubWorkflow = {
  id: TestNumber.WorkflowId,
  path: WORKFLOW_PATH,
  name: "Grade",
  supportsDispatch: true
};

describe("FakeGitHubClient", () => {
  it("TC-GITHUB-FAKE-001 returns existing repo", async () => {
    const client = new FakeGitHubClient({ repositories: [repository] });

    await expect(client.getRepository(OWNER, REPOSITORY_NAME)).resolves.toEqual(repository);
  });

  it("TC-GITHUB-FAKE-002 returns null for missing repo", async () => {
    const client = new FakeGitHubClient();

    await expect(client.getRepository(OWNER, REPOSITORY_NAME)).resolves.toBeNull();
  });

  it("TC-GITHUB-FAKE-003 simulates template repo", async () => {
    const client = new FakeGitHubClient({ templateRepositories: [templateRepository] });

    await expect(client.getTemplateRepository(OWNER, TEMPLATE_REPOSITORY_NAME)).resolves.toEqual(
      templateRepository
    );
    await expect(client.getTemplateRepository(OWNER, "missing-template")).resolves.toBeNull();
  });

  it("TC-GITHUB-FAKE-004 simulates user existence", async () => {
    const client = new FakeGitHubClient({ users: [{ username: USERNAME }] });

    await expect(client.getUser(USERNAME)).resolves.toEqual({ username: USERNAME });
    await expect(client.getUser("missing-user")).resolves.toBeNull();
  });

  it("TC-GITHUB-FAKE-005 simulates team existence", async () => {
    const client = new FakeGitHubClient({
      teams: [{ org: OWNER, slug: TEAM_SLUG, name: "Graders" }]
    });

    await expect(client.getTeam(OWNER, TEAM_SLUG)).resolves.toEqual({
      org: OWNER,
      slug: TEAM_SLUG,
      name: "Graders"
    });
    await expect(client.getTeam(OWNER, "missing-team")).resolves.toBeNull();
  });

  it("TC-GITHUB-FAKE-006 simulates collaborator permission", async () => {
    const client = new FakeGitHubClient({
      collaboratorPermissions: [
        {
          owner: OWNER,
          repo: REPOSITORY_NAME,
          username: USERNAME,
          permission: "push",
          pendingInvite: false
        }
      ]
    });

    await expect(
      client.getCollaboratorPermission(OWNER, REPOSITORY_NAME, USERNAME)
    ).resolves.toEqual({
      permission: "push",
      pendingInvite: false
    });
    await expect(
      client.getCollaboratorPermission(OWNER, REPOSITORY_NAME, "missing-user")
    ).resolves.toEqual({
      permission: "none",
      pendingInvite: false
    });
  });

  it("TC-GITHUB-FAKE-007 simulates workflow availability", async () => {
    const client = new FakeGitHubClient({
      workflows: [{ owner: OWNER, repo: REPOSITORY_NAME, workflow }]
    });

    await expect(client.getWorkflow(OWNER, REPOSITORY_NAME, WORKFLOW_PATH)).resolves.toEqual(
      workflow
    );
    await expect(
      client.getWorkflow(OWNER, REPOSITORY_NAME, ".github/workflows/missing.yml")
    ).resolves.toBeNull();
  });

  it("TC-GITHUB-FAKE-008 simulates auth failure", async () => {
    const client = new FakeGitHubClient();
    client.failNext("getAuthenticatedUser", "auth_failed");

    await expect(client.getAuthenticatedUser()).rejects.toMatchObject({
      kind: "auth_failed",
      diagnosticCode: "github_auth_failed"
    });
  });

  it("TC-GITHUB-FAKE-009 simulates permission failure", async () => {
    const client = new FakeGitHubClient();
    client.failNext("addCollaborator", "permission_denied");

    await expect(
      client.addCollaborator({
        owner: OWNER,
        repo: REPOSITORY_NAME,
        username: USERNAME,
        permission: "push"
      })
    ).rejects.toMatchObject({
      kind: "permission_denied",
      diagnosticCode: "github_permission_denied"
    });
  });

  it("TC-GITHUB-FAKE-010 simulates rate limit failure", async () => {
    const client = new FakeGitHubClient();
    client.failNext("getRepository", "rate_limited");

    await expect(client.getRepository(OWNER, REPOSITORY_NAME)).rejects.toMatchObject({
      kind: "rate_limited",
      diagnosticCode: "github_rate_limited"
    });
  });

  it("creates a repo from template and updates fake repository state", async () => {
    const client = new FakeGitHubClient({ templateRepositories: [templateRepository] });

    const createdRepository = await client.createRepositoryFromTemplate({
      templateOwner: OWNER,
      templateRepo: TEMPLATE_REPOSITORY_NAME,
      owner: OWNER,
      name: REPOSITORY_NAME,
      private: true
    });

    expect(createdRepository).toMatchObject({
      owner: OWNER,
      name: REPOSITORY_NAME,
      id: TestNumber.CreatedRepositoryId,
      defaultBranch: "main"
    });
    await expect(client.getRepository(OWNER, REPOSITORY_NAME)).resolves.toEqual(createdRepository);
    expect(client.mutations.createdRepositories).toHaveLength(1);
    expect(client.mutations.createdRepositories[0]?.input.name).toBe(REPOSITORY_NAME);
    expect(client.mutations.createdRepositories[0]?.repository).toEqual(createdRepository);
  });

  it("adds and removes collaborator permission state", async () => {
    const client = new FakeGitHubClient();

    await expect(
      client.addCollaborator({
        owner: OWNER,
        repo: REPOSITORY_NAME,
        username: USERNAME,
        permission: "push"
      })
    ).resolves.toEqual({
      username: USERNAME,
      permission: "push",
      pendingInvite: false
    });

    await expect(
      client.getCollaboratorPermission(OWNER, REPOSITORY_NAME, USERNAME)
    ).resolves.toEqual({
      permission: "push",
      pendingInvite: false
    });

    await client.removeCollaborator({ owner: OWNER, repo: REPOSITORY_NAME, username: USERNAME });

    await expect(
      client.getCollaboratorPermission(OWNER, REPOSITORY_NAME, USERNAME)
    ).resolves.toEqual({
      permission: "none",
      pendingInvite: false
    });
    expect(client.mutations.removedCollaborators).toEqual([
      { owner: OWNER, repo: REPOSITORY_NAME, username: USERNAME }
    ]);
  });

  it("adds team permission state", async () => {
    const client = new FakeGitHubClient();

    await client.addTeamPermission({
      owner: OWNER,
      repo: REPOSITORY_NAME,
      teamSlug: TEAM_SLUG,
      permission: "maintain"
    });

    await expect(client.getTeamPermission(OWNER, REPOSITORY_NAME, TEAM_SLUG)).resolves.toEqual({
      permission: "maintain",
      pendingInvite: false
    });
    expect(client.mutations.teamPermissions).toEqual([
      {
        owner: OWNER,
        repo: REPOSITORY_NAME,
        teamSlug: TEAM_SLUG,
        permission: "maintain"
      }
    ]);
  });

  it("enables Actions and records workflow dispatches", async () => {
    const client = new FakeGitHubClient({
      actionsStates: [{ owner: OWNER, repo: REPOSITORY_NAME, state: "disabled" }]
    });

    await expect(client.getActionsState(OWNER, REPOSITORY_NAME)).resolves.toBe("disabled");

    await client.enableActions(OWNER, REPOSITORY_NAME);
    await expect(client.getActionsState(OWNER, REPOSITORY_NAME)).resolves.toBe("enabled");

    await client.dispatchWorkflow({
      owner: OWNER,
      repo: REPOSITORY_NAME,
      workflowPath: WORKFLOW_PATH,
      ref: "main",
      inputs: { student: USERNAME }
    });

    expect(client.mutations.workflowDispatches).toEqual([
      {
        owner: OWNER,
        repo: REPOSITORY_NAME,
        workflowPath: WORKFLOW_PATH,
        ref: "main",
        inputs: { student: USERNAME }
      }
    ]);
  });

  it("lists workflow runs and downloads artifacts", async () => {
    const client = new FakeGitHubClient({
      workflowRuns: [
        {
          owner: OWNER,
          repo: REPOSITORY_NAME,
          run: {
            id: TestNumber.WorkflowRunId,
            workflowPath: WORKFLOW_PATH,
            status: "completed",
            conclusion: "success",
            headSha: "head-sha",
            createdAt: "2027-01-01T00:00:00.000Z",
            updatedAt: "2027-01-01T00:01:00.000Z"
          }
        }
      ],
      artifacts: [
        {
          owner: OWNER,
          repo: REPOSITORY_NAME,
          runId: TestNumber.WorkflowRunId,
          artifact: {
            name: ARTIFACT_NAME,
            files: {
              "grading/results.json": '{"status":"pass"}'
            }
          }
        }
      ]
    });

    await expect(client.listWorkflowRuns({ owner: OWNER, repo: REPOSITORY_NAME })).resolves.toEqual(
      [expect.objectContaining({ id: TestNumber.WorkflowRunId })]
    );
    await expect(
      client.downloadArtifact({
        owner: OWNER,
        repo: REPOSITORY_NAME,
        runId: TestNumber.WorkflowRunId,
        artifactName: ARTIFACT_NAME
      })
    ).resolves.toEqual({
      name: ARTIFACT_NAME,
      files: {
        "grading/results.json": '{"status":"pass"}'
      }
    });
    await expect(
      client.downloadArtifact({
        owner: OWNER,
        repo: REPOSITORY_NAME,
        runId: TestNumber.WorkflowRunId,
        artifactName: "missing-artifact"
      })
    ).resolves.toBeNull();
  });

  it("archives repositories and writes repository files in memory", async () => {
    const client = new FakeGitHubClient({ repositories: [repository] });

    await client.archiveRepository(OWNER, REPOSITORY_NAME);

    await expect(client.getRepository(OWNER, REPOSITORY_NAME)).resolves.toMatchObject({
      archived: true
    });

    await expect(
      client.writeRepositoryFile({
        owner: OWNER,
        repo: REPOSITORY_NAME,
        path: FILE_PATH,
        content: FILE_CONTENT,
        message: "Publish report",
        branch: "main"
      })
    ).resolves.toEqual({
      path: FILE_PATH,
      commitSha: GENERATED_COMMIT_SHA
    });
    expect(client.mutations.fileWrites).toEqual([
      expect.objectContaining({
        owner: OWNER,
        repo: REPOSITORY_NAME,
        path: FILE_PATH,
        content: FILE_CONTENT,
        commitSha: GENERATED_COMMIT_SHA
      })
    ]);
  });

  it("throws normalized GitHub client errors", async () => {
    const client = new FakeGitHubClient();
    client.failNext("getRepository", "network_error");

    await expect(client.getRepository(OWNER, REPOSITORY_NAME)).rejects.toBeInstanceOf(
      GitHubClientError
    );
  });
});
