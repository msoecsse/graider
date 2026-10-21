import { loadManifest } from "../../src/manifest/manifest-loader.js";
import { renderManifestYaml } from "../../src/manifest/manifest-renderer.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAssignmentGradeStatus } from "../../src/grade-status/grade-status-builder.js";
import { DiagnosticCode } from "../../src/diagnostics/error-catalog.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubRepository, GitHubWorkflowRun } from "../../src/github/github-models.js";

enum TestNumber {
  JonesRepositoryId = 101,
  KimRepositoryId = 104,
  JonesRunId = 401,
  KimRunId = 402
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/grade/active-assignment");
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const ORGANIZATION = "example-org";
const JONES_REPOSITORY = "27s1-se2030-lab04-seanjones";
const KIM_REPOSITORY = "27s1-se2030-lab04-kimstudent";
const WORKFLOW_PATH = "grade.yml";

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
  conclusion: GitHubWorkflowRun["conclusion"]
): GitHubWorkflowRun => ({
  id,
  workflowPath: WORKFLOW_PATH,
  status,
  conclusion,
  headSha: `head-${String(id)}`,
  createdAt: "2026-06-12T10:00:00.000Z",
  updatedAt: "2026-06-12T10:04:00.000Z",
  runUrl: `https://github.com/${ORGANIZATION}/${repo}/actions/runs/${String(id)}`,
  event: "workflow_dispatch",
  startedAt: "2026-06-12T10:01:00.000Z",
  ...(status === "completed" ? { completedAt: "2026-06-12T10:04:00.000Z" } : {})
});

const createClient = (
  jonesRun: GitHubWorkflowRun | null,
  kimRun: GitHubWorkflowRun | null
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

const getRow = (
  result: Awaited<ReturnType<typeof buildAssignmentGradeStatus>>,
  studentId: string
) => {
  const row = result.repositories.find((repositoryRow) => repositoryRow.studentId === studentId);

  if (row === undefined) {
    throw new Error(`Missing grade status row for ${studentId}`);
  }

  return row;
};

describe("assignment grade status builder", () => {
  it("projects no student operational statuses before Apply", async () => {
    const result = await buildAssignmentGradeStatus({
      cwd: path.resolve("tests/fixtures/grade/missing-manifest"),
      assignmentFile: ASSIGNMENT_FILE,
      githubClient: createClient(null, null)
    });
    expect(result.repositories.length).toBeGreaterThan(0);
    expect(result.repositories.every((row) => row.status === null)).toBe(true);
    expect(result.repositories.some((row) => row.status === "blocked")).toBe(false);
    expect(result.summary).toMatchObject({ blocked: 0, missing: 0, needsAttention: 0 });
    expect(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === DiagnosticCode.StudentRepositoryMissing
      )
    ).toBe(false);
  });

  it("does not project missing grading for fresh repositories, but preserves observed runs", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "graider-status-lifecycle-"));
    try {
      fs.cpSync(FIXTURE_ROOT, cwd, { recursive: true });
      const manifestPath = path.join(cwd, "terms/27s1/manifests/lab04/manifest.yml");
      fs.writeFileSync(
        manifestPath,
        fs
          .readFileSync(manifestPath, "utf8")
          .replaceAll("      status: active", "      status: created")
      );
      const result = await buildAssignmentGradeStatus({
        cwd,
        assignmentFile: ASSIGNMENT_FILE,
        githubClient: createClient(
          run(JONES_REPOSITORY, TestNumber.JonesRunId, "completed", "success"),
          null
        )
      });
      expect(result.repositories).toHaveLength(2);
      expect(getRow(result, "kim").status).toBeNull();
      expect(result.summary?.readyForReport).toBe(false);
      expect(getRow(result, "jones").status).toBe("completed");
      expect(result.summary).toMatchObject({ missing: 0, successful: 1 });
      const absent = await buildAssignmentGradeStatus({
        cwd,
        assignmentFile: ASSIGNMENT_FILE,
        githubClient: new FakeGitHubClient()
      });
      expect(absent.summary).toMatchObject({ blocked: 2, missing: 0 });
      const loaded = loadManifest(manifestPath);
      if (loaded.status !== "loaded") throw new Error("Expected valid manifest");
      fs.writeFileSync(manifestPath, renderManifestYaml({ ...loaded.manifest, repositories: [] }));
      const provisioning = await buildAssignmentGradeStatus({
        cwd,
        assignmentFile: ASSIGNMENT_FILE,
        githubClient: createClient(null, null)
      });
      expect(provisioning.summary).toMatchObject({ missing: 0, readyForReport: false });
      expect(
        provisioning.diagnostics.some(
          (diagnostic) => diagnostic.code === DiagnosticCode.GradingWorkflowRunMissing
        )
      ).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("counts queued, in-progress, completed success, and missing runs", async () => {
    const githubClient = createClient(
      run(JONES_REPOSITORY, TestNumber.JonesRunId, "queued", null),
      null
    );
    const result = await buildAssignmentGradeStatus({
      cwd: FIXTURE_ROOT,
      assignmentFile: ASSIGNMENT_FILE,
      githubClient
    });

    expect(result.status).toBe("partial_success");
    expect(getRow(result, "jones")).toMatchObject({
      status: "queued",
      conclusion: "unknown",
      needsAttention: false
    });
    expect(getRow(result, "kim")).toMatchObject({
      status: "missing",
      conclusion: "unknown",
      needsAttention: true
    });
    expect(result.summary).toMatchObject({
      totalRepositories: 2,
      queued: 1,
      inProgress: 0,
      completed: 0,
      missing: 1,
      readyForReport: false
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GradingWorkflowRunInProgress }),
      expect.objectContaining({ code: DiagnosticCode.GradingWorkflowRunMissing })
    ]);
    expect(githubClient.mutations.workflowDispatches).toEqual([]);
    expect(githubClient.artifactDownloads).toEqual([]);
  });

  it("uses the student repository owner/name for workflow run URLs", async () => {
    const badRunUrl = {
      ...run(JONES_REPOSITORY, TestNumber.JonesRunId, "completed", "success"),
      runUrl: `https://github.com/${ORGANIZATION}/course-admin/actions/runs/${String(TestNumber.JonesRunId)}`
    };
    const githubClient = createClient(badRunUrl, null);
    const result = await buildAssignmentGradeStatus({
      cwd: FIXTURE_ROOT,
      assignmentFile: ASSIGNMENT_FILE,
      githubClient
    });

    expect(getRow(result, "jones")).toMatchObject({
      repository: `${ORGANIZATION}/${JONES_REPOSITORY}`,
      runId: TestNumber.JonesRunId,
      runUrl: `https://github.com/${ORGANIZATION}/${JONES_REPOSITORY}/actions/runs/${String(TestNumber.JonesRunId)}`
    });
  });

  it("counts completed failure, cancellation, and timeout as needing attention", async () => {
    const failureClient = createClient(
      run(JONES_REPOSITORY, TestNumber.JonesRunId, "completed", "failure"),
      run(KIM_REPOSITORY, TestNumber.KimRunId, "completed", "cancelled")
    );
    const failureResult = await buildAssignmentGradeStatus({
      cwd: FIXTURE_ROOT,
      assignmentFile: ASSIGNMENT_FILE,
      githubClient: failureClient
    });
    const timeoutClient = createClient(
      run(JONES_REPOSITORY, TestNumber.JonesRunId, "completed", "timed_out"),
      run(KIM_REPOSITORY, TestNumber.KimRunId, "completed", "success")
    );
    const timeoutResult = await buildAssignmentGradeStatus({
      cwd: FIXTURE_ROOT,
      assignmentFile: ASSIGNMENT_FILE,
      githubClient: timeoutClient
    });

    expect(failureResult.summary).toMatchObject({
      completed: 2,
      successful: 0,
      failed: 1,
      cancelled: 1,
      timedOut: 0,
      needsAttention: 2
    });
    expect(timeoutResult.summary).toMatchObject({
      completed: 2,
      successful: 1,
      failed: 0,
      cancelled: 0,
      timedOut: 1,
      needsAttention: 1
    });
    expect(failureResult.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.GradingWorkflowRunFailed }),
      expect.objectContaining({ code: DiagnosticCode.GradingWorkflowRunFailed })
    ]);
  });

  it("sets readyForReport only when every target repository has a completed known run", async () => {
    const readyClient = createClient(
      run(JONES_REPOSITORY, TestNumber.JonesRunId, "completed", "success"),
      run(KIM_REPOSITORY, TestNumber.KimRunId, "completed", "failure")
    );
    const waitingClient = createClient(
      run(JONES_REPOSITORY, TestNumber.JonesRunId, "completed", "success"),
      run(KIM_REPOSITORY, TestNumber.KimRunId, "in_progress", null)
    );
    const ready = await buildAssignmentGradeStatus({
      cwd: FIXTURE_ROOT,
      assignmentFile: ASSIGNMENT_FILE,
      githubClient: readyClient
    });
    const waiting = await buildAssignmentGradeStatus({
      cwd: FIXTURE_ROOT,
      assignmentFile: ASSIGNMENT_FILE,
      githubClient: waitingClient
    });

    expect(ready.summary?.readyForReport).toBe(true);
    expect(ready.actions?.generateReport).toMatchObject({
      available: true,
      implemented: false
    });
    expect(waiting.summary?.readyForReport).toBe(false);
    expect(waiting.actions?.generateReport).toMatchObject({
      available: false,
      implemented: false,
      reason: "not_all_runs_complete"
    });
  });
});
