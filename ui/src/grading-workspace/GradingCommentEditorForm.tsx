import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactElement,
  type SetStateAction
} from "react";
import { FormattedGradingComment } from "./FormattedGradingComment";
import type { CanonicalSourceRange } from "./submissionSourceView";

const INLINE_CODE_DELIMITER = "`";
const CODE_BLOCK_DELIMITER = "```";
const CODE_BLOCK_PREFIX = `${CODE_BLOCK_DELIMITER}\n`;
const CODE_BLOCK_SUFFIX = `\n${CODE_BLOCK_DELIMITER}`;
const CLOSING_CODE_FENCE_LINE = /^```[ \t]*$/mu;

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
}): ReactElement => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<{ readonly start: number; readonly end: number } | undefined>(
    undefined
  );
  const [formattingNotice, setFormattingNotice] = useState<string>();

  useEffect(() => {
    const textarea = textareaRef.current;
    const selection = pendingSelectionRef.current;
    if (textarea !== null && selection !== undefined) {
      textarea.focus();
      textarea.setSelectionRange(selection.start, selection.end);
      pendingSelectionRef.current = undefined;
    }
  }, [editor.text]);

  const replaceTextSelection = (
    replacement: string,
    selectionStart: number,
    selectionEnd: number
  ): void => {
    const textarea = textareaRef.current;
    if (textarea !== null) {
      const originalText = textarea.value;
      const nextText = `${originalText.slice(0, selectionStart)}${replacement}${originalText.slice(selectionEnd)}`;
      const selectedLength = selectionEnd - selectionStart;
      const replacementPadding = replacement.length - selectedLength;
      pendingSelectionRef.current = {
        start: selectionStart + replacementPadding,
        end: selectionEnd + replacementPadding
      };
      onEditorChange((current) =>
        current === undefined ? current : { ...current, text: nextText }
      );
    }
  };

  const wrapInlineCode = (): void => {
    const textarea = textareaRef.current;
    if (textarea !== null) {
      const selectedText = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
      const replacement = `${INLINE_CODE_DELIMITER}${selectedText}${INLINE_CODE_DELIMITER}`;
      const innerStart = textarea.selectionStart + INLINE_CODE_DELIMITER.length;
      const innerEnd = innerStart + selectedText.length;
      replaceTextSelection(replacement, textarea.selectionStart, textarea.selectionEnd);
      pendingSelectionRef.current = { start: innerStart, end: innerEnd };
      setFormattingNotice(undefined);
    }
  };

  const wrapCodeBlock = (): void => {
    const textarea = textareaRef.current;
    if (textarea !== null) {
      const selectedText = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
      if (CLOSING_CODE_FENCE_LINE.test(selectedText)) {
        textarea.focus();
        setFormattingNotice(
          "Code block was not added because the selection contains a closing triple-backtick fence."
        );
      } else {
        const replacement = `${CODE_BLOCK_PREFIX}${selectedText}${CODE_BLOCK_SUFFIX}`;
        const innerStart = textarea.selectionStart + CODE_BLOCK_PREFIX.length;
        const innerEnd = innerStart + selectedText.length;
        replaceTextSelection(replacement, textarea.selectionStart, textarea.selectionEnd);
        pendingSelectionRef.current = { start: innerStart, end: innerEnd };
        setFormattingNotice(undefined);
      }
    }
  };

  return (
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
          ref={textareaRef}
          value={editor.text}
          onChange={(event) => {
            setFormattingNotice(undefined);
            onEditorChange((current) =>
              current === undefined ? current : { ...current, text: event.target.value }
            );
          }}
        />
      </label>
      <div className="grading-comment-formatting-controls" aria-label="Comment formatting helpers">
        <button className="secondary-action" type="button" onClick={wrapInlineCode}>
          Inline code
        </button>
        <button className="secondary-action" type="button" onClick={wrapCodeBlock}>
          Code block
        </button>
      </div>
      {formattingNotice === undefined ? null : <p role="status">{formattingNotice}</p>}
      <section
        className="grading-comment-preview"
        aria-labelledby="grading-comment-preview-heading"
      >
        <h5 id="grading-comment-preview-heading">Preview</h5>
        {editor.text === "" ? (
          <p className="grading-comment-preview__empty">No comment text yet.</p>
        ) : (
          <FormattedGradingComment text={editor.text} />
        )}
      </section>
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
        (editor.operation === "edit" ? editor.sourceTarget : canonicalSourceTarget) ===
        undefined ? (
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
};
