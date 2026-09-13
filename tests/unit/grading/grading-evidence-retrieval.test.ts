import { describe, expect, it } from "vitest";

import type { EffectiveAssignmentGrading } from "../../../src/config/effective-grading.js";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import type {
  GitHubActionsArtifact,
  GitHubWorkflowRunForCommit
} from "../../../src/github/github-models.js";
import {
  MAX_GRADING_EVIDENCE_ARCHIVE_DOWNLOAD_BYTES,
  selectAuthoritativeGradingWorkflowRun,
  retrieveGradingEvidence
} from "../../../src/grading/grading-evidence-retrieval.js";

const OWNER = "example-org";
const REPO = "student-repository";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const WORKFLOW_PATH = ".github/workflows/grade.yml";
const ARTIFACT_NAME = "grading-results";
const RUN_ID = 101;
const ARTIFACT_ID = 202;
const grading: EffectiveAssignmentGrading = {
  enabled: true,
  mode: "preset",
  preset: "java-junit-checkstyle",
  workflow: WORKFLOW_PATH,
  artifact: ARTIFACT_NAME,
  result_file: "grading-results.json"
};

const run = (overrides: Partial<GitHubWorkflowRunForCommit> = {}): GitHubWorkflowRunForCommit => ({
  id: RUN_ID,
  runAttempt: 2,
  workflowPath: WORKFLOW_PATH,
  status: "completed",
  conclusion: "failure",
  headSha: SHA,
  createdAt: "2026-09-10T10:00:00Z",
  updatedAt: "2026-09-10T10:02:00Z",
  completedAt: "2026-09-10T10:02:00Z",
  ...overrides
});
const artifact = (overrides: Partial<GitHubActionsArtifact> = {}): GitHubActionsArtifact => ({
  id: ARTIFACT_ID,
  name: ARTIFACT_NAME,
  sizeInBytes: 1024,
  expired: false,
  createdAt: "2026-09-10T10:02:00Z",
  updatedAt: "2026-09-10T10:02:00Z",
  ...overrides
});
const metadata = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    schemaVersion: 1,
    submissionCommitSha: SHA,
    workflowRunId: String(RUN_ID),
    workflowRunAttempt: "2",
    compile: { outcome: "success" },
    junit: { outcome: "failure" },
    checkstyle: { outcome: "success" },
    ...overrides
  });

const CRC32_BITS_PER_BYTE = 8;
const CRC32_REFLECTED_POLYNOMIAL = 0xedb88320;
const CRC32_INITIAL_REMAINDER = 0xffffffff;
const CRC32_BYTE_MASK = 0xff;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_VERSION_MADE_BY_DOS = 20;
const ZIP_VERSION_NEEDED_TO_EXTRACT = 20;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < CRC32_BITS_PER_BYTE; bit += 1)
    value = (value >>> 1) ^ (value & 1 ? CRC32_REFLECTED_POLYNOMIAL : 0);
  return value >>> 0;
});
const crc32 = (bytes: Uint8Array): number => {
  let value = CRC32_INITIAL_REMAINDER;
  for (const byte of bytes) {
    const tableValue = crcTable[(value ^ byte) & CRC32_BYTE_MASK];
    if (tableValue === undefined) throw new Error("CRC table entry is missing.");
    value = (value >>> CRC32_BITS_PER_BYTE) ^ tableValue;
  }
  return (value ^ CRC32_INITIAL_REMAINDER) >>> 0;
};
const u16 = (value: number): Buffer => {
  const output = Buffer.alloc(2);
  output.writeUInt16LE(value);
  return output;
};
const u32 = (value: number): Buffer => {
  const output = Buffer.alloc(4);
  output.writeUInt32LE(value);
  return output;
};
const zip = (files: Readonly<Record<string, string>>): Uint8Array => {
  let offset = 0;
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  for (const [fileName, text] of Object.entries(files)) {
    const name = Buffer.from(fileName);
    const content = Buffer.from(text);
    const crc = crc32(content);
    const local = Buffer.concat([
      u32(ZIP_LOCAL_FILE_HEADER_SIGNATURE),
      u16(ZIP_VERSION_NEEDED_TO_EXTRACT),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(content.length),
      u32(content.length),
      u16(name.length),
      u16(0),
      name,
      content
    ]);
    locals.push(local);
    central.push(
      Buffer.concat([
        u32(ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE),
        u16(ZIP_VERSION_MADE_BY_DOS),
        u16(ZIP_VERSION_NEEDED_TO_EXTRACT),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(content.length),
        u32(content.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name
      ])
    );
    offset += local.length;
  }
  const directory = Buffer.concat(central);
  return Buffer.concat([
    ...locals,
    directory,
    u32(ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE),
    u16(0),
    u16(0),
    u16(locals.length),
    u16(locals.length),
    u32(directory.length),
    u32(offset),
    u16(0)
  ]);
};
const archive = (metadataJson = metadata()): Uint8Array =>
  zip({
    "grading-evidence/metadata.json": metadataJson,
    "grading-evidence/junit/TEST-junit.xml":
      '<testsuite name="suite"><testcase name="fails"><failure message="expected"/></testcase></testsuite>',
    "grading-evidence/checkstyle.xml": '<checkstyle version="14.1.0"/>'
  });

const clientWithEvidence = (
  runs: GitHubWorkflowRunForCommit[] = [run()],
  artifacts: GitHubActionsArtifact[] = [artifact()],
  bytes = archive()
): FakeGitHubClient =>
  new FakeGitHubClient({
    workflowRuns: runs.map((workflowRun) => ({ owner: OWNER, repo: REPO, run: workflowRun })),
    actionsArtifacts: artifacts.map((actionsArtifact) => ({
      owner: OWNER,
      repo: REPO,
      runId: RUN_ID,
      artifact: actionsArtifact,
      archiveBytes: bytes
    }))
  });

const retrieve = (
  client: FakeGitHubClient,
  overrides: Partial<Parameters<typeof retrieveGradingEvidence>[0]> = {}
) =>
  retrieveGradingEvidence({
    githubClient: client,
    repository: { owner: OWNER, repo: REPO },
    grading,
    submissionCommitSha: SHA,
    ...overrides
  });

describe("retrieveGradingEvidence", () => {
  it("retrieves failed-test evidence only from the exact workflow and submission SHA", async () => {
    const client = clientWithEvidence(
      [
        run({
          id: 999,
          headSha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
          completedAt: "2026-09-10T12:00:00Z"
        }),
        run()
      ],
      [artifact({ name: "unrelated" }), artifact()]
    );

    await expect(retrieve(client)).resolves.toMatchObject({
      status: "success",
      value: {
        runId: RUN_ID,
        runAttempt: 2,
        artifactId: ARTIFACT_ID,
        evidence: { junit: { outcome: "failure", summary: { failed: 1 } } }
      }
    });
    expect(client.workflowRunForCommitReadRequests).toEqual([
      { owner: OWNER, repo: REPO, workflowPath: WORKFLOW_PATH, headSha: SHA }
    ]);
    expect(client.workflowRunArtifactReadRequests).toEqual([
      { owner: OWNER, repo: REPO, runId: RUN_ID }
    ]);
    expect(client.artifactArchiveDownloads).toEqual([
      { owner: OWNER, repo: REPO, artifactId: ARTIFACT_ID }
    ]);
    expect(client.mutations).toMatchObject({ workflowDispatches: [], fileWrites: [] });
  });

  it("selects the latest completed execution deterministically regardless of API order", async () => {
    const older = run({ id: 99, runAttempt: 9, completedAt: "2026-09-10T09:00:00Z" });
    const latest = run();
    const client = clientWithEvidence([latest, older]);

    await expect(retrieve(client)).resolves.toMatchObject({
      status: "success",
      value: { runId: RUN_ID }
    });

    const reverseClient = clientWithEvidence([older, latest]);
    await expect(retrieve(reverseClient)).resolves.toMatchObject({
      status: "success",
      value: { runId: RUN_ID }
    });

    expect(
      selectAuthoritativeGradingWorkflowRun([
        run({ id: 100, runAttempt: 2 }),
        run({ id: 99, runAttempt: 3 })
      ])
    ).toMatchObject({ id: 99, runAttempt: 3 });
  });

  it("does not retrieve for ineligible execution grading", async () => {
    for (const ineligible of [
      undefined,
      { enabled: false },
      { enabled: true, required_files: ["src/Main.java"] },
      { enabled: true, mode: "custom-workflow", workflow: "custom.yml" }
    ]) {
      const client = clientWithEvidence();
      await expect(
        retrieve(client, { grading: ineligible as EffectiveAssignmentGrading | undefined })
      ).resolves.toEqual({
        status: "not_applicable",
        reason: "managed_preset_not_enabled"
      });
      expect(client.workflowRunForCommitReadRequests).toEqual([]);
    }
  });

  it("reports missing, expired, ambiguous, and oversized artifacts before download", async () => {
    const cases: Array<[GitHubActionsArtifact[], string]> = [
      [[], "evidence_artifact_missing"],
      [[artifact({ expired: true })], "evidence_artifact_expired"],
      [[artifact(), artifact({ id: 303 })], "evidence_artifact_ambiguous"],
      [
        [artifact({ sizeInBytes: MAX_GRADING_EVIDENCE_ARCHIVE_DOWNLOAD_BYTES + 1 })],
        "evidence_artifact_too_large"
      ]
    ];
    for (const [artifacts, code] of cases) {
      const client = clientWithEvidence([run()], artifacts);
      await expect(retrieve(client)).resolves.toMatchObject({ status: "failure", error: { code } });
      expect(client.artifactArchiveDownloads).toEqual([]);
    }
  });

  it("does not fall back when the latest exact-SHA run lacks evidence", async () => {
    const older = run({ id: 99, completedAt: "2026-09-10T09:00:00Z" });
    const latest = run({ id: 102, completedAt: "2026-09-10T11:00:00Z", conclusion: "cancelled" });
    const client = new FakeGitHubClient({
      workflowRuns: [older, latest].map((workflowRun) => ({
        owner: OWNER,
        repo: REPO,
        run: workflowRun
      })),
      actionsArtifacts: [
        { owner: OWNER, repo: REPO, runId: older.id, artifact: artifact(), archiveBytes: archive() }
      ]
    });

    await expect(retrieve(client)).resolves.toMatchObject({
      status: "failure",
      error: { code: "evidence_artifact_missing" }
    });
    expect(client.workflowRunArtifactReadRequests).toEqual([
      { owner: OWNER, repo: REPO, runId: latest.id }
    ]);
  });

  it("rejects evidence whose SHA, run ID, or run attempt does not match", async () => {
    for (const metadataOverride of [
      { submissionCommitSha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd" },
      { workflowRunId: "999" },
      { workflowRunAttempt: "3" }
    ]) {
      const client = clientWithEvidence([run()], [artifact()], archive(metadata(metadataOverride)));
      await expect(retrieve(client)).resolves.toMatchObject({
        status: "failure",
        error: { code: "evidence_identity_mismatch" }
      });
    }
  });

  it("returns typed lookup, permission, download, and archive failures safely", async () => {
    await expect(
      retrieve(clientWithEvidence(), { submissionCommitSha: "invalid" })
    ).resolves.toMatchObject({
      status: "failure",
      error: { code: "submission_sha_invalid" }
    });
    await expect(retrieve(clientWithEvidence([]))).resolves.toMatchObject({
      status: "failure",
      error: { code: "workflow_run_not_found" }
    });
    const forbidden = clientWithEvidence();
    forbidden.failNext("listWorkflowRunsForCommit", "permission_denied");
    await expect(retrieve(forbidden)).resolves.toMatchObject({
      status: "failure",
      error: { code: "actions_forbidden" }
    });
    const downloadFailure = clientWithEvidence();
    downloadFailure.failNext("downloadArtifactArchive", "network_error");
    await expect(retrieve(downloadFailure)).resolves.toMatchObject({
      status: "failure",
      error: { code: "evidence_artifact_download_failed" }
    });
    await expect(
      retrieve(clientWithEvidence([run()], [artifact()], new Uint8Array([1, 2, 3])))
    ).resolves.toMatchObject({
      status: "failure",
      error: { code: "evidence_archive_invalid" }
    });
  });
});
