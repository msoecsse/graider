# ITEM-10 and ITEM-15 deferred UI cleanup

ITEM-10 resolved three small deferred behaviors:

- Publish review rows with unavailable details now offer Retry. A retry reloads
  only that student's snapshot, preserves publication selection, and uses the
  existing review generation safety together with a per-student request token.
- A new source-targeted comment records its opening target for dirty comparison.
  Changing the live canonical source target therefore uses the existing discard
  confirmation without freezing the target used when the comment is saved.
- PageHeader metadata now uses `var(--font-size-body-sm)`.

ITEM-15 removes the duplicate Sections list from RosterPanel. Assignment facts
remains the only Assignment Detail card that lists the assignment's sections;
the renamed Roster card retains summary counts and its unavailable state.

Focused renderer coverage verifies retry success, failure, selection retention,
and stale completion safety; new-comment target dirty tracking; and the
single-section-list Assignment Detail layout.
