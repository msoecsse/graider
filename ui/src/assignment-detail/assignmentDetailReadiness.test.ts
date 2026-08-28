import { describe, expect, it } from "vitest";
import type { AssignmentDetailJsonResponse } from "../../electron/ipc";
import { normalizeAssignmentDetail } from "./assignmentDetailNormalization";
import {
  collectNeedsAttentionItems,
  deriveAssignmentReadiness,
  groupDiagnostics
} from "./assignmentDetailReadiness";
import type { AssignmentDetailSelection } from "./assignmentDetailTypes";

const SELECTION: AssignmentDetailSelection = {
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
  assignmentTitle: "Lab 02",
  assignmentSlug: "lab02",
  assignmentStatus: "active",
  courseTitle: "CSC1120",
  courseSlug: "csc1120",
  termTitle: "Spring 2027",
  termSlug: "27s1"
};

const createDetailJson = (
  overrides: Partial<AssignmentDetailJsonResponse> = {}
): AssignmentDetailJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment detail",
  status: "success",
  exitCode: 0,
  diagnostics: [],
  course: { slug: "csc1120", title: "CSC1120", file: "course.yml" },
  term: { slug: "27s1", title: "Spring 2027", file: "terms/27s1/term.yml" },
  assignment: {
    slug: "lab02",
    title: "Lab 02",
    type: "individual",
    status: "active",
    file: SELECTION.assignmentFile
  },
  metadata: {
    facultyOwner: "professor",
    lmsAssignmentId: null,
    gradingCategory: "labs",
    points: 100
  },
  deadline: { dueAt: "2027-06-15T23:59:00+09:00", latePolicy: "standard" },
  sections: ["001"],
  roster: { sectionCount: 1, activeStudentCount: 3, totalStudentCount: 3 },
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
    validate: { available: true, implemented: true },
    apply: { available: true, implemented: false },
    grade: { available: true, implemented: false },
    report: { available: true, implemented: false },
    publishStudentReports: { available: false, implemented: false },
    generateWorkflow: { available: true, implemented: false }
  },
  ...overrides
});

const normalize = (overrides: Partial<AssignmentDetailJsonResponse> = {}) =>
  normalizeAssignmentDetail(createDetailJson(overrides), SELECTION, "2026-06-10T13:00:00.000Z");

describe("assignment detail readiness helpers", () => {
  it("derives Ready when configured checks are available", () => {
    expect(deriveAssignmentReadiness(normalize()).label).toBe("Ready");
  });

  it("flags missing template repository and branch as needs attention", () => {
    const detail = normalize({
      template: {
        repository: "owner/missing-template",
        branch: "main",
        status: "missing",
        repositoryStatus: "missing",
        branchStatus: "branch_missing"
      }
    });

    expect(deriveAssignmentReadiness(detail).label).toBe("Needs attention");
    expect(collectNeedsAttentionItems(detail).map((item) => item.title)).toEqual([
      "Template repository is missing.",
      "Template branch is missing."
    ]);
  });

  it("flags missing workflow and workflow_dispatch as needs attention", () => {
    const detail = normalize({
      grading: {
        enabled: true,
        mode: "custom-workflow",
        workflow: ".github/workflows/grade.yml",
        artifact: "grading-results",
        resultFile: "grading-results.json",
        workflowStatus: "missing",
        workflowDispatch: "missing"
      }
    });

    expect(deriveAssignmentReadiness(detail).label).toBe("Needs attention");
    expect(collectNeedsAttentionItems(detail).map((item) => item.title)).toEqual([
      "Grading workflow file is missing.",
      "Workflow does not support workflow_dispatch."
    ]);
  });

  it("treats token_required as partially checked", () => {
    const detail = normalize({
      status: "partial_success",
      diagnostics: [
        {
          code: "github_token_required",
          severity: "warning",
          message: "GitHub token required."
        }
      ],
      template: {
        repository: "owner/template",
        branch: "main",
        status: "token_required",
        repositoryStatus: "token_required",
        branchStatus: "token_required"
      }
    });

    expect(deriveAssignmentReadiness(detail).label).toBe("Partially checked");
    expect(collectNeedsAttentionItems(detail)[0]?.title).toBe(
      "GitHub authentication needed for readiness checks."
    );
  });

  it("does not flag workflow checks for no-grading assignments", () => {
    const detail = normalize({
      grading: {
        enabled: false,
        mode: "no-grading",
        workflow: null,
        artifact: null,
        resultFile: null,
        workflowStatus: "not_required",
        workflowDispatch: "not_required"
      }
    });

    expect(deriveAssignmentReadiness(detail).label).toBe("Ready");
    expect(collectNeedsAttentionItems(detail).map((item) => item.title)).not.toContain(
      "Grading workflow file is missing."
    );
  });

  it("groups diagnostics by severity and redacts sensitive values", () => {
    const detail = normalize({
      diagnostics: [
        {
          code: "assignment_detail_template_repository_missing",
          severity: "error",
          message: "Template missing.",
          context: { path: "terms/27s1/assignments/lab02/assignment.yml" }
        },
        {
          code: "github_token_required",
          severity: "warning",
          message: "Authorization: Bearer secret-token-value",
          context: { header: "Authorization: Bearer secret-token-value" }
        },
        {
          code: "assignment_detail_note",
          severity: "info",
          message: "Informational note."
        }
      ]
    });

    expect(groupDiagnostics(detail.diagnostics).map((group) => group.label)).toEqual([
      "Needs attention",
      "Warnings",
      "Info"
    ]);
    expect(JSON.stringify(detail.diagnostics)).not.toContain("secret-token-value");
    expect(JSON.stringify(detail.diagnostics)).not.toContain("Authorization: Bearer");
  });
});
