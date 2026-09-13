export interface FoundSubmissionSourceSection {
  readonly status: "found";
  readonly file: string;
  readonly sourceText: string;
  readonly sourceLineCount: number;
  readonly combinedStartLine: number;
  readonly combinedEndLine: number;
  readonly insertionLine: number;
}

export interface MissingSubmissionSourceSection {
  readonly status: "missing";
  readonly file: string;
  readonly insertionLine: number;
}

export interface AmbiguousSubmissionSourceSection {
  readonly status: "ambiguous";
  readonly file: string;
  readonly candidates: readonly string[];
  readonly insertionLine: number;
}

export type SubmissionSourceSection =
  | FoundSubmissionSourceSection
  | MissingSubmissionSourceSection
  | AmbiguousSubmissionSourceSection;

export interface SubmissionSourceModelDto {
  readonly combinedText: string;
  readonly sections: readonly SubmissionSourceSection[];
  readonly syntheticCombinedLines: readonly number[];
}

export interface GradingStudentSourceDto extends SubmissionSourceModelDto {
  readonly status: "success";
  readonly studentId: string;
}

export interface CombinedLineSelection {
  readonly startLineNumber: number;
  readonly endLineNumber: number;
}

export interface CombinedSourcePosition {
  readonly lineNumber: number;
  readonly column: number;
}

export interface CombinedSourceSelection extends CombinedLineSelection {
  readonly startColumn: number;
  readonly endColumn: number;
}

export type CanonicalEditorViewState = GradingEditorViewState;
export type CanonicalSourcePosition = GradingEditorViewState["cursor"];
export type CanonicalSourceSelection = NonNullable<GradingEditorViewState["selection"]>;

export interface CombinedEditorViewSnapshot {
  readonly scrollTop: number;
  readonly cursor: CombinedSourcePosition;
  readonly selection?: CombinedSourceSelection;
}

export interface CanonicalSourceRange {
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface CombinedSourceLineRange {
  readonly startLineNumber: number;
  readonly endLineNumber: number;
}

export interface SourceViewZoneDescriptor {
  readonly file: string;
  readonly status: "found" | "missing" | "ambiguous";
  readonly afterLineNumber: number;
  readonly ordinal: number;
}

const sourceLocation = (
  model: SubmissionSourceModelDto,
  combinedLine: number
): { readonly file: string; readonly sourceLine: number } | undefined => {
  if (!Number.isInteger(combinedLine) || combinedLine < 1) return undefined;
  const section = model.sections.find(
    (candidate): candidate is FoundSubmissionSourceSection =>
      candidate.status === "found" &&
      combinedLine >= candidate.combinedStartLine &&
      combinedLine <= candidate.combinedEndLine
  );
  return section === undefined
    ? undefined
    : {
        file: section.file,
        sourceLine: combinedLine - section.combinedStartLine + 1
      };
};

const normalizedSourceLines = (section: FoundSubmissionSourceSection): readonly string[] =>
  section.sourceText.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n").split("\n");

const isSourceColumn = (line: string | undefined, column: number): boolean =>
  line !== undefined && Number.isInteger(column) && column > 0 && column <= line.length + 1;

export const mapCombinedPositionToCanonicalSourcePosition = (
  model: SubmissionSourceModelDto,
  position: CombinedSourcePosition
): CanonicalSourcePosition | undefined => {
  const location = sourceLocation(model, position.lineNumber);
  if (location === undefined) return undefined;
  const section = model.sections.find(
    (candidate): candidate is FoundSubmissionSourceSection =>
      candidate.status === "found" && candidate.file === location.file
  );
  if (
    section === undefined ||
    !isSourceColumn(normalizedSourceLines(section)[location.sourceLine - 1], position.column)
  )
    return undefined;
  return { file: location.file, line: location.sourceLine, column: position.column };
};

export const mapCanonicalSourcePositionToCombinedPosition = (
  model: SubmissionSourceModelDto,
  position: CanonicalSourcePosition
): CombinedSourcePosition | undefined => {
  if (!Number.isInteger(position.line) || position.line < 1) return undefined;
  const section = model.sections.find(
    (candidate): candidate is FoundSubmissionSourceSection =>
      candidate.status === "found" && candidate.file === position.file
  );
  if (
    section === undefined ||
    position.line > section.sourceLineCount ||
    !isSourceColumn(normalizedSourceLines(section)[position.line - 1], position.column)
  )
    return undefined;
  const lineNumber = section.combinedStartLine + position.line - 1;
  if (lineNumber > section.combinedEndLine) return undefined;
  return { lineNumber, column: position.column };
};

export const mapCanonicalSelectionToCombinedSelection = (
  model: SubmissionSourceModelDto,
  selection: CanonicalSourceSelection
): CombinedSourceSelection | undefined => {
  const start = mapCanonicalSourcePositionToCombinedPosition(model, {
    file: selection.file,
    line: selection.startLine,
    column: selection.startColumn
  });
  const end = mapCanonicalSourcePositionToCombinedPosition(model, {
    file: selection.file,
    line: selection.endLine,
    column: selection.endColumn
  });
  return start === undefined || end === undefined
    ? undefined
    : {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column
      };
};

const mapCombinedSelectionToCanonicalSelection = (
  model: SubmissionSourceModelDto,
  selection: CombinedSourceSelection
): CanonicalSourceSelection | undefined => {
  const start = mapCombinedPositionToCanonicalSourcePosition(model, {
    lineNumber: selection.startLineNumber,
    column: selection.startColumn
  });
  const end = mapCombinedPositionToCanonicalSourcePosition(model, {
    lineNumber: selection.endLineNumber,
    column: selection.endColumn
  });
  if (start === undefined || end === undefined || start.file !== end.file) return undefined;
  return {
    file: start.file,
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column
  };
};

const isCollapsedSelection = (selection: CombinedSourceSelection): boolean =>
  selection.startLineNumber === selection.endLineNumber &&
  selection.startColumn === selection.endColumn;

export const captureCanonicalViewState = (
  model: SubmissionSourceModelDto,
  snapshot: CombinedEditorViewSnapshot,
  fallbackCursor?: CanonicalSourcePosition
): CanonicalEditorViewState | undefined => {
  const mappedCursor = mapCombinedPositionToCanonicalSourcePosition(model, snapshot.cursor);
  const cursor =
    mappedCursor ??
    (fallbackCursor !== undefined &&
    mapCanonicalSourcePositionToCombinedPosition(model, fallbackCursor) !== undefined
      ? fallbackCursor
      : undefined);
  if (cursor === undefined) return undefined;
  const selection =
    mappedCursor !== undefined &&
    snapshot.selection !== undefined &&
    !isCollapsedSelection(snapshot.selection)
      ? mapCombinedSelectionToCanonicalSelection(model, snapshot.selection)
      : undefined;
  return {
    scrollTop: snapshot.scrollTop,
    cursor,
    ...(selection === undefined ? {} : { selection })
  };
};

export const mapCombinedSelectionToSourceRange = (
  model: SubmissionSourceModelDto,
  selection: CombinedLineSelection
): CanonicalSourceRange | undefined => {
  const start = sourceLocation(model, selection.startLineNumber);
  const end = sourceLocation(model, selection.endLineNumber);
  if (start === undefined || end === undefined || start.file !== end.file) return undefined;
  return { file: start.file, startLine: start.sourceLine, endLine: end.sourceLine };
};

export const mapCanonicalSourceRangeToCombinedLineRange = (
  model: SubmissionSourceModelDto,
  range: CanonicalSourceRange
): CombinedSourceLineRange | undefined => {
  if (
    !Number.isInteger(range.startLine) ||
    !Number.isInteger(range.endLine) ||
    range.startLine < 1 ||
    range.endLine < range.startLine
  )
    return undefined;
  const section = model.sections.find(
    (candidate): candidate is FoundSubmissionSourceSection =>
      candidate.status === "found" && candidate.file === range.file
  );
  if (section === undefined || range.endLine > section.sourceLineCount) return undefined;
  return {
    startLineNumber: section.combinedStartLine + range.startLine - 1,
    endLineNumber: section.combinedStartLine + range.endLine - 1
  };
};

export const createSourceViewZoneDescriptors = (
  model: SubmissionSourceModelDto
): readonly SourceViewZoneDescriptor[] =>
  model.sections.map((section, ordinal) => ({
    file: section.file,
    status: section.status,
    afterLineNumber: Math.max(0, section.insertionLine - 1),
    ordinal
  }));

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isSubmissionSourceSection = (value: unknown): value is SubmissionSourceSection => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const section = value as Record<string, unknown>;
  if (
    typeof section.file !== "string" ||
    !isPositiveInteger(section.insertionLine) ||
    (section.status !== "found" && section.status !== "missing" && section.status !== "ambiguous")
  )
    return false;
  return (
    section.status === "missing" ||
    (section.status === "ambiguous" &&
      Array.isArray(section.candidates) &&
      section.candidates.every((candidate) => typeof candidate === "string")) ||
    (typeof section.sourceText === "string" &&
      isPositiveInteger(section.sourceLineCount) &&
      isPositiveInteger(section.combinedStartLine) &&
      isPositiveInteger(section.combinedEndLine) &&
      section.combinedEndLine >= section.combinedStartLine)
  );
};

export const isGradingStudentSourceDto = (value: unknown): value is GradingStudentSourceDto => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    result.status === "success" &&
    typeof result.studentId === "string" &&
    typeof result.combinedText === "string" &&
    Array.isArray(result.sections) &&
    result.sections.every(isSubmissionSourceSection) &&
    Array.isArray(result.syntheticCombinedLines) &&
    result.syntheticCombinedLines.every(isPositiveInteger)
  );
};
import type { GradingEditorViewState } from "../../electron/ipc";
