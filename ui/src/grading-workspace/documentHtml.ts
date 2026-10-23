import { DOCUMENT_LIMITS } from "../../electron/repositoryDocumentPolicy";
import DOMPurify from "dompurify";

// No links, styles, forms, SVG, IDs, or embedded active content. Only raster
// images emitted inline by the bounded converter can carry a resource URL.
export const sanitizeDocumentHtml = (html: string): string => {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "img",
      "sup",
      "sub",
      "blockquote"
    ],
    ALLOWED_ATTR: ["src", "alt", "colspan", "rowspan"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true
  });
  fragment.querySelectorAll("img").forEach((image) => {
    if (!/^data:image\/(?:png|jpeg);base64,[a-z\d+/=]+$/iu.test(image.getAttribute("src") ?? ""))
      image.remove();
  });
  const container = document.createElement("div");
  container.append(fragment);
  return container.innerHTML;
};

export const findDocumentMatches = (
  root: HTMLElement,
  query: string,
  matchLimit: number = DOCUMENT_LIMITS.findMatches
): Range[] => {
  const matches: Range[] = [];
  if (query.trim() !== "") {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: { node: Node; start: number; end: number }[] = [];
    let combined = "";
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (
        node.parentElement?.closest("script, style, noscript, [hidden], [aria-hidden='true']") ===
        null
      ) {
        const start = combined.length;
        combined += node.textContent ?? "";
        nodes.push({ node, start, end: combined.length });
      }
    }
    // Unicode case-insensitive matching retains original UTF-16 offsets;
    // lowercasing strings can expand characters and detach Range boundaries.
    const BACKSLASH_CODE_POINT = 92;
    const escapeCharacter = String.fromCodePoint(BACKSLASH_CODE_POINT);
    const metaCharacters = ".*+?^${}()|[]" + escapeCharacter;
    const escaped = Array.from(query, (character) =>
      metaCharacters.includes(character) ? escapeCharacter + character : character
    ).join("");
    const pattern = new RegExp(escaped, "giu");
    let startNodeIndex = 0;
    let endNodeIndex = 0;
    for (
      let match = pattern.exec(combined);
      match !== null && matches.length < matchLimit;
      match = pattern.exec(combined)
    ) {
      const offset = match.index;
      const length = match[0].length;
      // Matches advance through the text in order; advance node cursors too,
      // so searching a long report does not rescan every preceding source line.
      while (startNodeIndex < nodes.length && nodes[startNodeIndex]!.end <= offset)
        startNodeIndex += 1;
      while (endNodeIndex < nodes.length && nodes[endNodeIndex]!.end < offset + length)
        endNodeIndex += 1;
      const start = nodes[startNodeIndex];
      const end = nodes[endNodeIndex];
      if (start && end) {
        const range = root.ownerDocument.createRange();
        range.setStart(start.node, offset - start.start);
        range.setEnd(end.node, offset + length - end.start);
        matches.push(range);
      }
    }
  }
  return matches;
};
