import { lazy, Suspense, useState, useMemo, type ReactElement } from "react";
import { RepositoryDocumentViewer } from "./RepositoryDocumentViewer";
import type { GradingStudentSourceRequest } from "../../electron/ipc";
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
  request,
  navigation,
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
  readonly navigation?: { readonly target: CanonicalSourceRange } | undefined;
  readonly request?: Omit<GradingStudentSourceRequest, "studentId">;
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
}): ReactElement => {
  const [documentSelection, setDocumentSelection] = useState<{
    readonly source: SourceLoadState;
    readonly file: string;
    readonly navigation: typeof navigation;
  }>();
  // Tie selection to the loaded source snapshot so refresh/student changes
  // close the old document during render, before another read can start.
  const selectedDocument =
    documentSelection?.source === source && documentSelection.navigation === navigation
      ? documentSelection.file
      : "";
  const documentRequest = useMemo(
    () =>
      request !== undefined && source.status === "success" && selectedDocument !== ""
        ? { ...request, studentId: source.source.studentId, file: selectedDocument }
        : undefined,
    [
      request?.courseFolderId,
      request?.courseFolderPath,
      request?.termCode,
      request?.assignmentSlug,
      source,
      selectedDocument
    ]
  );
  return (
    <section className="grading-workspace__source-pane">
      <h2>Source</h2>
      {source.status !== "success" || request === undefined ? null : (
        <>
          {source.source.documentDiscoveryError === undefined ? null : (
            <p role="alert">{source.source.documentDiscoveryError}</p>
          )}
          {(source.source.documents?.length ?? 0) === 0 ? null : (
            <label className="repository-document__selector">
              View submission file
              <select
                value={selectedDocument}
                onChange={(event) => {
                  setDocumentSelection({ source, file: event.target.value, navigation });
                  onCanonicalSelectionChange(source.source.studentId, undefined);
                }}
              >
                <option value="">Required source files</option>
                {source.source.documents?.map((file) => (
                  <option key={file} value={file}>
                    {file}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      {documentRequest === undefined ? null : (
        <RepositoryDocumentViewer
          key={`${documentRequest.studentId}:${source.status === "success" ? source.source.documentRevision : ""}:${selectedDocument}`}
          request={documentRequest}
        />
      )}
      <div hidden={documentRequest !== undefined}>
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
                navigation={navigation}
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
      </div>
    </section>
  );
};
