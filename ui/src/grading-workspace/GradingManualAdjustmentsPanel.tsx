import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { GradingStudentSnapshotResult } from "../../electron/ipc";

type Snapshot = Extract<GradingStudentSnapshotResult, { readonly status: "success" }>;
type ManualAdjustment = Snapshot["manualAdjustments"][number];
type RubricCategory = Snapshot["grade"]["categories"][number];
type RubricDefinitionCategory = {
  readonly id: string;
  readonly name: string;
  readonly points: number;
};

export interface AddManualAdjustmentEditorState {
  readonly operation: "add";
  readonly studentId: string;
  readonly rubricCategoryId: string;
  readonly amount: string;
  readonly note: string;
}

export interface EditManualAdjustmentEditorState {
  readonly operation: "edit";
  readonly studentId: string;
  readonly adjustmentId: string;
  readonly rubricCategoryId: string;
  readonly amount: string;
  readonly note: string;
}

export type ManualAdjustmentEditorState =
  | AddManualAdjustmentEditorState
  | EditManualAdjustmentEditorState;

export interface DeleteManualAdjustmentConfirmation {
  readonly studentId: string;
  readonly adjustmentId: string;
  readonly rubricCategoryId: string;
  readonly amount: number;
  readonly note?: string;
}

export const GradingManualAdjustmentsPanel = ({
  manualAdjustments,
  categories,
  rubric,
  studentId,
  gradingMutationStudentId,
  isStudentMutationBlocked,
  onAdd,
  onEdit,
  onRequestDelete,
  editor,
  onEditorChange,
  onSubmitEditor,
  onCancelEditor,
  deleteConfirmation,
  onConfirmDelete,
  onCancelDelete,
  signedAmount
}: {
  readonly manualAdjustments: readonly ManualAdjustment[];
  readonly categories: readonly RubricCategory[];
  readonly rubric: readonly RubricDefinitionCategory[];
  readonly studentId: string;
  readonly gradingMutationStudentId: string | undefined;
  readonly isStudentMutationBlocked: (studentId: string) => boolean;
  readonly onAdd: () => void;
  readonly onEdit: (adjustment: ManualAdjustment) => void;
  readonly onRequestDelete: (adjustment: ManualAdjustment) => void;
  readonly editor: ManualAdjustmentEditorState | undefined;
  readonly onEditorChange: Dispatch<SetStateAction<ManualAdjustmentEditorState | undefined>>;
  readonly onSubmitEditor: () => void;
  readonly onCancelEditor: () => void;
  readonly deleteConfirmation: DeleteManualAdjustmentConfirmation | undefined;
  readonly onConfirmDelete: () => void;
  readonly onCancelDelete: () => void;
  readonly signedAmount: (amount: number) => string;
}): ReactElement => {
  const disabled = gradingMutationStudentId !== undefined || isStudentMutationBlocked(studentId);
  return (
    <section aria-labelledby="manual-adjustments-heading">
      <h3 id="manual-adjustments-heading">Manual adjustments</h3>
      <button
        className="secondary-action"
        type="button"
        disabled={rubric.length === 0 || disabled}
        onClick={onAdd}
      >
        Add adjustment
      </button>
      {rubric.length === 0 ? <p>Manual adjustments require a rubric category.</p> : null}
      {manualAdjustments.length === 0 ? (
        <p>No manual adjustments.</p>
      ) : (
        <ul className="grading-comment-list">
          {manualAdjustments.map((adjustment) => (
            <li key={adjustment.id}>
              <p>
                Category:{" "}
                {categories.find((category) => category.id === adjustment.rubricCategoryId)?.name ??
                  adjustment.rubricCategoryId}
              </p>
              <p>Adjustment: {signedAmount(adjustment.amount)}</p>
              {adjustment.note === undefined ? null : <p>{adjustment.note}</p>}
              <div className="grading-applied-comment__actions">
                <button
                  className="secondary-action"
                  type="button"
                  aria-label={`Edit adjustment: ${adjustment.rubricCategoryId}`}
                  disabled={disabled}
                  onClick={() => onEdit(adjustment)}
                >
                  Edit
                </button>
                <button
                  className="danger-action"
                  type="button"
                  aria-label={`Delete adjustment: ${adjustment.rubricCategoryId}`}
                  disabled={disabled}
                  onClick={() => onRequestDelete(adjustment)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editor !== undefined && editor.studentId === studentId ? (
        <form
          className="grading-apply-comment"
          aria-label={
            editor.operation === "add" ? "Add manual adjustment" : "Edit manual adjustment"
          }
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitEditor();
          }}
        >
          <h4>{editor.operation === "add" ? "Add adjustment" : "Edit adjustment"}</h4>
          <label htmlFor="grading-adjustment-rubric-category">Adjustment rubric category</label>
          <select
            id="grading-adjustment-rubric-category"
            required
            value={editor.rubricCategoryId}
            onChange={(event) =>
              onEditorChange((current) =>
                current === undefined
                  ? current
                  : { ...current, rubricCategoryId: event.target.value }
              )
            }
          >
            <option value="">Select a category</option>
            {editor.rubricCategoryId !== "" &&
            !rubric.some((category) => category.id === editor.rubricCategoryId) ? (
              <option value={editor.rubricCategoryId} disabled>
                Unavailable category ({editor.rubricCategoryId})
              </option>
            ) : null}
            {rubric.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <label>
            Amount
            <input
              required
              type="number"
              step="any"
              value={editor.amount}
              onChange={(event) =>
                onEditorChange((current) =>
                  current === undefined ? current : { ...current, amount: event.target.value }
                )
              }
            />
          </label>
          <p>Use a positive amount to add points and a negative amount to deduct points.</p>
          <label>
            Note (optional)
            <input
              value={editor.note}
              onChange={(event) =>
                onEditorChange((current) =>
                  current === undefined ? current : { ...current, note: event.target.value }
                )
              }
            />
          </label>
          <div className="grading-apply-comment__actions">
            <button
              className="primary-action"
              type="submit"
              disabled={
                gradingMutationStudentId === editor.studentId ||
                isStudentMutationBlocked(editor.studentId) ||
                editor.rubricCategoryId === "" ||
                !rubric.some((category) => category.id === editor.rubricCategoryId) ||
                editor.amount.trim() === "" ||
                !Number.isFinite(Number(editor.amount))
              }
            >
              {gradingMutationStudentId === editor.studentId
                ? "Saving…"
                : editor.operation === "add"
                  ? "Save new adjustment"
                  : "Save adjustment"}
            </button>
            <button
              className="secondary-action"
              type="button"
              disabled={gradingMutationStudentId === editor.studentId}
              onClick={onCancelEditor}
            >
              Cancel adjustment
            </button>
          </div>
        </form>
      ) : null}
      {deleteConfirmation !== undefined && deleteConfirmation.studentId === studentId ? (
        <div
          className="grading-delete-comment-confirmation"
          role="alertdialog"
          aria-labelledby="delete-adjustment-heading"
        >
          <h4 id="delete-adjustment-heading">Delete manual adjustment?</h4>
          <p>
            {categories.find((category) => category.id === deleteConfirmation.rubricCategoryId)
              ?.name ?? deleteConfirmation.rubricCategoryId}
            {" · "}
            {signedAmount(deleteConfirmation.amount)}
          </p>
          {deleteConfirmation.note === undefined ? null : <p>{deleteConfirmation.note}</p>}
          <div className="grading-apply-comment__actions">
            <button
              className="danger-action"
              type="button"
              disabled={gradingMutationStudentId === deleteConfirmation.studentId}
              onClick={onConfirmDelete}
            >
              {gradingMutationStudentId === deleteConfirmation.studentId
                ? "Deleting adjustment…"
                : "Confirm deleting adjustment"}
            </button>
            <button
              className="secondary-action"
              type="button"
              disabled={gradingMutationStudentId === deleteConfirmation.studentId}
              onClick={onCancelDelete}
            >
              Cancel deleting adjustment
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};
