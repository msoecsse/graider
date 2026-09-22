import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RosterPanel } from "./RosterPanel";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

const createDetail = (
  overrides: Partial<NormalizedAssignmentDetail> = {}
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
  sections: ["001", "002"],
  roster: { sectionCount: 2, activeStudentCount: 3, totalStudentCount: 3 },
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

describe("RosterPanel", () => {
  it("renders section list and roster counts", () => {
    render(<RosterPanel detail={createDetail()} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Roster / Sections" })
    ).toBeInTheDocument();
    expect(screen.getByText("001, 002")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText("3")).toHaveLength(2);
  });

  it("shows a plain unavailable message when the roster summary is null", () => {
    render(<RosterPanel detail={createDetail({ roster: null })} />);

    expect(screen.getByText("Roster summary unavailable.")).toBeInTheDocument();
  });
});
