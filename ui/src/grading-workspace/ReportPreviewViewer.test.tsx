import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportPreviewViewer } from "./ReportPreviewViewer";

const report =
  '<style>.repeat { color: red }</style><h1 id="heading">Report</h1><a href="#source">Source</a><pre id="source">Repeat repeated REPEAT</pre><p>Required PDF: extracted feedback</p><p>Required DOCX: more feedback</p>';
const loadReport = (html = report): HTMLIFrameElement => {
  const frame = screen.getByTitle("Grading report preview") as HTMLIFrameElement;
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  // jsdom queues selectionchange against iframe Windows it later destroys;
  // use a small Selection double for the fallback (Chromium uses CSS highlights).
  let selectedRange: Range | undefined;
  const selection = {
    removeAllRanges: () => {
      selectedRange = undefined;
    },
    addRange: (range: Range) => {
      selectedRange = range;
    },
    toString: () => selectedRange?.toString() ?? "",
    get rangeCount() {
      return selectedRange === undefined ? 0 : 1;
    }
  };
  Object.defineProperty(doc.defaultView!, "getSelection", {
    configurable: true,
    value: () => selection
  });
  Object.defineProperty(doc.defaultView!.Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
  fireEvent.load(frame);
  return frame;
};
describe("current report Find", () => {
  it.each([{ metaKey: true }, { ctrlKey: true }])(
    "routes platform Find from the report, counts case-insensitively, wraps, scrolls and preserves anchors (%j)",
    async (modifier) => {
      render(<ReportPreviewViewer html={report} />);
      const frame = loadReport();
      const doc = frame.contentDocument!;
      const anchor = doc.getElementById("source");
      fireEvent.keyDown(doc.body, { key: "f", ...modifier });
      const input = await screen.findByRole("textbox", { name: "Find in report" });
      expect(input).toHaveFocus();
      fireEvent.change(input, { target: { value: "repeat" } });
      expect(await screen.findByText("1 of 3")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Previous report match" }));
      expect(screen.getByText("3 of 3")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Next report match" }));
      expect(screen.getByText("1 of 3")).toBeInTheDocument();
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByText("2 of 3")).toBeInTheDocument();
      expect(doc.defaultView!.getSelection()!.toString()).toBe("repeat");
      expect(doc.defaultView!.Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        block: "center"
      });
      expect(doc.getElementById("source")).toBe(anchor);
      expect(doc.querySelector("a")?.getAttribute("href")).toBe("#source");
      expect(doc.querySelectorAll("mark")).toHaveLength(0);
      expect(frame).toHaveAttribute("sandbox", "allow-same-origin");
      fireEvent.click(screen.getByRole("button", { name: "Close report search" }));
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(doc.defaultView!.getSelection()!.rangeCount).toBe(0);
    }
  );
  it("searches extracted text, handles no matches, respects text entries and resets when the student preview unmounts", async () => {
    const { rerender } = render(<ReportPreviewViewer key="ada" html={report} />);
    const frame = loadReport();
    const doc = frame.contentDocument!;
    const editor = doc.createElement("textarea");
    doc.body.append(editor);
    fireEvent.keyDown(editor, { key: "f", ctrlKey: true });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find in report" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "feedback" } });
    expect(await screen.findByText("1 of 2")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "another student's content" } });
    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next report match" })).toBeDisabled();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    rerender(<ReportPreviewViewer key="grace" html="<p>New student</p>" />);
    loadReport("<p>New student</p>");
    fireEvent.click(screen.getByRole("button", { name: "Find in report" }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "feedback" } });
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });
});

it("highlights all matches and the active match through CSS highlights, removing both on close", async () => {
  render(<ReportPreviewViewer html={report} />);
  const frame = loadReport();
  const doc = frame.contentDocument!;
  const highlights = new Map<string, Set<Range>>();
  Object.defineProperty(doc.defaultView!, "CSS", { configurable: true, value: { highlights } });
  Object.defineProperty(doc.defaultView!, "Highlight", {
    configurable: true,
    value: class extends Set<Range> {
      constructor(...ranges: Range[]) {
        super(ranges);
      }
    }
  });
  fireEvent.click(screen.getByRole("button", { name: "Find in report" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "repeat" } });
  await waitFor(() => expect(highlights.get("report-matches")?.size).toBe(3));
  expect(highlights.get("report-active")?.size).toBe(1);
  const first = Array.from(highlights.get("report-active")!)[0];
  fireEvent.click(screen.getByRole("button", { name: "Next report match" }));
  expect(Array.from(highlights.get("report-active")!)[0]).not.toBe(first);
  fireEvent.click(screen.getByRole("button", { name: "Close report search" }));
  expect(highlights.has("report-matches")).toBe(false);
  expect(highlights.has("report-active")).toBe(false);
});

it("counts the entire report even when it exceeds an individual document viewer's search limit", async () => {
  const { DOCUMENT_LIMITS } = await import("../../electron/repositoryDocumentPolicy");
  const total = DOCUMENT_LIMITS.findMatches + 1;
  const html = `<p>${"Repeated ".repeat(total)}</p>`;
  render(<ReportPreviewViewer html={html} />);
  loadReport(html);
  fireEvent.click(screen.getByRole("button", { name: "Find in report" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "repeated" } });
  expect(await screen.findByText(`1 of ${total}`)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Previous report match" }));
  expect(screen.getByText(`${total} of ${total}`)).toBeInTheDocument();
});
