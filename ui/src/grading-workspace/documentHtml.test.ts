import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sanitizeDocumentHtml, findDocumentMatches } from "./documentHtml";
import { convertDocx } from "./docxConversion";
import { DOCUMENT_LIMITS, DOCUMENT_TOO_LARGE } from "../../electron/repositoryDocumentPolicy";
import JSZip from "jszip";

const fixture = (file: string): ArrayBuffer =>
  new Uint8Array(fs.readFileSync(path.resolve("test-fixtures/repository-documents", file))).buffer;
describe("local DOCX conversion and sanitization", () => {
  it("renders a real DOCX with headings, emphasis, lists, tables, and an embedded image", async () => {
    const html = sanitizeDocumentHtml(await convertDocx(fixture("structured.docx")));
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(container.querySelector("h1")).toHaveTextContent("Review heading");
    expect(container.querySelector("p")).toHaveTextContent("Readable paragraph");
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("em")).toHaveTextContent("italic");
    expect(container.querySelector("ul li")).toHaveTextContent("List entry");
    expect(container.querySelector("td")).toHaveTextContent("Table cell");
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(
      /^data:image\/png;base64,/u
    );
    expect(findDocumentMatches(container, "paragraph")).toHaveLength(1);
    expect(findDocumentMatches(container, "TABLE")[0]?.toString()).toBe("Table");
  });
  it("removes scripts, navigation, remote/local resources, forms, styles, and SVG", () => {
    const html = sanitizeDocumentHtml(
      '<script>alert(1)</script><a href="file:///etc/passwd">local</a><a href="https://github.com/escape">remote</a><iframe src="file:///etc/passwd"></iframe><img src="https://evil.test/track"><img src="file:///secret"><img src="data:image/svg+xml;base64,AAAA"><img src="data:image/png;base64,AAAA" onerror="alert(1)"><p id="graiderUI" style="background:url(https://evil.test)">Safe</p><svg onload="alert(1)"></svg><form action="https://evil.test"><input></form>'
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(
      container.querySelectorAll("script,a,iframe,svg,form,input,[style],[id],[onerror]")
    ).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(html).not.toMatch(/https:|file:|svg\+xml/u);
    expect(container).toHaveTextContent("Safe");
  });
  it("finds repeated matches and keeps selectable text in the DOM", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>Match match</p><p>MATCH</p>";
    expect(findDocumentMatches(root, "match").map((range) => range.toString())).toEqual([
      "Match",
      "match",
      "MATCH"
    ]);
    expect(findDocumentMatches(root, "")).toEqual([]);
  });
  it("treats regex punctuation literally and preserves Unicode range offsets", () => {
    const root = document.createElement("div");
    root.textContent = "İ before match. [literal]+ another MATCH";
    expect(findDocumentMatches(root, "[literal]+").map((range) => range.toString())).toEqual([
      "[literal]+"
    ]);
    expect(findDocumentMatches(root, "match").map((range) => range.toString())).toEqual([
      "match",
      "MATCH"
    ]);
  });
  it("rejects malformed DOCX through the actual parser", async () => {
    await expect(convertDocx(fixture("malformed.docx"))).rejects.toThrow();
  });
  it("bounds generated HTML and image resources in conversion policy", async () => {
    // Use Mammoth's browser implementation so this tests the worker's converter.
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' +
        "a".repeat(DOCUMENT_LIMITS.docxHtmlCharacters + 1) +
        "</w:t></w:r></w:p></w:body></w:document>"
    );
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    await expect(convertDocx(bytes)).rejects.toThrow(DOCUMENT_TOO_LARGE);
  });
});

describe("untrusted DOCX relationships and resource bounds", () => {
  it("does not fetch external images or preserve navigation targets from DOCX hyperlinks", async () => {
    const zip = await JSZip.loadAsync(fixture("structured.docx"));
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) throw new Error("Missing fixture document.");
    const xml = await documentFile.async("string");
    zip.file(
      "word/document.xml",
      xml.replace(
        "</w:body>",
        '<w:p><w:hyperlink r:id="rLink"><w:r><w:t>Unsafe hyperlink</w:t></w:r></w:hyperlink></w:p></w:body>'
      )
    );
    zip.file(
      "word/_rels/document.xml.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="file:///etc/passwd" TargetMode="External"/><Relationship Id="rLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>'
    );
    const fetch = vi.spyOn(globalThis, "fetch");
    const html = sanitizeDocumentHtml(
      await convertDocx(await zip.generateAsync({ type: "arraybuffer" }))
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(html).not.toMatch(/file:|javascript:|href=/u);
    expect(html).toContain("Unsafe hyperlink");
  });
  it("rejects oversized embedded-image dimensions before browser decoding", async () => {
    const zip = await JSZip.loadAsync(fixture("structured.docx"));
    const imageFile = zip.file("word/media/square.png");
    if (!imageFile) throw new Error("Missing fixture image.");
    const bytes = await imageFile.async("uint8array");
    const PNG_WIDTH_OFFSET = 16;
    const PNG_HEIGHT_OFFSET = 20;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(PNG_WIDTH_OFFSET, DOCUMENT_LIMITS.imagePixels + 1);
    view.setUint32(PNG_HEIGHT_OFFSET, 1);
    zip.file("word/media/square.png", bytes);
    await expect(convertDocx(await zip.generateAsync({ type: "arraybuffer" }))).rejects.toThrow(
      DOCUMENT_TOO_LARGE
    );
  });
});
