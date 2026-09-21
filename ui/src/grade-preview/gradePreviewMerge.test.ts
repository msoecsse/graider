import { describe, expect, it } from "vitest";
import {
  formatMergedGradeRowStatus,
  getGradePlanSummaryText,
  mergedGradeRowNeedsAttention,
  mergeGradeRows
} from "./gradePreviewMerge";
import type {
  GradeDispatchResultRepositoryRow,
  GradePreviewRepositoryRow,
  NormalizedGradeDispatchResult,
  NormalizedGradePreview
} from "./gradePreviewTypes";

const previewRow = (
  overrides: Partial<GradePreviewRepositoryRow> = {}
): GradePreviewRepositoryRow => ({
  studentId: "s001",
  githubUsername: "ada",
  section: "001",
  repository: "org/repo-ada",
  status: "would_dispatch",
  reason: "workflow_dispatch_available",
  workflow: ".github/workflows/grade.yml",
  ref: "main",
  diagnostics: [],
  ...overrides
});

const resultRow = (
  overrides: Partial<GradeDispatchResultRepositoryRow> = {}
): GradeDispatchResultRepositoryRow => ({
  studentId: "s001",
  githubUsername: "ada",
  section: "001",
  repository: "org/repo-ada",
  status: "dispatched",
  reason: "workflow_dispatch_created",
  workflow: ".github/workflows/grade.yml",
  ref: "main",
  diagnostics: [],
  ...overrides
});

function emptyPlanSummary() {
  return { wouldDispatch: 0, wouldSkip: 0, blocked: 0, unknown: 0 };
}

const preview = (overrides: Partial<NormalizedGradePreview> = {}): NormalizedGradePreview => ({
  status: "success",
  refreshedAt: null,
  diagnostics: [],
  assignment: { slug: "lab02", title: "Lab 02", file: null, status: "active" },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: { sections: ["001"], sectionCount: 1, studentCount: 1, activeStudentCount: 1 },
  grading: {
    enabled: true,
    resolvedFrom: "course_default",
    mode: "custom-workflow",
    workflow: ".github/workflows/grade.yml",
    artifact: "grading-results",
    resultFile: "results.json",
    workflowDispatch: "available",
    workflowRef: "main"
  },
  plan: { summary: emptyPlanSummary(), repositories: [] },
  files: { assignmentFile: null, manifestFile: null, workflowFile: null },
  actions: { grade: { available: true, implemented: false, previewOnly: true, reason: null } },
  ...overrides
});

const result = (
  overrides: Partial<NormalizedGradeDispatchResult> = {}
): NormalizedGradeDispatchResult => ({
  status: "success",
  exitCode: 0,
  dispatchedAt: "2026-06-10T15:30:00.000Z",
  assignmentFile: null,
  diagnostics: [],
  generatedFiles: [],
  summary: {
    targetsSelected: 0,
    dispatchAttempted: 0,
    dispatchSucceeded: 0,
    skipped: 0,
    failedOrBlocked: 0
  },
  rows: [],
  rawSummary: {},
  ...overrides
});

describe("mergeGradeRows", () => {
  it("carries every preview row through with no result status before dispatch runs", () => {
    const merged = mergeGradeRows(
      preview({
        plan: {
          summary: emptyPlanSummary(),
          repositories: [previewRow(), previewRow({ studentId: "s002", status: "blocked" })]
        }
      }),
      null
    );

    expect(merged).toHaveLength(2);
    expect(merged.every((row) => row.resultStatus === null)).toBe(true);
    expect(merged[0]?.previewStatus).toBe("would_dispatch");
    expect(merged[1]?.previewStatus).toBe("blocked");
  });

  it("updates a row's status in place once its result matches, by student identity", () => {
    const merged = mergeGradeRows(
      preview({ plan: { summary: emptyPlanSummary(), repositories: [previewRow()] } }),
      result({ rows: [resultRow()] })
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.previewStatus).toBe("would_dispatch");
    expect(merged[0]?.resultStatus).toBe("dispatched");
    expect(formatMergedGradeRowStatus(merged[0]!)).toBe("Dispatched");
  });

  it("keeps a row that dispatch never attempted (blocked pre-dispatch) as its preview status", () => {
    const merged = mergeGradeRows(
      preview({
        plan: {
          summary: emptyPlanSummary(),
          repositories: [previewRow({ status: "blocked", reason: "manifest_repository_missing" })]
        }
      }),
      result({ rows: [] })
    );

    expect(merged[0]?.resultStatus).toBeNull();
    expect(formatMergedGradeRowStatus(merged[0]!)).toBe("Blocked");
    expect(mergedGradeRowNeedsAttention(merged[0]!)).toBe(true);
  });

  it("appends a result row that has no matching preview row instead of dropping it", () => {
    const merged = mergeGradeRows(
      preview({ plan: { summary: emptyPlanSummary(), repositories: [] } }),
      result({ rows: [resultRow({ studentId: "s999" })] })
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.studentId).toBe("s999");
    expect(merged[0]?.resultStatus).toBe("dispatched");
  });
});

describe("getGradePlanSummaryText", () => {
  it("matches README section 2.3's own example style for pre-dispatch counts", () => {
    const rows = mergeGradeRows(
      preview({
        plan: {
          summary: emptyPlanSummary(),
          repositories: [
            previewRow({ studentId: "s001", status: "would_dispatch" }),
            previewRow({ studentId: "s002", status: "would_dispatch" }),
            previewRow({ studentId: "s003", status: "would_skip" })
          ]
        }
      }),
      null
    );

    expect(getGradePlanSummaryText(false, rows)).toBe(
      "2 repositories will be dispatched, 1 skipped."
    );
  });

  it("omits zero-count clauses and uses singular agreement for a count of 1", () => {
    const rows = mergeGradeRows(
      preview({
        plan: { summary: emptyPlanSummary(), repositories: [previewRow({ status: "blocked" })] }
      }),
      null
    );

    expect(getGradePlanSummaryText(false, rows)).toBe("1 repository is blocked.");
  });

  it("switches to past tense and counts a never-attempted row as blocked once a result exists", () => {
    const rows = mergeGradeRows(
      preview({
        plan: {
          summary: emptyPlanSummary(),
          repositories: [
            previewRow({ studentId: "s001", status: "would_dispatch" }),
            previewRow({ studentId: "s002", status: "blocked" })
          ]
        }
      }),
      result({ rows: [resultRow({ studentId: "s001", status: "dispatched" })] })
    );

    expect(getGradePlanSummaryText(true, rows)).toBe("1 repository was dispatched, 1 blocked.");
  });
});
