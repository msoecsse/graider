import path from "node:path";
import { describe, expect, it } from "vitest";
import { runValidateCommand } from "../../src/cli/commands/validate.command.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { formatCommandResultAsJson } from "../../src/cli/output.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubTemplateRepository } from "../../src/github/github-models.js";

enum TestNumber {
  TemplateRepositoryId = 101
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/roster/valid-course");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPO = "lab04-template";
const TEMPLATE_BRANCH = "main";
const README_FILE = "README.md";
const FACULTY_TEAM = "faculty";
const GRADER_TEAM = "graders";
const STUDENT_USERNAMES = ["seanjones", "janesmith", "alexlee", "mayapatel"] as const;

const options = normalizeCommonCommandOptions({});

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

const createReadyClient = (): FakeGitHubClient =>
  new FakeGitHubClient({
    templateRepositories: [templateRepository],
    users: STUDENT_USERNAMES.map((username) => ({ username })),
    teams: [
      { org: ORGANIZATION, slug: FACULTY_TEAM, name: "Faculty" },
      { org: ORGANIZATION, slug: GRADER_TEAM, name: "Graders" }
    ]
  });

const runValidate = (githubClient: FakeGitHubClient) =>
  runValidateCommand({
    cwd: FIXTURE_ROOT,
    assignmentFile: ASSIGNMENT_FILE,
    options,
    githubClient
  });

describe("validate GitHub readiness", () => {
  it("valid GitHub readiness combined with valid config/roster exits 0", async () => {
    const result = await runValidate(createReadyClient());

    expect(result.status).toBe("success");
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.summary).toMatchObject({
      githubReadinessChecked: true
    });
  });

  it("missing GitHub user exits 1", async () => {
    const result = await runValidate(
      new FakeGitHubClient({
        templateRepositories: [templateRepository],
        users: [{ username: "seanjones" }],
        teams: [
          { org: ORGANIZATION, slug: FACULTY_TEAM, name: "Faculty" },
          { org: ORGANIZATION, slug: GRADER_TEAM, name: "Graders" }
        ]
      })
    );

    expect(result.status).toBe("failure");
    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "github_user_missing" }),
      expect.objectContaining({ code: "github_user_missing" }),
      expect.objectContaining({ code: "github_user_missing" })
    ]);
  });

  it("auth missing maps to exit code 3", async () => {
    const client = createReadyClient();
    client.failNext("getAuthenticatedUser", "auth_missing");

    const result = await runValidate(client);

    expect(result.exitCode).toBe(ExitCode.AuthenticationOrAuthorizationFailure);
    expect(result.errors).toEqual([expect.objectContaining({ code: "github_auth_missing" })]);
  });

  it("permission denied maps to exit code 3", async () => {
    const client = createReadyClient();
    client.failNext("getAuthenticatedUser", "permission_denied");

    const result = await runValidate(client);

    expect(result.exitCode).toBe(ExitCode.AuthenticationOrAuthorizationFailure);
    expect(result.errors).toEqual([expect.objectContaining({ code: "github_permission_denied" })]);
  });

  it("rate limit maps to exit code 4", async () => {
    const client = createReadyClient();
    client.failNext("getAuthenticatedUser", "rate_limited");

    const result = await runValidate(client);

    expect(result.exitCode).toBe(ExitCode.GitHubOrNetworkFailure);
    expect(result.errors).toEqual([expect.objectContaining({ code: "github_rate_limited" })]);
  });

  it("network/API failure maps to exit code 4", async () => {
    const client = createReadyClient();
    client.failNext("getAuthenticatedUser", "network_error");

    const result = await runValidate(client);

    expect(result.exitCode).toBe(ExitCode.GitHubOrNetworkFailure);
    expect(result.errors).toEqual([expect.objectContaining({ code: "github_network_error" })]);
  });

  it("JSON output includes structured GitHub readiness errors", async () => {
    const result = await runValidate(
      new FakeGitHubClient({
        users: STUDENT_USERNAMES.map((username) => ({ username })),
        teams: [
          { org: ORGANIZATION, slug: FACULTY_TEAM, name: "Faculty" },
          { org: ORGANIZATION, slug: GRADER_TEAM, name: "Graders" }
        ]
      })
    );
    const json = JSON.parse(formatCommandResultAsJson(result)) as {
      readonly errors: Array<{ readonly code: string }>;
      readonly exitCode: ExitCode;
    };

    expect(json.exitCode).toBe(ExitCode.CommandError);
    expect(json.errors).toEqual([expect.objectContaining({ code: "template_repository_missing" })]);
  });
});
