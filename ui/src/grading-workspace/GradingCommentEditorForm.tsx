import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { CanonicalSourceRange } from "./submissionSourceView";

export interface AddCommentEditorState {
  readonly operation: "add";
  readonly studentId: string;
  readonly reusableCommentId?: string;
  readonly reusableCommentTitle?: string;
  readonly title: string;
  readonly text: string;
  readonly deduction: string;
  readonly rubricCategoryId: string;
  readonly targetMode: "source" | "general";
}

export interface EditCommentEditorState {
  readonly operation: "edit";
  readonly studentId: string;
  readonly commentId: string;
  readonly title: string;
  readonly hasPersistedTitle: boolean;
  readonly text: string;
  readonly deduction: string;
  readonly rubricCategoryId: string;
  readonly targetMode: "source" | "general";
  readonly sourceTarget?: CanonicalSourceRange;
}

export type CommentEditorState = AddCommentEditorState | EditCommentEditorState;

type RubricDefinitionCategory = {
  readonly id: string;
  readonly name: string;
  readonly points: number;
};

export const GradingCommentEditorForm = ({
  editor,
  onEditorChange,
  rubric,
  canonicalSourceTarget,
  gradingMutationStudentId,
  isStudentMutationBlocked,
  onSubmit,
  onCancel,
  sourceTargetLabel
}: {
  readonly editor: CommentEditorState;
  readonly onEditorChange: Dispatch<SetStateAction<CommentEditorState | undefined>>;
  readonly rubric: readonly RubricDefinitionCategory[];
  readonly canonicalSourceTarget: CanonicalSourceRange | undefined;
  readonly gradingMutationStudentId: string | undefined;
  readonly isStudentMutationBlocked: (studentId: string) => boolean;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly sourceTargetLabel: (target: CanonicalSourceRange) => string;
}): ReactElement => (
  <form
    className="grading-apply-comment"
    aria-label={
      editor.operation === "add"
        ? editor.reusableCommentTitle === undefined
          ? "Add comment"
          : `Apply ${editor.reusableCommentTitle}`
        : "Edit applied comment"
    }
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    <h4>
      {editor.operation === "add"
        ? editor.reusableCommentTitle === undefined
          ? "Add comment"
          : `Apply ${editor.reusableCommentTitle}`
        : "Edit applied comment"}
    </h4>
    <label>
      Title
      <input
        value={editor.title}
        required={editor.operation === "add" || editor.hasPersistedTitle}
        onChange={(event) =>
          onEditorChange((current) =>
            current === undefined ? current : { ...current, title: event.target.value }
          )
        }
      />
    </label>
    <label>
      Comment
      <textarea
        value={editor.text}
        onChange={(event) =>
          onEditorChange((current) =>
            current === undefined ? current : { ...current, text: event.target.value }
          )
        }
      />
    </label>
    <label>
      Deduction
      <input
        type="number"
        step="any"
        value={editor.deduction}
        onChange={(event) =>
          onEditorChange((current) =>
            current === undefined ? current : { ...current, deduction: event.target.value }
          )
        }
      />
    </label>
    <label htmlFor="grading-comment-rubric-category">Comment rubric category</label>
    <select
      id="grading-comment-rubric-category"
      value={editor.rubricCategoryId}
      onChange={(event) =>
        onEditorChange((current) =>
          current === undefined ? current : { ...current, rubricCategoryId: event.target.value }
        )
      }
    >
      <option value="">None</option>
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
    <fieldset>
      <legend>Target</legend>
      <label>
        <input
          type="radio"
          name="comment-target"
          value="source"
          checked={editor.targetMode === "source"}
          disabled={
            canonicalSourceTarget === undefined &&
            (editor.operation === "add" || editor.sourceTarget === undefined)
          }
          onChange={() => {
            onEditorChange((current) => {
              if (current === undefined) return current;
              if (current.operation === "add") return { ...current, targetMode: "source" };
              const sourceTarget = current.sourceTarget ?? canonicalSourceTarget;
              return sourceTarget === undefined
                ? current
                : { ...current, targetMode: "source", sourceTarget };
            });
          }}
        />
        Source
      </label>
      <label>
        <input
          type="radio"
          name="comment-target"
          value="general"
          checked={editor.targetMode === "general"}
          onChange={() =>
            onEditorChange((current) =>
              current === undefined ? current : { ...current, targetMode: "general" }
            )
          }
        />
        General
      </label>
    </fieldset>
    {editor.targetMode === "source" ? (
      (editor.operation === "edit" ? editor.sourceTarget : canonicalSourceTarget) === undefined ? (
        <p>Select a valid source line or range, or choose General.</p>
      ) : (
        <p>
          Source target:{" "}
          {sourceTargetLabel(
            editor.operation === "edit"
              ? (editor.sourceTarget as CanonicalSourceRange)
              : (canonicalSourceTarget as CanonicalSourceRange)
          )}
        </p>
      )
    ) : (
      <p>This comment will apply to the overall submission.</p>
    )}
    {editor.operation === "edit" && editor.targetMode === "source" ? (
      <button
        className="secondary-action"
        type="button"
        disabled={canonicalSourceTarget === undefined}
        onClick={() =>
          onEditorChange((current) =>
            current?.operation === "edit" && canonicalSourceTarget !== undefined
              ? { ...current, sourceTarget: canonicalSourceTarget }
              : current
          )
        }
      >
        Use current selection
      </button>
    ) : null}
    <div className="grading-apply-comment__actions">
      <button
        className="primary-action"
        type="submit"
        disabled={
          gradingMutationStudentId === editor.studentId ||
          isStudentMutationBlocked(editor.studentId) ||
          (editor.rubricCategoryId !== "" &&
            !rubric.some((category) => category.id === editor.rubricCategoryId)) ||
          (editor.targetMode === "source" &&
            (editor.operation === "edit" ? editor.sourceTarget : canonicalSourceTarget) ===
              undefined)
        }
      >
        {gradingMutationStudentId === editor.studentId
          ? editor.operation === "add"
            ? "Applying…"
            : "Saving…"
          : editor.operation === "add"
            ? "Apply comment"
            : "Save comment"}
      </button>
      <button
        className="secondary-action"
        type="button"
        disabled={gradingMutationStudentId === editor.studentId}
        onClick={onCancel}
      >
        Cancel comment
      </button>
    </div>
  </form>
);
