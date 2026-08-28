import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatAssignmentDetailResultAsJson,
  runAssignmentDetailCommand
} from "../../src/cli/commands/assignment.command.js";
import type { AssignmentDetailResult } from "../../src/assignment-detail/assignment-detail-models.js";
import {
  FakeGitHubClient,
  type FakeRepositoryFileRecord
} from "../../src/github/fake-github-client.js";
import type { GitHubClient } from "../../src/github/github-client.js";
import type { GitHubTemplateRepository } from "../../src/github/github-models.js";

const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPOSITORY_NAME = "lab04-template";
const TEMPLATE_BRANCH = "main";
const WORKFLOW_PATH = "grade.yml";
const FAKE_TOKEN = "ghp_fake_assignment_detail_token";
const VALID_CONFIG_ROOT = path.resolve("tests/fixtures/config/valid-course");
const GRADING_DISABLED_ROOT = path.resolve("tests/fixtures/config/grading-disabled");
const VALID_ROSTER_ROOT = path.resolve("tests/fixtures/roster/valid-course");
const INVALID_ASSIGNMENT_ROOT = path.resolve("tests/fixtures/config/missing-assignment-field");
const REPORT_FIXTURE_ROOT = path.resolve("tests/fixtures/report/publish-success");
const TEMP_FIXTURE_PREFIX = "graider-assignment-detail-";
const NO_CALLS = 0;

const assignmentDetailEnv = {
  GRAIDER_GITHUB_TOKEN: FAKE_TOKEN
};

const WORKFLOW_WITH_DISPATCH = `name: Grade
on:
  workflow_dispatch:
`;
const WORKFLOW_WITH_LIST_DISPATCH = `name: Grade
on:
  - push
  - workflow_dispatch
`;
const WORKFLOW_WITH_QUOTED_DISPATCH = `name: Grade
"on":
  workflow_dispatch:
`;
const WORKFLOW_WITHOUT_DISPATCH = `name: Grade
on:
  push:
`;

const templateRepository = (
  branches: readonly string[] = [TEMPLATE_BRANCH]
): GitHubTemplateRepository => ({
  owner: ORGANIZATION,
  name: TEMPLATE_REPOSITORY_NAME,
  fullName: `${ORGANIZATION}/${TEMPLATE_REPOSITORY_NAME}`,
  id: TEMPLATE_REPOSITORY_NAME.length,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${TEMPLATE_REPOSITORY_NAME}`,
  isTemplate: true,
  branches: [...branches],
  files: ["README.md"],
  latestCommitSha: "template-sha"
});

const workflowFile = (
  content: string = WORKFLOW_WITH_DISPATCH,
  branch: string = TEMPLATE_BRANCH
): FakeRepositoryFileRecord => ({
  owner: ORGANIZATION,
  repo: TEMPLATE_REPOSITORY_NAME,
  path: WORKFLOW_PATH,
  content,
  message: "Seed workflow",
  commitSha: "workflow-sha",
  branch
});

const createReadyClient = (
  options: {
    readonly templateRepositories?: GitHubTemplateRepository[];
    readonly repositoryFiles?: FakeRepositoryFileRecord[];
  } = {}
): FakeGitHubClient =>
  new FakeGitHubClient({
    templateRepositories: options.templateRepositories ?? [templateRepository()],
    repositoryFiles: options.repositoryFiles ?? [workflowFile()]
  });

class CountingAssignmentDetailGitHubClient extends FakeGitHubClient {
  templateRepositoryReads = 0;
  workflowRunReads = 0;
  artifactReads = 0;

  override getTemplateRepository(
    owner: string,
    repo: string
  ): ReturnType<FakeGitHubClient["getTemplateRepository"]> {
    this.templateRepositoryReads += 1;

    return super.getTemplateRepository(owner, repo);
  }

  override listWorkflowRuns(
    input: Parameters<FakeGitHubClient["listWorkflowRuns"]>[0]
  ): ReturnType<FakeGitHubClient["listWorkflowRuns"]> {
    this.workflowRunReads += 1;

    return super.listWorkflowRuns(input);
  }

  override downloadArtifact(
    input: Parameters<FakeGitHubClient["downloadArtifact"]>[0]
  ): ReturnType<FakeGitHubClient["downloadArtifact"]> {
    this.artifactReads += 1;

    return super.downloadArtifact(input);
  }
}

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

const copyFixtureToTemp = (fixtureRoot: string): string => {
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_FIXTURE_PREFIX));

  fs.cpSync(fixtureRoot, destinationRoot, { recursive: true });
  return destinationRoot;
};

const runDetail = (
  cwd: string,
  options: Parameters<typeof runAssignmentDetailCommand>[0]["options"] = { json: true },
  assignmentFile = ASSIGNMENT_FILE,
  githubClient: GitHubClient = createReadyClient()
): Promise<AssignmentDetailResult> =>
  runAssignmentDetailCommand({
    cwd,
    assignmentFile,
    options,
    env: assignmentDetailEnv,
    githubClient
  });

const appendAssignmentYaml = (cwd: string, yaml: string): void => {
  fs.appendFileSync(path.join(cwd, ASSIGNMENT_FILE), `\n${yaml}`);
};

const appendCourseYaml = (cwd: string, yaml: string): void => {
  fs.appendFileSync(path.join(cwd, "course.yml"), `\n${yaml}`);
};

const listFiles = (cwd: string): string[] =>
  fs
    .readdirSync(cwd, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(cwd, path.join(entry.parentPath, entry.name)))
    .sort((left, right) => left.localeCompare(right));

describe("graider assignment detail command", () => {
  it("requires JSON output and returns a JSON failure shape", async () => {
    const result = await runDetail(VALID_CONFIG_ROOT, {});
    const json = JSON.parse(formatAssignmentDetailResultAsJson(result)) as AssignmentDetailResult;

    expect(json.schemaVersion).toBe(1);
    expect(json.commandName).toBe("assignment detail");
    expect(json.status).toBe("failure");
    expect(json.exitCode).toBe(1);
    expect(json.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_json_required" })
    ]);
    expect(json.course).toBeNull();
    expect(json.sections).toEqual([]);
  });

  it("returns the assignment detail JSON contract for a valid assignment", async () => {
    const result = await runDetail(VALID_CONFIG_ROOT);

    expect(result).toMatchObject({
      schemaVersion: 1,
      commandName: "assignment detail",
      status: "success",
      exitCode: 0,
      course: {
        slug: "se2030",
        title: "Software Engineering",
        file: "course.yml"
      },
      term: {
        slug: "27s1",
        title: "Spring 2027",
        file: "terms/27s1/term.yml"
      },
      assignment: {
        slug: "lab04",
        title: "Lab 04",
        type: "individual",
        status: "active",
        file: ASSIGNMENT_FILE
      },
      metadata: {
        facultyOwner: "professor",
        lmsAssignmentId: null,
        gradingCategory: "labs",
        points: 100
      },
      deadline: {
        dueAt: "2027-04-15T23:59:00+09:00",
        latePolicy: "standard"
      },
      sections: ["001"],
      template: {
        repository: "example-org/lab04-template",
        branch: "main",
        status: "available",
        repositoryStatus: "available",
        branchStatus: "available"
      },
      grading: {
        enabled: true,
        mode: "custom-workflow",
        workflow: "grade.yml",
        artifact: "grading-results",
        resultFile: "results.json",
        workflowStatus: "available",
        workflowDispatch: "available"
      },
      studentReports: {
        enabled: false,
        mode: "disabled"
      },
      applyState: {
        status: "not_applied"
      }
    });
    expect(result.actions).toEqual({
      validate: { available: true, implemented: true },
      apply: { available: true, implemented: false },
      grade: { available: true, implemented: false },
      report: { available: true, implemented: false },
      publishStudentReports: { available: false, implemented: false },
      generateWorkflow: { available: false, implemented: false }
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("marks a missing template repository as partial success", async () => {
    const result = await runDetail(
      VALID_CONFIG_ROOT,
      { json: true },
      ASSIGNMENT_FILE,
      new FakeGitHubClient()
    );

    expect(result.status).toBe("partial_success");
    expect(result.template).toMatchObject({
      status: "missing",
      repositoryStatus: "missing",
      branchStatus: "not_checked"
    });
    expect(result.grading).toMatchObject({
      workflowStatus: "not_checked",
      workflowDispatch: "not_checked"
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_template_repository_missing" })
    ]);
  });

  it("marks a missing template branch as partial success", async () => {
    const result = await runDetail(
      VALID_CONFIG_ROOT,
      { json: true },
      ASSIGNMENT_FILE,
      createReadyClient({ templateRepositories: [templateRepository(["develop"])] })
    );

    expect(result.status).toBe("partial_success");
    expect(result.template).toMatchObject({
      status: "branch_missing",
      repositoryStatus: "available",
      branchStatus: "branch_missing"
    });
    expect(result.grading).toMatchObject({
      workflowStatus: "not_checked",
      workflowDispatch: "not_checked"
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_template_branch_missing" })
    ]);
  });

  it("marks a missing grading workflow as partial success", async () => {
    const result = await runDetail(
      VALID_CONFIG_ROOT,
      { json: true },
      ASSIGNMENT_FILE,
      createReadyClient({ repositoryFiles: [] })
    );

    expect(result.status).toBe("partial_success");
    expect(result.grading).toMatchObject({
      workflowStatus: "missing",
      workflowDispatch: "not_checked"
    });
    expect(result.actions?.grade.available).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_grading_workflow_missing" })
    ]);
  });

  it("detects missing workflow_dispatch and supports list and quoted workflow triggers", async () => {
    const missingDispatch = await runDetail(
      VALID_CONFIG_ROOT,
      { json: true },
      ASSIGNMENT_FILE,
      createReadyClient({ repositoryFiles: [workflowFile(WORKFLOW_WITHOUT_DISPATCH)] })
    );
    const listDispatch = await runDetail(
      VALID_CONFIG_ROOT,
      { json: true },
      ASSIGNMENT_FILE,
      createReadyClient({ repositoryFiles: [workflowFile(WORKFLOW_WITH_LIST_DISPATCH)] })
    );
    const quotedDispatch = await runDetail(
      VALID_CONFIG_ROOT,
      { json: true },
      ASSIGNMENT_FILE,
      createReadyClient({ repositoryFiles: [workflowFile(WORKFLOW_WITH_QUOTED_DISPATCH)] })
    );

    expect(missingDispatch.status).toBe("partial_success");
    expect(missingDispatch.grading).toMatchObject({
      workflowStatus: "available",
      workflowDispatch: "missing"
    });
    expect(missingDispatch.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_workflow_dispatch_missing" })
    ]);
    expect(listDispatch.grading).toMatchObject({
      workflowStatus: "available",
      workflowDispatch: "available"
    });
    expect(quotedDispatch.grading).toMatchObject({
      workflowStatus: "available",
      workflowDispatch: "available"
    });
  });

  it("maps GitHub permission, rate limit, and request failures to safe diagnostics", async () => {
    const inaccessibleClient = createReadyClient();
    inaccessibleClient.failNext("getTemplateRepository", "permission_denied");
    const rateLimitedClient = createReadyClient();
    rateLimitedClient.failNext("getRepositoryFileContent", "rate_limited", {
      retryAfterSeconds: 60
    });
    const requestFailedClient = createReadyClient();
    requestFailedClient.failNext("getRepositoryFileContent", "network_error");

    const inaccessible = await runDetail(
      VALID_CONFIG_ROOT,
      { json: true },
      ASSIGNMENT_FILE,
      inaccessibleClient
    );
    const rateLimited = await runDetail(
      VALID_CONFIG_ROOT,
      { json: true },
      ASSIGNMENT_FILE,
      rateLimitedClient
    );
    const requestFailed = await runDetail(
      VALID_CONFIG_ROOT,
      { json: true },
      ASSIGNMENT_FILE,
      requestFailedClient
    );
    const output = formatAssignmentDetailResultAsJson(rateLimited);

    expect(inaccessible.template).toMatchObject({
      status: "inaccessible",
      repositoryStatus: "inaccessible",
      branchStatus: "inaccessible"
    });
    expect(inaccessible.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_github_permission_denied" })
    ]);
    expect(rateLimited.grading).toMatchObject({
      workflowStatus: "error",
      workflowDispatch: "error"
    });
    expect(rateLimited.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_github_rate_limited" })
    ]);
    expect(requestFailed.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_detail_github_request_failed" })
    ]);
    expect(output).not.toContain(FAKE_TOKEN);
    expect(output).not.toContain("Authorization");
  });

  it("includes roster section, active student, and total student counts", async () => {
    const result = await runDetail(VALID_ROSTER_ROOT);

    expect(result.status).toBe("success");
    expect(result.roster).toEqual({
      sectionCount: 2,
      activeStudentCount: 2,
      totalStudentCount: 4
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("reports missing assignment files as failure JSON", async () => {
    const result = await runDetail(
      VALID_CONFIG_ROOT,
      { json: true },
      "terms/27s1/assignments/nope.yml"
    );

    expect(result.status).toBe("failure");
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "missing_required_file" })
    ]);
    expect(result.assignment).toBeNull();
  });

  it("reports invalid assignment config as failure JSON diagnostics", async () => {
    const result = await runDetail(INVALID_ASSIGNMENT_ROOT);

    expect(result.status).toBe("failure");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "missing_required_field" })
    ]);
    expect(result.assignment).toBeNull();
  });

  it("keeps assignment detail available when roster files are missing", async () => {
    const result = await runDetail(GRADING_DISABLED_ROOT);

    expect(result.status).toBe("partial_success");
    expect(result.assignment?.slug).toBe("lab04");
    expect(result.roster).toEqual({
      sectionCount: 1,
      activeStudentCount: 0,
      totalStudentCount: 0
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "missing_required_file" })
    ]);
  });

  it("represents no-grading assignments without requiring workflow checks", async () => {
    const cwd = copyFixtureToTemp(VALID_ROSTER_ROOT);
    const githubClient = createReadyClient();

    appendAssignmentYaml(
      cwd,
      `grading:
  enabled: false
`
    );

    const result = await runDetail(cwd, { json: true }, ASSIGNMENT_FILE, githubClient);

    expect(result.status).toBe("success");
    expect(result.grading).toEqual({
      enabled: false,
      mode: "no-grading",
      workflow: null,
      artifact: null,
      resultFile: null,
      workflowStatus: "not_required",
      workflowDispatch: "not_required"
    });
    expect(result.actions?.grade.available).toBe(false);
    expect(result.actions?.generateWorkflow.available).toBe(false);
    expect(githubClient.fileReads).toHaveLength(NO_CALLS);
  });

  it("keeps readiness checks bounded and performs no GitHub mutations or scans", async () => {
    const githubClient = new CountingAssignmentDetailGitHubClient({
      templateRepositories: [templateRepository()],
      repositoryFiles: [workflowFile()]
    });

    const result = await runDetail(
      VALID_CONFIG_ROOT,
      { json: true },
      ASSIGNMENT_FILE,
      githubClient
    );

    expect(result.status).toBe("success");
    expect(githubClient.templateRepositoryReads).toBe(1);
    expect(githubClient.fileReads).toEqual([
      {
        owner: ORGANIZATION,
        repo: TEMPLATE_REPOSITORY_NAME,
        path: WORKFLOW_PATH,
        ref: TEMPLATE_BRANCH
      }
    ]);
    expect(githubClient.workflowRunReads).toBe(NO_CALLS);
    expect(githubClient.artifactReads).toBe(NO_CALLS);
    expectNoMutations(githubClient);
  });

  it("includes student report publishing configuration and action availability", async () => {
    const cwd = copyFixtureToTemp(VALID_ROSTER_ROOT);

    appendCourseYaml(
      cwd,
      `  student_publish:
    enabled: true
    mode: faculty-provided
    artifact: grading-results
    source_file: reports/student.md
    destination_file: feedback/report.md
`
    );

    const result = await runDetail(cwd);

    expect(result.studentReports).toMatchObject({
      enabled: true,
      mode: "faculty-provided",
      artifact: "grading-results",
      sourceFile: "reports/student.md",
      destinationFile: "feedback/report.md"
    });
    expect(result.actions?.publishStudentReports.available).toBe(true);
  });

  it("reports applied state when a local manifest exists", async () => {
    const result = await runDetail(REPORT_FIXTURE_ROOT);

    expect(result.applyState).toEqual({ status: "applied" });
  });

  it("returns local detail plus token_required readiness when token is missing", async () => {
    const cwd = copyFixtureToTemp(VALID_ROSTER_ROOT);
    const before = listFiles(cwd);
    const originalToken = process.env.GRAIDER_GITHUB_TOKEN;

    try {
      Reflect.deleteProperty(process.env, "GRAIDER_GITHUB_TOKEN");
      const result = await runAssignmentDetailCommand({
        cwd,
        assignmentFile: ASSIGNMENT_FILE,
        options: { json: true },
        env: {}
      });

      expect(result.status).toBe("partial_success");
      expect(result.template).toMatchObject({
        status: "token_required",
        repositoryStatus: "token_required",
        branchStatus: "token_required"
      });
      expect(result.grading).toMatchObject({
        workflowStatus: "token_required",
        workflowDispatch: "token_required"
      });
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ code: "github_token_required" })
      ]);
      expect(listFiles(cwd)).toEqual(before);
    } finally {
      if (originalToken !== undefined) {
        process.env.GRAIDER_GITHUB_TOKEN = originalToken;
      }
    }
  });
});
