import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AssignmentGradingLifecycleResult } from "../../electron/ipc";
import type {
  GradeStatusRepositoryRow,
  NormalizedGradeStatus
} from "../grade-status/gradeStatusTypes";
import { AssignmentDetailStudentTable } from "./AssignmentDetailStudentTable";

const POINTS_POSSIBLE = 100;
const PUBLISHED_SCORE = 90;
const ZERO_SCORE = 0;

type StudentRow = Extract<
  AssignmentGradingLifecycleResult,
  { readonly status: "success" }
>["students"][number];

const STUDENTS: readonly StudentRow[] = [
  {
    studentId: "amy",
    githubUsername: "amygh",
    section: "001",
    gradingStatus: "not_started",
    score: null
  },
  {
    studentId: "ben",
    githubUsername: "bengh",
    section: "001",
    gradingStatus: "in_progress",
    score: null
  },
  {
    studentId: "cara",
    githubUsername: "caragh",
    section: "002",
    gradingStatus: "complete",
    score: ZERO_SCORE
  },
  {
    studentId: "drew",
    githubUsername: "drewgh",
    section: "002",
    gradingStatus: "published",
    score: PUBLISHED_SCORE
  },
  {
    studentId: "erin",
    githubUsername: "eringh",
    section: "001",
    gradingStatus: "unknown",
    score: null
  }
];

const createLifecycleResult = (
  students: readonly StudentRow[],
  pointsPossible = POINTS_POSSIBLE
): AssignmentGradingLifecycleResult => ({
  status: "success",
  students,
  totalStudentCount: students.length,
  gradingDoneCount: students.filter(
    (student) => student.gradingStatus === "complete" || student.gradingStatus === "published"
  ).length,
  publishedCount: students.filter((student) => student.gradingStatus === "published").length,
  unknownStatusCount: students.filter((student) => student.gradingStatus === "unknown").length,
  pointsPossible
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
  target: { sections: ["001", "002"], sectionCount: 2, studentCount: 5, activeStudentCount: 5 },
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

const createGradeStatusRow = (
  overrides: Partial<GradeStatusRepositoryRow> = {}
): GradeStatusRepositoryRow => ({
  studentUsername: null,
  studentId: null,
  githubUsername: null,
  section: null,
  repository: null,
  workflow: null,
  ref: null,
  runId: null,
  runUrl: null,
  status: "completed",
  conclusion: "success",
  startedAt: null,
  completedAt: null,
  selectionStrategy: null,
  reason: null,
  needsAttention: false,
  diagnostics: [],
  ...overrides
});

describe("AssignmentDetailStudentTable", () => {
  it("defaults to the Needs grading filter on first render", () => {
    render(
      <AssignmentDetailStudentTable
        lifecycleResult={createLifecycleResult(STUDENTS)}
        gradeStatus={null}
      />
    );

    expect(screen.getByRole("button", { name: "Needs grading 2" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("amy")).toBeInTheDocument();
    expect(screen.getByText("ben")).toBeInTheDocument();
    expect(screen.queryByText("cara")).toBeNull();
    expect(screen.queryByText("erin")).toBeNull();
  });

  it("filters to the right rows for each pill, and the counts match", () => {
    render(
      <AssignmentDetailStudentTable
        lifecycleResult={createLifecycleResult(STUDENTS)}
        gradeStatus={null}
      />
    );

    expect(screen.getByRole("button", { name: "Needs grading 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All 5" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done 2" }));
    expect(screen.getByText("cara")).toBeInTheDocument();
    expect(screen.getByText("drew")).toBeInTheDocument();
    expect(screen.queryByText("amy")).toBeNull();
    expect(screen.queryByText("erin")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "All 5" }));
    expect(screen.getByText("amy")).toBeInTheDocument();
    expect(screen.getByText("ben")).toBeInTheDocument();
    expect(screen.getByText("cara")).toBeInTheDocument();
    expect(screen.getByText("drew")).toBeInTheDocument();
    expect(screen.getByText("erin")).toBeInTheDocument();
  });

  it("renders a zero score as 0 and a null score as empty", () => {
    render(
      <AssignmentDetailStudentTable
        lifecycleResult={createLifecycleResult(STUDENTS)}
        gradeStatus={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Done 2" }));

    const caraRow = screen.getByText("cara").closest("tr");
    const drewRow = screen.getByText("drew").closest("tr");
    expect(within(caraRow as HTMLTableRowElement).getByText("0 / 100")).toBeInTheDocument();
    expect(within(drewRow as HTMLTableRowElement).getByText("90 / 100")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Needs grading 2" }));
    const amyRow = screen.getByText("amy").closest("tr");
    const amyCells = within(amyRow as HTMLTableRowElement).getAllByRole("cell");
    const gradeCellIndex = 2; // Student, Section, Grade, Checks, Status
    expect(amyCells[gradeCellIndex]).toHaveTextContent("");
  });

  it("omits the Grade column entirely when pointsPossible is 0", () => {
    render(
      <AssignmentDetailStudentTable
        lifecycleResult={createLifecycleResult(STUDENTS, 0)}
        gradeStatus={null}
      />
    );

    expect(screen.queryByRole("columnheader", { name: "Grade" })).toBeNull();
  });

  it("shows an unknown student only under All, with the Status unavailable chip", () => {
    render(
      <AssignmentDetailStudentTable
        lifecycleResult={createLifecycleResult(STUDENTS)}
        gradeStatus={null}
      />
    );

    expect(screen.queryByText("erin")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done 2" }));
    expect(screen.queryByText("erin")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "All 5" }));
    const erinRow = screen.getByText("erin").closest("tr");
    expect(
      within(erinRow as HTMLTableRowElement).getByText("Status unavailable")
    ).toBeInTheDocument();
  });

  it("renders an empty Checks cell for a student with no matching grade-status row", () => {
    render(
      <AssignmentDetailStudentTable
        lifecycleResult={createLifecycleResult(STUDENTS)}
        gradeStatus={createGradeStatus([createGradeStatusRow({ studentId: "ben" })])}
      />
    );

    const amyRow = screen.getByText("amy").closest("tr");
    const amyCells = within(amyRow as HTMLTableRowElement).getAllByRole("cell");
    const checksCellIndex = 3; // Student, Section, Grade, Checks, Status
    expect(amyCells[checksCellIndex]).toHaveTextContent("");

    const benRow = screen.getByText("ben").closest("tr");
    expect(
      within(benRow as HTMLTableRowElement).getByText("Completed — success")
    ).toBeInTheDocument();
  });

  it("shows an empty state when the assignment has no active students at all", () => {
    render(
      <AssignmentDetailStudentTable
        lifecycleResult={createLifecycleResult([])}
        gradeStatus={null}
      />
    );

    expect(screen.getByText("No active students yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows a distinct empty state when students exist but the active filter matches none", () => {
    const noneDone = STUDENTS.filter(
      (student) => student.gradingStatus !== "complete" && student.gradingStatus !== "published"
    );
    render(
      <AssignmentDetailStudentTable
        lifecycleResult={createLifecycleResult(noneDone)}
        gradeStatus={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Done 0" }));

    expect(screen.getByText("No students have been graded or published yet.")).toBeInTheDocument();
  });

  it("does not render the table when the lifecycle result has not resolved", () => {
    render(<AssignmentDetailStudentTable lifecycleResult={null} gradeStatus={null} />);

    expect(screen.getByText("No active students yet")).toBeInTheDocument();
  });
});
