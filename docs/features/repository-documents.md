# Repository documents (Slices 1 and 2)

The grading workspace's Source pane offers **View submission file** when the
selected repository contains PDF or DOCX files. **Required source files** returns
to the existing combined Monaco view. Monaco remains mounted during document
review, preserving its position. Rubrics, scores, and general comments remain in
the existing workspace; documents have no editing or anchored-comment controls.

## Architecture and trust boundary

`gradingStudentSourceService` retains its faculty/student authorization, recorded
repository lookup, current HEAD check, and canonical grading-context validation.
It appends repository-relative document names and a revision marker to the source
projection. Discovery walks the whole repository with streamed directory entries,
without following symlinks. It excludes `.git`, `node_modules`, and `.graider`
(case-insensitively). The special `src/test` exclusion in basename-only required
source lookup is not a repository-wide exclusion: documents there remain visible.
Documents need not appear in `required_files`.

PDF/DOCX required files are omitted from the combined text sent to Monaco.
Generated feedback reports automatically include required documents as described
below; ordinary source anchors keep their existing contracts.

`loadGradingStudentDocument` is the only new IPC operation. It accepts the existing
strict course/term/assignment/student identity plus one repository-relative PDF or
DOCX name. Main checks the registered course, reauthorizes faculty/student scope,
and resolves the student's recorded repository. It rejects absolute paths, drive
paths, backslashes, empty/dot/traversal segments, excluded directories, unsupported
extensions, and symbolic links in every path component. Realpath containment,
regular-file checks, a no-follow open, and bounded reads precede returning bytes.
The renderer receives no document filesystem path, filesystem handle, generic
file-reading capability, or `file://` document navigation.

DOCX ZIP entries are inspected and actually inflated sequentially with Yauzl;
expanded sizes and encrypted/invalid entries are checked before renderer parsing.
No entries are extracted to disk. Mammoth converts bytes in a dedicated,
terminable web worker, with external file access and embedded style maps disabled.
Embedded static PNG/JPEG images are read only from the archive, checked for byte
and aggregate pixel consumption, and emitted as inline data. DOMPurify uses a
formatting-only allowlist; a second image check permits only inline raster data.
Links, scripts, event handlers, styles, SVG, forms, frames, and arbitrary resource
URLs do not survive. Document links cannot navigate Graider or invoke Electron.

PDF.js receives bytes, not a student-selected URL. Its worker, fonts, character
maps, and WASM assets are bundled locally with Vite. XFA and the annotation layer
are disabled. The application does not instantiate PDF scripting or link handlers. Each viewer
owns an explicit local worker port, avoiding PDF.js's file-origin CDN/blob wrapper.
The owned PDF worker also surfaces PDF.js's exact oversized-image error signal,
which can otherwise be masked by an empty operator list; this is covered by the
pathological-image fixture and the Electron smoke test. A local error boundary
contains rendering failures within the document area.

## Rendering, search, and refresh

React-PDF supplies PDF.js canvas rendering and selectable text layers. Intersection
observers mount canvases and text layers within one placeholder-page height of
the viewport, then unmount them when they leave it. Page aspect ratios determine
layout; canvas width is reduced for unusual dimensions to honor the pixel budget.
A sequential, cancellable text pass prepares search without rendering all pages.
Search highlights text and navigates next/previous **matching pages**. It does not
promise individual occurrence navigation within one PDF page. Image-only PDFs
remain viewable; their find controls explicitly report that no usable text layer
is available. There is no OCR.

Mammoth preserves readable headings, paragraphs, emphasis, lists, tables, and
supported embedded images rather than Word pagination. Native DOM text supports
selection/copy. Find uses DOM ranges, including phrases crossing emphasis nodes,
with next/previous occurrence navigation and a bounded result set. The converted
DOM stays stable as find controls change so selections do not detach.

No document bytes or rendered results are persisted or cached by Graider. Closing
or switching a document terminates DOCX conversion and destroys PDF.js tasks.
Student/source refresh resets document selection. Pull latest changes already
refreshes this source state; reopening reads current local bytes. This does not
change canonical SHA tracking, Updated Since Grading, source anchors, or grading
state. Requests finishing after navigation are ignored.

## Central safety policy

All limits are named in `ui/electron/repositoryDocumentPolicy.ts`:

| Resource              | Initial limit                            | Rationale                                                              |
| --------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| File bytes            | 64 MiB                                   | Accommodates image-rich submissions while bounding IPC copies          |
| DOCX expanded archive | 128 MiB                                  | Bounds ZIP inflation; allows compression typical of Office files       |
| DOCX archive entries  | 10,000                                   | Bounds ZIP metadata and relationship processing                        |
| DOCX generated HTML   | 8 Mi characters                          | Bounds sanitization and DOM construction on the UI thread              |
| DOCX embedded images  | 24 MiB total, 16 Mi pixels total         | Bounds inline data and decoded image memory                            |
| PDF pages             | 5,000                                    | Bounds page placeholders/metadata without limiting normal long reports |
| PDF canvas            | 4 Mi pixels, 16,384 pixels per dimension | Bounds each mounted canvas independent of display DPI                  |
| PDF searchable text   | 16 Mi characters                         | Bounds the renderer's search index                                     |
| Document processing   | 30 seconds                               | Terminates pathological DOCX conversion/PDF loading and text indexing  |
| Repository walk       | 100,000 entries, depth 64                | Bounds pathological discovery without following links                  |
| DOCX find results     | 1,000                                    | Bounds live DOM ranges for very frequent matches                       |

Limit failures explain that the document is too large to display safely. Corrupt,
truncated, encrypted, unsupported, and unavailable documents show a contained
error; selecting another file/student leaves grading operational. Unsupported
embedded image formats (including animated images) may be omitted. PDF text extraction failures disable find
without treating a visually readable scan as an error.

## Dependencies and validation

Existing dependencies contained no PDF/DOCX viewer. The UI adds React-PDF (MIT),
which brings PDF.js (Apache-2.0); Mammoth (BSD-2-Clause); DOMPurify
(Apache-2.0 OR MPL-2.0); and image-size (MIT) for dimensions before image decoding.
Yauzl (MIT) and its development types are added to the UI package, reusing the
backend's existing ZIP approach rather than introducing another ZIP validator.
All rendering/conversion is local. Viewer chunks and workers load on demand.

Small purpose-built fixtures are in `ui/test-fixtures/repository-documents`.
Focused tests cover the trusted reader, authorization, traversal, symlinks,
discovery, refresh, real PDF/DOCX parsing, sanitization, resources, lazy rendering,
find/copy selection, viewer failures, switching, and keyboard behavior. Existing
workspace publication/update tests cover preserved deductions and source anchors.

## Required-document feedback reports (Slice 2)

Only PDF/DOCX entries resolved by the existing `required_files` resolver become
report content. Explicit paths resolve from the repository root; a bare filename
matches exactly under `src`, excluding `src/test`. Matching is case-sensitive at
the filename lookup boundary, with existing host-filesystem behavior for explicit
paths. Extension classification is case-insensitive. Missing/ambiguous entries
retain the existing single required-file unavailable section. Non-required
repository documents remain viewable and do not enter the report.

Report preparation asks `buildSubmissionSourceModel` to defer binary document
reading, preserving resolved repository-relative names and required-file order.
`gradingStudentReportPublicationService` sends only those names and its authorized
repository root to `documentReportService`. Each sequential, terminable Node
worker uses **the same** `readRepositoryDocument` path validation, bounded reads,
and DOCX archive validation as the viewer. The worker uses the central 30-second
timeout and existing byte/page/text/archive limits. A 256 MiB worker heap ceiling
bounds parser object allocations; normalized structures have a depth limit of 64.
Worker launch, timeout, crash, and parser failures become contained document
notices and do not discard other report sections.

PDF.js extracts each page's text layer in content-stream reading order, retaining
meaningful line endings and normalizing whitespace. The viewer and report share
PDF text-item interpretation; viewer search keeps its existing space-joining
behavior. Reports render escaped text, never canvases, screenshots, PDF binaries,
or OCR. Image-only PDFs show `No extractable text available for this PDF.` and
remain viewable. Corrupt, encrypted, unsupported, and over-limit documents show a
concise unavailable/limit notice.

Mammoth converts DOCX with the same external-access/style-map restrictions as the
viewer. Its report image callback never reads or decodes images. Bounded Mammoth
HTML is transformed into `src/shared/document-content.d.ts`'s inert tree of text
and allowlisted formatting elements. Attributes are discarded, active subtrees
and images are dropped, and hyperlinks become their text. This preserves
headings, paragraphs, emphasis, lists, tables, and meaningful line breaks. A
second allowlist at the existing report renderer emits only fixed element names
and HTML-escapes every text node. No raw converter HTML reaches the report.
Student content cannot supply IDs, resource URLs, navigation, styles, or events;
the report's restrictive CSP remains in place.

Documents appear in required-file order beside source sections, labeled
`Document: repository/relative/name.docx`, using the same numbered
`source-file-N` section anchors. Documents have no synthetic source-line links;
existing source-feedback navigation and scoring remain unchanged.

No extraction cache exists: preview and publication read current local bytes on
every generation. The publication service rechecks HEAD after asynchronous
extraction and retains the existing prepublication and postpublication revision
and grading-state checks. Pull latest changes therefore uses the current recorded
revision, while comments, scores, and repeated publication keep their existing
semantics.

No new parser library was added. PDF.js (already present through React-PDF,
Apache-2.0) is now explicitly declared as a UI dependency for the Node worker;
Mammoth, Yauzl, and the existing fast-xml-parser are reused. Worker output is built
as ESM so PDF.js and its local worker module load in Electron without a cloud
service. Existing viewer conversion, images, lazy rendering, search, and selection
continue through their existing paths.

Regression coverage includes real document fixtures, required-file matching,
structure/image exclusion, hostile HTML/text, malformed/encrypted/oversized
content, page limits, worker timeouts/errors, revision races, preview, and
republication. The local smoke test uses a real Git origin/clone and the Pull
latest changes backend, then regenerates reports from changed PDF bytes.
Electron inspection verifies readable document sections, image omission, no
remote requests, and unique/unbroken anchors.

OCR, annotations, document comments/editing, cloud conversion, and manual
include/exclude controls remain deferred.
