# COMMENT-2: Library publication contract

## Summary

Added the canonical course comment library to safe course publication and made
the authorized Electron comment-library service the single publication boundary
for reusable-comment create, edit, and delete. Successful local mutations now
return an explicit publication outcome; a Git failure preserves and reports the
local success instead of converting it into a comment-save failure. Library
loading remains read-only.

## Architecture

The core `src/grading` context retains canonical synchronous JSON CRUD and now
uses operation-specific load, comment-mutation, and delete result types. The
Electron service authorizes the course/term/faculty scope, performs the local
context mutation, and only then calls `publishSuccessfulCourseMutation` with
the same trusted registered course root.

`publishSuccessfulCourseMutation` gained a typed successful-input overload so
a caller that has already narrowed to local success receives a required
publication outcome. Existing assignment and roster callers retain their
contracts. Publication remains centralized in `coursePublishService`; no Git or
filesystem API was exposed to the renderer.

## Managed Path

The managed-path policy adds exactly:

`.graider/grading/comments.json`

No `.graider/**` wildcard or generic staging was added. Tests prove nearby
paths such as `.graider/comments.json`, `.graider/grading/other.json`, the
`.bak` sibling, and a nested `subdir/comments.json` remain unrelated.

## Mutation Result Contract

- A local failure or not-found result remains unchanged, has no fabricated
  publication field, and does not invoke publication.
- Successful create/edit results retain the created or edited comment and add
  `diagnostics` plus a required `publication` success/failure result.
- Successful delete retains delete success and adds the same required
  `diagnostics` and `publication` result.
- Publication failure leaves top-level mutation status as `success`, preserves
  the local JSON mutation, exposes `publication.status: "failure"`, and adds
  faculty-safe **Publish Course Changes** retry guidance.
- The load result is a separate type and carries no publication metadata.

IPC, preload, and `window.graiderUI` declarations use the distinct load and
mutation result types. Existing strict request validation and registered-course
path resolution remain unchanged.

## Divergence and Recovery

The publisher still stages only managed paths, refuses unrelated already-staged
work, requires an upstream, commits only managed changes, and pushes normally.
It does not force-push, pull, merge, rebase, or reset.

A two-clone Git test advances the remote from faculty A, then publishes a
different local comment library from stale faculty B. B's push fails
non-fast-forward, B's local commit and comment remain present and ahead, and
the remote retains A's content. After faculty reconcile the repository, manual
**Publish Course Changes** recognizes the local commit as unpushed and remains
the retry path. No-upstream and unrelated-staged-work tests likewise prove the
library file is not rolled back.

## Files Changed

- `src/grading/grading-comment-library-context.ts` — operation-specific core
  result types without changing CRUD or schema behavior.
- `ui/electron/gradingCommentLibraryService.ts` — centralized authorized
  mutation publication and explicit load/mutation result contracts.
- `ui/electron/courseMutationPublicationService.ts` — typed successful-result
  overload for required publication outcomes.
- `ui/electron/coursePublishService.ts` — exact canonical managed path.
- `ui/electron/ipc.ts`, `ui/electron/preload.ts`, and the existing browser load
  type — synchronized Electron/window API contracts.
- Focused core-service, publisher, mutation-wrapper, and preload tests.
- UI-redesign feasibility, roadmap, backlog, and this implementation summary.

## Tests Added or Updated

- Real canonical CRUD through the Electron service proves load is read-only and
  create, edit, and delete each publish exactly once.
- Local not-found behavior proves publication is skipped.
- Publication-failure and real no-upstream cases prove the local library stays
  durable and partial-success diagnostics identify the manual retry path.
- Course publisher tests cover exact-path classification, untracked creation,
  tracked edits, an entry-deletion rewrite, unrelated untracked paths,
  unrelated staged work, and two-clone non-fast-forward divergence.
- Preload coverage proves all three narrow mutation requests remain exposed;
  existing request-validation and security-boundary suites remain green.

## Documentation

- `comment-library-feasibility.md` records COMMENT-2 as complete while
  preserving the planning rationale and future semantic-merge discussion.
- Backlog item 40 is resolved with the exact path, partial-success contract,
  safety behavior, and test coverage. Items 39, 42, and 43 remain open.
- The README roadmap now marks COMMENT-2 complete and points to COMMENT-3.
- The grading specification was reviewed; its already-locked publication
  contract remains accurate and needed no churn.

## Validation Commands Run

| Command                                                                                                                                                                                           | Result                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `npx vitest run tests/unit/grading/grading-comment-library-context.test.ts tests/unit/grading/grading-comment-library-service.test.ts tests/unit/grading/grading-comment-library-request.test.ts` | Passed                                   |
| `npx vitest run electron/courseMutationPublicationService.test.ts electron/coursePublishService.test.ts electron/preload.test.ts` (from `ui/`)                                                    | Passed                                   |
| `npm run typecheck`                                                                                                                                                                               | Passed                                   |
| `npm run lint`                                                                                                                                                                                    | Passed                                   |
| `npm run format:check`                                                                                                                                                                            | Passed                                   |
| `npm test`                                                                                                                                                                                        | Passed — 1079 passed, 1 skipped          |
| `npm run build`                                                                                                                                                                                   | Passed                                   |
| `npm run typecheck` (from `ui/`)                                                                                                                                                                  | Passed                                   |
| `npm run format:check` (from `ui/`)                                                                                                                                                               | Passed                                   |
| `npm test` (from `ui/`)                                                                                                                                                                           | Passed — 1032 passed                     |
| `npm run build` (from `ui/`)                                                                                                                                                                      | Passed; existing chunk-size warning only |
| `npm run audit`                                                                                                                                                                                   | Passed at CI's high-severity threshold   |

The first formatting check identified two touched files; running Prettier only
on COMMENT-2 files corrected them before the final passing checks. The audit
reported three existing low/moderate advisories below CI's configured failure
threshold. There is no separate UI lint script; root `npm run lint` covers the
repository, including `ui/`.

## Assumptions Made

(empty)

## Result

Reusable-comment mutations now provide a safe backend contract for future
faculty UI: local data durability is independent of publication success, while
fully shared success remains explicitly distinguishable. Existing JSON schema,
stable IDs, validation, atomic writes, search, formatting, and applied-comment
snapshot behavior are unchanged.

## Deferred

- COMMENT-3: shared reusable-comment editor, free-form tag authoring,
  autocomplete, case-insensitive normalization/deduplication, grading-workspace
  create/edit/delete controls, and publication feedback UI.
- COMMENT-4: one-shot **Save to course library**.
- COMMENT-5: dedicated course-level Comment Library screen.
- Automatic semantic/three-way comment merging remains a future option; the
  initial behavior is safe failure on divergence.
- PR12-4 roster source/provenance and PR12-5 roster-manager visual rebuild.

## Next Step

COMMENT-3 — build the shared reusable-comment editor, normalized free-form tag
authoring/autocomplete, and grading-workspace create/edit/delete flow on top of
the publication-aware mutation APIs. It should show full success separately
from saved-locally/publication-failed without changing snapshot semantics.
