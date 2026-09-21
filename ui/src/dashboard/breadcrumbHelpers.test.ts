import { describe, expect, it } from "vitest";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";
import { buildAssignmentBreadcrumbs, buildRosterBreadcrumbs } from "./breadcrumbHelpers";
import type { DashboardCard } from "./dashboardTypes";

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

describe("buildAssignmentBreadcrumbs", () => {
  it("without a trailing label, ends on the assignment title as the current page", () => {
    expect(buildAssignmentBreadcrumbs(SELECTION)).toEqual([
      { label: "Dashboard", to: "/" },
      { label: "CSC1120 · Spring 2027" },
      { label: "Lab 02" }
    ]);
  });

  it("with a trailing label, links the assignment title back to assignment detail", () => {
    expect(buildAssignmentBreadcrumbs(SELECTION, "Apply")).toEqual([
      { label: "Dashboard", to: "/" },
      { label: "CSC1120 · Spring 2027" },
      { label: "Lab 02", to: "/course/csc1120/27s1/lab02" },
      { label: "Apply" }
    ]);
  });

  it("falls back to slugs when titles are null", () => {
    const selection: AssignmentDetailSelection = {
      ...SELECTION,
      courseTitle: null,
      termTitle: null,
      assignmentTitle: null
    };

    expect(buildAssignmentBreadcrumbs(selection, "Edit")).toEqual([
      { label: "Dashboard", to: "/" },
      { label: "csc1120 · 27s1" },
      { label: "lab02", to: "/course/csc1120/27s1/lab02" },
      { label: "Edit" }
    ]);
  });

  it("falls back to a placeholder route slug when courseSlug/termSlug/assignmentSlug are all null", () => {
    const selection: AssignmentDetailSelection = {
      ...SELECTION,
      courseSlug: null,
      termSlug: null,
      assignmentSlug: null,
      courseTitle: null,
      termTitle: null,
      assignmentTitle: null
    };

    const result = buildAssignmentBreadcrumbs(selection, "Report");

    expect(result[2]).toEqual({ label: "unknown", to: "/course/unknown/unknown/unknown" });
  });
});

describe("buildRosterBreadcrumbs", () => {
  const CARD: DashboardCard = {
    kind: "course-term",
    displayName: "27s1-csc1120",
    courseSlug: "csc1120",
    courseTitle: "CSC1120",
    coursePath: ".",
    termSlug: "27s1",
    termTitle: "Spring 2027",
    status: "active",
    needsAttention: false,
    attentionCount: 0,
    roster: null,
    assignmentCount: 0,
    assignments: [],
    recentAssignments: [],
    diagnostics: []
  };

  it("ends on Roster as the current page", () => {
    expect(buildRosterBreadcrumbs(CARD)).toEqual([
      { label: "Dashboard", to: "/" },
      { label: "CSC1120 · Spring 2027" },
      { label: "Roster" }
    ]);
  });
});
