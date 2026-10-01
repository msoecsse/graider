# Graider Authorization and Visibility Matrix

**Status:** design contract for later authorization tests

**Authority:** [remote course architecture](graider-remote-course-architecture.md)

**Related:** [schema-v2 design](graider-schema-v2-design.md) and
[lifecycle models](graider-lifecycle-state-models.md)

## 1. How to read this matrix

Authorization is evaluated for an authenticated immutable GitHub user ID
against persisted course, term, section, and assignment relationships. A
GitHub repository permission is necessary infrastructure, not sufficient
domain authorization.

The tables use these values:

| Value                                                  | Meaning                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Allowed**                                            | The scenario may perform the action in the stated target scope.                                              |
| **Allowed in own section**                             | Limited to a section with a current or qualifying historical relationship.                                   |
| **Allowed after explicit coordinator scope expansion** | A current term coordinator may broaden from the normal section-focused interface to the target section/term. |
| **Read only**                                          | Visible, but no mutation authority comes from this role.                                                     |
| **Not visible**                                        | The target data is excluded from discovery/navigation as well as mutation.                                   |
| **Not allowed**                                        | The resource may be visible, but this action is forbidden.                                                   |
| **Conditional**                                        | A stated lifecycle, ownership, or “most recent term” guard must also hold.                                   |

Roles compose by strongest applicable authority, except that a role never
silently expands student/section visibility. For example, a fallback
administrator who also teaches Section 001 grades Section 001 because of the
section-faculty role, not because of fallback-administrator status.

“Own section” includes all students shared with current co-faculty in that
section. Graider never partitions students between co-faculty. “Target
section” means the section currently being evaluated in the table.

## 2. Scenario definitions

| Scenario                                  | Persisted relationship and scope                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Current section faculty                   | Open faculty assignment to the target section in the Active term.                                                                    |
| Current co-faculty                        | Another faculty member with an open assignment to the same target section; rights are identical to current section faculty.          |
| Current faculty, another section          | Open assignment in the Active term, but not to the target section.                                                                   |
| Current coordinator teaching target       | Current coordinator of the Active term and current faculty of the target section.                                                    |
| Current coordinator not teaching target   | Current coordinator of the Active term with no faculty assignment to the target section.                                             |
| Former section faculty, removed mid-term  | Faculty relationship to the target section ended during the Active term with `removed_mid_term`.                                     |
| Normally completed historical faculty     | Faculty remained assigned through normal completion of an Archived term; “own section” means that historical section.                |
| Former coordinator, removed mid-term      | Coordinator relationship ended during the Active term; historical read scope covers that term.                                       |
| Normally completed historical coordinator | Coordinator remained through normal completion of an Archived term; historical scope covers that term.                               |
| Course fallback administrator             | Current course recovery administrator, with no assumed section-faculty role.                                                         |
| Draft-term faculty                        | Open faculty assignment to a section in the target Draft term.                                                                       |
| Draft-term coordinator                    | Current coordinator relationship to the target Draft term. This role alone is not activation authority while another term is Active. |
| Unrelated historical faculty              | Has historical course access, but no relationship to the target term/section.                                                        |
| Assignment owner                          | Current owner of the target assignment. This dimension composes with term/section roles and grants no student visibility by itself.  |
| Assignment editor, not owner              | Faculty active in the term who may edit shared content but has no owner lifecycle authority.                                         |

Removal mid-term and normal completion are intentionally distinct. Removal
ends mutation authority immediately and leaves read-only history. Normal
completion preserves the limited Archived-term grading/regrading/publication
rights approved for the role's historical scope.

## 3. Course and term visibility

Visibility of term metadata is distinct from visibility of a section's roster,
students, grading, and operational state.

| Scenario                                  | Discover/see course              | See current Active term                          | See target Draft term            | See target historical term                        |
| ----------------------------------------- | -------------------------------- | ------------------------------------------------ | -------------------------------- | ------------------------------------------------- |
| Current section faculty                   | Allowed                          | Allowed                                          | Not visible unless assigned      | Allowed in own historical scope                   |
| Current co-faculty                        | Allowed                          | Allowed                                          | Not visible unless assigned      | Allowed in own historical scope                   |
| Current faculty, another section          | Allowed                          | Allowed                                          | Not visible unless assigned      | Term metadata only; target section not visible    |
| Current coordinator teaching target       | Allowed                          | Allowed                                          | Allowed                          | Allowed for coordinated historical terms          |
| Current coordinator not teaching target   | Allowed                          | Allowed                                          | Allowed                          | Allowed for coordinated historical terms          |
| Former section faculty, removed mid-term  | Allowed                          | Read only for former scope                       | Not visible                      | Allowed for former scope                          |
| Normally completed historical faculty     | Allowed                          | Not visible unless independently current         | Not visible                      | Allowed in own section                            |
| Former coordinator, removed mid-term      | Allowed                          | Read only for former coordinated term            | Not visible                      | Allowed for former coordinated term               |
| Normally completed historical coordinator | Allowed                          | Not visible unless independently current         | Not visible                      | Allowed for coordinated term                      |
| Course fallback administrator             | Allowed                          | Allowed term metadata; no implicit student scope | Allowed                          | Allowed term metadata; no implicit student scope  |
| Draft-term faculty                        | Allowed                          | Not visible unless independently authorized      | Allowed                          | Allowed only in an independently historical scope |
| Draft-term coordinator                    | Allowed                          | Not visible unless independently authorized      | Allowed                          | Allowed only in an independently historical scope |
| Unrelated historical faculty              | Allowed                          | Not visible                                      | Not visible                      | Target term/section not visible                   |
| Assignment owner                          | No visibility by ownership alone | No visibility by ownership alone                 | No visibility by ownership alone | No visibility by ownership alone                  |
| Assignment editor, not owner              | Inherited from active term role  | Inherited from active term role                  | Inherited from Draft assignment  | No extra visibility                               |

An archived course is still discoverable and synchronized for authorized
faculty, but is hidden from the normal dashboard until **Show archived** is
chosen. Machine-local hide/show has no effect on authorization or sync.

## 4. Section visibility and roster administration

| Scenario                                  | See target section's students                      | Inspect target section operational state           | Edit target roster                                         | Edit another section roster                        | Add/remove sections                                | Assign faculty                                     |
| ----------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Current section faculty                   | Allowed in own section                             | Allowed in own section                             | Allowed in own section                                     | Not visible / Not allowed                          | Not allowed                                        | Not allowed                                        |
| Current co-faculty                        | Allowed in own section                             | Allowed in own section                             | Allowed in own section                                     | Not visible / Not allowed                          | Not allowed                                        | Not allowed                                        |
| Current faculty, another section          | Not visible                                        | Not visible                                        | Not allowed                                                | Not allowed                                        | Not allowed                                        | Not allowed                                        |
| Current coordinator teaching target       | Allowed in own section normally                    | Allowed in own section normally                    | Allowed in own section                                     | Allowed after explicit coordinator scope expansion | Allowed after explicit coordinator scope expansion | Allowed after explicit coordinator scope expansion |
| Current coordinator not teaching target   | Allowed after explicit coordinator scope expansion | Allowed after explicit coordinator scope expansion | Allowed after explicit coordinator scope expansion         | Allowed after explicit coordinator scope expansion | Allowed after explicit coordinator scope expansion | Allowed after explicit coordinator scope expansion |
| Former section faculty, removed mid-term  | Read only                                          | Read only                                          | Not allowed                                                | Not allowed                                        | Not allowed                                        | Not allowed                                        |
| Normally completed historical faculty     | Allowed in own section                             | Read only                                          | Not allowed                                                | Not allowed                                        | Not allowed                                        | Not allowed                                        |
| Former coordinator, removed mid-term      | Read only across former term                       | Read only across former term                       | Not allowed                                                | Not allowed                                        | Not allowed                                        | Not allowed                                        |
| Normally completed historical coordinator | Allowed across coordinated Archived term           | Read only normally                                 | Conditional exceptional correction                         | Conditional exceptional correction                 | Conditional exceptional correction                 | Conditional exceptional correction                 |
| Course fallback administrator             | Not visible without another role                   | Term/administrative metadata only                  | Conditional exceptional correction; no ordinary section UI | Conditional exceptional correction                 | Conditional administrative/recovery action         | Conditional administrative/recovery action         |
| Draft-term faculty                        | Allowed in own Draft section                       | Allowed in own Draft section                       | Allowed in own Draft section                               | Not visible / Not allowed                          | Not allowed                                        | Not allowed                                        |
| Draft-term coordinator                    | Allowed after explicit coordinator scope expansion | Allowed after explicit coordinator scope expansion | Allowed after explicit coordinator scope expansion         | Allowed after explicit coordinator scope expansion | Allowed                                            | Allowed                                            |
| Unrelated historical faculty              | Not visible                                        | Not visible                                        | Not allowed                                                | Not allowed                                        | Not allowed                                        | Not allowed                                        |
| Assignment owner                          | No student/section access by ownership alone       | No section access by ownership alone               | Not allowed by ownership                                   | Not allowed                                        | Not allowed                                        | Not allowed                                        |
| Assignment editor, not owner              | Inherited from section/coordinator role            | Inherited from section/coordinator role            | Inherited from section role                                | No extra authority                                 | Not allowed                                        | Not allowed                                        |

Archived terms are structurally frozen for ordinary faculty. A normally
completed historical coordinator or fallback administrator may make an
exceptional corrective administrative change, but this is not ordinary
editing and must be explicit and audited. A coordinator removed mid-term does
not retain that authority.

## 5. Course and term lifecycle authority

| Scenario                                  | Create term                                                                                    | Activate term                                                | Archive/unarchive term                                                             | Archive/unarchive course                                                          | Coordinator-wide actions                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Current section faculty / co-faculty      | Not allowed                                                                                    | Not allowed                                                  | Not allowed                                                                        | Not allowed                                                                       | Not allowed                                             |
| Current faculty, another section          | Not allowed                                                                                    | Not allowed                                                  | Not allowed                                                                        | Not allowed                                                                       | Not allowed                                             |
| Current coordinator teaching target       | Conditional: allowed when coordinator of most recently created term                            | Allowed for Draft successor after explicit action            | Archive only as part of successor activation; unarchive only through safe rollback | Conditional: allowed when coordinator of most recent term and archive guards pass | Allowed after explicit coordinator scope expansion      |
| Current coordinator not teaching target   | Conditional: same as current coordinator                                                       | Allowed for Draft successor after explicit action            | Archive only as part of successor activation; unarchive only through safe rollback | Conditional: same as current coordinator                                          | Allowed after explicit coordinator scope expansion      |
| Former section faculty, removed mid-term  | Not allowed                                                                                    | Not allowed                                                  | Not allowed                                                                        | Not allowed                                                                       | Not allowed                                             |
| Normally completed historical faculty     | Not allowed                                                                                    | Not allowed                                                  | Not allowed                                                                        | Not allowed                                                                       | Not allowed                                             |
| Former coordinator, removed mid-term      | Not allowed                                                                                    | Not allowed                                                  | Not allowed                                                                        | Not allowed                                                                       | Not allowed                                             |
| Normally completed historical coordinator | Conditional only if coordinator of the most recently created term                              | Not allowed unless also current Active-term coordinator      | Not allowed by historical role                                                     | Conditional only when coordinator of most recent term                             | Historical term scope only; no future-term authority    |
| Course fallback administrator             | Allowed                                                                                        | Allowed; initial-term authority and recovery authority       | Archive only as part of successor activation; unarchive only through safe rollback | Allowed when no Active term and no unresolved Draft term                          | Administrative recovery only; no implicit student scope |
| Draft-term faculty                        | Not allowed                                                                                    | Not allowed                                                  | Not allowed                                                                        | Not allowed                                                                       | Not allowed                                             |
| Draft-term coordinator                    | Conditional only if this is the most recently created term and creating the next term is valid | Not allowed by Draft role alone while another term is Active | Not allowed; a never-Active Draft may instead be deleted under its separate guard  | Conditional only if also coordinator of most recent term and course guards pass   | Allowed within Draft term after explicit expansion      |
| Unrelated historical faculty              | Not allowed                                                                                    | Not allowed                                                  | Not allowed                                                                        | Not allowed                                                                       | Not allowed                                             |
| Assignment owner / non-owner editor       | No course/term lifecycle authority from assignment role                                        | No authority                                                 | No authority                                                                       | No authority                                                                      | No authority                                            |

Term archival normally occurs as part of atomic successor activation. The
approved architecture defines no ordinary unarchive/reactivate operation; the
only Archived → Active path is safe activation rollback before the newly
activated term has student-facing activity. A Draft term that has never been
Active may be deleted by a current-term coordinator, the fallback
administrator, or—when no Active term exists—a coordinator of that Draft. A
term that has ever been Active is retained as Archived.

## 6. Shared assignment authority

This table applies only when the actor can see the assignment through a term
role. Assignment ownership never creates term or section visibility.

| Scenario                                  | Create/edit shared assignment                      | Activate assignment                       | Archive/unarchive assignment            | Delete Draft assignment       | Manage owners                                          | Adopt pinned template revision |
| ----------------------------------------- | -------------------------------------------------- | ----------------------------------------- | --------------------------------------- | ----------------------------- | ------------------------------------------------------ | ------------------------------ |
| Current active-term faculty, not owner    | Allowed to create and collaboratively edit content | Not allowed                               | Not allowed                             | Not allowed                   | Not allowed                                            | Not allowed                    |
| Current assignment owner                  | Allowed                                            | Allowed                                   | Allowed                                 | Allowed                       | Allowed                                                | Allowed                        |
| Current term coordinator                  | Allowed                                            | Allowed                                   | Allowed                                 | Allowed as ownership override | Allowed                                                | Allowed                        |
| Draft-term faculty, not owner             | Allowed for preparatory work                       | Not allowed                               | Not allowed                             | Not allowed                   | Not allowed                                            | Not allowed                    |
| Draft-term assignment owner               | Allowed                                            | Allowed when term/lifecycle guards permit | Allowed                                 | Allowed                       | Allowed                                                | Allowed                        |
| Draft-term coordinator                    | Allowed                                            | Allowed when lifecycle guards permit      | Allowed                                 | Allowed as ownership override | Allowed                                                | Allowed                        |
| Former section faculty, removed mid-term  | Read only                                          | Not allowed                               | Not allowed                             | Not allowed                   | Not allowed                                            | Not allowed                    |
| Normally completed historical faculty     | Read only                                          | Not allowed                               | Not allowed                             | Not allowed                   | Not allowed                                            | Not allowed                    |
| Former coordinator, removed mid-term      | Read only                                          | Not allowed                               | Not allowed                             | Not allowed                   | Not allowed                                            | Not allowed                    |
| Normally completed historical coordinator | Read only normally                                 | Not allowed                               | Conditional exceptional correction only | Not allowed                   | Conditional exceptional repair only                    | Not allowed                    |
| Course fallback administrator             | Visible for recovery; not an editor by role        | Not allowed by fallback role              | Not allowed by fallback role            | Not allowed by fallback role  | Recovery of coordinator handoff, not routine ownership | Not allowed by fallback role   |
| Unrelated historical faculty              | Not visible                                        | Not allowed                               | Not allowed                             | Not allowed                   | Not allowed                                            | Not allowed                    |

An assignment owner may manage assignment lifecycle and ownership but has no
special roster, section, grading, term, or course authority. An editor who is
not an owner can change shared academic content and thereby create a new
assignment revision, but must acknowledge the warning that applied sections
will become out of date. Ownerless migrated assignments are read-only until a
term coordinator repairs ownership.

## 7. Section assignment, repository, and grading actions

| Scenario                                  | Set due date/late policy                           | Mark Not using                                           | Apply/provision                                            | Update student repositories                     | Grade/regrade                              | Publish reports                            | Replace student GitHub identity                                               |
| ----------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------- |
| Current section faculty / co-faculty      | Allowed in own section                             | Allowed in own section before provisioning               | Allowed in own section when term and assignment are Active | Allowed in own section after reviewed selection | Allowed in own section                     | Allowed in own section                     | Allowed in own section with explicit confirmation                             |
| Current faculty, another section          | Not visible / Not allowed                          | Not visible / Not allowed                                | Not visible / Not allowed                                  | Not visible / Not allowed                       | Not visible / Not allowed                  | Not visible / Not allowed                  | Not visible / Not allowed                                                     |
| Current coordinator teaching target       | Allowed in own section normally                    | Allowed in own section normally                          | Allowed in own section normally                            | Allowed in own section normally                 | Allowed in own section normally            | Allowed in own section normally            | Allowed in own section normally                                               |
| Current coordinator not teaching target   | Allowed after explicit coordinator scope expansion | Allowed after explicit expansion and before provisioning | Allowed after explicit expansion                           | Allowed after explicit expansion                | Allowed after explicit expansion           | Allowed after explicit expansion           | Allowed after explicit expansion and confirmation                             |
| Former section faculty, removed mid-term  | Read only                                          | Not allowed                                              | Not allowed                                                | Not allowed                                     | Not allowed                                | Not allowed                                | Not allowed                                                                   |
| Normally completed historical faculty     | Read only                                          | Not allowed                                              | Not allowed                                                | Not allowed except publication write            | Allowed in own historical section          | Allowed in own historical section          | Not allowed                                                                   |
| Former coordinator, removed mid-term      | Read only                                          | Not allowed                                              | Not allowed                                                | Not allowed                                     | Not allowed                                | Not allowed                                | Not allowed                                                                   |
| Normally completed historical coordinator | Read only                                          | Not allowed                                              | Not allowed                                                | Not allowed except publication write            | Allowed across coordinated historical term | Allowed across coordinated historical term | Conditional exceptional correction only                                       |
| Course fallback administrator             | Not visible without another role                   | Not allowed                                              | Not allowed                                                | Not allowed                                     | Not allowed                                | Not allowed                                | Conditional exceptional administrative correction; no ordinary student access |
| Draft-term faculty                        | Allowed in own Draft section                       | Allowed in own Draft section                             | Not allowed                                                | Not allowed                                     | Not allowed                                | Not allowed                                | Allowed in own Draft roster with explicit confirmation                        |
| Draft-term coordinator                    | Allowed after explicit coordinator scope expansion | Allowed after explicit expansion                         | Not allowed                                                | Not allowed                                     | Not allowed                                | Not allowed                                | Allowed after explicit expansion and confirmation                             |
| Unrelated historical faculty              | Not visible                                        | Not visible                                              | Not visible                                                | Not visible                                     | Not visible                                | Not visible                                | Not visible                                                                   |
| Assignment owner                          | No section authority by ownership alone            | No authority                                             | No authority                                               | No authority                                    | No authority                               | No authority                               | No authority                                                                  |
| Assignment editor, not owner              | No section authority from editor role              | No authority                                             | No authority                                               | No authority                                    | No authority                               | No authority                               | No authority                                                                  |

“Update student repositories” means selective template correction propagation,
not pulling a faculty-managed local clone or publishing a report. It never
occurs merely because an owner adopts a newer template revision. Archived
assignments prohibit new Apply/provisioning; historical grading and report
publication remain available in the authorized historical scope.

## 8. Shared reusable comments

| Scenario                                          | Use shared comments                                                     | Create shared comments         | Edit/delete own comment        | Edit/delete another owner's comment |
| ------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------ | ------------------------------ | ----------------------------------- |
| Current/latest-term faculty                       | Allowed                                                                 | Allowed                        | Allowed                        | Not allowed                         |
| Current term coordinator                          | Allowed                                                                 | Allowed                        | Allowed                        | Allowed                             |
| Draft-term faculty/coordinator for latest term    | Allowed                                                                 | Allowed                        | Allowed                        | Coordinator only                    |
| Normally completed historical faculty/coordinator | Allowed while reviewing authorized history                              | Not allowed if historical-only | Not allowed if historical-only | Not allowed if historical-only      |
| Faculty/coordinator removed mid-term              | Allowed while reviewing authorized history                              | Not allowed                    | Not allowed                    | Not allowed                         |
| Course fallback administrator                     | No library authority by fallback role alone                             | Not allowed by fallback role   | Not allowed by fallback role   | Not allowed by fallback role        |
| Assignment owner/editor                           | No extra library authority; use underlying current/historical term role | No extra authority             | No extra authority             | No extra authority                  |
| Unrelated historical faculty                      | Not visible in target grading context                                   | Not allowed                    | Not allowed                    | Not allowed                         |

Applied grading comments are snapshots. Library authority never authorizes
editing another section's grading record.

## 9. Organization migration and reconciliation

The approved architecture says an **authorized migration workflow** must
preview, checkpoint, resume, and reconcile organization migration, but it does
not assign that authority to a precise role. This is a genuine unresolved
implementation decision. Until it is resolved, no role should receive this
power by inference.

| Action                                           | Current contract                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Detect repository rename under same immutable ID | Automatic metadata refresh; no faculty authorization decision                                                                |
| Detect manual organization transfer              | Automatic transition to Migration required; normal mutations blocked                                                         |
| View migration plan/status                       | Fallback administrator and relevant current coordinator are the least-privilege candidates, but final authority is undecided |
| Initiate organization migration                  | **Not allowed until role authority is explicitly decided**                                                                   |
| Resume/reconcile incomplete migration            | **Not allowed until role authority is explicitly decided**                                                                   |
| Modify unrelated organization teams              | Not allowed for every Graider role                                                                                           |

The later authorization tests should encode this as a denied capability or an
explicit policy placeholder, not silently choose fallback administrator,
coordinator, assignment owner, or GitHub organization administrator.

## 10. Cross-cutting guards

Every “Allowed” result remains subject to these guards:

1. authenticate and map the immutable GitHub user ID to the faculty directory;
2. synchronize and validate the authoritative remote course state;
3. reject unsupported/newer schemas;
4. reject normal mutations during Migration required/incomplete;
5. enforce course, term, assignment, and section lifecycle constraints;
6. require explicit coordinator scope expansion before cross-section operations;
7. require a valid assignment owner for owner-managed lifecycle operations;
8. prohibit student-facing work in Draft terms;
9. prohibit Not using after any provisioning exists;
10. use optimistic concurrency for grading and other stale-write-sensitive
    mutations; and
11. report success only after the remote course/admin update succeeds.

GitHub team reconciliation follows the persisted result of these rules. It
does not define them.
