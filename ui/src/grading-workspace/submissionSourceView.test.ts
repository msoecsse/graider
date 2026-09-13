import { describe, expect, it } from "vitest";
import {
  captureCanonicalViewState,
  createSourceViewZoneDescriptors,
  isGradingStudentSourceDto,
  mapCanonicalSelectionToCombinedSelection,
  mapCanonicalSourceRangeToCombinedLineRange,
  mapCanonicalSourcePositionToCombinedPosition,
  mapCombinedPositionToCanonicalSourcePosition,
  mapCombinedSelectionToSourceRange,
  type CanonicalEditorViewState,
  type SubmissionSourceModelDto
} from "./submissionSourceView";

const MODEL: SubmissionSourceModelDto = {
  combinedText: "class First {}\n// first\n\nclass Second {}\n// second",
  syntheticCombinedLines: [3],
  sections: [
    {
      status: "found",
      file: "src/First.java",
      sourceText: "class First {}\n// first",
      sourceLineCount: 2,
      combinedStartLine: 1,
      combinedEndLine: 2,
      insertionLine: 1
    },
    { status: "missing", file: "src/Missing.java", insertionLine: 3 },
    {
      status: "found",
      file: "src/Second.java",
      sourceText: "class Second {}\n// second",
      sourceLineCount: 2,
      combinedStartLine: 4,
      combinedEndLine: 5,
      insertionLine: 4
    }
  ]
};

describe("submission source renderer adapter", () => {
  it("maps a cursor and same-file selection through canonical combined-line metadata", () => {
    expect(
      mapCombinedSelectionToSourceRange(MODEL, { startLineNumber: 4, endLineNumber: 4 })
    ).toEqual({ file: "src/Second.java", startLine: 1, endLine: 1 });
    expect(
      mapCombinedSelectionToSourceRange(MODEL, { startLineNumber: 4, endLineNumber: 5 })
    ).toEqual({ file: "src/Second.java", startLine: 1, endLine: 2 });
  });

  it("rejects cross-file and synthetic-line selections", () => {
    expect(
      mapCombinedSelectionToSourceRange(MODEL, { startLineNumber: 2, endLineNumber: 4 })
    ).toBeUndefined();
    expect(
      mapCombinedSelectionToSourceRange(MODEL, { startLineNumber: 3, endLineNumber: 3 })
    ).toBeUndefined();
    expect(
      mapCombinedSelectionToSourceRange(MODEL, { startLineNumber: 2, endLineNumber: 3 })
    ).toBeUndefined();
  });

  it("maps canonical cursor and same-file selection back into found source sections", () => {
    expect(
      mapCanonicalSourcePositionToCombinedPosition(MODEL, {
        file: "src/Second.java",
        line: 2,
        column: 5
      })
    ).toEqual({ lineNumber: 5, column: 5 });
    expect(
      mapCanonicalSelectionToCombinedSelection(MODEL, {
        file: "src/Second.java",
        startLine: 1,
        startColumn: 2,
        endLine: 2,
        endColumn: 4
      })
    ).toEqual({
      startLineNumber: 4,
      startColumn: 2,
      endLineNumber: 5,
      endColumn: 4
    });
  });

  it("maps canonical annotation ranges without inventing display coordinates", () => {
    expect(
      mapCanonicalSourceRangeToCombinedLineRange(MODEL, {
        file: "src/Second.java",
        startLine: 1,
        endLine: 2
      })
    ).toEqual({ startLineNumber: 4, endLineNumber: 5 });
    expect(
      mapCanonicalSourceRangeToCombinedLineRange(MODEL, {
        file: "src/Missing.java",
        startLine: 1,
        endLine: 1
      })
    ).toBeUndefined();
    expect(
      mapCanonicalSourceRangeToCombinedLineRange(MODEL, {
        file: "src/Second.java",
        startLine: 1,
        endLine: 3
      })
    ).toBeUndefined();
  });

  it("does not restore missing, stale, synthetic, or out-of-line canonical positions", () => {
    expect(
      mapCanonicalSourcePositionToCombinedPosition(MODEL, {
        file: "src/Missing.java",
        line: 1,
        column: 1
      })
    ).toBeUndefined();
    expect(
      mapCanonicalSourcePositionToCombinedPosition(MODEL, {
        file: "src/Second.java",
        line: 3,
        column: 1
      })
    ).toBeUndefined();
    expect(
      mapCanonicalSourcePositionToCombinedPosition(MODEL, {
        file: "src/Second.java",
        line: 1,
        column: 99
      })
    ).toBeUndefined();
    expect(
      mapCanonicalSelectionToCombinedSelection(MODEL, {
        file: "src/Missing.java",
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1
      })
    ).toBeUndefined();
  });

  it("captures only canonical source coordinates and omits invalid selections", () => {
    expect(
      mapCombinedPositionToCanonicalSourcePosition(MODEL, { lineNumber: 5, column: 4 })
    ).toEqual({ file: "src/Second.java", line: 2, column: 4 });
    expect(
      captureCanonicalViewState(MODEL, {
        scrollTop: 42.5,
        cursor: { lineNumber: 5, column: 4 },
        selection: {
          startLineNumber: 4,
          startColumn: 2,
          endLineNumber: 5,
          endColumn: 4
        }
      })
    ).toEqual({
      scrollTop: 42.5,
      cursor: { file: "src/Second.java", line: 2, column: 4 },
      selection: {
        file: "src/Second.java",
        startLine: 1,
        startColumn: 2,
        endLine: 2,
        endColumn: 4
      }
    });

    const crossFile = captureCanonicalViewState(MODEL, {
      scrollTop: 7,
      cursor: { lineNumber: 4, column: 1 },
      selection: {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 4,
        endColumn: 1
      }
    });
    expect(crossFile).toEqual({
      scrollTop: 7,
      cursor: { file: "src/Second.java", line: 1, column: 1 }
    });
    expect(JSON.stringify(crossFile)).not.toMatch(/combined|lineNumber|model|uri/iu);
  });

  it("skips a synthetic cursor unless a prior canonical cursor is supplied for scroll capture", () => {
    expect(
      captureCanonicalViewState(MODEL, {
        scrollTop: 12,
        cursor: { lineNumber: 3, column: 1 }
      })
    ).toBeUndefined();
    expect(
      captureCanonicalViewState(
        MODEL,
        { scrollTop: 13, cursor: { lineNumber: 3, column: 1 } },
        { file: "src/First.java", line: 2, column: 3 }
      )
    ).toEqual({
      scrollTop: 13,
      cursor: { file: "src/First.java", line: 2, column: 3 }
    });
  });

  it("captures a cursor-only location as the canonical DTO without a selection property", () => {
    const captured = captureCanonicalViewState(MODEL, {
      scrollTop: 3,
      cursor: { lineNumber: 1, column: 2 }
    });
    if (captured === undefined) throw new Error("Expected canonical cursor-only view state");
    const cursorOnly: CanonicalEditorViewState = captured;
    expect(cursorOnly).toEqual({
      scrollTop: 3,
      cursor: { file: "src/First.java", line: 1, column: 2 }
    });
    expect(cursorOnly).not.toHaveProperty("selection");
  });

  it("creates ordered visual-only headers at canonical insertion positions", () => {
    expect(createSourceViewZoneDescriptors(MODEL)).toEqual([
      { file: "src/First.java", status: "found", afterLineNumber: 0, ordinal: 0 },
      { file: "src/Missing.java", status: "missing", afterLineNumber: 2, ordinal: 1 },
      { file: "src/Second.java", status: "found", afterLineNumber: 3, ordinal: 2 }
    ]);
    expect(MODEL.combinedText).not.toContain("src/First.java");
    expect(MODEL.combinedText).not.toContain("Required file not found");
  });

  it("accepts the renderer-safe source DTO and rejects malformed metadata", () => {
    expect(isGradingStudentSourceDto({ status: "success", studentId: "ada", ...MODEL })).toBe(true);
    expect(
      isGradingStudentSourceDto({
        status: "success",
        studentId: "ada",
        ...MODEL,
        syntheticCombinedLines: [0]
      })
    ).toBe(false);
  });
});
