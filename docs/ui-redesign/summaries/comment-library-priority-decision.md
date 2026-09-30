# Comment library priority decision

## Summary

After PR12-3, the course comment-library and comment-formatting track is now the
immediate priority. PR12-4 and PR12-5 remain planned but pause until that track
is complete. This was a feasibility and implementation-planning pass only; it
changed no production code.

## What the Investigation Found

Graider already has a versioned course JSON library at
`.graider/grading/comments.json`, validated backend CRUD, stable IDs, Electron
service/IPC/preload wiring, title/text/tag search, AND tag filters, a grading-
workspace browser, default-category handling, and independent applied-comment
snapshots with `sourceCommentId` provenance.

The missing work is faculty-facing mutation/management UI, tag authoring and
autocomplete, one-shot promotion, safe automatic course publication, and a
small shared code-formatting parser/renderer for React and student report HTML.
JSON remains the recommended storage format.

## Decision

Implement the feature in these slices:

1. COMMENT-1 — safe comment-formatting parser/model and React/report renderers.
2. COMMENT-2 — exact-path course publication and partial-success mutation
   contract.
3. COMMENT-3 — shared editor, tag UX, and grading-workspace CRUD.
4. COMMENT-4 — post-application one-shot **Save to course library**.
5. COMMENT-5 — dedicated course-level Comment Library route and screen.

Publication precedes faculty-facing mutation UI so the first shipped authoring
workflow has honest course-sharing behavior. Existing CRUD, search, Electron,
and snapshot infrastructure will be reused rather than rebuilt.

## Documentation

- `comment-library-feasibility.md` contains the evidence, architecture,
  concurrency analysis, tests, and PR boundaries.
- The grading specification records the locked product decisions.
- The UI-redesign README records the priority insertion without erasing the
  original Step 12 sequence.
- Backlog items 39-43 record the independently useful gaps.

## Validation Commands Run

| Command                | Result |
| ---------------------- | ------ |
| `npm run format:check` | Passed |
| `npm run lint`         | Passed |

## Assumptions Made

(empty)

## Result

The next implementation PR is COMMENT-1. After COMMENT-5, work returns to
PR12-4 roster source/provenance and then PR12-5's roster-manager visual rebuild.

## Deferred

- PR12-4 and PR12-5, by priority rather than blockage.
- automatic semantic/three-way merging of divergent libraries;
- general Markdown, raw HTML, WYSIWYG editing, syntax highlighting, and
  rich-text persistence; and
- any course-only routing/authorization redesign beyond the existing
  course+term identity.
