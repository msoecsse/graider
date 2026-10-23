import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormattedGradingComment } from "./FormattedGradingComment";
import { renderGradingReportHtml } from "../../../src/grading/grading-report-html";
import type { GradingReportModel } from "../../../src/grading/grading-report-model";

describe("FormattedGradingComment", () => {
  it("renders one ordinary character as a paragraph", () => {
    const { container } = render(<FormattedGradingComment text="a" />);

    expect(container.querySelector(".formatted-grading-comment__paragraph")).toHaveTextContent("a");
  });

  it("renders prose, inline code, and fenced code semantically", () => {
    const { container } = render(
      <FormattedGradingComment
        text={["Use `scanner.nextLine()` here.", "```java", "  total += value;", "```"].join("\n")}
      />
    );

    expect(screen.getByText("scanner.nextLine()").tagName).toBe("CODE");
    expect(container.querySelector("pre > code")?.textContent).toBe("  total += value;");
    expect(container.querySelector(".formatted-grading-comment__inline-code")).not.toBeNull();
    expect(container.querySelector(".formatted-grading-comment__code-block")).not.toBeNull();
  });

  it("renders HTML-looking text as inert text", () => {
    const { container } = render(
      <FormattedGradingComment
        text={
          "Before <script>alert(1)</script> `x < y`\n```html\n<img src=x onerror=alert(1)>\n```"
        }
      />
    );

    expect(container.textContent).toContain("Before <script>alert(1)</script> x < y");
    expect(screen.getByText("x < y").tagName).toBe("CODE");
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders multiple prose and code sections in parsed order", () => {
    const { container } = render(
      <FormattedGradingComment
        text={["First", "```", "one", "```", "Second", "```", "two", "```"].join("\n")}
      />
    );

    expect(
      Array.from(container.querySelectorAll("pre > code")).map((node) => node.textContent)
    ).toEqual(["one", "two"]);
    expect(
      Array.from(container.querySelectorAll(".formatted-grading-comment__paragraph")).map(
        (node) => node.textContent
      )
    ).toEqual(["First", "Second"]);
  });

  it("renders the supported Markdown subset with inert links and HTML", () => {
    const { container } = render(
      <FormattedGradingComment
        text={[
          "A **bold** and *italic* paragraph with a line break.",
          "continued with `code` and [guide](javascript:alert(1)).",
          "",
          "- outer",
          "  - nested",
          "1. first",
          "2. second",
          "> quoted",
          "```js",
          "<img src=x onerror=alert(1)>",
          "```",
          "<script>alert(1)</script>"
        ].join("\n")}
      />
    );

    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(
      container.querySelector("code.formatted-grading-comment__inline-code")?.textContent
    ).toBe("code");
    expect(container.querySelector("ul ul li")?.textContent).toBe("nested");
    expect(container.querySelector("ol")?.children).toHaveLength(2);
    expect(container.querySelector("blockquote")?.textContent).toBe("quoted");
    expect(container.querySelector("a, img, script, iframe, object, embed")).toBeNull();
    expect(container.textContent).toContain("guide (javascript:alert(1))");
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("uses the shared Markdown semantics in grading reports while preserving anchors", () => {
    const report = {
      course: { code: "cs", title: "CS" },
      assignment: { slug: "lab", title: "Lab" },
      studentId: "student",
      submissionCommitSha: "0123456789abcdef",
      gradingStatus: "complete",
      grade: {
        totalScore: 10,
        pointsPossible: 10,
        categories: [],
        uncategorizedCommentAdjustmentTotal: 0
      },
      generalComments: [
        {
          reportIndex: 1,
          id: "comment-1",
          title: "Feedback",
          text: [
            "**bold** [site](javascript:alert(1))",
            "",
            "- first",
            "- second",
            "> quote",
            "",
            "```java",
            "int n = 1;",
            "```",
            "<script>alert(1)</script>"
          ].join("\n"),
          deduction: 0,
          locationAvailable: false
        }
      ],
      manualAdjustments: [],
      sourceFiles: [],
      unmappedSourceComments: [],
      evidence: undefined,
      commitHistory: [],
      generatedAt: "2026-10-23T00:00:00.000Z"
    } as unknown as GradingReportModel;
    const html = renderGradingReportHtml(report);

    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<ul class="comment-content__list">');
    expect(html).toContain('<blockquote class="comment-content__quote">');
    expect(html).toContain(
      '<pre class="comment-content__code-block"><code>int n = 1;</code></pre>'
    );
    expect(html).not.toContain('<a href="javascript:');
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain('id="general-comment-1"');
  });
});
