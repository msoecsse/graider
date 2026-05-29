import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPlanCommand } from "../../src/cli/commands/plan.command.js";
import { formatCommandResultAsJson } from "../../src/cli/output.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubTemplateRepository } from "../../src/github/github-models.js";

enum TestNumber {
  TemplateRepositoryId = 101,
  ExistingRepositoryId = 202
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/plan");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPO = "lab04-template";
const TEMPLATE_BRANCH = "main";
const README_FILE = "README.md";
const PLAN_TIMESTAMP = "2026-09-01T14:30:00.000Z";
const EXPECTED_REPOSITORY_NAME = "27s1-se2030-lab04-seanjones";

const options = normalizeCommonCommandOptions({});
const jsonOptions = normalizeCommonCommandOptions({ json: true });
const fixedClock = {
  now: () => new Date(PLAN_TIMESTAMP)
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

const copyFixtureToTemp = (fixtureName: string): string => {
  const sourceRoot = path.join(FIXTURE_ROOT, fixtureName);
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), `graider-plan-${fixtureName}-`));

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
    ]
  });

const readGeneratedPlan = (repoRoot: string, generatedFile: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, generatedFile), "utf8")) as Record<
    string,
    unknown
  >;

const runPlan = async (
  fixtureName: string,
  githubClient: FakeGitHubClient = createReadyClient()
) => {
  const cwd = copyFixtureToTemp(fixtureName);
  const result = await runPlanCommand({
    cwd,
    assignmentFile: ASSIGNMENT_FILE,
    options,
    githubClient,
    clock: fixedClock
  });

  return {
    cwd,
    result,
    plan: readGeneratedPlan(cwd, result.generatedFiles[0] ?? "")
  };
};

describe("graider plan command", () => {
  it("TC-CLI-PLAN-001 active assignment produces repo creation operations", async () => {
    const { result, plan } = await runPlan("active-assignment");

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "create_repository_from_template",
          status: "planned",
          student_id: "jones",
          repository_name: EXPECTED_REPOSITORY_NAME
        })
      ])
    );
  });

  it("TC-CLI-PLAN-002 hold student is skipped", async () => {
    const { plan } = await runPlan("active-assignment");

    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "skipped",
          student_id: "lee",
          reason: "student_status_hold"
        })
      ])
    );
  });

  it("TC-CLI-PLAN-003 dropped student is skipped", async () => {
    const { plan } = await runPlan("active-assignment");

    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "skipped",
          student_id: "smith",
          reason: "student_status_dropped"
        })
      ])
    );
  });

  it("TC-CLI-PLAN-004 repo collision creates blocked operation", async () => {
    const githubClient = new FakeGitHubClient({
      templateRepositories: [templateRepository],
      users: [{ username: "seanjones" }],
      teams: [
        { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
        { org: ORGANIZATION, slug: "graders", name: "Graders" }
      ],
      repositories: [
        {
          owner: ORGANIZATION,
          name: EXPECTED_REPOSITORY_NAME,
          fullName: `${ORGANIZATION}/${EXPECTED_REPOSITORY_NAME}`,
          id: TestNumber.ExistingRepositoryId,
          private: true,
          archived: false,
          defaultBranch: TEMPLATE_BRANCH,
          htmlUrl: `https://github.com/${ORGANIZATION}/${EXPECTED_REPOSITORY_NAME}`
        }
      ]
    });
    const { result, plan } = await runPlan("grading-disabled", githubClient);

    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "blocked",
          errors: [expect.objectContaining({ code: "repo_name_collision" })]
        })
      ])
    );
  });

  it("TC-CLI-PLAN-005 closed assignment blocks new repo creation", async () => {
    const { result, plan } = await runPlan("closed-assignment");

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "blocked",
          errors: [expect.objectContaining({ code: "assignment_closed_blocks_creation" })]
        })
      ])
    );
  });

  it("TC-CLI-PLAN-006 archived assignment produces blocked plan", async () => {
    const { result, plan } = await runPlan("archived-assignment");

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "blocked",
          errors: [expect.objectContaining({ code: "assignment_archived" })]
        })
      ])
    );
  });

  it("TC-CLI-PLAN-007 plan file is written", async () => {
    const { cwd, result } = await runPlan("active-assignment");

    expect(result.generatedFiles).toHaveLength(1);
    expect(result.generatedFiles[0]).toMatch(/^terms\/27s1\/plans\/lab04\/plan-[^:]+\.json$/u);
    expect(fs.existsSync(path.join(cwd, result.generatedFiles[0] ?? ""))).toBe(true);
  });

  it("TC-CLI-PLAN-008 --json references generated plan file", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    const result = await runPlanCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      githubClient: createReadyClient(),
      clock: fixedClock
    });
    const json = JSON.parse(formatCommandResultAsJson(result)) as {
      readonly generatedFiles: string[];
      readonly summary: { readonly planFile?: string };
    };

    expect(json.generatedFiles).toEqual([json.summary.planFile]);
  });

  it("TC-CLI-PLAN-009 plan makes no GitHub mutations", async () => {
    const githubClient = createReadyClient();

    await runPlan("active-assignment", githubClient);

    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.addedCollaborators).toEqual([]);
    expect(githubClient.mutations.removedCollaborators).toEqual([]);
    expect(githubClient.mutations.teamPermissions).toEqual([]);
    expect(githubClient.mutations.enabledActions).toEqual([]);
    expect(githubClient.mutations.workflowDispatches).toEqual([]);
    expect(githubClient.mutations.archivedRepositories).toEqual([]);
    expect(githubClient.mutations.fileWrites).toEqual([]);
  });

  it("TC-CLI-PLAN-010 repeated plans are identical with the same injected clock", async () => {
    const first = await runPlan("active-assignment");
    const second = await runPlan("active-assignment");

    expect(first.result.generatedFiles).toEqual(second.result.generatedFiles);
    expect(first.plan).toEqual(second.plan);
  });
});
