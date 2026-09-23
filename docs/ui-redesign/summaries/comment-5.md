# COMMENT-5: Dedicated course-level Comment Library screen

## Summary

Completed the final comment-library slice with a course-level management screen outside grading.

## Route and Trust Boundary

Added `/course/:courseSlug/:termSlug/comment-library`. The route resolves the registered folder and matching dashboard card, then sends only `courseFolderId` and the card's canonical `termSlug` to existing comment-library IPC APIs.

## Navigation

Each dashboard course-term card now has a Comment Library action, preserving the term clicked in multi-term courses. Assignment detail has a Manage Comment Library grading-setup action. Breadcrumbs are Dashboard > Course · Term > Comment Library.

## Shared Browser/Editor Architecture

The reusable browser now has an optional Apply action. The workspace supplies it; the management page does not. Both screens reuse the existing editor, tag input, formatted rendering, search/filter helpers, feedback mapping, and local-list update helper.

## Course-Level Category Handling

New management comments start with None. Stored category IDs unavailable in the empty course-level catalog render as unavailable and survive unrelated edits. The shared editor's undefined-category selection now correctly selects None.

## Search and Tags

The management screen uses existing case-insensitive title/text/tag search and AND tag filtering. Tag suggestions update from local state after mutations.

## CRUD

Create, edit, and delete use the existing narrow APIs and canonical returned comments. Delete confirmation states that already-applied student comments are unchanged.

## Publication Feedback

Full success shows concise toast feedback. Publication failure retains the local mutation and explains that faculty must resolve the repository issue before using Publish Course Changes to retry.

## Accessibility

The PageHeader heading ID, breadcrumbs, labelled search and filters, accessible editor controls, live feedback, and ConfirmDialog are reused. The management screen has no grading Apply shortcuts or student state.

## Files Changed

Route/path/breadcrumb/navigation modules; new comment-library route and page; shared browser/editor feedback refinements; focused tests; styling; roadmap and specification documentation.

## Tests Added or Updated

Added management-page load/empty/create-publication-warning/delete tests, dedicated-route/breadcrumb tests, dashboard multi-term navigation coverage, assignment-detail navigation coverage, and category-None coverage. Updated shared browser tests for optional Apply behavior.

## Documentation

Marked backlog item 39 resolved and COMMENT-1 through COMMENT-5 complete. PR12-4 and PR12-5 remain next.

## Validation Commands Run

Focused UI tests and UI typecheck passed during implementation. Final complete validation is recorded with the commit handoff.

## Assumptions Made

Stale selected tag filters remain selected after a mutation; they safely produce no matches if their tag no longer exists.

## Result

Faculty can manage the one course-owned reusable comment library outside grading without a new schema, storage location, backend service, or renderer filesystem capability.

## Comment-Library Track Completion

COMMENT-1 through COMMENT-5 are complete; backlog items 39 through 43 are resolved.

## Next Step

PR12-4 — roster source/provenance, followed by PR12-5 — roster-manager visual rebuild.
