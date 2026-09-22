import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TemplatePanel } from "./TemplatePanel";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

const createDetail = (
  template: NormalizedAssignmentDetail["template"]
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
  template,
  grading: {
    enabled: false,
    mode: "no-grading",
    workflow: null,
    artifact: null,
    resultFile: null,
    workflowStatus: "not_required",
    workflowDispatch: "not_required"
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
  }
});

describe("TemplatePanel", () => {
  it("renders template repository, branch, and status rows, with a working copy button", () => {
    const onCopy = vi.fn();
    render(
      <TemplatePanel
        detail={createDetail({
          repository: "graider-sandbox/csc1120L2Template",
          branch: "main",
          status: "available",
          repositoryStatus: "available",
          branchStatus: "available"
        })}
        copyState={null}
        onCopy={onCopy}
      />
    );

    expect(screen.getByRole("heading", { level: 2, name: "Template" })).toBeInTheDocument();
    expect(screen.getByText("graider-sandbox/csc1120L2Template")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy template repository" }));
    expect(onCopy).toHaveBeenCalledWith("template-repository", "graider-sandbox/csc1120L2Template");
  });

  it("omits the copy button when there is no template repository to copy", () => {
    render(
      <TemplatePanel
        detail={createDetail({
          repository: null,
          branch: null,
          status: "missing",
          repositoryStatus: "missing",
          branchStatus: "not_checked"
        })}
        copyState={null}
        onCopy={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Copy template repository" })).toBeNull();
  });
});
