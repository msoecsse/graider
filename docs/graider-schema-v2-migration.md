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

### 1.2 Client compatibility and production enablement

[Issue #29, Option B](https://github.com/msoecsse/graider/issues/29#issuecomment-6713330426)
withdraws the former requirement to prove compatibility across every faculty
installation. This section is the authoritative replacement compatibility policy;
it does not change the staged publication boundary in §1.1 or any other migration
safety requirement.

Before publication:

1. The initiating Graider client must fully support **operational Schema v2**.
   Parser support alone is insufficient. Compatibility must come from trusted
   backend evidence; renderer assertions and untrusted serialized data cannot
   establish it. Missing, unknown, incompatible or stale required technical
   evidence produces a typed, actionable publication blocker.
2. Older/incompatible clients must fail closed against Schema v2 across discovery,
   normal access and every mutation path, including legacy paths and stale local
   caches. Mutations must revalidate authoritative schema/revision before writing;
   an old Schema 1 cache cannot authorize overwriting or downgrading Schema v2.
   Unsupported newer schemas likewise receive no partial normal operation.
3. The migration UI must warn that faculty using incompatible clients will lose
   access to the migrated course until they update. An authorized faculty member
   must explicitly acknowledge that consequence before publication. The trusted
   backend must bind acknowledgement to the current account and exact reviewed
   migration; acknowledgement is not technical compatibility proof.
4. A compatible production release must be available for **macOS Apple Silicon
   (arm64)** and **Windows x64** before production migration is enabled. Phase 3
   signing, distribution and update dependencies remain required; this decision
   does not mark them complete. An unsigned Preview artifact or passing development
   tests is not evidence of compatible production-release availability.
5. No faculty installation inventory, telemetry, version attestation or proof that
   every faculty member has updated is required. Do not introduce such infrastructure
   to satisfy this policy.

Implementation readiness and production-release availability are separate facts.
Current operational course/term gates remain **1**; existing v2 parsing and pure
migration artifacts do not prove operational v2 support. Validator development may
use synthetic evidence, but production publication remains disabled while any
required technical condition, acknowledgement or release availability is unproven.
No new release service or proof mechanism is authorized by this decision.

Issue #20 owns the pure readiness checks and typed blockers. Issue #21 must revalidate
trusted client/readiness conditions, current acknowledgement and production-enablement
conditions before its publication boundary, including fresh checks for time-sensitive
evidence. Issues #22 and #23 own discovery/access and mutation safeguards respectively;
#25 owns the warning and explicit acknowledgement within the approved single
**Upgrade course** confirmation action. No extra checkbox or redundant confirmation
is required. Issue #24 retains post-publication reconciliation responsibilities;
deferred historical findings do not become client-installation requirements.

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
   actor and decision without inventing missing history. Also require the authorized
   compatibility-consequence acknowledgement defined in §1.2.
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
   Require the trusted client/readiness and production-enablement conditions in §1.2
   before publication; revalidate them at the trusted transaction boundary.
7. **Push only after validation.** Commit with faculty attribution and push the
   complete validated Phase 9 conversion atomically. Report success only after
   the remote accepts it. If push fails, restore the managed clone to authoritative remote v1 and
   retain the reviewed intent only as an explicit retry artifact.
8. **Require a compatible Graider client thereafter.** Once schema v2 is
   authoritative, older clients must refuse normal course operation and all
   mutations, including from stale local caches or legacy paths. They must never
   overwrite or downgrade Schema v2; see §1.2.

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
- trusted initiating-client operational Schema v2 support, separately identified
  production-release availability and any unproven production-enablement conditions;
- the incompatible-client access warning and the authorized faculty acknowledgement
  required by §1.2;
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

### Implemented pure grader-removal plan (Slice 9.4C)

`planGraderRemoval` in `src/migration/grader-removal-planner.ts` consumes trusted
retained 9.1 analysis, completed 9.2 review, exact 9.3 assignment plan, 9.4A
inventory and completed 9.4B access review. Callers retain responsibility for the
main-only completed-review freshness/authorization checks. Exact source bindings,
assignment projection and additive access-review projection are checked again;
mismatches block rather than selecting an alternative input.

The detached, deeply frozen plan separates candidate-only persisted-field cleanup
from reviewed faculty terms and post-publication reconciliation intents. Candidate
course fields `grader_team` / `grader_permission` and manifest desired permission
`grader_team` are removed; historical evidence, inventory and decisions remain in
an explicitly non-executable audit branch. Existing section faculty survive and
only explicit reviewed additions carry forward. Faculty, term and section IDs must
match the reviewed directory and exact analyzed inventory.

Only complete source-owned repository observations correlated to the exact numeric
legacy team can produce conditional grant-removal intents. Findings, unknown
identities and incomplete observations remain Needs attention with no unsafe cleanup
targets. Each intent carries the reviewed replacement faculty/coordinator/fallback
policy and member dispositions. After v2 publication, the 9.4D reconciler must
establish and verify managed replacement grants and effective access for that exact
repository before removing any legacy grant. Failed or ambiguous verification leaves
it untouched. Team deletion and membership deletion are always disabled.

This is a pure plan: no I/O, clock, randomness, writes, checkpoints, publication or
GitHub execution. `publicationReady` remains false. Slice 9.4 is complete with the
9.4D capability and 9.4E handoff below; 9.5 candidate generation/publication and
production orchestration remain separate work.
Operational schema gates remain **1**, and Setup still emits Schema 1.

### Implemented post-publication capability (Slice 9.4D)

`LegacyGraderReconciler` is a backend-only, unwired capability. Its trusted caller
supplies the retained 9.4C plan, exact published Schema v2 snapshot, complete term
and repository-scope inventory, canonical course/organization/account IDs, and an
authoritative `readPublished` callback that rechecks session generation, faculty
authority and remote revision. Working-tree state and renderer assertions cannot
supply this context. The caller must serialize it with other course/session work;
the capability additionally serializes its own calls and detaches retained inputs.

Every target rechecks the publication context and parsed v2 faculty/section roles,
then verifies the reviewed numeric repository/team association and complete legacy
team hierarchy/membership observations. Phase 7 membership and course/student
permission reconcilers establish replacements. Pending organization access, missing
fallback access, conflicting scopes or incomplete observations leave legacy access
untouched. Replacement composition withholds collaborator mutation and unrelated
managed-grant removal; missing collaborator access requires separate repair.

Fresh membership, managed-team permission, publication and legacy association reads
precede each numeric grant removal. Successful independent targets survive failures.
Every attempted removal is followed by remote verification, including lost responses
and cancellation; an unverified outcome remains Needs attention. A later run starts
with fresh observations and never retries a destructive call blindly. Already absent
grants still require verified replacement access before reporting success. Once the
intended state is observed, reruns perform no writes. Legacy teams and their members
are never deleted; after all inventoried candidate grants are verified absent, the
report identifies the team only as a manual-cleanup candidate.

The 9.4E main-only handoff composes this capability only after independently verified
publication. No production control, IPC, button, migration orchestration or schema
publication is installed. Slice 9.4 is complete; 9.5 owns publication/orchestration.
Both operational schema gates remain **1**.

### Implemented trusted grader-removal handoff (Slice 9.4E)

`createGraderRemovalHandoffService` re-enters the completed migration-review boundary
and receives exact retained analysis, completed review, inventory and access-review
objects. It constructs the assignment/removal plans without re-reading or replacing
the retained inventory. Missing completions return no handoff; invalid bindings and
replaced authority reject. Planner statuses are preserved without granting publication
authority.

The main-only `getCompletedGraderHandoff()` supplies a retained-object revalidation
closure. Source, immutable repository/organization, account/generation and faculty
authority are checked through the existing trusted course boundary. Identity
re-verification, session refresh/replacement/closure and inventory/access/base-review
replacement invalidate the closure, including changes during awaited observations.

The returned reconciliation operation rejects until a separately injected trusted
reader proves synchronized v2 publication from that exact reviewed source/session.
No such reader is wired to production. Each operation and backend checkpoint obtains
fresh proof, validates v2 schemas and exact repository/organization/account/session
bindings, and rechecks the authoritative revision. The independently proven published
revision is the only permitted source transition; stale or unverified revisions cannot
authorize reconciliation. Publication authority is never cached across calls.
The caller must serialize this work with other course/session mutations, as required
by the 9.4D capability.

The handoff itself writes no migration files, checkpoints, commits or pushes and
performs no GitHub mutations. No new IPC or renderer authority exists. **Slice 9.4
is complete; Slice 9.5 is next** and owns candidate generation, validation, publication
and post-publication orchestration. Operational gates stay **1** and Setup emits
Schema 1.

### Implemented staged evidence inventory (Slice 9.5A)

The exact trusted analysis and review now retain `preservation` inventory under
Decision A (§1.1). This inventory is read only: originals stay in place, no
checkpoint is created, completeness across machines is unknown, and
`publicationReady` remains false. Existing repository/account/SHA/report and
main-process session checks also bind this inventory; renderer decisions cannot
supply student observations or replace preserved records.

Roster observations retain institutional IDs, usernames, enrollment status,
section and source fingerprints. Trusted immutable GitHub ID observations remain
separate evidence (including conflicting observations), never faculty authority
or canonical roster identity. Phase 13 owns identity resolution and persistence.

Individual/group grading inventory retains source/runtime locations, exact bytes,
SHA-256 fingerprints, selected commits, recorded status, decisions and independent
applied-comment snapshots. Roster and manifest section evidence is retained without
selecting a winner for conflicts, cross-section groups or unmapped targets. Commit
reachability and publication verification remain explicitly unknown; available
report artifacts are preserved without proving Published. Phase 14 owns canonical
placement and remote durability. Damaged grading is Needs attention when safely
preserved; existing required identity, authorization, lifecycle and other critical
validation still blocks. Valid source grading activity with exact placement also
protects the term’s positive activation history from being cleared during review;
machine-local grading alone cannot prove shared lifecycle history. Inconsistent
preservation bytes/paths block as well.

Comment libraries preserve original content (including invalid/duplicate entries),
validated IDs/defaults/tags where available, and explicit missing-library and unknown
ownership/history states. No owner/history is invented and missing library entries
never remove or relink applied snapshots. The runtime reader collects existing
manifests and grading artifacts without seeding, relocating or writing files, and
rejects unsafe filesystem entries. Exact bytes are retained even for malformed UTF-8.

Shared fictional test builders in
`tests/unit/migration/synthetic-migration-fixtures.ts` provide BasicCourse,
MultiSectionCourse, HistoricalCourse, IncompleteCourse and ConflictCourse, with
controlled SHA, authorization, lifecycle, identity and source/runtime variations.
These snapshots can be materialized by the existing local Git fixture helper;
they require no network or real identities.

### Implemented pure migration candidate (Slice 9.5B)

`buildMigrationCandidate` in `src/migration/migration-candidate.ts` builds a proposed
complete repository file set under Decision A. Its main-only caller supplies the
exact retained 9.1 read snapshot and analysis, completed 9.2 review, and exact 9.3
assignment/9.4 removal plans obtained through their trusted handoffs. The snapshot
remains separate from the renderer-visible analysis. Replaying analysis must match
the entire retained report, including its source/evidence fingerprint; both plans
are independently reprojected and compared, including inventory/access-review
bindings. The boundary must match the accepted decision and reference exactly.
This is a pure API, without a new handoff service, IPC or production composition.
The outer caller still owns current session, authority and remote freshness checks.

Each detached, deeply frozen file entry contains its canonical portable relative
path, kind, serialized text, authoritative base64 bytes and exact byte SHA-256.
The set includes every source file, including unrelated data. Generated YAML/JSON
uses strict schemas, sorted object keys, LF and a final newline; history arrays
and reviewed creation chronology retain their meaning. Unsafe paths, Windows
device names, case aliases, file/directory conflicts and generated-file collisions
reject the entire proposal, with no partial file set. Invalid UTF-8 evidence keeps
its original bytes; decoded text is never a substitute for them.

Generated files are:

- `course.yml`: required immutable `course.repository_id` and organization binding,
  reviewed lifecycle/creation order, faculty directory/login history and confirmed
  fallback. Existing validated defaults, grading, reports, notifications and GitHub
  configuration survive except obsolete grader desired fields. Trusted current
  locators replace drift, with original source retained in the audit.
- Every `terms/<term>/term.yml`: reviewed lifecycle and irreversible activation
  evidence, current coordinators and section faculty including explicit 9.4 additions.
  Former lists remain empty because these review artifacts prove no former roles;
  missing earlier history is explicit, with no invented intervals or timestamps.
- `terms/<term>/assignments/<slug>/assignment.yml`: a strict staged migration
  definition carrying existing content/template configuration, reviewed immutable
  owners, repair-required ownerless state and original lifecycle evidence. Legacy
  `closed` and contradictory Draft activity use unresolved lifecycle (`null`).
  No assignment revision, owner-management workflow or template pin is invented.
- `terms/<term>/assignments/<slug>/sections/<section>.yml`: exact 9.3 schedule,
  usage and provisioning **evidence** states plus source/runtime manifest references.
  These retain `not_observed | complete_evidence | partial_incomplete | ambiguous`
  without claiming an applied v2 revision or an intentional Not using choice.
- Loaded source manifest-v1 files: strict serialization removes only repository
  `permissions.grader_team`, retaining repositories, IDs, operations, source anchors,
  template baselines and unrelated valid fields. Manifest-v2 and damaged/orphan
  evidence remain preserved; invalid files are evidence, never desired authority.
- `.graider/migration.json`: strict version-1 migration metadata, accepted decision,
  exact source binding, review acknowledgements/member decisions, source originals
  for replaced files, findings, deferred evidence references/observations and
  conditional post-publication reconciliation intents. No checkpoint, publication
  verification or external reconciliation is claimed.

Source grading, rosters, comments and other deferred files remain byte-identical at
their original locations. Runtime originals remain in place and are retained in the
candidate's non-executable audit, outside the proposed repository file set. The
metadata records their locations/fingerprints, placement evidence and explicit
identity, ownership, history, reachability/publication and cross-machine completeness
unknowns. It does not upload runtime grading contents, relocate records, select an
ambiguous section/group destination, repair damaged content or persist canonical
student GitHub identity. Original grader fields survive only as historical evidence.

Candidate generation performs zero filesystem, Git, GitHub, journal or UI operations,
and uses no clock/randomness. `publicationReady` is always false; unknown preservation
completeness remains Needs attention. A blocked result contains no proposed files.
The later validator alone may authorize publication after all required checks.
Operational course/term gates remain **1** and Setup still emits Schema 1. No writer,
checkpoint, commit/push, migration executor or publication control is installed here.

### Implemented verified v1 checkpoint and retry infrastructure (Slice 9.5C)

The main-only `createMigrationCheckpointService` obtains the exact retained completed
review through `getCheckpointHandoff()`. Its revalidation closure rejects replaced
analysis/completion, refreshed/closed sessions, stale authoritative source, changed
account/generation, repository/organization mismatch and lost faculty authorization.
Each completed review has a separate ephemeral identity, including identical renewed
reviews. The service also re-enters the current OAuth course/session boundary,
resolves canonical remote identity/revision and shares the existing per-course lease.
No production control, IPC or renderer installs this capability.

The bundled Git factory exposes `openCheckpoint()` with only exact-source remote
checkpoint read/create methods. The deterministic lightweight reference is
`refs/tags/graider-migration-v1/<source-sha>`. An absent remote ref is pushed from the
reviewed commit without force, using an explicit canonical URL and single refspec;
follow-tags, mirror pushing, push hooks and recursive submodule pushing are disabled.
A fresh `ls-remote --refs` read verifies the raw remote ref, independently of the
push response and all local tags. Exact existing refs are idempotent; conflicts,
including annotated tags, are Needs attention and are never replaced or deleted.
Lost/ambiguous responses require fresh observation. All observations/writes are
bracketed by current source/session/authorization checks; advancement cannot produce
verified success. The operation uses an authenticated isolated no-checkout clone,
removed with bounded Windows cleanup retries. Default-branch content, active managed
clones, legacy clones and local/runtime evidence are preserved.

A failed prepublication attempt may retain a strict version-1 local hint at
`<userData>/managed-courses/<user-id>/<repository-id>/migration-retry.json`, outside
the worktree. Main derives its binding from current trusted state: authenticated
immutable user ID, repository/organization IDs, exact source SHA, report ID, a digest
of session/completion/review identity, current candidate fingerprint and independently
verified checkpoint ref/commit. Only a closed concise failure code is stored. The
record contains no raw errors, credentials, headers, paths, executable capability or
publication/authorization assertion. Reads never seed storage; malformed, oversized,
foreign, unknown-field and linked records fail closed. Writes validate first and
replace only this app-owned record through an exclusive temporary file.

Retry reads are hints only. Every invocation re-enters the current trusted review,
OAuth/session, canonical repository/source and main-owned candidate-fingerprint
provider, then independently verifies the remote checkpoint without creating it.
Source advancement, account/generation/authority changes, repository/organization
mismatch, review replacement or candidate mismatch reject reuse, including changes
during awaited observations. Reopening/restarting review requires renewed decisions;
an old disk record cannot restore ephemeral approvals. Retaining a hint does not back
up local grading data, validate a candidate or authorize publication. All returned
results retain `publicationReady: false`.

This slice adds no migration publication, final candidate validator, Schema v2
operational cutover, reconciliation execution or production migration button. Both
operational gates remain **1**. Later orchestration must supply the current main-owned
candidate fingerprint and the independent 9.5D validation below before publication.

### Implemented full candidate validation (Slice 9.5D)

`validateMigrationPublication` in
`src/migration/migration-publication-validation.ts` is the pure complete-candidate
readiness gate. It accepts a backend-owned `MigrationPublicationContext` and only
candidate/binding assertions as its request. There is no IPC, production composition,
checkpoint, journal, writer or publication capability. Do not deserialize the trusted
context or populate it from renderer-returned objects.

The caller must obtain the exact retained snapshot, analysis, human review, assignment
plan, grader inventory/access review, removal plan and candidate through current trusted
handoffs. The context separately supplies a current authoritative observation and faculty
authorization. Its exact binding covers repository/organization/account, source SHA,
report, session/generation, completion identity, review and both plan digests, and candidate
fingerprint. A refreshed or identical renewed completion is a different binding. These
pure comparisons do not replace fresh remote/account/session/authority checks; #21 must
repeat those checks at its transaction boundary, including after awaits.

Validation reprojects the whole candidate from the retained artifacts and independently
checks strict course identity/configuration, faculty/fallback and role references/history,
complete term order/lifecycle/activation evidence, assignment owners and repair states,
section schedule/Apply evidence, manifest and template provenance, organization continuity,
obsolete grader desired state, supported versions, portable namespaces and exact bytes.
Unresolved required lifecycle or identity-sensitive mappings block; completed review cannot
make technical uncertainty safe. Existing unresolved activation recovery also blocks rather
than being cleared or reinterpreted. Missing, replaced, added or altered files/audit evidence
cannot pass by updating their hashes. `migrationCandidateFingerprint` binds the complete
candidate, bytes and audit, independent of object-key/file-enumeration order while preserving
meaningful review/history array order.

Decision A preservation remains mandatory: every source file survives, replaced originals
remain in the audit, runtime evidence stays outside proposed repository files, and the full
9.5A inventory/metadata must match. Ownerless assignments can remain explicitly acknowledged,
repair-required and read-only. Preserved incomplete Apply, student identity ambiguity, grading
placement/commit/publication uncertainty, damaged records, missing reusable-comment ownership
and earlier role history remain explicit deferred or Needs-attention findings; they never
become false Complete, canonical identity, invented history or remote durability.

Results are detached and deeply immutable. They expose typed actionable blockers, deferred
findings, exact candidate fingerprint and complete source/session/artifact provenance,
compatibility findings, `internalReady` and separate `productionEnablement` findings.
`implementation_ready` means the model's required candidate/compatibility checks passed;
it does not enable publication.

The compatibility seam is explicitly **synthetic only** in this slice. Fictional backend
fixtures can establish operational support, each fail-closed safeguard, exact current-account
access-loss acknowledgement and separately verified release conditions in the model. Unknown,
missing, stale, incompatible, renderer-supplied and malformed evidence fails closed. Synthetic
observations never establish production readiness, even when every modeled release condition
is verified. There is no production-release evidence issuer/provider, and no serialized
`trusted` or `productionReady` flag is accepted. Production contexts report unavailable or
untrusted technical evidence and unproven platform/release prerequisites with actionable
blockers. `publicationReady` and `productionEnablement.enabled` therefore remain false in the
current implementation. This is a deliberate unavailable-evidence outcome, not a claim that
Option B safeguards are complete. Future production composition must retain/revalidate real
trusted evidence without treating this fixture format as an attestation mechanism.

#22/#23 retain operational access/mutation cutovers; #25 retains faculty warning/acknowledgement;
Phase 3 retains signing, distribution, updates and compatible production releases for macOS
arm64 and Windows x64. #21 owns transaction-boundary revalidation/publication, and #24 owns
post-publication orchestration. None is implemented here. Both operational schema gates remain
**1**. Completing #20 does not authorize migrating a course or creating a checkpoint.

### Implemented main-only publication transaction (Slice 9.5E)

`createMigrationPublicationService` supplies a main-only capability under the existing
OAuth account/course synchronization lease. No production control, IPC or preload API
installs it. It requires the exact reviewed authoritative v1 SHA, re-enters the retained
migration, assignment and grader-removal handoffs, and rebuilds the candidate and #20
readiness. Retained snapshot/completion/generation and grader-object identity are checked
again after awaited observations; identical renewed reviews do not restore old authority.

All technical, authorization, compatibility, acknowledgement and production-enablement
gates must pass before creating/verifying the #19 immutable remote checkpoint. Only then
does `managedCourseTransaction` clone the exact source into its isolated workspace and
materialize the explicit candidate delta. Complete validation checks actual bytes,
including ignored/unrelated files, before staging. Only approved canonical paths are
staged, and faculty attribution comes from the retained verified immutable identity.
Committed Git objects are independently checked for exact single-parent source, file
namespace, bytes, modes and migration/repository/organization provenance. The checkpoint,
trusted handoffs, identity, source and time-sensitive readiness are revalidated before
publication. Migration runners use the existing bundled authenticated Git factory with
inherited Git storage/configuration disabled, exact byte handling, disabled hooks/signing,
and explicit branch publication without force, tag following or recursive submodule push.
No active managed cache is used to stage migration.

The trusted **non-cancellable boundary** is immediately before the one branch push,
after preparation, validation and the isolated commit. The backend synchronously checks
cancellation and durably writes the exact publication intent before crossing it. Until
then cancellation leaves authoritative v1 unchanged; a valid checkpoint may remain.
Afterward no renderer signal, window closure or disconnected review owner is consulted.
The backend completes the push and independently observes its authoritative outcome,
even after account invalidation. It never retries the push automatically. Both successful
and lost push responses require fresh remote acceptance proof. Unverifiable outcomes
remain `outcome_unknown`, never cancellation or a claimed failure. Confirmed v2 remains
authoritative when cache synchronization needs attention; it is never rolled back.

The strict version-1 write-ahead locator is
`<userData>/managed-courses/<user-id>/<repository-id>/migration-publication.json`.
It contains the exact source/session/artifact binding, candidate commit and complete file-set
fingerprint, without credentials, raw errors, arbitrary paths or executable authority.
An exclusive temporary file is flushed before atomic rename; the containing directory is
also flushed where supported. Restart recovery re-enters current account/repository access,
clones fresh remote history, and independently verifies the recorded commit and contents.
A record never restores ephemeral review or authorizes another write. Pending outcomes are
observed before another attempt; confirmed publication is returned without a duplicate push.
Confirmed absence requires a fresh explicitly invoked, fully revalidated transaction.

Production readiness composition is fixed and **still refuses publication**: #20 has no
production evidence provider, operational safeguards/acknowledgement remain #22/#23/#25,
and signed/distributed compatible macOS arm64 and Windows x64 releases plus Phase 3 update
prerequisites remain unproven. Successful transaction tests replace that unavailable provider
only inside an isolated test module, run the real synthetic #20 validator, and use fictional
credentials with real local/bare repositories. There is no production synthetic-enablement
flag or readiness override. Passing tests does not make migration operationally available.
Post-publication reconciliation orchestration remains #24; this capability does not execute
it. Operational gates stay **1**, Setup stays Schema 1, and no real course is migrated.
