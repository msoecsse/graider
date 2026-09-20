import { describe, expect, it } from "vitest";
import {
  formatGradeStatusLabel,
  formatReadableDateTime,
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

  const CONCLUSIONS: readonly [string, string][] = [
    ["success", "Completed — success"],
    ["failure", "Completed — failure"],
    ["cancelled", "Cancelled"],
    ["timed_out", "Timed out"],
    // These are real GitHub Actions conclusion values with no specific
    // Graider copy. They must never leak into the label raw (README
    // section 2.3) -- this is the fix for GradeStatusPage.tsx's previous
    // `Completed — ${row.conclusion ?? "unknown"}` template, which did leak
    // them.
    ["skipped", "Completed — unknown"],
    ["neutral", "Completed — unknown"],
    ["action_required", "Completed — unknown"],
    ["unknown", "Completed — unknown"]
  ];

  it.each(CONCLUSIONS)("labels a completed run with conclusion %s as %s", (conclusion, label) => {
    expect(formatGradeStatusLabel(createRow({ status: "completed", conclusion }))).toBe(label);
  });

  it("labels a completed run with a null conclusion as unknown, not a literal 'null'", () => {
    expect(formatGradeStatusLabel(createRow({ status: "completed", conclusion: null }))).toBe(
      "Completed — unknown"
    );
  });

  it("labels a completed run with an unrecognized conclusion string as unknown", () => {
    expect(
      formatGradeStatusLabel(createRow({ status: "completed", conclusion: "something_new" }))
    ).toBe("Completed — unknown");
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
      getGradeStatusChipClassName(createRow({ status: "completed", conclusion: "failure" }))
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

describe("formatReadableDateTime", () => {
  it("returns null for a null timestamp", () => {
    expect(formatReadableDateTime(null)).toBeNull();
  });

  it("returns null for an unparseable timestamp", () => {
    expect(formatReadableDateTime("not-a-date")).toBeNull();
  });

  it("formats a valid ISO timestamp into a human-readable date, not the raw string", () => {
    const formatted = formatReadableDateTime("2026-06-10T12:00:00.000Z");

    expect(formatted).not.toBeNull();
    expect(formatted).not.toContain("2026-06-10T12:00:00");
    expect(formatted).toContain("2026");
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
