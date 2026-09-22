import { lazy, Suspense, type ReactElement } from "react";
import type { GradingEditorViewState } from "../../electron/ipc";
import type { GradingSourceAnnotation } from "./MonacoSourceViewer";
import type { CanonicalSourceRange, GradingStudentSourceDto } from "./submissionSourceView";

const MonacoSourceViewer = lazy(async () => {
  const module = await import("./MonacoSourceViewer");
  return { default: module.MonacoSourceViewer };
});

export type SourceLoadState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly studentId: string }
  | {
      readonly status: "success";
      readonly source: GradingStudentSourceDto;
      readonly initialViewState: GradingEditorViewState | null;
      readonly autosaveEnabled: boolean;
    }
  | { readonly status: "failure"; readonly studentId: string; readonly message: string };

export const GradingSubmissionViewerPane = ({
  hasSelectedStudent,
  viewStateWarning,
  source,
  snapshotStudentId,
  sourceAnnotations,
  canonicalSourceTarget,
  gradingMutationStudentId,
  isStudentMutationBlocked,
  onCanonicalSelectionChange,
  onScheduleViewStateSave,
  onAddComment,
  sourceTargetLabel
}: {
  readonly hasSelectedStudent: boolean;
  readonly viewStateWarning: string | undefined;
  readonly source: SourceLoadState;
  readonly snapshotStudentId: string | undefined;
  readonly sourceAnnotations: readonly GradingSourceAnnotation[];
  readonly canonicalSourceTarget: CanonicalSourceRange | undefined;
  readonly gradingMutationStudentId: string | undefined;
  readonly isStudentMutationBlocked: (studentId: string) => boolean;
  readonly onCanonicalSelectionChange: (
    studentId: string,
    target: CanonicalSourceRange | undefined
  ) => void;
  readonly onScheduleViewStateSave: (studentId: string, viewState: GradingEditorViewState) => void;
  readonly onAddComment: () => void;
  readonly sourceTargetLabel: (target: CanonicalSourceRange) => string;
}): ReactElement => (
  <section className="grading-workspace__source-pane">
    <h2>Source</h2>
    {!hasSelectedStudent || viewStateWarning === undefined ? null : (
      <div className="grading-source-message" role="alert">
        {viewStateWarning}
      </div>
    )}
    {!hasSelectedStudent || source.status === "idle" ? (
      <p>Select a student to begin.</p>
    ) : source.status === "loading" ? (
      <p aria-live="polite">Loading source for {source.studentId}…</p>
    ) : source.status === "failure" ? (
      <div className="grading-source-message" role="alert">
        <strong>Source unavailable for {source.studentId}</strong>
        <p>{source.message}</p>
      </div>
    ) : source.source.sections.length === 0 ? (
      <p className="grading-source-message">No required files are configured.</p>
    ) : (
      <Suspense fallback={<p aria-live="polite">Starting source viewer…</p>}>
        <>
          <MonacoSourceViewer
            annotations={snapshotStudentId === source.source.studentId ? sourceAnnotations : []}
            key={source.source.studentId}
            initialViewState={source.initialViewState}
            model={source.source}
            studentId={source.source.studentId}
            onCanonicalSelectionChange={(target: CanonicalSourceRange | undefined) =>
              onCanonicalSelectionChange(source.source.studentId, target)
            }
            {...(source.autosaveEnabled
              ? {
                  onCanonicalViewStateChange: (viewState: GradingEditorViewState) =>
                    onScheduleViewStateSave(source.source.studentId, viewState)
                }
              : {})}
          />
          <div className="grading-source-comment-action">
            <button
              className="secondary-action"
              type="button"
              disabled={
                canonicalSourceTarget === undefined ||
                gradingMutationStudentId !== undefined ||
                isStudentMutationBlocked(source.source.studentId)
              }
              onClick={onAddComment}
            >
              Add Comment
            </button>
            {canonicalSourceTarget === undefined ? (
              <p>Select a source line or range to add an anchored comment.</p>
            ) : (
              <p>Selected source: {sourceTargetLabel(canonicalSourceTarget)}</p>
            )}
          </div>
        </>
      </Suspense>
    )}
  </section>
);
