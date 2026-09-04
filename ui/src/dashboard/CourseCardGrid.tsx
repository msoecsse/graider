import type { ReactElement } from "react";
import type { CourseFolderRecord } from "../../electron/ipc";
import { CourseTermCard } from "./CourseTermCard";
import type { CombinedDashboardCard, RecentAssignmentSummary } from "./dashboardTypes";

interface CourseCardGridProps {
  readonly cards: readonly CombinedDashboardCard[];
  readonly courseFolders: readonly CourseFolderRecord[];
  readonly refreshingId: string | null;
  readonly onOpenAssignment: (
    combinedCard: CombinedDashboardCard,
    assignment: RecentAssignmentSummary
  ) => void;
  readonly onSetupAssignment: (courseFolder: CourseFolderRecord) => void;
  readonly onManageRosters: (courseFolder: CourseFolderRecord) => void;
  readonly onRefresh: (courseFolderId: string) => void;
}

interface CourseDashboardGroup {
  readonly sourceFolderId: string;
  readonly sourceFolderPath: string;
  readonly cards: readonly CombinedDashboardCard[];
}

interface AssignmentRow {
  readonly card: CombinedDashboardCard;
  readonly assignment: RecentAssignmentSummary;
}

const getCourseLabel = (card: CombinedDashboardCard): string => {
  const course = card.card.courseSlug ?? card.card.courseTitle ?? "Course";
  const title = card.card.courseTitle;

  return title === null || title === course ? course : `${course} - ${title}`;
};

const getAssignmentTitle = (assignment: RecentAssignmentSummary): string =>
  assignment.title ?? assignment.slug ?? assignment.assignmentFile ?? "Untitled assignment";

const compareAssignmentRows = (left: AssignmentRow, right: AssignmentRow): number => {
  const termComparison = (left.card.card.termSlug ?? "").localeCompare(
    right.card.card.termSlug ?? ""
  );

  if (termComparison !== 0) {
    return termComparison;
  }

  const titleComparison = getAssignmentTitle(left.assignment).localeCompare(
    getAssignmentTitle(right.assignment)
  );

  return titleComparison === 0
    ? (left.assignment.slug ?? "").localeCompare(right.assignment.slug ?? "")
    : titleComparison;
};

const getAssignmentRows = (cards: readonly CombinedDashboardCard[]): readonly AssignmentRow[] =>
  cards
    .flatMap((card) => card.card.assignments.map((assignment) => ({ card, assignment })))
    .sort(compareAssignmentRows);

const getRepositoryLabel = (assignment: RecentAssignmentSummary): string => {
  if (assignment.applyState === "not_applied") {
    return "Repositories not created";
  }

  if (assignment.applyState === "applied") {
    return "Repositories created";
  }

  if (assignment.applyState === "partially_applied") {
    return "Repositories partially created";
  }

  return "Repository status unavailable";
};

const hasBlockingDiagnostic = (assignment: RecentAssignmentSummary): boolean =>
  assignment.diagnostics.some((diagnostic) => diagnostic.severity === "error");

const getLifecycleLabel = (assignment: RecentAssignmentSummary): string => {
  if (hasBlockingDiagnostic(assignment)) {
    return "Blocked";
  }

  if (assignment.applyState === "not_applied") {
    return "Not applied";
  }

  if (assignment.applyState === "applied") {
    return "Ready";
  }

  if (assignment.applyState === "partially_applied" || assignment.needsAttention) {
    return "Needs attention";
  }

  return assignment.status ?? "Status unavailable";
};

const groupCardsByCourseFolder = (
  cards: readonly CombinedDashboardCard[]
): readonly CourseDashboardGroup[] => {
  const groups = new Map<string, CourseDashboardGroup>();

  for (const card of cards) {
    const existingGroup = groups.get(card.sourceFolderId);
    groups.set(card.sourceFolderId, {
      sourceFolderId: card.sourceFolderId,
      sourceFolderPath: card.sourceFolderPath,
      cards: existingGroup === undefined ? [card] : [...existingGroup.cards, card]
    });
  }

  return [...groups.values()];
};

export const CourseCardGrid = ({
  cards,
  courseFolders,
  refreshingId,
  onOpenAssignment,
  onSetupAssignment,
  onManageRosters,
  onRefresh
}: CourseCardGridProps): ReactElement | null => {
  if (cards.length === 0) {
    return null;
  }

  return (
    <section className="course-card-section" aria-labelledby="course-cards-title">
      <div className="course-card-section__header">
        <h2 id="course-cards-title">Courses</h2>
        <p>{cards.length === 1 ? "1 course-term loaded" : `${cards.length} course-terms loaded`}</p>
      </div>
      {groupCardsByCourseFolder(cards).map((group) => {
        const courseFolder = courseFolders.find((folder) => folder.id === group.sourceFolderId);
        const firstCard = group.cards[0];
        const rows = getAssignmentRows(group.cards);

        if (firstCard === undefined || courseFolder === undefined) {
          return null;
        }

        return (
          <section className="course-dashboard" key={group.sourceFolderId}>
            <header className="course-dashboard__header">
              <div>
                <p className="course-dashboard__eyebrow">Course</p>
                <h3>{getCourseLabel(firstCard)}</h3>
                <details className="course-dashboard__advanced">
                  <summary>Advanced details</summary>
                  <p className="course-dashboard__path">{group.sourceFolderPath}</p>
                </details>
              </div>
              <div
                className="course-dashboard__actions"
                role="group"
                aria-label={`${getCourseLabel(firstCard)} actions`}
              >
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => {
                    onSetupAssignment(courseFolder);
                  }}
                >
                  New Assignment
                </button>
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => {
                    onManageRosters(courseFolder);
                  }}
                >
                  Manage Rosters
                </button>
                <button
                  className="secondary-action"
                  type="button"
                  aria-label={`Refresh ${getCourseLabel(firstCard)}`}
                  disabled={refreshingId === group.sourceFolderId}
                  onClick={() => {
                    onRefresh(group.sourceFolderId);
                  }}
                >
                  {refreshingId === group.sourceFolderId ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </header>

            <div className="course-card-grid">
              {group.cards.map((card) => (
                <CourseTermCard
                  combinedCard={card}
                  key={card.id}
                  onOpenAssignment={onOpenAssignment}
                />
              ))}
            </div>

            <section
              className="assignment-table-section"
              aria-label={`${getCourseLabel(firstCard)} assignments`}
            >
              <div className="assignment-table-section__header">
                <h4>Assignments</h4>
                <p>{rows.length === 1 ? "1 assignment" : `${rows.length} assignments`}</p>
              </div>
              {rows.length === 0 ? (
                <div className="assignment-table__empty">
                  <p>No assignments have been configured for this course.</p>
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => {
                      onSetupAssignment(courseFolder);
                    }}
                  >
                    New Assignment
                  </button>
                </div>
              ) : (
                <div className="assignment-table__scroll">
                  <table className="assignment-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Slug</th>
                        <th>Term</th>
                        <th>Sections</th>
                        <th>Grading</th>
                        <th>Repositories</th>
                        <th>Status</th>
                        <th>
                          <span className="visually-hidden">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ card, assignment }) => (
                        <tr
                          key={`${card.id}:${assignment.assignmentFile ?? assignment.slug ?? getAssignmentTitle(assignment)}`}
                        >
                          <td>{getAssignmentTitle(assignment)}</td>
                          <td>{assignment.slug ?? "-"}</td>
                          <td>{card.card.termSlug ?? "-"}</td>
                          <td>
                            {assignment.sections === undefined || assignment.sections.length === 0
                              ? "-"
                              : assignment.sections.join(", ")}
                          </td>
                          <td>
                            {assignment.gradingEnabled === false
                              ? "Disabled"
                              : assignment.gradingEnabled === true
                                ? "Enabled"
                                : "-"}
                          </td>
                          <td>{getRepositoryLabel(assignment)}</td>
                          <td>{getLifecycleLabel(assignment)}</td>
                          <td>
                            <button
                              className="secondary-action assignment-table__open"
                              type="button"
                              disabled={assignment.assignmentFile === null}
                              aria-label={`Open ${getAssignmentTitle(assignment)}`}
                              onClick={() => {
                                onOpenAssignment(card, assignment);
                              }}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </section>
        );
      })}
    </section>
  );
};
