/** Shared interpretation of PDF.js text items; marked-content records carry no text. */
export const pdfTextItems = (items: readonly unknown[]): { text: string; endOfLine: boolean }[] =>
  items.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("str" in item) ||
      typeof item.str !== "string"
    )
      return { text: "", endOfLine: false };
    return { text: item.str, endOfLine: "hasEOL" in item && item.hasEOL === true };
  });

/** Retain content-stream reading order and meaningful line ends, without page layout. */
export const normalizePdfText = (items: readonly unknown[]): string =>
  pdfTextItems(items)
    .map((item) => item.text + (item.endOfLine ? "\n" : " "))
    .join("")
    .replace(/[^\S\n]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .trim();
