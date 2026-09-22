import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudentReportsPanel } from "./StudentReportsPanel";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

const createDetail = (
  studentReports: NormalizedAssignmentDetail["studentReports"]
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
  grading: {
    enabled: false,
    mode: "no-grading",
    workflow: null,
    artifact: null,
    resultFile: null,
    workflowStatus: "not_required",
    workflowDispatch: "not_required"
  },
  studentReports,
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

describe("StudentReportsPanel", () => {
  it("renders the enabled state and mode", () => {
    render(<StudentReportsPanel detail={createDetail({ enabled: true, mode: "pdf" })} />);

    expect(screen.getByRole("heading", { level: 2, name: "Student reports" })).toBeInTheDocument();
    expect(screen.getByText("Enabled", { selector: "dd span" })).toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
  });

  it("renders the disabled state", () => {
    render(<StudentReportsPanel detail={createDetail({ enabled: false, mode: "disabled" })} />);

    expect(screen.getByText("Disabled", { selector: "dd span" })).toBeInTheDocument();
  });
});
