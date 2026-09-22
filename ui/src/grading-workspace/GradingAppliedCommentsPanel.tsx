import type { ReactElement } from "react";
import type { GradingStudentSnapshotResult } from "../../electron/ipc";
import type { CanonicalSourceRange } from "./submissionSourceView";

type Snapshot = Extract<GradingStudentSnapshotResult, { readonly status: "success" }>;
type AppliedComment = Snapshot["appliedComments"][number];
type RubricCategory = Snapshot["grade"]["categories"][number];

export interface DeleteCommentConfirmation {
  readonly studentId: string;
  readonly commentId: string;
  readonly text: string;
  readonly deduction: number;
  readonly sourceLocation?: CanonicalSourceRange;
}

export const GradingAppliedCommentsPanel = ({
  appliedComments,
  categories,
  studentId,
  gradingMutationStudentId,
  isStudentMutationBlocked,
  onEdit,
  onRequestDelete,
  deleteConfirmation,
  onConfirmDelete,
  onCancelDelete,
  sourceLocationLabel
}: {
  readonly appliedComments: readonly AppliedComment[];
  readonly categories: readonly RubricCategory[];
  readonly studentId: string;
  readonly gradingMutationStudentId: string | undefined;
  readonly isStudentMutationBlocked: (studentId: string) => boolean;
  readonly onEdit: (comment: AppliedComment) => void;
  readonly onRequestDelete: (comment: AppliedComment) => void;
  readonly deleteConfirmation: DeleteCommentConfirmation | undefined;
  readonly onConfirmDelete: () => void;
  readonly onCancelDelete: () => void;
  readonly sourceLocationLabel: (location: CanonicalSourceRange) => string;
}): ReactElement => {
  const disabled = gradingMutationStudentId !== undefined || isStudentMutationBlocked(studentId);
  return (
    <section aria-labelledby="applied-comments-heading">
      <h3 id="applied-comments-heading">Applied comments</h3>
      {appliedComments.length === 0 ? (
        <p>No comments applied.</p>
      ) : (
        <ul className="grading-comment-list">
          {appliedComments.map((comment) => (
            <li key={comment.id}>
              {comment.title === undefined ? null : <h4>{comment.title}</h4>}
              <p>{comment.text}</p>
              <p>Adjustment: {comment.deduction}</p>
              {comment.rubricCategoryId === undefined ? null : (
                <p>
                  Category:{" "}
                  {categories.find((category) => category.id === comment.rubricCategoryId)?.name ??
                    comment.rubricCategoryId}
                </p>
              )}
              {comment.sourceLocation === undefined ? null : (
                <p>Source: {sourceLocationLabel(comment.sourceLocation)}</p>
              )}
              <div className="grading-applied-comment__actions">
                <button
                  className="secondary-action"
                  type="button"
                  aria-label={`Edit comment: ${comment.text}`}
                  disabled={disabled}
                  onClick={() => onEdit(comment)}
                >
                  Edit
                </button>
                <button
                  className="danger-action"
                  type="button"
                  aria-label={`Delete comment: ${comment.text}`}
                  disabled={disabled}
                  onClick={() => onRequestDelete(comment)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {deleteConfirmation !== undefined && deleteConfirmation.studentId === studentId ? (
        <div
          className="grading-delete-comment-confirmation"
          role="alertdialog"
          aria-labelledby="delete-comment-heading"
        >
          <h4 id="delete-comment-heading">Delete applied comment?</h4>
          <p>
            “{deleteConfirmation.text.slice(0, 100)}” · Adjustment: {deleteConfirmation.deduction}
          </p>
          {deleteConfirmation.sourceLocation === undefined ? null : (
            <p>Source: {sourceLocationLabel(deleteConfirmation.sourceLocation)}</p>
          )}
          <div className="grading-apply-comment__actions">
            <button
              className="danger-action"
              type="button"
              disabled={gradingMutationStudentId === deleteConfirmation.studentId}
              onClick={onConfirmDelete}
            >
              {gradingMutationStudentId === deleteConfirmation.studentId
                ? "Deleting comment…"
                : "Confirm deleting comment"}
            </button>
            <button
              className="secondary-action"
              type="button"
              disabled={gradingMutationStudentId === deleteConfirmation.studentId}
              onClick={onCancelDelete}
            >
              Cancel deleting comment
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};
