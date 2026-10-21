import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import "react-pdf/dist/Page/TextLayer.css";
import { DOCUMENT_LIMITS, DOCUMENT_TOO_LARGE } from "../../electron/repositoryDocumentPolicy";
import { DocumentFindBar } from "./DocumentFindBar";

// PDF.js 6 reports this through its worker even when an empty operator list
// masks the display callback's error. Observe only this exact resource failure;
// do not interpret document text or depend on private numeric message opcodes.
const PDFJS_IMAGE_LIMIT_FAILURE = "Image exceeded maximum allowed size and was removed.";
export const isPdfImageLimitFailure = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null || !("reason" in value)) return false;
  const reason = value.reason;
  return (
    typeof reason === "object" &&
    reason !== null &&
    "message" in reason &&
    reason.message === PDFJS_IMAGE_LIMIT_FAILURE
  );
};

const PDF_OPTIONS = {
  stopAtErrors: true,
  maxImageSize: DOCUMENT_LIMITS.imagePixels,
  cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
  wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
  useSystemFonts: false,
  enableXfa: false
};
const PAGE_PLACEHOLDER_HEIGHT = 1100;
const PAGE_OVERSCAN = `${PAGE_PLACEHOLDER_HEIGHT}px`;

export const LazyPdfPage = ({
  pageNumber,
  active,
  query,
  pdf
}: {
  readonly pageNumber: number;
  readonly active: boolean;
  readonly query: string;
  readonly pdf: PDFDocumentProxy;
}): ReactElement => {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState<number>();
  const [pageError, setPageError] = useState<string>();
  const [height, setHeight] = useState(PAGE_PLACEHOLDER_HEIGHT);
  const renderText = useCallback(
    ({ str }: { readonly str: string }): string => {
      // Escape text before returning markup to React-PDF's text layer.
      const escaped = (value: string): string =>
        value.replace(/[&<>"']/gu, (character) => `&#${character.charCodeAt(0)};`);
      const offset =
        query.trim() === "" ? -1 : str.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
      return offset < 0
        ? escaped(str)
        : `${escaped(str.slice(0, offset))}<mark>${escaped(str.slice(offset, offset + query.length))}</mark>${escaped(str.slice(offset + query.length))}`;
    },
    [query]
  );
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { rootMargin: PAGE_OVERSCAN }
    );
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (visible || active) {
      void pdf
        .getPage(pageNumber)
        .then((page) => {
          const viewport = page.getViewport({ scale: 1 });
          const ratio = viewport.height / viewport.width;
          const safeWidth = Math.min(
            DOCUMENT_LIMITS.pdfPageWidth,
            Math.sqrt(DOCUMENT_LIMITS.pdfCanvasPixels / ratio),
            DOCUMENT_LIMITS.pdfCanvasDimension / ratio
          );
          if (!cancelled && Number.isFinite(safeWidth) && safeWidth >= 1) {
            setWidth(safeWidth);
            setHeight(safeWidth * ratio);
          } else if (!cancelled) setWidth(0);
        })
        .catch(() => {
          if (!cancelled) setWidth(0);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [visible, active, pdf, pageNumber]);
  useEffect(() => {
    if (active) element.current?.scrollIntoView({ block: "start" });
  }, [active]);
  return (
    <div
      ref={element}
      className="repository-document__pdf-page"
      style={{ minHeight: height }}
      data-page-number={pageNumber}
    >
      {pageError ? (
        <p role="alert">{pageError}</p>
      ) : (visible || active) && width !== undefined && width > 0 ? (
        <Page
          suspense={false}
          pageNumber={pageNumber}
          width={width}
          devicePixelRatio={1}
          renderAnnotationLayer={false}
          renderTextLayer
          customTextRenderer={renderText}
          onRenderError={(failure) =>
            setPageError(
              failure.message.includes("maximum allowed size")
                ? DOCUMENT_TOO_LARGE
                : "This PDF page could not be displayed."
            )
          }
          error={<p role="alert">This PDF page could not be displayed.</p>}
        />
      ) : (
        <p>{width === 0 ? "This PDF page could not be displayed." : `Page ${pageNumber}`}</p>
      )}
    </div>
  );
};

export const PdfDocumentViewer = ({ bytes }: { readonly bytes: Uint8Array }): ReactElement => {
  const file = useMemo(() => ({ data: new Uint8Array(bytes) }), [bytes]);
  const workerPort = useRef<Worker | undefined>(undefined);
  const [worker, setWorker] = useState<InstanceType<typeof pdfjs.PDFWorker>>();
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [text, setText] = useState<string[]>([]);
  const [indexed, setIndexed] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  useEffect(() => {
    // Give PDF.js a local worker port directly. Its default file-origin path
    // wraps the module in a blob/CDN loader, unnecessary for bundled Electron
    // assets and unreliable under file:// origins.
    const port = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), {
      type: "module"
    });
    port.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (isPdfImageLimitFailure(event.data)) setError(DOCUMENT_TOO_LARGE);
    });
    workerPort.current = port;
    const localWorker = pdfjs.PDFWorker.create({ port });
    port.onerror = () => {
      setError("The PDF viewer could not start. Select another file to continue grading.");
    };
    setWorker(localWorker);
    return () => {
      localWorker.destroy();
      port.terminate();
    };
  }, []);
  useEffect(() => {
    if (error !== undefined) {
      worker?.destroy();
      workerPort.current?.terminate();
    }
  }, [error, worker]);
  const matches = useMemo(
    () =>
      query.trim() === ""
        ? []
        : text.flatMap((page, index) =>
            page.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ? [index + 1] : []
          ),
    [text, query]
  );
  useEffect(() => {
    setMatchIndex(0);
  }, [query]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setError(DOCUMENT_TOO_LARGE);
    }, DOCUMENT_LIMITS.processingMilliseconds);
    if (indexed) clearTimeout(timer);
    return () => {
      clearTimeout(timer);
    };
  }, [indexed]);
  useEffect(() => {
    let cancelled = false;
    const indexText = async (): Promise<void> => {
      if (pdf !== undefined) {
        const pages: string[] = [];
        let characters = 0;
        for (let pageNumber = 1; pageNumber <= pdf.numPages && !cancelled; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const value = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
          characters += value.length;
          if (characters > DOCUMENT_LIMITS.pdfTextCharacters) throw new Error(DOCUMENT_TOO_LARGE);
          pages.push(value);
        }
        if (!cancelled) {
          setText(pages);
          setIndexed(true);
        }
      }
    };
    void indexText().catch((failure: unknown) => {
      if (!cancelled) {
        if (failure instanceof Error && failure.message === DOCUMENT_TOO_LARGE)
          setError(DOCUMENT_TOO_LARGE);
        else {
          setIndexed(true);
          setText([]);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pdf]);
  const options = useMemo(() => ({ ...PDF_OPTIONS, worker }), [worker]);
  const hasText = text.some((page) => page.trim() !== "");
  const activePage = matches[matchIndex];
  return error ? (
    <p role="alert">{error}</p>
  ) : worker === undefined ? (
    <p role="status">Starting PDF worker…</p>
  ) : (
    <>
      <DocumentFindBar
        query={query}
        onQuery={setQuery}
        onNext={() =>
          setMatchIndex((value) => (matches.length === 0 ? 0 : (value + 1) % matches.length))
        }
        onPrevious={() =>
          setMatchIndex((value) =>
            matches.length === 0 ? 0 : (value + matches.length - 1) % matches.length
          )
        }
        disabled={!indexed || !hasText}
        status={
          !indexed
            ? "Preparing text search…"
            : !hasText
              ? "Text search unavailable: no usable text layer. No OCR is performed."
              : query
                ? `${matches.length === 0 ? 0 : matchIndex + 1} of ${matches.length} matching pages`
                : ""
        }
      />
      <div className="repository-document__pages">
        <Document
          suspense={false}
          file={file}
          options={options}
          onLoadSuccess={(document) => {
            if (document.numPages > DOCUMENT_LIMITS.pdfPages) {
              setError(DOCUMENT_TOO_LARGE);
              void document.loadingTask.destroy();
            } else setPdf(document);
          }}
          onLoadError={() => setError("This PDF is damaged, encrypted, or unsupported.")}
          onPassword={() => setError("Password-protected PDFs cannot be displayed in Graider.")}
          loading={<p role="status">Opening PDF…</p>}
        >
          {pdf === undefined
            ? null
            : Array.from({ length: pdf.numPages }, (_, index) => (
                <LazyPdfPage
                  key={index}
                  pageNumber={index + 1}
                  active={activePage === index + 1}
                  query={query}
                  pdf={pdf}
                />
              ))}
        </Document>
      </div>
    </>
  );
};
