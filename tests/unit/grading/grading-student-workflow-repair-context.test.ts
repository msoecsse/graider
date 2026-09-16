import { describe, expect, it, vi } from "vitest";
import type { LoadedGraiderConfig } from "../../../src/config/config-models.js";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import type { GitHubRepository } from "../../../src/github/github-models.js";
import {
  executePreparedGradingStudentWorkflowRepair,
  prepareGradingStudentWorkflowRepairContext
} from "../../../src/grading/grading-student-workflow-repair-context.js";
import type { Manifest } from "../../../src/manifest/manifest-models.js";

const grading = {
  enabled: true as const,
  mode: "preset" as const,
  preset: "java-junit-checkstyle" as const,
  workflow: ".github/workflows/grade.yml",
  artifact: "grading-results",
  result_file: "results.json"
};
const legacyGrading = {
  enabled: true as const,
  workflow: ".github/workflows/grade.yml",
  artifact: "grading-results",
  result_file: "results.json"
};
const config = (assignmentGrading: unknown = grading) =>
  ({
    course: {
      code: "CS101",
      title: "Course",
      github: { organization: "trusted-org", repository_visibility: "private" }
    },
    term: { code: "27s1", name: "Term" },
    assignment: {
      slug: "lab1",
      title: "Lab 1",
      ...(assignmentGrading === undefined ? {} : { grading: assignmentGrading })
    },
    summary: { termCode: "27s1", assignmentSlug: "lab1" }
  }) as unknown as LoadedGraiderConfig;
const manifest: Manifest = {
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
        owner: "manifest-org",
        name: "canonical-lab1-ada",
        fullName: "manifest-org/canonical-lab1-ada",
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
};
const request = {
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "ada"
};
const prepared = {
  studentId: "ada",
  repository: { owner: "manifest-org", name: "canonical-lab1-ada" },
  grading,
  submissionCommitSha: "0123456789abcdef0123456789abcdef01234567"
};
const repository: GitHubRepository = {
  owner: "manifest-org",
  name: "canonical-lab1-ada",
  fullName: "manifest-org/canonical-lab1-ada",
  id: 1,
  private: true,
  archived: false,
  defaultBranch: "student-main",
  htmlUrl: "https://github.com/manifest-org/canonical-lab1-ada"
};

const preparationDependencies = (assignmentGrading: unknown = grading) => ({
  loadState: vi.fn().mockReturnValue({
    status: "success",
    value: {
      schemaVersion: 1,
      studentId: "ada",
      submissionCommitSha: prepared.submissionCommitSha,
      status: "not_started",
      appliedComments: [],
      manualAdjustments: []
    }
  }),
  loadConfig: vi.fn().mockReturnValue({
    status: "success",
    config: config(assignmentGrading),
    diagnostics: []
  }),
  loadAssignmentManifest: vi.fn().mockReturnValue({
    status: "loaded",
    manifest,
    warnings: [],
    errors: []
  })
});

describe("grading student workflow repair context", () => {
  it("resolves effective grading and the authoritative manifest repository", () => {
    expect(prepareGradingStudentWorkflowRepairContext(request, preparationDependencies())).toEqual({
      status: "success",
      value: prepared
    });
  });

  it("makes Graider's legacy default grading configuration available for workflow repair", async () => {
    const preparedLegacy = {
      ...prepared,
      grading: legacyGrading
    };
    expect(
      prepareGradingStudentWorkflowRepairContext(request, preparationDependencies(legacyGrading))
    ).toEqual({ status: "success", value: preparedLegacy });

    const client = new FakeGitHubClient({ repositories: [repository] });
    const repair = vi.fn().mockResolvedValue({
      repository,
      workflow: { status: "created" },
      dispatch: { status: "dispatched" },
      diagnostics: []
    });
    await executePreparedGradingStudentWorkflowRepair(preparedLegacy, "token", true, {
      createClient: () => client,
      repair
    });
    expect(repair).toHaveBeenCalledWith(
      expect.objectContaining({ grading: legacyGrading, confirmed: true })
    );
  });

  it("returns safe missing-mapping and ineligible results before GitHub mutation", () => {
    expect(
      prepareGradingStudentWorkflowRepairContext(
        { ...request, studentId: "missing" },
        preparationDependencies()
      )
    ).toEqual({ status: "repository_not_recorded", studentId: "missing" });
    expect(
      prepareGradingStudentWorkflowRepairContext(
        request,
        preparationDependencies({ enabled: false })
      )
    ).toEqual({ status: "grading_not_eligible", studentId: "ada" });
  });

  it("uses observed repository identity/default branch and invokes the core operation only when confirmed", async () => {
    const client = new FakeGitHubClient({ repositories: [repository] });
    const repair = vi.fn().mockResolvedValue({
      repository: { ...repository, name: repository.name },
      workflow: { status: "already_current" },
      dispatch: { status: "dispatched" },
      diagnostics: []
    });
    const overrides = { createClient: () => client, repair };

    await expect(
      executePreparedGradingStudentWorkflowRepair(prepared, "token", false, overrides)
    ).resolves.toEqual({
      status: "ready",
      studentId: "ada",
      repositoryFullName: "manifest-org/canonical-lab1-ada"
    });
    expect(repair).not.toHaveBeenCalled();

    await executePreparedGradingStudentWorkflowRepair(prepared, "token", true, overrides);
    expect(repair).toHaveBeenCalledWith({
      githubClient: client,
      repository: {
        owner: "manifest-org",
        name: "canonical-lab1-ada",
        defaultBranch: "student-main"
      },
      grading,
      submissionCommitSha: prepared.submissionCommitSha,
      confirmed: true
    });
  });
});
