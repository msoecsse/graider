# COMMENT-4: One-shot Save to course library

## Summary

The grading workspace now offers an opt-in **Save to course library** action
after a faculty member successfully adds a one-shot student comment. It opens
the existing shared reusable-comment editor; library creation remains a wholly
separate mutation.

## Trigger Semantics

Only a successful `add` operation with no reusable-library source ID creates an
offer. Existing reusable comments and edits of applied comments do not create
one. The student mutation runs and persists before an offer can exist.

## Promotion State

The ephemeral offer retains the student ID and the single generated applied
comment ID, plus the captured submitted values. It is rendered only for that
student, clears on student switch, can be dismissed, is dismissed when the
promotion editor is cancelled, and clears after a successful local library
create. A newer successful one-shot replaces an existing offer.

## Shared Editor Reuse

Promotion uses `ReusableCommentEditor` unchanged, including its validation,
category handling, tag suggestions/input, formatted preview, and pending state.
The normal COMMENT-3 create-result handler is shared by normal creation and
promotion.

## Prefill Mapping

The promotion form receives the submitted title and text exactly, the selected
rubric category when present, and an empty tag list. Student deductions are
entered as nonnegative magnitudes; reusable defaults use the corresponding
negative adjustment so applying the promoted reusable comment produces the
same deduction.

## Student/Library Independence

The same UUID is used for the applied comment and the offer identity. Saving a
reusable comment never changes the applied comment, score, source location, or
`sourceCommentId`; no live link is added.

## Publication Feedback

Successful promotion adds the canonical returned entry to the loaded library
and shows the normal library success toast. If course publication fails, the
entry remains in the local library and the existing **Publish Course Changes**
recovery warning is shown. Local library failure retains the editor for retry.

## Snapshot-Refresh Edge Case

`runGradingMutation` now accepts a narrow post-persistence callback. Promotion
is offered after confirmed student persistence and before snapshot reload, so a
reload failure keeps its existing warning without hiding a valid promotion.

## Accessibility and Keyboard Behavior

The compact offer uses standard secondary buttons. The shared editor retains
COMMENT-3's native controls and keyboard-shortcut protections.

## Files Changed

- `ui/src/grading-workspace/GradingWorkspacePage.tsx`
- `ui/src/grading-workspace/GradingWorkspacePage.test.tsx`
- `ui/src/styles/globals.css`
- comment-library, roadmap, backlog, grading-specification, and this summary
  documentation

## Tests Added or Updated

- Successful one-shot offer and absence of a reusable source ID.
- Prefill mapping, deduction round-trip mapping, tags/suggestions, local
  library update, partial-publication warning, and applied-snapshot isolation.
- Existing reusable application explicitly has no promotion offer.
- Successful student persistence followed by a snapshot-refresh failure still
  exposes promotion and the existing reload warning.
- A late successful mutation cannot surface an offer after student navigation.

## Documentation

Backlog item 43 is resolved. COMMENT-5 remains explicitly deferred.

## Validation Commands Run

| Command                                                 | Result                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                     | Passed                                                                                                          |
| `npm run lint`                                          | Passed                                                                                                          |
| `npm run format:check`                                  | Passed                                                                                                          |
| `npm test`                                              | Passed — 1080 passed, 1 skipped                                                                                 |
| `npm run build`                                         | Passed                                                                                                          |
| `npm run audit`                                         | Passed at the configured high-severity threshold; npm reported 1 low and 2 moderate development-tool advisories |
| `npm --prefix ui run typecheck`                         | Passed                                                                                                          |
| `npm --prefix ui run format:check`                      | Passed                                                                                                          |
| `npm --prefix ui test`                                  | Passed — 1038 passed                                                                                            |
| `npm --prefix ui run build`                             | Passed                                                                                                          |
| `npm --prefix ui test -- GradingWorkspacePage.test.tsx` | Passed — 71 passed                                                                                              |

## Assumptions Made

Promotion cancel dismisses that one-shot offer rather than returning to it.

## Result

COMMENT-4 is implemented without IPC, backend grading-state, or reusable
library schema changes.

## Deferred

COMMENT-5: the dedicated course-level Comment Library screen and navigation.

## Next Step

COMMENT-5 — dedicated course-level Comment Library screen.
