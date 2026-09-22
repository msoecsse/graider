import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadinessPanel } from "./ReadinessPanel";
import type {
  AssignmentNeedsAttentionItem,
  NormalizedAssignmentDetail
} from "./assignmentDetailTypes";

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

describe("ReadinessPanel", () => {
  it("shows the needs-attention label and lists each attention item when the assignment has an error diagnostic", () => {
    const items: readonly AssignmentNeedsAttentionItem[] = [
      {
        id: "template-repository",
        title: "Template repository is missing.",
        description: "Configure a template repository before applying.",
        category: "Template"
      }
    ];

    render(
      <ReadinessPanel
        detail={createDetail({
          diagnostics: [
            {
              code: "assignment_detail_template_repository_missing",
              severity: "error",
              message: "Template repository missing.",
              context: {}
            }
          ]
        })}
        needsAttentionItems={items}
      />
    );

    expect(screen.getByRole("heading", { level: 2, name: "Readiness" })).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Template repository is missing.")).toBeInTheDocument();
    expect(
      screen.getByText("Configure a template repository before applying.")
    ).toBeInTheDocument();
  });

  it("omits the attention list when there is nothing to show", () => {
    render(<ReadinessPanel detail={createDetail()} needsAttentionItems={[]} />);

    expect(screen.queryByRole("list", { name: "Readiness items needing attention" })).toBeNull();
  });
});
