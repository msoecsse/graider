import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatAssignmentApplyPreviewResultAsJson,
  runAssignmentApplyPreviewCommand
} from "../../src/cli/commands/assignment.command.js";
import type { AssignmentApplyPreviewResult } from "../../src/apply-preview/apply-preview-models.js";
import {
  FakeGitHubClient,
  type FakeRepositoryFileRecord
} from "../../src/github/fake-github-client.js";
import type { GitHubRepository, GitHubTemplateRepository } from "../../src/github/github-models.js";

enum TestNumber {
  TemplateRepositoryId = 101,
  ExistingRepositoryId = 202
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/apply");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPOSITORY = "lab04-template";
const TEMPLATE_BRANCH = "main";
const WORKFLOW_PATH = "grade.yml";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const PATEL_REPOSITORY = "27s1-se2030-lab04-mayapatel";
const FAKE_TOKEN = "ghp_fake_apply_preview_token";
const APPLY_PREVIEW_ENV = {
  GRAIDER_GITHUB_TOKEN: FAKE_TOKEN
};

const WORKFLOW_WITH_DISPATCH = `name: Grade
on:
  workflow_dispatch:
`;
const WORKFLOW_WITHOUT_DISPATCH = `name: Grade
on:
  push:
`;

const copyFixtureToTemp = (fixtureName: string): string => {
  const sourceRoot = path.join(FIXTURE_ROOT, fixtureName);
  const destinationRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `graider-apply-preview-${fixtureName}-`)
  );

  fs.cpSync(sourceRoot, destinationRoot, { recursive: true });
  return destinationRoot;
};

const templateRepository = (
  branches: readonly string[] = [TEMPLATE_BRANCH]
): GitHubTemplateRepository => ({
  owner: ORGANIZATION,
  name: TEMPLATE_REPOSITORY,
  fullName: `${ORGANIZATION}/${TEMPLATE_REPOSITORY}`,
  id: TestNumber.TemplateRepositoryId,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${TEMPLATE_REPOSITORY}`,
  isTemplate: true,
  branches: [...branches],
  files: ["README.md"],
  latestCommitSha: "template-sha"
});

const repository = (
  name: string,
  id: number = TestNumber.ExistingRepositoryId
): GitHubRepository => ({
  owner: ORGANIZATION,
  name,
  fullName: `${ORGANIZATION}/${name}`,
  id,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${name}`
});

const workflowFile = (
  content: string = WORKFLOW_WITH_DISPATCH,
  branch: string = TEMPLATE_BRANCH
): FakeRepositoryFileRecord => ({
  owner: ORGANIZATION,
  repo: TEMPLATE_REPOSITORY,
  path: WORKFLOW_PATH,
  content,
  message: "Seed workflow",
  commitSha: "workflow-sha",
  branch
});

const createReadyClient = (
  repositories: GitHubRepository[] = [repository(PATEL_REPOSITORY)]
): FakeGitHubClient =>
  new FakeGitHubClient({
    templateRepositories: [templateRepository()],
    repositories,
    repositoryFiles: [workflowFile()]
  });

const runPreview = (
  fixtureName: string,
  githubClient: FakeGitHubClient | null = createReadyClient(),
  options: Parameters<typeof runAssignmentApplyPreviewCommand>[0]["options"] = { json: true },
  env: Record<string, string | undefined> = APPLY_PREVIEW_ENV
): Promise<AssignmentApplyPreviewResult> =>
  runAssignmentApplyPreviewCommand({
    cwd: copyFixtureToTemp(fixtureName),
    assignmentFile: ASSIGNMENT_FILE,
    options,
    env,
    ...(githubClient === null ? {} : { githubClient })
  });

const expectNoMutations = (githubClient: FakeGitHubClient): void => {
  expect(githubClient.mutations.createdRepositories).toEqual([]);
  expect(githubClient.mutations.addedCollaborators).toEqual([]);
  expect(githubClient.mutations.removedCollaborators).toEqual([]);
  expect(githubClient.mutations.teamPermissions).toEqual([]);
  expect(githubClient.mutations.enabledActions).toEqual([]);
  expect(githubClient.mutations.workflowDispatches).toEqual([]);
  expect(githubClient.mutations.archivedRepositories).toEqual([]);
  expect(githubClient.mutations.fileWrites).toEqual([]);
};

const getRow = (
  result: AssignmentApplyPreviewResult,
  studentId: string
): NonNullable<AssignmentApplyPreviewResult["plan"]>["repositories"][number] => {
  const row = result.plan?.repositories.find(
    (repositoryRow) => repositoryRow.studentId === studentId
  );

  if (row === undefined) {
    throw new Error(`Missing preview row for ${studentId}`);
  }

  return row;
};

describe("graider assignment apply-preview command", () => {
  it("requires JSON output and returns the JSON-only diagnostic", async () => {
    const result = await runPreview("active-assignment", createReadyClient(), {});
    const json = JSON.parse(
      formatAssignmentApplyPreviewResultAsJson(result)
    ) as AssignmentApplyPreviewResult;

    expect(json.schemaVersion).toBe(1);
    expect(json.commandName).toBe("assignment apply-preview");
    expect(json.status).toBe("failure");
    expect(json.exitCode).toBe(1);
    expect(json.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_apply_preview_json_required" })
    ]);
  });

  it("returns assignment, course, term, target, readiness, files, actions, and plan JSON", async () => {
    const githubClient = createReadyClient();
    const result = await runPreview("active-assignment", githubClient);

    expect(result).toMatchObject({
      schemaVersion: 1,
      commandName: "assignment apply-preview",
      status: "success",
      exitCode: 0,
      assignment: {
        slug: "lab04",
        title: "Lab 04",
        file: ASSIGNMENT_FILE,
        status: "active"
      },
      course: {
        slug: "se2030",
        title: "Software Engineering"
      },
      term: {
        slug: "27s1",
        title: "Spring 2027"
      },
      target: {
        sections: ["001", "002"],
        sectionCount: 2,
        studentCount: 4
      },
      template: {
        repository: "example-org/lab04-template",
        branch: "main",
        status: "available"
      },
      grading: {
        enabled: true,
        workflow: WORKFLOW_PATH,
        workflowStatus: "available",
        workflowDispatch: "available"
      },
      files: {
        assignmentFile: ASSIGNMENT_FILE,
        workflowFile: WORKFLOW_PATH,
        templateSource: "example-org/lab04-template@main"
      },
      actions: {
        apply: {
          available: true,
          implemented: false,
          previewOnly: true
        }
      }
    });
    expect(result.plan?.summary).toEqual({
      wouldCreateRepositories: 1,
      wouldUpdateRepositories: 1,
      wouldSkipRepositories: 2,
      blockedRepositories: 0,
      unknownRepositories: 0
    });
    expectNoMutations(githubClient);
  });

  it("resolves target students and excludes students outside assignment sections", async () => {
    const result = await runPreview("active-assignment");
    const studentIds = result.plan?.repositories.map((row) => row.studentId).sort();

    expect(studentIds).toEqual(["jones", "lee", "patel", "smith"]);
    expect(getRow(result, "jones")).toMatchObject({
      section: "001",
      repository: `${ORGANIZATION}/${JONES_REPOSITORY}`,
      status: "would_create",
      reason: "student_repository_missing"
    });
    expect(getRow(result, "smith")).toMatchObject({
      status: "would_skip",
      reason: "student_status_dropped"
    });
    expect(getRow(result, "lee")).toMatchObject({
      status: "would_skip",
      reason: "student_status_hold"
    });
    expect(getRow(result, "patel")).toMatchObject({
      section: "002",
      repository: `${ORGANIZATION}/${PATEL_REPOSITORY}`,
      status: "would_update",
      reason: "student_repository_exists"
    });
  });

  it("returns useful local target rows when the GitHub token is missing", async () => {
    const result = await runPreview("active-assignment", null, { json: true }, {});

    expect(result.status).toBe("partial_success");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "github_token_required" })
    ]);
    expect(getRow(result, "jones")).toMatchObject({
      status: "unknown",
      reason: "token_required"
    });
    expect(getRow(result, "patel")).toMatchObject({
      status: "unknown",
      reason: "token_required"
    });
    expect(result.plan?.summary).toMatchObject({
      wouldSkipRepositories: 2,
      unknownRepositories: 2
    });
    expect(result.actions?.apply.available).toBe(false);
  });

  it("reports missing template repository and branch as preview blockers", async () => {
    const missingRepositoryResult = await runPreview(
      "active-assignment",
      new FakeGitHubClient({
        repositoryFiles: [workflowFile()]
      })
    );
    const missingBranchResult = await runPreview(
      "active-assignment",
      new FakeGitHubClient({
        templateRepositories: [templateRepository(["dev"])],
        repositoryFiles: [workflowFile()]
      })
    );

    expect(missingRepositoryResult.status).toBe("partial_success");
    expect(missingRepositoryResult.template?.repositoryStatus).toBe("missing");
    expect(missingRepositoryResult.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_template_repository_missing" })
    ]);
    expect(missingRepositoryResult.actions?.apply.available).toBe(false);
    expect(missingBranchResult.status).toBe("partial_success");
    expect(missingBranchResult.template?.branchStatus).toBe("branch_missing");
    expect(missingBranchResult.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_template_branch_missing" })
    ]);
    expect(missingBranchResult.actions?.apply.available).toBe(false);
  });

  it("reports missing grading workflow and workflow_dispatch while keeping rows visible", async () => {
    const missingWorkflowResult = await runPreview(
      "active-assignment",
      new FakeGitHubClient({
        templateRepositories: [templateRepository()]
      })
    );
    const missingDispatchResult = await runPreview(
      "active-assignment",
      new FakeGitHubClient({
        templateRepositories: [templateRepository()],
        repositoryFiles: [workflowFile(WORKFLOW_WITHOUT_DISPATCH)]
      })
    );

    expect(missingWorkflowResult.status).toBe("partial_success");
    expect(missingWorkflowResult.grading?.workflowStatus).toBe("missing");
    expect(missingWorkflowResult.plan?.repositories.length).toBe(4);
    expect(missingWorkflowResult.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_grading_workflow_missing" })
    ]);
    expect(missingDispatchResult.status).toBe("partial_success");
    expect(missingDispatchResult.grading?.workflowDispatch).toBe("missing");
    expect(missingDispatchResult.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_workflow_dispatch_missing" })
    ]);
  });

  it("does not require workflow readiness for no-grading assignments", async () => {
    const githubClient = new FakeGitHubClient({
      templateRepositories: [templateRepository()]
    });
    const result = await runPreview("grading-disabled", githubClient);

    expect(result.status).toBe("success");
    expect(result.grading).toMatchObject({
      enabled: false,
      workflow: null,
      workflowStatus: "not_required",
      workflowDispatch: "not_required"
    });
    expect(githubClient.fileReads).toEqual([]);
    expectNoMutations(githubClient);
  });

  it("blocks archived assignments without mutating repositories", async () => {
    const githubClient = createReadyClient([repository(JONES_REPOSITORY)]);
    const result = await runPreview("archived-assignment", githubClient);

    expect(result.status).toBe("partial_success");
    expect(getRow(result, "jones")).toMatchObject({
      status: "blocked",
      reason: "archived"
    });
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "assignment_archived" })]);
    expect(result.actions?.apply.available).toBe(false);
    expectNoMutations(githubClient);
  });

  it("maps repository check failures to unknown rows with safe diagnostics", async () => {
    const githubClient = createReadyClient();

    githubClient.failNext("getRepository", "rate_limited", { retryAfterSeconds: 30 });

    const result = await runPreview("active-assignment", githubClient);
    const serialized = JSON.stringify(result);

    expect(result.status).toBe("partial_success");
    expect(getRow(result, "jones")).toMatchObject({
      status: "unknown",
      reason: "student_repository_status_unknown"
    });
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "github_rate_limited" })]);
    expect(serialized).not.toContain(FAKE_TOKEN);
    expect(serialized.toLowerCase()).not.toContain("authorization");
    expectNoMutations(githubClient);
  });

  it("returns failure JSON for a missing assignment file", async () => {
    const result = await runAssignmentApplyPreviewCommand({
      cwd: copyFixtureToTemp("active-assignment"),
      assignmentFile: "terms/27s1/assignments/missing/assignment.yml",
      options: { json: true },
      env: APPLY_PREVIEW_ENV,
      githubClient: createReadyClient()
    });

    expect(result.status).toBe("failure");
    expect(result.assignment).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "missing_required_file" })
    ]);
  });
});
