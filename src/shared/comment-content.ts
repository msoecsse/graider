export interface CommentTextNode {
  readonly kind: "text";
  readonly text: string;
}

export interface CommentInlineCodeNode {
  readonly kind: "inline_code";
  readonly text: string;
}

export type CommentInlineNode = CommentTextNode | CommentInlineCodeNode;

export interface CommentParagraphBlock {
  readonly kind: "paragraph";
  readonly children: readonly CommentInlineNode[];
}

export interface CommentCodeBlock {
  readonly kind: "code_block";
  readonly text: string;
  readonly language?: string;
}

export type CommentContentBlock = CommentParagraphBlock | CommentCodeBlock;

const OPENING_FENCE = /^```(?<language>[^\s`]+)?[ \t]*$/u;
const CLOSING_FENCE = /^```[ \t]*$/u;
const PARAGRAPH_BOUNDARY = /\n[ \t]*\n+/u;
const NOT_FOUND_INDEX = -1;

const normalizeLineEndings = (text: string): string => text.replace(/\r\n?|\n/g, "\n");

const appendText = (nodes: CommentInlineNode[], text: string): void => {
  if (text !== "") nodes.push({ kind: "text", text });
};

export const parseCommentInlineContent = (text: string): readonly CommentInlineNode[] => {
  const nodes: CommentInlineNode[] = [];
  let cursor = 0;
  let openingBacktick = text.indexOf("`", cursor);

  while (openingBacktick !== NOT_FOUND_INDEX) {
    const closingBacktick = text.indexOf("`", openingBacktick + 1);
    if (closingBacktick === NOT_FOUND_INDEX) {
      appendText(nodes, text.slice(cursor));
      cursor = text.length;
      openingBacktick = NOT_FOUND_INDEX;
    } else {
      appendText(nodes, text.slice(cursor, openingBacktick));
      nodes.push({ kind: "inline_code", text: text.slice(openingBacktick + 1, closingBacktick) });
      cursor = closingBacktick + 1;
      openingBacktick = text.indexOf("`", cursor);
    }
  }

  appendText(nodes, text.slice(cursor));
  return nodes;
};

const paragraphBlocks = (
  text: string,
  parseInline: boolean = true
): readonly CommentParagraphBlock[] =>
  text === ""
    ? []
    : text
        .split(PARAGRAPH_BOUNDARY)
        .filter((paragraph) => paragraph !== "")
        .map((paragraph) => ({
          kind: "paragraph",
          children: parseInline
            ? parseCommentInlineContent(paragraph)
            : [{ kind: "text", text: paragraph }]
        }));

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

const appendParagraphBlocks = (
  blocks: CommentContentBlock[],
  lines: readonly string[],
  parseInline: boolean = true
): void => {
  blocks.push(...paragraphBlocks(lines.join("\n"), parseInline));
};

const isFenceLikeLine = (line: string): boolean => line.startsWith("```");

export const parseCommentContent = (text: string): readonly CommentContentBlock[] => {
  const lines = normalizeLineEndings(text).split("\n");
  const blocks: CommentContentBlock[] = [];
  let proseStart = 0;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const fence = openingFence(lines[lineIndex] ?? "");
    const closingIndex = fence === undefined ? undefined : closingFenceIndex(lines, lineIndex);

    if (fence !== undefined && closingIndex !== undefined) {
      appendParagraphBlocks(blocks, lines.slice(proseStart, lineIndex));
      blocks.push({
        kind: "code_block",
        text: lines.slice(lineIndex + 1, closingIndex).join("\n"),
        ...(fence.language === undefined ? {} : { language: fence.language })
      });
      proseStart = closingIndex + 1;
      lineIndex = closingIndex + 1;
    } else if (isFenceLikeLine(lines[lineIndex] ?? "")) {
      appendParagraphBlocks(blocks, lines.slice(proseStart, lineIndex));
      appendParagraphBlocks(blocks, lines.slice(lineIndex), false);
      proseStart = lines.length;
      lineIndex = lines.length;
    } else lineIndex += 1;
  }

  appendParagraphBlocks(blocks, lines.slice(proseStart));
  return blocks;
};
