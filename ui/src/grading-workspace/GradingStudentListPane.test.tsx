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
  onNextUngraded: vi.fn(),
  hasPrevious: false,
  hasNextUngraded: true
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
        hasNextUngraded={false}
      />
    );

    expect(screen.getByText("No assigned students.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next ungraded" })).toBeDisabled();
    expect(screen.getByText("No other students need grading.")).toBeInTheDocument();
  });
});
