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

export const GradingCommentLibraryBrowser = ({
  commentLibrary,
  commentSearch,
  onSearchChange,
  availableCommentTags,
  selectedCommentTags,
  onTagsChange,
  matchingComments,
  studentId,
  gradingMutationStudentId,
  isStudentMutationBlocked,
  onApply
}: {
  readonly commentLibrary: CommentLibraryLoadState;
  readonly commentSearch: string;
  readonly onSearchChange: (value: string) => void;
  readonly availableCommentTags: readonly string[];
  readonly selectedCommentTags: readonly string[];
  readonly onTagsChange: Dispatch<SetStateAction<readonly string[]>>;
  readonly matchingComments: readonly ReusableComment[];
  readonly studentId: string | undefined;
  readonly gradingMutationStudentId: string | undefined;
  readonly isStudentMutationBlocked: (studentId: string) => boolean;
  readonly onApply: (comment: ReusableComment) => void;
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
      {matchingComments.length === 0 ? (
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
              <button
                className="secondary-action"
                type="button"
                disabled={
                  studentId === undefined ||
                  gradingMutationStudentId !== undefined ||
                  isStudentMutationBlocked(studentId)
                }
                onClick={() => onApply(comment)}
              >
                Apply {comment.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};
