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

Real Git fixtures use bundled Git with isolated configuration and synthetic local
repositories, including paths with spaces. Check native architecture, Node version,
dependency installation and subprocess/file-lock errors when diagnosing platform
failures. Do not replace bundled Git, add credentials, skip tests or weaken assertions.
Capture complete logs outside the worktree; distinguish assertion failures from
resource contention and retain all failure details.

## Slice 9.5 closeout validation record (#26)

**Slice 9.5 is complete. Phase 9 audit #15 is next and has not started.**
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

No unresolved Slice 9.5 acceptance blocker remains. The issue closeout comment
records final local commands/results, pushed documentation commit and its CI
verification after a clean-worktree check. #15 is a separate audit, not started
by this review; Phase 10 is not started and orchestrator #41 is unchanged.

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
