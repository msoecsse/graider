# Document viewer fixtures

These small synthetic files contain no student data or third-party content:

- `normal.pdf`: one page with Helvetica text.
- `multipage.pdf`: twelve text pages for scrolling and lazy rendering.
- `image-only.pdf`: a single embedded raster square with no extractable text.
- `structured.docx`: heading, paragraph, bold/italic text, bullet list, table, and
  embedded 24 × 24 PNG square. Minimal OOXML packaged in a ZIP archive.
- `oversized-image.pdf`: a small PDF declaring pathological image dimensions.
- `malformed.pdf` and `malformed.docx`: deliberately truncated signatures.

Tests construct oversized archive headers and image dimensions in memory rather
than committing large fixtures. See [document-viewer design](../../../docs/features/repository-documents.md).

Local Git attributes keep document fixtures binary, preserving PDF cross-reference
record whitespace and avoiding line-ending conversion on Windows.
