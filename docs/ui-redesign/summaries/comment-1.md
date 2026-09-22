# COMMENT-1: Comment formatting foundation

## Summary

Added one shared, display-time interpretation of canonical grading-comment
strings. Comments now support paired inline backticks and valid line-oriented
triple-backtick blocks in existing applied-comment bodies, reusable-comment
browser entries, the grading editor preview, and generated student reports.
Persistent comment-library and grading-state schemas remain unchanged.

## Architecture

`src/shared/comment-content.ts` is a dependency-free parser and readonly node
model shared by the backend report renderer and Vite/React. It produces
paragraph blocks with text/inline-code children and code blocks with optional
language metadata. React and report HTML have separate renderers that consume
the same nodes; rendered HTML is not shared.

The optional fence language is retained in the model but is intentionally not
displayed or used for syntax highlighting in this slice. It never becomes a
CSS class or HTML attribute.

## Grammar and fail-closed behavior

- Paired single backticks render inline code.
- A standalone triple-backtick opening/closing line creates a code block; a
  contiguous non-whitespace language identifier is optional after the opening
  fence.
- CRLF and CR are normalized for parsing. Code indentation, blank lines, and
  long lines are preserved.
- Unmatched inline backticks stay literal text.
- Unclosed or invalid fence-like lines and their remaining text stay literal
  prose rather than becoming code or partially parsed inline markup.
- Backticks inside a valid code block are literal code content.
- General Markdown, raw HTML, links, images, tables, heading syntax, and
  embedded content remain unsupported.

## React rendering

`FormattedGradingComment` renders normal prose as paragraphs, inline code as
`<code>`, and fenced blocks as `<pre><code>`. It is used by
`GradingAppliedCommentsPanel`, `GradingCommentLibraryBrowser`, and the editor
preview. Delete-confirmation snippets remain intentionally plain text.

Scoped `.formatted-grading-comment*` styles use existing Graider font, surface,
border, radius, and spacing tokens. Inline code is subtly inset; blocks use a
monospace inset surface with preserved whitespace and horizontal scrolling.

## Report rendering

`grading-report-html.ts` parses comment text at report-render time, preserving
the original report model string. General, inline source, and unmapped source
feedback all share its updated body renderer. Standalone scoped report CSS adds
matching inline/block treatment plus print-safe block behavior.

## Editor helpers / preview

The existing textarea remains the editor. **Inline code** wraps a selection or
inserts an empty backtick pair with the caret inside. **Code block** wraps a
selection without silently adding a language. If the selection contains a
closing triple-backtick line, it stays unchanged and the editor explains why.
Successful helpers restore textarea focus/selection. A compact live preview
uses the same React renderer. Formatting-control keyboard targets suppress
global grading shortcuts.

## Security

React renders parsed values only as text children; no comment body uses
`dangerouslySetInnerHTML`. Report prose, inline-code values, and code-block
bodies pass through the existing explicit HTML escape function. Language
metadata is not emitted. The existing restrictive report CSP remains present.
HTML-looking prose and code therefore render visibly but inertly.

## Files Changed

- `src/shared/comment-content.ts` — neutral parser/model.
- `src/grading/grading-report-html.ts` — safe parsed report rendering and CSS.
- `ui/src/grading-workspace/FormattedGradingComment.tsx` — shared React
  renderer.
- Existing applied-comment, reusable-browser, editor, shortcut, and scoped CSS
  files — integration, preview, helpers, and styling.
- Focused parser, report, React renderer, panel/browser, editor, and keyboard
  tests.

## Tests Added or Updated

- Parser coverage for prose, inline spans, fenced blocks, language metadata,
  multiple/adjacent blocks, empty blocks, line endings, indentation, blank
  lines, long lines, malformed markup, and HTML-looking text.
- React coverage for semantic inline/block elements, ordering, styling hooks,
  and inert HTML-looking input.
- Existing applied and reusable browser tests now prove formatted bodies;
  delete snippets remain plain.
- Editor tests cover selection wrapping, empty inline insertion, language-free
  blocks, ambiguous-fence warning, preview, and focus restoration.
- Report tests cover general and source feedback, escaping, CSP, styles, and
  hostile language metadata.
- Existing keyboard-shortcut coverage now includes the formatting control.

## Documentation

- `comment-library-feasibility.md` records COMMENT-1 as complete and keeps its
  original planning analysis.
- Backlog item 41 is resolved with the shipped parser, renderer, security, and
  test details.
- The roadmap shows COMMENT-1 complete before COMMENT-2 through COMMENT-5.

## Validation Commands Run

| Command                                  | Result                                  |
| ---------------------------------------- | --------------------------------------- |
| `npm run typecheck`                      | Passed                                  |
| `npm run lint`                           | Passed                                  |
| `npm run format:check`                   | Passed                                  |
| `npm test`                               | Passed — 1076 passed, 1 skipped         |
| `npm run build`                          | Passed                                  |
| `npm --prefix ui run typecheck`          | Passed                                  |
| `npm --prefix ui run format:check`       | Passed                                  |
| `npm --prefix ui test`                   | Passed — 1028 passed                    |
| `npm --prefix ui run build`              | Passed                                  |
| Focused parser/report/UI component tests | Passed before the complete test suites. |

There is no separate UI lint script; root `npm run lint` covers the repository,
including `ui/`.

## Assumptions Made

(empty)

## Result

Existing plain-text comments remain valid and readable. Supported markup stays
in the original string when reusable comments are applied into grading state,
so snapshot and search semantics are unchanged.

## Deferred

- COMMENT-2: exact-path comment-library publication, mutation publication
  envelopes, and divergence-safe recovery.
- COMMENT-3: reusable-comment editor, tag authoring/autocomplete,
  case-insensitive tag normalization, and workspace library CRUD.
- COMMENT-4: one-shot **Save to course library**.
- COMMENT-5: dedicated course-level Comment Library screen.
- PR12-4 roster source/provenance and PR12-5 roster-manager rebuild.
- Syntax highlighting and visible language labels remain intentionally out of
  scope.

## Next Step

COMMENT-2 — exact-path library publication and partial-success contract. Add
only `.graider/grading/comments.json` to managed course publication, reuse the
existing local-mutation-then-publication service, and return explicit local
success versus publication-success/failure outcomes without overwriting remote
divergence.
