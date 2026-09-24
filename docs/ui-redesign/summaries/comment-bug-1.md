# COMMENT-BUG-1: reusable comment editor first-keystroke crash

## Symptom

Opening **Comment Library**, choosing **New Comment**, and typing the first
character in **Comment text** crashed the routed screen before Save. The route
error boundary replaced the page with its recovery fallback.

## Root Cause

`ReusableCommentEditor` read `event.currentTarget.value` inside functional
`setValue` updater callbacks. Under React's deferred/StrictMode updater
evaluation, the event dispatch had ended and `currentTarget` was `null`. A
focused blank-to-first-character test reproduced the production exception:

```text
TypeError: Cannot read properties of null (reading 'value')
```

The stack points to the Comment text updater in `ReusableCommentEditor.tsx`.
The one-character `FormattedGradingComment` path and shared
`parseCommentContent` parser both handle `"a"` correctly and did not contribute
to the crash.

## Fix

The Title, Comment text, Default adjustment, and Default rubric category
handlers now capture their primitive DOM values synchronously before invoking
the functional state updater. Numeric conversion, `"" -> undefined` category
mapping, and unavailable-category behavior are unchanged.

## Shared Impact

The fix is in the shared editor used by both the dedicated Comment Library and
the grading workspace. No persistence, schema, parser, or formatting behavior
changed.

## Regression Tests

- A StrictMode shared-editor test covers `"" -> "a" -> "ab"`, textarea state,
  placeholder removal, and live preview rendering.
- A dedicated Comment Library test covers the user-visible New Comment flow
  and proves that typing calls none of the create, edit, or delete IPC
  mutations.
- A formatter test proves that one ordinary character renders as a paragraph;
  the existing inline-code and fenced-code tests remain intact.
- The editor submission test now verifies the exact title, text, deduction,
  rubric-category, and tag fields after editing.

## Validation

| Command                                                                                           | Result                                                                                                                                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused UI tests for `ReusableCommentEditor`, `CommentLibraryPage`, and `FormattedGradingComment` | Passed — 12 tests in 3 files                                                                                                                     |
| `npm run typecheck`                                                                               | Passed                                                                                                                                           |
| `npm run lint`                                                                                    | Passed                                                                                                                                           |
| `npm run format:check`                                                                            | Passed                                                                                                                                           |
| `npm test`                                                                                        | Passed — 1,081 passed, 1 skipped (121 files)                                                                                                     |
| `npm run build`                                                                                   | Passed                                                                                                                                           |
| `npm run audit`                                                                                   | Passed the configured high-severity gate; npm reported 1 low and 2 moderate development-tool advisories in Vitest/`@vitest/mocker` and `esbuild` |
| `npm --prefix ui run typecheck`                                                                   | Passed                                                                                                                                           |
| `npm --prefix ui run format:check`                                                                | Passed                                                                                                                                           |
| `npm --prefix ui test`                                                                            | Passed — 1,085 passed (146 files)                                                                                                                |
| `npm --prefix ui run build`                                                                       | Passed with Vite's existing large-chunk advisory                                                                                                 |

## Files Changed

- `ui/src/grading-workspace/ReusableCommentEditor.tsx`
- `ui/src/grading-workspace/ReusableCommentEditor.test.tsx`
- `ui/src/comment-library/CommentLibraryPage.test.tsx`
- `ui/src/grading-workspace/FormattedGradingComment.test.tsx`
- `docs/ui-redesign/backlog.md`
- `docs/ui-redesign/summaries/comment-bug-1.md`

## Result

A blank reusable comment accepts its first and subsequent characters, switches
to the formatted live preview, remains mounted, and persists only when Save is
explicitly submitted.
