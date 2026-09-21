import { describe, expect, it } from "vitest";
import {
  formatMergedGroupRowStatus,
  formatMergedRowStatus,
  getApplyPlanSummaryText,
  mergedGroupRowNeedsAttention,
  mergedRowNeedsAttention,
  mergeApplyGroupRows,
  mergeApplyRows
} from "./applyPreviewMerge";
import type {
  ApplyPreviewRepositoryRow,
  ApplyPreviewGroupTarget,
  ApplyResultGroupTarget,
  ApplyResultRepositoryRow,
  NormalizedApplyPreview,
  NormalizedApplyResult
} from "./applyPreviewTypes";

const previewRow = (
  overrides: Partial<ApplyPreviewRepositoryRow> = {}
): ApplyPreviewRepositoryRow => ({
  studentId: "s001",
  githubUsername: "ada",
  section: "001",
  repository: "org/repo-ada",
  status: "would_create",
  reason: "student_repository_missing",
  diagnostics: [],
  ...overrides
});

const resultRow = (
  overrides: Partial<ApplyResultRepositoryRow> = {}
): ApplyResultRepositoryRow => ({
  studentId: "s001",
  githubUsername: "ada",
  section: "001",
  repository: "org/repo-ada",
  status: "created",
  reason: "repository_created",
  diagnostics: [],
  ...overrides
});

const previewGroupTarget = (
  overrides: Partial<ApplyPreviewGroupTarget> = {}
): ApplyPreviewGroupTarget => ({
  targetId: "team-1",
  groupId: "team-1",
  repositoryName: "org/team-1",
  sectionIds: ["111"],
  studentIds: ["alpha", "beta"],
  githubUsernames: ["alpha-gh", "beta-gh"],
  plannedStudentPermission: "admin",
  facultyTeam: "faculty",
  facultyTeamPermission: "push",
  graderTeam: "graders",
  graderTeamPermission: "maintain",
  ...overrides
});

const resultGroupTarget = (
  overrides: Partial<ApplyResultGroupTarget> = {}
): ApplyResultGroupTarget => ({
  groupId: "team-1",
  repositoryName: "org/team-1",
  htmlUrl: "https://github.com/org/team-1",
  cloneUrl: "https://github.com/org/team-1.git",
  studentIds: ["alpha", "beta"],
  githubUsernames: ["alpha-gh", "beta-gh"],
  status: "created",
  diagnostics: [],
  ...overrides
});

const preview = (overrides: Partial<NormalizedApplyPreview> = {}): NormalizedApplyPreview => ({
  status: "success",
  refreshedAt: null,
  diagnostics: [],
  repositoryMode: "individual",
  applySupported: true,
  assignment: { slug: "lab02", title: "Lab 02", file: null, status: "active" },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: { sections: ["001"], sectionCount: 1, studentCount: 1 },
  template: {
    repository: null,
    branch: null,
    status: null,
    repositoryStatus: null,
    branchStatus: null
  },
  grading: {
    enabled: false,
    mode: null,
    workflow: null,
    artifact: null,
    resultFile: null,
    workflowStatus: null,
    workflowDispatch: null
  },
  plan: { summary: emptyPlanSummary(), repositories: [], groupTargets: [] },
  files: { assignmentFile: null, workflowFile: null, templateSource: null },
  actions: { apply: { available: true, implemented: false, previewOnly: true, reason: null } },
  ...overrides
});

function emptyPlanSummary() {
  return {
    wouldCreateRepositories: 0,
    wouldUpdateRepositories: 0,
    wouldSkipRepositories: 0,
    blockedRepositories: 0,
    unknownRepositories: 0
  };
}

const result = (overrides: Partial<NormalizedApplyResult> = {}): NormalizedApplyResult => ({
  status: "success",
  exitCode: 0,
  appliedAt: "2026-06-10T15:00:00.000Z",
  assignmentFile: null,
  diagnostics: [],
  generatedFiles: [],
  summary: {
    createdRepositories: 0,
    updatedRepositories: 0,
    skippedRepositories: 0,
    failedRepositories: 0,
    blockedRepositories: 0
  },
  rows: [],
  manifestFile: null,
  repositoryMode: "individual",
  targetCount: null,
  studentMappingCount: null,
  groupTargets: [],
  rawSummary: {},
  ...overrides
});

describe("mergeApplyRows", () => {
  it("carries every preview row through with no result status before apply runs", () => {
    const merged = mergeApplyRows(
      preview({
        plan: {
          summary: emptyPlanSummary(),
          repositories: [previewRow(), previewRow({ studentId: "s002", status: "blocked" })],
          groupTargets: []
        }
      }),
      null
    );

    expect(merged).toHaveLength(2);
    expect(merged.every((row) => row.resultStatus === null)).toBe(true);
    expect(merged[0]?.previewStatus).toBe("would_create");
    expect(merged[1]?.previewStatus).toBe("blocked");
  });

  it("updates a row's status in place once its result matches, by student identity", () => {
    const merged = mergeApplyRows(
      preview({
        plan: { summary: emptyPlanSummary(), repositories: [previewRow()], groupTargets: [] }
      }),
      result({ rows: [resultRow()] })
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.previewStatus).toBe("would_create");
    expect(merged[0]?.resultStatus).toBe("created");
    expect(formatMergedRowStatus(merged[0]!)).toBe("Created");
  });

  it("keeps a row that apply never attempted (blocked pre-apply) as its preview status", () => {
    const merged = mergeApplyRows(
      preview({
        plan: {
          summary: emptyPlanSummary(),
          repositories: [previewRow({ status: "blocked", reason: "invalid_repository_name" })],
          groupTargets: []
        }
      }),
      result({ rows: [] })
    );

    expect(merged[0]?.resultStatus).toBeNull();
    expect(formatMergedRowStatus(merged[0]!)).toBe("Blocked");
    expect(mergedRowNeedsAttention(merged[0]!)).toBe(true);
  });

  it("appends a result row that has no matching preview row instead of dropping it", () => {
    const merged = mergeApplyRows(
      preview({ plan: { summary: emptyPlanSummary(), repositories: [], groupTargets: [] } }),
      result({ rows: [resultRow({ studentId: "s999" })] })
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.studentId).toBe("s999");
    expect(merged[0]?.resultStatus).toBe("created");
  });
});

describe("mergeApplyGroupRows", () => {
  it("synthesizes would_create for every group when apply is supported", () => {
    const merged = mergeApplyGroupRows(
      preview({
        repositoryMode: "group",
        applySupported: true,
        plan: {
          summary: emptyPlanSummary(),
          repositories: [],
          groupTargets: [previewGroupTarget(), previewGroupTarget({ groupId: "team-2" })]
        }
      }),
      null
    );

    expect(merged).toHaveLength(2);
    expect(merged.every((row) => row.previewStatus === "would_create")).toBe(true);
  });

  it("synthesizes blocked for every group when apply is not supported", () => {
    const merged = mergeApplyGroupRows(
      preview({
        repositoryMode: "group",
        applySupported: false,
        plan: {
          summary: emptyPlanSummary(),
          repositories: [],
          groupTargets: [previewGroupTarget()]
        }
      }),
      null
    );

    expect(merged[0]?.previewStatus).toBe("blocked");
  });

  it("updates a group's status in place once its result matches, by group identity", () => {
    const merged = mergeApplyGroupRows(
      preview({
        repositoryMode: "group",
        plan: {
          summary: emptyPlanSummary(),
          repositories: [],
          groupTargets: [previewGroupTarget()]
        }
      }),
      result({ repositoryMode: "group", groupTargets: [resultGroupTarget()] })
    );

    expect(merged[0]?.resultStatus).toBe("created");
    expect(formatMergedGroupRowStatus(merged[0]!)).toBe("Created");
    expect(merged[0]?.htmlUrl).toBe("https://github.com/org/team-1");
  });

  it("falls back through formatStatusLabel for a group result status outside the known set", () => {
    const merged = mergeApplyGroupRows(
      preview({
        repositoryMode: "group",
        plan: {
          summary: emptyPlanSummary(),
          repositories: [],
          groupTargets: [previewGroupTarget()]
        }
      }),
      result({ repositoryMode: "group", groupTargets: [resultGroupTarget({ status: "pending" })] })
    );

    expect(formatMergedGroupRowStatus(merged[0]!)).toBe("Pending");
  });

  it("never drops a row's attention state for a blocked or failed result", () => {
    expect(
      mergedGroupRowNeedsAttention({
        groupId: "team-1",
        repositoryName: null,
        sectionIds: [],
        studentIds: [],
        githubUsernames: [],
        plannedStudentPermission: null,
        facultyTeam: null,
        facultyTeamPermission: null,
        graderTeam: null,
        graderTeamPermission: null,
        previewStatus: "would_create",
        resultStatus: "failed",
        htmlUrl: null,
        diagnostics: []
      })
    ).toBe(true);
  });
});

describe("getApplyPlanSummaryText", () => {
  it("matches README section 2.3's own example for individual pre-apply counts", () => {
    const rows = mergeApplyRows(
      preview({
        plan: {
          summary: emptyPlanSummary(),
          repositories: [
            previewRow({ studentId: "s001", status: "would_create" }),
            previewRow({ studentId: "s002", status: "would_create" }),
            previewRow({ studentId: "s003", status: "would_skip" })
          ],
          groupTargets: []
        }
      }),
      null
    );

    expect(getApplyPlanSummaryText(preview(), false, rows, [])).toBe(
      "2 repositories will be created, 1 skipped."
    );
  });

  it("omits zero-count clauses entirely", () => {
    const rows = mergeApplyRows(
      preview({
        plan: {
          summary: emptyPlanSummary(),
          repositories: [previewRow({ status: "blocked" })],
          groupTargets: []
        }
      }),
      null
    );

    expect(getApplyPlanSummaryText(preview(), false, rows, [])).toBe("1 repository is blocked.");
  });

  it("switches to past tense and counts a never-attempted row as blocked once a result exists", () => {
    const rows = mergeApplyRows(
      preview({
        plan: {
          summary: emptyPlanSummary(),
          repositories: [
            previewRow({ studentId: "s001", status: "would_create" }),
            previewRow({ studentId: "s002", status: "blocked" })
          ],
          groupTargets: []
        }
      }),
      result({ rows: [resultRow({ studentId: "s001", status: "created" })] })
    );

    expect(getApplyPlanSummaryText(preview(), true, rows, [])).toBe(
      "1 repository was created, 1 blocked."
    );
  });

  it("builds a group-mode sentence from the merged group rows, not the raw plan summary", () => {
    const groupRows = mergeApplyGroupRows(
      preview({
        repositoryMode: "group",
        applySupported: true,
        plan: {
          summary: emptyPlanSummary(),
          repositories: [],
          groupTargets: [previewGroupTarget(), previewGroupTarget({ groupId: "team-2" })]
        }
      }),
      null
    );

    expect(
      getApplyPlanSummaryText(preview({ repositoryMode: "group" }), false, [], groupRows)
    ).toBe("2 group repositories will be created.");
  });
});
