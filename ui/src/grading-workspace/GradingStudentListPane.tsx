import type { ReactElement, RefObject } from "react";
import type { StudentSort, StudentSortKey } from "./studentSort";
import { FilterPills } from "../components/FilterPills";

export interface GradingStudentListEntry {
  readonly student: {
    readonly studentId: string;
    readonly section: string;
    readonly firstName?: string;
    readonly lastName?: string;
  };
  readonly index: number;
  readonly status: string;
}

export type StudentFilterId = "to_grade" | "graded" | "published" | "all";

export const GradingStudentListPane = ({
  sort,
  onSortChange,
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
  readonly sort?: StudentSort;
  readonly onSortChange?: (sort: StudentSort) => void;
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
    {sort === undefined || onSortChange === undefined ? null : (
      <div className="grading-student-sort">
        <label>
          Sort by{" "}
          <select
            value={sort.key}
            onChange={(event) =>
              onSortChange({ ...sort, key: event.currentTarget.value as StudentSortKey })
            }
          >
            <option value="default">Roster order</option>
            <option value="section">Section</option>
            <option value="firstName">First name</option>
            <option value="lastName">Last name</option>
          </select>
        </label>
        <button
          type="button"
          className="secondary-action"
          aria-label={`Sort ${sort.direction === "ascending" ? "descending" : "ascending"}`}
          disabled={sort.key === "default"}
          onClick={() =>
            onSortChange({
              ...sort,
              direction: sort.direction === "ascending" ? "descending" : "ascending"
            })
          }
        >
          {sort.direction === "ascending" ? "↑" : "↓"}
        </button>
      </div>
    )}
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
