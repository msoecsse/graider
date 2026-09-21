import { useState, type ReactElement } from "react";
import type { AssignmentGradingLifecycleResult } from "../../electron/ipc";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { FilterPills, type FilterPill } from "../components/FilterPills";
import { StatusChip, type StatusChipVariant } from "../components/StatusChip";
import {
  formatGradeStatusLabel,
  getGradeStatusChipClassName
} from "../grade-status/gradeStatusLabels";
import type { NormalizedGradeStatus } from "../grade-status/gradeStatusTypes";

export interface AssignmentDetailStudentTableProps {
  readonly lifecycleResult: AssignmentGradingLifecycleResult | null;
  readonly gradeStatus: NormalizedGradeStatus | null;
}

type StudentRow = Extract<
  AssignmentGradingLifecycleResult,
  { readonly status: "success" }
>["students"][number];

// This screen's own vocabulary, deliberately different from the grading
// workspace's "To grade" / "Graded" / "Published" / "All"
// (GradingWorkspacePage.tsx). The workspace is a working queue where
// graded-but-unpublished is an actionable state; assignment detail is an
// overview, where that distinction is not something faculty act on from
// here. Do not unify the two vocabularies.
type StudentFilterId = "needs_grading" | "done" | "all";

const DEFAULT_FILTER: StudentFilterId = "needs_grading";

const FILTER_LABELS: Readonly<Record<StudentFilterId, string>> = {
  needs_grading: "Needs grading",
  done: "Done",
  all: "All"
};

// Same pattern as the grading workspace's STUDENT_FILTER_EMPTY_MESSAGE
// (GradingWorkspacePage.tsx): a distinct message per filter, not one
// generic "no results" line.
const FILTER_EMPTY_MESSAGE: Readonly<Record<StudentFilterId, string>> = {
  needs_grading: "No students need grading right now.",
  done: "No students have been graded or published yet.",
  all: "No active students on the assignment."
};

const NEEDS_GRADING_STATUSES: ReadonlySet<StudentRow["gradingStatus"]> = new Set([
  "not_started",
  "in_progress"
]);
const DONE_STATUSES: ReadonlySet<StudentRow["gradingStatus"]> = new Set(["complete", "published"]);

// "unknown" (the grading-state file failed to load) belongs to no pill but
// All -- it must stay reachable there and must not inflate either count.
const matchesFilter = (filterId: StudentFilterId, student: StudentRow): boolean => {
  if (filterId === "all") return true;
  if (filterId === "needs_grading") return NEEDS_GRADING_STATUSES.has(student.gradingStatus);
  return DONE_STATUSES.has(student.gradingStatus);
};

interface StatusChipConfig {
  readonly label: string;
  readonly variant: StatusChipVariant;
}

// "unknown" means the grading-state file failed to load, not that grading
// is outstanding -- it must not fold into "Needs grading", which would
// report a read failure as ordinary unstarted work.
const getStatusChipConfig = (gradingStatus: StudentRow["gradingStatus"]): StatusChipConfig => {
  switch (gradingStatus) {
    case "published":
      return { label: "Published", variant: "success" };
    case "complete":
      return { label: "Graded", variant: "success" };
    case "not_started":
    case "in_progress":
      return { label: "Needs grading", variant: "neutral" };
    case "unknown":
      return { label: "Status unavailable", variant: "warning" };
    default: {
      const exhaustiveCheck: never = gradingStatus;
      return exhaustiveCheck;
    }
  }
};

const findGradeStatusRow = (gradeStatus: NormalizedGradeStatus | null, studentId: string) =>
  gradeStatus?.repositories.find((row) => row.studentId === studentId);

export const AssignmentDetailStudentTable = ({
  lifecycleResult,
  gradeStatus
}: AssignmentDetailStudentTableProps): ReactElement => {
  const [filterId, setFilterId] = useState<StudentFilterId>(DEFAULT_FILTER);

  const students: readonly StudentRow[] =
    lifecycleResult?.status === "success" ? lifecycleResult.students : [];
  const pointsPossible = lifecycleResult?.status === "success" ? lifecycleResult.pointsPossible : 0;
  // No rubric means no grading to report, and a manual adjustment requires
  // a rubric category, so every score would be a meaningless 0. Omit the
  // column entirely rather than show a column of zeros.
  const showGradeColumn = pointsPossible > 0;

  if (students.length === 0) {
    return (
      <EmptyState
        title="No active students yet"
        description="This assignment's roster has no active students."
      />
    );
  }

  // Stable alphabetical order by studentId, the displayed Student label.
  // Sort order is unspecified anywhere in the brief; this is a starting
  // choice, not a settled one -- revisit deliberately if a better order
  // is wanted.
  const sortedStudents = [...students].sort((a, b) => a.studentId.localeCompare(b.studentId));

  const pills: readonly FilterPill[] = (["needs_grading", "done", "all"] as const).map((id) => ({
    id,
    label: FILTER_LABELS[id],
    count: sortedStudents.filter((student) => matchesFilter(id, student)).length
  }));

  const filteredStudents = sortedStudents.filter((student) => matchesFilter(filterId, student));

  const columns: DataTableColumn<StudentRow>[] = [
    { key: "student", header: "Student", render: (student) => student.studentId },
    { key: "section", header: "Section", render: (student) => student.section }
  ];

  if (showGradeColumn) {
    columns.push({
      key: "grade",
      header: "Grade",
      align: "end",
      render: (student) => (student.score === null ? "" : `${student.score} / ${pointsPossible}`)
    });
  }

  columns.push(
    {
      key: "checks",
      header: "Checks",
      render: (student) => {
        const row = findGradeStatusRow(gradeStatus, student.studentId);
        return row === undefined ? null : (
          <span className={getGradeStatusChipClassName(row)}>{formatGradeStatusLabel(row)}</span>
        );
      }
    },
    {
      key: "status",
      header: "Status",
      render: (student) => {
        const config = getStatusChipConfig(student.gradingStatus);
        return <StatusChip label={config.label} variant={config.variant} />;
      }
    }
  );

  return (
    <section className="assignment-detail__student-table" aria-labelledby="student-table-title">
      <h2 id="student-table-title">Students</h2>
      <FilterPills
        pills={pills}
        activeId={filterId}
        onSelect={(id) => setFilterId(id as StudentFilterId)}
        aria-label="Filter students by grading status"
      />
      <DataTable
        columns={columns}
        rows={filteredStudents}
        getRowKey={(student) => student.studentId}
        emptyState={
          <EmptyState
            title="No students match this filter"
            description={FILTER_EMPTY_MESSAGE[filterId]}
          />
        }
      />
    </section>
  );
};
