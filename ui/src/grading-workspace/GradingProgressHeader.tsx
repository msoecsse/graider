import type { ReactElement } from "react";

export const GradingProgressHeader = ({
  assignmentTitle,
  termCode,
  assignmentSlug,
  allStudentsCount,
  gradedOrPublishedCount,
  publishedCount,
  publishedProgressPercent,
  gradedNotPublishedProgressPercent,
  completeCount,
  publishReviewOpen,
  onOpenPublishReview,
  onOpenCheatSheet
}: {
  readonly assignmentTitle: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly allStudentsCount: number;
  readonly gradedOrPublishedCount: number;
  readonly publishedCount: number;
  readonly publishedProgressPercent: number;
  readonly gradedNotPublishedProgressPercent: number;
  readonly completeCount: number;
  readonly publishReviewOpen: boolean;
  readonly onOpenPublishReview: () => void;
  readonly onOpenCheatSheet: () => void;
}): ReactElement => (
  <header className="grading-workspace__header">
    <div className="grading-workspace__header-titles">
      <h1>{assignmentTitle}</h1>
      <p>
        {termCode} · {assignmentSlug}
      </p>
    </div>
    {allStudentsCount === 0 ? null : (
      <div className="grading-workspace__header-progress">
        <p className="grading-workspace__header-progress-text">
          {gradedOrPublishedCount} of {allStudentsCount} graded · {publishedCount} published
        </p>
        <div className="grading-workspace__header-progress-bar" aria-hidden="true">
          <span
            className="grading-workspace__header-progress-bar-segment grading-workspace__header-progress-bar-segment--published"
            style={{ width: `${publishedProgressPercent}%` }}
          />
          <span
            className="grading-workspace__header-progress-bar-segment grading-workspace__header-progress-bar-segment--graded"
            style={{ width: `${gradedNotPublishedProgressPercent}%` }}
          />
        </div>
      </div>
    )}
    {publishReviewOpen ? null : (
      <button
        className="primary-action"
        type="button"
        disabled={allStudentsCount === 0}
        onClick={onOpenPublishReview}
      >
        Publish {completeCount} {completeCount === 1 ? "report" : "reports"}
      </button>
    )}
    <button
      className="secondary-action"
      type="button"
      aria-label="Keyboard shortcuts"
      onClick={onOpenCheatSheet}
    >
      ?
    </button>
  </header>
);
