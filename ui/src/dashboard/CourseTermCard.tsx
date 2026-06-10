import type { ReactElement } from "react";
import { DiagnosticsPanel, getCardDiagnosticCount } from "./DiagnosticsPanel";
import { getCardTitle } from "./dashboardAggregation";
import type {
  CombinedDashboardCard,
  DashboardCard,
  RecentAssignmentSummary
} from "./dashboardTypes";

interface CourseTermCardProps {
  readonly combinedCard: CombinedDashboardCard;
  readonly onOpenAssignment: (
    combinedCard: CombinedDashboardCard,
    assignment: RecentAssignmentSummary
  ) => void;
}

const getSubtitle = (card: DashboardCard): string => {
  const courseLabel = card.courseTitle ?? card.courseSlug;
  const termLabel = card.termTitle ?? card.termSlug;

  if (courseLabel !== null && termLabel !== null) {
    return `${courseLabel} · ${termLabel}`;
  }

  return courseLabel ?? termLabel ?? "Course term";
};

const pluralize = (count: number, singular: string, plural: string): string =>
  count === 1 ? `${count} ${singular}` : `${count} ${plural}`;

const getSummaryParts = (card: DashboardCard): readonly string[] => {
  const parts: string[] = [];
  const activeStudentCount = card.roster?.activeStudentCount;
  const sectionCount = card.roster?.sectionCount;

  if (typeof activeStudentCount === "number") {
    parts.push(pluralize(activeStudentCount, "student", "students"));
  }

  if (typeof sectionCount === "number") {
    parts.push(pluralize(sectionCount, "section", "sections"));
  }

  if (typeof card.assignmentCount === "number") {
    parts.push(pluralize(card.assignmentCount, "assignment", "assignments"));
  }

  return parts;
};

const getAttentionLabel = (card: DashboardCard): string | null => {
  if (!card.needsAttention) {
    return null;
  }

  if (card.attentionCount !== null && card.attentionCount > 0) {
    return card.attentionCount === 1 ? "1 issue" : `${card.attentionCount} issues`;
  }

  return "Needs attention";
};

const getAssignmentTitle = (assignment: RecentAssignmentSummary): string =>
  assignment.title ?? assignment.slug ?? assignment.assignmentFile ?? "Untitled assignment";

const getAssignmentMeta = (assignment: RecentAssignmentSummary): string | null =>
  assignment.status ?? assignment.slug ?? null;

export const CourseTermCard = ({
  combinedCard,
  onOpenAssignment
}: CourseTermCardProps): ReactElement => {
  const { card } = combinedCard;
  const title = getCardTitle(card);
  const summaryParts = getSummaryParts(card);
  const attentionLabel = getAttentionLabel(card);
  const diagnosticCount = getCardDiagnosticCount(card);

  return (
    <article className="course-card" aria-labelledby={`course-card-${combinedCard.id}`}>
      <div className="course-card__top-strip" aria-hidden="true" />
      <div className="course-card__body">
        <div className="course-card__header">
          <div>
            <h2 id={`course-card-${combinedCard.id}`}>{title}</h2>
            <p>{getSubtitle(card)}</p>
          </div>
          {attentionLabel === null ? null : (
            <span className="attention-badge" aria-label={`${title} needs attention`}>
              {attentionLabel}
            </span>
          )}
        </div>

        {summaryParts.length > 0 ? (
          <p className="course-card__summary">{summaryParts.join(" · ")}</p>
        ) : null}

        <p className="course-card__source">{combinedCard.sourceFolderPath}</p>

        <div className="course-card__assignments">
          <h3>Recent assignments</h3>
          {card.recentAssignments.length === 0 ? (
            <p className="course-card__empty">No recent assignments.</p>
          ) : (
            <ul className="assignment-list">
              {card.recentAssignments.map((assignment) => (
                <li
                  className="assignment-list__item"
                  key={
                    assignment.slug ?? assignment.assignmentFile ?? getAssignmentTitle(assignment)
                  }
                >
                  <button
                    className="assignment-list__button"
                    type="button"
                    disabled={assignment.assignmentFile === null}
                    aria-label={`Open assignment detail for ${getAssignmentTitle(assignment)}`}
                    onClick={() => {
                      onOpenAssignment(combinedCard, assignment);
                    }}
                  >
                    <span>
                      <span className="assignment-list__title">
                        {getAssignmentTitle(assignment)}
                      </span>
                      {getAssignmentMeta(assignment) === null ? null : (
                        <span className="assignment-list__meta">
                          <span className="assignment-list__status">
                            {getAssignmentMeta(assignment)}
                          </span>
                        </span>
                      )}
                    </span>
                    {assignment.needsAttention ? (
                      <span
                        className="assignment-list__attention"
                        aria-label={`${getAssignmentTitle(assignment)} needs attention`}
                      >
                        Needs attention
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {diagnosticCount > 0 ? <DiagnosticsPanel card={card} /> : null}
      </div>
    </article>
  );
};
