import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const monacoCodiconCss = readFileSync(
  resolve(
    process.cwd(),
    "node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css"
  ),
  "utf8"
);
const monacoViewer = readFileSync(
  resolve(process.cwd(), "src/grading-workspace/MonacoSourceViewer.tsx"),
  "utf8"
);
const graiderStyles = readFileSync(resolve(process.cwd(), "src/styles/globals.css"), "utf8");

describe("Monaco Codicon styling", () => {
  it("loads Monaco's Codicon font stylesheet with the source editor", () => {
    expect(monacoViewer).toContain(
      "monaco-editor/esm/vs/base/browser/ui/codicons/codiconStyles.js"
    );
    expect(monacoCodiconCss).toMatch(/font-family:\s*["']?codicon/i);
    expect(monacoCodiconCss).toMatch(/url\(\.\/codicon\.ttf\)/i);
  });

  it("does not apply a Graider font-family declaration to Codicon elements", () => {
    expect(graiderStyles).not.toMatch(/\.codicon\b[^{}]*\{[^}]*font-family\s*:/is);
  });
});
