import { useEffect, useRef, type ReactElement } from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import "monaco-editor/esm/vs/basic-languages/java/java.contribution.js";
import "monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/esm/vs/editor/contrib/find/browser/findController.js";
import {
  captureCanonicalViewState,
  createSourceViewZoneDescriptors,
  mapCanonicalSelectionToCombinedSelection,
  mapCanonicalSourceRangeToCombinedLineRange,
  mapCanonicalSourcePositionToCombinedPosition,
  mapCombinedSelectionToSourceRange,
  type CanonicalEditorViewState,
  type CanonicalSourcePosition,
  type CanonicalSourceRange,
  type SubmissionSourceModelDto
} from "./submissionSourceView";

window.MonacoEnvironment = { getWorker: () => new EditorWorker() };

export const MONACO_SOURCE_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  domReadOnly: true,
  language: "java",
  lineNumbers: "on",
  minimap: { enabled: false },
  automaticLayout: true,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  acceptSuggestionOnEnter: "off",
  codeLens: false,
  lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off },
  links: false,
  padding: { top: 8, bottom: 16 },
  scrollBeyondLastLine: false,
  tabFocusMode: false
};

const createHeaderNode = (file: string, status: "found" | "missing" | "ambiguous"): HTMLElement => {
  const node = document.createElement("div");
  node.className = `grading-source-header${status === "found" ? "" : " grading-source-header--missing"}`;
  const title = document.createElement("strong");
  title.textContent = file;
  node.append(title);
  if (status !== "found") {
    const message = document.createElement("span");
    message.textContent =
      status === "missing" ? "Required file not found" : "Required file is ambiguous";
    node.append(message);
  }
  return node;
};

export interface GradingSourceAnnotation {
  readonly id: string;
  readonly text: string;
  readonly deduction: number;
  readonly rubricCategoryName?: string;
  readonly sourceLocation?: CanonicalSourceRange;
}

const createAnnotationDecorations = (
  model: SubmissionSourceModelDto,
  annotations: readonly GradingSourceAnnotation[]
): monaco.editor.IModelDeltaDecoration[] =>
  annotations.flatMap((annotation) => {
    if (annotation.sourceLocation === undefined) return [];
    const range = mapCanonicalSourceRangeToCombinedLineRange(model, annotation.sourceLocation);
    if (range === undefined) return [];
    const details = [annotation.text, `Adjustment: ${annotation.deduction}`];
    if (annotation.rubricCategoryName !== undefined)
      details.push(`Category: ${annotation.rubricCategoryName}`);
    return [
      {
        range: new monaco.Range(range.startLineNumber, 1, range.endLineNumber, 1),
        options: {
          isWholeLine: true,
          className: "grading-source-comment-range",
          linesDecorationsClassName: "grading-source-comment-gutter",
          hoverMessage: { value: details.join("\n\n") }
        }
      }
    ];
  });

export const MonacoSourceViewer = ({
  annotations = [],
  initialViewState,
  model,
  studentId,
  onCanonicalViewStateChange,
  onCanonicalSelectionChange
}: {
  annotations?: readonly GradingSourceAnnotation[];
  initialViewState?: CanonicalEditorViewState | null;
  model: SubmissionSourceModelDto;
  studentId: string;
  onCanonicalViewStateChange?: (viewState: CanonicalEditorViewState) => void;
  onCanonicalSelectionChange?: (selection: CanonicalSourceRange | undefined) => void;
}): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewStateChangeRef = useRef(onCanonicalViewStateChange);
  const selectionChangeRef = useRef(onCanonicalSelectionChange);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => {
    viewStateChangeRef.current = onCanonicalViewStateChange;
    selectionChangeRef.current = onCanonicalSelectionChange;
  }, [onCanonicalSelectionChange, onCanonicalViewStateChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const sourceModel = monaco.editor.createModel(model.combinedText, "java");
    const editor = monaco.editor.create(container, {
      ...MONACO_SOURCE_OPTIONS,
      model: sourceModel
    });
    const decorations = editor.createDecorationsCollection();
    decorationsRef.current = decorations;
    editor.changeViewZones((accessor) => {
      for (const descriptor of createSourceViewZoneDescriptors(model)) {
        accessor.addZone({
          afterLineNumber: descriptor.afterLineNumber,
          ordinal: descriptor.ordinal,
          heightInPx: descriptor.status === "found" ? 34 : 58,
          domNode: createHeaderNode(descriptor.file, descriptor.status)
        });
      }
    });
    let latestValidCursor: CanonicalSourcePosition | undefined;
    if (initialViewState !== null && initialViewState !== undefined) {
      const cursor = mapCanonicalSourcePositionToCombinedPosition(model, initialViewState.cursor);
      const selection =
        initialViewState.selection === undefined
          ? undefined
          : mapCanonicalSelectionToCombinedSelection(model, initialViewState.selection);
      if (selection !== undefined) {
        const cursorIsStart =
          cursor?.lineNumber === selection.startLineNumber &&
          cursor.column === selection.startColumn;
        editor.setSelection({
          selectionStartLineNumber: cursorIsStart
            ? selection.endLineNumber
            : selection.startLineNumber,
          selectionStartColumn: cursorIsStart ? selection.endColumn : selection.startColumn,
          positionLineNumber: cursorIsStart ? selection.startLineNumber : selection.endLineNumber,
          positionColumn: cursorIsStart ? selection.startColumn : selection.endColumn
        });
      } else if (cursor !== undefined) {
        editor.setPosition(cursor);
      }
      editor.setScrollTop(initialViewState.scrollTop);
      if (cursor !== undefined) latestValidCursor = initialViewState.cursor;
    } else {
      const position = editor.getPosition();
      if (position !== null) {
        latestValidCursor = captureCanonicalViewState(model, {
          scrollTop: editor.getScrollTop(),
          cursor: position
        })?.cursor;
      }
    }

    const capture = (allowFallbackCursor: boolean): void => {
      const position = editor.getPosition();
      if (position === null) return;
      const selection = editor.getSelection();
      const viewState = captureCanonicalViewState(
        model,
        {
          scrollTop: editor.getScrollTop(),
          cursor: position,
          ...(selection === null
            ? {}
            : {
                selection: {
                  startLineNumber: selection.startLineNumber,
                  startColumn: selection.startColumn,
                  endLineNumber: selection.endLineNumber,
                  endColumn: selection.endColumn
                }
              })
        },
        allowFallbackCursor ? latestValidCursor : undefined
      );
      if (viewState === undefined) return;
      latestValidCursor = viewState.cursor;
      viewStateChangeRef.current?.(viewState);
    };
    const emitCanonicalSelection = (selection: monaco.Selection): void => {
      selectionChangeRef.current?.(
        mapCombinedSelectionToSourceRange(model, {
          startLineNumber: selection.startLineNumber,
          endLineNumber: selection.endLineNumber
        })
      );
    };
    const currentSelection = editor.getSelection();
    if (currentSelection !== null) emitCanonicalSelection(currentSelection);
    const selectionListener = editor.onDidChangeCursorSelection(({ selection }) => {
      emitCanonicalSelection(selection);
      capture(false);
    });
    const scrollListener = editor.onDidScrollChange(({ scrollTopChanged }) => {
      if (scrollTopChanged) capture(true);
    });

    return () => {
      decorations.clear();
      if (decorationsRef.current === decorations) decorationsRef.current = null;
      selectionListener.dispose();
      scrollListener.dispose();
      editor.dispose();
      sourceModel.dispose();
    };
  }, [initialViewState, model, studentId]);

  useEffect(() => {
    decorationsRef.current?.set(createAnnotationDecorations(model, annotations));
  }, [annotations, model, studentId]);

  return (
    <div
      ref={containerRef}
      className="grading-source-editor"
      data-testid="grading-source-editor"
      aria-label={`Read-only source for ${studentId}`}
    />
  );
};
