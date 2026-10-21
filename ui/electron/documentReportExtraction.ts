import { normalizePdfText } from "./pdfDocumentText.js";
import mammoth from "mammoth";
import { XMLParser } from "fast-xml-parser";
import {
  DOCX_CONVERSION_OPTIONS,
  DOCUMENT_LIMITS,
  DOCUMENT_TOO_LARGE,
  repositoryDocumentKind
} from "./repositoryDocumentPolicy.js";
import { readRepositoryDocument } from "./repositoryDocuments.js";
import type {
  DocumentContent,
  DocumentNode,
  DocumentTag
} from "../../src/shared/document-content.js";

const TAGS = new Set<string>([
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
  "sup",
  "sub",
  "blockquote"
]);
const DROP = new Set(["img", "script", "style", "iframe", "object", "svg", "math", "form"]);
export const normalizeDocxHtml = (html: string): DocumentNode[] => {
  if (html.length > DOCUMENT_LIMITS.docxHtmlCharacters || /<!DOCTYPE|<!ENTITY/iu.test(html))
    throw new Error(DOCUMENT_TOO_LARGE);
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: true,
    trimValues: false,
    parseTagValue: false,
    htmlEntities: true,
    unpairedTags: ["br", "img", "hr", "input", "meta", "link"]
  });
  const visit = (entries: unknown, depth: number): DocumentNode[] => {
    if (depth > DOCUMENT_LIMITS.contentDepth) throw new Error(DOCUMENT_TOO_LARGE);
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry: Record<string, unknown>): DocumentNode[] =>
      Object.entries(entry).flatMap(([tag, children]): DocumentNode[] => {
        if (tag === "#text") return [{ text: String(children) }];
        if (DROP.has(tag) || tag.startsWith("#") || tag.startsWith("?")) return [];
        const nodes = visit(children, depth + 1);
        return TAGS.has(tag) ? [{ tag: tag as DocumentTag, children: nodes }] : nodes;
      })
    );
  };
  return visit(parser.parse(html), 0);
};

export const extractReportDocument = async (
  root: string,
  file: string
): Promise<DocumentContent> => {
  try {
    const bytes = await readRepositoryDocument(root, file);
    if (repositoryDocumentKind(file) === "docx") {
      const result = await mammoth.convertToHtml(
        { buffer: Buffer.from(bytes) },
        {
          ...DOCX_CONVERSION_OPTIONS,
          // Never read/decode embedded images for report output.
          convertImage: mammoth.images.imgElement(async () => ({ src: "" }))
        }
      );
      return { status: "content", nodes: normalizeDocxHtml(result.value) };
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
      data: bytes,
      stopAtErrors: true,
      useSystemFonts: false,
      disableFontFace: true,
      enableXfa: false,
      useWorkerFetch: false,
      maxImageSize: DOCUMENT_LIMITS.imagePixels
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > DOCUMENT_LIMITS.pdfPages) throw new Error(DOCUMENT_TOO_LARGE);
      const nodes: DocumentNode[] = [];
      let characters = 0;
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const text = normalizePdfText(content.items);
        characters += text.length;
        if (characters > DOCUMENT_LIMITS.pdfTextCharacters) throw new Error(DOCUMENT_TOO_LARGE);
        if (text !== "") nodes.push({ tag: "p", children: [{ text }] });
        page.cleanup();
      }
      return nodes.length === 0
        ? { status: "unavailable", message: "No extractable text available for this PDF." }
        : { status: "content", nodes };
    } finally {
      await task.destroy();
    }
  } catch (error) {
    return {
      status: "unavailable",
      message:
        error instanceof Error && error.message === DOCUMENT_TOO_LARGE
          ? "This document could not be included safely because it exceeds document safety limits."
          : "This document could not be included: unavailable, damaged, encrypted, or unsupported."
    };
  }
};
