import { describe, expect, it, vi } from "vitest";
import type { LoadedGraiderConfig } from "../../../src/config/config-models.js";
import {
  prepareGradingStudentEvidenceContext,
  retrievePreparedGradingStudentEvidence
} from "../../../src/grading/grading-student-evidence-context.js";
import type { Manifest } from "../../../src/manifest/manifest-models.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const request = {
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "ada",
  currentSubmissionCommitSha: SHA
};
const requestWithoutHead = {
  courseFolderPath: request.courseFolderPath,
  termCode: request.termCode,
  assignmentSlug: request.assignmentSlug,
  studentId: request.studentId
};
const grading = {
  enabled: true as const,
  mode: "preset" as const,
  preset: "java-junit-checkstyle" as const,
  workflow: ".github/workflows/grade.yml",
  artifact: "grading-results",
  result_file: "grading-results.json"
};
const config = (assignmentGrading: unknown = grading, courseGrading: unknown = grading) =>
  ({
    course: {
      code: "CS101",
      title: "Course",
      github: { organization: "trusted-org", repository_visibility: "private" },
      grading: courseGrading
    },
    term: { code: "27s1", name: "Term" },
    assignment: {
      slug: "lab1",
      title: "Lab 1",
      template: { repository: "", branch: "" },
      ...(assignmentGrading === undefined ? {} : { grading: assignmentGrading })
    },
    summary: { termCode: "27s1", assignmentSlug: "lab1" }
  }) as unknown as LoadedGraiderConfig;
const manifest = (owner = "manifest-org"): Manifest => ({
  schemaVersion: 1,
  assignment: {
    termCode: "27s1",
    courseCode: "CS101",
    assignmentSlug: "lab1",
    assignmentTitle: "Lab 1"
  },
  source: { sourceFiles: [], inputFingerprint: "fingerprint" },
  repositories: [
    {
      studentId: "ada",
      githubUsername: "ada-gh",
      section: "001",
      rosterStatus: "active",
      repository: {
        owner,
        name: "lab1-ada",
        fullName: `${owner}/lab1-ada`,
        createdFromTemplate: false
      },
      permissions: {},
      actions: { enabled: true },
      lifecycle: {
        repositoryArchived: false,
        studentAccessRemoved: false,
        status: "active"
      },
      warnings: [],
      errors: []
    }
  ],
  operationHistory: [],
  warnings: [],
  errors: []
});

const manifestV2 = (): Manifest => ({
  schemaVersion: 2,
  repositoryMode: "individual",
  assignment: {
    termCode: "27s1",
    courseCode: "CS101",
    assignmentSlug: "lab1",
    assignmentTitle: "Lab 1"
  },
  source: { sourceFiles: [], inputFingerprint: "fingerprint" },
  repositories: [],
  targets: [
    {
      targetId: "ada",
      mode: "individual",
      repositoryName: "existing-lab1-ada",
      sectionIds: ["001"],
      studentIds: ["ada"],
      githubUsernames: ["ada-gh"],
      diagnostics: []
    }
  ],
  studentMappings: [
    {
      studentId: "ada",
      githubUsername: "ada-gh",
      targetId: "ada",
      repositoryName: "existing-lab1-ada"
    }
  ],
  operationHistory: [],
  warnings: [],
  errors: []
});

const deps = (options: { state?: unknown; assignmentGrading?: unknown } = {}) => ({
  loadState: vi.fn().mockReturnValue(options.state ?? { status: "missing" }),
  loadConfig: vi.fn().mockReturnValue({
    status: "success",
    config: config(options.assignmentGrading),
    diagnostics: []
  }),
  loadAssignmentManifest: vi.fn().mockReturnValue({
    status: "loaded",
    manifest: manifest(),
    warnings: [],
    errors: []
  })
});

describe("grading student evidence context", () => {
  it("prepares the effective managed preset, trusted manifest repository, and missing-state HEAD", () => {
    const result = prepareGradingStudentEvidenceContext(request, deps());
    expect(result).toEqual({
      status: "success",
      value: {
        studentId: "ada",
        submissionCommitSha: SHA,
        repository: { owner: "manifest-org", repo: "lab1-ada" },
        grading
      }
    });
  });

  it("uses an existing state's SHA and preserves submission_changed", () => {
    const matchingState = {
      status: "success" as const,
      value: {
        schemaVersion: 1 as const,
        studentId: "ada",
        submissionCommitSha: SHA,
        status: "published" as const,
        appliedComments: [],
        manualAdjustments: []
      }
    };
    expect(
      prepareGradingStudentEvidenceContext(request, deps({ state: matchingState }))
    ).toMatchObject({
      status: "success",
      value: { submissionCommitSha: SHA }
    });
    expect(
      prepareGradingStudentEvidenceContext(request, {
        ...deps(),
        loadState: () => ({
          status: "success" as const,
          value: { ...matchingState.value, submissionCommitSha: OTHER_SHA }
        })
      })
    ).toEqual({ status: "submission_changed", studentId: "ada" });

    expect(
      prepareGradingStudentEvidenceContext(requestWithoutHead, deps({ state: matchingState }))
    ).toMatchObject({
      status: "success",
      value: { submissionCommitSha: SHA }
    });
  });

  it("requires a trusted local HEAD only when canonical grading state is missing", () => {
    expect(prepareGradingStudentEvidenceContext(requestWithoutHead, deps())).toEqual({
      status: "submission_commit_unavailable"
    });
  });

  it("keeps evidence readable without changing any grading lifecycle status", () => {
    for (const status of ["not_started", "in_progress", "complete", "published"] as const) {
      const result = prepareGradingStudentEvidenceContext(
        request,
        deps({
          state: {
            status: "success",
            value: {
              schemaVersion: 1,
              studentId: "ada",
              submissionCommitSha: SHA,
              status,
              appliedComments: [],
              manualAdjustments: []
            }
          }
        })
      );
      expect(result).toMatchObject({ status: "success", value: { submissionCommitSha: SHA } });
    }
  });

  it("does not require a manifest or remote client for ineligible grading", () => {
    const loadAssignmentManifest = vi.fn();
    const result = prepareGradingStudentEvidenceContext(requestWithoutHead, {
      ...deps(),
      loadConfig: () => ({
        status: "success",
        config: config({ ...grading, enabled: false }),
        diagnostics: []
      }),
      loadAssignmentManifest
    });
    expect(result).toEqual({ status: "not_applicable", studentId: "ada" });
    expect(loadAssignmentManifest).not.toHaveBeenCalled();
  });

  it("uses inherited course grading and rejects a custom assignment override", () => {
    expect(
      prepareGradingStudentEvidenceContext(request, {
        ...deps(),
        loadConfig: () => ({
          status: "success",
          config: config(undefined, grading),
          diagnostics: []
        })
      })
    ).toMatchObject({ status: "success", value: { grading } });
    const loadAssignmentManifest = vi.fn();
    expect(
      prepareGradingStudentEvidenceContext(requestWithoutHead, {
        ...deps(),
        loadConfig: () => ({
          status: "success",
          config: config({ ...grading, mode: "custom-workflow", preset: undefined }),
          diagnostics: []
        }),
        loadAssignmentManifest
      })
    ).toEqual({ status: "not_applicable", studentId: "ada" });
    expect(loadAssignmentManifest).not.toHaveBeenCalled();
  });

  it("derives a manifest-v2 repository target and configured owner internally", () => {
    expect(
      prepareGradingStudentEvidenceContext(request, {
        ...deps(),
        loadAssignmentManifest: () => ({
          status: "loaded",
          manifest: manifestV2(),
          warnings: [],
          errors: []
        })
      })
    ).toMatchObject({
      status: "success",
      value: { repository: { owner: "trusted-org", repo: "existing-lab1-ada" } }
    });
  });

  it("returns safe repository failures for missing and malformed trusted mappings", () => {
    expect(
      prepareGradingStudentEvidenceContext(request, {
        ...deps(),
        loadAssignmentManifest: () => ({ status: "missing", warnings: [], errors: [] })
      })
    ).toEqual({ status: "repository_not_recorded" });
    expect(
      prepareGradingStudentEvidenceContext(request, {
        ...deps(),
        loadAssignmentManifest: () => ({ status: "failure", warnings: [], errors: [] })
      })
    ).toEqual({ status: "repository_unavailable" });
  });

  it("creates the GitHub client only at retrieval and passes trusted prepared values to Slice 39", async () => {
    const createClient = vi.fn().mockReturnValue({ client: true });
    const retrieve = vi.fn().mockResolvedValue({ status: "not_applicable" });
    const prepared = prepareGradingStudentEvidenceContext(request, deps());
    expect(prepared.status).toBe("success");
    if (prepared.status !== "success") return;
    expect(createClient).not.toHaveBeenCalled();
    await retrievePreparedGradingStudentEvidence(prepared.value, "secret", {
      createClient: createClient as never,
      retrieve
    });
    expect(createClient).toHaveBeenCalledWith({ token: "secret" });
    expect(retrieve).toHaveBeenCalledWith({
      githubClient: { client: true },
      repository: { owner: "manifest-org", repo: "lab1-ada" },
      grading,
      submissionCommitSha: SHA
    });
  });
});
