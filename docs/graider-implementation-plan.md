# Graider MVP Implementation Plan

Working title: **graider**  
Implementation stack: **TypeScript + Node.js LTS**  
Package manager: **npm**  
Test runner: **Vitest**

---

## 1. Purpose

This implementation plan breaks Graider MVP into small, test-first slices.

The goal is to support Codex-driven implementation prompts where each slice can be implemented, tested, reviewed, and committed independently.

Graider should be built in a way that is:

- safe to run against GitHub organizations
- testable without live GitHub access for most behavior
- deterministic in generated files
- maintainable after MVP
- easy to expand beyond MVP
- suitable for internal deployment through npm

---

## 2. Locked Implementation Decisions

| Area | Decision |
|---|---|
| Language | TypeScript |
| Runtime | Current Node.js LTS only |
| Package manager | npm with `package-lock.json` committed |
| CLI framework | Commander |
| Schema validation | Zod |
| GitHub API | Octokit behind `GitHubClient` |
| Test framework | Vitest |
| Linting | ESLint |
| Formatting | Prettier |
| Build | tsup |
| Module format | ESM |
| Manifest format | YAML |
| Plan format | JSON |
| Faculty report formats | Markdown, CSV, JSON |
| Student report format | Markdown |
| Published student JSON | `grading/results.json` |
| Student report publishing | GitHub Contents API |
| Archive command | Command shell initially returns `not_supported_in_mvp` |
| Remove-access command | Command shell initially returns `not_supported_in_mvp` |
| Live tests | Optional, gated, sandbox-only |
| Codex prompt strategy | Split larger slices further during implementation |

---

## 3. Implementation Strategy

Implementation should proceed in small, test-first slices.

Each slice should include:

| Field | Purpose |
|---|---|
| Goal | What the slice delivers |
| Deliverables | Files/modules expected |
| Behavior | User-visible and internal behavior |
| Tests first | Tests to write before implementation |
| Requirements covered | Requirement IDs or requirement groups |
| Done criteria | Conditions required before moving to next slice |

The preferred implementation loop is:

```text
write failing tests
implement minimum behavior
run tests
refactor
update docs if needed
commit
```

No slice should require live GitHub access unless explicitly marked as a live/sandbox slice.

---

## 4. Slice Overview

| Slice | Name | Main outcome |
|---:|---|---|
| 1 | Project Skeleton and CLI Shell | TypeScript/npm project with registered commands |
| 2 | Repository Root Discovery and Path Resolution | Course-admin root discovery and path helpers |
| 3 | Config Loading and Zod Schema Validation | Validate `course.yml`, `term.yml`, `assignment.yml` |
| 4 | Roster Loading, Normalization, and Validation | Load and validate section rosters |
| 5 | Diagnostics, Exit Codes, Redaction, and Output Formatting | Centralized command result/output behavior |
| 6 | GitHub Client Interface and Fake GitHub Client | Testable GitHub abstraction |
| 7 | GitHub Readiness Validation | Validate template/users/teams/workflows through fake client |
| 8 | Repository Naming and Source Hashing | Repo names, file hashes, input fingerprint |
| 9 | Plan Model and Plan Command | Deterministic `graider plan` |
| 10 | Manifest Model, Loader, Renderer, and Updater | YAML manifest support |
| 11 | Apply Execution | Safe additive provisioning through fake client |
| 12 | Retry, Rate Limit, and Timeout Handling | Robust GitHub failure behavior |
| 13 | Grading Result Validation and Status Mapping | Normalize grading statuses |
| 14 | Report Collection and Rendering | Local reports, no publishing |
| 15 | Student Report Publishing | Publish via GitHub Contents API |
| 16 | Grade Command | Workflow dispatch |
| 17 | Archive Command Shell | Unsupported command shell for MVP |
| 18 | Remove-Access Command Shell | Unsupported command shell for MVP |
| 19 | Octokit GitHub Client | Real GitHub client behind interface |
| 20 | Performance, Portability, and CI Hardening | Scale, CI, lint, audit |
| 21 | Documentation and Release Prep | User-facing docs and release readiness |

---

# Slice 1 — Project Skeleton and CLI Shell

## Goal

Create the npm-based TypeScript project structure and Commander CLI shell.

## Deliverables

```text
package.json
package-lock.json
tsconfig.json
vitest.config.ts
eslint.config.js
.prettierrc
.prettierignore
src/cli/index.ts
src/cli/commands/validate.command.ts
src/cli/commands/plan.command.ts
src/cli/commands/apply.command.ts
src/cli/commands/grade.command.ts
src/cli/commands/report.command.ts
src/cli/commands/archive.command.ts
src/cli/commands/remove-access.command.ts
src/core/exit-codes.ts
src/core/command-result.ts
src/core/command-context.ts
src/diagnostics/diagnostic.ts
src/diagnostics/error-catalog.ts
tests/cli/
tests/unit/
```

## Behavior

Stub commands:

```text
graider validate <assignment-file>
graider plan <assignment-file>
graider apply <assignment-file>
graider grade <assignment-file>
graider report <assignment-file>
graider archive <assignment-file>
graider remove-access <assignment-file>
```

Each command should:

- parse arguments
- accept common flags:
  - `--json`
  - `--verbose`
  - `--yes`
- return a placeholder `CommandResult`
- exit with the correct code
- not touch GitHub
- not read config yet

`archive` and `remove-access` may exist as command shells but should return a structured `not_supported_in_mvp` result until their behavior is explicitly implemented or re-enabled.

## Tests first

```text
TC-CLI-SHELL-001 command exists: validate
TC-CLI-SHELL-002 command exists: plan
TC-CLI-SHELL-003 command exists: apply
TC-CLI-SHELL-004 command exists: grade
TC-CLI-SHELL-005 command exists: report
TC-CLI-SHELL-006 command exists: archive
TC-CLI-SHELL-007 command exists: remove-access
TC-CLI-SHELL-008 unknown command exits nonzero
TC-CLI-SHELL-009 --json emits valid JSON placeholder output
TC-CLI-SHELL-010 archive returns not_supported_in_mvp
TC-CLI-SHELL-011 remove-access returns not_supported_in_mvp
```

## Requirements covered

- FR-CLI-001
- FR-CLI-002
- NFR-PORT-001
- NFR-PORT-003
- NFR-MAINT-012

## Done criteria

- `npm test` passes.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run format:check` passes.
- All MVP commands are registered.
- CLI can be run locally.
- No real GitHub access exists yet.

---

# Slice 2 — Repository Root Discovery and Path Resolution

## Goal

Implement course-admin repository root discovery and stable path handling.

## Deliverables

```text
src/core/paths.ts
src/core/repo-root.ts
tests/unit/repo-root.test.ts
tests/fixtures/path-resolution/
```

## Behavior

Graider should:

- find nearest parent directory containing `course.yml`
- support running from repo root
- support running from subdirectories
- resolve assignment file paths from current working directory
- render generated committed paths using forward slashes
- avoid absolute paths in generated file references

## Tests first

```text
TC-PATH-001 run from repo root finds course.yml
TC-PATH-002 run from subdirectory finds nearest parent course.yml
TC-PATH-003 missing course.yml returns missing_required_file
TC-PATH-004 assignment path resolves from cwd
TC-PATH-005 generated repo-relative paths use forward slashes
```

## Requirements covered

- NFR-PORT-005
- NFR-PORT-006
- NFR-PORT-007
- NFR-MAINT-003
- NFR-USE-015

## Done criteria

- CLI can create a command context with `repoRoot`, `cwd`, and resolved `assignmentPath`.
- Missing root produces a structured diagnostic.
- No schema loading yet.

---

# Slice 3 — Config Loading and Zod Schema Validation

## Goal

Load and validate `course.yml`, `term.yml`, and `assignment.yml`.

## Deliverables

```text
src/config/config-schemas.ts
src/config/config-models.ts
src/config/load-course-config.ts
src/config/load-term-config.ts
src/config/load-assignment-config.ts
src/config/config-validation.ts
src/io/file-system.ts
src/io/stable-yaml.ts
tests/unit/config/
tests/fixtures/config/
```

## Behavior

Validate:

- `schema_version`
- required `course.yml` fields
- required `term.yml` fields
- required `assignment.yml` fields
- term code format
- assignment slug/folder match
- assignment type is `individual`
- assignment lifecycle status
- grading inheritance
- grading disabled behavior
- grading override consistency

## Tests first

```text
TC-CONFIG-001 valid course config passes
TC-CONFIG-002 missing course.yml fails
TC-CONFIG-003 malformed YAML fails
TC-CONFIG-004 unsupported schema version fails
TC-CONFIG-005 invalid term code fails
TC-CONFIG-006 assignment slug/folder mismatch fails
TC-CONFIG-007 omitted grading block inherits course grading
TC-CONFIG-008 grading.enabled false disables grading
TC-CONFIG-009 partial grading override fails
TC-CONFIG-010 missing required term.yml field fails
TC-CONFIG-011 missing required assignment.yml field fails
```

## Requirements covered

- FR-CONFIG-001 through FR-CONFIG-007
- FR-CONFIG-010
- FR-CONFIG-011
- FR-SCOPE-001
- FR-SCOPE-003
- FR-LIFE-001

## Done criteria

- `graider validate` can validate local config files.
- Diagnostics use canonical codes.
- JSON output works for config validation.
- No roster or GitHub validation yet.

---

# Slice 4 — Roster Loading, Normalization, and Validation

## Goal

Load section rosters and validate all roster rules.

## Deliverables

```text
src/roster/roster-loader.ts
src/roster/roster-models.ts
src/roster/roster-validation.ts
src/roster/roster-normalization.ts
src/io/csv.ts
tests/unit/roster/
tests/fixtures/roster/
```

## Behavior

Validate:

- required columns
- required values
- valid statuses:
  - `active`
  - `dropped`
  - `hold`
- section consistency
- duplicate `student_id`
- duplicate `github_username`
- lowercase normalization with warnings
- GitHub username syntax

Do not validate GitHub username existence yet; that comes with the fake GitHub client.

## Tests first

```text
TC-ROSTER-001 valid roster passes
TC-ROSTER-002 missing required column fails
TC-ROSTER-003 missing required value fails
TC-ROSTER-004 invalid status fails
TC-ROSTER-005 section mismatch fails
TC-ROSTER-006 duplicate student ID fails
TC-ROSTER-007 duplicate GitHub username fails
TC-ROSTER-008 uppercase student ID warns and normalizes
TC-ROSTER-009 uppercase GitHub username warns and normalizes
TC-ROSTER-010 invalid GitHub username syntax fails
```

## Requirements covered

- FR-ROSTER-001 through FR-ROSTER-006
- FR-ROSTER-008 partially
- NFR-PRIV-001
- NFR-MAINT-007

## Done criteria

- `graider validate` validates config and roster.
- Normalized students are available for later planning.
- Section IDs preserve leading zeros.

---

# Slice 5 — Diagnostics, Exit Codes, Redaction, and Output Formatting

## Goal

Centralize command result handling before commands become complex.

## Deliverables

```text
src/diagnostics/error-catalog.ts
src/diagnostics/diagnostic.ts
src/diagnostics/redaction.ts
src/core/exit-codes.ts
src/core/command-result.ts
src/cli/output.ts
tests/unit/diagnostics/
tests/cli/output/
```

## Behavior

Implement:

- canonical diagnostic shape
- warning/error catalog
- redaction of token-like values
- exit code precedence
- human-readable output
- JSON output
- no stack traces in normal output

## Tests first

```text
TC-DIAG-001 warning shape includes code/message/severity
TC-DIAG-002 error shape includes code/message/severity
TC-DIAG-003 token-like values are redacted
TC-EXIT-001 warnings only exit 0
TC-EXIT-002 validation error exits 1
TC-EXIT-003 partial success exits 2
TC-EXIT-004 auth failure exits 3
TC-EXIT-005 API failure exits 4
TC-EXIT-006 schema failure exits 5
TC-EXIT-007 exit precedence is deterministic
```

## Requirements covered

- NFR-EXIT-001 through NFR-EXIT-010
- NFR-SEC-005
- NFR-SAFE-011
- NFR-OBS-001
- NFR-OBS-012
- NFR-MAINT-005

## Done criteria

- All commands return through one result formatter.
- All output paths use a shared formatting path.
- No command directly calls `process.exit` except the CLI entrypoint.

---

# Slice 6 — GitHub Client Interface and Fake GitHub Client

## Goal

Introduce GitHub abstraction without real GitHub calls.

## Deliverables

```text
src/github/github-client.ts
src/github/github-models.ts
src/github/fake-github-client.ts
src/github/github-errors.ts
src/github/github-retry.ts
tests/github/fake-github-client.test.ts
```

## Behavior

Fake client supports:

- users
- orgs
- teams
- repositories
- template repositories
- collaborators
- team permissions
- Actions state
- workflows
- workflow runs
- artifacts
- injectable failures

No Octokit implementation yet unless needed for interface shaping.

## Tests first

```text
TC-GITHUB-FAKE-001 returns existing repo
TC-GITHUB-FAKE-002 returns null for missing repo
TC-GITHUB-FAKE-003 simulates template repo
TC-GITHUB-FAKE-004 simulates user existence
TC-GITHUB-FAKE-005 simulates team existence
TC-GITHUB-FAKE-006 simulates collaborator permission
TC-GITHUB-FAKE-007 simulates workflow availability
TC-GITHUB-FAKE-008 simulates auth failure
TC-GITHUB-FAKE-009 simulates permission failure
TC-GITHUB-FAKE-010 simulates rate limit failure
```

## Requirements covered

- NFR-MAINT-004
- NFR-SEC-002
- NFR-MAINT-010
- NFR-MAINT-011

## Done criteria

- All later command tests can run against `FakeGitHubClient`.
- No command imports Octokit directly.

---

# Slice 7 — GitHub Readiness Validation

## Goal

Extend `validate` to check GitHub readiness through `GitHubClient`.

## Deliverables

```text
src/github/github-readiness-validation.ts
src/config/github-config-validation.ts
tests/cli/validate-github.test.ts
tests/fixtures/github-readiness/
```

## Behavior

Validate:

- token availability through client abstraction
- template repo exists
- template repo is in configured org
- template repo is marked as template
- template branch exists
- template branch is default branch
- template contains `README.md`
- configured faculty team exists
- configured grader team exists
- GitHub usernames exist

## Tests first

```text
TC-CLI-VALIDATE-004 invalid template fails
TC-ROSTER-011 GitHub username not found fails
TC-GH-READY-001 template repo exists passes
TC-GH-READY-002 template repo missing fails
TC-GH-READY-003 template outside org fails
TC-GH-READY-004 template not marked template fails
TC-GH-READY-005 template branch missing fails
TC-GH-READY-006 template branch not default fails
TC-GH-READY-007 README missing fails
TC-GH-READY-008 faculty team missing fails
TC-GH-READY-009 grader team missing fails
```

## Requirements covered

- FR-GH-001 through FR-GH-004
- FR-GH-009 partially
- FR-PERM-002
- FR-PERM-003
- FR-ROSTER-007
- NFR-SEC-010
- NFR-SEC-013

## Done criteria

- `graider validate` covers local config, roster, and GitHub readiness.
- Still no GitHub mutations.

---

# Slice 8 — Repository Naming and Source Hashing

## Goal

Implement deterministic repo naming, source hashes, and input fingerprinting.

## Deliverables

```text
src/planning/repo-name.ts
src/core/hash.ts
src/config/source-fingerprint.ts
tests/unit/repo-name.test.ts
tests/unit/source-fingerprint.test.ts
```

## Behavior

Implement:

- repo name generation from configured pattern
- lowercase values
- validation of generated repo name
- individual file hashes
- combined `input_fingerprint`
- deterministic path/hash ordering

## Tests first

```text
TC-REPO-NAME-001 generates 27s1-se2030-lab04-seanjones
TC-REPO-NAME-002 normalizes uppercase username before repo naming
TC-REPO-NAME-003 invalid generated repo name fails
TC-REPO-NAME-004 repo names are deterministic
TC-HASH-001 manifest includes separate source file hashes
TC-HASH-002 plan includes separate source file hashes
TC-HASH-003 manifest includes combined input fingerprint
TC-HASH-004 plan includes combined input fingerprint
TC-HASH-005 changing one roster changes that roster hash and fingerprint
TC-HASH-006 fingerprint is deterministic
```

## Requirements covered

- FR-GH-005
- NFR-AUDIT-002
- NFR-AUDIT-003 partially
- NFR-REL-009
- NFR-MAINT-008

## Done criteria

- Planning inputs can include generated repo names and source fingerprints.
- No plan output yet.

---

# Slice 9 — Plan Model and Plan Command

## Goal

Implement `graider plan`.

## Deliverables

```text
src/planning/plan-models.ts
src/planning/operation-models.ts
src/planning/operation-ordering.ts
src/planning/plan-builder.ts
src/planning/plan-renderer.ts
tests/cli/plan.test.ts
tests/unit/planning/
```

## Behavior

Plan supports:

- active students
- hold/dropped skips
- repo creation operations
- no-op existing manifest-tracked repos
- blocked repo collisions
- closed assignment no new repo creation
- archived assignment blocked/no-op plan
- deterministic ordering
- timestamped JSON plan output
- `--json` references generated plan file
- no GitHub mutations
- no manifest writes

## Tests first

```text
TC-CLI-PLAN-001 active assignment produces repo creation operations
TC-CLI-PLAN-002 hold student is skipped
TC-CLI-PLAN-003 dropped student is skipped
TC-CLI-PLAN-004 repo collision creates blocked operation
TC-CLI-PLAN-005 closed assignment blocks new repo creation
TC-CLI-PLAN-006 archived assignment produces blocked/no-op plan
TC-CLI-PLAN-007 plan file is written
TC-CLI-PLAN-008 --json references generated plan file
TC-CLI-PLAN-009 plan makes no GitHub mutations
TC-CLI-PLAN-010 repeated plans are equivalent except timestamps/operation IDs
```

## Requirements covered

- FR-CONFIG-009
- FR-CONFIG-013
- FR-CLI-004
- FR-GH-006
- FR-LIFE-003
- NFR-SAFE-007
- NFR-AUDIT-004
- NFR-AUDIT-012
- NFR-REL-009

## Done criteria

- `graider plan` is useful and safe.
- Plan files match schema contract.
- This is the first major MVP milestone.

---

# Slice 10 — Manifest Model, Loader, Renderer, and Updater

## Goal

Implement manifest structure before `apply`.

## Deliverables

```text
src/manifest/manifest-models.ts
src/manifest/manifest-loader.ts
src/manifest/manifest-renderer.ts
src/manifest/manifest-updater.ts
tests/unit/manifest/
tests/fixtures/manifest/
```

## Behavior

Support:

- manifest schema validation
- load existing manifest
- create new manifest model
- update repo records
- update permission records
- update lifecycle records
- preserve existing identity data
- stable YAML rendering
- deterministic student/repo ordering

## Tests first

```text
TC-CONFIG-012 invalid manifest structure fails when required
TC-MANIFEST-001 manifest includes required sections
TC-MANIFEST-002 manifest includes source file hashes
TC-MANIFEST-003 manifest includes input fingerprint
TC-MANIFEST-004 manifest renders deterministically
TC-MANIFEST-005 manifest preserves existing repo identity data
TC-MANIFEST-006 manifest updates lifecycle fields
```

## Requirements covered

- FR-CONFIG-008
- FR-CONFIG-012
- NFR-AUDIT-001
- NFR-AUDIT-010
- NFR-PRIV-010
- NFR-MAINT-014

## Done criteria

- Manifest can be read/written independently.
- `apply` can use updater safely in the next slice.

---

# Slice 11 — Apply Execution

## Goal

Implement safe additive provisioning.

## Deliverables

```text
src/execution/apply-executor.ts
src/execution/mutation-guard.ts
tests/cli/apply.test.ts
tests/recovery/apply-recovery.test.ts
```

## Behavior

Implement:

- compute plan internally
- refuse any blocked operation
- confirmation handling
- non-interactive `--yes`
- create repo from template
- add student collaborator
- add faculty team permission
- add grader team permission
- enable/verify Actions
- update manifest incrementally
- idempotent rerun
- no delete/archive/remove/downgrade
- partial failure handling
- interruption recovery behavior

## Tests first

```text
TC-CLI-APPLY-001 active assignment creates expected repos
TC-CLI-APPLY-002 re-running apply is no-op
TC-CLI-APPLY-003 blocked plan prevents all GitHub mutations
TC-CLI-APPLY-004 closed assignment repairs existing manifest-tracked repos only
TC-CLI-APPLY-005 draft assignment blocks apply
TC-CLI-APPLY-006 archived assignment blocks apply
TC-CLI-APPLY-007 manifest is updated incrementally
TC-CLI-APPLY-008 confirmation required unless --yes
TC-CLI-APPLY-009 non-interactive apply without --yes fails before mutations
TC-CLI-APPLY-010 unexpected collaborators are left unchanged and warned
TC-RECOVERY-001 interrupted after repo creation and manifest update reruns no-op
TC-RECOVERY-002 interrupted before manifest update reruns collision
```

## Requirements covered

- FR-CLI-005
- FR-GH-001 through FR-GH-009
- FR-PERM-001 through FR-PERM-005
- FR-LIFE-003
- NFR-REL-001
- NFR-REL-004
- NFR-REL-007
- NFR-SAFE-005
- NFR-SAFE-006
- NFR-SAFE-009

## Done criteria

- `apply` can provision via fake GitHub client safely.
- Re-running is safe.
- Manifest state is durable enough for recovery.

---

# Slice 12 — Retry, Rate Limit, and Timeout Handling

## Goal

Add robust GitHub failure handling around the client/execution layer.

## Deliverables

```text
src/github/github-retry.ts
src/github/github-rate-limit.ts
src/github/github-errors.ts
tests/github/retry.test.ts
tests/recovery/retry-rate-limit.test.ts
```

## Behavior

Implement:

- retry count `3`
- exponential backoff
- honor `Retry-After`
- retry GitHub 5xx
- retry network timeouts
- retry temporary network failures
- do not retry validation/auth/permission/repo collision errors
- proper exit codes

## Tests first

```text
TC-RECOVERY-003 rate limit occurs mid-apply; completed work recorded
TC-RECOVERY-005 retryable GitHub 5xx succeeds on retry
TC-RECOVERY-006 retryable GitHub 5xx exhausts retries and exits 4
TC-RECOVERY-007 permission denied is not retried as transient
TC-RECOVERY-008 network timeout succeeds after retry
TC-RECOVERY-009 systemic auth failure stops command
TC-RECOVERY-010 config error stops before GitHub mutation
```

## Requirements covered

- NFR-REL-005
- NFR-REL-006
- NFR-PERF-003
- NFR-PERF-011
- NFR-OBS-007
- NFR-OBS-008
- NFR-EXIT-005
- NFR-EXIT-006

## Done criteria

- Execution code uses retry wrapper consistently.
- Failure behavior is deterministic and tested.

---

# Slice 13 — Grading Result Validation and Status Mapping

## Goal

Implement parsing and validation of grading artifacts/results.

## Deliverables

```text
src/grading/grading-result-models.ts
src/grading/grading-result-validator.ts
src/grading/grading-status-mapper.ts
tests/unit/grading/
```

## Behavior

Validate:

- `grading-results.json` schema
- allowed grading statuses
- empty checks allowed
- no raw logs required
- map GitHub workflow/artifact/result state into report statuses

## Tests first

```text
TC-CONFIG-014 invalid report status value fails validation
TC-GRADING-001 valid passed result validates
TC-GRADING-002 valid failed result validates
TC-GRADING-003 valid result with empty checks validates
TC-GRADING-004 missing result file maps missing_result_file
TC-GRADING-005 invalid result file maps invalid_result_file
TC-GRADING-006 grading disabled maps not_configured
TC-GRADING-007 workflow missing maps missing_workflow
TC-GRADING-008 workflow failed no results maps workflow_failed_no_results
```

## Requirements covered

- FR-GRADE-001 through FR-GRADE-003
- FR-REPORT-006
- NFR-SAFE-015
- NFR-USE-011

## Done criteria

- Report collection can rely on normalized grading statuses.

---

# Slice 14 — Report Collection and Rendering

## Goal

Implement `graider report` without publishing to student repos first.

## Deliverables

```text
src/reporting/report-models.ts
src/reporting/report-collector.ts
src/reporting/faculty-json-renderer.ts
src/reporting/faculty-csv-renderer.ts
src/reporting/faculty-markdown-renderer.ts
src/reporting/student-markdown-renderer.ts
tests/cli/report.test.ts
tests/reporting/
```

## Behavior

Implement:

- require manifest
- collect repo/submission/grading state through fake GitHub client
- generate `faculty-summary.json`
- generate `faculty-summary.csv`
- generate `faculty-summary.md`
- generate student Markdown reports by section
- overwrite existing reports
- do not publish to student repos
- no raw logs
- include warnings/errors/statuses

## Tests first

```text
TC-CLI-REPORT-001 missing manifest fails
TC-CLI-REPORT-002 generates Markdown, CSV, and JSON faculty reports
TC-CLI-REPORT-003 generates student Markdown reports split by section
TC-CLI-REPORT-004 grading disabled reports not_configured
TC-CLI-REPORT-005 missing artifact reports missing_artifact
TC-CLI-REPORT-006 invalid result file reports invalid_result_file
TC-CLI-REPORT-007 report without publish flag does not commit to student repos
TC-CLI-REPORT-009 report files overwrite current paths
TC-CLI-REPORT-010 --json references generated report paths
TC-REPORT-FACULTY-001 through TC-REPORT-FACULTY-010
TC-REPORT-STUDENT-001 through TC-REPORT-STUDENT-008
```

## Requirements covered

- FR-CLI-007
- FR-REPORT-001 through FR-REPORT-004
- FR-REPORT-006
- NFR-PRIV-005 through NFR-PRIV-008
- NFR-OBS-013

## Done criteria

- Faculty and student reports are generated locally and deterministically.
- Student reports do not leak other students’ data.

---

# Slice 15 — Student Report Publishing

## Goal

Implement `report --publish-student-reports`.

## Deliverables

```text
src/reporting/student-results-json-renderer.ts
src/execution/report-publisher.ts
tests/cli/report-publish.test.ts
tests/reporting/published-student-report.test.ts
```

## Behavior

Implement:

- explicit publish flag required
- commit through GitHub Contents API via `GitHubClient`
- publish only:
  - `grading/report.md`
  - `grading/results.json`
- single-student data only
- normalized JSON, not raw artifact copy
- overwrite current paths
- per-student publish failures

## Tests first

```text
TC-CLI-REPORT-008 publish flag writes student repo report files
TC-REPORT-PUBLISH-001 published grading/report.md contains target student only
TC-REPORT-PUBLISH-002 published grading/results.json contains target student only
TC-REPORT-PUBLISH-003 published JSON is normalized Graider data, not raw artifact copy
TC-REPORT-PUBLISH-004 published files do not include faculty summary
TC-REPORT-PUBLISH-005 published files overwrite current paths
```

## Requirements covered

- FR-CLI-008
- FR-REPORT-005
- NFR-SAFE-010
- NFR-SEC-008
- NFR-PRIV-011

## Done criteria

- Student repo publishing is explicit, isolated, and tested.

---

# Slice 16 — Grade Command

## Goal

Implement manual workflow dispatch.

## Deliverables

```text
src/execution/grade-executor.ts
src/core/target-selector.ts
tests/cli/grade.test.ts
```

## Behavior

Implement:

- exactly one target selector required
- support:
  - `--all`
  - `--section`
  - `--student-id`
  - `--github-username`
- lifecycle gating
- grading disabled behavior
- workflow exists check
- workflow dispatch support check
- trigger workflow dispatch
- per-repo partial success

## Tests first

```text
TC-CLI-GRADE-001 missing target selector fails
TC-CLI-GRADE-002 multiple target selectors fail
TC-CLI-GRADE-003 --all targets expected active students
TC-CLI-GRADE-004 --section targets expected section students
TC-CLI-GRADE-005 --student-id targets expected student
TC-CLI-GRADE-006 --github-username targets expected student
TC-CLI-GRADE-007 grading disabled fails cleanly
TC-CLI-GRADE-008 missing workflow handled with canonical code
TC-CLI-GRADE-009 workflow dispatch triggered when available
TC-CLI-GRADE-010 draft and archived assignments block grade
```

## Requirements covered

- FR-CLI-006
- FR-GRADE-001
- FR-LIFE-004
- NFR-SAFE-004
- NFR-SAFE-015
- NFR-USE-010

## Done criteria

- `grade` triggers dispatch through fake client.
- No report or provisioning side effects.

---

# Slice 17 — Archive Command Shell

## Goal

Keep the `archive` command present but unsupported until lifecycle mutation is intentionally implemented.

## Deliverables

```text
src/cli/commands/archive.command.ts
tests/cli/archive-unsupported.test.ts
```

## Behavior

Implement:

- command exists
- parses assignment path and flags
- returns structured diagnostic:
  - `not_supported_in_mvp`
- performs no GitHub mutations
- performs no file writes
- exits with command/validation error code `1`

## Tests first

```text
TC-CLI-ARCHIVE-UNSUPPORTED-001 archive command exists
TC-CLI-ARCHIVE-UNSUPPORTED-002 archive returns not_supported_in_mvp
TC-CLI-ARCHIVE-UNSUPPORTED-003 archive performs no GitHub mutation
TC-CLI-ARCHIVE-UNSUPPORTED-004 archive exits with code 1
```

## Requirements covered

- FR-CLI-009 partially
- NFR-SAFE-001
- NFR-SAFE-002
- NFR-SAFE-003

## Done criteria

- Users get a clear unsupported message.
- Command shape remains reserved for future implementation.

---

# Slice 18 — Remove-Access Command Shell

## Goal

Keep the `remove-access` command present but unsupported until access-removal mutation is intentionally implemented.

## Deliverables

```text
src/cli/commands/remove-access.command.ts
tests/cli/remove-access-unsupported.test.ts
```

## Behavior

Implement:

- command exists
- parses assignment path and flags
- returns structured diagnostic:
  - `not_supported_in_mvp`
- performs no GitHub mutations
- performs no file writes
- exits with command/validation error code `1`

## Tests first

```text
TC-CLI-REMOVE-UNSUPPORTED-001 remove-access command exists
TC-CLI-REMOVE-UNSUPPORTED-002 remove-access returns not_supported_in_mvp
TC-CLI-REMOVE-UNSUPPORTED-003 remove-access performs no GitHub mutation
TC-CLI-REMOVE-UNSUPPORTED-004 remove-access exits with code 1
```

## Requirements covered

- FR-CLI-010 partially
- NFR-SAFE-002
- NFR-SAFE-003
- NFR-SEC-012

## Done criteria

- Users get a clear unsupported message.
- Command shape remains reserved for future implementation.

---

# Slice 19 — Octokit GitHub Client

## Goal

Implement real GitHub API access behind `GitHubClient`.

## Deliverables

```text
src/github/octokit-github-client.ts
tests/live/
```

## Behavior

Implement:

- environment token lookup:
  - `GRAIDER_GITHUB_TOKEN`
  - `GITHUB_TOKEN`
- authenticated user check
- repository/template lookup
- create from template
- user lookup
- team lookup
- collaborator permission
- add/remove collaborator
- team permission
- Actions state
- workflow lookup/dispatch
- artifact download
- archive repo support can remain uncalled while command is unsupported
- remove collaborator support can remain uncalled while command is unsupported
- GitHub Contents API write support for student report publishing
- error normalization
- retry wrapper integration

## Tests first

Use unit tests with mocked Octokit where possible, plus optional live tests.

```text
TC-LIVE-001 validate real template repo
TC-LIVE-002 create one student repo from template
TC-LIVE-003 add test student collaborator
TC-LIVE-004 add faculty/grader test teams
TC-LIVE-005 trigger workflow dispatch
TC-LIVE-006 read workflow run/artifact
TC-LIVE-007 publish student report to sandbox repo
TC-LIVE-008 archive test repo
TC-LIVE-009 remove test collaborator
TC-LIVE-010 verify cleanup process
```

## Requirements covered

- NFR-SEC-001
- NFR-SEC-003
- NFR-SEC-004
- NFR-SEC-016
- most GitHub-facing functional requirements under live/sandbox validation

## Done criteria

- Real client works in sandbox when explicitly enabled.
- Normal tests still run without GitHub token.

---

# Slice 20 — Performance, Portability, and CI Hardening

## Goal

Finalize MVP operational confidence.

## Deliverables

```text
.github/workflows/ci.yml
tests/performance/
docs/runtime.md
```

## Behavior

Implement/test:

- 150 active students with fake client
- 500 roster rows
- bounded concurrency if enabled
- deterministic output under scale
- CI jobs:
  - install
  - typecheck
  - lint
  - format check
  - unit tests
  - fixture CLI tests
  - mock GitHub tests
  - report rendering tests
  - dependency audit
- optional live GitHub job gated

## Tests first

```text
TC-PERF-001 150 active students plan/apply fake state
TC-PERF-002 500 roster row validation
TC-PERF-003 deterministic output under scale
TC-PORT-001 run from repo root
TC-PORT-002 run from subdirectory
TC-PORT-003 env token lookup
TC-PORT-004 no GitHub CLI auth required
```

## Requirements covered

- NFR-PERF-001 through NFR-PERF-015
- NFR-PORT-001 through NFR-PORT-015
- NFR-OBS-001 through NFR-OBS-015

## Done criteria

- CI passes without live GitHub.
- Performance tests use fake GitHub state.
- Live tests are explicitly gated.
- npm audit or equivalent dependency check is part of CI.

---

# Slice 21 — Documentation and Release Prep

## Goal

Prepare MVP for real faculty use.

## Deliverables

```text
README.md
docs/graider_complete_requirements.md
docs/graider-test-plan.md
docs/graider-traceability-matrix.md
docs/graider-architecture.md
docs/graider-implementation-plan.md
docs/github-token-permissions.md
docs/error-warning-catalog.md
docs/examples/
```

## Behavior

Document:

- install
- command examples
- course-admin repo layout
- config examples
- token permissions
- live test safety
- troubleshooting
- generated files
- known MVP exclusions
- unsupported MVP command shells:
  - `archive`
  - `remove-access`

## Requirements covered

- NFR-USE-014
- NFR-PORT-012
- NFR-SEC-016
- NFR-PRIV-012
- NFR-EXIT-010
- NFR-MAINT-013

## Done criteria

- A new user can set up a sandbox course and run validate/plan/apply/report from docs.
- MVP exclusions are clear.
- Token setup is clear.
- Unsupported command behavior is clear.

---

## 5. Large Slice Splitting Guidance

Some slices should likely be split into smaller Codex prompts during implementation.

### Slice 11 — Apply Execution

Suggested Codex splits:

1. confirmation and mutation guard
2. repo creation execution
3. permission execution
4. manifest incremental update
5. idempotency and recovery cases

### Slice 14 — Report Collection and Rendering

Suggested Codex splits:

1. canonical report model
2. faculty JSON renderer
3. faculty CSV renderer
4. faculty Markdown renderer
5. student Markdown renderer
6. report CLI orchestration

### Slice 19 — Octokit GitHub Client

Suggested Codex splits:

1. token/auth and repo lookup
2. template repo operations
3. collaborator/team permissions
4. Actions/workflow/artifacts
5. Contents API publishing
6. optional live sandbox tests

---

## 6. Recommended First Codex Prompt Target

The first Codex implementation prompt should target:

```text
Slice 1 — Project Skeleton and CLI Shell
```

It should ask Codex to:

- initialize the TypeScript/npm project
- configure TypeScript strict mode
- add Commander
- add Vitest
- add ESLint and Prettier
- add placeholder commands
- add command result and exit code basics
- add tests proving commands exist and JSON output works
- ensure `npm test`, `npm run typecheck`, `npm run lint`, and `npm run format:check` pass

Do not ask Codex to implement config loading, GitHub access, or command business logic in the first prompt.

---

## 7. Open Items

No blocking architecture decisions remain before Slice 1.

Implementation details that can be resolved during coding:

- exact ESLint config style
- exact Prettier line width
- exact Zod error formatting structure
- exact stable YAML emitter options
- exact timestamped filename format
- exact fixture naming conventions
- whether to implement local logs before or after plan/apply
