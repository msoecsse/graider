import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runGradeCommand } from "../../src/cli/commands/grade.command.js";
import { formatCommandResultAsJson } from "../../src/cli/output.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { DiagnosticCode } from "../../src/diagnostics/error-catalog.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubRepository, GitHubWorkflow } from "../../src/github/github-models.js";
import { DEFAULT_GITHUB_RETRY_ATTEMPTS } from "../../src/github/github-retry.js";

enum GradeTestNumber {
  RepositoryId = 101,
  SecondRepositoryId = 102,
  WorkflowId = 202
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/grade");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const KIM_REPOSITORY = "27s1-se2030-lab04-kimstudent";
const NO_MUTATIONS = 0;
const jsonOptions = normalizeCommonCommandOptions({ json: true });
const noSleep = async () => {};

const workflow: GitHubWorkflow = {
  id: GradeTestNumber.WorkflowId,
  path: "grade.yml",
  name: "Grade",
  supportsDispatch: true
};

const copyFixtureToTemp = (fixtureName: string): string => {
  const sourceRoot = path.join(FIXTURE_ROOT, fixtureName);
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), `graider-grade-${fixtureName}-`));

  fs.cpSync(sourceRoot, destinationRoot, { recursive: true });

  return destinationRoot;
};

const createRepository = (
  name: string,
  id: number = GradeTestNumber.RepositoryId
): GitHubRepository => ({
  owner: ORGANIZATION,
  name,
  fullName: `${ORGANIZATION}/${name}`,
  id,
  private: true,
  archived: false,
  defaultBranch: "main",
  htmlUrl: `https://github.com/${ORGANIZATION}/${name}`
});

const createReadyClient = (): FakeGitHubClient =>
  new FakeGitHubClient({
    repositories: [
      createRepository(JONES_REPOSITORY),
      createRepository(KIM_REPOSITORY, GradeTestNumber.SecondRepositoryId)
    ],
    workflows: [
      { owner: ORGANIZATION, repo: JONES_REPOSITORY, workflow },
      { owner: ORGANIZATION, repo: KIM_REPOSITORY, workflow }
    ]
  });

const runGrade = async (
  fixtureName: string,
  targetSelector: Parameters<typeof runGradeCommand>[0]["targetSelector"],
  githubClient: FakeGitHubClient = createReadyClient()
) => {
  const cwd = copyFixtureToTemp(fixtureName);
  const result = await runGradeCommand({
    cwd,
    assignmentFile: ASSIGNMENT_FILE,
    options: jsonOptions,
    targetSelector,
    githubClient,
    retryOptions: { sleep: noSleep }
  });

  return { cwd, result, githubClient };
};

describe("graider grade command", () => {
  it("TC-CLI-GRADE-001 missing target selector fails", async () => {
    const { result, githubClient } = await runGrade("active-assignment", {});

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.TargetSelectorMissing })
    ]);
    expect(githubClient.mutations.workflowDispatches).toHaveLength(NO_MUTATIONS);
  });

  it("TC-CLI-GRADE-002 multiple target selectors fail", async () => {
    const { result } = await runGrade("active-assignment", { all: true, section: "001" });

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.TargetSelectorAmbiguous })
    ]);
  });

  it("TC-CLI-GRADE-003 --all targets expected active students", async () => {
    const { result, githubClient } = await runGrade("active-assignment", { all: true });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.summary.targetsSelected).toBe(2);
    expect(githubClient.mutations.workflowDispatches.map((dispatch) => dispatch.repo)).toEqual([
      JONES_REPOSITORY,
      KIM_REPOSITORY
    ]);
  });

  it("TC-CLI-GRADE-004 --section targets expected section students", async () => {
    const { result, githubClient } = await runGrade("active-assignment", { section: "001" });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.summary.targetsSelected).toBe(1);
    expect(githubClient.mutations.workflowDispatches.map((dispatch) => dispatch.repo)).toEqual([
      JONES_REPOSITORY
    ]);
  });

  it("TC-CLI-GRADE-005 --student-id targets expected student", async () => {
    const { result, githubClient } = await runGrade("active-assignment", { studentId: "JONES" });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.summary.targetsSelected).toBe(1);
    const [dispatch] = githubClient.mutations.workflowDispatches;

    expect(dispatch?.repo).toBe(JONES_REPOSITORY);
    expect(dispatch?.ref).toBe("main");
    expect(dispatch?.inputs).toBeUndefined();
  });

  it("TC-CLI-GRADE-006 --github-username targets expected student", async () => {
    const { result, githubClient } = await runGrade("active-assignment", {
      githubUsername: "KIMSTUDENT"
    });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.summary.targetsSelected).toBe(1);
    expect(githubClient.mutations.workflowDispatches[0]?.repo).toBe(KIM_REPOSITORY);
  });

  it("TC-CLI-GRADE-007 grading disabled fails cleanly", async () => {
    const { result, githubClient } = await runGrade("grading-disabled", { all: true });

    expect(result.exitCode).toBe(ExitCode.CommandError);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GradingNotConfigured })
    ]);
    expect(githubClient.mutations.workflowDispatches).toHaveLength(NO_MUTATIONS);
  });

  it("TC-CLI-GRADE-008 missing workflow handled with canonical code", async () => {
    const { result } = await runGrade(
      "active-assignment",
      { studentId: "jones" },
      new FakeGitHubClient({
        repositories: [createRepository(JONES_REPOSITORY)]
      })
    );

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GradingWorkflowMissing })
    ]);
  });

  it("TC-CLI-GRADE-009 workflow dispatch triggered when available", async () => {
    const { result, githubClient } = await runGrade("active-assignment", { studentId: "jones" });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(githubClient.mutations.workflowDispatches).toEqual([
      expect.objectContaining({
        owner: ORGANIZATION,
        repo: JONES_REPOSITORY,
        workflowPath: "grade.yml",
        ref: "main"
      })
    ]);
  });

  it("TC-CLI-GRADE-010 draft and archived assignments block grade", async () => {
    const draft = await runGrade("draft-assignment", { all: true });
    const archived = await runGrade("archived-assignment", { all: true });

    expect(draft.result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.AssignmentStatusBlocksGrade })
    ]);
    expect(archived.result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.AssignmentStatusBlocksGrade })
    ]);
    expect(draft.githubClient.mutations.workflowDispatches).toHaveLength(NO_MUTATIONS);
    expect(archived.githubClient.mutations.workflowDispatches).toHaveLength(NO_MUTATIONS);
  });

  it("missing manifest fails before dispatch", async () => {
    const { result, githubClient } = await runGrade("missing-manifest", { all: true });

    expect(result.exitCode).toBe(ExitCode.ConfigurationOrSchemaError);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.ManifestMissing })
    ]);
    expect(githubClient.mutations.workflowDispatches).toHaveLength(NO_MUTATIONS);
  });

  it("workflow dispatch unsupported fails with diagnostic", async () => {
    const { result, githubClient } = await runGrade(
      "active-assignment",
      { studentId: "jones" },
      new FakeGitHubClient({
        repositories: [createRepository(JONES_REPOSITORY)],
        workflows: [
          {
            owner: ORGANIZATION,
            repo: JONES_REPOSITORY,
            workflow: { ...workflow, supportsDispatch: false }
          }
        ]
      })
    );

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.WorkflowDispatchMissing })
    ]);
    expect(githubClient.mutations.workflowDispatches).toHaveLength(NO_MUTATIONS);
  });

  it("one dispatch failure and one success returns partial success", async () => {
    const { result, githubClient } = await runGrade(
      "active-assignment",
      { all: true },
      new FakeGitHubClient({
        repositories: [createRepository(JONES_REPOSITORY), createRepository(KIM_REPOSITORY)],
        workflows: [{ owner: ORGANIZATION, repo: JONES_REPOSITORY, workflow }]
      })
    );

    expect(result.status).toBe("partial_success");
    expect(result.exitCode).toBe(ExitCode.PartialSuccess);
    expect(githubClient.mutations.workflowDispatches).toHaveLength(1);
  });

  it("all dispatches fail with API error exits 4", async () => {
    const githubClient = createReadyClient();
    githubClient.failTimes("getWorkflow", "api_error", DEFAULT_GITHUB_RETRY_ATTEMPTS);
    const { result } = await runGrade("active-assignment", { studentId: "jones" }, githubClient);

    expect(result.exitCode).toBe(ExitCode.GitHubOrNetworkFailure);
  });

  it("auth failure exits 3", async () => {
    const githubClient = createReadyClient();
    githubClient.failNext("getWorkflow", "auth_failed");
    const { result } = await runGrade("active-assignment", { studentId: "jones" }, githubClient);

    expect(result.exitCode).toBe(ExitCode.AuthenticationOrAuthorizationFailure);
  });

  it("grade --json output is parseable", async () => {
    const { result } = await runGrade("active-assignment", { studentId: "jones" });
    const json = JSON.parse(formatCommandResultAsJson(result)) as { commandName: string };

    expect(json.commandName).toBe("grade");
  });

  it("grade performs no fake GitHub mutations other than workflow dispatch records", async () => {
    const { cwd, githubClient } = await runGrade("active-assignment", { all: true });

    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.addedCollaborators).toEqual([]);
    expect(githubClient.mutations.teamPermissions).toEqual([]);
    expect(githubClient.mutations.enabledActions).toEqual([]);
    expect(githubClient.mutations.fileWrites).toEqual([]);
    expect(fs.existsSync(path.join(cwd, "terms/27s1/reports/lab04"))).toBe(false);
  });
});
