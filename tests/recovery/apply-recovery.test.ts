import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runApplyCommand } from "../../src/cli/commands/apply.command.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubTemplateRepository } from "../../src/github/github-models.js";

enum TestNumber {
  TemplateRepositoryId = 101,
  ExistingRepositoryId = 202
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/apply");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPO = "lab04-template";
const TEMPLATE_BRANCH = "main";
const README_FILE = "README.md";
const APPLY_TIMESTAMP = "2026-09-01T14:30:00.000Z";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
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

const copyFixtureToTemp = (): string => {
  const sourceRoot = path.join(FIXTURE_ROOT, "grading-disabled");
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider-apply-recovery-"));

  fs.cpSync(sourceRoot, destinationRoot, {
    recursive: true
  });

  return destinationRoot;
};

const createReadyClient = (): FakeGitHubClient =>
  new FakeGitHubClient({
    templateRepositories: [templateRepository],
    users: [{ username: "seanjones" }],
    teams: [
      { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
      { org: ORGANIZATION, slug: "graders", name: "Graders" }
    ]
  });

describe("apply recovery", () => {
  it("TC-RECOVERY-001 interrupted after repo creation and manifest update reruns no-op for repo creation", async () => {
    const cwd = copyFixtureToTemp();
    const githubClient = createReadyClient();
    githubClient.failNext("addCollaborator", "api_error");

    const first = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
    });
    const createdAfterFirstRun = githubClient.mutations.createdRepositories.length;
    githubClient.clearFailures();
    const second = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesOptions,
      githubClient,
      clock: fixedClock
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
      clock: fixedClock
    });

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "repo_name_collision" })])
    );
  });
});
