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
