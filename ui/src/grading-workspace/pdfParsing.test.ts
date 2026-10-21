import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readRepositoryDocument } from "../../electron/repositoryDocuments";

const root = path.resolve("test-fixtures/repository-documents");
describe("real local PDF.js parsing", () => {
  it("loads a trusted text PDF and exposes selectable/searchable text", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: await readRepositoryDocument(root, "normal.pdf"),
      useSystemFonts: true
    });
    try {
      const pdf = await task.promise;
      expect(pdf.numPages).toBe(1);
      const page = await pdf.getPage(1);
      const text = await page.getTextContent();
      expect(text.items.map((item) => ("str" in item ? item.str : "")).join(" ")).toContain(
        "Grading document page 1"
      );
    } finally {
      await task.destroy();
    }
  });
  it("supports multiple pages and image-only PDFs without OCR", async () => {
    const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const multiple = getDocument({
      data: new Uint8Array(fs.readFileSync(path.join(root, "multipage.pdf"))),
      useSystemFonts: true
    });
    const image = getDocument({
      data: new Uint8Array(fs.readFileSync(path.join(root, "image-only.pdf")))
    });
    try {
      const pdf = await multiple.promise;
      const MULTIPAGE_FIXTURE_PAGES = 12;
      expect(pdf.numPages).toBe(MULTIPAGE_FIXTURE_PAGES);
      expect(
        (await (await pdf.getPage(MULTIPAGE_FIXTURE_PAGES)).getTextContent()).items
      ).not.toHaveLength(0);
      const page = await (await image.promise).getPage(1);
      expect((await page.getTextContent()).items).toHaveLength(0);
      expect((await page.getOperatorList()).fnArray).toContain(OPS.paintImageXObject);
    } finally {
      await multiple.destroy();
      await image.destroy();
    }
  });
  it("rejects a malformed PDF without crashing", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(fs.readFileSync(path.join(root, "malformed.pdf")))
    });
    try {
      await expect(task.promise).rejects.toThrow();
    } finally {
      await task.destroy();
    }
  });
});

describe("PDF.js image resource policy", () => {
  it("does not decode pathological embedded-image dimensions", async () => {
    const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { DOCUMENT_LIMITS } = await import("../../electron/repositoryDocumentPolicy");
    const task = getDocument({
      data: new Uint8Array(fs.readFileSync(path.join(root, "oversized-image.pdf"))),
      stopAtErrors: true,
      maxImageSize: DOCUMENT_LIMITS.imagePixels
    });
    try {
      const page = await (await task.promise).getPage(1);
      // PDF.js exposes an empty diagnostic operator list on this error; its
      // display/render path reports the safety error (also checked in Electron).
      expect((await page.getOperatorList()).fnArray).not.toContain(OPS.paintImageXObject);
    } finally {
      await task.destroy();
    }
  });
});
