import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  runAssignmentGradeCommand,
  type AssignmentGradeCommandRequest
} from "../../src/cli/commands/assignment.command.js";
import { runGradeCommand } from "../../src/cli/commands/grade.command.js";
import { formatCommandResultAsJson } from "../../src/cli/output.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { DiagnosticCode } from "../../src/diagnostics/error-catalog.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubRepository, GitHubWorkflow } from "../../src/github/github-models.js";

enum TestNumber {
  RepositoryId = 101,
  SecondRepositoryId = 102,
  WorkflowId = 202
}

const GRADE_FIXTURE_ROOT = path.resolve("tests/fixtures/grade");
const CONFIG_FIXTURE_ROOT = path.resolve("tests/fixtures/config");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ASSIGNMENT_PATH_SEGMENTS = ["terms", "27s1", "assignments", "lab04", "assignment.yml"];
const ORGANIZATION = "example-org";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const KIM_REPOSITORY = "27s1-se2030-lab04-kimstudent";
const DEFAULT_WORKFLOW = "grade.yml";
const CUSTOM_WORKFLOW = ".github/workflows/custom-grade.yml";
const CUSTOM_WORKFLOW_IDENTIFIER = "custom-grade.yml";
const jsonOptions = normalizeCommonCommandOptions({ json: true });
const noSleep = async () => {};

const workflow = (pathValue: string = DEFAULT_WORKFLOW): GitHubWorkflow => ({
  id: TestNumber.WorkflowId,
  path: pathValue,
  name: "Grade",
  supportsDispatch: true
});

const repository = (name: string, id: number = TestNumber.RepositoryId): GitHubRepository => ({
  owner: ORGANIZATION,
  name,
  fullName: `${ORGANIZATION}/${name}`,
  id,
  private: true,
  archived: false,
  defaultBranch: "main",
  htmlUrl: `https://github.com/${ORGANIZATION}/${name}`
});

const createReadyClient = (workflowPath: string = DEFAULT_WORKFLOW): FakeGitHubClient =>
  new FakeGitHubClient({
    repositories: [
      repository(JONES_REPOSITORY),
      repository(KIM_REPOSITORY, TestNumber.SecondRepositoryId)
    ],
    workflows: [
      { owner: ORGANIZATION, repo: JONES_REPOSITORY, workflow: workflow(workflowPath) },
      { owner: ORGANIZATION, repo: KIM_REPOSITORY, workflow: workflow(workflowPath) }
    ]
  });

const copyFixtureToTemp = (fixtureRoot: string, fixtureName: string): string => {
  const destinationRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `graider-assignment-grade-${fixtureName}-`)
  );

  fs.cpSync(path.join(fixtureRoot, fixtureName), destinationRoot, { recursive: true });
  return destinationRoot;
};

const addAssignmentGradingOverride = (cwd: string): void => {
  const assignmentPath = path.join(cwd, ...ASSIGNMENT_PATH_SEGMENTS);
  const original = fs.readFileSync(assignmentPath, "utf8");
  const override = `grading:
  enabled: true
  workflow: ${CUSTOM_WORKFLOW}
  artifact: override-results
  result_file: override-results.json
`;

  fs.writeFileSync(assignmentPath, `${original}${override}`, "utf8");
};

interface AssignmentGradeTestRequest {
  readonly assignmentFile?: string;
  readonly options?: AssignmentGradeCommandRequest["options"];
  readonly targetSelector?: AssignmentGradeCommandRequest["targetSelector"];
  readonly githubClient?: FakeGitHubClient;
}

const runAssignmentGrade = (cwd: string, request: AssignmentGradeTestRequest = {}) => {
  const githubClient = request.githubClient ?? createReadyClient();

  return {
    githubClient,
    result: runAssignmentGradeCommand({
      cwd,
      assignmentFile: request.assignmentFile ?? ASSIGNMENT_FILE,
      options: request.options ?? jsonOptions,
      targetSelector: request.targetSelector ?? { studentId: "jones" },
      githubClient,
      retryOptions: { sleep: noSleep }
    })
  };
};

const runLegacyGrade = (cwd: string, githubClient: FakeGitHubClient = createReadyClient()) => ({
  githubClient,
  result: runGradeCommand({
    cwd,
    assignmentFile: ASSIGNMENT_FILE,
    options: jsonOptions,
    targetSelector: { studentId: "jones" },
    githubClient,
    retryOptions: { sleep: noSleep }
  })
});

describe("graider assignment grade command", () => {
  it("accepts the canonical route and returns assignment grade JSON", async () => {
    const cwd = copyFixtureToTemp(GRADE_FIXTURE_ROOT, "active-assignment");
    const { result, githubClient } = runAssignmentGrade(cwd);
    const resolved = await result;
    const json = JSON.parse(formatCommandResultAsJson(resolved)) as {
      commandName: string;
      summary: { dispatchSucceeded: number; gradingSource: string };
    };

    expect(resolved.status).toBe("success");
    expect(json.commandName).toBe("assignment grade");
    expect(json.summary.dispatchSucceeded).toBe(1);
    expect(json.summary.gradingSource).toBe("course");
    expect(githubClient.mutations.workflowDispatches).toEqual([
      expect.objectContaining({
        owner: ORGANIZATION,
        repo: JONES_REPOSITORY,
        workflowPath: DEFAULT_WORKFLOW,
        ref: "main"
      })
    ]);
  });

  it("routes to the same grade implementation behavior as legacy grade", async () => {
    const nestedCwd = copyFixtureToTemp(GRADE_FIXTURE_ROOT, "active-assignment");
    const legacyCwd = copyFixtureToTemp(GRADE_FIXTURE_ROOT, "active-assignment");
    const nested = runAssignmentGrade(nestedCwd);
    const legacy = runLegacyGrade(legacyCwd);
    const nestedResult = await nested.result;
    const legacyResult = await legacy.result;

    expect(nestedResult).toMatchObject({
      status: legacyResult.status,
      exitCode: legacyResult.exitCode,
      warnings: legacyResult.warnings,
      errors: legacyResult.errors,
      generatedFiles: legacyResult.generatedFiles
    });
    expect(nestedResult.commandName).toBe("assignment grade");
    expect(legacyResult.commandName).toBe("grade");
    expect(nestedResult.summary).toMatchObject({
      ...legacyResult.summary,
      repoRoot: nestedCwd
    });
    expect(nested.githubClient.mutations.workflowDispatches).toEqual(
      legacy.githubClient.mutations.workflowDispatches
    );
  });

  it("uses course default grading when assignment has no override", async () => {
    const cwd = copyFixtureToTemp(GRADE_FIXTURE_ROOT, "active-assignment");
    const { result } = runAssignmentGrade(cwd);
    const resolved = await result;

    expect(resolved.summary.gradingSource).toBe("course");
    expect(resolved.summary.gradingEnabled).toBe(true);
    expect(resolved.summary.dispatchSucceeded).toBe(1);
  });

  it("uses assignment grading override when present", async () => {
    const cwd = copyFixtureToTemp(GRADE_FIXTURE_ROOT, "active-assignment");
    const githubClient = createReadyClient(CUSTOM_WORKFLOW_IDENTIFIER);

    addAssignmentGradingOverride(cwd);

    const { result } = runAssignmentGrade(cwd, { githubClient });
    const resolved = await result;

    expect(resolved.status).toBe("success");
    expect(resolved.summary.gradingSource).toBe("assignment");
    expect(githubClient.mutations.workflowDispatches).toEqual([
      expect.objectContaining({
        repo: JONES_REPOSITORY,
        workflowPath: CUSTOM_WORKFLOW_IDENTIFIER
      })
    ]);
  });

  it("missing assignment file behavior matches legacy grade", async () => {
    const nestedCwd = copyFixtureToTemp(GRADE_FIXTURE_ROOT, "active-assignment");
    const legacyCwd = copyFixtureToTemp(GRADE_FIXTURE_ROOT, "active-assignment");
    const missingAssignment = "terms/27s1/assignments/missing/assignment.yml";
    const nested = await runAssignmentGradeCommand({
      cwd: nestedCwd,
      assignmentFile: missingAssignment,
      options: jsonOptions,
      targetSelector: { studentId: "jones" },
      githubClient: createReadyClient(),
      retryOptions: { sleep: noSleep }
    });
    const legacy = await runGradeCommand({
      cwd: legacyCwd,
      assignmentFile: missingAssignment,
      options: jsonOptions,
      targetSelector: { studentId: "jones" },
      githubClient: createReadyClient(),
      retryOptions: { sleep: noSleep }
    });

    expect(nested.commandName).toBe("assignment grade");
    expect(nested).toMatchObject({
      status: legacy.status,
      exitCode: legacy.exitCode,
      assignmentFile: legacy.assignmentFile
    });
    expect(nested.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.MissingRequiredFile })
    ]);
    expect(legacy.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.MissingRequiredFile })
    ]);
    expect(nested.summary).toEqual(legacy.summary);
  });

  it("invalid assignment behavior matches legacy grade", async () => {
    const nestedCwd = copyFixtureToTemp(CONFIG_FIXTURE_ROOT, "missing-assignment-field");
    const legacyCwd = copyFixtureToTemp(CONFIG_FIXTURE_ROOT, "missing-assignment-field");
    const nested = await runAssignmentGradeCommand({
      cwd: nestedCwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      targetSelector: { studentId: "jones" },
      githubClient: createReadyClient(),
      retryOptions: { sleep: noSleep }
    });
    const legacy = await runGradeCommand({
      cwd: legacyCwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      targetSelector: { studentId: "jones" },
      githubClient: createReadyClient(),
      retryOptions: { sleep: noSleep }
    });

    expect(nested.commandName).toBe("assignment grade");
    expect(nested).toMatchObject({
      status: legacy.status,
      exitCode: legacy.exitCode
    });
    expect(nested.errors.map((diagnostic) => diagnostic.code)).toEqual(
      legacy.errors.map((diagnostic) => diagnostic.code)
    );
    expect(nested.summary).toEqual(legacy.summary);
  });

  it("missing token or auth behavior matches legacy grade", async () => {
    const nestedCwd = copyFixtureToTemp(GRADE_FIXTURE_ROOT, "active-assignment");
    const legacyCwd = copyFixtureToTemp(GRADE_FIXTURE_ROOT, "active-assignment");
    const nestedClient = createReadyClient();
    const legacyClient = createReadyClient();

    nestedClient.failNext("getWorkflow", "auth_missing");
    legacyClient.failNext("getWorkflow", "auth_missing");

    const nested = await runAssignmentGrade(nestedCwd, { githubClient: nestedClient }).result;
    const legacy = await runLegacyGrade(legacyCwd, legacyClient).result;

    expect(nested.commandName).toBe("assignment grade");
    expect(nested).toMatchObject({
      status: legacy.status,
      exitCode: legacy.exitCode
    });
    expect(nested.errors.map((diagnostic) => diagnostic.code)).toEqual(
      legacy.errors.map((diagnostic) => diagnostic.code)
    );
    expect(nested.summary).toMatchObject({
      ...legacy.summary,
      repoRoot: nestedCwd
    });
    expect(nested.exitCode).toBe(ExitCode.AuthenticationOrAuthorizationFailure);
  });

  it("preserves legacy graider grade behavior", async () => {
    const cwd = copyFixtureToTemp(GRADE_FIXTURE_ROOT, "active-assignment");
    const legacy = await runLegacyGrade(cwd).result;
    const json = JSON.parse(formatCommandResultAsJson(legacy)) as { commandName: string };

    expect(legacy.status).toBe("success");
    expect(json.commandName).toBe("grade");
  });
});
