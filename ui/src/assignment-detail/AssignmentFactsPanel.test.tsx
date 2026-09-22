import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssignmentFactsPanel } from "./AssignmentFactsPanel";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

const createDetail = (
  overrides: Partial<NormalizedAssignmentDetail> = {}
): NormalizedAssignmentDetail => ({
  status: "success",
  refreshedAt: "2026-06-10T13:00:00.000Z",
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
  metadata: {
    facultyOwner: "professor",
    lmsAssignmentId: "lms-123",
    gradingCategory: "labs",
    points: 100
  },
  deadline: { dueAt: "2027-06-15T23:59:00+09:00", latePolicy: "standard" },
  sections: ["001", "002"],
  roster: { sectionCount: 2, activeStudentCount: 3, totalStudentCount: 3 },
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

describe("AssignmentFactsPanel", () => {
  // Moved from AssignmentDetailPage.test.tsx ("renders the assignment facts
  // Template row as a link to the repository, not a raw path") -- same
  // input, same assertions; only the render harness changed from the full
  // page to this panel directly.
  it("renders the Template row as a link to the repository, not a raw path", () => {
    render(<AssignmentFactsPanel detail={createDetail()} />);

    const factsSection = screen
      .getByRole("heading", { level: 2, name: "Assignment facts" })
      .closest("section") as HTMLElement;
    const templateLink = within(factsSection).getByRole("link", { name: "csc1120L2Template" });
    expect(templateLink).toHaveAttribute(
      "href",
      "https://github.com/graider-sandbox/csc1120L2Template"
    );
    expect(within(factsSection).queryByText("graider-sandbox/csc1120L2Template")).toBeNull();
  });

  // Moved from AssignmentDetailPage.test.tsx ("shows a plain placeholder,
  // not a broken link, when no template repository is configured").
  it("shows a plain placeholder, not a broken link, when no template repository is configured", () => {
    render(
      <AssignmentFactsPanel
        detail={createDetail({
          template: {
            repository: null,
            branch: null,
            status: "missing",
            repositoryStatus: "missing",
            branchStatus: "not_checked"
          }
        })}
      />
    );

    const factsSection = screen
      .getByRole("heading", { level: 2, name: "Assignment facts" })
      .closest("section") as HTMLElement;
    expect(within(factsSection).queryByRole("link")).toBeNull();
    expect(within(factsSection).getByText("Not configured")).toBeInTheDocument();
  });

  // Moved from AssignmentDetailPage.test.tsx ("shows the Grading fact in
  // plain language, combining enabled state and mode").
  it("shows the Grading fact in plain language, combining enabled state and mode", () => {
    render(
      <AssignmentFactsPanel
        detail={createDetail({
          grading: {
            enabled: true,
            mode: "preset",
            workflow: ".github/workflows/grade.yml",
            artifact: "grading-results",
            resultFile: "grading-results.json",
            workflowStatus: "available",
            workflowDispatch: "available"
          }
        })}
      />
    );

    const factsSection = screen
      .getByRole("heading", { level: 2, name: "Assignment facts" })
      .closest("section") as HTMLElement;
    expect(within(factsSection).getByText("Grading enabled (Preset)")).toBeInTheDocument();
  });

  it("shows plain 'No grading' when grading is disabled, regardless of mode", () => {
    render(
      <AssignmentFactsPanel
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
      />
    );

    const factsSection = screen
      .getByRole("heading", { level: 2, name: "Assignment facts" })
      .closest("section") as HTMLElement;
    expect(within(factsSection).getByText("No grading")).toBeInTheDocument();
  });
});
