import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSubmissionSourceModel,
  combinedRangeToSourceRange,
  combinedLineToSourceLocation
} from "../../../src/grading/submission-source.js";

const COMBINED_LINE_AFTER_SECOND_SOURCE_FILE = 6;
const COMBINED_LINE_FOR_EMPTY_SOURCE_FILE = 7;
const roots: string[] = [];
const repository = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-submission-source-"));
  roots.push(root);
  return root;
};
const write = (root: string, file: string, contents: string): void => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, "utf8");
};
const model = (root: string, files: string[]) => {
  const result = buildSubmissionSourceModel({ repositoryRoot: root, requiredFiles: files });
  if (result.status === "failure") throw new Error(result.message);
  return result.value;
};

afterEach(() => {
  roots.splice(0).forEach((root) => {
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("submission source model", () => {
  it("loads required files in configured order without inserting headers into combined source", () => {
    const root = repository();
    write(root, "src/A.java", "first\nlast");
    write(root, "src/B.java", "only");
    const source = model(root, ["src/B.java", "src/A.java"]);
    expect(source.sections).toMatchObject([
      {
        file: "src/B.java",
        status: "found",
        sourceText: "only",
        combinedStartLine: 1,
        combinedEndLine: 1
      },
      {
        file: "src/A.java",
        status: "found",
        sourceText: "first\nlast",
        combinedStartLine: 3,
        combinedEndLine: 4
      }
    ]);
    expect(source.combinedText).toBe("only\n\nfirst\nlast");
    expect(source.syntheticCombinedLines).toEqual([2]);
    expect(source.combinedText).not.toContain("A.java");
  });

  it("represents missing files without preventing found files or an all-missing model", () => {
    const root = repository();
    write(root, "src/student/A.java", "a");
    const partial = model(root, ["missing.java", "A.java"]);
    expect(partial.sections).toMatchObject([
      { file: "missing.java", status: "missing" },
      { file: "src/student/A.java", status: "found", sourceText: "a" }
    ]);
    expect(partial.combinedText).toBe("a");
    const absent = model(root, ["one.java", "two.java"]);
    expect(absent.sections).toMatchObject([{ status: "missing" }, { status: "missing" }]);
    expect(absent.combinedText).toBe("");
  });

  it("maps LF, CRLF, first/last, and empty file lines while leaving separators unmapped", () => {
    const root = repository();
    write(root, "src/student/A.java", "one\ntwo");
    write(root, "src/student/B.java", "three\r\nfour");
    write(root, "src/student/Empty.java", "");
    const source = model(root, ["A.java", "B.java", "Empty.java"]);
    expect(combinedLineToSourceLocation(source, 1)).toEqual({
      file: "src/student/A.java",
      sourceLine: 1
    });
    expect(combinedLineToSourceLocation(source, 2)).toEqual({
      file: "src/student/A.java",
      sourceLine: 2
    });
    expect(combinedLineToSourceLocation(source, 3)).toBeUndefined();
    expect(combinedLineToSourceLocation(source, 4)).toEqual({
      file: "src/student/B.java",
      sourceLine: 1
    });
    expect(combinedLineToSourceLocation(source, 5)).toEqual({
      file: "src/student/B.java",
      sourceLine: 2
    });
    expect(
      combinedLineToSourceLocation(source, COMBINED_LINE_AFTER_SECOND_SOURCE_FILE)
    ).toBeUndefined();
    expect(combinedLineToSourceLocation(source, COMBINED_LINE_FOR_EMPTY_SOURCE_FILE)).toEqual({
      file: "src/student/Empty.java",
      sourceLine: 1
    });
    expect(combinedRangeToSourceRange(source, 1, 2)).toEqual({
      file: "src/student/A.java",
      startLine: 1,
      endLine: 2
    });
    expect(combinedRangeToSourceRange(source, 2, 4)).toBeUndefined();
    expect(combinedRangeToSourceRange(source, 2, 3)).toBeUndefined();
  });

  it("rejects unsafe paths and symlinks escaping the repository", () => {
    const root = repository();
    const outside = path.join(os.tmpdir(), `graider-outside-${crypto.randomUUID()}.java`);
    fs.writeFileSync(outside, "private", "utf8");
    try {
      expect(
        buildSubmissionSourceModel({ repositoryRoot: root, requiredFiles: [outside] })
      ).toMatchObject({
        status: "failure",
        code: "unsafe_required_file_path"
      });
      expect(
        buildSubmissionSourceModel({ repositoryRoot: root, requiredFiles: ["../outside.java"] })
      ).toMatchObject({
        status: "failure",
        code: "unsafe_required_file_path"
      });
      fs.mkdirSync(path.join(root, "src/student"), { recursive: true });
      fs.symlinkSync(outside, path.join(root, "src/student/escape.java"));
      expect(
        buildSubmissionSourceModel({
          repositoryRoot: root,
          requiredFiles: ["src/student/escape.java"]
        })
      ).toMatchObject({
        status: "failure",
        code: "unsafe_required_file_path"
      });
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  it("returns a typed failure for an existing non-file and never writes repository content", () => {
    const root = repository();
    fs.mkdirSync(path.join(root, "src/directory.java"), { recursive: true });
    const before = fs.readdirSync(root);
    expect(
      buildSubmissionSourceModel({ repositoryRoot: root, requiredFiles: ["src/directory.java"] })
    ).toMatchObject({
      status: "failure",
      code: "required_file_not_regular"
    });
    expect(fs.readdirSync(root)).toEqual(before);
  });

  it("resolves a bare required filename to its unique student source path and uses that path canonically", () => {
    const root = repository();
    write(root, "src/username/Color.java", "class Color {}");
    const source = model(root, ["Color.java"]);
    expect(source.sections).toMatchObject([{ status: "found", file: "src/username/Color.java" }]);
    expect(combinedLineToSourceLocation(source, 1)).toEqual({
      file: "src/username/Color.java",
      sourceLine: 1
    });
  });

  it("resolves nested packages and each required filename independently", () => {
    const root = repository();
    write(root, "src/foo/bar/Color.java", "class Color {}");
    write(root, "src/jones/ColorDriver.java", "class ColorDriver {}");
    expect(model(root, ["Color.java", "ColorDriver.java"]).sections).toMatchObject([
      { status: "found", file: "src/foo/bar/Color.java" },
      { status: "found", file: "src/jones/ColorDriver.java" }
    ]);
  });

  it("keeps a missing bare filename missing and does not select test sources", () => {
    const root = repository();
    write(root, "src/test/Color.java", "class Color {}");
    expect(model(root, ["Color.java"]).sections).toMatchObject([
      { status: "missing", file: "Color.java" }
    ]);
  });

  it("reports duplicate eligible filenames as ambiguous instead of choosing one", () => {
    const root = repository();
    write(root, "src/ada/Color.java", "class Color {}");
    write(root, "src/grace/Color.java", "class Color {}");
    expect(model(root, ["Color.java"]).sections).toMatchObject([
      {
        status: "ambiguous",
        file: "Color.java",
        candidates: ["src/ada/Color.java", "src/grace/Color.java"]
      }
    ]);
  });

  it("preserves explicit repository-relative required paths", () => {
    const root = repository();
    write(root, "src/explicit/Color.java", "class Color {}");
    expect(model(root, ["src/explicit/Color.java"]).sections).toMatchObject([
      { status: "found", file: "src/explicit/Color.java" }
    ]);
  });
});
