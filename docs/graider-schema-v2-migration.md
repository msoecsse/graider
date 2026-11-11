# Graider Schema v1 → v2 Migration and Reconciliation

**Current status: Phase 9 implementation and independent audit #15 are complete.**
See the [independent audit and evidence](migration-regression.md#independent-phase-9-audit-15).
The audit independently accepted #44's approved ordering (§3) and #45's isolated
bundled-Git snapshot-reader fixtures. Historical slice summaries retain their
original boundaries; #21–#25 composition is complete. Production migration remains
disabled under §1.2's independent technical/release evidence requirements.
Audit completion and passing native regression validation do not enable migration
or authorize Phase 10.

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
Discovery, synchronization and metadata access explicitly support **1 and 2** after
Slice 9.5F. Slice 9.5G additionally declares **1 and 2** for its closed managed-operation
bridge; legacy aggregate course/term services retain their **1** gates. See the
[operation support matrix](#implemented-managed-operation-bridge-slice-95g) for supported
adapters and explicit unavailable families. Access support, v2 parsing and pure
migration artifacts do not prove production migration readiness. Validator development may
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

[Faculty decision #44](https://github.com/msoecsse/graider/issues/44) approves the
existing #21 ordering below. Pure candidate construction is an in-memory proposal
and read-only preflight, distinct from materializing candidate files. Neither
candidate file writes nor authoritative Schema 2 publication may occur before an
independently verified immutable remote Schema 1 checkpoint.

The migration executor must follow this order:

1. **Synchronize and analyze authoritative Schema 1 without mutation.** Authenticate,
   discover the canonical course/admin repository by immutable remote identity,
   and synchronize a clean managed copy. Dirty/divergent state blocks migration.
   Parse the exact authoritative source, inspect manifests and relevant immutable
   GitHub IDs, produce a complete conversion report, and classify safe, confirm,
   unresolved and removed items. Analysis changes no course or GitHub state.
2. **Complete faculty review, confirmations and acknowledgements.** At minimum
   confirm the fallback administrator, unresolved faculty identities, coordinator
   assignments not reliably present in v1, and ambiguous lifecycle/section mappings
   required by §1.1. Complete assignment and grader-access reviews. Deferred
   identity/placement/ownership findings remain explicit; they are not canonical
   student/grading/comment conversion decisions. Record actor and decision without
   inventing history. Require the authorized compatibility-consequence acknowledgement
   in §1.2 through the single **Upgrade course** action; no extra confirmation is added.
3. **Build the pure candidate and perform read-only readiness checks.** Transform
   only §1.1's canonical domains into a separate in-memory representation. Remove
   grader-role configuration, preserve verified manifest/provenance/history and
   deferred evidence, and retain unresolved items as Needs attention rather than
   guessing. Do not rewrite grading paths or synthesize student identity or comment
   ownership/history. Require all technical, authorization, compatibility,
   acknowledgement and production-enablement gates in §1.2 before checkpoint
   mutation. This preflight writes no candidate files and grants no publication authority.
4. **Create and verify the immutable remote Schema 1 checkpoint.** Preserve the
   exact authoritative reviewed source in a recoverable remote reference. Independently
   verify recoverability; conflicting references must never be moved or deleted.
   Revalidate current source, identity, session and authorization around checkpoint
   observations/writes. Missing acknowledgement or readiness refuses checkpoint mutation.
5. **Materialize the candidate in an isolated workspace.** Only after the verified
   checkpoint, clone the exact reviewed source into the isolated transaction workspace
   and write only the approved candidate delta. Never stage migration in the active cache.
6. **Fully validate actual candidate bytes and repeat required checks.** Validate
   the complete file namespace, bytes, modes, required cross-file references and IDs
   within §1.1, at most one Active term (zero is valid), lifecycle guards, role
   histories, assignment ownership repair state, section schedules/Apply state,
   repository mappings and managed-resource identity. Verify deferred evidence
   preservation and explicit unknowns, not future canonical student IDs or grading
   paths. Do not publish a partial valid subset. Independently check committed Git
   objects and exact single-parent source. Repeat source, account, repository and
   organization identity, current authorization, trusted handoff/acknowledgement,
   readiness/production-enablement and remote checkpoint checks before publication,
   including after awaited observations. Stale source requires refreshed analysis
   and renewed review under the [trusted review contract](graider-remote-course-architecture.md#implemented-review-contract-slice-92--complete).
7. **Publish only after successful validation, then reconcile durably.** Commit
   with trusted faculty attribution, stage only approved paths and push the complete
   validated conversion atomically without force. Preserve backend-controlled
   cancellation during preparation/validation; after the durable non-cancellable
   publication boundary, establish the authoritative remote outcome even if the
   window closes or the push response is lost. Never report success without remote
   acceptance or blindly retry an ambiguous push. Before accepted publication,
   Schema 1 remains authoritative and a verified checkpoint/retry hint may remain.
   After acceptance, Schema 2 is authoritative; synchronize the managed cache and
   perform durable reconciliation under §4. Reconciliation failure retains Schema 2
   as Published — Needs attention and never rolls it back. Older/incompatible clients
   must refuse normal operation and all mutations, including stale-cache and legacy
   paths, without overwriting or downgrading Schema 2; see §1.2.

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

### 4.1 Durable recovery — approved Decision A (#31)

[Issue #31](https://github.com/msoecsse/graider/issues/31), Decision A, defines
post-publication Schema 1 → 2 recovery. The private course/admin repository is the
authoritative shared reconciliation journal and permanent migration audit store.
Local journals are hints and cannot authorize or coordinate cross-machine writes.
Exact serialization remains an implementation choice.

Keep three distinct bindings: the original Schema 1 source SHA and independently
verified immutable checkpoint; the original Schema 2 publication SHA/provenance;
and the current exact reconciliation journal revision. Journal commits never replace
the original publication identity. For retained execution authority, accept descendants only after validating every
intervening change as confined to the validated reconciliation/audit namespace and
proving the complete intended course/resource fingerprint unchanged. Unexpected
changes fail closed and require a fresh explicit plan; ancestry alone is insufficient.

Use the existing isolated `managedCourseTransaction`, bundled authenticated Git,
course lease, exact-base non-force push and independent lost-response verification.
Publish a write-ahead guard before each potentially non-idempotent GitHub creation.
Only the confirmed winning journal transaction authorizes its single attempt.
Unresolved/ambiguous outcomes survive restart, synchronization and another machine.
No timeout, account switch or absent local file clears them. Every retry starts with
fresh authoritative observation; unknown absence cannot justify another create.
Retain independent verified progress and never roll back publication.

Explicit recovery authority belongs to the current fallback administrator or a
current coordinator of the most recently created existing term. With no terms,
only fallback qualifies. Verify immutable account identity, current roles, repository,
organization, revision and sufficient GitHub privileges afresh. Former-only roles,
ordinary faculty, directory membership, cached permissions and GitHub ownership alone
are insufficient. This is a dedicated administrative recovery capability, not ordinary
section/student visibility and not Phase 18 organization-transfer authority.

Persist validated intended reconciliation state and reviewed provenance sufficient
to recover without restoring live review objects. Historical approvals/session IDs
remain audit evidence, never execution capabilities. Re-derive current authority
independently; renderer-returned plans, approvals or Ready flags cannot authorize work.

The permanent audit retains original source/checkpoint, publication/provenance,
approved decisions and reviewed identity, deferred historical findings with provenance
and status, reconciliation outcomes and outstanding attention items. It survives Ready,
restart and synchronization. Never automatically delete it or the original checkpoint;
never persist credentials or unnecessary sensitive data.

Published means Schema 2 was accepted and remains authoritative. Ready additionally
requires independent verification of every required current operational access and
reconciliation condition. Required incomplete, unsafe or unknown access means Needs
attention and student-facing readiness false. Safely deferred grading, student identity
and comment findings remain visible but do not alone prevent Ready. Readiness is
separate from audit presence and from Draft/Active/Archived; it grants no lifecycle or
later-phase operation bypass. Production migration remains disabled pending #25 and
Phase 3 plus compatible macOS arm64/Windows x64 release prerequisites.

### Implemented durable reconciliation composition (Slice 9.5H)

`createMigrationReconciliationService` is a main-only capability. Its caller's
`withSynchronizedCourse` lease encloses fresh synchronization, reconciliation and
outcome verification. There is no execution IPC, preload method or production
upgrade control here; #25 owns that wiring. New-course bootstrap remains separate.

The immutable `.graider/migration.json` audit now includes a strict minimal `recovery`
projection: reviewed provenance/digest and the conditional legacy-grant plan,
inventory and reviewed member/role decisions required by the existing 9.4 reconciler.
It excludes runtime file contents and the duplicate assignment plan. Historical
review objects are never restored as capabilities. Older audit records remain
readable; missing recovery evidence refuses execution.

Version-1 `.graider/reconciliation.json` contains source/checkpoint/publication and
complete intended-file fingerprint bindings, reviewer audit digest, guarded invitation/
team/branch-rule creations, per-step/per-resource outcomes and safe reason codes,
and append-only actor/observed-revision history. The current journal revision comes
from its authoritative Git commit, avoiding a self-referential SHA inside its blob.
Credentials, raw provider errors and machine-local paths are never journaled.

The bundled-Git reader discovers the original publication from its exact Schema 1
parent, verifies original-byte preservation and audit/source bindings, validates the
complete published course/term/role set, and checks **every** single-parent descendant.
For retained execution authority only this journal path may change. Domain-byte/mode
changes, merges, changed-then-restored files, journal deletion, foreign bindings,
replaced history and incomplete Ready assertions fail closed. A fresh run independently verifies the original remote
checkpoint without creating, moving or deleting it. Portable namespaces and bounded
reads apply on both supported platforms.

Journal writes reuse the isolated exact-base transaction, scoped staging, faculty
attribution, non-force push and independent remote acceptance/byte observation. Competing
machines cannot both claim one base. Only a confirmed winning write ID permits its
guarded request; ambiguous pushes are observed without another push. Invitation guards
use immutable course/organization/invitee scope across executing accounts. Unknown
creates remain guarded even when absent remotely. Later complete observations can
resolve an accepted-but-lost team creation without another POST.

The composer reuses Phase 7 organization access, lifecycle-projected complete-term
membership, course/fallback permissions, student permissions and managed branch policy,
then 9.4 legacy cleanup with the same lifecycle projection. Cleanup independently
verifies replacements before numeric legacy-grant removal. Legacy teams/membership,
student repositories and arbitrary collaborators are never deleted. Existing Phase 7
defaults remain unchanged. Safe independent work survives partial failure; reruns
inspect before writing and correct resources produce no repeat writes.

Student targets require exact original manifest anchors, immutable repository IDs,
reviewed roster/section correlation and uncontested scope. Group/name-only, cross-section,
stale, conflicting and ID-less evidence grants no mutation authority. Required unproven
Active-term access blocks Ready; safely deferred historical evidence remains visible
without doing so. Draft student targets are prohibited. No student identity, grading
relocation or later-phase operation is invented.

`inspect()` independently validates permanent history after Ready, synchronization
and subsequent domain commits, including supported archive/unarchive. It validates
original publication/source preservation, immutable audit bytes throughout the complete
single-parent history, historical journal bindings and append-only events, and the
original remote checkpoint. Current account, course/organization identity, roles,
privileges and exact remote revision are checked independently. The result exposes
historical reconciliation evidence, `executionState` and `operationalReadiness: unverified`;
a historical Ready record is never current access proof.

Any intervening domain change still invalidates retained execution authority, including
changed-then-restored bytes. The main-only explicit
`reconcile(userId, repositoryId, { freshPlan: true })` invocation reads current trusted
state and publishes a new journal-only plan at that exact base before reconciliation.
The optional version-1 journal `plan` binds its base revision and current actor; the
existing intended fingerprint binds current domain files. The original source,
checkpoint, publication and review digest remain distinct. This transition preserves
all historical events and unresolved guards, appends a fresh-plan event, resets current
step outcomes and starts Needs attention. It never restores review capabilities or
rebases outcomes. Every descendant after that base must again be journal-only; mixed
domain/journal rewrites, stale plans, changed bindings and altered permanent audit fail
closed. Ordinary retry never implicitly creates this fresh plan.

Current roles feed the existing Phase 7 engines. Original manifests cannot prove
changed roster/assignment/manifest or section scope: affected student targets are
withheld, and required Active scope remains Needs attention until trusted current
evidence is available. Existing legacy cleanup validation remains unchanged; a new
plan cannot bypass its reviewed-role, grant-identity or replacement-access checks.
No new carry-forward policy or publication operation is introduced.

Audit presence alone no longer blocks readiness. Before an eligible managed course-lifecycle mutation,
a read-only pass through the same engines independently rechecks current GitHub access;
all GitHub/journal mutations are disabled in that pass. A saved Ready flag cannot
authorize work after external drift. Actual reconciliation records pending/unknown
operations and verified outcomes. Unverified publication proof remains unknown rather
than becoming a claimed rollback or publication failure.

Access Ready does not enable unavailable operations in the 9.5G support matrix.
Student-facing readiness additionally requires an unarchived course and an Active term.
The permanent audit and original checkpoint survive Ready. Production migration remains
disabled pending #25 and Phase 3/platform prerequisites.

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

Under §3, faculty review and pure candidate/readiness preflight precede checkpoint
mutation; candidate materialization follows independent verification. The main-only
`createMigrationCheckpointService` obtains the exact retained completed
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

The authoritative ordering is §3: pure in-memory preflight precedes checkpointing;
actual candidate file validation follows materialization. All technical, authorization,
compatibility, acknowledgement and production-enablement gates must pass before creating/verifying the #19 immutable remote checkpoint. Only then
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

### Implemented schema-discriminated discovery and access (Slice 9.5F)

The backend declares discovery/access support independently from parsing and from the
legacy operation bridge. `remoteCourseMetadataBackend.inspectCourse` accepts Schema 1
and authoritative Schema 2; missing/unknown operational support produces
`client_incompatible`, and newer schemas produce `unsupported_schema`. Neither outcome
permits legacy fallback. `inspectOperationCourse` and default transaction validation
still accept only Schema 1. Setup and the #20/#21 production-publication refusal are
unchanged; this is not evidence of a compatible production release or full mutation support.

`readRemoteCourseAccess` observes the authenticated default-branch SHA, reads course and
term metadata at that exact commit, and rechecks the authoritative SHA before returning
access. Discovery never chooses authorization from a managed cache. Synchronization
validates authoritative metadata before fetching/fast-forwarding; successful cache
validation additionally requires exact HEAD, course bytes, term inventory and term bytes
to match the current remote observation. Stale assumptions fail rather than authorizing a
legacy route. No stale cache can hide a valid newly published v2 course from discovery.

Schema 1 retains its institutional-username resolver, discovery identity-required state,
valid operations and migration-review eligibility. No v2 faculty identity is inferred.
Schema 2 requires immutable course repository and organization IDs, a complete valid term
set/creation order/lifecycle and valid faculty/fallback/role references. Mutable organization
locators may be stale after a rename under the same immutable ID; contradictory stored
organization locators fail validation. Transfers/identity mismatches require reconciliation.
Unknown root migration conditions cannot pass the strict schema. Migration audit findings
and deferred reconciliation do not manufacture operational readiness or mutation authority.

The immutable authenticated GitHub ID is mapped through `FacultyDirectory`; the existing
`AuthorizationResolver`, Draft/Archived overlays, `FallbackAdministrator` and
`CourseLifecycle` determine metadata visibility. Current/former historical scope survives;
Draft visibility follows the Draft overlay. Current coordinator scope is never implicitly
expanded, and fallback alone grants term/recovery metadata without students or sections.
Directory membership, usernames, renderer assertions and local settings grant no v2 role.
Fresh main-owned Course details inspection returns only authorized term and assignment
metadata, with no roster, grading data or executable authorization ticket. Shared archive
is shown through **Show archived**, independently of synchronization eligibility.

Managed operation entry points inspect the freshly synchronized schema before invoking
legacy domain code. Default isolated transactions refuse non-v1 sources before calling
their mutator and retain exact-base/pre-push revision checks. Previously discovered uncut
legacy reads also revalidate authoritative access before using their local source.
Discovery refusals retain trusted folder-ID bindings so excluded incompatible or ambiguous
courses cannot silently revert to a registered legacy cache. These transient bindings
contain no filesystem paths or authorization capability. V2
generic operations remain safely unavailable; #23 owns their authorization/compatibility
bridge and broader managed-operation routing. #24 retains reconciliation orchestration;
#25 retains the production warning/acknowledgement UI. No migration is enabled here.

Deterministic mixed-schema, role/lifecycle/identity/compatibility tests and real local/bare
Git tests cover immediate rediscovery, stale-v1 inspection refusal, synchronization to v2,
authorization loss and zero stale mutation/overwrite/downgrade. macOS arm64/Windows x64
release and CI prerequisites remain independent of local test success.

### Implemented managed-operation bridge (Slice 9.5G)

`ManagedCourseMutationGuard` discriminates the freshly synchronized authoritative
schema before consulting a local institutional username. Schema 2 enters only
`performManagedV2Operation`; it never invokes the legacy handler. The bridge uses
immutable authenticated GitHub identity, complete course/term/role validation,
`AuthorizationResolver`, Draft/Archived overlays and current remote revision checks.
Section reads load only authorized roster files. Coordinator expansion is explicit;
fallback alone receives administrative metadata, without students or shared comments.
Former roles retain their permitted historical reads, with no new mutation authority.

The default aggregate validators remain Schema 1-only. The separate
`OPERATIONAL_MANAGED_SCHEMA_VERSIONS` declaration enables only the closed adapters
below. Unknown/missing operational support and unsupported versions fail closed.
Renderer-supplied scope is a request evaluated by the resolver, never evidence.

| Operation family                                                                            | Final Schema 2 support                                                              | Boundary or dependency                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery, synchronization, course/term/assignment metadata                                 | Supported (#22)                                                                     | Exact remote revision, immutable course/org/account identity and lifecycle-filtered metadata.                                                                                                                                                                        |
| Course archive/unarchive                                                                    | Adapted                                                                             | Main-owned request, exact read revision, Phase 8.6 authorization/checkpoint guards and existing `course.yml`-only transaction. No GitHub repository archive or permission change.                                                                                    |
| Term activation, Draft deletion, rollback, accept-current/restore-predecessor               | Policy adapted; execution intentionally unavailable when trusted evidence is absent | Production has no complete current student-target inventory, durable lifecycle reconciliation composition or exact-source remote activity-absence provider. Authorized requests return typed Needs attention; no empty target list substitutes for unknown evidence. |
| First student-facing activity marker                                                        | Internal barrier retained; no standalone production authority                       | Student operations below remain unavailable. A marker must never authorize their execution by itself.                                                                                                                                                                |
| Scoped roster terms, section roster and summaries                                           | Adapted read-only evidence                                                          | Current/historical section scope with Draft/Archived overlays. CSV usernames are preserved evidence, not canonical Phase 13 identities.                                                                                                                              |
| Shared reusable comment library                                                             | Adapted read-only evidence                                                          | Requires a qualifying term relationship; fallback alone has no library authority. No ownership or history is fabricated.                                                                                                                                             |
| Existing-course configuration, term creation, fallback transfer/coordinator handoff         | Intentionally unavailable                                                           | Complete persisted/audited operation services are not installed. Legacy configuration replacement cannot overwrite v2 identity/history.                                                                                                                              |
| Roster/section/faculty/enrollment mutations                                                 | Intentionally unavailable                                                           | Phases 11/13, with Phase 14 for grading placement on transfer. Exceptional correction policy is not a corrective writer.                                                                                                                                             |
| Assignment create/edit/copy/delete/owners/groups/lifecycle                                  | Intentionally unavailable                                                           | Phase 10 and section operations in Phase 11. Staged migration definitions remain evidence.                                                                                                                                                                           |
| Apply/provisioning/schedules/usage                                                          | Intentionally unavailable                                                           | Phases 11/13 and trusted target/readiness evidence. Draft student-facing execution and Archived provisioning remain prohibited.                                                                                                                                      |
| Student repository mapping/download/pull/snapshot/source/history                            | Intentionally unavailable                                                           | Phases 12/13 authoritative repository-to-student/section scope. A local clone or username cannot establish it.                                                                                                                                                       |
| Student/template workflow save/repair/replacement and template distribution                 | Intentionally unavailable                                                           | Phases 10/11/13/16. Template IPC requires the source course selector.                                                                                                                                                                                                |
| Grading dispatch, workspace/state, comments/adjustments/completion/view state/review import | Intentionally unavailable                                                           | Phase 14 canonical remote persistence/audit, with Phase 15 concurrency. Runtime-only saves cannot stand in for remote durability.                                                                                                                                    |
| Faculty/student reports and individual/bulk publication                                     | Intentionally unavailable                                                           | Proven record/submission/repository placement and Phase 14 durable publication history. Archived late-work policy alone does not supply storage.                                                                                                                     |
| Comment-library mutations                                                                   | Intentionally unavailable                                                           | Immutable ownership/history workflow; preserved unknown ownership grants no edit/delete authority.                                                                                                                                                                   |
| Student Access Pages settings/generation/publication/derived refresh                        | Intentionally unavailable                                                           | Authoritative section/enrollment/repository mappings and supported operations.                                                                                                                                                                                       |
| Generic transactions, manual publication/retry, legacy cutover/source update                | No generic v2 mutation authority                                                    | Only operation-specific trusted adapters may validate v2 transactions. Legacy paths and stale caches fail closed.                                                                                                                                                    |
| New remote course setup                                                                     | Supported through trusted setup adapter                                             | Approved #30 Option A; verified creator, explicit verified coordinators and independently verified section faculty. Canonical unarchived course/initial Draft, no migration requirement.                                                                             |
| Migration publication/reconciliation UI and orchestration                                   | Production migration remains disabled                                               | Existing #20/#21 refusal remains. #24 supplies the main-only durable reconciliation capability; #25 UI/orchestration and Phase 3/platform-release prerequisites remain.                                                                                              |

The mutation inventory includes course-admin IPC, grading/runtime writes, review
import, downloads, workflow/template operations, publication and derived refresh.
Runtime writes are no longer treated as reads merely because they do not commit
course-admin files. Main-owned freshness closures are rechecked after awaited
preparation and before GitHub/Git writes. They never cross IPC. The existing
transaction also revalidates/fetches before its mutator, retaining serialization,
scoped staging, exact-base/pre-push checks and non-force publication.

Previously undiscovered registered Git folders require fresh authenticated remote
Schema 1 access before legacy reads. Missing discovery/account evidence cannot
restore an old route. Local standalone Schema 1 preparation is separate. Legacy
writers reject explicit v2/unknown course schemas even when a cached term still
contains v1 username arrays. Legacy publication independently fetches and reads
`course.yml` at the current remote SHA before staging and again before pushing;
source advancement cannot publish a downgrade. The production CLI performs the
corresponding authoritative check before mutation commands and before each GitHub
write. No parser flag, environment assertion or generic validation override enables v2.

New remote setup retains the verified review in main, scoped to its owning window,
account and generation. Creation accepts only its opaque review ID plus confirmation;
identities/organization privileges and repository absence are checked again before
creation. The private repository is initialized to obtain an exact Git base, then
canonical metadata is published through the existing isolated transaction. Existing
Phase 7 organization/team/permission/branch reconcilers run afterward, with durable
account/repository-scoped setup intent keys outside the worktree, followed by the
discovery topic and synchronization. Pending/failed external setup is explicit Needs
attention; published metadata is preserved and creation is never silently retried.
No students, assignments, canonical grading records or migration audit are invented.

Any migration/reconciliation artifact lacking a complete trusted readiness adapter
blocks course lifecycle mutation. This slice deliberately does not implement #24's
post-migration orchestration, #25's upgrade UI/acknowledgement, later domain phases,
compatible production-release evidence or Phase 3 signing/distribution/updates.
Production migration stays disabled. The earlier slice summaries above describe
their historical implementation boundaries; this section defines current operation
support without enabling their deferred features.

### Implemented faculty execution and recovery composition (Slice 9.5I / #25)

The typed `migrationReview` autosave and `migrationExecution` preload APIs convey
only source/session assertions, faculty decisions, explicit confirmation and recovery
intent. Electron supplies the owner. Main retains all analysis, identities, completed
reviews, candidate/readiness and publication/reconciliation authority. Unknown fields,
renderer plans and compatibility/Ready assertions are rejected.

`migration-review.json` under the existing account/repository userData directory is
bounded, strict local review progress outside the worktree and separate from retry,
publication and shared reconciliation records. It binds authenticated user, immutable
repository/organization, exact source/report and historical review identity. Identity
choices are freshly looked up; report and complete verified directory must match before
partial decisions receive fresh receipts. Main serializes every immediately sent autosave and drains already-received decisions before disposing a closed owner. Navigation cleanup is bound to its exact old review, so it cannot close a replacement session. Restoring never restores completion,
acknowledgement, grader inventory capability or publication authorization. Changed,
foreign, corrupt or unsafe records cannot revive stale authority. Grader decisions
restore only against freshly obtained exact inventory/review fingerprints.

The single Upgrade course intent retains access-loss acknowledgement against the exact
completed base and grader review objects. Publication revalidates it with every retained
handoff/readiness check before the durable non-cancellable boundary. Window closure
releases idle sessions but defers disposal of an executing review until the main-owned
operation settles; account/generation, source and authorization checks remain mandatory.
Duplicate requests share the active operation. Cancellation uses only backend phase
state. After the boundary, the existing durable publication intent and independent
remote verification govern outcome without consulting renderer lifetime. Restart recovery
observes pending publication before any retry; it never resumes a push.

Published reconciliation runs only through #24; explicit retries and #32 fresh-plan
intents never rerun migration. Permanent history includes the independently proven
original publication commit date and original authority projection, preserved through
subsequent lifecycle commits. Historical reconciliation is separate from a fresh
read-only current-access verification. The approved overview, autosave, final warning,
blocking step progress, three outcomes, course notices and permanent Course Settings
entry are described in the [faculty guide](faculty-ui-user-guide.md#confirming-an-upgrade-and-following-progress).

The fixed production readiness provider still refuses publication before checkpoint
creation. #25 installs no technical/release evidence issuer or enablement override.
Phase 3 and compatible macOS arm64/Windows x64 production releases remain independent
prerequisites. No student repository update, grading dispatch, Phase 10–14 feature or
#26 phase audit is included.
