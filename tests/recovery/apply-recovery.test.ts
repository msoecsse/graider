import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runApplyCommand } from "../../src/cli/commands/apply.command.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubTemplateRepository, GitHubWorkflow } from "../../src/github/github-models.js";
import {
  DEFAULT_GITHUB_RETRY_ATTEMPTS,
  DEFAULT_RETRY_AFTER_SECONDS
} from "../../src/github/github-retry.js";
import { loadManifest } from "../../src/manifest/manifest-loader.js";
import { createManifestPath } from "../../src/manifest/manifest-paths.js";

enum TestNumber {
  TemplateRepositoryId = 101,
  ExistingRepositoryId = 202,
  WorkflowId = 303
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/apply");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPO = "lab04-template";
const TEMPLATE_BRANCH = "main";
const README_FILE = "README.md";
const APPLY_TIMESTAMP = "2026-09-01T14:30:00.000Z";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const PATEL_REPOSITORY = "27s1-se2030-lab04-mayapatel";
const CONFIG_FAILURE_ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const yesOptions = normalizeCommonCommandOptions({ yes: true });
const fixedClock = {
  now: () => new Date(APPLY_TIMESTAMP)
};

const templateRepository: GitHubTemplateRepository = {
  owner: ORGANIZATION,
  name: TEMPLATE_REPO,
  fullName: `${ORGANIZATION}/${TEMPLATE_REPO}`,
  id: TestNumber.TemplateRepositoryId,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${TEMPLATE_REPO}`,
  isTemplate: true,
  branches: [TEMPLATE_BRANCH],
  files: [README_FILE],
  latestCommitSha: "template-sha"
};

const gradingWorkflow: GitHubWorkflow = {
  id: TestNumber.WorkflowId,
  path: "grade.yml",
  name: "Grade",
  supportsDispatch: true
};

const copyFixtureToTemp = (fixtureName = "grading-disabled"): string => {
  const sourceRoot = path.join(FIXTURE_ROOT, fixtureName);
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider-apply-recovery-"));

  fs.cpSync(sourceRoot, destinationRoot, {
    recursive: true
  });

  return destinationRoot;
};

const createReadyClient = (): FakeGitHubClient =>
  new FakeGitHubClient({
    templateRepositories: [templateRepository],
    users: ["seanjones", "janesmith", "alexlee", "mayapatel"].map((username) => ({ username })),
    teams: [
      { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
      { org: ORGANIZATION, slug: "graders", name: "Graders" }
    ],
    workflows: [JONES_REPOSITORY, PATEL_REPOSITORY].map((repo) => ({
      owner: ORGANIZATION,
      repo,
      workflow: gradingWorkflow
    }))
  });

describe("apply recovery", () => {
  it("TC-RECOVERY-001 interrupted after repo creation and manifest update reruns no-op for repo creation", async () => {
    const cwd = copyFixtureToTemp();
    const githubClient = createReadyClient();
    githubClient.failTimes("addCollaborator", "api_error", DEFAULT_GITHUB_RETRY_ATTEMPTS);

    const first = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });
    const createdAfterFirstRun = githubClient.mutations.createdRepositories.length;
    githubClient.clearFailures();
    const second = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(first.exitCode).toBe(ExitCode.GitHubOrNetworkFailure);
    expect(second.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.createdRepositories).toHaveLength(createdAfterFirstRun);
  });

  it("TC-RECOVERY-002 interrupted before manifest update reruns collision", async () => {
    const cwd = copyFixtureToTemp();
    const githubClient = new FakeGitHubClient({
      templateRepositories: [templateRepository],
      repositories: [
        {
          owner: ORGANIZATION,
          name: JONES_REPOSITORY,
          fullName: `${ORGANIZATION}/${JONES_REPOSITORY}`,
          id: TestNumber.ExistingRepositoryId,
          private: true,
          archived: false,
          defaultBranch: TEMPLATE_BRANCH,
          htmlUrl: `https://github.com/${ORGANIZATION}/${JONES_REPOSITORY}`
        }
      ],
      users: [{ username: "seanjones" }],
      teams: [
        { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
        { org: ORGANIZATION, slug: "graders", name: "Graders" }
      ]
    });

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "repo_name_collision" })])
    );
  });

  it("TC-RECOVERY-003 rate limit mid-apply preserves completed manifest work", async () => {
    const cwd = copyFixtureToTemp();
    const githubClient = createReadyClient();
    githubClient.failTimes("addCollaborator", "rate_limited", DEFAULT_GITHUB_RETRY_ATTEMPTS, {
      retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS
    });

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });
    const manifestPath = createManifestPath(cwd, "27s1", "lab04");
    const manifestResult = loadManifest(manifestPath.absolutePath);

    expect(result.exitCode).toBe(ExitCode.GitHubOrNetworkFailure);
    expect(manifestResult.status).toBe("loaded");
    expect(manifestResult.manifest?.repositories[0]?.repository.name).toBe(JONES_REPOSITORY);
  });

  it("TC-RECOVERY-005 retryable GitHub 5xx succeeds on retry", async () => {
    const cwd = copyFixtureToTemp();
    const githubClient = createReadyClient();
    githubClient.failNext("createRepositoryFromTemplate", "api_error");

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.createdRepositories).toHaveLength(1);
  });

  it("TC-RECOVERY-006 retryable GitHub 5xx exhausts retries and exits 4", async () => {
    const cwd = copyFixtureToTemp();
    const githubClient = createReadyClient();
    githubClient.failTimes(
      "createRepositoryFromTemplate",
      "api_error",
      DEFAULT_GITHUB_RETRY_ATTEMPTS
    );

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.exitCode).toBe(ExitCode.GitHubOrNetworkFailure);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "github_api_error" })])
    );
  });

  it("TC-RECOVERY-007 permission denied is not retried as transient", async () => {
    const cwd = copyFixtureToTemp();
    const githubClient = createReadyClient();
    githubClient.failNext("createRepositoryFromTemplate", "permission_denied");

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.exitCode).toBe(ExitCode.AuthenticationOrAuthorizationFailure);
    expect(githubClient.mutations.createdRepositories).toEqual([]);
  });

  it("TC-RECOVERY-008 network timeout succeeds after retry", async () => {
    const cwd = copyFixtureToTemp();
    const githubClient = createReadyClient();
    githubClient.failNext("createRepositoryFromTemplate", "timeout");

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.createdRepositories).toHaveLength(1);
  });

  it("TC-RECOVERY-009 systemic auth failure stops command before mutation", async () => {
    const cwd = copyFixtureToTemp();
    const githubClient = createReadyClient();
    githubClient.failAll("auth_failed");

    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.exitCode).toBe(ExitCode.AuthenticationOrAuthorizationFailure);
    expect(githubClient.mutations.createdRepositories).toEqual([]);
  });

  it("TC-RECOVERY-010 config error stops before GitHub mutation", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "graider-apply-config-failure-"));
    const githubClient = createReadyClient();

    const result = await runApplyCommand({
      cwd,
      assignmentFile: CONFIG_FAILURE_ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock,
      retryOptions: { sleep: async () => {} }
    });

    expect(result.exitCode).toBe(ExitCode.ConfigurationOrSchemaError);
    expect(githubClient.mutations.createdRepositories).toEqual([]);
  });
});
