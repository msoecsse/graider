import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Toast, useToast } from "../components/Toast";
import {
  commentLibraryLoadFailureMessage,
  commentLibraryMutationFailureMessage,
  commentLibraryPublicationWarning,
  updateReusableCommentList
} from "../grading-workspace/commentLibraryFeedback";
import {
  ReusableCommentLibraryBrowser,
  type CommentLibraryLoadState,
  type ReusableComment
} from "../grading-workspace/GradingCommentLibraryBrowser";
import {
  filterReusableComments,
  listReusableCommentTags
} from "../grading-workspace/commentLibrarySearch";
import {
  emptyReusableCommentEditorValue,
  ReusableCommentEditor,
  type ReusableCommentEditorValue
} from "../grading-workspace/ReusableCommentEditor";

interface LibraryEditorState {
  readonly operation: "create" | "edit";
  readonly value: ReusableCommentEditorValue;
  readonly commentId?: string;
}

const createEditorValue = (comment: ReusableComment): ReusableCommentEditorValue => ({
  title: comment.title,
  text: comment.text,
  defaultDeduction: comment.defaultDeduction,
  defaultRubricCategoryId: comment.defaultRubricCategoryId,
  tags: comment.tags
});

const updateComments = (
  setLibrary: (update: (current: CommentLibraryLoadState) => CommentLibraryLoadState) => void,
  operation: "create" | "edit" | "delete",
  comment: ReusableComment
): void => {
  setLibrary((current) =>
    current.status === "success"
      ? {
          status: "success",
          comments: updateReusableCommentList(current.comments, operation, comment)
        }
      : current
  );
};

export const CommentLibraryPage = ({
  courseFolderId,
  termCode,
  courseTermLabel
}: {
  readonly courseFolderId: string;
  readonly termCode: string;
  readonly courseTermLabel: string;
}): ReactElement => {
  const [library, setLibrary] = useState<CommentLibraryLoadState>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<readonly string[]>([]);
  const [editor, setEditor] = useState<LibraryEditorState>();
  const [deleteConfirmation, setDeleteConfirmation] = useState<ReusableComment>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const { message: toastMessage, showToast } = useToast();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLibrary({ status: "loading" });
    setSearch("");
    setSelectedTags([]);
    setEditor(undefined);
    setDeleteConfirmation(undefined);
    setMessage(undefined);
    const load = window.graiderUI.loadGradingCommentLibrary;
    if (load === undefined) {
      setLibrary({ status: "failure", message: "The shared comment library is unavailable." });
      return () => {
        active = false;
      };
    }
    void load({ courseFolderId, termCode })
      .then((result) => {
        if (!active) return;
        if (result.status === "success") {
          setLibrary({ status: "success", comments: result.comments });
        } else {
          setLibrary({ status: "failure", message: commentLibraryLoadFailureMessage(result) });
        }
      })
      .catch(() => {
        if (active)
          setLibrary({
            status: "failure",
            message: "The shared comment library could not be loaded safely."
          });
      });
    return () => {
      active = false;
    };
  }, [courseFolderId, termCode]);

  const tags = useMemo(
    () => (library.status === "success" ? listReusableCommentTags(library.comments) : []),
    [library]
  );
  const matchingComments = useMemo(
    () =>
      library.status === "success"
        ? filterReusableComments(library.comments, search, selectedTags)
        : [],
    [library, search, selectedTags]
  );

  const openNew = (): void => {
    setMessage(undefined);
    setEditor({ operation: "create", value: emptyReusableCommentEditorValue() });
  };

  const saveEditor = async (value: ReusableCommentEditorValue): Promise<void> => {
    const currentEditor = editor;
    if (currentEditor === undefined || pending) return;
    if (
      (currentEditor.operation === "create" &&
        window.graiderUI.createGradingLibraryComment === undefined) ||
      (currentEditor.operation === "edit" &&
        window.graiderUI.editGradingLibraryComment === undefined)
    ) {
      setMessage("The shared comment library is unavailable.");
      return;
    }
    setPending(true);
    setMessage(undefined);
    try {
      const result =
        currentEditor.operation === "create"
          ? await window.graiderUI.createGradingLibraryComment!({
              courseFolderId,
              termCode,
              comment: value
            })
          : await window.graiderUI.editGradingLibraryComment!({
              courseFolderId,
              termCode,
              commentId: currentEditor.commentId ?? "",
              replacement: value
            });
      if (result.status !== "success" || !("comment" in result)) {
        setMessage(commentLibraryMutationFailureMessage(result));
      } else {
        updateComments(setLibrary, currentEditor.operation, result.comment);
        setEditor(undefined);
        const warning = commentLibraryPublicationWarning(result);
        if (warning === undefined)
          showToast(
            currentEditor.operation === "create"
              ? "Reusable comment created."
              : "Reusable comment updated."
          );
        else setMessage(warning);
      }
    } catch {
      setMessage("The reusable comment could not be saved safely.");
    } finally {
      if (mounted.current) setPending(false);
    }
  };

  const deleteComment = async (): Promise<void> => {
    const comment = deleteConfirmation;
    const remove = window.graiderUI.deleteGradingLibraryComment;
    if (comment === undefined || remove === undefined || pending) return;
    setPending(true);
    setMessage(undefined);
    try {
      const result = await remove({ courseFolderId, termCode, commentId: comment.id });
      if (result.status !== "success") {
        setMessage(commentLibraryMutationFailureMessage(result));
      } else {
        updateComments(setLibrary, "delete", comment);
        setDeleteConfirmation(undefined);
        const warning = commentLibraryPublicationWarning(result);
        if (warning === undefined) showToast("Reusable comment deleted.");
        else setMessage(warning);
      }
    } catch {
      setMessage("The reusable comment could not be deleted safely.");
    } finally {
      if (mounted.current) setPending(false);
    }
  };

  const content =
    library.status === "loading" ? (
      <p className="loading-state" aria-live="polite">
        Loading shared comments…
      </p>
    ) : library.status === "failure" ? (
      <div className="grading-panel-message" role="alert">
        {library.message}
      </div>
    ) : library.comments.length === 0 && editor === undefined ? (
      <EmptyState
        action={{ label: "New Comment", disabled: pending, onClick: openNew }}
        description="Create a reusable grading comment to share across this course."
        title="No reusable comments yet."
      />
    ) : (
      <>
        {editor === undefined ? null : (
          <section
            aria-labelledby="comment-library-editor-heading"
            className="comment-library-page__editor"
          >
            <h2 id="comment-library-editor-heading">
              {editor.operation === "create" ? "New Comment" : "Edit Comment"}
            </h2>
            <p className="comment-library-page__category-note">
              Rubric-category defaults are assignment-specific. Existing IDs are preserved here; set
              a category while grading an assignment.
            </p>
            <ReusableCommentEditor
              categories={[]}
              initialValue={editor.value}
              onCancel={() => setEditor(undefined)}
              onSave={(value) => void saveEditor(value)}
              pending={pending}
              tagSuggestions={tags}
            />
          </section>
        )}
        {library.comments.length === 0 ? null : (
          <ReusableCommentLibraryBrowser
            availableCommentTags={tags}
            commentLibrary={library}
            commentSearch={search}
            libraryMutationPending={pending}
            matchingComments={matchingComments}
            onDelete={(comment) => {
              setMessage(undefined);
              setDeleteConfirmation(comment);
            }}
            onEdit={(comment) => {
              setMessage(undefined);
              setEditor({
                operation: "edit",
                commentId: comment.id,
                value: createEditorValue(comment)
              });
            }}
            onSearchChange={setSearch}
            onTagsChange={setSelectedTags}
            selectedCommentTags={selectedTags}
            showNewAction={false}
          />
        )}
      </>
    );

  return (
    <main aria-labelledby="comment-library-title" className="dashboard-shell comment-library-page">
      <PageHeader
        eyebrow="Graider"
        meta={`${courseTermLabel} · Shared across this course; edits publish through the course repository.`}
        primaryAction={{ label: "New Comment", disabled: pending, onClick: openNew }}
        title="Comment Library"
        titleId="comment-library-title"
      />
      <section className="dashboard-content" aria-labelledby="comment-library-title">
        {message === undefined ? null : (
          <div className="grading-panel-message" role="status">
            {message}
          </div>
        )}
        {content}
      </section>
      <ConfirmDialog
        confirmLabel="Delete reusable comment"
        diff={
          deleteConfirmation === undefined
            ? []
            : [{ id: deleteConfirmation.id, label: deleteConfirmation.title, type: "removed" }]
        }
        isConfirming={pending}
        isOpen={deleteConfirmation !== undefined}
        onCancel={() => setDeleteConfirmation(undefined)}
        onConfirm={() => void deleteComment()}
        summary="This deletes the reusable course-library entry. Comments already applied to students are unchanged."
        title="Delete reusable comment?"
      />
      <Toast message={toastMessage} />
    </main>
  );
};
