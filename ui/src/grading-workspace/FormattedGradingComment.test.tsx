import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormattedGradingComment } from "./FormattedGradingComment";

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
});
