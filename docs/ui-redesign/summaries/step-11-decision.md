# Step 11 decision: retire §5.5 as specified

## Summary

Recorded the decision from `docs/ui-redesign/step-11-feasibility.md` in the
spec itself, following the correction style already used for §4.1, §5.3,
§5.4, and §5.7: the original text stays, a correction block is added above
it explaining what's actually happening and why, and cross-references point
readers to the analysis rather than repeating it. §6's PR sequence, and
backlog items 27, 33, 34, and 35, were updated to match. Documentation
only — no code, no tests.

## Files Changed

**`docs/ui-redesign/README.md`**

- §5.5 (Term setup wizard): added a "Corrected 2026-09" block before the
  original five-step spec, which is kept intact below it and explicitly
  marked as superseded. The block records: the wizard is not being built
  as five new screens; three dependencies don't exist (items 33-35) and
  `CourseSetupPage.tsx` already performs most of steps 1, 2, and 4; the
  chosen direction is redesigning `CourseSetupPage.tsx` plus shipping items
  33-35 independently; the auto-publish-vs-"nothing created until Review"
  collision is a clash between two correct decisions (the wizard spec and
  backlog item 31's fix), not a defect in either, stated plainly so the
  auto-publish isn't later "fixed" by mistake; the sequencing rule if a
  wizard shell is ever wanted (backend deferral and the shared roster
  module before any UI); and that none of this is urgent, since no new
  rosters are created until next term.
- §6 (PR sequence): row 11 now reads `CourseSetupPage.tsx` redesign + items
  33-35, with a note pointing to §5.5's correction and repeating the
  not-urgent framing. Row 12 (roster manager rebuild) gained a note to give
  it a feasibility pass first, per item 27. A line below the table states
  the wizard shell is deferred indefinitely, not scheduled.

**`docs/ui-redesign/backlog.md`**

- Item 27: added a paragraph recording that the step-11 feasibility pass is
  this item's own advice — check the document against the code before
  building — applied _before_ implementation for the first time, rather
  than corrected after the fact like its four prior examples. Notes it
  found three missing foundations and prevented a five-screen build on top
  of them, and that step 12 should get the same treatment before it's
  built.
- Item 33 (column mapping): reframed to lead with its standalone value —
  any non-Graider-format CSV import hits the same wall regardless of the
  wizard — rather than deriving its importance from §5.5. Added "not
  urgent, no new rosters until next term."
- Item 34 (draft/resumable storage): reframed from "needed for §5.5" to "no
  current caller" — the wizard that motivated it is deferred indefinitely,
  so this is now background knowledge for whichever future multi-step flow
  needs it, not queued work.
- Item 35 (deferred mutation): broadened from "blocks §5.5's wizard" to a
  general constraint — nothing that calls `saveRoster`/`removeRoster`/
  `removeSection`/the wrapped assignment mutations can defer a GitHub
  publish today, for any reason, not just a wizard's Review step. Added an
  explicit "this is not a defect" paragraph mirroring §5.5's correction, so
  the two documents can't drift into contradicting each other on whether
  the auto-publish is a bug.
- Item 36 was already standalone (ties to step 12, not the wizard) and
  needed no change; not touched.

## Documentation

This is the documentation change; no other doc references §5.5's wizard
shell as a build target. `docs/ui-redesign/step-11-feasibility.md` (the
prior investigation) is unchanged and remains the cited source for the
analysis behind this decision.

## Validation Commands Run

| Command                | Result                                                    |
| ---------------------- | --------------------------------------------------------- |
| `npm run format:check` | Passed (after one `prettier --write` pass on `README.md`) |
| `npm run lint`         | Passed                                                    |

## Assumptions Made

None outstanding.

## Result

§5.5 no longer reads as a build target for a literal five-step wizard; the
correction is visible in place, the original spec is preserved as a
record, and §6's sequence, plus backlog items 27/33/34/35, agree with it.
Pushed to `ui-redesign`; CI confirmed green on the resulting commit.

## Deferred

- The wizard shell itself (five steps, left rail, resumability) — recorded
  as deferred indefinitely in §6, not scheduled, not removed from the
  document.
- Items 33-36 remain open backlog work, none of it urgent per the timing
  note (no new rosters until next term).
- Step 12's own feasibility pass, per item 27's new note — not done here;
  belongs to whoever picks up step 12.
