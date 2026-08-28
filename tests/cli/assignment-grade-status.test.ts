import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatAssignmentGradeStatusResultAsJson,
  runAssignmentGradeStatusCommand
} from "../../src/cli/commands/assignment.command.js";
import { DiagnosticCode } from "../../src/diagnostics/error-catalog.js";
import type { AssignmentGradeStatusResult } from "../../src/grade-status/grade-status-models.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubRepository, GitHubWorkflowRun } from "../../src/github/github-models.js";
import { renderManifestV2Yaml } from "../../src/manifest/manifest-v2-renderer.js";

enum TestNumber {
  JonesRepositoryId = 101,
  KimRepositoryId = 104,
  JonesRunId = 301,
  KimRunId = 302
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/grade");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ASSIGNMENT_PATH_SEGMENTS = ["terms", "27s1", "assignments", "lab04", "assignment.yml"];
const MANIFEST_FILE = "terms/27s1/manifests/lab04/manifest.yml";
const ORGANIZATION = "example-org";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const KIM_REPOSITORY = "27s1-se2030-lab04-kimstudent";
const GROUP_REPOSITORY = "27s1-se2030-lab04-team-1";
const DEFAULT_WORKFLOW = "grade.yml";
const CUSTOM_WORKFLOW = ".github/workflows/custom-grade.yml";
const CUSTOM_WORKFLOW_IDENTIFIER = "custom-grade.yml";
const FAKE_TOKEN = "ghp_fake_grade_status_token";
const GRADE_STATUS_ENV = {
  GRAIDER_GITHUB_TOKEN: FAKE_TOKEN
};
const NO_MUTATIONS = 0;
const jsonOptions = { json: true };

const repository = (name: string, id: number): GitHubRepository => ({
  owner: ORGANIZATION,
  name,
  fullName: `${ORGANIZATION}/${name}`,
  id,
  private: true,
  archived: false,
  defaultBranch: "main",
  htmlUrl: `https://github.com/${ORGANIZATION}/${name}`
});

const run = (
  repo: string,
  id: number,
  status: GitHubWorkflowRun["status"],
  conclusion: GitHubWorkflowRun["conclusion"],
  workflowPath: string = DEFAULT_WORKFLOW
): GitHubWorkflowRun => ({
  id,
  workflowPath,
  status,
  conclusion,
  headSha: `head-${String(id)}`,
  createdAt: "2026-06-12T10:00:00.000Z",
  updatedAt: "2026-06-12T10:05:00.000Z",
  runUrl: `https://github.com/${ORGANIZATION}/${repo}/actions/runs/${String(id)}`,
  event: "workflow_dispatch",
  startedAt: "2026-06-12T10:01:00.000Z",
  ...(status === "completed" ? { completedAt: "2026-06-12T10:05:00.000Z" } : {})
});

const copyFixtureToTemp = (fixtureName: string): string => {
  const destinationRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `graider-grade-status-${fixtureName}-`)
  );

  fs.cpSync(path.join(FIXTURE_ROOT, fixtureName), destinationRoot, { recursive: true });
  return destinationRoot;
};

const createStatusClient = (
  jonesRun: GitHubWorkflowRun | null = run(
    JONES_REPOSITORY,
    TestNumber.JonesRunId,
    "completed",
    "success"
  ),
  kimRun: GitHubWorkflowRun | null = run(
    KIM_REPOSITORY,
    TestNumber.KimRunId,
    "completed",
    "success"
  )
): FakeGitHubClient =>
  new FakeGitHubClient({
    repositories: [
      repository(JONES_REPOSITORY, TestNumber.JonesRepositoryId),
      repository(KIM_REPOSITORY, TestNumber.KimRepositoryId)
    ],
    workflowRuns: [
      ...(jonesRun === null
        ? []
        : [{ owner: ORGANIZATION, repo: JONES_REPOSITORY, run: jonesRun }]),
      ...(kimRun === null ? [] : [{ owner: ORGANIZATION, repo: KIM_REPOSITORY, run: kimRun }])
    ]
  });

const runStatus = (
  fixtureName: string,
  githubClient: FakeGitHubClient | null = createStatusClient(),
  options: {
    readonly json?: boolean;
    readonly student?: string;
    readonly students?: string;
  } = jsonOptions,
  env: Record<string, string | undefined> = GRADE_STATUS_ENV
): Promise<AssignmentGradeStatusResult> =>
  runAssignmentGradeStatusCommand({
    cwd: copyFixtureToTemp(fixtureName),
    assignmentFile: ASSIGNMENT_FILE,
    options,
    env,
    ...(githubClient === null ? {} : { githubClient })
  });

const removeCourseGrading = (cwd: string): void => {
  const coursePath = path.join(cwd, "course.yml");
  const original = fs.readFileSync(coursePath, "utf8");

  fs.writeFileSync(coursePath, original.replace("grading:\n  enabled: false\n", ""), "utf8");
};

const getRow = (
  result: AssignmentGradeStatusResult,
  studentId: string
): AssignmentGradeStatusResult["repositories"][number] => {
  const row = result.repositories.find((repositoryRow) => repositoryRow.studentId === studentId);

  if (row === undefined) {
    throw new Error(`Missing grade status row for ${studentId}`);
  }

  return row;
};

const expectNoMutations = (githubClient: FakeGitHubClient): void => {
  expect(githubClient.mutations.createdRepositories).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.addedCollaborators).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.removedCollaborators).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.teamPermissions).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.enabledActions).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.workflowDispatches).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.archivedRepositories).toHaveLength(NO_MUTATIONS);
  expect(githubClient.mutations.fileWrites).toHaveLength(NO_MUTATIONS);
  expect(githubClient.artifactDownloads).toHaveLength(NO_MUTATIONS);
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

const writeGroupManifest = (cwd: string): void => {
  fs.writeFileSync(
    path.join(cwd, MANIFEST_FILE),
    renderManifestV2Yaml({
      repositoryMode: "group",
      targets: [
        {
          targetId: "team-1",
          mode: "group",
          groupId: "team-1",
          repositoryName: GROUP_REPOSITORY,
          htmlUrl: `https://github.com/${ORGANIZATION}/${GROUP_REPOSITORY}`,
          sectionIds: ["001", "002"],
          studentIds: ["jones", "kim"],
          githubUsernames: ["seanjones", "kimstudent"],
          diagnostics: []
        }
      ],
      studentMappings: [
        {
          studentId: "jones",
          githubUsername: "seanjones",
          targetId: "team-1",
          repositoryName: GROUP_REPOSITORY,
          htmlUrl: `https://github.com/${ORGANIZATION}/${GROUP_REPOSITORY}`
        },
        {
          studentId: "kim",
          githubUsername: "kimstudent",
          targetId: "team-1",
          repositoryName: GROUP_REPOSITORY,
          htmlUrl: `https://github.com/${ORGANIZATION}/${GROUP_REPOSITORY}`
        }
      ]
    }),
    "utf8"
  );
};

describe("graider assignment grade-status command", () => {
  it("reads one shared v2 group target and projects its status to each member", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    writeGroupManifest(cwd);
    const githubClient = new FakeGitHubClient({
      repositories: [repository(GROUP_REPOSITORY, TestNumber.JonesRepositoryId)],
      workflowRuns: [
        {
          owner: ORGANIZATION,
          repo: GROUP_REPOSITORY,
          run: run(GROUP_REPOSITORY, TestNumber.JonesRunId, "completed", "success")
        }
      ]
    });
    const result = await runAssignmentGradeStatusCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      env: GRADE_STATUS_ENV,
      githubClient
    });

    expect(result.repositoryMode).toBe("group");
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]).toMatchObject({
      targetId: "team-1",
      groupId: "team-1",
      repository: `${ORGANIZATION}/${GROUP_REPOSITORY}`,
      studentIds: ["jones", "kim"],
      status: "completed"
    });
    expect(getRow(result, "jones")).toMatchObject({
      targetId: "team-1",
      groupId: "team-1",
      status: "completed"
    });
    expect(getRow(result, "kim")).toMatchObject({
      targetId: "team-1",
      groupId: "team-1",
      status: "completed"
    });
    expect(githubClient.workflowRunReadRequests.map((request) => request.repo)).toEqual([
      GROUP_REPOSITORY
    ]);
  });

  it("reports a missing shared group run once and maps the diagnostic to both members", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    writeGroupManifest(cwd);
    const githubClient = new FakeGitHubClient({
      repositories: [repository(GROUP_REPOSITORY, TestNumber.JonesRepositoryId)]
    });
    const result = await runAssignmentGradeStatusCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      env: GRADE_STATUS_ENV,
      githubClient
    });

    expect(result.targets).toEqual([
      expect.objectContaining({
        targetId: "team-1",
        groupId: "team-1",
        status: "missing",
        diagnostics: [expect.objectContaining({ code: DiagnosticCode.GradingWorkflowRunMissing })]
      })
    ]);
    expect(getRow(result, "jones").diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GradingWorkflowRunMissing })
    ]);
    expect(getRow(result, "kim").diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GradingWorkflowRunMissing })
    ]);
  });
  it("requires JSON output and returns the JSON-only diagnostic", async () => {
    const result = await runStatus("active-assignment", createStatusClient(), {});
    const json = JSON.parse(
      formatAssignmentGradeStatusResultAsJson(result)
    ) as AssignmentGradeStatusResult;

    expect(json.schemaVersion).toBe(1);
    expect(json.commandName).toBe("assignment grade-status");
    expect(json.status).toBe("failure");
    expect(json.exitCode).toBe(1);
    expect(json.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.AssignmentGradeStatusJsonRequired })
    ]);
  });

  it("returns assignment, course, term, effective course grading, targets, summary, and rows", async () => {
    const githubClient = createStatusClient(
      run(JONES_REPOSITORY, TestNumber.JonesRunId, "completed", "success"),
      run(KIM_REPOSITORY, TestNumber.KimRunId, "in_progress", null)
    );
    const result = await runStatus("active-assignment", githubClient);

    expect(result).toMatchObject({
      schemaVersion: 1,
      commandName: "assignment grade-status",
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
        workflow: DEFAULT_WORKFLOW,
        artifact: "grading-results",
        resultFile: "results.json",
        workflowRef: "main"
      },
      summary: {
        totalRepositories: 2,
        queued: 0,
        inProgress: 1,
        completed: 1,
        successful: 1,
        failed: 0,
        cancelled: 0,
        timedOut: 0,
        missing: 0,
        unknown: 0,
        blocked: 0,
        needsAttention: 0,
        readyForReport: false
      }
    });
    expect(getRow(result, "jones")).toMatchObject({
      repository: `${ORGANIZATION}/${JONES_REPOSITORY}`,
      workflow: DEFAULT_WORKFLOW,
      ref: "main",
      runId: TestNumber.JonesRunId,
      status: "completed",
      conclusion: "success",
      needsAttention: false
    });
    expect(getRow(result, "kim")).toMatchObject({
      repository: `${ORGANIZATION}/${KIM_REPOSITORY}`,
      status: "in_progress",
      conclusion: "unknown",
      needsAttention: false
    });
    expect(result.actions?.generateReport).toMatchObject({
      available: false,
      implemented: false,
      reason: "not_all_runs_complete"
    });
    expectNoMutations(githubClient);
  });

  it("uses assignment grading override when present", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    const githubClient = createStatusClient(
      run(
        JONES_REPOSITORY,
        TestNumber.JonesRunId,
        "completed",
        "success",
        CUSTOM_WORKFLOW_IDENTIFIER
      ),
      run(KIM_REPOSITORY, TestNumber.KimRunId, "completed", "success", CUSTOM_WORKFLOW_IDENTIFIER)
    );

    addAssignmentGradingOverride(cwd);

    const result = await runAssignmentGradeStatusCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      env: GRADE_STATUS_ENV,
      githubClient
    });

    expect(result.status).toBe("success");
    expect(result.grading).toMatchObject({
      enabled: true,
      resolvedFrom: "assignment_override",
      workflow: CUSTOM_WORKFLOW,
      artifact: "override-results",
      resultFile: "override-results.json"
    });
    expect(getRow(result, "jones")).toMatchObject({
      workflow: CUSTOM_WORKFLOW,
      status: "completed"
    });
    expectNoMutations(githubClient);
  });

  it("reports no grading source when neither course nor assignment configures grading", async () => {
    const cwd = copyFixtureToTemp("grading-disabled");
    const githubClient = createStatusClient();
    removeCourseGrading(cwd);
    const result = await runAssignmentGradeStatusCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      env: GRADE_STATUS_ENV,
      githubClient
    });

    expect(result.grading).toMatchObject({
      enabled: false,
      resolvedFrom: "none",
      workflow: null,
      workflowRef: null
    });
    expectNoMutations(githubClient);
  });

  it("returns local target and config data when the GitHub token is missing", async () => {
    const result = await runStatus("active-assignment", null, jsonOptions, {});

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
    expect(result.summary).toMatchObject({
      totalRepositories: 2,
      unknown: 2,
      readyForReport: false
    });
  });

  it("returns failure JSON for a missing assignment file", async () => {
    const result = await runAssignmentGradeStatusCommand({
      cwd: copyFixtureToTemp("active-assignment"),
      assignmentFile: "terms/27s1/assignments/missing/assignment.yml",
      options: jsonOptions,
      env: GRADE_STATUS_ENV,
      githubClient: createStatusClient()
    });

    expect(result.status).toBe("failure");
    expect(result.assignment).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.MissingRequiredFile })
    ]);
  });

  it("does not write local state, download artifacts, dispatch workflows, or mutate GitHub", async () => {
    const cwd = copyFixtureToTemp("active-assignment");
    const manifestPath = path.join(cwd, MANIFEST_FILE);
    const manifestBefore = fs.readFileSync(manifestPath, "utf8");
    const githubClient = createStatusClient();
    const result = await runAssignmentGradeStatusCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: jsonOptions,
      env: GRADE_STATUS_ENV,
      githubClient
    });

    expect(result.status).toBe("success");
    expect(fs.readFileSync(manifestPath, "utf8")).toBe(manifestBefore);
    expectNoMutations(githubClient);
  });

  it("reports inaccessible status checks with safe diagnostics", async () => {
    const githubClient = createStatusClient();

    githubClient.failNext("listWorkflowRuns", "permission_denied");

    const result = await runStatus("active-assignment", githubClient);
    const serialized = JSON.stringify(result);

    expect(result.status).toBe("partial_success");
    expect(getRow(result, "jones")).toMatchObject({
      status: "unknown",
      reason: DiagnosticCode.GradingWorkflowStatusUnknown
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GithubPermissionDenied })
    ]);
    expect(serialized).not.toContain(FAKE_TOKEN);
    expect(serialized.toLowerCase()).not.toContain("authorization");
    expectNoMutations(githubClient);
  });

  it("filters to one student and only checks that student's repository", async () => {
    const githubClient = createStatusClient(
      run(JONES_REPOSITORY, TestNumber.JonesRunId, "completed", "success"),
      run(KIM_REPOSITORY, TestNumber.KimRunId, "in_progress", null)
    );
    const result = await runStatus("active-assignment", githubClient, {
      json: true,
      student: "jones"
    });

    expect(result.status).toBe("success");
    expect(result.target).toMatchObject({
      sections: ["001"],
      sectionCount: 1,
      studentCount: 1,
      activeStudentCount: 1
    });
    expect(result.summary).toMatchObject({
      totalRepositories: 1,
      completed: 1,
      inProgress: 0,
      readyForReport: true
    });
    expect(result.repositories.map((row) => row.studentId)).toEqual(["jones"]);
    expect(githubClient.workflowRunReadRequests).toEqual([
      {
        owner: ORGANIZATION,
        repo: JONES_REPOSITORY,
        workflowPath: DEFAULT_WORKFLOW
      }
    ]);
    expectNoMutations(githubClient);
  });

  it("filters to multiple students, trims whitespace, deduplicates IDs, and preserves target order", async () => {
    const githubClient = createStatusClient(
      run(JONES_REPOSITORY, TestNumber.JonesRunId, "completed", "success"),
      run(KIM_REPOSITORY, TestNumber.KimRunId, "queued", null)
    );
    const result = await runStatus("active-assignment", githubClient, {
      json: true,
      students: " kim, jones , kim "
    });

    expect(result.status).toBe("success");
    expect(result.target).toMatchObject({
      sections: ["001", "002"],
      sectionCount: 2,
      studentCount: 2,
      activeStudentCount: 2
    });
    expect(result.repositories.map((row) => row.studentId)).toEqual(["jones", "kim"]);
    expect(result.summary).toMatchObject({
      totalRepositories: 2,
      queued: 1,
      completed: 1,
      successful: 1,
      readyForReport: false
    });
    expect(githubClient.workflowRunReadRequests.map((read) => read.repo)).toEqual([
      JONES_REPOSITORY,
      KIM_REPOSITORY
    ]);
    expectNoMutations(githubClient);
  });

  it("returns partial success when a filter mixes known and unknown students", async () => {
    const githubClient = createStatusClient(
      run(JONES_REPOSITORY, TestNumber.JonesRunId, "completed", "success"),
      run(KIM_REPOSITORY, TestNumber.KimRunId, "completed", "success")
    );
    const result = await runStatus("active-assignment", githubClient, {
      json: true,
      students: "missing,jones"
    });

    expect(result.status).toBe("partial_success");
    expect(result.exitCode).toBe(2);
    expect(result.repositories.map((row) => row.studentId)).toEqual(["jones"]);
    expect(result.summary).toMatchObject({
      totalRepositories: 1,
      completed: 1
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.StudentFilterUnknownStudent })
    ]);
    expect(result.diagnostics[0]?.context).toMatchObject({ studentId: "missing" });
    expect(githubClient.workflowRunReadRequests.map((read) => read.repo)).toEqual([
      JONES_REPOSITORY
    ]);
    expectNoMutations(githubClient);
  });

  it("returns failure when no filtered students match active targets and performs no GitHub checks", async () => {
    const githubClient = createStatusClient();
    const result = await runStatus("active-assignment", githubClient, {
      json: true,
      student: "missing"
    });

    expect(result.status).toBe("failure");
    expect(result.exitCode).toBe(1);
    expect(result.target).toMatchObject({
      sections: [],
      sectionCount: 0,
      studentCount: 0,
      activeStudentCount: 0
    });
    expect(result.summary).toMatchObject({
      totalRepositories: 0,
      readyForReport: false
    });
    expect(result.repositories).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.StudentFilterUnknownStudent }),
      expect.objectContaining({ code: DiagnosticCode.StudentFilterNoMatches })
    ]);
    expect(githubClient.workflowRunReadRequests).toEqual([]);
    expectNoMutations(githubClient);
  });

  it("rejects conflicting single and multiple student filters", async () => {
    const githubClient = createStatusClient();
    const result = await runStatus("active-assignment", githubClient, {
      json: true,
      student: "jones",
      students: "kim"
    });

    expect(result.status).toBe("failure");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.StudentFilterConflict })
    ]);
    expect(result.repositories).toEqual([]);
    expect(githubClient.workflowRunReadRequests).toEqual([]);
    expectNoMutations(githubClient);
  });

  it("rejects empty IDs in a multiple-student filter", async () => {
    const githubClient = createStatusClient();
    const result = await runStatus("active-assignment", githubClient, {
      json: true,
      students: "jones,,kim"
    });

    expect(result.status).toBe("failure");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.StudentFilterEmpty })
    ]);
    expect(result.repositories).toEqual([]);
    expect(githubClient.workflowRunReadRequests).toEqual([]);
    expectNoMutations(githubClient);
  });
});
