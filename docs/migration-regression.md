# Permanent migration regression suite

Run `npm run test:migration` from the repository root after `npm ci` and
`npm ci --prefix ui` with Node 24. This independently runnable target generates
Electron bridges, checks test hygiene, and runs the existing Vitest root and UI
migration suites with two workers. No GitHub credentials, live resources or real
student records are needed. Keep this target after Phase 9.

Run it for changes to schemas, migration, course management, Git transactions,
authorization or reconciliation, alongside required full root/UI checks. The CI
`Migration regression` jobs run the complete target on native macOS arm64 and
Windows x64 and verify architecture. Failure on either platform blocks merging
or releasing affected changes. Linux normal checks do not substitute for them.

## Audit coverage

The target reuses #17's `tests/unit/migration/synthetic-migration-fixtures.ts`
and existing fixture builders rather than introducing another test framework.
Root migration/config/faculty tests cover pure models and authorization; UI
migration, schema-discriminated access, managed operations, startup/discovery,
setup and migration-review tests cover the trusted composition and faculty flow.

| Required invariant                                                                      | Permanent coverage                                                                                                                          |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Staged Decision A publication and original evidence preservation                        | `migration-candidate`, `migration-publication-validation`, `preservation-evidence`, `schema-v1-migration-analyzer`                          |
| Trusted 9.1–9.4 composition; renderer cannot authorize publication                      | `migrationReviewService`, `migrationPublicationService`, review/execution IPC tests                                                         |
| Verified immutable remote checkpoint; conflicting refs and lost responses               | `migration-checkpoint`, `migrationCheckpointService`, `migrationPublicationService`                                                         |
| Complete validation before push; repeated account/repository/organization/source checks | `migrationPublicationService` real local/bare Git transaction tests                                                                         |
| Failed publication retains authoritative v1 and safe explicit retries                   | `migrationPublicationService`, `migrationRetryStore`, `migrationExecutionService`                                                           |
| Accepted v2 survives refresh/reconciliation failures and restart                        | `migrationPublicationService`, `migrationReconciliationService`, `migrationExecutionService`                                                |
| Duplicate requests, concurrent changes, account switching and deterministic API faults  | Publication/execution/reconciliation service tests                                                                                          |
| Durable journals, cross-machine restart, idempotency, creation guards                   | `migration-reconciliation-git`, `migrationReconciliationService` real Git tests                                                             |
| Grader desired-state removal; cleanup only after replacement access                     | `grader-removal-planner`, `legacy-grader-reconciliation`, `migration-reconciliation`                                                        |
| Mixed v1/v2, immutable-ID authorization, newer schema refusal                           | `schemaDiscriminated*`, `managedOperationBridge.integration`, `managedRuntimeWriteSafety`, faculty/config suites                            |
| New remote setup uses v2; standalone folder preparation deliberately retains v1         | `courseSetupService`, managed bridge tests; [setup contract](graider-remote-course-architecture.md#initial-authority--approved-option-a-30) |
| Faculty upgrade/recovery behavior                                                       | `src/migration-review`, execution/history IPC/service tests; [faculty guide](faculty-ui-user-guide.md)                                      |
| Native paths, isolated Git settings, checkpoint refs and durable storage                | Real Git publication/reconciliation suites on both CI targets                                                                               |

The [publication boundary](graider-schema-v2-migration.md#11-phase-9-publication-boundary)
remains authoritative. Student identity conversion, grading relocation and comment
ownership are preserved/deferred as specified there. The managed operation support
matrix explicitly refuses unavailable later-phase writers. Passing tests does not
supply production release evidence or enable migration.

## Diagnosing failures

Read the failing job's Vitest file/scenario and assertion before retrying. Run
`npm run test:migration:root` for root-only diagnosis, or, after bridge generation,
`npm --prefix ui run test:migration` for UI-only diagnosis. A single scenario can
be rerun with the appropriate package's `npx vitest run <file> -t <scenario>`.
These narrower commands do not replace the complete target for acceptance.

Publication/reconciliation fixtures use bundled Git with isolated configuration
and synthetic local repositories, including paths with spaces. #45 routes the
snapshot-reader fixture through `createMigrationGitRunners()` and retains the
shared native cleanup helper. Its regressions exercise a fictional hostile global
signing configuration, empty PATH, inherited Git storage/configuration and exact
mixed-line-ending bytes. The original audit finding below is historical; #15 independently
accepted the fix against the source and regressions. Check native architecture, Node version,
dependency installation and subprocess/file-lock errors when diagnosing platform
failures. Do not replace bundled Git, add credentials, skip tests or weaken assertions.
Capture complete logs outside the worktree; distinguish assertion failures from
resource contention and retain all failure details.

## Independent Phase 9 audit (#15)

**2026-11-11 final independent audit: Phase 9 acceptance is satisfied.**
The active-session review inspected current source and regression assertions at
`3ba7027` on `remote-course-v2`, including #44 (`421a935`) and #45 (`3ba7027`).
Prior implementation completion reports were not substituted for evidence. This
closeout changes audit/status documentation only; no functionality or test was
added, removed, skipped or weakened. Final commit, clean/pushed verification and
all five exact-commit CI job results are recorded in
[issue #15](https://github.com/msoecsse/graider/issues/15), avoiding a self-referential
commit claim in this file.

### Final acceptance findings

| Criterion                                      | Independently inspected evidence and conclusion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9.1 analysis and preservation                  | `schema-v1-migration-analyzer.ts`, `migration-snapshot-reader.ts`, `preservation-evidence.ts` and their regressions bind exact source/bytes, retain unresolved findings and prove read-only analysis. Student identity, grading relocation and comment ownership remain preservation-only under Decision A.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 9.2 review and authority                       | `migration-review-validation.ts`, `migrationReviewService.ts` and their tests require explicit fallback, coordinators, lifecycle/history and creation order. Main retains verified identity receipts and review objects; source/account/generation/replacement invalidates authority. Saved progress does not restore completion.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 9.3 assignment migration                       | `assignment-migration-planner.ts`, `assignmentMigrationPlanningService.ts` and planner/handoff tests preserve exact owners, ownerless repair state, section schedules, successful partial Apply evidence and source/runtime provenance without inferred ownership or false Complete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9.4 grader removal                             | `grader-access-review.ts`, `grader-removal-planner.ts`, `graderRemovalHandoffService.ts`, `legacy-grader-reconciliation.ts` and tests require explicit section decisions and numeric managed targets. Candidate serialization removes grader desired fields. Replacement access is independently verified before legacy grant removal; teams/members and unrelated resources remain intact.                                                                                                                                                                                                                                                                                                                                                                      |
| #44 safety order                               | `migrationPublicationService.ts` obtains retained reviews/acknowledgement, builds the pure candidate and runs `ready()` before `verifyMigrationCheckpoint()`. Only a verified result permits the isolated transaction/mutator. `beforeStage` validates actual bytes; `beforePush` verifies committed objects, rereads the checkpoint with `create: false`, repeats actual-byte readiness and writes durable intent before non-force publication. The real-Git ordering test asserts preflight before checkpoint push, checkpoint before clone/materialization, actual bytes before commit and committed-byte validation before branch push. Missing acknowledgement/production readiness creates no checkpoint. This matches canonical §3 and the faculty guide. |
| #45 fixture isolation                          | `migration-snapshot-reader.test.ts` now uses `createMigrationGitRunners()` for fixture setup and exact reads. The hostile-signing test first proves raw bundled Git sees `commit.gpgSign=true`; the fixture/reader then succeed without mutation. The empty-directory PATH test additionally injects global/system config, foreign Git storage and environment config, checks mixed CRLF/LF blob bytes, unchanged trees, empty PATH directory and absence of foreign writes. `migration-git.ts` removes inherited Git variables/config and fixes signing, hooks and line endings; the bundled engine is resolved independently of PATH. Native cleanup assertions remain. All 16 reader tests passed independently.                                              |
| Recoverable publication / immutable identities | `migration-checkpoint.ts` independently observes exact remote refs, never moves conflicts, and resolves lost responses by rereading. `migration-publication-transaction.ts` checks complete namespace/bytes/modes and exact single-parent source. Publication repeatedly rechecks account, repository, organization, authoritative SHA, retained objects, current authorization and readiness after awaits. Local/bare-Git tests cover races, cancellation, conflicting refs, tampering, rejected/lost pushes and restart without duplicate publication.                                                                                                                                                                                                         |
| Schema compatibility and trust boundary        | `remoteCourseAccess.ts`, `remoteCourseMetadataBackend.ts`, `managedCourseMutationGuard.ts`, `managedOperationBridge.ts`, legacy publication/CLI guards and schema-discriminated/managed safety tests verify fresh authoritative schema/revision and immutable-ID v2 roles without username fallback. Unsupported schemas and stale v1 caches cannot downgrade v2. Discovery/metadata and closed managed adapters support 1/2; aggregate legacy services retain 1, new remote setup emits 2 and standalone preparation deliberately emits 1. Unavailable operation families fail closed. Execution/review IPC accepts intent only, with Electron-owned sender and strict DTOs.                                                                                    |
| Durable reconciliation                         | `migration-reconciliation*.ts`, `migrationReconciliationService.ts` and real-Git/composer tests keep source/checkpoint, original publication and journal revision distinct. Shared write-ahead guards require one remote-confirmed winner before creation, survive restart/another machine and resolve unknown outcomes by observation. Current fallback/latest-created-term coordinator authority is rederived. Every descendant is checked; domain changes require an explicit fresh plan preserving audit/guards. Historical Ready is not current access proof. Partial work remains Published — Needs attention; accepted v2 is never rolled back.                                                                                                           |
| Faculty and canonical documentation            | Reviewed the roadmap, migration contract §§1–5 and implemented sections, architecture migration/6.6/compatibility sections, and faculty guide's review, final confirmation, progress, results and history/recovery flows against source/tests. Optional review/autosave, single acknowledgement, verified checkpoint meaning, backend cancellation boundary and explicit recovery match implementation. Historical slice-local notes are explicitly superseded by current status.                                                                                                                                                                                                                                                                                |
| Scope and prerequisites                        | #10–#14, #16–#26, #29–#32 and #43–#45 were reconfirmed closed. Both independent blockers are resolved and accepted; no substantive Phase 9 gap remains. #39 remains a separate follow-up; #41 is unchanged. No real courses, live GitHub test resources, production enablement or Phase 10 work were involved.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Final local and native validation

Local environment: Node 24.21.0, native macOS arm64. Full logs are outside the
checkout at `/private/tmp/graider-15-final-validation`. Required commands and counts
are recorded here after completion; the issue closeout records the exact pushed
commit's five-job CI run and native architecture checks.

| Command                                                                                | Result                                                                                                                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run tests/unit/migration/migration-snapshot-reader.test.ts --maxWorkers=2` | Passed: 1 file / 16 tests, zero skips; includes hostile signing and empty PATH regressions.                                                                         |
| `npm run test:migration`                                                               | Passed: 32 root files / 880 tests and 24 UI files / 308 tests, zero skips; includes hygiene and bridge generation.                                                  |
| `npm run typecheck`                                                                    | Passed, including bridge generation.                                                                                                                                |
| `npm run lint`                                                                         | Passed, root and UI sources.                                                                                                                                        |
| `npm test -- --maxWorkers=2`                                                           | Passed: 191 files / 3,061 tests, zero skips; hygiene passed.                                                                                                        |
| `npm run build`                                                                        | Passed.                                                                                                                                                             |
| `npm --prefix ui run typecheck`                                                        | Passed, renderer and Electron.                                                                                                                                      |
| `npm --prefix ui test -- --maxWorkers=2`                                               | Passed with loopback permission: 226 files / 2,505 tests, zero skips. Initial sandbox listener failures are recorded below.                                         |
| `npm --prefix ui run build`                                                            | Passed; existing large-chunk advisory retained.                                                                                                                     |
| `npm run format:check`; `npm --prefix ui run format:check`                             | Passed, including final audit documentation.                                                                                                                        |
| `npm run audit`                                                                        | Passed the unchanged high-severity gate with network permission; 1 low / 10 moderate findings tracked below. Initial sandbox DNS denial is retained in `audit.log`. |
| `git diff --check`; relative Markdown file links                                       | Passed; 78 relative file links resolve.                                                                                                                             |

The initial sandbox UI run passed 2,495 tests and failed ten OAuth tests because
callback listeners could not bind. The complete suite was rerun with local
loopback permission; no failure was suppressed or test declaration changed.
The document tests retain the existing PDF standard-font advisory. The UI build retains the existing large-chunk advisory.

Production migration remains disabled: `migrationPublicationReadiness.ts` uses the
fixed production validator with no evidence issuer or enablement override. Trusted
operational support and compatible signed/distributed macOS arm64 and Windows x64
releases plus Phase 3 update prerequisites remain separate requirements. Phase 9
completion does not satisfy them or authorize later-phase operations. Stop here;
Phase 10 has not begun.

The unchanged high-severity dependency audit gate passed. Ten moderate lint
findings remain tracked by [#28](https://github.com/msoecsse/graider/issues/28).
The newly observed low-severity `fast-xml-parser` advisory
`GHSA-474x-hrwr-fgx4` is tracked separately by
[#46](https://github.com/msoecsse/graider/issues/46). Neither finding is a Phase 9
migration acceptance gap; no dependencies or audit thresholds changed here.

### Historical initial audit and resolved blockers

The following is retained as historical evidence from the initial independent
review. Its open/blocked language describes that earlier point only and is superseded
by the final acceptance above.

**2026-11-11: #15 remains open/blocked by [#45](https://github.com/msoecsse/graider/issues/45).
Phase 9 is not closed.** Faculty decision [#44](https://github.com/msoecsse/graider/issues/44)
approves the existing reviewed-preflight-before-checkpoint order. Canonical
[§3](graider-schema-v2-migration.md#3-migration-safety-protocol), the roadmap,
architecture, faculty guide and #15 acceptance language now reflect that order.
Publication ordering coverage retains checkpoint-before-workspace assertions and
also checks pure readiness before checkpoint mutation, actual-byte validation
before commit and repeated actual-byte validation before publication. Production
behavior and enablement are unchanged. #15 must independently accept this resolution;
no audit execution or #45 implementation is included in #44.

The following records the original audit finding, before the #44 resolution.
This fresh audit reviewed `adad3b44c2dfdb60a3b8b06b89c3584f810a5b92` on
`remote-course-v2`. It inspected source, test assertions, canonical requirements
and the faculty guide directly; #26's closeout report was not substituted for
acceptance evidence. No source or test implementation changed.

### Scope and prerequisite reconciliation

#14 and #16–#26 were independently confirmed closed. #15's obsolete prerequisite
block and incorrect workflow-contract path were corrected. Its Schema 1 language
now distinguishes discovery/synchronization/metadata and the closed managed bridge
(1/2), legacy aggregate services (1), new remote setup (2 under approved #30 Option A)
and standalone folder preparation (deliberately 1). #16 Decision A preserves/defers
student identity, grading relocation and comment ownership; #29 Option B retains
trusted initiating-client safeguards, explicit acknowledgement and independent
production release requirements without an all-installations inventory.

### Acceptance evidence

Paths below identify inspected implementations and their existing regression
counterparts, rather than claims based only on issue closure.

| #15 criterion                                          | Independent evidence and result                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9.1 analyzer                                           | `schema-v1-migration-analyzer.ts`, `migration-snapshot-reader.ts`, `preservation-evidence.ts`: exact source binding, immutable analysis, technical blockers and staged preservation. Their root tests assert deterministic analysis, dirty-worktree independence, exact bytes and zero reader mutations. Implementation present; fixture isolation remains #45.                                             |
| 9.2 review                                             | `migration-review-validation.ts`, `migrationReviewService.ts` and reader/IPC tests: explicit fallback/coordinators/lifecycle/order, verified identity receipts, retained-object handoffs and source/account/generation invalidation. Saved progress cannot restore completion or publication authority.                                                                                                     |
| 9.3 plan/handoff                                       | `assignment-migration-planner.ts` and `assignmentMigrationPlanningService.ts`: exact completed review, ownerless repair, section schedule fan-out and incomplete Apply preservation. Planner and handoff tests reject conflicting/stale input and inferred owners.                                                                                                                                          |
| 9.4 removal/handoff                                    | `grader-removal-planner.ts`, `graderRemovalHandoffService.ts`, `legacy-grader-reconciliation.ts`: retained inventory/review, numeric managed-resource targeting, verified publication and replacement access before cleanup. Existing tests cover missing proof, unrelated resources and idempotency.                                                                                                       |
| 9.5 publication                                        | `migration-candidate.ts`, `migration-publication-validation.ts`, `migrationPublicationService.ts` and real local/bare Git tests: full staged candidate, actual-byte and committed-object validation, isolated exact-base transaction, remote acceptance and lost-response recovery. Production readiness provider remains fixed/fail-closed.                                                                |
| Exact safety order                                     | **Original conflict, now resolved by faculty decision #44 above.** At audit time, #15/§3 required checkpoint before confirmations; #21/code required completed reviews and pure readiness first. Checkpoint preceded materialization; no unsafe writes were observed. An explicit faculty decision was required.                                                                                            |
| No grader desired role or membership-derived authority | Candidate serialization strips obsolete course/manifest fields and retains originals only as audit evidence. `grader-access-review.ts` requires explicit exact section decisions; planner/review/reconciliation tests reject inferred grants, preserve existing relationships and leave teams/members intact.                                                                                               |
| Recoverable old state                                  | `migration-checkpoint.ts` independently rereads the deterministic remote source tag; conflicts are never moved/deleted. Checkpoint and publication tests cover lost responses, conflicts, exact-source recoverability and checkpoint-before-workspace ordering. Source originals and machine-local limits remain explicit.                                                                                  |
| Publication identity revalidation                      | `migrationPublicationService.ts` re-enters retained review/grader/acknowledgement closures, observes account/repository/organization/source after awaits and repeats readiness/checkpoint checks before its durable push boundary. Integration assertions cover changed source, account, generation, review, bytes and paths.                                                                               |
| Incompatible/older-client gates                        | `remoteCourseAccess.ts`, `remoteCourseMetadataBackend.ts`, `managedCourseMutationGuard.ts`, `coursePublishService.ts` and CLI guards inspect authoritative schema/revision. `schemaDiscriminated*`, managed bridge/runtime safety and faculty/config tests cover immutable-ID v2 authority, unsupported schemas, stale v1 caches and zero downgrade writes. Unavailable operation families remain explicit. |
| Durable partial reconciliation                         | `migration-reconciliation*.ts`, `migrationReconciliationService.ts`: shared journal, immutable original publication/checkpoint, exact journal revision, creation guards, explicit fresh plans and independent current recovery authority. Tests exercise second-machine recovery, pending invitations, lost outcomes, one winning journal claim and permanent history; accepted v2 is not rolled back.      |
| Synthetic/no live automated tests                      | Inspected fictional snapshot builders, injected fake GitHub clients/transports and local/bare Git runners. Root Vitest excludes `tests/live` by default. No real credentials or live GitHub calls were needed or used. Technical evidence for successful publication remains test-module-only synthetic evidence.                                                                                           |
| Native/platform requirements                           | Baseline's five CI jobs passed, including both native migration jobs. **Fixture-isolation acceptance fails under controlled ambient signing configuration (#45)** despite standard suites passing; this is distinct from production runner isolation and #39's performance follow-up.                                                                                                                       |
| Canonical/faculty documentation                        | Faculty guide matches optional review/autosave, final warning/single acknowledgement, cancellation, distinct outcomes and explicit recovery/history. Current schema/setup status is reconciled in #15. **Original safety-order conflict is resolved under #44 above**; historical slice-local progress notes are explicitly historical.                                                                     |
| Required validation                                    | Standard root/UI checks and complete migration regressions are recorded below. An expected failing environmental reproduction establishes #45; green standard/native checks do not waive that requirement.                                                                                                                                                                                                  |
| Clean/pushed boundary                                  | Started clean at `adad3b4`; only these audit/status Markdown files are intended changes. Final clean-worktree, pushed commit and exact-head CI evidence belong in #15's audit comment, avoiding a self-referential commit claim here.                                                                                                                                                                       |

### Reproduced blocker and validation

#45's selected snapshot-reader scenario fails during fixture `git commit` when
modern Git is on PATH and a scratch `GIT_CONFIG_GLOBAL` enables signing through a
fictional unavailable signer. The identical PATH/scenario passes with signing
disabled in a second scratch config. No real configuration was edited. The host's
older PATH Git ignored this environment override, so its initial passing result
did not establish isolation. Diagnostic `-t` filtering deselected 13 other cases;
no declarations were skipped, focused, deleted or weakened in source.

Baseline [CI run 43024289622](https://github.com/msoecsse/graider/actions/runs/43024289622)
at `adad3b4` passed Normal checks, both Grading local boundary jobs and both
Migration regression jobs. Job steps independently confirmed native macOS arm64
and Windows x64 and complete migration-target execution. Audit documentation's
exact-head CI outcome is recorded in the final #15 comment.

Local validation uses Node 24.21.0 on native macOS arm64. Complete logs are outside
the worktree in `/private/tmp/graider-15-validation`.

| Command                                                                     | Local result                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:migration`                                                    | Passed: 32 root files / 878 tests; 24 UI files / 308 tests, zero skips. Includes test hygiene and generated backend bridges.                                                                                                 |
| `npm run typecheck`                                                         | Passed, including backend generation.                                                                                                                                                                                        |
| `npm run lint`                                                              | Passed; includes UI sources.                                                                                                                                                                                                 |
| `npm run format:check`                                                      | Passed; rerun after audit documentation edits.                                                                                                                                                                               |
| `npm test -- --maxWorkers=2` (root)                                         | Passed: 191 files / 3,059 tests, zero skips; test hygiene passed.                                                                                                                                                            |
| `npm run build`                                                             | Passed.                                                                                                                                                                                                                      |
| `npm run typecheck` (UI)                                                    | Passed, both renderer and Electron projects.                                                                                                                                                                                 |
| `npm run format:check` (UI)                                                 | Passed.                                                                                                                                                                                                                      |
| `npm test -- --maxWorkers=2` (UI)                                           | Passed with loopback permission: 226 files / 2,505 tests, zero skips. Initial sandbox run: 2,495 passed, ten OAuth loopback tests failed because local listener binding was denied.                                          |
| `npx vitest run electron/githubOAuth.test.ts` (UI, loopback permission)     | Passed: 41 tests, zero skips.                                                                                                                                                                                                |
| `npm run build` (UI)                                                        | Passed; existing chunk-size advisory retained.                                                                                                                                                                               |
| `git diff --check`; relative Markdown file links                            | Passed; 72 relative file links resolve.                                                                                                                                                                                      |
| Selected snapshot-reader scenario with scratch global signing configuration | Expected failure reproduces #45 with Git 2.53.0 on PATH; signing-disabled control passed. Host PATH Git 2.23.0 ignored the override and passed. Test-name filtering deselected 13 other cases in each diagnostic invocation. |

The initial UI listener failure and #45's deliberate environmental reproduction
are recorded separately; neither is hidden by the successful standard suites.
The existing PDF standard-font advisory remains visible in document tests.

### Disposition

#44's explicit faculty decision is now incorporated as described above; the original
audit did not choose that order itself. #45 still requires a separate focused
fixture fix. #15 must independently verify both resolutions and required validation
before Phase 9 can close. No Phase 10,
production migration, real-course operation, packaging/release or orchestrator
execution was started. #39 remains a separate performance follow-up; #41 is unchanged.
There are no adopted behavioral assumptions.

## Slice 9.5 closeout validation record (#26)

**Historical #26 handoff: Slice 9.5 was complete; #15 was next and had not started.**
This record supersedes the earlier blocked #26 closeout status. Production
migration remains disabled under the migration contract's independent technical,
Phase 3 and compatible production-release prerequisites. Native regression success
does not supply release/signing/distribution/update evidence.

### Acceptance review

The permanent coverage matrix above maps the required audit invariants to retained
tests. Final review confirms:

- Decision A staged publication is consistent across the migration contract,
  roadmap, architecture, schema design, lifecycle, layout and authorization
  contracts. Student identity, grading relocation and comment ownership remain
  preserved/deferred as specified; no Phase 10–14 behavior is claimed.
- Main-owned 9.1–9.4 artifacts compose through #21/#24/#25 without renderer
  authority. A verified immutable remote checkpoint precedes publication; complete
  candidate validation and fresh source/account/repository/organization and
  readiness checks guard the push boundary. Real local/bare Git tests cover
  conflicting refs, races, lost responses and isolated native paths/storage.
- Failed publication retains authoritative v1 and explicit freshly validated
  retries. Ambiguous outcomes require independent observation. Accepted v2 is
  preserved through synchronization/reconciliation failures. Restart journals,
  duplicate requests, interrupted operations and idempotent cross-machine
  recovery have deterministic fault-injection coverage.
- Schema 1/2 coexistence uses schema-discriminated discovery and operations;
  v2 authority uses immutable GitHub identity without username fallback.
  Unsupported newer schemas and stale legacy writes fail closed. The
  [managed-operation matrix](graider-schema-v2-migration.md#implemented-managed-operation-bridge-slice-95g)
  explicitly limits supported services and names later phases/dependencies for
  unavailable operations; policy alone cannot enable a writer.
- Grader desired state is removed; legacy cleanup follows verified replacement
  access. New remote courses emit v2. Standalone local folder preparation
  deliberately retains v1 under the approved setup contract; it cannot overwrite
  a v2 course. The faculty guide matches autosave, confirmation, checkpoint,
  stale-review, published Needs attention and explicit recovery behavior.
- The independently runnable permanent suite reuses #17 fixtures, bundled Git
  and synthetic local/bare repositories. GitHub failures are mocked; no live
  resources, credentials or real student data are used. Native architecture
  checks and complete regression jobs pass on both production targets. Future
  affected changes retain the workflow/development-contract requirement.

At #26 closeout, no unresolved Slice 9.5 acceptance blocker was recorded. The issue closeout comment
records final local commands/results, pushed documentation commit and its CI
verification after a clean-worktree check. #15's subsequent independent findings
and final resolution are recorded above; Phase 10 is not started and
orchestrator #41 is unchanged.

### Historical validation before the Windows fix

Permanent-suite implementation commit:
`0b85f5106724d639a3fcb45ed354c4791c09926e`.
[Initial CI evidence](https://github.com/msoecsse/graider/actions/runs/42911994389).

Local macOS arm64 validation passed: `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm test -- --maxWorkers=2` (3,054 tests),
`npm run build`, `npm --prefix ui run typecheck`, `npm --prefix ui test`
(2,505 tests), `npm --prefix ui run format:check`, and
`npm --prefix ui run build`. UI tests required local loopback socket permission;
the initial sandboxed run failed OAuth callback tests, which passed outside the
sandbox. The focused CI hardening suite passed all eight tests after adding
explicit bridge generation and prepared typechecks to the new native jobs.

`npm run test:migration` passed locally: 878 root tests in 32 files and 308 UI
tests in 24 files. CI normal checks, the complete native macOS arm64 migration
regression job and the macOS grading boundary job passed.

That run blocked closeout: the native Windows x64 migration job failed before
tests at the shared test-hygiene guard: TypeScript symbol resolution threw
`Cannot read properties of undefined (reading 'members')`. See
[blocker #43](https://github.com/msoecsse/graider/issues/43). The separate Windows
grading performance job failed at 2,055.68ms versus its 2,000ms budget, covered by
[existing #39](https://github.com/msoecsse/graider/issues/39).

### Successful native validation and blocker reconciliation

Fix commit `6e25c39342249877969da4fb0a7cad35dabe4908` closed #43 by normalizing
the compiler source filename and requiring a bound source before symbol lookup.
The test-hygiene guard was retained, with deterministic Windows-path regression
coverage; no guard bypass, skipped test or performance assertion change was added.

[CI run 42976549963](https://github.com/msoecsse/graider/actions/runs/42976549963)
passed all five jobs on that exact commit:

| Job                                                                                                                   | Result                                                                                      |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Normal checks                                                                                                         | Passed full root/UI typechecks, lint, formatting, tests, builds and dependency audit        |
| [Migration regression — macOS arm64](https://github.com/msoecsse/graider/actions/runs/42976549963/job/130376863299)   | Passed native verification, hygiene and complete suite: 878 root / 308 UI tests, zero skips |
| [Migration regression — Windows x64](https://github.com/msoecsse/graider/actions/runs/42976549963/job/130376863614)   | Passed native verification, hygiene and complete suite: 878 root / 308 UI tests, zero skips |
| [Grading local boundary — macOS arm64](https://github.com/msoecsse/graider/actions/runs/42976549963/job/130376863612) | Passed                                                                                      |
| [Grading local boundary — Windows x64](https://github.com/msoecsse/graider/actions/runs/42976549963/job/130376863672) | Passed with performance assertions intact                                                   |

The successful complete Windows suite resolves #43 and the earlier missing native
validation evidence. The successful Windows grading job clears that run's failed
closeout gate; it does not prove the intermittent timing problem is fixed.
[#39](https://github.com/msoecsse/graider/issues/39) stays open as a separate
performance reliability follow-up. Current evidence establishes no remaining
release blocker from #39. Its 2,000ms assertion and all other performance limits
remain unchanged. Future required validation failures still block affected merges
or releases; this closeout creates no exemption.

### Final local closeout validation

The documentation-only closeout reran full native macOS arm64 validation:
`npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm test -- --maxWorkers=2` (3,059 tests / 191 files), `npm run build`,
`npm --prefix ui run typecheck`, `npm --prefix ui run format:check`,
`npm test -- --maxWorkers=2` from `ui` (2,505 tests / 226 files),
`npm --prefix ui run build`, `npm run test:migration` (878 root / 308 UI tests)
and `git diff --check` passed. All complete successful suites reported zero skips.
No tests or assertions changed.

The initial sandboxed `npm --prefix ui test` passed 2,495 tests and failed ten
OAuth loopback callback tests. With local socket permission, focused
`npx vitest run electron/githubOAuth.test.ts` from `ui` passed all 41 tests,
then the full UI suite passed. Existing PDF standard-font and UI build chunk-size
warnings remain. Full logs were retained outside the worktree under
`/private/tmp/graider-26-closeout` for this local session.
