import { describe, expect, it } from "vitest";
import {
  formatGradeStatusLabel,
  getGradeStatusChipClassName,
  getGradeStatusSummaryText,
  getNotReadyReason
} from "./gradeStatusLabels";
import type {
  GradeStatusRepositoryRow,
  GradeStatusRepositoryStatus,
  NormalizedGradeStatus
} from "./gradeStatusTypes";

const BASE_ROW: GradeStatusRepositoryRow = {
  studentUsername: null,
  studentId: "s001",
  githubUsername: "ada",
  section: "001",
  repository: "graider-sandbox/csc1120-lab02-ada",
  workflow: ".github/workflows/grade.yml",
  ref: "main",
  runId: 123,
  runUrl: "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123",
  status: "completed",
  conclusion: "success",
  gradingResult: "passed",
  startedAt: "2026-06-10T12:00:00.000Z",
  completedAt: "2026-06-10T12:05:00.000Z",
  selectionStrategy: "latest_configured_workflow_run",
  reason: "success",
  needsAttention: false,
  diagnostics: []
};

const createRow = (overrides: Partial<GradeStatusRepositoryRow>): GradeStatusRepositoryRow => ({
  ...BASE_ROW,
  ...overrides
});

const BASE_STATUS: NormalizedGradeStatus = {
  status: "success",
  exitCode: 0,
  refreshedAt: "2026-06-10T13:00:00.000Z",
  diagnostics: [],
  assignment: { slug: "lab02", title: "Lab 02", file: null, status: "active" },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: { sections: ["001"], sectionCount: 1, studentCount: 24, activeStudentCount: 24 },
  grading: {
    enabled: true,
    resolvedFrom: "assignment_override",
    mode: "preset",
    workflow: ".github/workflows/grade.yml",
    artifact: "grading-results",
    resultFile: "grading-results.json",
    workflowRef: "main"
  },
  summary: {
    totalRepositories: 24,
    queued: 0,
    inProgress: 0,
    completed: 24,
    successful: 24,
    failed: 0,
    cancelled: 0,
    timedOut: 0,
    missing: 0,
    unknown: 0,
    blocked: 0,
    needsAttention: 0,
    readyForReport: true
  },
  repositories: [BASE_ROW]
};

const createStatus = (overrides: {
  readonly grading?: Partial<NormalizedGradeStatus["grading"]>;
  readonly summary?: Partial<NormalizedGradeStatus["summary"]>;
  readonly repositories?: readonly GradeStatusRepositoryRow[];
}): NormalizedGradeStatus => ({
  ...BASE_STATUS,
  grading: { ...BASE_STATUS.grading, ...overrides.grading },
  summary: { ...BASE_STATUS.summary, ...overrides.summary },
  repositories: overrides.repositories ?? BASE_STATUS.repositories
});

describe("formatGradeStatusLabel", () => {
  it("renders no label for a lifecycle-inapplicable status", () => {
    expect(formatGradeStatusLabel(createRow({ status: null }))).toBe("");
  });
  const NON_COMPLETED_STATUSES: readonly [GradeStatusRepositoryStatus, string][] = [
    ["queued", "Queued"],
    ["in_progress", "In progress"],
    ["missing", "Missing"],
    ["token_required", "Token required"],
    ["not_configured", "Grading disabled"],
    ["blocked", "Blocked"],
    ["unknown", "Unknown"]
  ];

  it.each(NON_COMPLETED_STATUSES)("labels status %s as %s", (status, expectedLabel) => {
    expect(formatGradeStatusLabel(createRow({ status, conclusion: null }))).toBe(expectedLabel);
  });

  it.each([
    "success",
    "failure",
    "cancelled",
    "timed_out",
    "skipped",
    "neutral",
    "action_required",
    "unknown",
    null
  ])("never infers a grading result from workflow conclusion %s", (conclusion) => {
    const row = createRow({ status: "completed", conclusion, gradingResult: null });
    expect(formatGradeStatusLabel(row)).toBe("Grading results unverified");
    expect(getGradeStatusChipClassName(row)).toBe("status-chip status-chip--attention");
  });
  it.each([
    ["passed", "Grading passed", "success"],
    ["failed", "Grading failed", "error"],
    ["missing", "Grading results missing", "attention"],
    ["invalid", "Grading results invalid", "attention"],
    ["expired", "Grading results expired", "attention"],
    ["stale", "Grading results stale", "attention"],
    ["contradictory", "Grading results contradictory", "attention"],
    ["unavailable", "Grading results unavailable", "attention"],
    ["skipped", "Grading skipped", "attention"]
  ])("renders %s independently of workflow success", (gradingResult, label, color) => {
    const row = createRow({ gradingResult });
    expect(formatGradeStatusLabel(row)).toBe(label);
    expect(getGradeStatusChipClassName(row)).toBe(`status-chip status-chip--${color}`);
  });
});

describe("getGradeStatusChipClassName", () => {
  it("uses the success chip for a completed success run", () => {
    expect(
      getGradeStatusChipClassName(createRow({ status: "completed", conclusion: "success" }))
    ).toBe("status-chip status-chip--success");
  });

  it("uses the error chip for a completed failure run", () => {
    expect(
      getGradeStatusChipClassName(
        createRow({ status: "completed", conclusion: "success", gradingResult: "failed" })
      )
    ).toBe("status-chip status-chip--error");
  });

  it("uses the attention chip when needsAttention is true", () => {
    expect(
      getGradeStatusChipClassName(
        createRow({ status: "missing", conclusion: null, needsAttention: true })
      )
    ).toBe("status-chip status-chip--attention");
  });

  it("uses the plain chip otherwise", () => {
    expect(
      getGradeStatusChipClassName(
        createRow({ status: "queued", conclusion: null, needsAttention: false })
      )
    ).toBe("status-chip");
  });
});

describe("getGradeStatusSummaryText", () => {
  it("reports grading disabled first, regardless of other counts", () => {
    expect(getGradeStatusSummaryText(createStatus({ grading: { enabled: false } }))).toBe(
      "Grading is disabled for this assignment."
    );
  });

  it("includes a needs-attention count when present", () => {
    expect(getGradeStatusSummaryText(createStatus({ summary: { needsAttention: 3 } }))).toBe(
      "3 grading runs need attention."
    );
  });

  it("combines multiple active reasons in one sentence", () => {
    expect(
      getGradeStatusSummaryText(
        createStatus({ summary: { queued: 1, inProgress: 2, missing: 4, blocked: 1 } })
      )
    ).toBe(
      "3 runs still in progress. 4 repositories are missing completed grading runs. 1 repositories are blocked."
    );
  });

  it("says nothing needs attention when every count is zero and there are rows", () => {
    expect(getGradeStatusSummaryText(createStatus({}))).toBe("No grading runs need attention.");
  });

  it("reports no rows returned when the repository list is empty", () => {
    expect(getGradeStatusSummaryText(createStatus({ repositories: [] }))).toBe(
      "No repository status rows were returned."
    );
  });
});

describe("getNotReadyReason", () => {
  it("reports grading disabled first", () => {
    expect(getNotReadyReason(createStatus({ grading: { enabled: false } }))).toBe(
      "Grading is disabled for this assignment."
    );
  });

  it("includes a needs-attention count when present, same as the general summary", () => {
    expect(getNotReadyReason(createStatus({ summary: { needsAttention: 2 } }))).toBe(
      "2 grading runs need attention."
    );
  });

  it("falls back to a not-ready sentence, not a positive one, when no specific reason applies", () => {
    expect(getNotReadyReason(createStatus({}))).toBe(
      "Status is not ready for report generation yet."
    );
  });
});
