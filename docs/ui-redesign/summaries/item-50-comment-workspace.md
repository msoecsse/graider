# ITEM-50: Focused grading comment workspace

## Why

The grading sidebar is for the selected student's grade, evidence, applied
feedback, workflow status, and publication actions. Reusable-comment searching,
tag filtering, library CRUD, and long-form feedback authoring made that narrow
surface do two incompatible jobs.

## Architecture

`GradingWorkspacePage` retains the grading session, selected student, source
selection, source/editor view state, snapshot, and comment mutation paths.
`GradingCommentWorkspace` is a focused takeover, modelled after Publish Review:
it replaces the three-column grid without navigating away or creating another
window. Returning to grading remounts the existing grid state rather than
reloading the workspace.

The workspace presents student-comment authoring/editing and reusable-library
browsing, applying, creating, editing, deleting, and promotion. It reuses
`GradingCommentEditorForm`, `ReusableCommentLibraryBrowser`,
`ReusableCommentEditor`, the existing filter helpers, and existing Electron
library mutations. The routed course-level `CommentLibraryPage` remains the
same shared-component management screen.

## Behavior

The normal sidebar keeps applied comments, grading score/status, manual
adjustments, automated evidence/history, workflow repair, and publication.
It has compact Add comment/Browse comment library launch actions and the
post-application Save to course library offer; it contains no reusable search,
tag filters, result cards, or comment editor.

Source Add Comment, `C`, applied-comment edit, and reusable Apply open the
takeover. The source anchor remains in parent state and is displayed in the
existing form. Saving a student comment refreshes its snapshot and returns to
grading; cancel returns without a mutation. Promotion opens a prefilled shared
reusable editor and never alters the already-applied snapshot.

`Cmd/Ctrl-K` opens the library and focuses search. `1`–`9` opens the selected
reusable comment in the apply editor rather than applying silently. `Esc` and
Back to grading use existing comment-draft discard protection. While the
takeover is active, student navigation shortcuts are suppressed so its target
cannot change underneath an operation.

## Validation

Focused workspace/page, shortcut, sibling-panel, and course-level library
tests cover the takeover, source anchor, save/cancel, filtering, reusable CRUD,
promotion, shortcut focus, and navigation suppression. Manual Electron
acceptance testing passed for source selection → Add comment → return to
grading, source/view state restoration, comment library takeover, reusable
comment application, promotion to the course library, `Esc` behavior, and
student-navigation suppression while the comment workspace was active.
Full branch validation still requires the standard root/UI typecheck, lint,
format check, tests, builds, and high-severity audit gate; that full suite has
not been rerun as part of this documentation cleanup.
