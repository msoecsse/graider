import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { CanonicalSourceRange } from "./submissionSourceView";
import { GradingCommentEditorForm, type CommentEditorState } from "./GradingCommentEditorForm";
import {
  GradingCommentLibraryBrowser,
  type CommentLibraryLoadState,
  type ReusableComment
} from "./GradingCommentLibraryBrowser";
import {
  ReusableCommentEditor,
  type ReusableCommentEditorCategory,
  type ReusableCommentEditorValue
} from "./ReusableCommentEditor";

export type GradingCommentWorkspaceMode = "author" | "library";

export interface GradingCommentWorkspaceLibraryEditor {
  readonly value: ReusableCommentEditorValue;
}

/**
 * Focused comment work deliberately replaces the grading grid instead of adding
 * another dense panel to its sidebar. The page retains the grading-session
 * state and supplies the existing mutation callbacks and shared editors.
 */
export const GradingCommentWorkspace = ({
  assignmentTitle,
  studentId,
  mode,
  commentEditor,
  onEditorChange,
  rubric,
  canonicalSourceTarget,
  gradingMutationStudentId,
  isStudentMutationBlocked,
  onSaveStudentComment,
  onCancelStudentComment,
  sourceTargetLabel,
  commentLibrary,
  commentSearch,
  onSearchChange,
  availableCommentTags,
  selectedCommentTags,
  onTagsChange,
  matchingComments,
  onApply,
  libraryMutationPending,
  libraryEditor,
  onNewReusableComment,
  onEditReusableComment,
  onDeleteReusableComment,
  onSaveReusableComment,
  onCancelReusableEditor,
  libraryMessage,
  gradingMessage,
  onShowAuthor,
  onShowLibrary,
  onBack
}: {
  readonly assignmentTitle: string;
  readonly studentId: string;
  readonly mode: GradingCommentWorkspaceMode;
  readonly commentEditor: CommentEditorState | undefined;
  readonly onEditorChange: Dispatch<SetStateAction<CommentEditorState | undefined>>;
  readonly rubric: readonly (ReusableCommentEditorCategory & { readonly points: number })[];
  readonly canonicalSourceTarget: CanonicalSourceRange | undefined;
  readonly gradingMutationStudentId: string | undefined;
  readonly isStudentMutationBlocked: (studentId: string) => boolean;
  readonly onSaveStudentComment: () => void;
  readonly onCancelStudentComment: () => void;
  readonly sourceTargetLabel: (target: CanonicalSourceRange) => string;
  readonly commentLibrary: CommentLibraryLoadState;
  readonly commentSearch: string;
  readonly onSearchChange: (value: string) => void;
  readonly availableCommentTags: readonly string[];
  readonly selectedCommentTags: readonly string[];
  readonly onTagsChange: Dispatch<SetStateAction<readonly string[]>>;
  readonly matchingComments: readonly ReusableComment[];
  readonly onApply: (comment: ReusableComment) => void;
  readonly libraryMutationPending: boolean;
  readonly libraryEditor: GradingCommentWorkspaceLibraryEditor | undefined;
  readonly onNewReusableComment: () => void;
  readonly onEditReusableComment: (comment: ReusableComment) => void;
  readonly onDeleteReusableComment: (comment: ReusableComment) => void;
  readonly onSaveReusableComment: (value: ReusableCommentEditorValue) => void;
  readonly onCancelReusableEditor: () => void;
  readonly libraryMessage: string | undefined;
  readonly gradingMessage: string | undefined;
  readonly onShowAuthor: () => void;
  readonly onShowLibrary: () => void;
  readonly onBack: () => void;
}): ReactElement => {
  const showingAuthor = mode === "author" && commentEditor !== undefined;
  const showingReusableEditor = libraryEditor !== undefined;
  return (
    <section
      className="grading-comment-workspace"
      aria-labelledby="grading-comment-workspace-heading"
    >
      <div className="grading-comment-workspace__header">
        <div>
          <h2 id="grading-comment-workspace-heading">Comments · {studentId}</h2>
          <p>{assignmentTitle}</p>
        </div>
        <button className="secondary-action" type="button" onClick={onBack}>
          Back to grading
        </button>
      </div>
      <div className="grading-comment-workspace__modes" aria-label="Comment workspace modes">
        <button
          aria-pressed={showingAuthor}
          className="secondary-action"
          type="button"
          onClick={onShowAuthor}
        >
          New comment
        </button>
        <button
          aria-pressed={!showingAuthor}
          className="secondary-action"
          type="button"
          onClick={onShowLibrary}
        >
          Comment library
        </button>
      </div>
      {libraryMessage === undefined ? null : (
        <div className="grading-panel-message" role="status">
          {libraryMessage}
        </div>
      )}
      {gradingMessage === undefined ? null : (
        <div className="grading-panel-message" role="alert">
          {gradingMessage}
        </div>
      )}
      <div className="grading-comment-workspace__content">
        {showingAuthor ? (
          <GradingCommentEditorForm
            editor={commentEditor}
            onEditorChange={onEditorChange}
            rubric={rubric}
            canonicalSourceTarget={canonicalSourceTarget}
            gradingMutationStudentId={gradingMutationStudentId}
            isStudentMutationBlocked={isStudentMutationBlocked}
            onSubmit={onSaveStudentComment}
            onCancel={onCancelStudentComment}
            sourceTargetLabel={sourceTargetLabel}
          />
        ) : showingReusableEditor ? (
          <ReusableCommentEditor
            categories={rubric}
            initialValue={libraryEditor.value}
            onCancel={onCancelReusableEditor}
            onSave={onSaveReusableComment}
            pending={libraryMutationPending}
            tagSuggestions={availableCommentTags}
          />
        ) : (
          <GradingCommentLibraryBrowser
            commentLibrary={commentLibrary}
            commentSearch={commentSearch}
            onSearchChange={onSearchChange}
            availableCommentTags={availableCommentTags}
            selectedCommentTags={selectedCommentTags}
            onTagsChange={onTagsChange}
            matchingComments={matchingComments}
            autoFocusSearch={mode === "library"}
            applyAction={{
              isDisabled: () =>
                gradingMutationStudentId !== undefined || isStudentMutationBlocked(studentId),
              onApply
            }}
            libraryMutationPending={libraryMutationPending}
            onNew={onNewReusableComment}
            onEdit={onEditReusableComment}
            onDelete={onDeleteReusableComment}
          />
        )}
      </div>
    </section>
  );
};
