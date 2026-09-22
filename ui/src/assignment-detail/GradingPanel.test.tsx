import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradingPanel } from "./GradingPanel";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

const createDetail = (
  grading: NormalizedAssignmentDetail["grading"]
): NormalizedAssignmentDetail => ({
  status: "success",
  refreshedAt: null,
  diagnostics: [],
  course: { slug: "csc1120", title: "CSC1120", file: "course.yml" },
  term: { slug: "27s1", title: "Spring 2027", file: "terms/27s1/term.yml" },
  assignment: {
    slug: "lab02",
    title: "Lab 02",
    type: "individual",
    status: "active",
    file: "terms/27s1/assignments/lab02/assignment.yml"
  },
  metadata: { facultyOwner: null, lmsAssignmentId: null, gradingCategory: null, points: null },
  deadline: { dueAt: null, latePolicy: null },
  sections: ["001"],
  roster: null,
  template: {
    repository: null,
    branch: null,
    status: "missing",
    repositoryStatus: "missing",
    branchStatus: "not_checked"
  },
  grading,
  studentReports: { enabled: false, mode: "disabled" },
  applyState: { status: "not_applied" },
  actions: {
    validate: { available: true, implemented: true, reason: null },
    apply: { available: true, implemented: false, reason: null },
    grade: { available: true, implemented: false, reason: null },
    report: { available: true, implemented: false, reason: null },
    publishStudentReports: { available: false, implemented: false, reason: null },
    generateWorkflow: { available: true, implemented: false, reason: null }
  }
});

describe("GradingPanel", () => {
  it("renders grading configuration rows and copies the workflow path", () => {
    const onCopy = vi.fn();
    render(
      <GradingPanel
        detail={createDetail({
          enabled: true,
          mode: "custom-workflow",
          workflow: ".github/workflows/grade.yml",
          artifact: "grading-results",
          resultFile: "grading-results.json",
          workflowStatus: "available",
          workflowDispatch: "available"
        })}
        copyState={null}
        onCopy={onCopy}
      />
    );

    expect(screen.getByText(".github/workflows/grade.yml")).toBeInTheDocument();
    expect(screen.getByText("grading-results")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy workflow path" }));
    expect(onCopy).toHaveBeenCalledWith("workflow-path", ".github/workflows/grade.yml");
  });

  it("shows a plain note instead of a table when grading is disabled", () => {
    render(
      <GradingPanel
        detail={createDetail({
          enabled: false,
          mode: "no-grading",
          workflow: null,
          artifact: null,
          resultFile: null,
          workflowStatus: "not_required",
          workflowDispatch: "not_required"
        })}
        copyState={null}
        onCopy={vi.fn()}
      />
    );

    expect(screen.getByText("No grading configured.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy workflow path" })).toBeNull();
  });
});
