import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TemplateWorkflowResult } from "../../electron/ipc";
import { GradeWorkflowPanel } from "./GradeWorkflowPanel";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

const createDetail = (
  overrides: Partial<Pick<NormalizedAssignmentDetail, "grading" | "template">> = {}
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
    repository: "graider-sandbox/csc1120L2Template",
    branch: "main",
    status: "available",
    repositoryStatus: "available",
    branchStatus: "available"
  },
  grading: {
    enabled: true,
    mode: "custom-workflow",
    workflow: ".github/workflows/grade.yml",
    artifact: "grading-results",
    resultFile: "grading-results.json",
    workflowStatus: "available",
    workflowDispatch: "available"
  },
  studentReports: { enabled: false, mode: "disabled" },
  applyState: { status: "not_applied" },
  actions: {
    validate: { available: true, implemented: true, reason: null },
    apply: { available: true, implemented: false, reason: null },
    grade: { available: true, implemented: false, reason: null },
    report: { available: true, implemented: false, reason: null },
    publishStudentReports: { available: false, implemented: false, reason: null },
    generateWorkflow: { available: true, implemented: false, reason: null }
  },
  ...overrides
});

describe("GradeWorkflowPanel", () => {
  it("disables View workflow when grading or the template repository is not configured", () => {
    render(
      <GradeWorkflowPanel
        detail={createDetail({
          grading: {
            enabled: false,
            mode: "no-grading",
            workflow: null,
            artifact: null,
            resultFile: null,
            workflowStatus: "not_required",
            workflowDispatch: "not_required"
          }
        })}
        workflowResult={null}
        draft=""
        preview={null}
        isLoading={false}
        isPushing={false}
        onViewWorkflow={vi.fn()}
        onDraftChange={vi.fn()}
        onPreview={vi.fn()}
        onPush={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "View workflow" })).toBeDisabled();
    expect(
      screen.getByText("Grading or the template repository is not configured.")
    ).toBeInTheDocument();
  });

  it("shows a draft editor once the workflow loads, and reports the fetched fields", () => {
    const workflowResult: TemplateWorkflowResult = {
      status: "success",
      repository: "graider-sandbox/csc1120L2Template",
      branch: "main",
      path: ".github/workflows/grade.yml",
      content: "name: Grade",
      sha: "abc123",
      diagnostics: []
    };
    const onDraftChange = vi.fn();

    render(
      <GradeWorkflowPanel
        detail={createDetail()}
        workflowResult={workflowResult}
        draft="name: Grade"
        preview={null}
        isLoading={false}
        isPushing={false}
        onViewWorkflow={vi.fn()}
        onDraftChange={onDraftChange}
        onPreview={vi.fn()}
        onPush={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "View workflow" })).toBeEnabled();
    expect(screen.getByLabelText("Grade workflow draft")).toHaveValue("name: Grade");
    expect(screen.getByRole("button", { name: "Preview save" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Grade workflow draft"), {
      target: { value: "name: Grade v2" }
    });
    expect(onDraftChange).toHaveBeenCalledWith("name: Grade v2");
  });
});
