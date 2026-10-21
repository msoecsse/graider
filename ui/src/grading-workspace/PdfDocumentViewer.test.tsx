import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { DOCUMENT_LIMITS, DOCUMENT_TOO_LARGE } from "../../electron/repositoryDocumentPolicy";

const state = vi.hoisted(() => ({
  pages: 12,
  text: "searchable text",
  fail: false,
  encrypted: false,
  page: vi.fn(),
  getPage: vi.fn(),
  destroy: vi.fn(),
  workerTerminate: vi.fn(),
  workerMessage: undefined as ((event: MessageEvent<unknown>) => void) | undefined,
  observers: [] as { callback: IntersectionObserverCallback; element?: Element }[]
}));
vi.mock("react-pdf", () => ({
  pdfjs: {
    GlobalWorkerOptions: {},
    PDFWorker: class LocalWorker {
      static create(): LocalWorker {
        return new LocalWorker();
      }
      destroy = vi.fn();
    }
  },
  Document: ({
    children,
    onLoadSuccess,
    onLoadError,
    onPassword
  }: {
    children: React.ReactNode;
    onLoadSuccess: (pdf: PDFDocumentProxy) => void;
    onLoadError: () => void;
    onPassword: () => void;
  }) => {
    useEffect(() => {
      if (state.fail) onLoadError();
      else if (state.encrypted) onPassword();
      else
        onLoadSuccess({
          numPages: state.pages,
          getPage: state.getPage,
          loadingTask: { destroy: state.destroy }
        } as unknown as PDFDocumentProxy);
    }, []);
    return <div>{children}</div>;
  },
  Page: (props: {
    pageNumber: number;
    renderTextLayer: boolean;
    renderAnnotationLayer: boolean;
  }) => {
    state.page(props);
    return <div>Rendered page {props.pageNumber}</div>;
  }
}));
import { PdfDocumentViewer } from "./PdfDocumentViewer";
const bytes = new Uint8Array([1]);
beforeEach(() => {
  state.pages = 12;
  state.text = "searchable text";
  state.fail = false;
  state.encrypted = false;
  state.observers.length = 0;
  state.page.mockClear();
  state.getPage.mockImplementation(async () => ({
    getTextContent: async () => ({ items: state.text === "" ? [] : [{ str: state.text }] }),
    getViewport: () => ({ width: 612, height: 792 })
  }));
  vi.stubGlobal(
    "Worker",
    class {
      terminate = state.workerTerminate;
      addEventListener(_event: string, listener: (event: MessageEvent<unknown>) => void): void {
        state.workerMessage = listener;
      }
    }
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      record: { callback: IntersectionObserverCallback; element?: Element };
      constructor(callback: IntersectionObserverCallback) {
        this.record = { callback };
        state.observers.push(this.record);
      }
      observe(element: Element): void {
        this.record.element = element;
      }
      disconnect(): void {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
});

describe("lazy read-only PDF viewer", () => {
  it("surfaces the worker's oversized-image failure instead of displaying a blank page, and terminates its worker", async () => {
    render(<PdfDocumentViewer bytes={bytes} />);
    act(() =>
      state.workerMessage?.({
        data: { reason: { message: "Image exceeded maximum allowed size and was removed." } }
      } as MessageEvent<unknown>)
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(DOCUMENT_TOO_LARGE);
    expect(state.workerTerminate).toHaveBeenCalled();
  });
  it("does not mount page canvases until near the viewport, and unmounts them when scrolled away", async () => {
    render(<PdfDocumentViewer bytes={bytes} />);
    await waitFor(() => expect(state.observers).toHaveLength(state.pages));
    expect(state.page).not.toHaveBeenCalled();
    const first = state.observers[0];
    if (!first) throw new Error("Expected page observer.");
    act(() =>
      first.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
    expect(await screen.findByText("Rendered page 1")).toBeVisible();
    expect(state.page).toHaveBeenCalledWith(
      expect.objectContaining({ renderTextLayer: true, renderAnnotationLayer: false })
    );
    act(() =>
      first.callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
    expect(screen.queryByText("Rendered page 1")).not.toBeInTheDocument();
  });
  it("searches text and navigates forward/back through matching pages", async () => {
    render(<PdfDocumentViewer bytes={bytes} />);
    const input = screen.getByRole("textbox", { name: "Find in document" });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: "searchable" } });
    expect(await screen.findByText("1 of 12 matching pages")).toBeVisible();
    expect(await screen.findByText("Rendered page 1")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(await screen.findByText("Rendered page 2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
    expect(await screen.findByText("Rendered page 1")).toBeVisible();
  });
  it("leaves image-only PDFs viewable and disables text search without OCR", async () => {
    state.text = "";
    render(<PdfDocumentViewer bytes={bytes} />);
    expect(await screen.findByText(/Text search unavailable/u)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Find in document" })).toBeDisabled();
    expect(state.observers).toHaveLength(state.pages);
  });
  it.each(["damaged", "encrypted", "oversized"])(
    "contains %s document failure within the viewer",
    async (kind) => {
      state.fail = kind === "damaged";
      state.encrypted = kind === "encrypted";
      if (kind === "oversized") state.pages = DOCUMENT_LIMITS.pdfPages + 1;
      render(<PdfDocumentViewer bytes={bytes} />);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        kind === "oversized"
          ? DOCUMENT_TOO_LARGE
          : kind === "encrypted"
            ? "Password-protected"
            : "damaged"
      );
      expect(state.page).not.toHaveBeenCalled();
    }
  );
});
