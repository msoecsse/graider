import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradingStudentListPane, type GradingStudentListEntry } from "./GradingStudentListPane";

const entries: readonly GradingStudentListEntry[] = [
  { student: { studentId: "ada", section: "001" }, index: 0, status: "not_started" },
  { student: { studentId: "bea", section: "002" }, index: 1, status: "complete" }
];

const baseProps = {
  totalStudentsCount: 2,
  filteredStudents: entries,
  selectedIndex: 0,
  studentFilter: "all" as const,
  onFilterChange: vi.fn(),
  filterPillsContainerRef: { current: null },
  toGradeCount: 1,
  gradedOnlyCount: 1,
  publishedCount: 0,
  allStudentsCount: 2,
  emptyMessage: "No assigned students.",
  statusLabel: (status: string) => status,
  onSelectStudent: vi.fn(),
  onPrevious: vi.fn(),
  onNext: vi.fn(),
  hasPrevious: false,
  hasNext: true
};

describe("GradingStudentListPane", () => {
  it("renders each filtered student and selects one on click", () => {
    const onSelectStudent = vi.fn();
    render(<GradingStudentListPane {...baseProps} onSelectStudent={onSelectStudent} />);

    expect(screen.getByText("ada · Section 001 · not_started")).toBeInTheDocument();
    fireEvent.click(screen.getByText("bea · Section 002 · complete"));
    expect(onSelectStudent).toHaveBeenCalledWith(1);
  });

  it("shows the empty message and disables pagination appropriately when there are no filtered students", () => {
    render(
      <GradingStudentListPane
        {...baseProps}
        filteredStudents={[]}
        hasPrevious={false}
        hasNext={false}
      />
    );

    expect(screen.getByText("No assigned students.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByText("No other visible students.")).toBeInTheDocument();
  });

  it("uses the active filter to label next navigation", () => {
    render(<GradingStudentListPane {...baseProps} studentFilter="graded" />);

    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("disables navigation for a one-student filter to avoid reloading the same student", () => {
    render(
      <GradingStudentListPane
        {...baseProps}
        filteredStudents={[entries[0] as GradingStudentListEntry]}
        hasPrevious={false}
        hasNext={false}
      />
    );

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
