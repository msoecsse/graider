# Comment library and formatted feedback feasibility

Investigation and implementation planning only. No production behavior was
changed by this pass. The findings below describe the current `ui-redesign`
branch after PR12-3.

## 1. Executive summary

Graider does not need a new comment database. It already has a versioned,
course-level JSON library at `.graider/grading/comments.json`, backend CRUD,
strict validation, stable IDs, Electron services and IPC, case-insensitive
search, AND tag filtering, a grading-workspace browser, and applied-comment
snapshot semantics. JSON remains the right storage format.

The important remaining gaps are at the user boundary:

- the existing create/edit/delete APIs are not wired to faculty UI;
- there is no course-level Comment Library screen;
- free-form tags have no authoring control or autocomplete, and persisted tags
  are not deduplicated case-insensitively;
- a one-shot grading comment cannot be promoted into the library;

COMMENT-1 resolved the formatting gap with a shared parser/model, React
renderer, report renderer, scoped styling, editor helpers, and parity-focused
tests. COMMENT-2 resolved the publication boundary. The remaining work is at
the faculty-facing authoring and management boundaries.

The remaining recommended sequence is COMMENT-3 through COMMENT-5 in §12.
COMMENT-2 deliberately moved the publication contract ahead of faculty-facing
mutation UI so Graider will not ship a create/edit/delete workflow that appears
shared but only writes one faculty member's checkout. PR12-4 and PR12-5 remain
planned, but are explicitly deferred until the comment track is complete.

## 2. Product decisions now locked

- One reusable comment library exists per course. It lives in the main course
  repository and is shared by all faculty using that course.
- The canonical library is not physically split by assignment or faculty.
- Faculty can create, edit, delete, search, and tag/filter reusable comments.
- Search matches title, comment text, or tags, case-insensitively. Multiple
  selected tags use AND semantics and combine with the search query.
- Tags are free-form. Authoring offers suggestions from tags already in the
  course library without preventing a new tag.
- A reusable comment may contain a title, text, default deduction, optional
  default rubric-category ID, and tags.
- The category ID is only a default. It is preselected if the current
  assignment contains it; otherwise application starts with no category.
- Applying a reusable comment copies a snapshot into grading state. Later
  reusable edits or deletion never mutate an applied comment.
- One-shot comments remain supported. After a one-shot comment is applied to a
  student, faculty may separately save a prefilled reusable entry to the course
  library. This is opt-in and does not retroactively couple the applied comment
  to the new reusable entry.
- A dedicated course-level management screen supplements the in-workspace
  browser and authoring flow.
- Successful local library mutations automatically use the existing safe
  course-publication mechanism. Only `.graider/grading/comments.json` is added
  to its managed allowlist.
- A local mutation remains successful and durable if publication fails. The UI
  distinguishes local failure, full success, and the partial-success case in
  which the entry was saved locally but publication failed. Manual **Publish
  Course Changes** remains the retry path.
- The initial multi-faculty behavior is safe failure on Git divergence, not
  silent overwrite or an automatic semantic merge.
- Comment text remains a canonical string and supports only inline backticks
  and fenced code blocks with an optional language identifier. It does not
  enable general Markdown or raw HTML.

## 3. What already exists

### 3.1 Fully implemented backend and Electron foundations

`src/grading/comment-library.ts` already provides:

- canonical `.graider/grading/comments.json` storage;
- schema version 1 with strict validation;
- `id`, `title`, `text`, `defaultDeduction`, optional
  `defaultRubricCategoryId`, and `tags` fields;
- stable generated UUID IDs;
- list/load, create, edit, delete, get, and search operations;
- missing-file-as-empty behavior;
- malformed JSON, unsupported-version, duplicate-ID, and invalid-entry
  protection; and
- a temporary-file write followed by rename.

`src/grading/grading-comment-library-context.ts` exposes narrow context
operations. `ui/electron/gradingCommentLibraryService.ts` bridges them through
the established generated-CJS boundary. Typed channels, strict runtime request
validation, registered-course path resolution, main-process handlers, preload
APIs, and `window.graiderUI` types already exist for load/create/edit/delete.
Faculty scope is reauthorized for the requested term before access.

These pieces are **already implemented**, not prospective architecture.

### 3.2 Implemented search and application behavior

The backend and `ui/src/grading-workspace/commentLibrarySearch.ts` both match a
query against title OR text OR tag text, case-insensitively. Selected tag
filters use case-insensitive AND semantics and combine with the query.
`GradingWorkspacePage` applies the 1-9 shortcuts to the first nine currently
filtered results.

The grading workspace loads the course library, displays a searchable/filterable
browser, and applies a reusable comment by copying its values into a new
grading-state comment. A valid default rubric category is preselected; a
missing category becomes None, and faculty can override the selection.

Applied comments store `sourceCommentId` when they originated in the library,
but their title, text, deduction, and category are snapshots. Backend tests
verify that editing or deleting the reusable source leaves the applied comment
unchanged. Editing an applied comment preserves its source identifier. This is
the required snapshot model.

### 3.3 Partially implemented or not wired

- **Implemented but not wired to faculty UI:** library create, edit, and delete
  APIs. Renderer code currently calls only load.
- **Partially implemented:** tags are accepted as free-form strings and tag
  filtering exists, but there is no tag authoring/autocomplete control.
- **Partially implemented:** tag cleanup trims values, removes blanks, and
  deduplicates exact strings, but allows case-only duplicates such as `Java`
  and `java` in one stored entry.
- **Not implemented:** a dedicated course-level management route and navigation
  entry.
- **Not implemented:** one-shot comment promotion to the library.
- **Resolved in COMMENT-2:** successful create, edit, and delete operations use
  the safe course publisher; the exact canonical file is managed; and typed
  results distinguish full success from a durable local save whose publication
  failed. Read-only loading remains publication-free.
- **Resolved in COMMENT-1:** structured code formatting, rendered previews,
  and lightweight textarea formatting helpers. The parser retains optional
  fence-language metadata but COMMENT-1 does not display or highlight it.

## 4. What is missing

The remaining product work is narrower than “build a comment library”:

1. expose the existing mutation APIs through a shared reusable-comment editor,
   including normalized free-form tags and autocomplete;
2. offer post-application one-shot promotion; and
3. add a course-level management route that reuses the same components and
   services.

No database, generic filesystem API, new comment schema, or rich-text editor is
required.

## 5. Canonical storage and data model

The JSON-backed design should remain.

- The library is course configuration and belongs naturally in the course
  repository.
- Git already supplies distribution, history, backup, and review.
- The expected collection is small enough for in-memory validation and
  filtering.
- A strict, versioned model and safe local write path already exist.
- SQLite would make repository sharing and human recovery harder without
  solving a demonstrated requirement.

The persistent `text` field should remain a string. Code formatting is an
interpretation layer, not a storage migration. `sourceCommentId` remains useful
provenance for an applied snapshot, not a live foreign key.

Tag normalization should be tightened at the canonical backend boundary:

1. trim surrounding whitespace;
2. remove blank tags;
3. deduplicate case-insensitively;
4. preserve the first accepted display casing; and
5. use the established library spelling when an autocomplete suggestion is
   selected.

Lowercasing every stored tag is unnecessary. Existing display casing can
remain stable while comparisons use a normalized key.

## 6. Search and tags

The desired search semantics are already present in both current
implementations:

- title OR text OR tag query matching;
- case-insensitive comparisons;
- AND semantics across selected tags;
- search and tags applied together; and
- 1-9 shortcuts over the resulting filtered list.

The implementation track should preserve those behaviors rather than replace
them. The duplicated backend and renderer filtering logic is small, but a
shared component/helper should own the renderer behavior used by the grading
workspace and management screen.

No reusable combobox, token input, or tag-entry component was found. The
current `StatusChip` is not an authoring control. COMMENT-3 should introduce a
small accessible free-form token/tag field that:

- lists distinct existing course tags;
- accepts keyboard and pointer selection;
- permits an arbitrary new trimmed tag;
- rejects blank and case-insensitive duplicate entries; and
- preserves the library's existing display casing for suggestions.

The existing first-seen tag ordering and first-seen display casing are
adequate initial behavior; a new sorting policy is not required for this
feature.

## 7. Grading-workspace workflow

The current reusable browser and apply path should be retained. The clean
extension is a shared library editor/modal used by both the workspace and the
future management screen.

Workspace behavior should be:

1. apply reusable entries exactly as today, producing independent snapshots;
2. allow create/edit/delete through the existing narrow APIs once publication
   semantics are in place;
3. refresh the local browser after a successful local mutation even if publish
   fails, while showing the publication warning; and
4. keep deletion confirmation explicit that it deletes only the reusable entry
   and does not affect comments already applied to students.

The one-shot flow should remain separate:

1. faculty writes and applies the grading comment to the student;
2. the student mutation succeeds first;
3. Graider offers **Save to course library** for that applied one-shot;
4. a prefilled reusable-comment editor opens;
5. faculty may change title, text, default deduction, category, and tags; and
6. saving creates and publishes a new library entry.

Canceling or failing library creation leaves the already-saved student comment
unchanged. The newly created reusable entry should not be written back as the
applied comment's `sourceCommentId`; it did not source that snapshot.

## 8. Dedicated course-level management screen

Current routes use course and term slugs even when a screen operates on
course-owned data, and current authorization uses `termCode` to prove faculty
scope. The least disruptive route is therefore conceptually:

`/course/:courseSlug/:termSlug/comment-library`

Different term-context routes still edit the same course-level JSON file. A
future course-only authorization model could simplify the URL, but is not
needed for this feature.

The screen should be reachable outside the grading workspace from course-level
navigation. The redesign already names “Edit comment library” as an assignment
grading-setup action, but that action is not currently present in
`AssignmentDetailPage`. A course-card secondary/overflow action is also
appropriate so management does not require opening an assignment.

The screen should provide:

- PageHeader and course/term breadcrumbs consistent with sibling routes;
- search and AND tag filters;
- new, edit, and delete actions;
- rendered preview;
- deduction and optional default category fields;
- free-form tag entry with suggestions; and
- full-success versus saved-locally/publication-failed feedback.

It should reuse the same library editor, tag field, search helper, formatted
content renderer, and Electron APIs as the grading workspace. A parallel
management model would recreate the drift this feasibility pass is intended to
avoid.

## 9. Comment code formatting — completed in COMMENT-1

### 9.1 Recommended representation

COMMENT-1 uses one dependency-free parser over the canonical string and a small typed
model, conceptually:

```text
Comment block = Paragraph(inline children) | CodeBlock(language?, text)
Inline child  = Text(text) | InlineCode(text)
```

One parser feeds two renderers:

- a React renderer using text children, `<code>`, and `<pre><code>`; and
- the published-report renderer using the same nodes and explicit HTML escaping
  for every emitted text, code, and metadata value.

This is cleaner than sharing rendered HTML: React keeps its normal escaping,
the report keeps its existing `escapeHtml` guarantee, and neither renderer can
accidentally enable raw HTML. Because the browser needs to parse unsaved
textarea content synchronously, this should be a neutral shared source module,
not an Electron CJS service. The neutral module is `src/shared/comment-content.ts`;
the UI imports only that dependency-free source, not repository backend services.

### 9.2 Grammar and edge behavior

Only recognize:

- paired single backticks for inline code; and
- line-oriented triple-backtick fences, with an optional language identifier
  after the opening fence.

Everything else is prose. In particular, headings, emphasis, links, images,
tables, embedded content, and raw HTML are not syntax.

Implemented fail-closed behavior:

- unmatched single backticks remain literal text;
- an unclosed fence remains literal text rather than consuming the rest of the
  comment as code;
- backticks inside a closed fenced block are literal code content;
- empty fenced blocks are valid;
- CRLF is normalized for parsing while code indentation and line breaks are
  preserved;
- multiple blocks and adjacent prose/code paragraphs are supported;
- the optional language identifier is metadata only and does not trigger
  highlighting; and
- HTML-looking content in prose or code is always escaped text.

The textarea remains the editor. COMMENT-1 adds **Inline code** and **Code
block** helpers. Inline code wraps the selection or inserts an empty pair with
the caret inside. Code block wraps the selection without adding a language; it
declines with a warning when the selection contains a closing triple-backtick
fence. The existing grading-comment editor now has a compact shared-renderer
preview. No WYSIWYG editor was added.

### 9.3 Surfaces to update

- reusable-comment browser/list previews;
- applied comments in the grading workspace;
- reusable create/edit preview;
- grading comment preview;
- published student report HTML.

Monaco currently carries comment text as annotation data rather than rendering
the rich comment body, so it needs no separate parser. Confirmation snippets
should remain short plain-text summaries. Long block lines need horizontal
scrolling; blocks need monospace type, a distinct background and inset, and
print-friendly report styling.

`<script>alert(1)</script>` renders literally on every surface. The report
continues to escape comment text and retains its restrictive CSP.

## 10. Course publication and multi-faculty safety

### 10.1 Implemented publication behavior

COMMENT-2 added exactly `.graider/grading/comments.json` to
`coursePublishService.ts`'s managed path allowlist. Nearby `.graider` paths
remain unrelated. Successful create, edit, and delete operations now publish
through the shared course-mutation wrapper; loading remains read-only.

The publisher retains its safety properties:

- it stages explicit allowed paths, never `git add .`;
- unrelated unstaged and untracked files remain untouched;
- an unrelated already-staged path blocks publication;
- an allowed deletion can be staged;
- commit and push failures are reported; and
- the mutation/publication wrapper preserves successful local changes when
  publication fails; and
- no `.graider/**` wildcard or generic staging was introduced.

### 10.2 Required mutation result contract

The Electron library service now separates read-only load results from mutation
results and applies the same publication envelope used by assignment and roster
mutations:

1. **Local mutation failed:** return failure/not-found, no publication result,
   and do not invoke publication.
2. **Local mutation succeeded and publish succeeded:** return local success,
   the created/updated value where applicable, and publication success.
3. **Local mutation succeeded and publish failed:** still return local success,
   the locally durable value, publication failure, and a faculty-safe warning
   that **Publish Course Changes** is the retry path.

Renderer state should update after cases 2 and 3. It must not tell faculty the
entry was lost merely because Git failed.

### 10.3 Divergence example

If faculty A and B start from the same revision, A pushes comment X, and B then
creates comment Y without first integrating A's commit, publication will:

1. save B's `comments.json` locally;
2. stage and commit that allowed file; and
3. fail the push as non-fast-forward.

B's mutation survives in the local commit and no newer remote state is
overwritten. Integration coverage now proves this two-clone non-fast-forward
case. Faculty should see “saved locally, publication failed,” then
synchronize/reconcile the course repository and use manual **Publish Course
Changes** as the retry path. A blind retry cannot resolve divergence by itself;
UI copy should not imply otherwise.

The initial feature may stop safely here. A future semantic three-way merge can
use stable comment IDs:

- different IDs changed independently can usually merge;
- one-sided changes to the same ID can usually merge;
- different changes to the same ID require resolution; and
- edit/delete combinations require an explicit conflict policy.

That merge engine is deferred and is not a prerequisite for safe first
delivery.

## 11. Testing strategy

### Comment parser and renderers

- prose only, inline code, fenced code, optional language, multiple blocks;
- malformed/unclosed markup and empty blocks;
- CRLF normalization and code whitespace preservation;
- HTML/script-looking prose and code remain escaped;
- very long lines and multiple/adjacent paragraphs;
- React uses semantic `<code>` and `<pre><code>` with the intended classes;
- reusable preview and applied-comment display use the same renderer; and
- report output matches React semantics, remains escaped, and includes
  monospace, inset, scrolling/print-friendly block styles.

Shared fixture cases should exercise both renderers so their interpretation
cannot drift.

### Library, snapshots, and tags

- create, edit, delete, malformed-file protection, and temporary-write behavior;
- trim/blank removal and case-insensitive tag deduplication with stable display
  casing;
- editing/deleting a reusable entry does not alter applied snapshots;
- query matching by title, content, and tags, case-insensitively;
- AND tag filtering and combined query/tag filtering;
- existing tag suggestions, arbitrary new tags, keyboard interaction, and
  duplicate prevention.

### One-shot promotion

- student comment is saved before the library offer appears;
- prefilled fields are correct and remain editable;
- cancel and library failure leave the student comment unchanged;
- success creates a separate reusable entry; and
- the already-applied comment does not acquire retroactive library coupling.

### Publication

- only `.graider/grading/comments.json` is newly allowed;
- create, modify, and delete mutations publish;
- unrelated files remain unstaged and untouched;
- unrelated staged work still blocks unsafe publication;
- commit/push failure preserves the local mutation and returns partial success;
- non-fast-forward divergence preserves the local mutation and reports a
  publication failure; and
- manual publish recognizes the allowed pending change/local commit as the
  recovery path once divergence is reconciled.

### Management screen

- route resolution and faculty authorization;
- empty, loading, error, and populated states;
- create/edit/delete and cancellation;
- search, AND tag filters, and autocomplete;
- formatted preview; and
- full-success and publication-warning feedback.

## 12. Recommended implementation sequence

### COMMENT-1 — Comment formatting foundation — complete

Shipped the shared parser/model, React and report renderers, semantic styling,
existing-surface integration, lightweight textarea wrap helpers/preview, and
safety/parity-focused tests. It is independent of publication and gives every
later library editor one preview implementation.

### COMMENT-2 — Library mutation publication contract — complete

Shipped the exact `.graider/grading/comments.json` managed path, distinct load
and mutation results, and centralized create/edit/delete publication in the
Electron library service. Tests cover exact-path rejection, create/edit/delete,
unrelated work, staged-work, no upstream, local durability, push failure, and
two-clone divergence.

This intentionally moves the originally envisioned publication slice before
faculty mutation UI. Backend work can land safely without exposing an
intermediate UI that implies sharing while saving locally only.

### COMMENT-3 — Shared library editor and grading-workspace CRUD

Build the reusable create/edit form, delete confirmation, free-form tag entry,
autocomplete, backend tag normalization, and rendered preview. Wire the
existing workspace browser to create/edit/delete and display partial-publication
warnings. Preserve the existing apply/search/filter/snapshot behavior.

### COMMENT-4 — One-shot “Save to course library”

After a one-shot student comment is successfully applied, offer the separate
prefilled library flow. Reuse COMMENT-3's editor and COMMENT-2's publication
contract. Keep the applied snapshot independent.

### COMMENT-5 — Course-level Comment Library screen

Add the course/term-context route and navigation, then compose the shared
browser, editor, tag control, formatted preview, and publication feedback into
the dedicated management surface.

COMMENT-1 and COMMENT-2 are complete. COMMENT-3 supplies the reusable editor
for COMMENT-4 and COMMENT-5. COMMENT-4 and COMMENT-5 could be developed in
either order after COMMENT-3, but the grading-loop promotion workflow is
recommended first because it serves the more frequent workflow.

After COMMENT-5, resume PR12-4 (roster source/provenance) and PR12-5 (the roster
manager visual rebuild that consumes PR12-3 counts and PR12-4 provenance).

## 13. Backlog and documentation corrections

Backlog items 39, 42, and 43 remain open for unwired mutation UI/management,
tag authoring/normalization, and one-shot promotion. Item 40 is resolved by
COMMENT-2, and item 41 is resolved by COMMENT-1. They are problem statements,
not a duplicate PR checklist.

The grading specification now records the locked behavior. The UI-redesign
roadmap preserves the Step 12 history while explicitly placing COMMENT-1
through COMMENT-5 between completed PR12-3 and deferred PR12-4/PR12-5.

## 14. Risks and deferred ideas

- Git divergence needs clear recovery copy. Automatic semantic merging is
  useful future work but is intentionally deferred.
- The library's load-modify-write operation is not a database transaction.
  Separate faculty clones are mediated by Git; simultaneous processes editing
  one checkout would still need coordination if that becomes a real use case.
- General Markdown, raw HTML, syntax highlighting, WYSIWYG editing, arbitrary
  embeds, and rich-text persistence are out of scope.
- Bold/italic can be considered later only if a real need emerges.
- The fixed triple-fence editor helper needs a safe response when selected code
  itself contains a fence line; it should not silently produce ambiguous text.
- A course-only route/authorization identity may be desirable someday, but the
  existing course+term identity is safer and smaller for this implementation.

## 15. Recommendation

Proceed with COMMENT-3: build the shared reusable-comment editor, normalized
free-form tag authoring/autocomplete, grading-workspace create/edit/delete, and
publication feedback on top of COMMENT-2's contract. Follow with one-shot
promotion and the dedicated management screen. Resume PR12-4 and PR12-5 only
after this priority track is complete.
