import { describe, expect, it, vi } from "vitest";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import { gradingStudentEvidenceContextBackend } from "../../../src/grading/grading-student-evidence-context.js";
import { zip } from "../../helpers/grading-artifact.js";
import type { LoadedGraiderConfig } from "../../../src/config/config-models.js";
import type { Manifest } from "../../../src/manifest/manifest-models.js";
import { createRequire } from "node:module";

// Observed run/commit identifiers only; all content and repository identities are synthetic.
const SUBMISSION = "60674587ef2988ead89aff60db5808db7f5d9c0e";
const FEEDBACK = "50823d518ce979c2fd328f4ae338d455e6d8b001";
const RESUBMISSION = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const RUN_ID = 42144167132;
const ARTIFACT_ID = 13469881132;
const WORKFLOW = ".github/workflows/grade.yml";
const grading = {
  enabled: true as const,
  workflow: WORKFLOW,
  artifact: "grading-results",
  result_file: "grading-results.json"
};
const request = {
  courseFolderPath: "course",
  termCode: "27s1",
  assignmentSlug: "hw9",
  studentId: "student",
  currentSubmissionCommitSha: FEEDBACK,
  repositoryRoot: "student-repository"
};
const sourceTree = (source: string, report: string) => [
  { path: "src/Main.java", objectId: source, mode: "100644" },
  { path: "grading/report.html", objectId: report, mode: "100644" }
];
const fixture = (anchor = SUBMISSION, head = FEEDBACK) => {
  const state = {
    schemaVersion: 1,
    studentId: "student",
    submissionCommitSha: anchor,
    status: "published",
    appliedComments: [{ commentId: "manual-comment" }],
    manualAdjustments: [],
    repositoryUpdates: [{ previousSha: SUBMISSION, newSha: RESUBMISSION }]
  };
  const loadState = vi.fn().mockReturnValue({ status: "success", value: state });
  const workspace = {
    resolveHead: vi.fn(() => Promise.resolve(head)),
    listFirstParentCommitTrees: vi.fn(() =>
      Promise.resolve(
        [head, ...(head === SUBMISSION ? [] : [SUBMISSION])].map((commit) => ({ commit }))
      )
    ),
    listTree: vi.fn((sha: string) =>
      Promise.resolve(sourceTree(sha === RESUBMISSION ? "new-source" : "original-source", sha))
    )
  };
  const dependencies = {
    loadState,
    loadConfig: vi.fn(() => ({
      status: "success" as const,
      config: {
        course: { github: { organization: "example-org" }, grading },
        assignment: { grading },
        summary: { termCode: "27s1", assignmentSlug: "hw9" }
      } as unknown as LoadedGraiderConfig,
      diagnostics: []
    })),
    loadAssignmentManifest: vi.fn(() => ({
      status: "loaded" as const,
      manifest: {
        schemaVersion: 1,
        assignment: { termCode: "27s1", assignmentSlug: "hw9" },
        repositories: [
          {
            studentId: "student",
            githubUsername: "student",
            section: "001",
            warnings: [],
            errors: [],
            repository: { owner: "example-org", name: "hw9-student" }
          }
        ]
      } as unknown as Manifest,
      warnings: [],
      errors: []
    })),
    openWorkspace: vi.fn(() => Promise.resolve(workspace))
  };
  const bytes = zip({
    "grading-evidence/metadata.json": JSON.stringify({
      schemaVersion: 1,
      submissionCommitSha: SUBMISSION,
      workflowRunId: String(RUN_ID),
      workflowRunAttempt: "1",
      compile: { outcome: "success" },
      junit: { outcome: "success" },
      checkstyle: { outcome: "success" }
    }),
    "grading-evidence/junit/TEST-synthetic.xml":
      '<testsuite><testcase name="synthetic"/></testsuite>',
    "grading-evidence/checkstyle.xml": "<checkstyle/>"
  });
  const client = new FakeGitHubClient({
    workflowRuns: [
      {
        owner: "example-org",
        repo: "hw9-student",
        run: {
          id: RUN_ID,
          runAttempt: 1,
          workflowPath: WORKFLOW,
          status: "completed",
          conclusion: "success",
          headSha: SUBMISSION,
          createdAt: "2026-11-06T10:00:00Z",
          updatedAt: "2026-11-06T10:02:00Z"
        }
      }
    ],
    actionsArtifacts: [
      {
        owner: "example-org",
        repo: "hw9-student",
        runId: RUN_ID,
        artifact: {
          id: ARTIFACT_ID,
          name: "grading-results",
          expired: false,
          sizeInBytes: bytes.length,
          createdAt: "2026-11-06T10:02:00Z",
          updatedAt: "2026-11-06T10:02:00Z"
        },
        archiveBytes: bytes
      }
    ]
  });
  return { state, workspace, dependencies, client };
};

describe("automated evidence reload after feedback publication", () => {
  it.each([
    ["permission_denied", "actions_forbidden"],
    ["rate_limited", "evidence_rate_limited"]
  ] as const)("keeps %s actionable across separately bundled clients", async (kind, code) => {
    const load = createRequire(import.meta.url);
    const bundled = load("../../../ui/dist-electron/gradingStudentEvidenceBackend.cjs") as {
      gradingStudentEvidenceContextBackend: typeof gradingStudentEvidenceContextBackend;
    };
    const f = fixture(FEEDBACK);
    const prepared =
      await bundled.gradingStudentEvidenceContextBackend.prepareGradingStudentEvidenceContext(
        request,
        f.dependencies
      );
    if (prepared.status !== "success") throw new Error(prepared.status);
    f.client.failNext("listWorkflowRunsForCommit", kind);
    expect(
      await bundled.gradingStudentEvidenceContextBackend.retrievePreparedGradingStudentEvidence(
        prepared.value,
        f.client
      )
    ).toMatchObject({ status: "failure", error: { code } });
    expect(f.client.artifactArchiveDownloads).toHaveLength(0);
  });

  it("preserves SHA proof and artifact parsing through the bundled Electron backend", async () => {
    const load = createRequire(import.meta.url);
    const bundled = load("../../../ui/dist-electron/gradingStudentEvidenceBackend.cjs") as {
      gradingStudentEvidenceContextBackend: typeof gradingStudentEvidenceContextBackend;
    };
    const f = fixture(FEEDBACK);
    const backend = bundled.gradingStudentEvidenceContextBackend;
    const prepared = await backend.prepareGradingStudentEvidenceContext(request, f.dependencies);
    if (prepared.status !== "success") throw new Error(prepared.status);
    expect(prepared.value.equivalentSubmissionCommitShas).toEqual([FEEDBACK, SUBMISSION]);
    expect(
      await backend.retrievePreparedGradingStudentEvidence(prepared.value, f.client)
    ).toMatchObject({ status: "success", value: { runId: RUN_ID, artifactId: ARTIFACT_ID } });
  });

  it("loads the original student SHA with the modern preset", async () => {
    const f = fixture(SUBMISSION, SUBMISSION);
    const config = f.dependencies.loadConfig();
    config.config.assignment.grading = {
      ...grading,
      mode: "preset",
      preset: "java-junit-checkstyle"
    };
    f.dependencies.loadConfig.mockReturnValue(config);
    const prepared =
      await gradingStudentEvidenceContextBackend.prepareGradingStudentEvidenceContext(
        { ...request, currentSubmissionCommitSha: SUBMISSION },
        f.dependencies
      );
    if (prepared.status !== "success") throw new Error(prepared.status);
    expect(
      await gradingStudentEvidenceContextBackend.retrievePreparedGradingStudentEvidence(
        prepared.value,
        f.client
      )
    ).toMatchObject({ status: "success", value: { runId: RUN_ID } });
  });

  it.each([SUBMISSION, FEEDBACK, "missing"])(
    "loads matching results with grading anchor %s",
    async (anchor) => {
      const f = fixture(anchor);
      if (anchor === "missing") f.dependencies.loadState.mockReturnValue({ status: "missing" });
      const before = JSON.stringify(f.state);
      const prepared =
        await gradingStudentEvidenceContextBackend.prepareGradingStudentEvidenceContext(
          request,
          f.dependencies
        );
      expect(prepared.status).toBe("success");
      if (prepared.status !== "success") throw new Error(prepared.status);
      const result =
        await gradingStudentEvidenceContextBackend.retrievePreparedGradingStudentEvidence(
          prepared.value,
          f.client
        );
      expect(result).toMatchObject({
        status: "success",
        value: {
          runId: RUN_ID,
          artifactId: ARTIFACT_ID,
          evidence: { metadata: { submissionCommitSha: SUBMISSION } }
        }
      });
      expect(f.client.workflowRunForCommitReadRequests).toHaveLength(1);
      expect(f.client.artifactArchiveDownloads).toHaveLength(1);
      expect(JSON.stringify(f.state)).toBe(before);
      expect(f.client.mutations).toMatchObject({ workflowDispatches: [], fileWrites: [] });
    }
  );

  it.each([SUBMISSION, RESUBMISSION])(
    "rejects old results after a source resubmission with anchor %s",
    async (anchor) => {
      const f = fixture(anchor, RESUBMISSION);
      const prepared =
        await gradingStudentEvidenceContextBackend.prepareGradingStudentEvidenceContext(
          { ...request, currentSubmissionCommitSha: RESUBMISSION },
          f.dependencies
        );
      if (anchor === SUBMISSION) {
        expect(prepared.status).toBe("submission_changed");
      } else {
        expect(prepared.status).toBe("success");
        if (prepared.status !== "success") throw new Error(prepared.status);
        const result =
          await gradingStudentEvidenceContextBackend.retrievePreparedGradingStudentEvidence(
            prepared.value,
            f.client
          );
        expect(result).toMatchObject({
          status: "failure",
          error: { code: "evidence_identity_mismatch" }
        });
      }
    }
  );

  it("keeps exact-SHA behavior if local history is unavailable", async () => {
    const f = fixture(FEEDBACK);
    f.dependencies.openWorkspace.mockRejectedValue(new Error("local history unavailable"));
    const prepared =
      await gradingStudentEvidenceContextBackend.prepareGradingStudentEvidenceContext(
        request,
        f.dependencies
      );
    if (prepared.status !== "success") throw new Error(prepared.status);
    expect(prepared.value).not.toHaveProperty("previousSubmissionCommitShas");
    expect(
      await gradingStudentEvidenceContextBackend.retrievePreparedGradingStudentEvidence(
        prepared.value,
        f.client
      )
    ).toMatchObject({ status: "failure", error: { code: "evidence_identity_mismatch" } });
  });

  it("does not accept a changed HEAD while proving equivalence", async () => {
    const f = fixture();
    f.workspace.resolveHead.mockResolvedValueOnce(FEEDBACK).mockResolvedValueOnce(RESUBMISSION);
    expect(
      await gradingStudentEvidenceContextBackend.prepareGradingStudentEvidenceContext(
        request,
        f.dependencies
      )
    ).toMatchObject({ status: "submission_changed" });
  });

  it.each(["assignment", "repository"])("rejects a wrong %s identity", async (kind) => {
    const f = fixture(FEEDBACK);
    if (kind === "assignment") {
      const config = f.dependencies.loadConfig();
      config.config.summary.assignmentSlug = "other";
      f.dependencies.loadConfig.mockReturnValue(config);
    } else {
      const manifest = f.dependencies.loadAssignmentManifest();
      const repository = manifest.manifest.repositories[0];
      if (repository === undefined) throw new Error("Missing fixture repository");
      repository.repository.name = "other-student";
      f.dependencies.loadAssignmentManifest.mockReturnValue(manifest);
    }
    const prepared =
      await gradingStudentEvidenceContextBackend.prepareGradingStudentEvidenceContext(
        request,
        f.dependencies
      );
    if (kind === "assignment") expect(prepared.status).toBe("assignment_config_error");
    else {
      if (prepared.status !== "success") throw new Error(prepared.status);
      expect(
        await gradingStudentEvidenceContextBackend.retrievePreparedGradingStudentEvidence(
          prepared.value,
          f.client
        )
      ).toMatchObject({ status: "failure", error: { code: "workflow_run_not_found" } });
      expect(f.client.artifactArchiveDownloads).toHaveLength(0);
    }
  });
});
