import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runApplyCommand } from "../../src/cli/commands/apply.command.js";
import { runGradeCommand } from "../../src/cli/commands/grade.command.js";
import { runReportCommand } from "../../src/cli/commands/report.command.js";
import { runValidateCommand } from "../../src/cli/commands/validate.command.js";
import { runWorkflowGenerateCommand } from "../../src/cli/commands/workflow.command.js";
import { formatCommandResultAsJson } from "../../src/cli/output.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { DiagnosticCode } from "../../src/diagnostics/error-catalog.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type {
  DownloadedArtifact,
  GitHubRepository,
  GitHubTemplateRepository,
  GitHubWorkflow,
  GitHubWorkflowRun
} from "../../src/github/github-models.js";

enum ContractTestNumber {
  TemplateRepositoryId = 101,
  RepositoryId = 202,
  SecondRepositoryId = 203,
  WorkflowId = 303,
  WorkflowRunId = 404
}

const CONTRACT_SCHEMA_VERSION = 1;
const EMPTY_COUNT = 0;
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const TEMPLATE_REPOSITORY_NAME = "lab04-template";
const TEMPLATE_BRANCH = "main";
const README_FILE = "README.md";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const SMITH_REPOSITORY = "27s1-se2030-lab04-janesmith";
const KIM_REPOSITORY = "27s1-se2030-lab04-kimstudent";
const TOKEN_VALUE = "ghp_jsoncontracttoken1234567890";
const RAW_ARTIFACT_CONTENT = "RAW ARTIFACT CONTENT SHOULD NOT APPEAR";
const FACULTY_REPORT_CONTENT = "# Private Faculty Summary";
const REPORT_TIMESTAMP = "2026-09-01T15:30:00.000Z";
const APPLY_TIMESTAMP = "2026-09-01T14:30:00.000Z";
const DEFAULT_WORKFLOW_FILE = "terms/27s1/generated-workflows/lab04/grade.yml";
const COURSE_GRADING_BLOCK = `grading:
  enabled: true
  workflow: grade.yml
  artifact: grading-results
  result_file: results.json
`;
const PRESET_GRADING_BLOCK = `grading:
  enabled: true
  mode: preset
  preset: java-junit-checkstyle
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
`;
const SECRET_MARKERS = [
  TOKEN_VALUE,
  "GRAIDER_GITHUB_TOKEN",
  "Authorization:",
  RAW_ARTIFACT_CONTENT,
  FACULTY_REPORT_CONTENT,
  "Stack trace"
] as const;

interface JsonDiagnostic {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
}

interface JsonCommandContract {
  readonly schemaVersion: number;
  readonly commandName: string;
  readonly status: string;
  readonly exitCode: number;
  readonly diagnostics: JsonDiagnostic[];
  readonly warnings: JsonDiagnostic[];
  readonly errors: JsonDiagnostic[];
  readonly generatedFiles: string[];
  readonly summary: Record<string, unknown>;
}

const jsonOptions = normalizeCommonCommandOptions({ json: true });
const yesJsonOptions = normalizeCommonCommandOptions({ json: true, yes: true });
const fixedApplyClock = {
  now: () => new Date(APPLY_TIMESTAMP)
};
const fixedReportClock = {
  now: () => new Date(REPORT_TIMESTAMP)
};

const copyFixtureToTemp = (fixtureRoot: string, fixtureName: string, prefix: string): string => {
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  fs.cpSync(path.join(fixtureRoot, fixtureName), destinationRoot, { recursive: true });
  return destinationRoot;
};

const parseJsonOutput = (output: string): JsonCommandContract =>
  JSON.parse(output) as JsonCommandContract;

const formatAndParse = (result: Parameters<typeof formatCommandResultAsJson>[0]) =>
  parseJsonOutput(formatCommandResultAsJson(result));

const createRepository = (
  name: string,
  id: number = ContractTestNumber.RepositoryId
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

const templateRepository: GitHubTemplateRepository = {
  owner: ORGANIZATION,
  name: TEMPLATE_REPOSITORY_NAME,
  fullName: `${ORGANIZATION}/${TEMPLATE_REPOSITORY_NAME}`,
  id: ContractTestNumber.TemplateRepositoryId,
  private: true,
  archived: false,
  defaultBranch: TEMPLATE_BRANCH,
  htmlUrl: `https://github.com/${ORGANIZATION}/${TEMPLATE_REPOSITORY_NAME}`,
  isTemplate: true,
  branches: [TEMPLATE_BRANCH],
  files: [README_FILE],
  latestCommitSha: "template-sha"
};

const gradingWorkflow: GitHubWorkflow = {
  id: ContractTestNumber.WorkflowId,
  path: "grade.yml",
  name: "Grade",
  supportsDispatch: true
};

const workflowRun: GitHubWorkflowRun = {
  id: ContractTestNumber.WorkflowRunId,
  workflowPath: "grade.yml",
  status: "completed",
  conclusion: "success",
  headSha: "commit-sha",
  createdAt: "2026-09-01T15:00:00.000Z",
  updatedAt: "2026-09-01T15:02:00.000Z"
};

const passedResult = JSON.stringify({
  schema_version: CONTRACT_SCHEMA_VERSION,
  status: "passed",
  checks: [
    {
      name: "Unit Tests",
      status: "passed"
    }
  ]
});

const createArtifact = (content: string = passedResult): DownloadedArtifact => ({
  name: "grading-results",
  files: {
    "results.json": content,
    "raw.log": RAW_ARTIFACT_CONTENT
  }
});

const createReadinessClient = (): FakeGitHubClient =>
  new FakeGitHubClient({
    templateRepositories: [templateRepository],
    users: ["seanjones", "janesmith", "alexlee", "mayapatel", "kimstudent"].map((username) => ({
      username
    })),
    teams: [
      { org: ORGANIZATION, slug: "faculty", name: "Faculty" },
      { org: ORGANIZATION, slug: "graders", name: "Graders" }
    ],
    workflows: [
      { owner: ORGANIZATION, repo: JONES_REPOSITORY, workflow: gradingWorkflow },
      { owner: ORGANIZATION, repo: SMITH_REPOSITORY, workflow: gradingWorkflow },
      { owner: ORGANIZATION, repo: KIM_REPOSITORY, workflow: gradingWorkflow }
    ]
  });

const createGradeClient = (): FakeGitHubClient =>
  new FakeGitHubClient({
    repositories: [
      createRepository(JONES_REPOSITORY),
      createRepository(KIM_REPOSITORY, ContractTestNumber.SecondRepositoryId)
    ],
    workflows: [
      { owner: ORGANIZATION, repo: JONES_REPOSITORY, workflow: gradingWorkflow },
      { owner: ORGANIZATION, repo: KIM_REPOSITORY, workflow: gradingWorkflow }
    ]
  });

const createReportClient = (artifact: DownloadedArtifact | null = createArtifact()) =>
  new FakeGitHubClient({
    repositories: [
      createRepository(JONES_REPOSITORY),
      createRepository(SMITH_REPOSITORY, ContractTestNumber.SecondRepositoryId)
    ],
    workflows: [
      { owner: ORGANIZATION, repo: JONES_REPOSITORY, workflow: gradingWorkflow },
      { owner: ORGANIZATION, repo: SMITH_REPOSITORY, workflow: gradingWorkflow }
    ],
    workflowRuns: [
      { owner: ORGANIZATION, repo: JONES_REPOSITORY, run: workflowRun },
      { owner: ORGANIZATION, repo: SMITH_REPOSITORY, run: workflowRun }
    ],
    artifacts:
      artifact === null
        ? []
        : [
            {
              owner: ORGANIZATION,
              repo: JONES_REPOSITORY,
              runId: ContractTestNumber.WorkflowRunId,
              artifact
            },
            {
              owner: ORGANIZATION,
              repo: SMITH_REPOSITORY,
              runId: ContractTestNumber.WorkflowRunId,
              artifact
            }
          ]
  });

const expectTopLevelContract = (json: JsonCommandContract): void => {
  expect(json.schemaVersion).toBe(CONTRACT_SCHEMA_VERSION);
  expect(typeof json.commandName).toBe("string");
  expect(typeof json.status).toBe("string");
  expect(typeof json.exitCode).toBe("number");
  expect(Array.isArray(json.diagnostics)).toBe(true);
  expect(Array.isArray(json.warnings)).toBe(true);
  expect(Array.isArray(json.errors)).toBe(true);
  expect(Array.isArray(json.generatedFiles)).toBe(true);
  expect(typeof json.summary).toBe("object");
};

const expectDiagnosticsShape = (diagnostics: readonly JsonDiagnostic[]): void => {
  for (const diagnostic of diagnostics) {
    expect(typeof diagnostic.code).toBe("string");
    expect(["error", "warning", "info"]).toContain(diagnostic.severity);
    expect(typeof diagnostic.message).toBe("string");
  }
};

const expectSafeJsonOutput = (output: string): void => {
  for (const marker of SECRET_MARKERS) {
    expect(output).not.toContain(marker);
  }
};

const replaceCourseGrading = (cwd: string, gradingBlock: string): void => {
  const coursePath = path.join(cwd, "course.yml");
  const content = fs.readFileSync(coursePath, "utf8");

  fs.writeFileSync(coursePath, content.replace(COURSE_GRADING_BLOCK, gradingBlock));
};

const runWorkflowGenerateJson = (cwd: string) =>
  runWorkflowGenerateCommand({
    cwd,
    assignmentFile: ASSIGNMENT_FILE,
    options: jsonOptions,
    force: false
  });

describe("CLI JSON output contract", () => {
  it("validate --json success uses the stable top-level contract", async () => {
    const cwd = path.resolve("tests/fixtures/roster/valid-course");
    const result = await runValidateCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      githubClient: createReadinessClient()
    });
    const output = formatCommandResultAsJson(result);
    const json = parseJsonOutput(output);

    expectTopLevelContract(json);
    expect(json.commandName).toBe("validate");
    expect(json.status).toBe("success");
    expect(json.exitCode).toBe(ExitCode.Success);
    expect(json.diagnostics).toEqual([]);
    expect(json.summary.assignmentSlug).toBe("lab04");
    expect(json.summary.workflowCompatibilityChecked).toBe(true);
    expectSafeJsonOutput(output);
  });

  it("validate --json diagnostics use code, severity, and message", async () => {
    const cwd = path.resolve("tests/fixtures/roster/missing-column");
    const result = await runValidateCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      githubClient: createReadinessClient()
    });
    const json = formatAndParse(result);

    expectTopLevelContract(json);
    expect(json.status).toBe("failure");
    expect(json.exitCode).toBe(ExitCode.CommandError);
    expectDiagnosticsShape(json.diagnostics);
    expect(json.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DiagnosticCode.MissingRequiredColumn })
      ])
    );
  });

  it("apply --json success exposes generated manifest and operation summary", async () => {
    const cwd = copyFixtureToTemp(
      "tests/fixtures/apply",
      "grading-disabled",
      "graider-json-apply-"
    );
    const result = await runApplyCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesJsonOptions,
      githubClient: createReadinessClient(),
      clock: fixedApplyClock,
      retryOptions: { sleep: async () => {} }
    });
    const json = formatAndParse(result);

    expectTopLevelContract(json);
    expect(json.commandName).toBe("apply");
    expect(json.status).toBe("success");
    expect(json.generatedFiles).toContain(json.summary.manifestFile);
    expect(typeof json.summary.created).toBe("number");
    expect(json.summary.assignmentSlug).toBe("lab04");
  });

  it("grade --json dispatch success and no-grading no-op use stable summary fields", async () => {
    const activeCwd = copyFixtureToTemp(
      "tests/fixtures/grade",
      "active-assignment",
      "graider-json-grade-"
    );
    const active = await runGradeCommand({
      cwd: activeCwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      targetSelector: { studentId: "jones" },
      githubClient: createGradeClient(),
      retryOptions: { sleep: async () => {} }
    });
    const disabledCwd = copyFixtureToTemp(
      "tests/fixtures/grade",
      "grading-disabled",
      "graider-json-grade-disabled-"
    );
    const disabled = await runGradeCommand({
      cwd: disabledCwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      targetSelector: { all: true },
      githubClient: createGradeClient(),
      retryOptions: { sleep: async () => {} }
    });
    const activeJson = formatAndParse(active);
    const disabledJson = formatAndParse(disabled);

    expectTopLevelContract(activeJson);
    expect(activeJson.summary.dispatchAttempted).toBe(1);
    expect(activeJson.summary.dispatchSucceeded).toBe(1);
    expectTopLevelContract(disabledJson);
    expect(disabledJson.status).toBe("success");
    expect(disabledJson.summary.gradingEnabled).toBe(false);
    expect(disabledJson.summary.workflowDispatchAttempted).toBe(false);
    expect(disabledJson.summary.resultStatus).toBe("not_configured");
    expect(disabledJson.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DiagnosticCode.GradingNotConfigured })
      ])
    );
  });

  it("report --json exposes report files and aggregate grading counts", async () => {
    const cwd = copyFixtureToTemp("tests/fixtures/report", "valid-results", "graider-json-report-");
    const result = await runReportCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      githubClient: createReportClient(),
      clock: fixedReportClock
    });
    const json = formatAndParse(result);

    expectTopLevelContract(json);
    expect(json.commandName).toBe("report");
    expect(json.generatedFiles).toEqual(
      expect.arrayContaining(["terms/27s1/reports/lab04/faculty-summary.json"])
    );
    expect(json.summary.passedCount).toBeGreaterThan(EMPTY_COUNT);
    expect(json.summary.failedCount).toBeGreaterThanOrEqual(EMPTY_COUNT);
    expectSafeJsonOutput(formatCommandResultAsJson(result));
  });

  it("report --json missing artifact uses diagnostics without raw artifact content", async () => {
    const cwd = copyFixtureToTemp(
      "tests/fixtures/report",
      "valid-results",
      "graider-json-report-missing-"
    );
    const result = await runReportCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      githubClient: createReportClient(null),
      clock: fixedReportClock
    });
    const output = formatCommandResultAsJson(result);
    const json = parseJsonOutput(output);

    expectTopLevelContract(json);
    expect(json.summary.missingArtifactCount).toBeGreaterThan(EMPTY_COUNT);
    expectSafeJsonOutput(output);
  });

  it("report --publish-student-reports --json exposes publish counts", async () => {
    const cwd = copyFixtureToTemp(
      "tests/fixtures/report",
      "publish-success",
      "graider-json-publish-"
    );
    const result = await runReportCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: yesJsonOptions,
      githubClient: createReportClient(),
      clock: fixedReportClock,
      publishStudentReports: true
    });
    const json = formatAndParse(result);

    expectTopLevelContract(json);
    expect(json.summary.publishStudentReports).toBe(true);
    expect(json.summary.studentsPublished).toBeGreaterThan(EMPTY_COUNT);
    expect(json.summary.publishFailed).toBe(EMPTY_COUNT);
  });

  it("workflow generate --json success and no-grading failure use stable fields", () => {
    const successCwd = copyFixtureToTemp(
      "tests/fixtures/config",
      "valid-course",
      "graider-json-workflow-"
    );
    replaceCourseGrading(successCwd, PRESET_GRADING_BLOCK);
    const success = runWorkflowGenerateJson(successCwd);
    const disabledCwd = copyFixtureToTemp(
      "tests/fixtures/config",
      "valid-course",
      "graider-json-workflow-disabled-"
    );
    fs.appendFileSync(
      path.join(disabledCwd, ASSIGNMENT_FILE),
      `
grading:
  enabled: false
`
    );
    const disabled = runWorkflowGenerateJson(disabledCwd);
    const successJson = formatAndParse(success);
    const disabledJson = formatAndParse(disabled);

    expectTopLevelContract(successJson);
    expect(successJson.commandName).toBe("workflow generate");
    expect(successJson.generatedFiles).toEqual([DEFAULT_WORKFLOW_FILE]);
    expect(successJson.summary.preset).toBe("java-junit-checkstyle");
    expectTopLevelContract(disabledJson);
    expect(disabledJson.status).toBe("failure");
    expect(disabledJson.generatedFiles).toEqual([]);
    expect(disabledJson.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DiagnosticCode.WorkflowGenerationNotConfigured })
      ])
    );
  });
});
