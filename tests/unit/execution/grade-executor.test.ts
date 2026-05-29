import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";
import { DiagnosticCode } from "../../../src/diagnostics/error-catalog.js";
import { executeGrade } from "../../../src/execution/grade-executor.js";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import type { GitHubRepository, GitHubWorkflow } from "../../../src/github/github-models.js";
import { loadManifest } from "../../../src/manifest/manifest-loader.js";
import { createManifestPath } from "../../../src/manifest/manifest-paths.js";
import { loadAssignmentRosters } from "../../../src/roster/roster-loader.js";

enum GradeExecutorTestNumber {
  RepositoryId = 101,
  WorkflowId = 202
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/grade/active-assignment");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const KIM_REPOSITORY = "27s1-se2030-lab04-kimstudent";

const workflow: GitHubWorkflow = {
  id: GradeExecutorTestNumber.WorkflowId,
  path: "grade.yml",
  name: "Grade",
  supportsDispatch: true
};

const createRepository = (name: string): GitHubRepository => ({
  owner: ORGANIZATION,
  name,
  fullName: `${ORGANIZATION}/${name}`,
  id: GradeExecutorTestNumber.RepositoryId,
  private: true,
  archived: false,
  defaultBranch: "main",
  htmlUrl: `https://github.com/${ORGANIZATION}/${name}`
});

const loadExecutionInput = () => {
  const configResult = loadGraiderConfig({ cwd: FIXTURE_ROOT, assignmentFile: ASSIGNMENT_FILE });

  if (configResult.status === "failure") {
    throw new Error("Fixture config failed to load.");
  }

  const rosterResult = loadAssignmentRosters(configResult.config);
  const manifestPath = createManifestPath(
    configResult.config.summary.repoRoot,
    configResult.config.summary.termCode,
    configResult.config.summary.assignmentSlug
  );
  const manifestResult = loadManifest(manifestPath.absolutePath, { required: true });

  if (manifestResult.status !== "loaded") {
    throw new Error("Fixture manifest failed to load.");
  }

  return {
    config: configResult.config,
    manifest: manifestResult.manifest,
    students: rosterResult.students
  };
};

const createReadyClient = (): FakeGitHubClient =>
  new FakeGitHubClient({
    repositories: [createRepository(JONES_REPOSITORY), createRepository(KIM_REPOSITORY)],
    workflows: [
      { owner: ORGANIZATION, repo: JONES_REPOSITORY, workflow },
      { owner: ORGANIZATION, repo: KIM_REPOSITORY, workflow }
    ]
  });

const firstStudent = (input: ReturnType<typeof loadExecutionInput>) => {
  const student = input.students[0];

  if (student === undefined) {
    throw new Error("Expected fixture to include at least one student.");
  }

  return student;
};

describe("grade executor", () => {
  it("dispatches workflow for each selected target", async () => {
    const input = loadExecutionInput();
    const githubClient = createReadyClient();
    const result = await executeGrade({
      ...input,
      targetStudents: input.students.filter((student) => student.status === "active"),
      githubClient
    });

    expect(result.errors).toEqual([]);
    expect(result.summary.dispatchSucceeded).toBe(2);
    expect(githubClient.mutations.workflowDispatches.map((dispatch) => dispatch.repo)).toEqual([
      JONES_REPOSITORY,
      KIM_REPOSITORY
    ]);
  });

  it("reports missing workflow with canonical diagnostic", async () => {
    const input = loadExecutionInput();
    const result = await executeGrade({
      ...input,
      targetStudents: [firstStudent(input)],
      githubClient: new FakeGitHubClient({
        repositories: [createRepository(JONES_REPOSITORY)]
      })
    });

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GradingWorkflowMissing })
    ]);
  });

  it("reports unsupported workflow dispatch", async () => {
    const input = loadExecutionInput();
    const result = await executeGrade({
      ...input,
      targetStudents: [firstStudent(input)],
      githubClient: new FakeGitHubClient({
        repositories: [createRepository(JONES_REPOSITORY)],
        workflows: [
          {
            owner: ORGANIZATION,
            repo: JONES_REPOSITORY,
            workflow: { ...workflow, supportsDispatch: false }
          }
        ]
      })
    });

    expect(result.errors).toEqual([
      expect.objectContaining({ code: DiagnosticCode.WorkflowDispatchMissing })
    ]);
  });
});
