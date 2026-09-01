# Graider MVP Test Plan

## 1. Purpose

This test plan defines the testing approach for Graider MVP.

The goals are to verify that Graider:

- satisfies the formal requirements
- is safe to run against real GitHub organizations
- is reliable across partial failures and reruns
- produces deterministic generated files
- protects tokens and student data
- can be tested mostly without live GitHub access

Most tests should run locally and deterministically without GitHub credentials. Live GitHub tests are included, but they must be optional, explicitly gated, and limited to one or two small sandbox repositories.

---

## 2. Test Strategy

Graider shall be tested primarily with local fixtures and mocked GitHub state.

| Test type                  | Purpose                                                                      | Requires live GitHub? |
| -------------------------- | ---------------------------------------------------------------------------- | --------------------: |
| Unit tests                 | Validate small logic units                                                   |                    No |
| Fixture-based CLI tests    | Run CLI commands against local fake course-admin repos                       |                    No |
| Mock GitHub tests          | Simulate GitHub repositories, users, teams, Actions, artifacts, and failures |                    No |
| Report rendering tests     | Verify generated Markdown, CSV, and JSON reports                             |                    No |
| Contract/schema tests      | Verify file schemas, required sections, and closed status vocabularies       |                    No |
| Failure/recovery tests     | Verify retries, interruption handling, partial success, and safe reruns      |                    No |
| Performance/scale tests    | Verify behavior for target class sizes using mocked GitHub state             |                    No |
| Optional live GitHub tests | Verify real GitHub API behavior in a sandbox                                 |                   Yes |
| Manual acceptance tests    | Final sanity check with a sandbox course setup                               |                   Yes |

Key testing principle:

> Most tests must be deterministic and runnable without live GitHub access. Live GitHub tests are valuable, but they must be deliberate, isolated, and sandboxed.

---

## 3. Test Environments

### 3.1 Local developer environment

Used for:

- unit tests
- schema/config validation tests
- CLI command tests
- mocked GitHub tests
- report rendering tests
- failure/recovery tests

Requirements:

- No real GitHub token required for most tests.
- Tests use local fixture files.
- Tests use mocked GitHub clients for remote state.

---

### 3.2 CI environment

Used for:

- automated unit tests
- fixture-based CLI tests
- mocked GitHub tests
- schema validation tests
- report rendering tests
- performance/scale tests with mocked GitHub state

Requirements:

- No real GitHub token required by default.
- Live GitHub tests are skipped unless explicitly enabled.
- Non-interactive command tests use `--yes` when testing mutating command paths.

---

### 3.3 Optional live GitHub test environment

Used for:

- validating real GitHub API interactions
- repository creation smoke tests
- permission smoke tests
- workflow dispatch smoke tests
- artifact/report retrieval smoke tests

Requirements:

- Must use a dedicated sandbox organization or sandbox repository set.
- Must never run against production course repositories by default.
- Must be explicitly enabled.
- Must use one or two small sandbox repositories, not hundreds of live repositories.
- Must use disposable test resources where practical.

Suggested gate:

```text
GRAIDER_RUN_LIVE_GITHUB_TESTS=true
```

---

## 4. Test Data and Fixtures

Fixture course-admin repositories should live under a test fixture directory such as:

```text
tests/fixtures/
  valid-course/
  invalid-course-missing-course-yml/
  invalid-course-bad-yaml/
  invalid-term-code/
  invalid-assignment-slug-mismatch/
  invalid-roster-duplicate-student/
  invalid-roster-duplicate-github/
  invalid-roster-section-mismatch/
  invalid-roster-missing-column/
  assignment-grading-disabled/
  assignment-grading-enabled/
  assignment-draft/
  assignment-active/
  assignment-closed/
  assignment-archived/
  existing-manifest/
  missing-manifest/
  report-valid-results/
  report-missing-artifact/
  report-invalid-result-file/
  repo-collision/
```

Fixtures should be:

- small
- readable
- deterministic
- focused on one scenario when practical

---

## 5. Unit Test Areas

### 5.1 Configuration loading and validation

Test coverage:

- `course.yml` required fields
- `term.yml` required fields
- `assignment.yml` required fields
- malformed YAML
- unsupported `schema_version`
- term code format
- assignment slug/folder mismatch
- grading inheritance
- grading disabled behavior
- partial grading override errors
- manifest required sections
- plan required sections
- closed report status vocabularies

Example test cases:

| Test ID         | Description                                                    |
| --------------- | -------------------------------------------------------------- |
| `TC-CONFIG-001` | Valid course config passes                                     |
| `TC-CONFIG-002` | Missing `course.yml` fails with `missing_required_file`        |
| `TC-CONFIG-003` | Malformed YAML fails with `invalid_yaml`                       |
| `TC-CONFIG-004` | Unsupported schema version fails with `invalid_schema_version` |
| `TC-CONFIG-005` | Invalid term code fails with `invalid_term_code`               |
| `TC-CONFIG-006` | Assignment slug/folder mismatch fails                          |
| `TC-CONFIG-007` | Omitted grading block inherits course grading                  |
| `TC-CONFIG-008` | `grading.enabled: false` disables grading                      |
| `TC-CONFIG-009` | Partial grading override fails                                 |
| `TC-CONFIG-010` | Missing required `term.yml` field fails                        |
| `TC-CONFIG-011` | Missing required `assignment.yml` field fails                  |
| `TC-CONFIG-012` | Invalid manifest structure fails when manifest is required     |
| `TC-CONFIG-013` | Invalid plan structure fails schema/contract validation        |
| `TC-CONFIG-014` | Invalid report status value fails validation                   |

---

### 5.2 Roster validation

Test coverage:

- required columns
- required values
- valid statuses
- invalid statuses
- section mismatch
- duplicate student ID
- duplicate GitHub username
- lowercase normalization
- GitHub username syntax
- GitHub username existence through mocked GitHub client

Example test cases:

| Test ID         | Description                                    |
| --------------- | ---------------------------------------------- |
| `TC-ROSTER-001` | Valid roster passes                            |
| `TC-ROSTER-002` | Missing required column fails                  |
| `TC-ROSTER-003` | Missing required value fails                   |
| `TC-ROSTER-004` | Invalid status fails                           |
| `TC-ROSTER-005` | Section mismatch fails                         |
| `TC-ROSTER-006` | Duplicate student ID fails                     |
| `TC-ROSTER-007` | Duplicate GitHub username fails                |
| `TC-ROSTER-008` | Uppercase student ID warns and normalizes      |
| `TC-ROSTER-009` | Uppercase GitHub username warns and normalizes |
| `TC-ROSTER-010` | Invalid GitHub username syntax fails           |
| `TC-ROSTER-011` | GitHub username not found fails                |

---

### 5.3 Repository naming

Test coverage:

- configured pattern interpolation
- lowercase normalized username
- lowercase normalized course/term/assignment values
- invalid generated repo name
- deterministic generation

Example test cases:

| Test ID            | Description                                      |
| ------------------ | ------------------------------------------------ |
| `TC-REPO-NAME-001` | Generates `27s1-se2030-lab04-seanjones`          |
| `TC-REPO-NAME-002` | Normalizes uppercase username before repo naming |
| `TC-REPO-NAME-003` | Invalid generated repo name fails                |
| `TC-REPO-NAME-004` | Repo names are deterministic for same inputs     |

---

### 5.4 Source hashing and input fingerprinting

Test coverage:

- individual source file hashes
- combined input fingerprint
- changed input changes hash
- changed input changes fingerprint
- stable ordering of fingerprint inputs

Example test cases:

| Test ID       | Description                                                        |
| ------------- | ------------------------------------------------------------------ |
| `TC-HASH-001` | Manifest includes separate source file hashes                      |
| `TC-HASH-002` | Plan includes separate source file hashes                          |
| `TC-HASH-003` | Manifest includes combined input fingerprint                       |
| `TC-HASH-004` | Plan includes combined input fingerprint                           |
| `TC-HASH-005` | Changing one roster changes that roster hash and input fingerprint |
| `TC-HASH-006` | Fingerprint is deterministic for same ordered path/hash inputs     |

---

## 6. Fixture-Based CLI Test Areas

Fixture-based CLI tests execute Graider commands against local fixture course-admin repositories with a mocked GitHub client.

### 6.1 `validate`

Test cases:

| Test ID               | Description                                         |
| --------------------- | --------------------------------------------------- |
| `TC-CLI-VALIDATE-001` | Valid assignment validates successfully             |
| `TC-CLI-VALIDATE-002` | Missing config fails                                |
| `TC-CLI-VALIDATE-003` | Invalid roster fails                                |
| `TC-CLI-VALIDATE-004` | Invalid template fails                              |
| `TC-CLI-VALIDATE-005` | Grading disabled validates without workflow warning |
| `TC-CLI-VALIDATE-006` | `--json` outputs structured validation results      |
| `TC-CLI-VALIDATE-007` | `validate` makes no GitHub mutations                |
| `TC-CLI-VALIDATE-008` | Running from subdirectory discovers course root     |

---

### 6.2 `plan`

Test cases:

| Test ID           | Description                                                   |
| ----------------- | ------------------------------------------------------------- |
| `TC-CLI-PLAN-001` | Active assignment produces repo creation operations           |
| `TC-CLI-PLAN-002` | Hold student is skipped                                       |
| `TC-CLI-PLAN-003` | Dropped student is skipped                                    |
| `TC-CLI-PLAN-004` | Repo collision creates blocked operation                      |
| `TC-CLI-PLAN-005` | Closed assignment blocks new repo creation                    |
| `TC-CLI-PLAN-006` | Archived assignment produces blocked/no-op plan               |
| `TC-CLI-PLAN-007` | Plan file is written                                          |
| `TC-CLI-PLAN-008` | `--json` references generated plan file                       |
| `TC-CLI-PLAN-009` | `plan` makes no GitHub mutations                              |
| `TC-CLI-PLAN-010` | Repeated plans are equivalent except timestamps/operation IDs |

---

### 6.3 `apply`

Test cases:

| Test ID            | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `TC-CLI-APPLY-001` | Active assignment creates expected repos                       |
| `TC-CLI-APPLY-002` | Re-running `apply` is no-op for existing state                 |
| `TC-CLI-APPLY-003` | Blocked plan prevents all GitHub mutations                     |
| `TC-CLI-APPLY-004` | Closed assignment repairs existing manifest-tracked repos only |
| `TC-CLI-APPLY-005` | Draft assignment blocks apply                                  |
| `TC-CLI-APPLY-006` | Archived assignment blocks apply                               |
| `TC-CLI-APPLY-007` | Manifest is updated incrementally                              |
| `TC-CLI-APPLY-008` | Confirmation required unless `--yes`                           |
| `TC-CLI-APPLY-009` | Non-interactive apply without `--yes` fails before mutations   |

---

### 6.4 `grade`

Test cases:

| Test ID            | Description                                   |
| ------------------ | --------------------------------------------- |
| `TC-CLI-GRADE-001` | Missing target selector fails                 |
| `TC-CLI-GRADE-002` | Multiple target selectors fail                |
| `TC-CLI-GRADE-003` | `--all` targets expected active students      |
| `TC-CLI-GRADE-004` | `--section` targets expected section students |
| `TC-CLI-GRADE-005` | `--student-id` targets expected student       |
| `TC-CLI-GRADE-006` | `--github-username` targets expected student  |
| `TC-CLI-GRADE-007` | Grading disabled fails cleanly                |
| `TC-CLI-GRADE-008` | Missing workflow handled with canonical code  |
| `TC-CLI-GRADE-009` | Workflow dispatch triggered when available    |
| `TC-CLI-GRADE-010` | Draft and archived assignments block grade    |

---

### 6.5 `report`

Test cases:

| Test ID             | Description                                                  |
| ------------------- | ------------------------------------------------------------ |
| `TC-CLI-REPORT-001` | Missing manifest fails                                       |
| `TC-CLI-REPORT-002` | Generates Markdown, CSV, and JSON faculty reports            |
| `TC-CLI-REPORT-003` | Generates student Markdown reports split by section          |
| `TC-CLI-REPORT-004` | Grading disabled reports `not_configured`                    |
| `TC-CLI-REPORT-005` | Missing artifact reports `missing_artifact`                  |
| `TC-CLI-REPORT-006` | Invalid result file reports `invalid_result_file`            |
| `TC-CLI-REPORT-007` | Report without publish flag does not commit to student repos |
| `TC-CLI-REPORT-008` | Publish flag writes student repo report files                |
| `TC-CLI-REPORT-009` | Report files overwrite current paths                         |
| `TC-CLI-REPORT-010` | `--json` references generated report paths                   |

---

### 6.6 `archive`

Test cases:

| Test ID              | Description                               |
| -------------------- | ----------------------------------------- |
| `TC-CLI-ARCHIVE-001` | Missing target selector fails             |
| `TC-CLI-ARCHIVE-002` | Multiple target selectors fail            |
| `TC-CLI-ARCHIVE-003` | Confirmation required unless `--yes`      |
| `TC-CLI-ARCHIVE-004` | Active repo is archived                   |
| `TC-CLI-ARCHIVE-005` | Already archived repo is no-op            |
| `TC-CLI-ARCHIVE-006` | Faculty/grader access is preserved        |
| `TC-CLI-ARCHIVE-007` | Draft assignment blocks archive           |
| `TC-CLI-ARCHIVE-008` | Archive updates manifest lifecycle fields |

---

### 6.7 `remove-access`

Test cases:

| Test ID             | Description                                     |
| ------------------- | ----------------------------------------------- |
| `TC-CLI-REMOVE-001` | Missing target selector fails                   |
| `TC-CLI-REMOVE-002` | Multiple target selectors fail                  |
| `TC-CLI-REMOVE-003` | Confirmation required unless `--yes`            |
| `TC-CLI-REMOVE-004` | Student collaborator is removed                 |
| `TC-CLI-REMOVE-005` | Already removed access is no-op                 |
| `TC-CLI-REMOVE-006` | Faculty/grader access is preserved              |
| `TC-CLI-REMOVE-007` | Draft assignment blocks remove-access           |
| `TC-CLI-REMOVE-008` | Remove-access updates manifest lifecycle fields |

---

## 7. Mock GitHub Test Areas

A fake GitHub client should simulate all GitHub states needed by Graider.

### 7.1 Repository and template state

Mock scenarios:

- template repo exists
- template repo missing
- template not marked template
- template outside configured organization
- template branch missing
- template branch not default
- template README missing
- expected student repo missing
- expected student repo exists and manifest-tracked
- expected student repo exists but untracked collision
- manifest-tracked repo missing from GitHub
- repository archived

---

### 7.2 Permission state

Mock scenarios:

- student collaborator absent
- student collaborator active
- student collaborator pending invite
- student collaborator has lower permission
- student collaborator has higher permission
- faculty team missing
- grader team missing
- faculty team has expected permission
- grader team has expected permission
- team has lower permission
- unexpected team exists

---

### 7.3 Actions and grading state

Mock scenarios:

- Actions enabled
- Actions disabled
- grading workflow exists
- grading workflow missing
- workflow dispatch available
- workflow dispatch missing
- workflow run completed
- workflow not run
- workflow failed without results
- artifact found
- artifact missing
- result file missing
- result file invalid
- grading disabled

---

### 7.4 API failures

Mock scenarios:

- auth missing
- auth failed
- permission denied
- rate limited
- secondary rate limited with retry timing
- network timeout
- GitHub 5xx
- retry success
- retry exhaustion
- malformed API response

---

## 8. Report Rendering Tests

Report rendering should be tested separately from GitHub data collection.

### 8.1 Faculty report tests

Test cases:

| Test ID                 | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `TC-REPORT-FACULTY-001` | Markdown includes assignment header                        |
| `TC-REPORT-FACULTY-002` | Markdown includes aggregate summary                        |
| `TC-REPORT-FACULTY-003` | Markdown includes student table                            |
| `TC-REPORT-FACULTY-004` | CSV has stable column order                                |
| `TC-REPORT-FACULTY-005` | JSON includes schema version                               |
| `TC-REPORT-FACULTY-006` | Warning/error code lists render correctly                  |
| `TC-REPORT-FACULTY-007` | Repo links render when URLs exist                          |
| `TC-REPORT-FACULTY-008` | Active student missing repo appears in report              |
| `TC-REPORT-FACULTY-009` | Hold and dropped students appear according to report rules |
| `TC-REPORT-FACULTY-010` | Faculty report contains no raw workflow logs               |

---

### 8.2 Student report tests

Test cases:

| Test ID                 | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `TC-REPORT-STUDENT-001` | Student report path includes section and student ID |
| `TC-REPORT-STUDENT-002` | Student report contains no other student data       |
| `TC-REPORT-STUDENT-003` | `not_configured` wording is clear                   |
| `TC-REPORT-STUDENT-004` | Passed checks render correctly                      |
| `TC-REPORT-STUDENT-005` | Failed checks render correctly                      |
| `TC-REPORT-STUDENT-006` | Error/skipped checks render correctly               |
| `TC-REPORT-STUDENT-007` | Details section renders                             |
| `TC-REPORT-STUDENT-008` | Student report contains no raw workflow logs        |

---

### 8.3 Published student report tests

Test cases:

| Test ID                 | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| `TC-REPORT-PUBLISH-001` | Published `grading/report.md` contains target student only       |
| `TC-REPORT-PUBLISH-002` | Published `grading/results.json` contains target student only    |
| `TC-REPORT-PUBLISH-003` | Published JSON is normalized Graider data, not raw artifact copy |
| `TC-REPORT-PUBLISH-004` | Published files do not include faculty summary                   |
| `TC-REPORT-PUBLISH-005` | Published files overwrite current paths                          |

---

## 9. Failure and Recovery Tests

| Test ID           | Scenario                                                                                |
| ----------------- | --------------------------------------------------------------------------------------- |
| `TC-RECOVERY-001` | `apply` interrupted after repo creation and manifest update; rerun is no-op             |
| `TC-RECOVERY-002` | `apply` interrupted after repo creation before manifest update; rerun reports collision |
| `TC-RECOVERY-003` | Rate limit occurs mid-apply; completed work recorded                                    |
| `TC-RECOVERY-004` | Partial report failure still generates other student reports                            |
| `TC-RECOVERY-005` | Retryable GitHub 5xx succeeds on retry                                                  |
| `TC-RECOVERY-006` | Retryable GitHub 5xx exhausts retries and exits `4`                                     |
| `TC-RECOVERY-007` | Permission denied is not retried as transient                                           |
| `TC-RECOVERY-008` | Network timeout succeeds after retry                                                    |
| `TC-RECOVERY-009` | Systemic auth failure stops command                                                     |
| `TC-RECOVERY-010` | Config error stops before GitHub mutation                                               |

---

## 10. Nonfunctional Test Areas

### 10.1 Reliability

Test:

- idempotent apply
- idempotent archive
- idempotent remove-access
- retry behavior
- rate-limit behavior
- resumability
- deterministic planning
- fresh GitHub state checks

### 10.2 Safety

Test:

- no delete command
- no delete behavior
- confirmation required
- blocked plan prevents mutation
- validate is non-mutating
- plan is non-mutating
- no automatic adoption

### 10.3 Security and privacy

Test:

- tokens redacted
- tokens not persisted
- no tokens in logs/plans/manifests/reports
- reports exclude raw logs
- student reports are single-student only
- private repo requirement
- GitHub org boundary enforced

### 10.4 Auditability and observability

Test:

- source hashes
- input fingerprint
- operation summaries
- JSON Lines logs
- generated file paths printed
- canonical error/warning codes
- no stack traces in normal output

### 10.5 Performance and scale

Use mocked GitHub state to test:

- 150 active students
- 500 roster rows
- deterministic output under scale
- no required batching
- bounded concurrency behavior
- reasonable generated file sizes

### 10.6 Portability

Test:

- run from repo root
- run from subdirectory
- repository-root discovery
- forward-slash generated paths
- environment-token lookup
- non-interactive `--yes`
- no dependency on GitHub CLI authentication

### 10.7 Exit codes

Test:

| Exit code | Test scenario                         |
| --------: | ------------------------------------- |
|       `0` | success                               |
|       `0` | warnings only                         |
|       `1` | validation or command error           |
|       `2` | partial success                       |
|       `3` | auth/authorization failure            |
|       `4` | GitHub API/network/rate-limit failure |
|       `5` | schema/config error                   |

---

## 11. Optional Live GitHub Tests

Live GitHub tests are desired, but must be optional, explicitly gated, and sandboxed.

Gate live tests with:

```text
GRAIDER_RUN_LIVE_GITHUB_TESTS=true
```

Use a sandbox organization or sandbox repository set. Do not run live tests against production course repositories by default.

Live tests should use only one or two small sandbox repositories.

### Recommended live tests

| Test ID       | Scenario                                      |
| ------------- | --------------------------------------------- |
| `TC-LIVE-001` | Validate real template repo                   |
| `TC-LIVE-002` | Create one student repo from template         |
| `TC-LIVE-003` | Add test student collaborator or test account |
| `TC-LIVE-004` | Add faculty/grader test teams                 |
| `TC-LIVE-005` | Trigger workflow dispatch                     |
| `TC-LIVE-006` | Read workflow run/artifact                    |
| `TC-LIVE-007` | Publish student report to sandbox repo        |
| `TC-LIVE-008` | Archive test repo                             |
| `TC-LIVE-009` | Remove test collaborator                      |
| `TC-LIVE-010` | Verify cleanup process for sandbox resources  |

Important rule:

> Live tests must never run against production course repositories by default.

---

## 12. Manual Acceptance Tests

Manual acceptance tests should be run before MVP release using a sandbox course-admin repository and sandbox GitHub organization.

Recommended manual flow:

1. Create sandbox course-admin repository.
2. Create sandbox template repository.
3. Configure one assignment with grading enabled.
4. Configure one assignment with grading disabled.
5. Add one or two sandbox students.
6. Run `validate`.
7. Run `plan`.
8. Review generated plan.
9. Run `apply --yes`.
10. Verify GitHub repositories and permissions.
11. Push sample submission.
12. Run `grade --all`.
13. Run `report`.
14. Review faculty reports.
15. Run `report --publish-student-reports`.
16. Verify student repo report files.
17. Run `remove-access --all --yes`.
18. Run `archive --all --yes`.

---

## 13. Out-of-Scope MVP Tests

The following are not tested for MVP behavior:

- group assignments
- LMS integration
- IDE integration
- feedback pull requests
- hidden faculty tests
- protected-path enforcement
- repository adoption
- empty repo assignment creation
- points-based grading
- extensions
- multiple due dates
- GitHub App authentication
- web UI workflows

These may be documented as future test areas, but they should not affect MVP pass/fail.

---

## 14. Test Plan Decisions

| Item                         | Decision                                      |
| ---------------------------- | --------------------------------------------- |
| Most tests                   | Run without live GitHub access                |
| Live GitHub tests            | Optional and explicitly gated                 |
| Live test intent             | Desired, but deliberate and sandboxed         |
| Live test scale              | One or two small sandbox repositories         |
| CLI fixture tests            | Required for each MVP command                 |
| Report rendering tests       | Tested separately from GitHub data collection |
| Recovery/interruption tests  | Included in MVP test planning                 |
| Performance tests            | Use mocked GitHub state                       |
| Out-of-scope test exclusions | Included                                      |
