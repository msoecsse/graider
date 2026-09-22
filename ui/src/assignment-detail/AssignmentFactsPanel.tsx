import type { ReactElement } from "react";
import { DetailItem, getRepositoryShortName } from "./AssignmentDetailPrimitives";
import { formatNullableValue } from "./assignmentDetailReadiness";
import { formatReadableDateTime } from "../components/dateTime";
import type { NormalizedAssignmentDetail } from "./assignmentDetailTypes";

const GRADING_MODE_LABELS: Readonly<Record<string, string>> = {
  preset: "Preset",
  "custom-workflow": "Custom workflow",
  "contract-only": "Contract only"
};

// Reuses the exact "Grading enabled" / "No grading" phrasing already shown in
// the status badges (see getStatusBadges) and extends it with the mode, so
// the facts card reads as "is automated grading configured, and how" rather
// than duplicating the grading_category gradebook-bucket concept.
const getGradingFactValue = (grading: NormalizedAssignmentDetail["grading"]): string => {
  if (!grading.enabled) {
    return "No grading";
  }

  const modeLabel = grading.mode === null ? undefined : GRADING_MODE_LABELS[grading.mode];
  return modeLabel === undefined ? "Grading enabled" : `Grading enabled (${modeLabel})`;
};

export const AssignmentFactsPanel = ({
  detail
}: {
  readonly detail: NormalizedAssignmentDetail;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="assignment-facts-title">
    <h2 id="assignment-facts-title">Assignment facts</h2>
    <dl className="detail-grid">
      <DetailItem
        label="Due"
        value={formatReadableDateTime(detail.deadline.dueAt) ?? detail.deadline.dueAt}
      />
      <DetailItem label="Points" value={detail.metadata.points} />
      <DetailItem label="Type" value={detail.assignment.type} />
      <DetailItem label="Sections" value={detail.sections.join(", ") || null} />
      <DetailItem label="Grading" value={getGradingFactValue(detail.grading)} />
      <DetailItem label="Late policy" value={detail.deadline.latePolicy} />
      <div className="detail-item">
        <dt>Template</dt>
        <dd>
          {detail.template.repository === null ? (
            <span>{formatNullableValue(detail.template.repository)}</span>
          ) : (
            <a
              href={`https://github.com/${detail.template.repository}`}
              target="_blank"
              rel="noreferrer"
            >
              {getRepositoryShortName(detail.template.repository)}
            </a>
          )}
        </dd>
      </div>
      <DetailItem label="Faculty owner" value={detail.metadata.facultyOwner} />
      <DetailItem label="Grading category" value={detail.metadata.gradingCategory} />
    </dl>
  </section>
);
