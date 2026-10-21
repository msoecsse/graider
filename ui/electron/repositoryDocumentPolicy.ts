// Shared policy: large enough for ordinary submissions, bounded for untrusted input.
export const DOCUMENT_LIMITS = {
  fileBytes: 64 * 1024 * 1024,
  docxExpandedBytes: 128 * 1024 * 1024,
  docxHtmlCharacters: 8 * 1024 * 1024,
  docxEntries: 10000,
  imageBytes: 24 * 1024 * 1024,
  imagePixels: 16 * 1024 * 1024,
  pdfPages: 5000,
  findMatches: 1000,
  pdfCanvasDimension: 16384,
  pdfCanvasPixels: 4 * 1024 * 1024,
  pdfPageWidth: 850,
  pdfTextCharacters: 16 * 1024 * 1024,
  processingMilliseconds: 30000,
  repositoryEntries: 100000,
  repositoryDepth: 64
} as const;
export const DOCUMENT_EXTENSIONS = ["pdf", "docx"] as const;
export type RepositoryDocumentKind = (typeof DOCUMENT_EXTENSIONS)[number];
export const repositoryDocumentKind = (file: string): RepositoryDocumentKind | undefined => {
  const extension = file.split(".").pop()?.toLowerCase();
  return DOCUMENT_EXTENSIONS.find((kind) => kind === extension);
};
export const DOCUMENT_EXCLUDED_DIRECTORIES = new Set([".git", "node_modules", ".graider"]);
export const isRepositoryDocumentPath = (file: unknown): file is string =>
  typeof file === "string" &&
  file.length > 0 &&
  !file.includes("\\") &&
  !file.includes(":") &&
  !file.includes("\0") &&
  file
    .split("/")
    .every(
      (part) =>
        part !== "" &&
        part !== "." &&
        part !== ".." &&
        !DOCUMENT_EXCLUDED_DIRECTORIES.has(part.toLowerCase())
    ) &&
  repositoryDocumentKind(file) !== undefined;
export const DOCUMENT_TOO_LARGE = "This document is too large to display safely in Graider.";
