import type { ReactElement } from "react";
import { deriveAssignmentReadiness } from "./assignmentDetailReadiness";
import { formatStatusLabel } from "../components/statusLabels";
import type {
  AssignmentNeedsAttentionItem,
  NormalizedAssignmentDetail
} from "./assignmentDetailTypes";

export const ReadinessPanel = ({
  detail,
  needsAttentionItems
}: {
  readonly detail: NormalizedAssignmentDetail;
  readonly needsAttentionItems: readonly AssignmentNeedsAttentionItem[];
}): ReactElement => {
  const readiness = deriveAssignmentReadiness(detail);

  return (
    <section
      className={`readiness-summary readiness-summary--${readiness.status}`}
      aria-labelledby="assignment-readiness-title"
    >
      <div className="readiness-summary__header">
        <div>
          <h2 id="assignment-readiness-title" tabIndex={-1}>
            Readiness
          </h2>
          <p className="readiness-summary__status">{readiness.label}</p>
        </div>
        <span className="status-chip">{formatStatusLabel(detail.status)}</span>
      </div>
      <p>{readiness.description}</p>
      {needsAttentionItems.length === 0 ? null : (
        <ul className="needs-attention-list" aria-label="Readiness items needing attention">
          {needsAttentionItems.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
              <em>{item.category}</em>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
