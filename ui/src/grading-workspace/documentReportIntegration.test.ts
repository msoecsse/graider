import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractReportDocument,
  normalizeDocxHtml
} from "../../electron/documentReportExtraction.js";
import { DOCUMENT_LIMITS } from "../../electron/repositoryDocumentPolicy.js";
import { buildSubmissionSourceModel } from "../../../src/grading/submission-source.js";
import { buildGradingReportModel } from "../../../src/grading/grading-report-model.js";
import { renderGradingReportHtml } from "../../../src/grading/grading-report-html.js";
import type { DocumentContent, ReportDocument } from "../../../src/shared/document-content.js";

const fixtures = path.resolve("test-fixtures/repository-documents");
const roots: string[] = [];
const createRepository = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "graider-report-documents-"));
  roots.push(root);
  await fs.cp(fixtures, root, { recursive: true });
  await fs.mkdir(path.join(root, "src", "nested"), { recursive: true });
  await fs.writeFile(path.join(root, "src/Main.java"), "class Main {}\n");
  await fs.copyFile(path.join(root, "normal.pdf"), path.join(root, "src/nested/Design.PDF"));
  return root;
};
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
const render = async (
  root: string,
  requiredFiles: string[],
  documents?: ReportDocument[]
): Promise<string> => {
  const source = buildSubmissionSourceModel({
    repositoryRoot: root,
    requiredFiles,
    deferDocumentReading: true
  });
  expect(source.status).toBe("success");
  if (source.status !== "success") throw new Error("Source unavailable");
  const extracted =
    documents ??
    (await Promise.all(
      source.value.sections.flatMap((section) =>
        section.status === "found" && section.document
          ? [
              extractReportDocument(root, section.file).then((content) => ({
                file: section.file,
                content
              }))
            ]
          : []
      )
    ));
  const model = buildGradingReportModel({
    course: { code: "SE", title: "Software" },
    assignment: { slug: "lab", title: "Design" },
    gradingState: {
      schemaVersion: 1,
      studentId: "ada",
      submissionCommitSha: "current",
      status: "complete",
      appliedComments: [],
      manualAdjustments: []
    },
    rubric: [{ id: "design", name: "Design", points: 10 }],
    source: source.value,
    documents: extracted
  });
  if (model.status !== "success") throw new Error(model.message);
  return renderGradingReportHtml(model.value);
};

describe("required document reports", () => {
  it("includes required structured DOCX and PDF beside unchanged source, excluding other documents and preserving numbered anchors", async () => {
    const root = await createRepository();
    const html = await render(root, ["src/Main.java", "./structured.docx", "./normal.pdf"]);
    expect(html).toContain('id="source-file-1-line-1"');
    expect(html).toContain("class Main {}");
    expect(html).toContain('id="source-file-2"');
    expect(html).toContain("Document: structured.docx");
    expect(html).toContain("Document: normal.pdf");
    for (const tag of ["h1", "p", "strong", "em", "ul", "li", "table", "tr", "td"])
      expect(html).toContain(`<${tag}>`);
    expect(html).not.toMatch(/<img|data:image|<a[^>]+https?:|<script/iu);
    for (const file of ["image-only.pdf", "multipage.pdf", "malformed.docx"])
      expect(html).not.toContain(file);
  });
  it("uses existing exact filename, nested path, ambiguity and src/test exclusion semantics", async () => {
    const root = await createRepository();
    const html = await render(root, [
      "Design.PDF",
      "./structured.docx",
      "design.PDF",
      "./missing.docx"
    ]);
    expect(html).toContain("Document: src/nested/Design.PDF");
    expect(html).toContain("Required file unavailable.");
    expect(html.match(/Required file unavailable\./gu)).toHaveLength(2);
    expect(html).not.toContain("Document: design.PDF");
    await fs.mkdir(path.join(root, "src/test"));
    await fs.copyFile(path.join(root, "normal.pdf"), path.join(root, "src/test/Design.PDF"));
    expect(await render(root, ["Design.PDF"])).toContain("Document: src/nested/Design.PDF");
    await fs.copyFile(path.join(root, "normal.pdf"), path.join(root, "src/Design.PDF"));
    expect(await render(root, ["Design.PDF"])).not.toContain("Document:");
  });
  it.each(["normal.pdf", "multipage.pdf"])("extracts real PDF text from %s", async (file) => {
    const content = await extractReportDocument(fixtures, file);
    expect(content.status).toBe("content");
    if (content.status === "content") {
      expect(content.nodes.length).toBe(file === "normal.pdf" ? 1 : 12);
      expect(JSON.stringify(content)).toMatch(/page|PDF/iu);
    }
  });
  it("contains encrypted PDFs and over-limit extracted page counts", async () => {
    expect(await extractReportDocument(fixtures, "encrypted.pdf")).toMatchObject({
      status: "unavailable",
      message: expect.stringContaining("encrypted")
    });
    const original = DOCUMENT_LIMITS.pdfPages;
    Object.assign(DOCUMENT_LIMITS, { pdfPages: 1 });
    try {
      expect(await extractReportDocument(fixtures, "multipage.pdf")).toMatchObject({
        status: "unavailable",
        message: expect.stringContaining("safety limits")
      });
    } finally {
      Object.assign(DOCUMENT_LIMITS, { pdfPages: original });
    }
  });

  it("contains image-only and malformed statuses while preserving the rest of the report", async () => {
    const html = await render(await createRepository(), [
      "./image-only.pdf",
      "./malformed.pdf",
      "./malformed.docx",
      "src/Main.java"
    ]);
    expect(html).toContain("No extractable text available for this PDF.");
    expect(html.match(/damaged, encrypted, or unsupported/gu)).toHaveLength(2);
    expect(html).toContain("class Main {}");
    expect(html).not.toContain("<img");
  });
  it.each(["huge.pdf", "huge.docx"])("contains oversized %s without reading it", async (file) => {
    const root = await createRepository();
    const handle = await fs.open(path.join(root, file), "w");
    await handle.truncate(DOCUMENT_LIMITS.fileBytes + 1);
    await handle.close();
    expect(await render(root, ["./" + file, "src/Main.java"])).toContain(
      "exceeds document safety limits"
    );
  });
  it("drops active markup, links, images and every attribute, and escapes PDF and DOCX text at the report boundary", async () => {
    const root = await createRepository();
    const nodes = normalizeDocxHtml(
      '<h1 id="source-file-1" onclick="evil()">Title</h1><p>A &amp; B<br>Second</p><a href="https://evil">Label</a><img src="file:///secret"><script>evil()</script><iframe src="https://evil"></iframe><table><tr><td style="background:url(https://evil)">Cell</td></tr></table>'
    );
    const html = await render(
      root,
      ["./structured.docx", "./normal.pdf"],
      [
        { file: "structured.docx", content: { status: "content", nodes } },
        {
          file: "normal.pdf",
          content: {
            status: "content",
            nodes: [{ text: '</article><script src="https://evil">evil()</script>' }]
          }
        }
      ]
    );
    expect(html).toContain("A &amp; B<br>Second");
    expect(html).toContain("Label");
    expect(html).toContain("&lt;/article&gt;&lt;script");
    expect(html).not.toMatch(/<script|<img|<iframe|onclick=|href="https:|src="|style="/iu);
    expect(html.match(/id="source-file-1"/gu)).toHaveLength(1);
  });
  it("rejects arbitrary paths and symlinks through the same trusted reader", async () => {
    const root = await createRepository();
    await fs.symlink(path.join(root, "normal.pdf"), path.join(root, "link.pdf"));
    for (const file of ["../normal.pdf", "/etc/passwd", "link.pdf", "src/../../normal.pdf"])
      expect((await extractReportDocument(root, file)).status).toBe("unavailable");
  });
  it("re-reads current bytes after an intentional revision update and supports repeated generation", async () => {
    const root = await createRepository();
    const before = await render(root, ["./normal.pdf"]);
    await fs.copyFile(path.join(root, "multipage.pdf"), path.join(root, "normal.pdf"));
    const after = await render(root, ["./normal.pdf"]);
    expect(after).not.toEqual(before);
    expect(await render(root, ["./normal.pdf"])).toEqual(after);
  });
  it("runs real PDF and DOCX parsers in the packaged worker entry", async () => {
    for (const file of ["normal.pdf", "structured.docx", "image-only.pdf"]) {
      const content = await new Promise<DocumentContent>((resolve, reject) => {
        const worker = new Worker(path.resolve("dist-electron/documentReportWorker.mjs"), {
          workerData: { root: fixtures, file }
        });
        worker.once("message", (result) => {
          void worker.terminate();
          resolve(result);
        });
        worker.once("error", reject);
      });
      expect(content.status).toBe(file === "image-only.pdf" ? "unavailable" : "content");
    }
  });
});
