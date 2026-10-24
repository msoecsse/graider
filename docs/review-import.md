# Graider Review Import — schema v1 and planning contract

Review Import accepts externally generated, faculty-reviewed findings as additive
comments. Graider owns this contract. Generator metadata conveys no authority.
Slice 1 supplies validation, trusted identity resolution and a read-only import
plan; Slice 2 provides preview, explicit recovery approval and application.
The Java Assignment Review Skill must adopt this contract in Slice 3.

## Faculty batch workflow (Slice 2)

Open an assignment's grading workspace and choose **Import Reviews...** in the
assignment header. The native picker accepts multiple JSON files. Main reads a
bounded amount using the Slice 1 limits; React never reads or parses review JSON.
Canceling selection or closing **Review Import Preview** before apply changes no
grading state.

The preview shows typed batch status counts, student identities/sections,
repositories, reviewed/current SHAs, and expandable finding details. Finding
previews use Graider's existing comment Markdown renderer, including inert links.
Ready findings start selected. Student checkboxes, individual checkboxes,
**Select all Ready**, and **Clear selections** control the additions. Eligible
warnings require explicit approval; changed-SHA findings use **Process with
recovery**. Blocked, duplicate, invalid, and unmatched findings cannot be applied.
Approval never turns an unresolved anchor or rubric association into an eligible
finding. Recovered locations come exclusively from Slice 1.

**Apply Reviews** sends the plan ID/version, review index, matched student ID,
finding key, and approval boolean through specific IPC channels. Main retains
trusted input/plan objects in an ephemeral, renderer-owned session. Apply rejects
expired/mismatched sessions, rebuilds faculty scope and canonical context, and
replans retained inputs. It checks the selected match, SHA, rubric, anchor,
eligibility, and approval before each addition. The renderer supplies no persisted
comment object or arbitrary file path.

The trusted adapter in `ui/scripts/reviewImportBackend.ts` calls the ordinary
`addGradingStudentCommentContext` operation. Each addition receives a normal UUID,
its unchanged deduction, mapped rubric item, tags, validated source location, and
stable import provenance. Recovered anchors retain their reviewed SHA, original
location and excerpt in normal anchor history. A final synchronous provenance
check immediately before comment creation handles duplicates introduced after
preview. Edited imported comments remain recognizable without overwriting edits.

The shared comment service has an internal lifecycle-preservation option for this
workflow. Existing comments, notes, view state, completion/publication status,
zero-score decisions, and repository metadata are preserved. Import does not
pull, change the canonical SHA, preview/publish reports, commit, push, or dispatch
workflows. Comments remain editable, movable, duplicable and deletable through
normal grading controls and participate in normal scores/report previews.

Results include applied, duplicate-skipped, failed and affected-student counts,
with per-finding diagnostics. Successful additions survive unrelated failures.
Affected grading snapshots and summary scores refresh immediately without
resetting the current source/document or editor. Closing the flow discards its
session; starting a new import always replans against current state.

## Remaining Java Assignment Review Skill integration (Slice 3)

Slice 3 must adapt the Java Assignment Review Skill to emit one schema-v1 review
JSON artifact per reviewed student, using this document and
`review-v1.schema.json` as the contract. It must supply the assignment identity,
canonical roster GitHub/MSOE identity, mapped repository and exact reviewed SHA;
use stable review/finding IDs across retries; emit faculty-reviewed deductions,
exact rubric IDs where available, Markdown/title/tags, and exact repository-relative
source locations/excerpts (or general findings with no location). Generator
metadata remains informational. Exercise the generated multi-student batch
through Graider preview, recovery approval, selective apply, faculty editing,
report preview and re-import to verify end-to-end interoperability. No skill
changes, schema-v2 work, repository synchronization, or overwrite semantics are
part of Slice 2.

## Canonical artifacts

- Runtime definition: `src/review-import/review-schema.ts` (Zod, existing backend dependency).
- Machine-readable schema: [review-v1.schema.json](review-v1.schema.json).
- Complete example: [exact-match.json](examples/review-import/exact-match.json).
- Reusable examples: `docs/examples/review-import/`, including changed SHA,
  unresolved anchors, duplicate/reimport, wrong student/assignment and invalid schema.

Generate the JSON Schema from the canonical runtime definition at the repo root:

```sh
npx tsx -e 'import { reviewJsonSchema } from "./src/review-import/review-schema.ts"; import fs from "node:fs"; fs.writeFileSync("docs/review-v1.schema.json", JSON.stringify(reviewJsonSchema(), null, 2) + "\n");'
```

Tests compare the artifact with the generated schema to prevent drift. Standard
JSON Schema encodes shape, required fields, bounds, path/SHA patterns and
alternative identity/content fields. Cross-field checks additionally enforced
by Zod are: unique finding IDs, ordered source ranges and exact excerpt line
count. External producers must enforce these semantic rules too; plain JSON
Schema validation alone cannot establish repository trust or anchor validity.

## Version 1 fields

Objects reject unknown fields. Required fields:

| Object           | Required                                                                          | Optional                                     |
| ---------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| Review           | `schemaVersion: 1`, `reviewId`, `assignment`, `student`, `repository`, `findings` | `createdAt` (UTC ISO timestamp), `generator` |
| Assignment       | `courseCode`, `termCode`, `assignmentSlug`                                        | `title`                                      |
| Student          | At least one of `githubUsername`, `studentId`                                     | The other primary identity, `displayName`    |
| Repository       | `owner`, `name`, `reviewedCommitSha`                                              | None                                         |
| Finding          | `id`, `deduction`, at least one of `title`, `text`                                | `rubric`, `tags`, `sourceLocation`           |
| Rubric reference | At least one of `id`, `name`                                                      | The other field                              |
| Source location  | `file`, `startLine`, `endLine`, `excerpt`                                         | None                                         |
| Generator        | `name`                                                                            | `version`                                    |

`studentId` is Graider's roster `student_id`: the MSOE username / Java package
identity. There is no separate stable student ID needed from the external skill.
Include both primary identities whenever available. Display names are diagnostic
only. Course code, term code and assignment slug identify an assignment across
terms; titles never determine matching.

IDs are nonempty strings of at most 256 characters after trimming. Review IDs
must identify one reviewed submission globally, and finding IDs must remain
stable within that review. Producers must not reuse IDs for different findings.
Create a new review ID for a separate review. IDs do not derive from mutable
comment content. SHA strings are full lowercase 40-character SHA-1 or
64-character SHA-256 object IDs, matching Graider's supported Git formats.

Deductions are finite nonnegative numbers (zero and fractional values allowed),
representing intended deduction magnitudes already approved by faculty. Planning
preserves them exactly; it does not calculate grades. Title-only and text-only
findings are valid; absent or blank content is invalid. A finding without a source
location is a general comment. An omitted rubric reference means uncategorized,
which Graider's grading model supports.

Source paths use normalized `/` separators. Absolute paths, drive paths,
backslashes, empty path segments, dot/traversal segments and control characters
are invalid. Lines are positive, inclusive and ordered. `excerpt` records the
whole exact reviewed lines, including indentation, without adding a final newline.
It must have exactly `endLine - startLine + 1` lines. CRLF is normalized to LF
for comparison; no other whitespace normalization is performed. Whitespace-only
excerpts remain unresolved and cannot establish anchors.

Unsupported schema versions fail per file before any finding is planned. No
migrations or permissive future-field parsing are implemented. Future versions
must be introduced intentionally in the central schema/version dispatch.

## Matching and trusted context

`createReviewImportContext(request, loadState?)` adapts loaded Graider config,
manifest, faculty-scoped assignment roster, trusted local heads and a read-only
repository resolver. It uses `normalizeManifestRepositories`,
`findStudentRepositoryMapping`, `loadGradingState`, and
`resolveGradingSubmissionContext`. It rejects manifest/assignment disagreement;
missing or inconsistent mappings and state are blocked per student. Missing
state uses a supplied canonical HEAD; persisted state remains authoritative and
a differing local HEAD is blocked until resolved through normal Graider recovery.
No state file is created. The caller must provide only assignment students in
the current faculty's authorized scope, as existing Electron services do.

`planReviewImport(inputs, context)` accepts JSON text and the resulting trusted
context, independent of React. Metadata never selects a local repository or a
filesystem root. Repository readers are selected by canonical matched student ID.

Identity rules, in order:

1. Course code, term code and assignment slug must match exactly.
2. Resolve GitHub username case-insensitively and MSOE `studentId` exactly.
3. Each supplied identity must resolve uniquely. Multiple matches are invalid
   (`ambiguous_student`). Neither supplied identity matching yields `unmatched`.
4. When both are supplied, they must identify the same roster entry. Different
   students, or one known and one unknown identity, are an invalid identity
   conflict. Repository names and SHAs never override a conflict.
5. A sole primary identity may match uniquely with a warning requiring approval.
6. Repository owner/name must match the trusted manifest mapping
   case-insensitively. The actual local origin must also match that mapping.
   Wrong/missing mappings or wrong origins are invalid, never fallback signals.

Group-aware v2 manifests use the existing student mapping and configured course
organization. Reviews still represent one student; no shared grading mutation
is proposed by this slice.

## SHA and anchor planning

The reader interface has only read operations. `createReviewRepositoryReader`
adapts Graider's Git workspace, validates canonical origin (standard GitHub
HTTPS or SSH forms), proves commit resolution/history membership and reads only
regular Git blobs. It never follows symlinks or reads the working tree.

- `exact`: reviewed SHA equals canonical submission SHA and the commit is
  available in the expected local repository. Verify recorded path, line range
  and exact excerpt. A mismatch is unresolved; line numbers are never trusted
  by themselves, and exact-SHA mismatches are not relocated.
- `changed`: reviewed commit is in current canonical history but differs.
  Requires explicit instructor recovery approval even for general comments.
  First verify the excerpt at the recorded reviewed revision. Then search only
  the same current file for an exact whole-line sequence. Exactly one occurrence
  produces `recoverable` with a proposed range; multiple/no occurrences remain
  unresolved. The original source location and excerpt are always preserved.
- `unrelated`: complete inspected local history does not contain the reviewed
  commit. Invalid, with no eligible additions.
- `unavailable`: repository/commit/history evidence cannot be obtained, including
  history beyond the workspace API's 100-commit bound. Warning, blocked from
  application. Missing objects and shallow/incomplete local history must be
  resolved explicitly; no fetch or pull is attempted.

The shared `exact-source-anchor.ts` helper also serves Graider's existing
repository-update relocation. There is no fuzzy matching, cross-file search,
rename recovery, checkout, canonical-SHA update, or automatic recovery.

## Rubric mapping

A unique stable rubric category ID is exact. If its optional display name differs,
the ID wins with a warning. An unknown/ambiguous ID is unresolved and invalid;
the planner never falls back from a supplied ID to a label. A name-only reference
may map by a unique, case-sensitive exact name with an approval warning. Missing
or ambiguous labels remain unresolved/invalid. No rubric items are created.
An omitted reference produces a valid general/uncategorized deduction.

## Provenance, duplicates and merge semantics

Applied comments gain optional `importProvenance`:

```json
{
  "source": "review_import",
  "schemaVersion": 1,
  "reviewId": "cs1021-lab4-jdoe-review-1",
  "findingId": "null-input"
}
```

The duplicate key is the unambiguous JSON tuple `[reviewId, findingId]`.
Schema version, text, deduction, tags and local comment IDs do not determine
identity. Existing grading files remain valid without provenance. Normal manual
comment edits preserve provenance, including through state serialization. A
re-import preserves the faculty-edited comment. Different finding IDs with the
same text remain distinct; the same finding ID under different review IDs is
also distinct. Deleting an imported comment removes its provenance with it;
there is no tombstone/history store in Slice 1.

Identical files in a batch reserve each eligible key in input order. Later copies
are duplicates. Reusing one review ID with differing identity or finding content anywhere in
the same batch blocks all those files, avoiding order-dependent selection of
conflicting reviews. Informational generator, timestamp, display name and assignment title differences do not establish a conflict or determine trust. Duplicate detection against persisted state is per matched
student and assignment. Duplicates never propose an operation.

The plan contains only `add_comment` descriptions for eligible findings. It
contains no deletions, replacements, score/notes changes, completion/publication
operations or report regeneration. Planning does not call normal comment-write
services. A review with an invalid rubric finding may still expose separate safe
finding candidates; Slice 2 must honor per-finding eligibility and approvals.
Structurally invalid files and identity/repository failures expose no candidates.

## Plan consumed by Slice 2

`planReviewImport(readonly ReviewInput[], ReviewImportContext)` returns
`Promise<ReviewImportPlan>`. Public TypeScript models are in
`src/review-import/review-plan-models.ts`.

- Inputs: `{ filename, content }`, with JSON text only. File reading/selection must
  remain in the trusted main process. Filename is a diagnostic reference, never
  filesystem authority. Returned filenames are basenames.
- Batch: ordered reviews, diagnostics and summary counts for total files,
  `ready`, `warning`, `duplicate`, `unmatched`, `invalid`, eligible findings,
  plus separate finding status counts.
- Review: validated original review metadata, matched student, reviewed SHA
  (in `review.repository`), canonical SHA, SHA classification, diagnostics,
  per-finding plans/counts. Structurally invalid files have no parsed review.
- Finding: original finding including title/text/deduction/source, stable key,
  provenance, rubric mapping, anchor original/proposed range, duplicate flag,
  status, diagnostics, `eligibleToApply`, `requiresApproval`, `recoveryRequired`
  and `operation: "add_comment" | null`.

`ready` means a new candidate needs no warning approval. `warning` can mean an
eligible candidate requiring explicit approval **or** an unresolved blocked
candidate; inspect `eligibleToApply`. `duplicate` is already imported/reserved.
`unmatched` means no scoped student match. `invalid` means structural, identity,
repository, unrelated history or unsafe rubric association. Review aggregation
prioritizes invalid, then all-duplicate, then warnings, then ready. A review with
zero findings is valid and contributes no operations.

Slice 2 must select only eligible additions, obtain required approvals, and
re-plan against fresh trusted state/repository evidence immediately before apply.
A plan is a snapshot, not authorization or a write command. The normal grading
service must retain provenance when creating comments and must not mark grading
complete automatically. No imported comment is created in Slice 1.

## Limits and failures

Named constants bound a batch to **100 files**, **4 MiB UTF-8 per file**,
**1,000 findings per file**, **100,000 characters per text/excerpt**, and
**100 tags per finding**. These accommodate 30–50 student batches with substantial
feedback. More than 100 files rejects the entire batch without parsing any.
Oversized/non-JSON/malformed files fail independently; valid siblings still plan.
The trusted future file reader should enforce the same byte bound before reading
an entire file. Input filenames must have a `.json` extension (case-insensitive).
Parsing uses `JSON.parse` and strict Zod schemas, never execution/evaluation.
Repository failures produce sanitized diagnostics without raw exception text.
No absolute repository paths are included in plan models.

## Complete example

```json
{
  "schemaVersion": 1,
  "reviewId": "cs1021-lab4-jdoe-review-1",
  "createdAt": "2026-10-23T12:00:00Z",
  "generator": {
    "name": "Java Assignment Review Skill",
    "version": "1"
  },
  "assignment": {
    "courseCode": "CS1021",
    "termCode": "26s1",
    "assignmentSlug": "lab4",
    "title": "Collections"
  },
  "student": {
    "githubUsername": "jane-doe",
    "studentId": "jdoe",
    "displayName": "Jane Doe"
  },
  "repository": {
    "owner": "msoe-course",
    "name": "lab4-jane-doe",
    "reviewedCommitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "findings": [
    {
      "id": "null-input",
      "title": "Handle null input",
      "text": "Validate the input before dereferencing it.",
      "deduction": 2,
      "rubric": {
        "id": "correctness",
        "name": "Correctness"
      },
      "tags": ["validation"],
      "sourceLocation": {
        "file": "src/jdoe/Main.java",
        "startLine": 2,
        "endLine": 2,
        "excerpt": "    input.trim();"
      }
    },
    {
      "id": "documentation",
      "text": "Document the public API.",
      "deduction": 1
    }
  ]
}
```
