# Graider Schema v1 → v2 Migration and Reconciliation

**Status:** migration decision contract

**Authority:** [remote course architecture](graider-remote-course-architecture.md) and
[evolution roadmap](graider-architecture-evolution-roadmap.md)

**Related:** [schema-v2 design](graider-schema-v2-design.md),
[repository layout](graider-repository-layout-v2.md)

## 1. Migration posture

Migration is an explicit, reviewed, remote-safe operation. The analyzer reads
schema v1 and GitHub state without mutation, classifies every conversion, and
refuses to guess security-relevant identities or roles.

The decision classes are:

| Class                 | Meaning                                                                             |
| --------------------- | ----------------------------------------------------------------------------------- |
| Safe automatic        | Deterministic conversion from validated v1 or immutable GitHub data                 |
| Confirmation required | A faculty/coordinator must choose or affirm a security- or identity-relevant result |
| Preserve unresolved   | Keep the source/checkpoint and mark Needs attention; do not fabricate a value       |
| Intentionally removed | Obsolete state is not represented in v2; removal is reported and audited            |

Migration changes the authoritative course/admin repository only after the complete
candidate for the publication boundary below validates. It does not delete
student repositories or legacy local clones.

### 1.1 Phase 9 publication boundary

[Issue #16](https://github.com/msoecsse/graider/issues/16#issuecomment-6690809434)
records **Decision: A — staged Phase 9 publication**. This section is the
authoritative definition of that boundary. The logical v2 design describes the
target architecture across phases, not a requirement to implement every domain
before Phase 9 publication.

| Responsibility                              | Phase 9 acceptance                                                                                                                                                | Later canonical work                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Course identity and lifecycle               | Validate immutable course identity, reviewed lifecycle/activation history and term creation order                                                                 | No deferral of these publication facts                                                              |
| Faculty directory and authority             | Resolve faculty identities and current roles; explicitly confirm exactly one fallback administrator and term coordinators; validate section-faculty relationships | Missing earlier history remains unknown, never invented                                             |
| Assignment migration and section operations | Validate reviewed assignment migration state, ownerless repair state, section schedules, usage/Apply evidence and repository/template provenance                  | Subsequent assignment/section features follow the roadmap                                           |
| Legacy grader role                          | Remove obsolete desired-role fields and retain audit evidence; reconcile only verified managed resources under §4                                                 | No grader-to-faculty role inference                                                                 |
| Migration safety                            | Preserve provenance, reviewed decisions, recoverable checkpoints and unresolved findings; satisfy §§3–5 before publication                                        | External reconciliation may remain checkpointed Needs attention under §4                            |
| Student GitHub identity                     | Inventory and preserve usernames, immutable ID observations if available, rename/replacement evidence and explicit unknowns                                       | Phase 13 owns canonical immutable student GitHub identity persistence and identity-change workflows |
| Individual/group grading                    | Inventory and preserve existing records, section-placement/transfer evidence, selected commits, decisions, status and available publication evidence              | Phase 14 owns canonical grading-state relocation and remote grading persistence                     |
| Reusable comments                           | Preserve library content, stable IDs where available, defaults/tags and applied snapshots; record missing ownership/history as unknown/repair-required            | Canonical ownership/history conversion is outside Phase 9; no new owner or history is synthesized   |

Preservation is required even when canonical conversion is deferred. Inventory
must identify source/checkpoint locations and provenance, distinguish remote
source from machine-local/runtime evidence, and report unavailable evidence and
unknown completeness explicitly. Preserve existing local/runtime records in place;
the remote v1 checkpoint alone is not a backup of machine-local grading data.
Phase 9 must not relocate grading records, persist student identity observations
as canonical roster identity, or claim remote grading durability. Missing comment
ownership does not authorize ownership-controlled edits.

Publication blockers are unresolved required Phase 9 facts or safety failures:
ambiguous faculty authorization, unconfirmed fallback/coordinators, conflicting
course/repository/organization identity, unresolved lifecycle or section mappings
needed by the published model, invalid references, stale review, or inability to
preserve inventoried evidence. Unknown/required organization migration remains a
blocker. Assignment ownership or Apply uncertainty must satisfy the decision table's
explicit repair-required/Needs attention rules; it must never become false authority
or false Complete evidence.

Deferred student identity ambiguity, uncertain grading section placement and
missing comment ownership/history do not alone block Phase 9 when preserved and
reported as unresolved. They do block any operation that would rely on an unproven
identity, placement or ownership. If such evidence also contradicts a required
Phase 9 role, lifecycle or section operational fact, that contradiction must be
resolved before publication. A confirmation cannot manufacture technical proof or
missing history. Deferral never permits data loss or bypasses a safety check.

## 2. Decision table

The table applies within §1.1. Rows marked preservation-only describe evidence
handling, not canonical conversion. Future identity and grading transformations
remain defined by the roadmap and logical design.

| Existing v1 concept/state                                                                      | v2 result                                                                                                                                                | Automatic?                                                          | Confirmation needed?                                                                       | Failure/ambiguity behavior                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Course code/title                                                                              | Preserve as course metadata; code becomes subject to v2 immutability after activation history is established                                             | Yes when valid                                                      | No                                                                                         | Invalid/missing required metadata blocks migration                                                                                                   |
| `course.repository`, GitHub organization, and repository name                                  | Mutable locator metadata for the course/admin repository                                                                                                 | Yes                                                                 | No                                                                                         | Mismatch with the synchronized remote is reported; do not create a second course identity                                                            |
| Course/admin repository ID absent from v1                                                      | Query the synchronized remote and persist its immutable GitHub repository ID as canonical course identity                                                | Yes, only from an unambiguous authenticated remote                  | No                                                                                         | Missing, inaccessible, or mismatched remote blocks migration; never derive identity from a name alone                                                |
| Existing local course registration                                                             | No longer a discovery/identity record; v2 discovery creates an identity-scoped app-managed clone keyed by repository ID                                  | Yes for abandoning the registry as canonical state                  | No                                                                                         | The old path is reported for faculty awareness but is not used as identity                                                                           |
| Legacy manually registered course clone                                                        | Retained untouched outside the v2 managed-cache contract                                                                                                 | No mutation                                                         | No                                                                                         | Never delete, reset, repoint, or overwrite it merely because v2 adopts a new managed clone                                                           |
| Institutional faculty username appearing in `sections[].faculty` or ownership metadata         | Attribute on a persistent faculty directory record                                                                                                       | Only when it maps reliably to one faculty identity                  | Yes when the mapping is not uniquely reliable                                              | Preserve every occurrence as unresolved evidence and block publication until relevant identity/role mappings are confirmed                           |
| Faculty GitHub username                                                                        | Current mutable username metadata on a faculty record                                                                                                    | May be refreshed from a uniquely resolved GitHub account            | Yes if multiple/no accounts plausibly match                                                | Do not use the username as canonical identity or guess through a rename                                                                              |
| Immutable faculty GitHub user ID absent from v1                                                | Resolve through GitHub and persist as the authorization anchor                                                                                           | Yes only for an obvious one-to-one verified mapping                 | Yes for any non-obvious mapping                                                            | Unresolved identity remains Needs attention; no role is invented and migration cannot publish an authorization model containing ambiguous references |
| Faculty identity history                                                                       | Seed with facts that can be proven from v1 plus current GitHub resolution; do not manufacture prior rename intervals                                     | Partially                                                           | No for proven facts                                                                        | Unknown earlier history remains unknown rather than inferred                                                                                         |
| Fallback administrator absent from v1                                                          | Exactly one confirmed faculty directory reference                                                                                                        | No                                                                  | **Always explicitly select/confirm for a legacy course**                                   | Migration remains incomplete until selected; creator, owner, or local user is not silently chosen                                                    |
| Term metadata                                                                                  | Preserve code, academic metadata, and display name                                                                                                       | Yes when valid                                                      | No                                                                                         | Invalid/duplicate term identity blocks migration                                                                                                     |
| Term lifecycle not represented by v1's full Draft/Active/Archived model                        | Map only when current evidence and existing status are unambiguous                                                                                       | Sometimes                                                           | Required when lifecycle or prior-active history cannot be proven                           | Preserve Needs attention rather than risk deleting a formerly Active term or creating two Active terms                                               |
| Term coordinators absent or unreliable                                                         | Current coordinator list plus durable relationship history from confirmed facts                                                                          | No when no reliable source exists                                   | **Explicit coordinator assignment required** where v1 cannot prove it                      | No security-relevant coordinator role is inferred; migration remains blocked/incomplete for affected term                                            |
| `sections[].faculty: string[]`                                                                 | Current section-faculty relationships referencing immutable faculty IDs                                                                                  | Yes after each username-to-identity mapping is confirmed/reliable   | Yes for ambiguous identity and for unclear current/former semantics                        | Preserve unresolved relationship with source username; do not grant access until resolved                                                            |
| Former section-faculty history absent from v1                                                  | No invented intervals; retain only history supported by repository records or explicit confirmation                                                      | No                                                                  | Only if faculty/coordinator supplies history through the migration workflow                | Missing history is reported as unavailable; never turn an uncertain former role into current authority                                               |
| Section ID and roster reference                                                                | Preserve as term-scoped section identity and roster locator; subject to immutability once Active                                                         | Yes                                                                 | No                                                                                         | Invalid references or conflicting IDs block affected term migration                                                                                  |
| Roster `student_id` and status                                                                 | Preserve as institutional student identity and current enrollment fact                                                                                   | Yes                                                                 | No                                                                                         | Duplicate/ambiguous student IDs block affected roster conversion                                                                                     |
| Roster GitHub username                                                                         | Preservation-only: retain source username and provenance                                                                                                 | Yes for preservation                                                | Not for Phase 9 canonical identity binding                                                 | Ambiguous account remains unknown; Phase 13 resolves canonical identity before identity-sensitive changes                                            |
| Immutable student GitHub user ID absent from v1                                                | Preservation-only: inventory available immutable ID observations; absence stays unknown                                                                  | No canonical persistence in Phase 9                                 | Phase 13 owns identity resolution/confirmation                                             | Missing/ambiguous IDs do not alone block Phase 9; never fabricate an ID or authorize identity-sensitive changes                                      |
| Evidence that a student used a different GitHub account                                        | Preservation-only: retain observed IDs/usernames and rename/replacement evidence                                                                         | Yes for evidence preservation                                       | Phase 13 requires confirmation where rename versus replacement is unproven                 | No canonical replacement event or access change in Phase 9; uncertainty remains explicit                                                             |
| GitHub username rename with same immutable user ID                                             | Preservation-only for students: retain verified same-ID observations and prior usernames                                                                 | Yes for proven observations                                         | No for preservation                                                                        | Phase 13 owns canonical student metadata/history updates; a name mismatch never creates an identity                                                  |
| Assignment slug/title/type/grading/rubric/required files                                       | Shared v2 assignment definition                                                                                                                          | Yes when valid and supported                                        | No                                                                                         | Unsupported or invalid content blocks that assignment migration; do not drop it silently                                                             |
| `metadata.faculty_owner`                                                                       | One-entry `owners` list referencing the resolved faculty identity                                                                                        | Yes after owner identity resolves                                   | Only if username identity is ambiguous                                                     | Unresolved owner makes assignment repair-required; do not choose a replacement owner                                                                 |
| No `metadata.faculty_owner`                                                                    | Empty owner list and explicit owner-repair-required condition                                                                                            | Yes                                                                 | Coordinator confirmation is needed later to assign an owner, not to preserve ownerlessness | Assignment remains unowned and cannot be edited, copied, activated, archived, or otherwise operated normally until repaired                          |
| Existing assignment `sections[]`                                                               | Establishes the applicable sections for migration of schedule/manifest evidence; v2 Active assignment availability and per-section usage become explicit | Yes where listed section IDs are valid                              | Required if listed sections conflict with term/manifest evidence                           | Preserve conflict as Needs attention; do not silently expose or suppress a section                                                                   |
| Shared assignment `deadline.due_at` and `late_policy`                                          | Copy the same values into each applicable section's operational state                                                                                    | Yes                                                                 | No when applicable sections are unambiguous                                                | Missing/ambiguous applicable section blocks only that schedule conversion; never retain one shared v2 deadline as a shortcut                         |
| No v1 deadline                                                                                 | No section schedule value unless another authoritative source proves one                                                                                 | Yes                                                                 | No                                                                                         | Do not invent a due date or late policy                                                                                                              |
| v1 assignment status `draft`                                                                   | v2 Draft when no evidence shows prior activation/student-facing activity                                                                                 | Yes when consistent                                                 | Yes if manifest/repository evidence conflicts                                              | Conflicting evidence becomes Needs attention; a provisioned assignment cannot be treated as pristine Draft                                           |
| v1 assignment status `active`                                                                  | v2 Active                                                                                                                                                | Yes                                                                 | No when valid                                                                              | Inconsistency with term/manifest state blocks affected assignment conversion                                                                         |
| v1 assignment status `archived`                                                                | v2 Archived with prior-active history retained                                                                                                           | Yes                                                                 | No                                                                                         | Preserve grading/repository state; never convert to deletable Draft                                                                                  |
| v1 assignment status `closed`                                                                  | No direct v2 lifecycle value is specified                                                                                                                | No                                                                  | Required to choose Active or Archived from actual intended lifecycle                       | Preserve as unresolved/Needs attention; do not silently equate `closed` with Archived                                                                |
| `grader_team` / `grader_permission` course configuration                                       | Removed                                                                                                                                                  | Yes                                                                 | No for removal; faculty assignments must be confirmed separately if access is still needed | Report obsolete state as intentionally removed; do not grant section rights merely because someone was a grader                                      |
| Manifest `permissions.graderTeam`                                                              | Removed from v2 desired authorization state                                                                                                              | Yes                                                                 | No                                                                                         | Historical operation evidence may be retained for audit, but it grants no authorization and is not reconciled as a grader role                       |
| Manifest repository record with immutable repository ID                                        | Preserve repository identity, mutable locator metadata, section/student mapping, lifecycle, permissions evidence, warnings/errors, and useful history    | Yes                                                                 | No when record is internally consistent                                                    | ID/name conflicts are Needs attention and must be checked against GitHub; immutable ID wins only after verification                                  |
| Manifest repository record without repository ID                                               | Resolve immutable repository ID from the exact verified remote                                                                                           | Yes only if unique                                                  | Yes if missing/inaccessible/ambiguous                                                      | Keep the record unresolved and block destructive or identity-sensitive reconciliation                                                                |
| Existing manifest records for a section                                                        | Establish that section's Applied/provisioned history and applied-state basis                                                                             | Yes                                                                 | No when records and section mapping are consistent                                         | Never allow the section to become Not using; inconsistent membership becomes Needs attention                                                         |
| Complete Apply manifest                                                                        | Per-section provisioning `complete`, with repository outcomes and applied assignment revision derived from the checkpointed source configuration         | Yes when all expected targets verify                                | No                                                                                         | Missing repositories/targets prevent false completion and produce Needs attention                                                                    |
| Interrupted/partial Apply or incomplete manifest                                               | Per-section provisioning `incomplete` / partial / Needs attention with successful repository records preserved                                           | Yes                                                                 | Faculty confirmation may be needed to resume/reconcile, not to label it incomplete         | Never roll back verified repositories automatically or claim the section is fully Applied                                                            |
| No manifest records for an applicable section                                                  | Available/not applied unless other repository evidence proves provisioning                                                                               | Yes when absence is reliable                                        | Yes if GitHub/repository evidence conflicts                                                | Conflict remains unresolved; do not infer Not using merely from absence                                                                              |
| Manifest v2 `template.commitSha`                                                               | Pinned/applied template commit provenance                                                                                                                | Yes                                                                 | No when SHA is valid and repository matches                                                | Mismatch or missing referenced commit becomes Needs attention                                                                                        |
| Manifest v2 `templateCommitSha`, `studentDefaultBranchCommitSha`, `templateSyncBaselineStatus` | Preserve as per-repository template distribution baseline                                                                                                | Yes                                                                 | No                                                                                         | Missing/invalid anchors retain `baseline_required`/Needs attention; never fabricate a safe propagation baseline                                      |
| Template repository name/branch without immutable repository ID                                | Resolve and store repository ID when accessible; retain name/branch as metadata                                                                          | Yes only for unique verified repository                             | Yes if external/inaccessible/ambiguous                                                     | Assignment may remain migration-blocked for template operations; do not bind a same-named repository                                                 |
| Template file-management rules absent                                                          | No invented instructor-managed paths; unmatched files receive v2's safe Student-editable behavior                                                        | Yes                                                                 | No                                                                                         | Faculty may configure rules later; migration does not assume overwritable files                                                                      |
| Current grading state keyed by assignment + student                                            | Preservation-only: retain original record/location and section-placement/transfer evidence                                                               | Yes for preservation; no relocation                                 | Phase 14 requires resolution before canonical placement when ambiguous                     | Unknown section remains Needs attention; Phase 9 must not select a guessed destination                                                               |
| Existing group grading state                                                                   | Preservation-only: retain original group record, membership and section evidence                                                                         | Yes for preservation; no relocation                                 | Phase 14 requires repair for cross-section/ambiguous membership                            | Never create cross-section groups or invent a canonical group/section mapping                                                                        |
| Existing selected submission commit and grading decisions                                      | Preservation-only: retain selected commit, decisions and recorded status                                                                                 | Yes for preservation                                                | No for preservation                                                                        | Report invalid/unreachable commits without replacing them with latest; no Phase 9 canonical grading conversion                                       |
| Existing Published status without durable publication history                                  | Preservation-only: retain recorded status and available report/verification evidence                                                                     | Yes for preservation; verification establishes only observed facts  | Required before asserting verified Published when evidence is insufficient                 | Mark verification unknown/Needs attention; do not rewrite status or manufacture actor/timestamp history; canonical history is Phase 14               |
| Current reusable comment library                                                               | Preservation-only: retain entries, IDs where stable, text/defaults/tags                                                                                  | Yes for content preservation                                        | No for preservation                                                                        | Report invalid/duplicate IDs as unresolved; do not drop comments or claim canonical library conversion                                               |
| Reusable-comment ownership/history absent                                                      | Preservation-only: mark ownership/history unknown/repair-required                                                                                        | No canonical ownership/history conversion in Phase 9                | Required before ownership-controlled edits where owner cannot be proven                    | Does not alone block Phase 9; never assign comments to the migrating user or infer ownership from Git commits alone                                  |
| Already-applied comments                                                                       | Preservation-only: retain snapshots in original grading records                                                                                          | Yes for preservation                                                | No                                                                                         | Missing source comment is acceptable; snapshot remains authoritative and is never relinked as live library content                                   |
| Existing faculty/course/section GitHub team names                                              | Candidates for reconciliation metadata, not stable managed-team identity                                                                                 | No, unless immutable team ID and purpose are verified               | Required where ownership/purpose is ambiguous                                              | Leave unrelated or ambiguous teams untouched; never adopt by similar name alone                                                                      |
| Historical GitHub teams no longer implied by v2 roles                                          | Retain untouched unless an explicit, verified cleanup/reconciliation action targets a Graider-managed team                                               | No                                                                  | Yes for cleanup                                                                            | Report as orphaned candidate; do not delete automatically                                                                                            |
| Current GitHub permissions that differ from v2 desired roles                                   | Reconcile only after v2 roles are valid and published                                                                                                    | Desired-state reconciliation is automatic after approval where safe | Required for unresolved identity/team ownership                                            | Pending/incomplete reconciliation is durable Needs attention; unrelated teams remain untouched                                                       |
| Local hidden/show preferences                                                                  | Identity- and machine-local v2 preference, not course schema                                                                                             | May migrate locally when account/course IDs match exactly           | No                                                                                         | If identity cannot be established, leave legacy preference untouched and default safely                                                              |
| Local student repository mappings                                                              | Identity/course/machine-local mappings keyed by immutable repository ID after verification                                                               | Yes for exact verified clones                                       | Required for ambiguous remotes/paths                                                       | Do not move, reset, or delete clones; unresolved paths stay outside automatic management                                                             |

## 3. Migration safety protocol

The migration executor must follow this order:

1. **Synchronize first.** Authenticate, discover the canonical course/admin
   repository by immutable remote identity, and update a clean managed working
   copy. Dirty/divergent state blocks migration until reviewed.
2. **Analyze without mutation.** Parse schema v1, inspect manifests and relevant
   immutable GitHub IDs, produce a complete conversion report, and classify
   safe, confirm, unresolved, and removed items. No course or GitHub state is
   changed.
3. **Checkpoint/backup existing remote state.** Create a recoverable,
   immutable pre-migration reference to the authoritative v1 state before
   writing candidate v2 data. The exact Git mechanism is an implementation
   decision, but recoverability must be verified.
4. **Obtain required confirmations.** At minimum confirm the fallback
   administrator, unresolved faculty identities, coordinator assignments
   not reliably present in v1, and ambiguous lifecycle/section mappings required
   by §1.1. Deferred identity/placement/ownership findings remain explicit; they
   are not canonical student/grading/comment conversion decisions. Record
   actor and decision without inventing missing history.
5. **Generate the Phase 9 candidate.** Transform only the canonical domains
   in §1.1 into a separate candidate representation. Remove grader-role
   configuration, preserve verified manifest/provenance/history, and retain every
   unresolved item as Needs attention rather than guessing. Inventory and preserve
   deferred evidence without canonical conversion; do not rewrite grading paths
   or synthesize student identity or comment ownership/history.
6. **Fully validate the Phase 9 candidate.** Validate all required cross-file
   references and canonical IDs within §1.1, at most one Active term (zero is
   valid), lifecycle guards, role histories, assignment ownership repair state,
   section schedules/Apply state, repository mappings and managed-resource
   identity. Verify deferred evidence preservation and explicit unknowns, not
   future canonical student IDs or grading paths. Do not publish a partial valid
   subset of the Phase 9 boundary as if migration succeeded. Revalidate current
   authorization, immutable repository/organization binding and authoritative
   remote revision against the reviewed source; stale review requires refresh
   and renewed review under the [trusted review contract](graider-remote-course-architecture.md#implemented-review-contract-slice-92--complete).
7. **Push only after validation.** Commit with faculty attribution and push the
   complete validated Phase 9 conversion atomically. Report success only after
   the remote accepts it. If push fails, restore the managed clone to authoritative remote v1 and
   retain the reviewed intent only as an explicit retry artifact.
8. **Require a compatible Graider client thereafter.** Once schema v2 is
   authoritative, older clients must refuse normal course operation. Graider
   never downgrades the course schema automatically.

## 4. Reconciliation after publication

Schema publication establishes desired domain state before all GitHub
organization/team/repository side effects can be complete. Reconciliation:

- uses immutable repository, user, and team IDs wherever available;
- applies the strongest permission implied by valid v2 roles;
- creates/repairs only verified Graider-managed teams;
- records Pending invitations or incomplete external operations;
- retries idempotently after later synchronization;
- never modifies unrelated organization teams; and
- never reports a multi-system operation complete until observed GitHub state
  matches the desired state.

Partial reconciliation does not roll back already verified external work. It
creates a checkpointed Needs attention state with enough information to resume
or to verify manual GitHub repair.

## 5. Migration report acceptance criteria

Before enabling the push action, the analyzer/review must show at least:

- canonical course/admin repository ID and current locator;
- proposed fallback administrator;
- every faculty identity and unresolved mapping;
- each term lifecycle and current/former coordinator relationship;
- each section's faculty conversion and missing history warning;
- every assignment owner conversion or ownerless repair requirement;
- per-section copied schedules and usage/Apply outcome;
- complete versus partial manifests and preserved template baselines;
- every removed grader-role field/team permission;
- student usernames, immutable identity observations where available, provenance,
  ambiguities and the Phase 13 deferral; no canonical identity resolution claim;
- every available individual/group grading record's existing location, preservation
  evidence, known/unknown section placement, selected commit, decisions, status and
  available publication evidence, with canonical relocation/persistence deferred to
  Phase 14 rather than a required target path;
- reusable-comment content and applied-snapshot preservation, stable IDs where
  available, and explicit unknown/repair-required ownership/history;
- source/checkpoint references, unavailable evidence and machine-local completeness
  limits for all preservation-only inventory;
- managed, ambiguous, and untouched GitHub teams; and
- confirmation that the legacy registered clone will not be changed.

The report must separately identify validated publication facts, preservation-only
inventory, publication blockers and deferred work under §1.1. A completed review or
ready assignment plan is not publication approval. All required Phase 9 facts and
preservation checks must pass before push is enabled; unresolved deferred evidence
is not a claim that Phases 13 or 14 have completed.

Any item that would change authorization, identity, or irreversible lifecycle
without a reliable source or recorded confirmation blocks publication. Apply the
§1.1 blocker rules without turning preserved deferred unknowns into canonical facts.

Slice 6.6 removes the active grader role before migration. The operational v1 parser
still accepts obsolete grader configuration and manifest-v1 readers preserve historical
permission evidence. Setup and Apply create no grader state. Phase 9.4 owns removal
of that persisted data and explicit GitHub team/permission reconciliation; migration
must not infer a section-faculty role from old grader membership.
