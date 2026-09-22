import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradeStatusSummaryPanel } from "./GradeStatusSummaryPanel";
import type {
  GradeStatusRepositoryRow,
  NormalizedGradeStatus
} from "../grade-status/gradeStatusTypes";

const createRow = (
  overrides: Partial<GradeStatusRepositoryRow> = {}
): GradeStatusRepositoryRow => ({
  studentUsername: null,
  studentId: "s001",
  githubUsername: "adalovelace",
  section: "001",
  repository: "graider-sandbox/csc1120-lab02-ada",
  workflow: ".github/workflows/grade.yml",
  ref: "main",
  runId: 123,
  runUrl: "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123",
  status: "completed",
  conclusion: "success",
  startedAt: "2026-06-12T17:32:49Z",
  completedAt: "2026-06-12T17:33:39Z",
  selectionStrategy: "latest_configured_workflow_run",
  reason: "success",
  needsAttention: false,
  diagnostics: [],
  ...overrides
});

const createGradeStatus = (
  repositories: readonly GradeStatusRepositoryRow[]
): NormalizedGradeStatus => ({
  status: "success",
  exitCode: 0,
  refreshedAt: "2026-06-10T13:00:00.000Z",
  diagnostics: [],
  assignment: { slug: "lab02", title: "Lab 02", file: "assignment.yml", status: "active" },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: { sections: ["001"], sectionCount: 1, studentCount: 1, activeStudentCount: 1 },
  grading: {
    enabled: true,
    resolvedFrom: "assignment_override",
    mode: "custom-workflow",
    workflow: ".github/workflows/grade.yml",
    artifact: "grading-results",
    resultFile: "results.json",
    workflowRef: "main"
  },
  summary: {
    totalRepositories: repositories.length,
    queued: 0,
    inProgress: 0,
    completed: repositories.length,
    successful: repositories.length,
    failed: 0,
    cancelled: 0,
    timedOut: 0,
    missing: 0,
    unknown: 0,
    blocked: 0,
    needsAttention: 0,
    readyForReport: true
  },
  repositories
});

describe("GradeStatusSummaryPanel", () => {
  it("renders one row per repository with a repository link and a run link", () => {
    render(
      <GradeStatusSummaryPanel
        status={createGradeStatus([createRow()])}
        isLoading={false}
        errorMessage={null}
        onViewFullGradeStatus={vi.fn()}
        canUpdateRepositories={false}
        isTemplateSyncPending={false}
        onUpdateRepository={vi.fn()}
      />
    );

    expect(screen.getByText("s001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "csc1120-lab02-ada" })).toHaveAttribute(
      "href",
      "https://github.com/graider-sandbox/csc1120-lab02-ada"
    );
    expect(screen.getByRole("link", { name: "Open run" })).toHaveAttribute(
      "href",
      "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123"
    );
  });

  it("shows the Update Repository action only when repositories can be updated, and calls back with the student id", () => {
    const onUpdateRepository = vi.fn();
    render(
      <GradeStatusSummaryPanel
        status={createGradeStatus([createRow()])}
        isLoading={false}
        errorMessage={null}
        onViewFullGradeStatus={vi.fn()}
        canUpdateRepositories
        isTemplateSyncPending={false}
        onUpdateRepository={onUpdateRepository}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Update repository for s001" }));
    expect(onUpdateRepository).toHaveBeenCalledWith("s001");
  });

  it("hides the Update Repository action when repositories cannot be updated (group mode)", () => {
    render(
      <GradeStatusSummaryPanel
        status={createGradeStatus([createRow()])}
        isLoading={false}
        errorMessage={null}
        onViewFullGradeStatus={vi.fn()}
        canUpdateRepositories={false}
        isTemplateSyncPending={false}
        onUpdateRepository={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Update repository for s001" })).toBeNull();
  });

  it("shows a plain message when grade status data is not available yet", () => {
    render(
      <GradeStatusSummaryPanel
        status={null}
        isLoading={false}
        errorMessage={null}
        onViewFullGradeStatus={vi.fn()}
        canUpdateRepositories={false}
        isTemplateSyncPending={false}
        onUpdateRepository={vi.fn()}
      />
    );

    expect(screen.getByText("Grade status data is not available yet.")).toBeInTheDocument();
  });
});
