export interface CommentTextNode {
  readonly kind: "text";
  readonly text: string;
}

export interface CommentEmphasisNode {
  readonly kind: "emphasis";
  readonly children: readonly CommentInlineNode[];
}
export interface CommentStrongNode {
  readonly kind: "strong";
  readonly children: readonly CommentInlineNode[];
}
export interface CommentLinkTextNode {
  readonly kind: "link_text";
  readonly text: string;
  readonly url?: string;
}

export interface CommentInlineCodeNode {
  readonly kind: "inline_code";
  readonly text: string;
}

export type CommentInlineNode =
  | CommentTextNode
  | CommentInlineCodeNode
  | CommentEmphasisNode
  | CommentStrongNode
  | CommentLinkTextNode;

export interface CommentParagraphBlock {
  readonly kind: "paragraph";
  readonly children: readonly CommentInlineNode[];
}

export interface CommentCodeBlock {
  readonly kind: "code_block";
  readonly text: string;
  readonly language?: string;
}

export interface CommentListItem {
  readonly children: readonly CommentContentBlock[];
}
export interface CommentListBlock {
  readonly kind: "list";
  readonly ordered: boolean;
  readonly items: readonly CommentListItem[];
}
export interface CommentQuoteBlock {
  readonly kind: "quote";
  readonly children: readonly CommentContentBlock[];
}

export type CommentContentBlock =
  | CommentParagraphBlock
  | CommentCodeBlock
  | CommentListBlock
  | CommentQuoteBlock;

const OPENING_FENCE = /^```(?<language>[^\s`]+)?[ \t]*$/u;
const CLOSING_FENCE = /^```[ \t]*$/u;
const PARAGRAPH_BOUNDARY = /\n[ \t]*\n+/u;
const NOT_FOUND_INDEX = -1;
const PREVIOUS_LINE_OFFSET = -1;
const LAST_CHILD_OFFSET = -1;
const INLINE_CODE_DELIMITER_LENGTH = 1;
const EMPHASIS_DELIMITER_LENGTH = 1;
const STRONG_DELIMITER_LENGTH = 2;

const normalizeLineEndings = (text: string): string => text.replace(/\r\n?|\n/g, "\n");

const appendText = (nodes: CommentInlineNode[], text: string): void => {
  if (text !== "") nodes.push({ kind: "text", text });
};

export const parseCommentInlineContent = (text: string): readonly CommentInlineNode[] => {
  const tokenize = (value: string): CommentInlineNode[] => {
    const nodes: CommentInlineNode[] = [];
    const pattern =
      /(`[^`]*`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^\s)]+\))/gu;
    let cursor = 0;
    for (const match of value.matchAll(pattern)) {
      const index = match.index;
      appendText(nodes, value.slice(cursor, index));
      const token = match[0];
      if (token.startsWith("`"))
        nodes.push({
          kind: "inline_code",
          text: token.slice(INLINE_CODE_DELIMITER_LENGTH, -INLINE_CODE_DELIMITER_LENGTH)
        });
      else if (token.startsWith("**") || token.startsWith("__"))
        nodes.push({
          kind: "strong",
          children: tokenize(token.slice(STRONG_DELIMITER_LENGTH, -STRONG_DELIMITER_LENGTH))
        });
      else if (token.startsWith("*") || token.startsWith("_"))
        nodes.push({
          kind: "emphasis",
          children: tokenize(token.slice(EMPHASIS_DELIMITER_LENGTH, -EMPHASIS_DELIMITER_LENGTH))
        });
      else {
        const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/u.exec(token);
        nodes.push({
          kind: "link_text",
          text: link?.[1] ?? token,
          ...(link?.[2] === undefined ? {} : { url: link[2] })
        });
      }
      cursor = index + token.length;
    }
    appendText(nodes, value.slice(cursor));
    return nodes;
  };
  return tokenize(text);
};

const openingFence = (line: string): { readonly language?: string } | undefined => {
  const match = OPENING_FENCE.exec(line);
  return match === null
    ? undefined
    : { ...(match.groups?.language === undefined ? {} : { language: match.groups.language }) };
};

const closingFenceIndex = (lines: readonly string[], startIndex: number): number | undefined => {
  const relativeIndex = lines.slice(startIndex + 1).findIndex((line) => CLOSING_FENCE.test(line));
  return relativeIndex === NOT_FOUND_INDEX ? undefined : startIndex + relativeIndex + 1;
};

export const parseCommentContent = (text: string): readonly CommentContentBlock[] => {
  const lines = normalizeLineEndings(text).split("\n");
  const blocks: CommentContentBlock[] = [];
  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const line = lines[lineIndex] ?? "";
    if (line.trim() === "") {
      lineIndex += 1;
    } else if (
      openingFence(line) !== undefined &&
      closingFenceIndex(lines, lineIndex) !== undefined
    ) {
      const fence = openingFence(line);
      const closingIndex = closingFenceIndex(lines, lineIndex);
      if (fence !== undefined && closingIndex !== undefined) {
        blocks.push({
          kind: "code_block",
          text: lines.slice(lineIndex + 1, closingIndex).join("\n"),
          ...(fence.language === undefined ? {} : { language: fence.language })
        });
        lineIndex = closingIndex + 1;
      }
    } else if (openingFence(line) !== undefined) {
      const previousLine = lines[lineIndex + PREVIOUS_LINE_OFFSET] ?? "";
      const previousBlock = blocks.at(LAST_CHILD_OFFSET);
      if (previousLine.trim() === "" && previousBlock?.kind === "paragraph") {
        const children = [...previousBlock.children];
        const lastChild = children.at(LAST_CHILD_OFFSET);
        if (lastChild?.kind === "text") {
          children[children.length + LAST_CHILD_OFFSET] = {
            ...lastChild,
            text: `${lastChild.text}\n`
          };
        } else children.push({ kind: "text", text: "\n" });
        blocks[blocks.length + LAST_CHILD_OFFSET] = { kind: "paragraph", children };
      }
      const remaining = lines.slice(lineIndex).join("\n");
      blocks.push(
        ...remaining
          .split(PARAGRAPH_BOUNDARY)
          .filter((paragraph) => paragraph !== "")
          .map((paragraph) => ({
            kind: "paragraph" as const,
            children: [{ kind: "text" as const, text: paragraph }]
          }))
      );
      lineIndex = lines.length;
    } else if (line.startsWith(">")) {
      const quote: string[] = [];
      while (lineIndex < lines.length && (lines[lineIndex] ?? "").startsWith(">")) {
        quote.push((lines[lineIndex] ?? "").replace(/^> ?/u, ""));
        lineIndex += 1;
      }
      blocks.push({ kind: "quote", children: parseCommentContent(quote.join("\n")) });
    } else if (/^\s*(?:[-+*]|\d+[.)])\s+/u.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/u.test(line);
      const indent = line.match(/^\s*/u)?.[0].length ?? 0;
      const items: CommentListItem[] = [];
      let collectingItems = true;
      while (lineIndex < lines.length && collectingItems) {
        const current = lines[lineIndex] ?? "";
        const item = /^(\s*)([-+*]|\d+[.)])\s+(.*)$/u.exec(current);
        if (item === null || item[1]?.length !== indent || /^\d/u.test(item[2] ?? "") !== ordered) {
          collectingItems = false;
        } else {
          const itemLines = [item[3] ?? ""];
          lineIndex += 1;
          let collectingContinuation = true;
          while (lineIndex < lines.length && collectingContinuation) {
            const continuation = lines[lineIndex] ?? "";
            const continuationIndent = continuation.match(/^\s*/u)?.[0].length ?? 0;
            if (continuation.trim() === "" || continuationIndent <= indent) {
              collectingContinuation = false;
            } else {
              itemLines.push(continuation.slice(Math.min(continuation.length, indent + 2)));
              lineIndex += 1;
            }
          }
          items.push({ children: parseCommentContent(itemLines.join("\n")) });
        }
      }
      blocks.push({ kind: "list", ordered, items });
    } else {
      const paragraph: string[] = [line];
      lineIndex += 1;
      while (
        lineIndex < lines.length &&
        (lines[lineIndex] ?? "").trim() !== "" &&
        openingFence(lines[lineIndex] ?? "") === undefined &&
        !(lines[lineIndex] ?? "").startsWith(">") &&
        !/^\s*(?:[-+*]|\d+[.)])\s+/u.test(lines[lineIndex] ?? "")
      ) {
        paragraph.push(lines[lineIndex] ?? "");
        lineIndex += 1;
      }
      blocks.push({ kind: "paragraph", children: parseCommentInlineContent(paragraph.join("\n")) });
    }
  }
  return blocks;
};
