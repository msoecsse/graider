import { describe, expect, it } from "vitest";
import { parseCommentContent } from "../../../src/shared/comment-content.js";

const text = (value: string) => ({ kind: "text" as const, text: value });
const inlineCode = (value: string) => ({ kind: "inline_code" as const, text: value });
const LONG_CODE_REPEAT_COUNT = 80;

describe("parseCommentContent", () => {
  it("keeps plain prose as a paragraph and preserves ordinary line breaks", () => {
    expect(parseCommentContent("First line\nSecond line")).toEqual([
      { kind: "paragraph", children: [text("First line\nSecond line")] }
    ]);
  });

  it("parses inline code and multiple inline-code spans", () => {
    expect(parseCommentContent("Use `scanner.nextLine()` before `parseInt`.")).toEqual([
      {
        kind: "paragraph",
        children: [
          text("Use "),
          inlineCode("scanner.nextLine()"),
          text(" before "),
          inlineCode("parseInt"),
          text(".")
        ]
      }
    ]);
  });

  it("parses fenced code blocks with optional language metadata", () => {
    expect(
      parseCommentContent(["Before", "```java", "  total += value;", "```", "After"].join("\n"))
    ).toEqual([
      { kind: "paragraph", children: [text("Before")] },
      { kind: "code_block", language: "java", text: "  total += value;" },
      { kind: "paragraph", children: [text("After")] }
    ]);
    expect(parseCommentContent(["```", "value", "```"].join("\n"))).toEqual([
      { kind: "code_block", text: "value" }
    ]);
  });

  it("keeps multiple blocks, adjacent prose, inline backticks, and blank code lines in order", () => {
    const content = [
      "First",
      "```",
      "const example = `literal`;",
      "",
      "  return example;",
      "```",
      "Second",
      "```text",
      "third",
      "```",
      "Fourth"
    ].join("\n");

    expect(parseCommentContent(content)).toEqual([
      { kind: "paragraph", children: [text("First")] },
      { kind: "code_block", text: "const example = `literal`;\n\n  return example;" },
      { kind: "paragraph", children: [text("Second")] },
      { kind: "code_block", language: "text", text: "third" },
      { kind: "paragraph", children: [text("Fourth")] }
    ]);
  });

  it("accepts an empty fenced code block and normalizes CRLF and CR line endings", () => {
    expect(parseCommentContent("Before\r\n```\r\n\r\n```\r\nAfter")).toEqual([
      { kind: "paragraph", children: [text("Before")] },
      { kind: "code_block", text: "" },
      { kind: "paragraph", children: [text("After")] }
    ]);
    expect(parseCommentContent("```\r  value();\r```")).toEqual([
      { kind: "code_block", text: "  value();" }
    ]);
  });

  it("fails closed for unmatched inline backticks and unclosed fences", () => {
    expect(parseCommentContent("Call `scanner.nextLine() here.")).toEqual([
      { kind: "paragraph", children: [text("Call `scanner.nextLine() here.")] }
    ]);

    const unclosed = ["Before", "", "```java", "  call();", "", "After"].join("\n");
    const blocks = parseCommentContent(unclosed);
    expect(blocks.some((block) => block.kind === "code_block")).toBe(false);
    expect(blocks).toEqual([
      { kind: "paragraph", children: [text("Before\n")] },
      { kind: "paragraph", children: [text("```java\n  call();")] },
      { kind: "paragraph", children: [text("After")] }
    ]);
  });

  it("keeps HTML-looking prose and code as ordinary text data", () => {
    expect(
      parseCommentContent(
        [
          '<script>alert("student")</script>',
          "```html",
          "<img src=x onerror=alert(1)>",
          "```"
        ].join("\n")
      )
    ).toEqual([
      { kind: "paragraph", children: [text('<script>alert("student")</script>')] },
      { kind: "code_block", language: "html", text: "<img src=x onerror=alert(1)>" }
    ]);
  });

  it("preserves long code lines without wrapping or truncating them", () => {
    const longLine = "value".repeat(LONG_CODE_REPEAT_COUNT);
    expect(parseCommentContent(["```", longLine, "```"].join("\n"))).toEqual([
      { kind: "code_block", text: longLine }
    ]);
  });
});
