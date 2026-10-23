import { useEffect, useRef, useState, type ReactElement } from "react";
import { findDocumentMatches } from "./documentHtml";

const isTextEntry = (target: EventTarget | null): boolean =>
  target !== null &&
  "nodeType" in target &&
  (target as Element).nodeType === Node.ELEMENT_NODE &&
  (target as Element).closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
  ) !== null;

// Ranges and CSS highlights leave source markup, section IDs and anchor links intact.
// Scripts, forms, popups and top navigation remain disabled by the iframe sandbox.
export const ReportPreviewViewer = ({ html }: { readonly html: string }): ReactElement => {
  const frame = useRef<HTMLIFrameElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [document, setDocument] = useState<Document>();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Range[]>([]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "f" &&
        (!isTextEntry(event.target) || event.target === input.current)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
        input.current?.focus();
        input.current?.select();
      }
    };
    document?.addEventListener("keydown", handleKey);
    // While the preview dialog is active, its heading/buttons also route Find here.
    const owner = frame.current?.closest('[role="dialog"]');
    owner?.addEventListener("keydown", handleKey as EventListener);
    return () => {
      document?.removeEventListener("keydown", handleKey);
      owner?.removeEventListener("keydown", handleKey as EventListener);
    };
  }, [document]);
  useEffect(() => {
    if (open) input.current?.focus();
    setIndex(0);
    setMatches(
      open && document?.body
        ? findDocumentMatches(document.body, query, Number.POSITIVE_INFINITY)
        : []
    );
  }, [open, query, document]);
  useEffect(() => {
    const frameElement = frame.current;
    const view = document?.defaultView;
    const active = matches[index];
    // Chromium supports the CSS Custom Highlight API. Selection is the fallback.
    const api = view as unknown as {
      CSS?: { highlights?: Map<string, unknown> };
      Highlight?: new (...ranges: Range[]) => { add(range: Range): unknown };
    } | null;
    const highlights = api?.CSS?.highlights;
    // Capture the fallback Selection while the frame is attached. Its Window
    // may already be detached when a student switch runs effect cleanup.
    const selection =
      highlights !== undefined && api?.Highlight !== undefined ? undefined : view?.getSelection();
    if (highlights && api?.Highlight && matches.length > 0) {
      const allMatches = new api.Highlight();
      for (const match of matches) allMatches.add(match);
      highlights.set("report-matches", allMatches);
      highlights.set("report-active", new api.Highlight(...(active ? [active] : [])));
    } else if (active) {
      selection?.removeAllRanges();
      selection?.addRange(active);
    }
    active?.startContainer.parentElement?.scrollIntoView({ block: "center" });
    // A PRE or paragraph can span many screens; center the actual text range
    // after revealing its container, rather than always centering that container.
    if (
      active !== undefined &&
      view !== null &&
      view !== undefined &&
      typeof active.getBoundingClientRect === "function"
    ) {
      const bounds = active.getBoundingClientRect();
      if (bounds.height > 0)
        view.scrollBy({ top: bounds.top + bounds.height / 2 - view.innerHeight / 2 });
    }
    return () => {
      highlights?.delete("report-matches");
      highlights?.delete("report-active");
      if (matches.length > 0 && frameElement?.isConnected) selection?.removeAllRanges();
    };
  }, [document, matches, index]);
  const move = (direction: number): void => {
    setIndex((current) =>
      matches.length === 0 ? 0 : (current + direction + matches.length) % matches.length
    );
  };
  return (
    <div className="grading-report-viewer">
      <button
        type="button"
        className="secondary-action"
        onClick={() => {
          setOpen(true);
          input.current?.focus();
        }}
      >
        Find in report
      </button>
      {open ? (
        <div
          className="repository-document__find"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
            }
            if (event.key === "Enter") {
              event.preventDefault();
              move(event.shiftKey ? -1 : 1);
            }
          }}
        >
          <label>
            Find in report{" "}
            <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <span role="status">
            {query === ""
              ? ""
              : matches.length === 0
                ? "No matches"
                : `${index + 1} of ${matches.length}`}
          </span>
          <button type="button" disabled={matches.length === 0} onClick={() => move(-1)}>
            Previous report match
          </button>
          <button type="button" disabled={matches.length === 0} onClick={() => move(1)}>
            Next report match
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Close report search
          </button>
        </div>
      ) : null}
      <iframe
        ref={frame}
        className="grading-report-preview__frame"
        title="Grading report preview"
        sandbox="allow-same-origin"
        srcDoc={html}
        onLoad={() => {
          const loaded = frame.current?.contentDocument;
          if (loaded) {
            const style = loaded.createElement("style");
            style.textContent =
              "::highlight(report-matches) { background: #ffe082; color: #111; } ::highlight(report-active) { background: #ff9800; color: #111; }";
            loaded.head.append(style);
            setDocument(loaded);
          }
        }}
      />
    </div>
  );
};
