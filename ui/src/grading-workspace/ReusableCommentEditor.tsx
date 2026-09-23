import { useEffect, useState, type ReactElement } from "react";
import type { ReusableCommentFieldsDto } from "../../electron/gradingCommentLibraryService";
import { FormattedGradingComment } from "./FormattedGradingComment";
import { ReusableCommentTagInput } from "./ReusableCommentTagInput";

export type ReusableCommentEditorValue = ReusableCommentFieldsDto;
export interface ReusableCommentEditorCategory {
  readonly id: string;
  readonly name: string;
}

export const emptyReusableCommentEditorValue = (): ReusableCommentEditorValue => ({
  title: "",
  text: "",
  defaultDeduction: 0,
  tags: []
});

export const ReusableCommentEditor = ({
  initialValue,
  categories,
  tagSuggestions,
  pending = false,
  onSave,
  onCancel
}: {
  readonly initialValue: ReusableCommentEditorValue;
  readonly categories: readonly ReusableCommentEditorCategory[];
  readonly tagSuggestions: readonly string[];
  readonly pending?: boolean;
  readonly onSave: (value: ReusableCommentEditorValue) => void;
  readonly onCancel: () => void;
}): ReactElement => {
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);
  const availableCategory = categories.some(
    (category) => category.id === value.defaultRubricCategoryId
  );
  return (
    <form
      className="reusable-comment-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value);
      }}
    >
      <label>
        Title
        <input
          disabled={pending}
          onChange={(event) =>
            setValue((current) => ({ ...current, title: event.currentTarget.value }))
          }
          required
          value={value.title}
        />
      </label>
      <label>
        Comment text
        <textarea
          disabled={pending}
          onChange={(event) =>
            setValue((current) => ({ ...current, text: event.currentTarget.value }))
          }
          required
          value={value.text}
        />
      </label>
      <label>
        Default adjustment
        <input
          disabled={pending}
          onChange={(event) =>
            setValue((current) => ({
              ...current,
              defaultDeduction: Number(event.currentTarget.value)
            }))
          }
          step="any"
          type="number"
          value={value.defaultDeduction}
        />
      </label>
      <label>
        Default rubric category
        <select
          disabled={pending}
          onChange={(event) =>
            setValue((current) => ({
              ...current,
              defaultRubricCategoryId:
                event.currentTarget.value === "" ? undefined : event.currentTarget.value
            }))
          }
          value={
            value.defaultRubricCategoryId === undefined
              ? ""
              : availableCategory
                ? value.defaultRubricCategoryId
                : "unavailable"
          }
        >
          <option value="">None</option>
          {!availableCategory && value.defaultRubricCategoryId !== undefined ? (
            <option disabled value="unavailable">
              Unavailable: {value.defaultRubricCategoryId}
            </option>
          ) : null}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <ReusableCommentTagInput
        disabled={pending}
        onChange={(tags) => setValue((current) => ({ ...current, tags }))}
        suggestions={tagSuggestions}
        tags={value.tags}
      />
      <section aria-label="Comment preview" className="grading-comment-preview">
        <h5>Preview</h5>
        {value.text === "" ? (
          <p className="grading-comment-preview__empty">No comment text yet.</p>
        ) : (
          <FormattedGradingComment text={value.text} />
        )}
      </section>
      <div className="reusable-comment-editor__actions">
        <button className="primary-action" disabled={pending} type="submit">
          {pending ? "Saving…" : "Save comment"}
        </button>
        <button className="secondary-action" disabled={pending} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
};
