import type { ReactElement, RefObject } from "react";
import { FilterPills } from "../components/FilterPills";

export interface GradingStudentListEntry {
  readonly student: { readonly studentId: string; readonly section: string };
  readonly index: number;
  readonly status: string;
}

export type StudentFilterId = "to_grade" | "graded" | "published" | "all";

export const GradingStudentListPane = ({
  totalStudentsCount,
  filteredStudents,
  selectedIndex,
  studentFilter,
  onFilterChange,
  filterPillsContainerRef,
  toGradeCount,
  gradedOnlyCount,
  publishedCount,
  allStudentsCount,
  emptyMessage,
  statusLabel,
  onSelectStudent,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext
}: {
  readonly totalStudentsCount: number;
  readonly filteredStudents: readonly GradingStudentListEntry[];
  readonly selectedIndex: number;
  readonly studentFilter: StudentFilterId;
  readonly onFilterChange: (id: StudentFilterId) => void;
  readonly filterPillsContainerRef: RefObject<HTMLDivElement | null>;
  readonly toGradeCount: number;
  readonly gradedOnlyCount: number;
  readonly publishedCount: number;
  readonly allStudentsCount: number;
  readonly emptyMessage: string;
  readonly statusLabel: (status: string) => string;
  readonly onSelectStudent: (index: number) => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
}): ReactElement => (
  <aside>
    <h2>Students</h2>
    {totalStudentsCount === 0 ? null : (
      <div ref={filterPillsContainerRef}>
        <FilterPills
          pills={[
            { id: "to_grade", label: "To grade", count: toGradeCount },
            { id: "graded", label: "Graded", count: gradedOnlyCount },
            { id: "published", label: "Published", count: publishedCount },
            { id: "all", label: "All", count: allStudentsCount }
          ]}
          activeId={studentFilter}
          onSelect={(id) => onFilterChange(id as StudentFilterId)}
          aria-label="Filter students by grading status"
        />
      </div>
    )}
    {totalStudentsCount === 0 ? (
      <p>No assigned students.</p>
    ) : filteredStudents.length === 0 ? (
      <p>{emptyMessage}</p>
    ) : (
      filteredStudents.map(({ student: item, index, status }) => (
        <button
          key={item.studentId}
          className={
            index === selectedIndex
              ? "grading-workspace__student-row selected"
              : "grading-workspace__student-row"
          }
          onClick={() => onSelectStudent(index)}
        >
          {item.studentId} · Section {item.section} · {statusLabel(status)}
        </button>
      ))
    )}
    <div className="grading-workspace__pagination">
      <button
        className="secondary-action"
        type="button"
        disabled={!hasPrevious}
        onClick={onPrevious}
      >
        Previous
      </button>
      <button className="secondary-action" type="button" disabled={!hasNext} onClick={onNext}>
        {studentFilter === "to_grade" ? "Next ungraded" : "Next"}
      </button>
    </div>
    {hasNext ? null : (
      <p className="grading-workspace__pagination-note">No other visible students.</p>
    )}
  </aside>
);
