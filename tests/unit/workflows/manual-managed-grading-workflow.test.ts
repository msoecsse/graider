import { describe, expect, it } from "vitest";
import type { EffectiveAssignmentGrading } from "../../../src/config/effective-grading.js";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import type { GitHubRepository } from "../../../src/github/github-models.js";
import { renderJavaJunitCheckstyleWorkflow } from "../../../src/workflows/java-junit-checkstyle-workflow.js";
import {
  isManualManagedGradingWorkflowEligible,
  manuallyInstallAndDispatchManagedGradingWorkflow
} from "../../../src/workflows/manual-managed-grading-workflow.js";
import {
  GRAIDER_MANAGED_WORKFLOW_MARKER,
  GRAIDER_MANAGED_WORKFLOW_PATH
} from "../../../src/workflows/managed-workflow-policy.js";

const OWNER = "example-org";
const REPOSITORY_NAME = "27s1-se2030-lab04-seanjones";
const DEFAULT_BRANCH = "main";
const REPOSITORY_ID = 1;
const FIRST_GENERATED_COMMIT_SHA = "fake-commit-1";
const SUBMISSION_COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567";
const grading: EffectiveAssignmentGrading = {
  enabled: true,
  mode: "preset",
  preset: "java-junit-checkstyle",
  workflow: GRAIDER_MANAGED_WORKFLOW_PATH,
  artifact: "grading-results",
  result_file: "results.json"
};
const canonicalContent = renderJavaJunitCheckstyleWorkflow({ grading });
const legacyGrading: EffectiveAssignmentGrading = {
  enabled: true,
  workflow: GRAIDER_MANAGED_WORKFLOW_PATH,
  artifact: "grading-results",
  result_file: "results.json"
};
const repository: GitHubRepository = {
  owner: OWNER,
  name: REPOSITORY_NAME,
  fullName: `${OWNER}/${REPOSITORY_NAME}`,
  id: REPOSITORY_ID,
  private: true,
  archived: false,
  defaultBranch: DEFAULT_BRANCH,
  htmlUrl: `https://github.com/${OWNER}/${REPOSITORY_NAME}`
};

const run = (client: FakeGitHubClient, confirmed = true) =>
  manuallyInstallAndDispatchManagedGradingWorkflow({
    githubClient: client,
    repository: {
      owner: OWNER,
      name: REPOSITORY_NAME,
      defaultBranch: DEFAULT_BRANCH
    },
    grading,
    submissionCommitSha: SUBMISSION_COMMIT_SHA,
    confirmed
  });

const clientWithWorkflow = (content: string) =>
  new FakeGitHubClient({
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

describe("manual managed grading workflow installation", () => {
  it("accepts both the explicit preset and Graider's legacy default workflow configuration", () => {
    expect(isManualManagedGradingWorkflowEligible(grading)).toBe(true);
    expect(isManualManagedGradingWorkflowEligible(legacyGrading)).toBe(true);
  });

  it.each([
    [{ enabled: false, workflow: GRAIDER_MANAGED_WORKFLOW_PATH }],
    [{ enabled: true, mode: "custom-workflow", workflow: GRAIDER_MANAGED_WORKFLOW_PATH }],
    [{ enabled: true, mode: "contract-only", workflow: GRAIDER_MANAGED_WORKFLOW_PATH }],
    [{ enabled: true, workflow: ".github/workflows/other.yml" }],
    [{ enabled: true, mode: "preset", workflow: GRAIDER_MANAGED_WORKFLOW_PATH }],
    [{ enabled: true, preset: "java-junit-checkstyle", workflow: GRAIDER_MANAGED_WORKFLOW_PATH }]
  ])("rejects an ineligible manual workflow configuration: %o", (candidate) => {
    expect(isManualManagedGradingWorkflowEligible(candidate)).toBe(false);
  });

  it("writes and dispatches for Graider's legacy default workflow configuration", async () => {
    const client = new FakeGitHubClient({ repositories: [repository] });

    await expect(
      manuallyInstallAndDispatchManagedGradingWorkflow({
        githubClient: client,
        repository: { owner: OWNER, name: REPOSITORY_NAME, defaultBranch: DEFAULT_BRANCH },
        grading: legacyGrading,
        submissionCommitSha: SUBMISSION_COMMIT_SHA,
        confirmed: true
      })
    ).resolves.toMatchObject({
      workflow: { status: "created" },
      dispatch: { status: "dispatched" }
    });
    expect(client.mutations.fileWrites).toHaveLength(1);
    expect(client.mutations.workflowDispatches).toHaveLength(1);
  });

  it("does not mutate or dispatch without confirmation", async () => {
    const client = new FakeGitHubClient({ repositories: [repository] });

    await expect(run(client, false)).resolves.toMatchObject({
      repository: { owner: OWNER, name: REPOSITORY_NAME, fullName: `${OWNER}/${REPOSITORY_NAME}` },
      workflow: { status: "not_attempted" },
      dispatch: { status: "not_attempted" }
    });
    expect(client.fileReads).toEqual([]);
    expect(client.mutations.fileWrites).toEqual([]);
    expect(client.mutations.workflowDispatches).toEqual([]);
  });

  it("creates an absent canonical workflow and dispatches it on the default branch", async () => {
    const client = new FakeGitHubClient({ repositories: [repository] });

    await expect(run(client)).resolves.toMatchObject({
      workflow: { status: "created", commitSha: FIRST_GENERATED_COMMIT_SHA },
      dispatch: { status: "dispatched" }
    });
    expect(client.mutations.fileWrites).toEqual([
      expect.objectContaining({
        path: GRAIDER_MANAGED_WORKFLOW_PATH,
        content: canonicalContent,
        branch: DEFAULT_BRANCH
      })
    ]);
    expect(client.mutations.workflowDispatches).toEqual([
      {
        owner: OWNER,
        repo: REPOSITORY_NAME,
        workflowPath: GRAIDER_MANAGED_WORKFLOW_PATH,
        ref: DEFAULT_BRANCH,
        inputs: { submission_sha: SUBMISSION_COMMIT_SHA }
      }
    ]);
  });

  it("dispatches an identical workflow without rewriting it", async () => {
    const client = clientWithWorkflow(canonicalContent);

    await expect(run(client)).resolves.toMatchObject({
      workflow: { status: "already_current" },
      dispatch: { status: "dispatched" }
    });
    expect(client.mutations.fileWrites).toEqual([]);
    expect(client.mutations.workflowDispatches).toHaveLength(1);
  });

  it("replaces recognized outdated managed workflows and dispatches them", async () => {
    const client = clientWithWorkflow(
      `${GRAIDER_MANAGED_WORKFLOW_MARKER}\n# graider-workflow-version: 1\nname: Older\n`
    );

    await expect(run(client)).resolves.toMatchObject({
      workflow: { status: "replaced_managed", commitSha: FIRST_GENERATED_COMMIT_SHA },
      dispatch: { status: "dispatched" }
    });
    expect(client.mutations.fileWrites).toHaveLength(1);
    expect(client.mutations.workflowDispatches).toHaveLength(1);
  });

  it("replaces an unmanaged workflow only through the confirmed manual operation", async () => {
    const client = clientWithWorkflow("name: Faculty workflow\n");

    await expect(run(client)).resolves.toMatchObject({
      workflow: { status: "replaced_unmanaged", commitSha: FIRST_GENERATED_COMMIT_SHA },
      dispatch: { status: "dispatched" }
    });
    expect(client.mutations.fileWrites).toHaveLength(1);
  });

  it("replaces unsupported managed workflow versions and dispatches them", async () => {
    const client = clientWithWorkflow(
      `${GRAIDER_MANAGED_WORKFLOW_MARKER}\n# graider-workflow-version: 999\nname: Future\n`
    );

    await expect(run(client)).resolves.toMatchObject({
      workflow: { status: "replaced_unsupported", commitSha: FIRST_GENERATED_COMMIT_SHA },
      dispatch: { status: "dispatched" }
    });
    expect(client.mutations.fileWrites).toHaveLength(1);
  });

  it("does not dispatch when writing the canonical workflow fails", async () => {
    const client = new FakeGitHubClient({ repositories: [repository] });
    client.failNext("writeRepositoryFile", "permission_denied");

    await expect(run(client)).resolves.toMatchObject({
      workflow: { status: "write_failed" },
      dispatch: { status: "not_attempted" }
    });
    expect(client.mutations.workflowDispatches).toEqual([]);
  });

  it("reports a dispatch failure after retaining a successful workflow replacement", async () => {
    const client = new FakeGitHubClient({ repositories: [repository] });
    client.failNext("dispatchWorkflow", "api_error");

    await expect(run(client)).resolves.toMatchObject({
      workflow: { status: "created", commitSha: FIRST_GENERATED_COMMIT_SHA },
      dispatch: { status: "failed" }
    });
    expect(client.mutations.fileWrites).toHaveLength(1);
  });
});
