import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatAssignmentGradePreviewResultAsJson,
  runAssignmentGradePreviewCommand
} from "../../src/cli/commands/assignment.command.js";
import { runGradeCommand } from "../../src/cli/commands/grade.command.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { DiagnosticCode } from "../../src/diagnostics/error-catalog.js";
import type { AssignmentGradePreviewResult } from "../../src/grade-preview/grade-preview-models.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubRepository, GitHubWorkflow } from "../../src/github/github-models.js";

enum TestNumber {
  RepositoryId = 101,
  SecondRepositoryId = 102,
  WorkflowId = 202
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/grade");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ASSIGNMENT_PATH_SEGMENTS = ["terms", "27s1", "assignments", "lab04", "assignment.yml"];
const MANIFEST_FILE = "terms/27s1/manifests/lab04/manifest.yml";
const ORGANIZATION = "example-org";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const KIM_REPOSITORY = "27s1-se2030-lab04-kimstudent";
const WORKFLOW_PATH = "grade.yml";
const CUSTOM_WORKFLOW_PATH = ".github/workflows/custom-grade.yml";
const CUSTOM_WORKFLOW_IDENTIFIER = "custom-grade.yml";
const FAKE_TOKEN = "ghp_fake_grade_preview_token";
const GRADE_PREVIEW_ENV = {
  GRAIDER_GITHUB_TOKEN: FAKE_TOKEN
};
const NO_MUTATIONS = 0;
const jsonOptions = normalizeCommonCommandOptions({ json: true });
const noSleep = async () => {};

const workflow = (pathValue: string = WORKFLOW_PATH): GitHubWorkflow => ({
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

const copyFixtureToTemp = (fixtureName: string): string => {
  const sourceRoot = path.join(FIXTURE_ROOT, fixtureName);
  const destinationRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `graider-grade-preview-${fixtureName}-`)
  );

  fs.cpSync(sourceRoot, destinationRoot, { recursive: true });
  return destinationRoot;
};

const createReadyClient = (workflowPath: string = WORKFLOW_PATH): FakeGitHubClient =>
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

const runPreview = (
  fixtureName: string,
  githubClient: FakeGitHubClient | null = createReadyClient(),
  options: Parameters<typeof runAssignmentGradePreviewCommand>[0]["options"] = { json: true },
  env: Record<string, string | undefined> = GRADE_PREVIEW_ENV
): Promise<AssignmentGradePreviewResult> =>
  runAssignmentGradePreviewCommand({
    cwd: copyFixtureToTemp(fixtureName),
    assignmentFile: ASSIGNMENT_FILE,
    options,
    env,
    ...(githubClient === null ? {} : { githubClient })
  });

const expectNoMutations = (githubClient: FakeGitHubClient): void => {
  expect(githubClient.mutations.createdRepositories).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.addedCollaborators).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.removedCollaborators).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.teamPermissions).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.enabledActions).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.workflowDispatches).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.archivedRepositories).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.fileWrites).toHaveLength(NO_MUTATIONS);
};

const getRow = (
  result: AssignmentGradePreviewResult,
  studentId: string
): NonNullable<AssignmentGradePreviewResult["plan"]>["repositories"][number] => {
  const row = result.plan?.repositories.find(
    (repositoryRow) => repositoryRow.studentId === studentId
  );

  if (row === undefined) {
    throw new Error(`Missing grade preview row for ${studentId}`);
  }

  return row;
};

const addAssignmentGradingOverride = (cwd: string): void => {
  const assignmentPath = path.join(cwd, ...ASSIGNMENT_PATH_SEGMENTS);
  const original = fs.readFileSync(assignmentPath, "utf8");
  const override = `grading:
  enabled: true
  workflow: ${CUSTOM_WORKFLOW_PATH}
  artifact: override-results
  result_file: override-results.json
`;

  fs.writeFileSync(assignmentPath, `${original}${override}`, "utf8");
};

describe("graider assignment grade-preview command", () => {
  it("requires JSON output and returns the JSON-only diagnostic", async () => {
    const result = await runPreview("active-assignment", createReadyClient(), {});
    const json = JSON.parse(
      formatAssignmentGradePreviewResultAsJson(result)
    ) as AssignmentGradePreviewResult;

    expect(json.schemaVersion).toBe(1);
    expect(json.commandName).toBe("assignment grade-preview");
    expect(json.status).toBe("failure");
    expect(json.exitCode).toBe(1);
    expect(json.diagnostics).toEqual([
      expect.objectContaining({ code: "assignment_grade_preview_json_required" })
    ]);
  });

  it("returns assignment, course, term, effective course grading, targets, actions, and plan JSON", async () => {
    const githubClient = createReadyClient();
    const result = await runPreview("active-assignment", githubClient);

    expect(result).toMatchObject({
      schemaVersion: 1,
      commandName: "assignment grade-preview",
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
        title: "2027 Semester 1"
      },
      target: {
        sections: ["001", "002"],
        sectionCount: 2,
        studentCount: 4,
        activeStudentCount: 2
      },
      grading: {
        enabled: true,
        resolvedFrom: "course_default",
        mode: "custom-workflow",
        workflow: WORKFLOW_PATH,
        artifact: "grading-results",
        resultFile: "results.json",
        workflowDispatch: "available",
        workflowRef: "main"
      },
      files: {
        assignmentFile: ASSIGNMENT_FILE,
        manifestFile: MANIFEST_FILE,
        workflowFile: WORKFLOW_PATH
      },
      actions: {
        grade: {
          available: true,
          implemented: false,
          previewOnly: true
        }
      }
    });
    expect(result.plan?.summary).toEqual({
      wouldDispatch: 2,
      wouldSkip: 2,
      blocked: 0,
      unknown: 0
    });
    expect(getRow(result, "jones")).toMatchObject({
      repository: `${ORGANIZATION}/${JONES_REPOSITORY}`,
      status: "would_dispatch",
      reason: "workflow_dispatch_available",
      workflow: WORKFLOW_PATH,
      ref: "main"
    });
    expect(getRow(result, "smith")).toMatchObject({
      status: "would_skip",
      reason: "student_status_dropped"
    });
    expect(getRow(result, "lee")).toMatchObject({
      status: "would_skip",
      reason: "student_status_hold"
    });
    expect(getRow(result, "kim")).toMatchObject({
      repository: `${ORGANIZATION}/${KIM_REPOSITORY}`,
      status: "would_dispatch"
    });
    expectNoMutations(githubClient);
  });

  it("uses assignment grading override when present", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    const githubClient = createReadyClient(CUSTOM_WORKFLOW_IDENTIFIER);

    addAssignmentGradingOverride(cwd);

    const result = await runAssignmentGradePreviewCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: { json: true },
      env: GRADE_PREVIEW_ENV,
      githubClient
    });

    expect(result.status).toBe("success");
    expect(result.grading).toMatchObject({
      enabled: true,
      resolvedFrom: "assignment_override",
      workflow: CUSTOM_WORKFLOW_PATH,
      artifact: "override-results",
      resultFile: "override-results.json",
      workflowDispatch: "available"
    });
    expect(getRow(result, "jones")).toMatchObject({
      workflow: CUSTOM_WORKFLOW_PATH,
      status: "would_dispatch"
    });
    expectNoMutations(githubClient);
  });

  it("returns a no-dispatch preview when grading is disabled", async () => {
    const githubClient = createReadyClient();
    const result = await runPreview("grading-disabled", githubClient);

    expect(result.status).toBe("success");
    expect(result.grading).toMatchObject({
      enabled: false,
      resolvedFrom: "course_default",
      workflow: null,
      workflowDispatch: "not_required"
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GradingNotConfigured })
    ]);
    expect(result.plan?.summary).toEqual({
      wouldDispatch: 0,
      wouldSkip: 1,
      blocked: 0,
      unknown: 0
    });
    expect(result.actions?.grade.available).toBe(false);
    expectNoMutations(githubClient);
  });

  it("returns local target and config data when the GitHub token is missing", async () => {
    const result = await runPreview("active-assignment", null, { json: true }, {});

    expect(result.status).toBe("partial_success");
    expect(result.assignment?.slug).toBe("lab04");
    expect(result.target).toMatchObject({
      studentCount: 4,
      activeStudentCount: 2
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GithubTokenRequired })
    ]);
    expect(getRow(result, "jones")).toMatchObject({
      repository: `${ORGANIZATION}/${JONES_REPOSITORY}`,
      status: "token_required",
      reason: "token_required"
    });
    expect(result.plan?.summary).toEqual({
      wouldDispatch: 0,
      wouldSkip: 2,
      blocked: 0,
      unknown: 2
    });
    expect(result.actions?.grade.available).toBe(false);
  });

  it("blocks missing repositories and workflows without dispatching", async () => {
    const missingRepositoryClient = new FakeGitHubClient({
      repositories: [repository(KIM_REPOSITORY, TestNumber.SecondRepositoryId)],
      workflows: [{ owner: ORGANIZATION, repo: KIM_REPOSITORY, workflow: workflow() }]
    });
    const missingWorkflowClient = new FakeGitHubClient({
      repositories: [
        repository(JONES_REPOSITORY),
        repository(KIM_REPOSITORY, TestNumber.SecondRepositoryId)
      ]
    });

    const missingRepositoryResult = await runPreview("active-assignment", missingRepositoryClient);
    const missingWorkflowResult = await runPreview("active-assignment", missingWorkflowClient);

    expect(getRow(missingRepositoryResult, "jones")).toMatchObject({
      status: "blocked",
      reason: DiagnosticCode.StudentRepositoryMissing
    });
    expect(missingRepositoryResult.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.StudentRepositoryMissing })
    ]);
    expect(getRow(missingWorkflowResult, "jones")).toMatchObject({
      status: "blocked",
      reason: DiagnosticCode.GradingWorkflowMissing
    });
    expect(missingWorkflowResult.grading?.workflowDispatch).toBe("missing");
    expect(missingWorkflowResult.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GradingWorkflowMissing }),
      expect.objectContaining({ code: DiagnosticCode.GradingWorkflowMissing })
    ]);
    expectNoMutations(missingRepositoryClient);
    expectNoMutations(missingWorkflowClient);
  });

  it("reports inaccessible repository checks as unknown with safe diagnostics", async () => {
    const githubClient = createReadyClient();

    githubClient.failNext("getRepository", "permission_denied");

    const result = await runPreview("active-assignment", githubClient);
    const serialized = JSON.stringify(result);

    expect(result.status).toBe("partial_success");
    expect(getRow(result, "jones")).toMatchObject({
      status: "unknown",
      reason: DiagnosticCode.StudentRepositoryStatusUnknown
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GithubPermissionDenied })
    ]);
    expect(serialized).not.toContain(FAKE_TOKEN);
    expect(serialized.toLowerCase()).not.toContain("authorization");
    expectNoMutations(githubClient);
  });

  it("returns failure JSON for a missing assignment file", async () => {
    const result = await runAssignmentGradePreviewCommand({
      cwd: copyFixtureToTemp("active-assignment"),
      assignmentFile: "terms/27s1/assignments/missing/assignment.yml",
      options: { json: true },
      env: GRADE_PREVIEW_ENV,
      githubClient: createReadyClient()
    });

    expect(result.status).toBe("failure");
    expect(result.assignment).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.MissingRequiredFile })
    ]);
  });

  it("does not write local manifest state and legacy grade still dispatches", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    const manifestPath = path.join(cwd, MANIFEST_FILE);
    const manifestBefore = fs.readFileSync(manifestPath, "utf8");
    const previewClient = createReadyClient();
    const gradeClient = createReadyClient();
    const preview = await runAssignmentGradePreviewCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: { json: true },
      env: GRADE_PREVIEW_ENV,
      githubClient: previewClient
    });
    const grade = await runGradeCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      targetSelector: { studentId: "jones" },
      githubClient: gradeClient,
      retryOptions: { sleep: noSleep }
    });

    expect(preview.status).toBe("success");
    expect(fs.readFileSync(manifestPath, "utf8")).toBe(manifestBefore);
    expectNoMutations(previewClient);
    expect(grade.status).toBe("success");
    expect(gradeClient.mutations.workflowDispatches).toEqual([
      expect.objectContaining({ repo: JONES_REPOSITORY })
    ]);
  });
});
