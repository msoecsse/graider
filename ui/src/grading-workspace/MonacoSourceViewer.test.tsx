import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SubmissionSourceModelDto } from "./submissionSourceView";

const monaco = vi.hoisted(() => {
  let selectionHandler:
    | ((event: {
        selection: {
          startLineNumber: number;
          startColumn: number;
          endLineNumber: number;
          endColumn: number;
        };
      }) => void)
    | undefined;
  let scrollHandler: ((event: { scrollTopChanged: boolean }) => void) | undefined;
  let position = { lineNumber: 1, column: 1 };
  let selection = {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 1
  };
  let scrollTop = 0;
  const model = { dispose: vi.fn() };
  const selectionListener = { dispose: vi.fn() };
  const scrollListener = { dispose: vi.fn() };
  const addZone = vi.fn();
  const decorations = { set: vi.fn(), clear: vi.fn(), dispose: vi.fn() };
  const editor = {
    changeViewZones: vi.fn((callback: (accessor: { addZone: typeof addZone }) => void) =>
      callback({ addZone })
    ),
    onDidChangeCursorSelection: vi.fn(
      (
        handler: (event: {
          selection: {
            startLineNumber: number;
            startColumn: number;
            endLineNumber: number;
            endColumn: number;
          };
        }) => void
      ) => {
        selectionHandler = handler;
        return selectionListener;
      }
    ),
    onDidScrollChange: vi.fn((handler: (event: { scrollTopChanged: boolean }) => void) => {
      scrollHandler = handler;
      return scrollListener;
    }),
    getPosition: vi.fn(() => position),
    getSelection: vi.fn(() => selection),
    getScrollTop: vi.fn(() => scrollTop),
    setPosition: vi.fn((next: typeof position) => {
      position = next;
    }),
    setSelection: vi.fn(),
    setScrollTop: vi.fn((next: number) => {
      scrollTop = next;
    }),
    createDecorationsCollection: vi.fn(() => decorations),
    dispose: vi.fn()
  };
  return {
    model,
    editor,
    selectionListener,
    scrollListener,
    addZone,
    decorations,
    resetPosition: () => {
      position = { lineNumber: 1, column: 1 };
      selection = {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1
      };
      scrollTop = 0;
    },
    emitSelection: (
      startLineNumber: number,
      startColumn: number,
      endLineNumber: number,
      endColumn: number,
      cursorLineNumber = endLineNumber,
      cursorColumn = endColumn
    ) => {
      position = { lineNumber: cursorLineNumber, column: cursorColumn };
      selection = { startLineNumber, startColumn, endLineNumber, endColumn };
      selectionHandler?.({ selection });
    },
    emitScroll: (nextScrollTop: number) => {
      scrollTop = nextScrollTop;
      scrollHandler?.({ scrollTopChanged: true });
    },
    createModel: vi.fn(() => model),
    create: vi.fn(() => editor)
  };
});

vi.mock("monaco-editor/esm/vs/editor/editor.api.js", () => ({
  editor: {
    createModel: monaco.createModel,
    create: monaco.create,
    ShowLightbulbIconMode: { Off: "off" }
  },
  Range: class {
    constructor(
      readonly startLineNumber: number,
      readonly startColumn: number,
      readonly endLineNumber: number,
      readonly endColumn: number
    ) {}
  }
}));
vi.mock("monaco-editor/esm/vs/editor/editor.worker?worker", () => ({ default: class {} }));
vi.mock("monaco-editor/esm/vs/basic-languages/java/java.contribution.js", () => ({}));
vi.mock(
  "monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js",
  () => ({})
);
vi.mock("monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js", () => ({}));
vi.mock("monaco-editor/esm/vs/editor/contrib/find/browser/findController.js", () => ({}));

import { beforeEach } from "vitest";
import { MonacoSourceViewer, MONACO_SOURCE_OPTIONS } from "./MonacoSourceViewer";

const source = (text: string): SubmissionSourceModelDto => ({
  combinedText: text,
  syntheticCombinedLines: [],
  sections: [
    {
      status: "found",
      file: "src/Main.java",
      sourceText: text,
      sourceLineCount: 1,
      combinedStartLine: 1,
      combinedEndLine: 1,
      insertionLine: 1
    },
    { status: "missing", file: "src/Missing.java", insertionLine: 2 }
  ]
});

describe("MonacoSourceViewer", () => {
  beforeEach(() => {
    monaco.resetPosition();
  });

  it("uses combined text in a read-only Java model and creates visual file zones", () => {
    const first = source("class Main {}");
    const onCanonicalSelectionChange = vi.fn();
    render(
      <MonacoSourceViewer
        model={first}
        studentId="ada"
        onCanonicalSelectionChange={onCanonicalSelectionChange}
      />
    );

    expect(monaco.createModel).toHaveBeenCalledWith(first.combinedText, "java");
    expect(monaco.create).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        model: monaco.model,
        readOnly: true,
        domReadOnly: true,
        lineNumbers: "on",
        minimap: { enabled: false }
      })
    );
    expect(MONACO_SOURCE_OPTIONS.language).toBe("java");
    expect(monaco.addZone).toHaveBeenCalledTimes(2);
    const foundZone = monaco.addZone.mock.calls[0]?.[0] as { domNode: HTMLElement };
    const missingZone = monaco.addZone.mock.calls[1]?.[0] as { domNode: HTMLElement };
    expect(foundZone.domNode).toHaveTextContent("src/Main.java");
    expect(missingZone.domNode).toHaveTextContent("src/Missing.javaRequired file not found");
    expect(first.combinedText).toBe("class Main {}");
    expect(monaco.editor.setPosition).not.toHaveBeenCalled();
    expect(monaco.editor.setSelection).not.toHaveBeenCalled();
    expect(monaco.editor.setScrollTop).not.toHaveBeenCalled();
    expect(onCanonicalSelectionChange).toHaveBeenCalledWith({
      file: "src/Main.java",
      startLine: 1,
      endLine: 1
    });
    monaco.emitSelection(1, 1, 1, 1);
    expect(onCanonicalSelectionChange).toHaveBeenCalledWith({
      file: "src/Main.java",
      startLine: 1,
      endLine: 1
    });
  });

  it("restores canonical cursor, same-file selection, and scroll after view zones without focusing", () => {
    const model: SubmissionSourceModelDto = {
      combinedText: "first\n\nsecond\nlast",
      syntheticCombinedLines: [2],
      sections: [
        {
          status: "found",
          file: "src/First.java",
          sourceText: "first",
          sourceLineCount: 1,
          combinedStartLine: 1,
          combinedEndLine: 1,
          insertionLine: 1
        },
        {
          status: "found",
          file: "src/Second.java",
          sourceText: "second\nlast",
          sourceLineCount: 2,
          combinedStartLine: 3,
          combinedEndLine: 4,
          insertionLine: 3
        }
      ]
    };
    const onCanonicalViewStateChange = vi.fn();
    render(
      <MonacoSourceViewer
        model={model}
        studentId="ada"
        initialViewState={{
          scrollTop: 90,
          cursor: { file: "src/Second.java", line: 2, column: 3 },
          selection: {
            file: "src/Second.java",
            startLine: 1,
            startColumn: 2,
            endLine: 2,
            endColumn: 3
          }
        }}
        onCanonicalViewStateChange={onCanonicalViewStateChange}
      />
    );

    expect(monaco.editor.changeViewZones.mock.invocationCallOrder[0]).toBeLessThan(
      monaco.editor.setSelection.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
    expect(monaco.editor.setSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        selectionStartLineNumber: 3,
        selectionStartColumn: 2,
        positionLineNumber: 4,
        positionColumn: 3
      })
    );
    expect(monaco.editor.setScrollTop).toHaveBeenCalledWith(90);
    expect(onCanonicalViewStateChange).not.toHaveBeenCalled();
    expect(monaco.editor).not.toHaveProperty("focus");
  });

  it("ignores stale restoration coordinates and captures canonical cursor/selection/scroll", () => {
    const onCanonicalViewStateChange = vi.fn();
    render(
      <MonacoSourceViewer
        model={source("class Main {}")}
        studentId="ada"
        initialViewState={{
          scrollTop: 50,
          cursor: { file: "src/Gone.java", line: 20, column: 2 }
        }}
        onCanonicalViewStateChange={onCanonicalViewStateChange}
      />
    );

    expect(monaco.editor.setPosition).not.toHaveBeenCalled();
    expect(monaco.editor.setScrollTop).toHaveBeenCalledWith(50);
    monaco.emitSelection(1, 2, 1, 5);
    expect(onCanonicalViewStateChange).toHaveBeenLastCalledWith({
      scrollTop: 50,
      cursor: { file: "src/Main.java", line: 1, column: 5 },
      selection: {
        file: "src/Main.java",
        startLine: 1,
        startColumn: 2,
        endLine: 1,
        endColumn: 5
      }
    });
    monaco.emitScroll(75);
    expect(onCanonicalViewStateChange).toHaveBeenLastCalledWith({
      scrollTop: 75,
      cursor: { file: "src/Main.java", line: 1, column: 5 },
      selection: {
        file: "src/Main.java",
        startLine: 1,
        startColumn: 2,
        endLine: 1,
        endColumn: 5
      }
    });
    expect(JSON.stringify(onCanonicalViewStateChange.mock.calls)).not.toMatch(
      /lineNumber|model|uri/iu
    );
  });

  it("disposes the obsolete editor/model on source change and the current resources on unmount", () => {
    const { rerender, unmount } = render(
      <MonacoSourceViewer model={source("class First {}")} studentId="ada" />
    );
    rerender(<MonacoSourceViewer model={source("class Second {}")} studentId="grace" />);

    expect(monaco.editor.dispose).toHaveBeenCalledTimes(1);
    expect(monaco.model.dispose).toHaveBeenCalledTimes(1);
    expect(monaco.selectionListener.dispose).toHaveBeenCalledTimes(1);
    expect(monaco.scrollListener.dispose).toHaveBeenCalledTimes(1);

    unmount();
    expect(monaco.editor.dispose).toHaveBeenCalledTimes(2);
    expect(monaco.model.dispose).toHaveBeenCalledTimes(2);
    expect(monaco.selectionListener.dispose).toHaveBeenCalledTimes(2);
    expect(monaco.scrollListener.dispose).toHaveBeenCalledTimes(2);
    expect(monaco.decorations.clear).toHaveBeenCalledTimes(2);
  });

  it("derives whole-line source annotations and safely skips general or unmappable comments", () => {
    const model: SubmissionSourceModelDto = {
      combinedText: "first\nsecond\n\nlast",
      syntheticCombinedLines: [3],
      sections: [
        {
          status: "found",
          file: "src/Main.java",
          sourceText: "first\nsecond",
          sourceLineCount: 2,
          combinedStartLine: 1,
          combinedEndLine: 2,
          insertionLine: 1
        }
      ]
    };
    render(
      <MonacoSourceViewer
        model={model}
        studentId="ada"
        annotations={[
          {
            id: "mapped",
            text: "Use a clearer loop",
            deduction: -2,
            rubricCategoryName: "Code Quality",
            sourceLocation: { file: "src/Main.java", startLine: 1, endLine: 2 }
          },
          {
            id: "general",
            text: "General",
            deduction: -1
          },
          {
            id: "stale",
            text: "Stale",
            deduction: -1,
            sourceLocation: { file: "src/Gone.java", startLine: 1, endLine: 1 }
          }
        ]}
      />
    );

    expect(monaco.decorations.set).toHaveBeenLastCalledWith([
      expect.objectContaining({
        range: expect.objectContaining({ startLineNumber: 1, endLineNumber: 2 }),
        options: expect.objectContaining({
          isWholeLine: true,
          className: "grading-source-comment-range",
          linesDecorationsClassName: "grading-source-comment-gutter"
        })
      })
    ]);
    expect(JSON.stringify(monaco.decorations.set.mock.calls.at(-1))).toContain(
      "Use a clearer loop"
    );
    expect(model.combinedText).toBe("first\nsecond\n\nlast");
  });
});
