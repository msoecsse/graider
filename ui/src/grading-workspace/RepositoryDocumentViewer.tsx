import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode
} from "react";
import type {
  GradingStudentDocumentRequest,
  GradingStudentDocumentResult
} from "../../electron/ipc";
import { repositoryDocumentKind } from "../../electron/repositoryDocumentPolicy";
const PdfViewer = lazy(async () => ({
  default: (await import("./PdfDocumentViewer")).PdfDocumentViewer
}));
const DocxViewer = lazy(async () => ({
  default: (await import("./DocxDocumentViewer")).DocxDocumentViewer
}));
class DocumentViewerBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? (
      <p role="alert">
        This document could not be displayed. Select another file to continue grading.
      </p>
    ) : (
      this.props.children
    );
  }
}
export const RepositoryDocumentViewer = ({
  request
}: {
  readonly request: GradingStudentDocumentRequest;
}): ReactElement => {
  const [result, setResult] = useState<GradingStudentDocumentResult>();
  useEffect(() => {
    let cancelled = false;
    setResult(undefined);
    void window.graiderUI
      .loadGradingStudentDocument(request)
      .then((value) => {
        if (!cancelled) setResult(value);
      })
      .catch(() => {
        if (!cancelled)
          setResult({ status: "failure", message: "This document could not be opened." });
      });
    return () => {
      cancelled = true;
    };
  }, [request]);
  return (
    <section
      className="repository-document"
      tabIndex={-1}
      onPointerDown={(event) => {
        if (
          (event.target as HTMLElement).closest(
            'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"])'
          ) === null
        )
          event.currentTarget.focus({ preventScroll: true });
      }}
      aria-label={`Document ${request.file}`}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        const input = event.currentTarget.querySelector<HTMLInputElement>(
          ".repository-document__find input"
        );
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          event.key.toLowerCase() === "f" &&
          input !== null &&
          (target === input ||
            target.closest(
              'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
            ) === null)
        ) {
          event.preventDefault();
          event.stopPropagation();
          input.focus();
          input.select();
        }
      }}
    >
      <p>{request.file} · Read only</p>
      {result === undefined ? (
        <p role="status">Loading document…</p>
      ) : result.status === "failure" ? (
        <p role="alert">{result.message}</p>
      ) : (
        <DocumentViewerBoundary>
          <Suspense fallback={<p role="status">Starting document viewer…</p>}>
            {repositoryDocumentKind(request.file) === "pdf" ? (
              <PdfViewer bytes={result.bytes} />
            ) : (
              <DocxViewer bytes={result.bytes} />
            )}
          </Suspense>
        </DocumentViewerBoundary>
      )}
    </section>
  );
};
