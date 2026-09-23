import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { GradingCommentLibraryLoadResult } from "../../electron/ipc";
import { FormattedGradingComment } from "./FormattedGradingComment";

type LoadedLibrary = Extract<
  GradingCommentLibraryLoadResult,
  { readonly status: "success"; readonly comments: unknown }
>;

export type CommentLibraryLoadState =
  | { readonly status: "loading" }
  | { readonly status: "success"; readonly comments: LoadedLibrary["comments"] }
  | { readonly status: "failure"; readonly message: string };

export type ReusableComment = LoadedLibrary["comments"][number];

interface ApplyAction {
  readonly isDisabled: (comment: ReusableComment) => boolean;
  readonly onApply: (comment: ReusableComment) => void;
}

export const ReusableCommentLibraryBrowser = ({
  commentLibrary,
  commentSearch,
  onSearchChange,
  availableCommentTags,
  selectedCommentTags,
  onTagsChange,
  matchingComments,
  applyAction,
  libraryMutationPending = false,
  showNewAction = true,
  onNew = () => undefined,
  onEdit = () => undefined,
  onDelete = () => undefined
}: {
  readonly commentLibrary: CommentLibraryLoadState;
  readonly commentSearch: string;
  readonly onSearchChange: (value: string) => void;
  readonly availableCommentTags: readonly string[];
  readonly selectedCommentTags: readonly string[];
  readonly onTagsChange: Dispatch<SetStateAction<readonly string[]>>;
  readonly matchingComments: readonly ReusableComment[];
  readonly applyAction?: ApplyAction;
  readonly libraryMutationPending?: boolean;
  readonly showNewAction?: boolean;
  readonly onNew?: () => void;
  readonly onEdit?: (comment: ReusableComment) => void;
  readonly onDelete?: (comment: ReusableComment) => void;
}): ReactElement => {
  if (commentLibrary.status === "loading")
    return <p aria-live="polite">Loading shared comments…</p>;
  if (commentLibrary.status === "failure")
    return (
      <div className="grading-panel-message" role="alert">
        {commentLibrary.message}
      </div>
    );
  return (
    <>
      {!showNewAction ? null : (
        <div className="grading-comment-library__actions">
          <button
            className="secondary-action"
            disabled={libraryMutationPending}
            onClick={onNew}
            type="button"
          >
            New comment
          </button>
        </div>
      )}
      <label>
        Search comments
        <input
          type="search"
          value={commentSearch}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
      </label>
      {availableCommentTags.length === 0 ? null : (
        <fieldset className="grading-comment-tags">
          <legend>Filter by tags</legend>
          {availableCommentTags.map((tag) => (
            <label key={tag}>
              <input
                type="checkbox"
                checked={selectedCommentTags.includes(tag)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  onTagsChange((current) =>
                    checked
                      ? [...current, tag]
                      : current.filter((selectedTag) => selectedTag !== tag)
                  );
                }}
              />
              {tag}
            </label>
          ))}
        </fieldset>
      )}
      {commentLibrary.comments.length === 0 ? (
        <p>No reusable comments yet.</p>
      ) : matchingComments.length === 0 ? (
        <p>No matching reusable comments.</p>
      ) : (
        <ul className="grading-comment-list" aria-label="Reusable comments">
          {matchingComments.map((comment) => (
            <li key={comment.id}>
              <strong>{comment.title}</strong>
              <FormattedGradingComment text={comment.text} />
              <p>Default adjustment: {comment.defaultDeduction}</p>
              {comment.defaultRubricCategoryId === undefined ? null : (
                <p>Default category: {comment.defaultRubricCategoryId}</p>
              )}
              {comment.tags.length === 0 ? null : <p>Tags: {comment.tags.join(", ")}</p>}
              {applyAction === undefined ? null : (
                <button
                  className="secondary-action"
                  type="button"
                  disabled={applyAction.isDisabled(comment)}
                  onClick={() => applyAction.onApply(comment)}
                >
                  Apply {comment.title}
                </button>
              )}
              <span className="grading-comment-library__entry-actions">
                <button
                  className="secondary-action"
                  disabled={libraryMutationPending}
                  onClick={() => onEdit(comment)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="secondary-action"
                  disabled={libraryMutationPending}
                  onClick={() => onDelete(comment)}
                  type="button"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

/** @deprecated Prefer ReusableCommentLibraryBrowser outside the workspace. */
export const GradingCommentLibraryBrowser = ReusableCommentLibraryBrowser;
