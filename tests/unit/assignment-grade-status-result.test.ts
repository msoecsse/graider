import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { renderManifestV2Yaml } from "../../src/manifest/manifest-v2-renderer.js";
import { describe, expect, it, vi } from "vitest";
import { buildAssignmentGradeStatus } from "../../src/grade-status/grade-status-builder.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import type { GitHubWorkflowRun } from "../../src/github/github-models.js";
import { STATUS_SHA, zip } from "../helpers/grading-artifact.js";

const OWNER = "example-org";
const REPO = "27s1-se2030-lab04-seanjones";
const RUN_ID = 401;
const ARTIFACT_ID = 501;
const OTHER_SHA = "abcdef0123456789abcdef0123456789abcdef01";
const RUN: GitHubWorkflowRun = {
  id: RUN_ID,
  runAttempt: 2,
  workflowPath: "grade.yml",
  status: "completed",
  conclusion: "success",
  headSha: OTHER_SHA,
  event: "workflow_dispatch",
  createdAt: "2026-10-01T12:00:00Z",
  updatedAt: "2026-10-01T12:03:00Z"
};
const METADATA = {
  schemaVersion: 1,
  submissionCommitSha: STATUS_SHA,
  workflowRunId: String(RUN_ID),
  workflowRunAttempt: "2",
  compile: { outcome: "success" },
  junit: { outcome: "success" },
  checkstyle: { outcome: "success" }
};
const RESULT = {
  schema_version: 1,
  status: "passed",
  checks: [
    { name: "CheckStyle", status: "passed" },
    { name: "Unit Tests", status: "passed" }
  ]
};
interface Scenario {
  readonly run?: Partial<GitHubWorkflowRun>;
  readonly result?: unknown;
  readonly metadata?: Record<string, unknown> | null;
  readonly resultText?: string;
  readonly missing?: boolean;
  readonly resultMissing?: boolean;
  readonly expired?: boolean;
  readonly files?: Readonly<Record<string, string>>;
}
const clientFor = (scenario: Scenario = {}): FakeGitHubClient =>
  new FakeGitHubClient({
    repositories: [
      {
        owner: OWNER,
        name: REPO,
        fullName: `${OWNER}/${REPO}`,
        id: 101,
        defaultBranch: "main",
        private: true,
        archived: false,
        htmlUrl: `https://github.com/${OWNER}/${REPO}`
      }
    ],
    repositoryBranches: [{ owner: OWNER, repo: REPO, name: "main", commitSha: STATUS_SHA }],
    workflowRuns: [{ owner: OWNER, repo: REPO, run: { ...RUN, ...scenario.run } }],
    actionsArtifacts: scenario.missing
      ? []
      : [
          {
            owner: OWNER,
            repo: REPO,
            runId: RUN_ID,
            artifact: {
              id: ARTIFACT_ID,
              name: "grading-results",
              sizeInBytes: 1024,
              expired: scenario.expired ?? false,
              createdAt: RUN.createdAt,
              updatedAt: RUN.updatedAt
            },
            archiveBytes: zip({
              ...(scenario.resultMissing
                ? {}
                : {
                    "graider-output/results.json":
                      scenario.resultText ?? JSON.stringify(scenario.result ?? RESULT)
                  }),
              ...(scenario.metadata === null
                ? {}
                : {
                    "grading-evidence/metadata.json": JSON.stringify({
                      ...METADATA,
                      ...scenario.metadata
                    })
                  }),
              ...scenario.files
            })
          }
        ]
  });
const refresh = (githubClient: FakeGitHubClient) =>
  buildAssignmentGradeStatus({
    cwd: path.resolve("tests/fixtures/grade/active-assignment"),
    assignmentFile: "terms/27s1/assignments/lab04/assignment.yml",
    studentIds: ["jones"],
    githubClient
  });

describe("verified Assignment grading results", () => {
  const cases: readonly [string, Scenario, string][] = [
    ["dispatch grades explicit SHA despite different head_sha", {}, "passed"],
    ["workflow success with failed grading", { result: { ...RESULT, status: "failed" } }, "failed"],
    [
      "explicit Checkstyle failure overrides passed overall",
      { result: { ...RESULT, checks: [{ name: "CheckStyle", status: "failed" }] } },
      "failed"
    ],
    [
      "explicit JUnit error overrides passed overall",
      { result: { ...RESULT, checks: [{ name: "Unit Tests", status: "error" }] } },
      "failed"
    ],
    [
      "failed Actions run with passed grading evidence",
      { run: { conclusion: "failure" } },
      "passed"
    ],
    [
      "failed Actions run with failed grading evidence",
      { run: { conclusion: "failure" }, result: { ...RESULT, status: "failed" } },
      "failed"
    ],
    ["older submission", { metadata: { submissionCommitSha: OTHER_SHA } }, "stale"],
    ["wrong run", { metadata: { workflowRunId: "999" } }, "stale"],
    ["previous attempt", { metadata: { workflowRunAttempt: "1" } }, "stale"],
    ["result commit contradicts metadata", { result: { ...RESULT, commit: OTHER_SHA } }, "stale"],
    ["wrong assignment", { result: { ...RESULT, assignment_slug: "another" } }, "stale"],
    ["missing artifact", { missing: true }, "missing"],
    ["missing result file", { resultMissing: true }, "missing"],
    ["empty passed checks", { result: { ...RESULT, checks: [] } }, "contradictory"],
    ["wrong student", { result: { ...RESULT, student_id: "another" } }, "stale"],
    ["wrong GitHub user", { result: { ...RESULT, github_username: "another" } }, "stale"],
    ["expired artifact", { expired: true }, "expired"],
    ["malformed result", { resultText: "{" }, "invalid"],
    ["invalid checks", { result: { ...RESULT, checks: [{ status: "passed" }] } }, "invalid"],
    ["missing metadata for dispatch", { metadata: null }, "unavailable"],
    ["missing run identity", { run: { id: 0 } }, "unavailable"],
    ["missing run attempt", { run: { runAttempt: 0 } }, "unavailable"],
    [
      "failed metadata contradicts passed result",
      { metadata: { junit: { outcome: "failure" } } },
      "contradictory"
    ],
    [
      "skipped check contradicts passed result",
      { result: { ...RESULT, checks: [{ name: "JUnit", status: "skipped" }] } },
      "contradictory"
    ],
    [
      "XML failures contradict passed checks",
      {
        files: {
          "grading-evidence/checkstyle.xml":
            '<checkstyle><file name="src/App.java"><error line="1" severity="error" message="Bad style" source="Check"/></file></checkstyle>'
        }
      },
      "contradictory"
    ],
    ["ambiguous result members", { files: { "results.json": JSON.stringify(RESULT) } }, "invalid"],
    ["queued run", { run: { status: "queued", conclusion: null } }, "not_checked"],
    ["incomplete run", { run: { status: "in_progress", conclusion: null } }, "not_checked"]
  ];
  it.each(cases)("handles %s", async (_name, scenario, expected) => {
    const client = clientFor(scenario);
    const response = await refresh(client);
    const row = response.repositories[0];
    expect(row).toMatchObject({
      gradingResult: expected,
      conclusion:
        scenario.run?.conclusion === null ? "unknown" : (scenario.run?.conclusion ?? "success"),
      runId: scenario.run?.id ?? RUN_ID
    });
    expect(response.summary?.successful).toBe(expected === "passed" ? 1 : 0);
    expect(response.summary?.failed).toBe(expected === "failed" ? 1 : 0);
    expect(response.summary?.readyForReport).toBe(expected === "passed" || expected === "failed");
    expect(client.artifactArchiveDownloads.length).toBeLessThanOrEqual(1);
    expect(client.mutations.workflowDispatches).toEqual([]);
    expect(client.mutations.fileWrites).toEqual([]);
  });

  it("keeps execution details when GitHub artifact access is unavailable", async () => {
    const client = clientFor();
    client.failNext("listWorkflowRunArtifacts", "permission_denied");
    const response = await refresh(client);
    expect(response.repositories[0]).toMatchObject({
      status: "completed",
      conclusion: "success",
      gradingResult: "unavailable",
      runId: RUN_ID
    });
  });

  it("never falls back to a previous passing run", async () => {
    const client = clientFor();
    vi.spyOn(client, "listWorkflowRuns").mockResolvedValue([
      RUN,
      { ...RUN, id: RUN_ID + 1, createdAt: "2026-10-02T12:00:00Z" }
    ]);
    const response = await refresh(client);
    expect(response.repositories[0]).toMatchObject({ runId: RUN_ID + 1, gradingResult: "missing" });
    expect(response.summary?.successful).toBe(0);
  });
  it("refuses a result when a new submission arrives during artifact verification", async () => {
    const client = clientFor();
    vi.spyOn(client, "getRepositoryBranch")
      .mockResolvedValueOnce({ name: "main", commitSha: STATUS_SHA })
      .mockResolvedValueOnce({ name: "main", commitSha: OTHER_SHA });
    const response = await refresh(client);
    expect(response.repositories[0]).toMatchObject({ gradingResult: "stale" });
    expect(response.summary?.successful).toBe(0);
  });
  it("does not cache a pass across refreshes or submissions", async () => {
    const client = clientFor();
    expect((await refresh(client)).repositories[0]?.gradingResult).toBe("passed");
    vi.spyOn(client, "getRepositoryBranch").mockResolvedValue({
      name: "main",
      commitSha: OTHER_SHA
    });
    expect((await refresh(client)).repositories[0]?.gradingResult).toBe("stale");
  });
  it("supports an initial custom push result without dispatch metadata", async () => {
    const client = clientFor({
      run: { event: "push", headSha: STATUS_SHA, runAttempt: 1 },
      metadata: null
    });
    expect((await refresh(client)).repositories[0]?.gradingResult).toBe("passed");
  });
  it("does not reuse an unbound custom push artifact from a previous attempt", async () => {
    const client = clientFor({ run: { event: "push", headSha: STATUS_SHA }, metadata: null });
    expect((await refresh(client)).repositories[0]?.gradingResult).toBe("unavailable");
  });
  it("bounds repository concurrency and run queries for a class of 50", async () => {
    const CLASS_SIZE = 50;
    const MAX_CONCURRENCY = 4;
    const MAX_RUNS = 20;
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "graider-status-class-"));
    try {
      fs.cpSync(path.resolve("tests/fixtures/grade/active-assignment"), cwd, { recursive: true });
      const students = Array.from({ length: CLASS_SIZE }, (_, index) => `student${String(index)}`);
      fs.writeFileSync(
        path.join(cwd, "terms/27s1/rosters/section-001.csv"),
        "student_id,github_username,section,status\n" +
          students.map((student) => `${student},${student},001,active\n`).join("")
      );
      fs.writeFileSync(
        path.join(cwd, "terms/27s1/rosters/section-002.csv"),
        "student_id,github_username,section,status\nexcluded,excludedgh,002,dropped\n"
      );
      fs.writeFileSync(
        path.join(cwd, "terms/27s1/manifests/lab04/manifest.yml"),
        renderManifestV2Yaml({
          repositoryMode: "individual",
          targets: students.map((student) => ({
            targetId: student,
            mode: "individual",
            repositoryName: student,
            sectionIds: ["001"],
            studentIds: [student],
            githubUsernames: [student],
            diagnostics: []
          })),
          studentMappings: students.map((student) => ({
            studentId: student,
            githubUsername: student,
            targetId: student,
            repositoryName: student
          }))
        })
      );
      const client = new FakeGitHubClient({
        repositories: students.map((student, index) => ({
          owner: OWNER,
          name: student,
          fullName: `${OWNER}/${student}`,
          id: index + 1,
          defaultBranch: "main",
          private: true,
          archived: false,
          htmlUrl: `https://github.com/${OWNER}/${student}`
        }))
      });
      let active = 0;
      let maximum = 0;
      const read = client.getRepository.bind(client);
      vi.spyOn(client, "getRepository").mockImplementation(async (owner, repo) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        const repository = await read(owner, repo);
        active -= 1;
        return repository;
      });
      const response = await buildAssignmentGradeStatus({
        cwd,
        assignmentFile: "terms/27s1/assignments/lab04/assignment.yml",
        githubClient: client
      });
      expect(response.repositories).toHaveLength(CLASS_SIZE);
      expect(maximum).toBe(MAX_CONCURRENCY);
      expect(client.workflowRunReadRequests).toHaveLength(CLASS_SIZE);
      expect(client.workflowRunReadRequests.every((request) => request.limit === MAX_RUNS)).toBe(
        true
      );
      expect(client.artifactArchiveDownloads).toHaveLength(0);
      expect(client.mutations.workflowDispatches).toEqual([]);
      expect(client.mutations.fileWrites).toEqual([]);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
