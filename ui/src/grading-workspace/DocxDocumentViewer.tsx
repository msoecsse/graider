import { memo, useEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import { DOCUMENT_LIMITS, DOCUMENT_TOO_LARGE } from "../../electron/repositoryDocumentPolicy";
import { sanitizeDocumentHtml, findDocumentMatches } from "./documentHtml";
import { DocumentFindBar } from "./DocumentFindBar";

// Keep converted DOM stable while the find controls update: replacing innerHTML
// would detach browser selections and the Ranges used for match navigation.
const DocxContent = memo(
  ({
    html,
    contentRef
  }: {
    readonly html: string;
    readonly contentRef: RefObject<HTMLDivElement | null>;
  }): ReactElement => (
    <div
      ref={contentRef}
      className="repository-document__docx"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
);

export const DocxDocumentViewer = ({ bytes }: { readonly bytes: Uint8Array }): ReactElement => {
  const [html, setHtml] = useState<string>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [matches, setMatches] = useState<Range[]>([]);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const worker = new Worker(new URL("./docx.worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => {
      worker.terminate();
      setError(DOCUMENT_TOO_LARGE);
    }, DOCUMENT_LIMITS.processingMilliseconds);
    worker.onmessage = (event: MessageEvent<{ html?: string; error?: string }>) => {
      clearTimeout(timer);
      worker.terminate();
      if (event.data.error) setError(event.data.error);
      else setHtml(sanitizeDocumentHtml(event.data.html ?? ""));
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      setError("This DOCX could not be displayed.");
    };
    const buffer = new Uint8Array(bytes).buffer;
    worker.postMessage(buffer, [buffer]);
    return () => {
      clearTimeout(timer);
      worker.terminate();
    };
  }, [bytes]);
  useEffect(() => {
    setIndex(0);
    setMatches(content.current === null ? [] : findDocumentMatches(content.current, query));
  }, [html, query]);
  useEffect(() => {
    const match = matches[index];
    if (match !== undefined) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(match);
      match.startContainer.parentElement?.scrollIntoView({ block: "center" });
    }
  }, [index, matches]);
  return error ? (
    <p role="alert">{error}</p>
  ) : html === undefined ? (
    <p role="status">Opening DOCX…</p>
  ) : (
    <>
      <DocumentFindBar
        query={query}
        onQuery={setQuery}
        onNext={() =>
          setIndex((value) => (matches.length === 0 ? 0 : (value + 1) % matches.length))
        }
        onPrevious={() =>
          setIndex((value) =>
            matches.length === 0 ? 0 : (value + matches.length - 1) % matches.length
          )
        }
        status={
          query
            ? `${matches.length === 0 ? 0 : index + 1} of ${matches.length} matches${matches.length === DOCUMENT_LIMITS.findMatches ? " (search limit reached)" : ""}`
            : ""
        }
      />
      <div className="repository-document__pages">
        <DocxContent html={html} contentRef={content} />
      </div>
    </>
  );
};
