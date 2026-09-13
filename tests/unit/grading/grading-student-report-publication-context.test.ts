import { describe, expect, it, vi } from "vitest";
import type { ConfigLoadResult } from "../../../src/config/config-models.js";
import {
  GRADING_STATE_SCHEMA_VERSION,
  type GradingState
} from "../../../src/grading/grading-state.js";
import {
  checkGradingStudentReportPublicationEligibility,
  markPreparedGradingStudentReportPublished,
  publishRenderedGradingStudentReport,
  prepareGradingStudentReportPublicationContext,
  renderPreparedGradingStudentReport,
  revalidatePreparedGradingStudentReportPublication,
  type GradingStudentReportPublicationContextDependencies
} from "../../../src/grading/grading-student-report-publication-context.js";
import type { ManifestLoadResult } from "../../../src/manifest/manifest-loader.js";

const COMMIT_SHA_LENGTH = 40;
const SHA = "a".repeat(COMMIT_SHA_LENGTH);
const request = {
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "ada",
  repositoryRoot: "/trusted/local/ada",
  currentSubmissionCommitSha: SHA
};

const gradingState = (status: GradingState["status"] = "complete"): GradingState => ({
  schemaVersion: GRADING_STATE_SCHEMA_VERSION,
  studentId: "ada",
  submissionCommitSha: SHA,
  status,
  appliedComments: [
    {
      id: "comment-1",
      text: "Frozen feedback",
      deduction: -2,
      rubricCategoryId: "correctness",
      sourceLocation: { file: "src/Main.java", startLine: 1, endLine: 1 }
    }
  ],
  manualAdjustments: []
});

const config = {
  status: "success",
  config: {
    course: {
      course: { code: "SE2030", title: "Software Design", repository: "course-admin" },
      github: { organization: "trusted-org" },
      reports: {
        formats: ["html"],
        student_publish: {
          enabled: true,
          mode: "graider-generated",
          destination_file: "grading/final.html"
        }
      },
      grading: { enabled: true, mode: "preset", preset: "java-junit-checkstyle" }
    },
    assignment: {
      assignment: { slug: "lab1", title: "Lab One", type: "individual", status: "active" },
      sections: ["001"],
      template: { repository: "template", branch: "main" },
      grading: {
        enabled: true,
        mode: "preset",
        preset: "java-junit-checkstyle",
        required_files: ["src/Main.java"],
        rubric: [{ id: "correctness", name: "Correctness", points: 10 }]
      }
    },
    summary: { termCode: "27s1", assignmentSlug: "lab1", repoRoot: "/trusted/course" }
  },
  diagnostics: []
} as unknown as ConfigLoadResult;

const manifest = {
  status: "loaded",
  manifest: {
    schemaVersion: 1,
    assignment: { termCode: "27s1", assignmentSlug: "lab1" },
    repositories: [
      {
        studentId: "ada",
        githubUsername: "ada-gh",
        section: "001",
        rosterStatus: "active",
        repository: {
          owner: "trusted-org",
          name: "lab1-ada",
          fullName: "trusted-org/lab1-ada",
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
    ]
  }
} as unknown as ManifestLoadResult;

const dependencies = (
  state: GradingState = gradingState()
): GradingStudentReportPublicationContextDependencies => ({
  resolveSubmission: vi.fn().mockReturnValue({
    status: "success",
    value: { studentId: "ada", submissionCommitSha: SHA }
  }),
  loadState: vi.fn().mockReturnValue({ status: "success", value: state }),
  saveState: vi.fn().mockReturnValue({ status: "success", value: undefined }),
  loadConfig: vi.fn().mockReturnValue(config),
  loadAssignmentManifest: vi.fn().mockReturnValue(manifest),
  buildSource: vi.fn().mockReturnValue({
    status: "success",
    value: {
      sections: [
        {
          status: "found",
          file: "src/Main.java",
          sourceText: "class Main {}",
          sourceLineCount: 1,
          combinedStartLine: 1,
          combinedEndLine: 1,
          insertionLine: 1
        }
      ],
      combinedText: "class Main {}",
      syntheticCombinedLines: []
    }
  })
});

const prepare = (overrides: Partial<GradingStudentReportPublicationContextDependencies> = {}) => {
  const result = prepareGradingStudentReportPublicationContext(request, {
    ...dependencies(),
    ...overrides
  });
  expect(result.status).toBe("success");
  if (result.status !== "success") throw new Error(result.status);
  return result.value;
};

describe("grading student report publication context", () => {
  it("checks persisted complete/published eligibility before repository access is needed", () => {
    expect(
      checkGradingStudentReportPublicationEligibility(request, dependencies(gradingState()))
    ).toEqual({ status: "success" });
    expect(
      checkGradingStudentReportPublicationEligibility(
        request,
        dependencies(gradingState("in_progress"))
      )
    ).toEqual({ status: "grading_not_complete", studentId: "ada" });
  });

  it("loads persisted complete state, trusted config/repository/source, and renders Slice 44 HTML", () => {
    const deps = dependencies();
    const prepared = prepareGradingStudentReportPublicationContext(request, deps);
    expect(prepared.status).toBe("success");
    if (prepared.status !== "success") throw new Error(prepared.status);

    expect(deps.resolveSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ currentSubmissionCommitSha: SHA }),
      expect.anything()
    );
    expect(deps.buildSource).toHaveBeenCalledWith({
      repositoryRoot: "/trusted/local/ada",
      requiredFiles: ["src/Main.java"]
    });
    expect(prepared.value).toMatchObject({
      studentId: "ada",
      submissionCommitSha: SHA,
      reportPath: "grading/final.html",
      repository: { owner: "trusted-org", repo: "lab1-ada" },
      managedEvidenceEligible: true
    });

    const rendered = renderPreparedGradingStudentReport(prepared.value, {});
    expect(rendered.status).toBe("success");
    if (rendered.status !== "success") throw new Error(rendered.code);
    expect(rendered.html).toContain("8 / 10 points");
    expect(rendered.html).toContain("Frozen feedback");
    expect(rendered.html).toContain("class Main {}");
  });

  it.each(["not_started", "in_progress"] as const)(
    "rejects persisted %s state without completing it",
    (status) => {
      const result = prepareGradingStudentReportPublicationContext(
        request,
        dependencies(gradingState(status))
      );
      expect(result).toEqual({ status: "grading_not_complete", studentId: "ada" });
    }
  );

  it("requires persisted state and preserves submission_changed", () => {
    const missing = prepareGradingStudentReportPublicationContext(request, {
      ...dependencies(),
      loadState: vi.fn().mockReturnValue({ status: "missing" })
    });
    expect(missing).toEqual({ status: "grading_state_missing", studentId: "ada" });

    const changed = prepareGradingStudentReportPublicationContext(request, {
      ...dependencies(),
      resolveSubmission: vi.fn().mockReturnValue({ status: "submission_changed", studentId: "ada" })
    });
    expect(changed).toEqual({ status: "submission_changed", studentId: "ada" });
  });

  it("treats report-state changes as stale while ignoring editor-only view changes", () => {
    const prepared = prepare();
    const viewOnly = {
      ...gradingState(),
      viewState: { scrollTop: 20, cursor: { file: "src/Main.java", line: 1, column: 1 } }
    };
    expect(
      revalidatePreparedGradingStudentReportPublication(prepared, SHA, {
        ...dependencies(viewOnly),
        loadState: vi.fn().mockReturnValue({ status: "success", value: viewOnly })
      })
    ).toEqual({ status: "success" });

    const changed = { ...gradingState(), appliedComments: [] };
    expect(
      revalidatePreparedGradingStudentReportPublication(prepared, SHA, {
        ...dependencies(changed),
        loadState: vi.fn().mockReturnValue({ status: "success", value: changed })
      })
    ).toEqual({ status: "publication_stale", studentId: "ada" });
  });

  it("uses markPublished only after revalidation and reports persistence failure honestly", () => {
    const prepared = prepare();
    const saveState = vi.fn().mockReturnValue({
      status: "failure",
      code: "grading_state_write_failed",
      message: "private path"
    });
    const result = markPreparedGradingStudentReportPublished(prepared, SHA, {
      ...dependencies(),
      saveState
    });

    expect(result).toEqual({ status: "publication_state_record_failed", studentId: "ada" });
    expect(saveState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "published", submissionCommitSha: SHA })
    );
  });

  it("persists the canonical complete to published transition without changing its anchor", () => {
    const prepared = prepare();
    const saveState = vi.fn().mockReturnValue({ status: "success", value: undefined });

    expect(
      markPreparedGradingStudentReportPublished(prepared, SHA, {
        ...dependencies(),
        saveState
      })
    ).toEqual({ status: "success", studentId: "ada", gradingStatus: "published" });
    expect(saveState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "published", submissionCommitSha: SHA })
    );
  });

  it("allows an already published state to republish without rewriting local state", () => {
    const current = gradingState("published");
    const saveState = vi.fn();
    const prepared = prepare({
      loadState: vi.fn().mockReturnValue({ status: "success", value: current })
    });

    expect(
      markPreparedGradingStudentReportPublished(prepared, SHA, {
        ...dependencies(current),
        loadState: vi.fn().mockReturnValue({ status: "success", value: current }),
        saveState
      })
    ).toEqual({ status: "success", studentId: "ada", gradingStatus: "published" });
    expect(saveState).not.toHaveBeenCalled();
  });

  it("creates the production client internally and publishes only the trusted repository/path", async () => {
    const prepared = prepare();
    const writeRepositoryFile = vi.fn().mockResolvedValue({ path: prepared.reportPath });
    const createClient = vi.fn().mockReturnValue({
      getRepository: vi.fn().mockResolvedValue({ defaultBranch: "main" }),
      getRepositoryFileContent: vi.fn().mockResolvedValue(null),
      writeRepositoryFile
    });

    await expect(
      publishRenderedGradingStudentReport(
        prepared,
        "<!doctype html><p>trusted</p>",
        "private-token",
        () => Promise.resolve(true),
        { createClient }
      )
    ).resolves.toEqual({ status: "published", writePerformed: true });
    expect(createClient).toHaveBeenCalledWith("private-token");
    expect(writeRepositoryFile).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "trusted-org",
        repo: "lab1-ada",
        path: "grading/final.html"
      })
    );
  });
});
