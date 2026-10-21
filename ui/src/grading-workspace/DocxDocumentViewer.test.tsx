import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocxDocumentViewer } from "./DocxDocumentViewer";
import { DOCUMENT_LIMITS, DOCUMENT_TOO_LARGE } from "../../electron/repositoryDocumentPolicy";

class ConversionWorker {
  static current: ConversionWorker;
  onmessage?: (event: MessageEvent) => void;
  onerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    ConversionWorker.current = this;
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("DOCX viewer lifecycle", () => {
  it("sanitizes converted HTML and selects next/previous text matches", async () => {
    vi.stubGlobal("Worker", ConversionWorker);
    Element.prototype.scrollIntoView = vi.fn();
    render(<DocxDocumentViewer bytes={new Uint8Array([1])} />);
    act(() =>
      ConversionWorker.current.onmessage?.({
        data: {
          html: '<h1>Heading</h1><p>Find <strong>this</strong> phrase. Find this phrase.</p><a href="file:///secret">Unsafe link</a>'
        }
      } as MessageEvent)
    );
    expect(await screen.findByRole("heading", { name: "Heading" })).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Find in document" });
    fireEvent.change(input, { target: { value: "Find this phrase" } });
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 matches");
    expect(window.getSelection()?.toString()).toBe("Find this phrase");
    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(screen.getByRole("status")).toHaveTextContent("2 of 2 matches");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 matches");
    expect(ConversionWorker.current.terminate).toHaveBeenCalled();
  });
  it("terminates pathological conversion and leaves an understandable error", () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", ConversionWorker);
    render(<DocxDocumentViewer bytes={new Uint8Array([1])} />);
    act(() => {
      vi.advanceTimersByTime(DOCUMENT_LIMITS.processingMilliseconds);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(DOCUMENT_TOO_LARGE);
    expect(ConversionWorker.current.terminate).toHaveBeenCalled();
  });
  it("shows corrupt-file errors and terminates conversion on navigation", () => {
    vi.stubGlobal("Worker", ConversionWorker);
    const { unmount } = render(<DocxDocumentViewer bytes={new Uint8Array([1])} />);
    act(() =>
      ConversionWorker.current.onmessage?.({
        data: { error: "This DOCX is damaged or contains unsupported content." }
      } as MessageEvent)
    );
    expect(screen.getByRole("alert")).toHaveTextContent("damaged");
    unmount();
    expect(ConversionWorker.current.terminate).toHaveBeenCalled();
  });
});
