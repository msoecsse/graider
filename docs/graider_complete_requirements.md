# Graider MVP Formal Requirements

Working title: **graider**  
Purpose: define functional and nonfunctional MVP requirements for Graider, a CLI-based replacement for the core GitHub Classroom assignment-management workflows.

---

# Functional Requirements

## 1. Scope Requirements

### FR-SCOPE-001 — MVP assignment type support

The system shall support individual assignments in MVP.

**Acceptance criteria**

- Given `assignment.type: individual`, validation may pass if all other fields are valid.
- Given any assignment type other than `individual`, validation fails.
- The validation error identifies the unsupported assignment type.

### FR-SCOPE-002 — Excluded MVP features

The system shall exclude group assignments, LMS integration, protected-path enforcement, assignment extensions, feedback pull requests, IDE integration, and hidden faculty grading from MVP.

**Acceptance criteria**

- No MVP command requires LMS data.
- No MVP command creates feedback pull requests.
- No MVP command provisions group/team assignment repositories.
- No MVP command enforces protected paths.
- No MVP command requires Codespaces or IDE-specific configuration.

### FR-SCOPE-003 — Optional grading workflow support

The system shall allow assignments with no grading workflow.

**Acceptance criteria**

- Given `assignment.yml` with `grading.enabled: false`, validation does not warn about a missing grading workflow.
- Given `grading.enabled: false`, `graider report` reports `workflow_status: not_configured` and `result_status: not_configured`.
- Given `grading.enabled: false`, `graider grade` exits successfully as a no-op and triggers no workflows.

---

## 2. Repository Layout Requirements

### FR-LAYOUT-001 — Course-admin repository naming

The system shall use one course-admin repository per course named `<course>-graider`.

**Acceptance criteria**

- Given `course.code: se2030`, the expected admin repository name is `se2030-graider`.
- Given `course.repository` that does not match `<course>-graider`, validation fails.

### FR-LAYOUT-002 — Required course-admin repository structure

The system shall support the finalized course-admin repository layout.

**Acceptance criteria**

Given a course repository root, Graider resolves:

```text
course.yml
terms/<term>/term.yml
terms/<term>/assignments/<assignment>/assignment.yml
terms/<term>/rosters/section-<section>.csv
terms/<term>/manifests/<assignment>.manifest.yml
terms/<term>/plans/<assignment>/
terms/<term>/reports/<assignment>/
terms/<term>/logs/<assignment>/
```

### FR-LAYOUT-003 — Assignment folder layout

The system shall store each assignment config in an assignment folder.

**Acceptance criteria**

- Given assignment `lab04`, the assignment config path is `terms/<term>/assignments/lab04/assignment.yml`.
- Given `assignment.slug: lab04`, validation fails if the assignment folder name is not `lab04`.

### FR-LAYOUT-004 — Section-based student report layout

The system shall store generated student reports by section.

**Acceptance criteria**

- Given student `jones` in section `001`, the course-admin student report path is `terms/<term>/reports/<assignment>/students/001/jones.md`.
- Given student `smith` in section `002`, the course-admin student report path is `terms/<term>/reports/<assignment>/students/002/smith.md`.

### FR-LAYOUT-005 — Logs are local-only for MVP

The system shall generate local logs but shall not require logs to be committed to the course-admin repository in MVP.

**Acceptance criteria**

- Commands may write logs under `terms/<term>/logs/<assignment>/`.
- Generated logs are not required inputs for later commands.
- Missing log files do not cause validation failure.

---

## 3. Configuration Schema Requirements

### FR-CONFIG-001 — `course.yml` support

The system shall load and validate `course.yml` from the course-admin repository root.

**Acceptance criteria**

- Given a valid `course.yml`, Graider can resolve course-wide defaults.
- Given a missing `course.yml`, validation fails.
- Given malformed YAML in `course.yml`, validation fails.

### FR-CONFIG-002 — `course.yml` required fields

The system shall require `course.yml` to contain course, GitHub, default, grading, and report configuration.

**Acceptance criteria**

Validation fails if any of the following are missing:

```text
schema_version
course.code
course.title
course.repository
github.organization
github.repository_visibility
github.repo_name_pattern
github.student_permission
github.faculty_team
github.faculty_permission
github.grader_team
github.grader_permission
defaults.timezone
defaults.assignment_type
grading.workflow
grading.artifact
grading.result_file
reports.formats
reports.student_report_path
reports.student_results_path
```

### FR-CONFIG-003 — `term.yml` support

The system shall load and validate `terms/<term>/term.yml`.

**Acceptance criteria**

- Given an assignment path under `terms/27s1/`, Graider resolves `terms/27s1/term.yml`.
- Given a missing `term.yml`, validation fails.
- Given malformed YAML in `term.yml`, validation fails.

### FR-CONFIG-004 — Term code format

The system shall validate term codes using the `YYsN` format, where `N` is `1`, `2`, or `3`.

**Acceptance criteria**

- `27s1`, `27s2`, and `27s3` are valid.
- `2027s1`, `27fall`, and `27s4` are invalid.
- Summer semester is represented as semester `3`, such as `27s3`.

### FR-CONFIG-005 — `assignment.yml` support

The system shall load and validate `terms/<term>/assignments/<assignment>/assignment.yml`.

**Acceptance criteria**

- Given a valid assignment file, Graider can resolve the assignment slug, template, sections, deadline, metadata, and optional grading override.
- Given a missing assignment file, validation fails.
- Given malformed YAML in `assignment.yml`, validation fails.

### FR-CONFIG-006 — Assignment grading inheritance

The system shall inherit grading configuration from `course.yml` when `assignment.yml` omits the `grading` block.

**Acceptance criteria**

- Given no `grading` block in `assignment.yml`, grading is enabled using `course.yml` grading values.
- Given `grading.enabled: true`, grading is enabled using inherited values unless overrides are provided.
- Given `grading.enabled: false`, grading is disabled and no workflow is expected.

### FR-CONFIG-007 — Assignment grading override validation

The system shall validate assignment-level grading overrides when present.

**Acceptance criteria**

- Given `grading.enabled: true` with all of `workflow`, `artifact`, and `result_file`, validation passes if all values are valid.
- Given `grading.enabled: true` with only some override fields, validation fails.
- Given `grading.enabled: false` with workflow/artifact/result fields, validation fails.

### FR-CONFIG-008 — Manifest support

The system shall create and update `terms/<term>/manifests/<assignment>.manifest.yml` to record actual generated GitHub state.

**Acceptance criteria**

- `graider apply` creates a manifest if one does not exist.
- `graider validate` does not create or update a manifest.
- `graider plan` does not create or update a manifest.
- `graider report` updates existing manifest status but does not create missing repo records.

### FR-CONFIG-009 — Plan file support

The system shall generate timestamped JSON plan files under `terms/<term>/plans/<assignment>/`.

**Acceptance criteria**

- Running `graider plan terms/27s1/assignments/lab04/assignment.yml` writes a file under `terms/27s1/plans/lab04/`.
- The plan filename includes a timestamp.
- The plan file uses `schema_version: 1`.

---

### FR-CONFIG-010 — `term.yml` required fields

The system shall require `term.yml` to contain term identity and section roster configuration.

**Acceptance criteria**

Validation fails if any of the following are missing:

```text
schema_version
term.code
term.academic_year
term.semester
term.display_name
sections
sections[].id
sections[].roster
```

---

### FR-CONFIG-011 — `assignment.yml` required fields

The system shall require `assignment.yml` to contain assignment identity, template, section, deadline, and metadata configuration.

**Acceptance criteria**

Validation fails if any of the following are missing:

```text
schema_version
assignment.slug
assignment.title
assignment.type
assignment.status
template.repository
template.branch
sections
deadline.due_at
deadline.late_policy
metadata.faculty_owner
metadata.lms_assignment_id
metadata.grading_category
metadata.points
```

---

### FR-CONFIG-012 — Manifest required sections

The system shall require manifest files to include the sections needed to reconstruct generated assignment state.

**Acceptance criteria**

- A manifest includes `schema_version`.
- A manifest includes assignment identity.
- A manifest includes source file paths, source file hashes, and input fingerprint.
- A manifest includes template repository, branch, and commit SHA.
- A manifest includes repository records for students with repo-related state.
- Repository records include student identity, repository identity, permissions, Actions state, lifecycle state, warnings, and errors.
- A manifest includes operation summaries when command execution records are appended.
- A malformed or incomplete manifest fails validation when a command requires the manifest.

---

### FR-CONFIG-013 — Plan required sections

The system shall require plan files to include the sections needed to review intended operations.

**Acceptance criteria**

- A plan includes `schema_version`.
- A plan includes creation timestamp.
- A plan includes assignment identity.
- A plan includes source file paths, source file hashes, and input fingerprint.
- A plan includes summary counts.
- A plan includes operations.
- A plan includes structured warnings and errors.
- Each operation includes operation ID, operation type, operation status, dependencies, and relevant student or repository context when applicable.

---

---

## 4. Roster Requirements

### FR-ROSTER-001 — Roster CSV format

The system shall require roster CSV files to include the MVP columns.

**Acceptance criteria**

- Validation fails if any required column is missing: `student_id`, `github_username`, `section`, or `status`.

### FR-ROSTER-002 — Roster status values

The system shall support exactly three MVP roster statuses: `active`, `dropped`, and `hold`.

**Acceptance criteria**

- Rows with `active`, `dropped`, or `hold` pass status validation.
- Rows with any other status fail validation.

### FR-ROSTER-003 — Section consistency

The system shall require each roster row’s `section` value to match the section roster file.

**Acceptance criteria**

- In `section-001.csv`, every row must have `section` equal to `001`.
- A row in `section-001.csv` with `section` equal to `002` causes validation failure.

### FR-ROSTER-004 — Unique student IDs

The system shall reject duplicate `student_id` values anywhere in the term roster set.

**Acceptance criteria**

- If `student_id: jones` appears in both `section-001.csv` and `section-002.csv`, validation fails.
- If `student_id: jones` appears twice in the same section roster, validation fails.

### FR-ROSTER-005 — Unique GitHub usernames

The system shall reject duplicate GitHub usernames anywhere in the term roster set.

**Acceptance criteria**

- If `github_username: seanjones` appears in more than one row, validation fails.
- Duplicate detection is case-insensitive.

### FR-ROSTER-006 — Lowercase normalization

The system shall normalize `student_id` and `github_username` values to lowercase.

**Acceptance criteria**

- Given `student_id: JONES`, Graider uses `jones` in repo paths, reports, manifests, and generated names.
- Given `github_username: SeanJones`, Graider uses `seanjones`.
- Non-lowercase input generates a warning, not an error.

### FR-ROSTER-007 — GitHub username validation

The system shall validate GitHub username syntax and existence.

**Acceptance criteria**

- Missing `github_username` causes validation failure.
- Invalid GitHub username syntax causes validation failure.
- A GitHub username that does not exist causes validation failure.

### FR-ROSTER-008 — Report roster coverage

The system shall include the assignment roster target set in reports, merged with manifest and GitHub state.

**Acceptance criteria**

- An active student without a created repo appears in the faculty summary as missing a repo.
- A hold student appears as skipped/hold in report output.
- The manifest still contains only students with repo-related state.

---

## 5. GitHub Provisioning Requirements

### FR-GH-001 — Repository creation from template

The system shall create student repositories from the configured GitHub template repository.

**Acceptance criteria**

- Given an active student and no existing repo, `graider apply` creates a private repository from the configured template.
- The template repository must be in the configured GitHub organization.
- The template repository must be marked as a GitHub template repository.

### FR-GH-002 — Default branch only

The system shall use only the template repository’s default branch for MVP repository creation.

**Acceptance criteria**

- `template.branch` is required in `assignment.yml`.
- Validation fails if `template.branch` does not match the template repository default branch.

### FR-GH-003 — Template README requirement

The system shall require the template repository to contain `README.md`.

**Acceptance criteria**

- Given a template repo without `README.md`, validation fails.
- Given a template repo with `README.md`, validation may pass if all other checks pass.

### FR-GH-004 — Repository visibility

The system shall create all MVP student repositories as private repositories.

**Acceptance criteria**

- Created repositories have private visibility.
- Validation fails if `github.repository_visibility` is not `private`.

### FR-GH-005 — Repository naming

The system shall generate repository names using the configured pattern.

**Acceptance criteria**

- Given term `27s1`, course `se2030`, assignment `lab04`, and username `seanjones`, the generated repository name is `27s1-se2030-lab04-seanjones`.

### FR-GH-006 — Repository collision handling

The system shall block apply when an expected repository exists on GitHub but is not recorded in the manifest.

**Acceptance criteria**

- Given a repo exists with the expected generated name and no manifest entry exists, `graider plan` records a blocked operation.
- `graider apply` refuses to execute while the computed plan contains blocked operations.
- The system does not adopt, overwrite, or modify the untracked repo in MVP.

### FR-GH-007 — Missing manifest-tracked repository

The system shall not automatically recreate a repository that is recorded in the manifest but missing from GitHub.

**Acceptance criteria**

- Given a manifest entry for a repo that cannot be found on GitHub, `graider apply` reports an error.
- The missing repo is not automatically recreated.
- `graider report` marks the repo as missing.

### FR-GH-008 — Template changes after creation

The system shall not update existing student repositories when the template repository changes after initial creation.

**Acceptance criteria**

- Given an existing student repo and a changed template repo, `graider apply` does not overwrite or synchronize starter code.
- New students added later receive repos from the current template default branch.

### FR-GH-009 — Template source tracking

The system shall record the template repository, branch, and commit SHA used during apply.

**Acceptance criteria**

- The manifest source section includes template repository, branch, and commit SHA.
- If the template changes later, Graider can warn that the template changed since initial apply.

---

## 6. Permission Requirements

### FR-PERM-001 — Student permission

The system shall grant each active student `push` access to that student’s repository.

**Acceptance criteria**

- Given an active student repo, `graider apply` adds the student as a collaborator with `push`.
- If the student collaborator is already present with `push`, apply treats it as no-op.
- If the student has lower permission, apply raises it to `push`.

### FR-PERM-002 — Faculty team permission

The system shall grant the configured faculty team `admin` access to each student repository.

**Acceptance criteria**

- Given a student repo, `graider apply` grants the configured faculty team `admin`.
- If the faculty team is missing, validation fails.
- If the faculty team already has `admin`, apply treats it as no-op.

### FR-PERM-003 — Grader team permission

The system shall grant the configured grader team `maintain` access to each student repository.

**Acceptance criteria**

- Given a student repo, `graider apply` grants the configured grader team `maintain`.
- If the grader team is missing, validation fails.
- If the grader team already has `maintain`, apply treats it as no-op.

### FR-PERM-004 — Additive permission behavior

The system shall not remove or downgrade permissions during `graider apply`.

**Acceptance criteria**

- Unexpected collaborators and teams are ignored and left unchanged.
- Students with higher-than-expected permission are left unchanged and warned.
- No collaborator or team is removed during `apply`.

### FR-PERM-005 — Collaborator invitation status

The system shall treat pending collaborator invitations as successful permission application with invited status.

**Acceptance criteria**

- If GitHub creates a pending student invite, `graider apply` records success with status `invited`.
- If an invitation is already pending, apply treats it as no-op.
- Manifest student permission status is one of `active`, `invited`, or `unknown`.

---

## 7. CLI Requirements

### FR-CLI-001 — Assignment-file centered commands

The system shall require MVP commands to accept an explicit assignment configuration file path.

**Acceptance criteria**

- `graider apply terms/27s1/assignments/lab04/assignment.yml` is valid command form.
- The MVP does not require shorthand command resolution.
- The command architecture does not prevent future shorthand support.

### FR-CLI-002 — MVP command set

The system shall provide the MVP command set.

**Acceptance criteria**

- The following commands exist: `validate`, `plan`, `apply`, `grade`, `report`, `archive`, and `remove-access`.

### FR-CLI-003 — `validate`

The system shall provide `graider validate` to check configuration, roster, template, GitHub access, naming, and grading expectations without modifying GitHub.

**Acceptance criteria**

- `validate` makes no GitHub changes.
- `validate` exits successfully when all checks pass.
- `validate` reports errors and warnings when checks fail.
- `validate` supports `--json`.

### FR-CLI-004 — `plan`

The system shall provide `graider plan` to compute intended operations without modifying GitHub.

**Acceptance criteria**

- `plan` makes no GitHub changes.
- `plan` always writes a timestamped JSON plan file.
- `plan` includes planned, no-op, skipped, and blocked operations.
- `plan` supports `--json`.

### FR-CLI-005 — `apply`

The system shall provide `graider apply` to perform additive provisioning.

**Acceptance criteria**

- `apply` validates inputs before making changes.
- `apply` computes its own plan.
- `apply` refuses to execute if the computed plan contains blocked operations or errors.
- `apply` creates missing repos for active students when assignment status is `active`.
- `apply` updates the manifest.

### FR-CLI-006 — `grade`

The system shall provide `graider grade` to manually trigger grading workflows.

**Acceptance criteria**

- `grade` requires exactly one target selector.
- `grade` supports `--all`, `--section`, `--student-id`, and `--github-username`.
- `grade` uses GitHub Actions `workflow_dispatch`.
- If grading is disabled, `grade` exits with command error and triggers no workflow.

### FR-CLI-007 — `report`

The system shall provide `graider report` to generate faculty and student reports.

**Acceptance criteria**

- `report` generates Markdown, CSV, and JSON faculty reports.
- `report` generates student Markdown reports split by section.
- `report` supports `--json`.
- `report` requires an existing manifest.
- `report` updates observed manifest statuses for existing repo records.

### FR-CLI-008 — Student report publishing

The system shall not publish student reports to student repositories unless explicitly requested.

**Acceptance criteria**

- Running `graider report` without flags does not commit to student repos.
- Running `graider report --publish-student-reports` commits `grading/report.md` and `grading/results.json` to each selected student repo.

### FR-CLI-009 — `archive`

The system shall provide `graider archive` to explicitly archive selected student repositories.

**Acceptance criteria**

- `archive` requires exactly one target selector.
- `archive` requires confirmation unless `--yes` is provided.
- `archive` preserves faculty and grader team access.
- `archive` does not delete repositories.
- Re-running `archive` on an already archived repo is a no-op.

### FR-CLI-010 — `remove-access`

The system shall provide `graider remove-access` to explicitly remove student collaborator access.

**Acceptance criteria**

- `remove-access` requires exactly one target selector.
- `remove-access` requires confirmation unless `--yes` is provided.
- `remove-access` removes only student collaborator access.
- Faculty and grader team access are preserved.
- Re-running `remove-access` after access has already been removed is a no-op.

---

## 8. Lifecycle Requirements

### FR-LIFE-001 — Supported assignment states

The system shall support exactly four MVP assignment states: `draft`, `active`, `closed`, and `archived`.

**Acceptance criteria**

- Validation passes for these four states.
- Validation fails for any other state.

### FR-LIFE-002 — Allowed lifecycle transitions

The system shall support the MVP lifecycle transition model.

**Acceptance criteria**

- Allowed transitions: `draft -> active`, `draft -> archived`, `active -> closed`, `active -> archived`, `closed -> active`, and `closed -> archived`.
- Unsupported transitions: `archived -> draft`, `archived -> active`, and `archived -> closed`.

### FR-LIFE-003 — `apply` lifecycle behavior

The system shall enforce lifecycle state during `apply`.

**Acceptance criteria**

- `apply` is blocked in `draft`.
- `apply` is fully allowed in `active`.
- `apply` in `closed` may repair existing manifest-tracked repos but may not create new repos.
- `apply` is blocked in `archived`.

### FR-LIFE-004 — `grade` lifecycle behavior

The system shall enforce lifecycle state during `grade`.

**Acceptance criteria**

- `grade` is blocked in `draft`.
- `grade` is allowed in `active` when grading is enabled.
- `grade` is allowed in `closed` when grading is enabled.
- `grade` is blocked in `archived`.

### FR-LIFE-005 — `report` lifecycle behavior

The system shall allow `report` in all assignment states when a manifest exists.

**Acceptance criteria**

- `report` fails if no manifest exists.
- `report` succeeds in `active`, `closed`, or `archived` if manifest and GitHub access are valid.
- `report` may run in `draft` only if a manifest exists.

### FR-LIFE-006 — Explicit destructive operations

Changing assignment lifecycle state shall not archive repositories or remove student access.

**Acceptance criteria**

- Changing `assignment.status` to `archived` does not archive GitHub repos.
- Changing `assignment.status` to `closed` does not remove student access.
- Only `graider archive` archives repositories.
- Only `graider remove-access` or `graider archive --remove-student-access` removes student access.

---

## 9. Grading Requirements

### FR-GRADE-001 — Grading workflow contract

When grading is enabled, the system shall use the configured grading workflow, artifact, and result file.

**Acceptance criteria**

- If assignment grading is omitted, `course.yml` grading values are used.
- If assignment grading override is present, override values are used.
- If grading is disabled, no workflow, artifact, or result file is expected.

### FR-GRADE-002 — Grading result validation

The system shall validate `grading-results.json` when present.

**Acceptance criteria**

- A valid result contains `schema_version`, `status`, `generated_at`, `summary`, `commit`, and `checks`.
- `checks` may be empty.
- `status` must be one of `passed`, `failed`, `error`, or `skipped`.
- Raw logs are not required or parsed from `grading-results.json`.

### FR-GRADE-003 — Missing grading result handling

The system shall distinguish missing or invalid grading states in reports.

**Acceptance criteria**

- Reports may use: `not_configured`, `not_run`, `missing_workflow`, `workflow_failed_no_results`, `missing_artifact`, `missing_result_file`, `invalid_result_file`, and `unknown`.

---

## 10. Reporting Requirements

### FR-REPORT-001 — Faculty summary JSON

The system shall generate `faculty-summary.json` as the canonical report source.

**Acceptance criteria**

- `faculty-summary.json` includes assignment metadata, aggregate summary, and student rows.
- CSV and Markdown reports can be derived from `faculty-summary.json`.

### FR-REPORT-002 — Faculty summary CSV

The system shall generate a flat spreadsheet-friendly `faculty-summary.csv`.

**Acceptance criteria**

- CSV includes student ID, GitHub username, section, repo status, submission status, grading status, report status, warnings, and errors.
- Warnings and errors are represented as semicolon-separated code lists.

### FR-REPORT-003 — Faculty summary Markdown

The system shall generate a human-readable `faculty-summary.md`.

**Acceptance criteria**

- Markdown includes assignment header.
- Markdown includes aggregate summary table.
- Markdown includes student table.
- Repo names are linked when repo URLs are available.

### FR-REPORT-004 — Student Markdown reports

The system shall generate student Markdown reports.

**Acceptance criteria**

- Reports are written to `students/<section>/<student_id>.md`.
- Report includes assignment header, submission section, grading result section, checks section, and details section.
- If no grading workflow is configured, report states `not_configured`.

### FR-REPORT-005 — Published student JSON

When publishing student reports, the system shall commit normalized Graider report JSON to student repos.

**Acceptance criteria**

- `grading/results.json` is generated from Graider report data, not copied raw from `grading-results.json`.
- The JSON includes assignment, student, repo, submission, grading, warnings, and errors.
- The schema may change after MVP.

---

### FR-REPORT-006 — Closed report status vocabularies

The system shall use closed status vocabularies for MVP report fields.

**Acceptance criteria**

- `grading.workflow_status` uses only the defined MVP workflow status values.
- `grading.result_status` uses only the defined MVP grading result status values.
- `artifact_status` uses only the defined MVP artifact status values.
- `result_file_status` uses only the defined MVP result file status values.
- Unknown or unmapped states are represented with `unknown`.
- Status values are used consistently in `faculty-summary.json`, `faculty-summary.csv`, `faculty-summary.md`, student Markdown reports, and published `grading/results.json`.

Defined `grading.workflow_status` values:

```text
completed
not_run
missing_workflow
workflow_failed_no_results
not_configured
unknown
```

Defined `grading.result_status` values:

```text
passed
failed
error
skipped
missing_artifact
missing_result_file
invalid_result_file
not_run
missing_workflow
workflow_failed_no_results
not_configured
unknown
```

Defined `artifact_status` values:

```text
found
missing
not_checked
```

Defined `result_file_status` values:

```text
valid
missing
invalid
not_checked
```

---

---

# Nonfunctional Requirements

## 1. Reliability Requirements

### NFR-REL-001 — Idempotent apply

The system shall make `graider apply` safe to re-run without duplicating repositories, duplicating permissions, or performing destructive changes.

**Acceptance criteria**

- Re-running `apply` on a fully provisioned assignment results in no duplicate repositories.
- Re-running `apply` on a fully provisioned assignment results in no duplicate collaborator invitations.
- Existing manifest-tracked repositories are treated as no-op for repository creation.
- Missing expected additive permissions are added.
- Existing expected permissions are treated as no-op.
- Unexpected collaborators and teams are ignored and left unchanged.
- `apply` does not delete repositories, archive repositories, remove collaborators, remove teams, or downgrade permissions.

---

### NFR-REL-002 — Idempotent archive

The system shall make `graider archive` safe to re-run.

**Acceptance criteria**

- Running `archive` on an active repository archives the repository.
- Running `archive` on an already archived repository is treated as no-op.
- Running `archive` does not delete the repository.
- Running `archive` preserves faculty and grader team access.
- Running `archive --remove-student-access` removes student access if present and treats already-removed access as no-op.
- Archive results are reflected in the manifest.

---

### NFR-REL-003 — Idempotent remove-access

The system shall make `graider remove-access` safe to re-run.

**Acceptance criteria**

- Running `remove-access` removes student collaborator access when present.
- Running `remove-access` when student access is already absent is treated as no-op.
- Running `remove-access` preserves faculty and grader team access.
- Running `remove-access` does not archive or delete repositories.
- Remove-access results are reflected in the manifest.

---

### NFR-REL-004 — Partial failure handling

The system shall continue processing independent student repository operations when one student-specific operation fails, unless a systemic failure prevents meaningful continuation.

**Acceptance criteria**

- If one student repository creation fails, Graider continues processing other eligible students when safe.
- If one student collaborator invite fails, Graider continues processing other eligible students when safe.
- If one student report publish fails, Graider continues publishing other eligible reports when safe.
- If authentication fails, Graider stops the command.
- If required configuration is invalid, Graider stops before making GitHub changes.
- If the template repository is inaccessible, Graider stops before provisioning repositories.
- If the GitHub rate limit is exhausted and retries cannot recover, Graider stops the command.
- Commands with mixed successes and failures exit with code `2`.
- Partial failures are recorded in command output and structured logs.

---

### NFR-REL-005 — Retry transient failures

The system shall retry transient GitHub and network failures before reporting failure.

**Acceptance criteria**

- GitHub 5xx responses are retried.
- Network timeouts are retried.
- Temporary network failures are retried.
- Retry count is `3`.
- Retry delay uses exponential backoff.
- GitHub `Retry-After` headers are honored when present.
- Validation errors are not retried.
- Authentication failures are not retried as transient failures.
- Permission-denied errors are not retried as transient failures.
- Repository collisions are not retried.

---

### NFR-REL-006 — GitHub rate-limit handling

The system shall detect and handle GitHub API rate limits safely.

**Acceptance criteria**

- If GitHub indicates a temporary secondary rate limit and provides retry timing, Graider waits and retries within the configured retry policy.
- If the rate limit cannot be recovered within the retry policy, Graider stops the command.
- Rate-limit failures use the `github_rate_limited` error code.
- Rate-limit failures exit with code `4`.
- Work completed before rate-limit failure is recorded in manifest/log output.
- Re-running the command after rate-limit recovery resumes safely without duplicating completed work.

---

### NFR-REL-007 — Resumable apply

The system shall make `graider apply` resumable after interruption.

**Acceptance criteria**

- `apply` records successful repository creation in the manifest as soon as practical after creation.
- If `apply` is interrupted after some repos are created, re-running `apply` treats manifest-recorded repos as existing no-ops.
- If a repo exists but was not recorded before interruption, re-running `apply` reports a repository collision rather than adopting it automatically.
- Command output identifies blocked collision cases requiring manual review or future adoption support.

---

### NFR-REL-008 — Operation ordering and consistency

The system shall execute operations in a safe, deterministic order and shall not claim global atomicity across GitHub operations.

**Acceptance criteria**

- Commands validate required inputs before making GitHub changes.
- `apply` computes a plan before executing provisioning operations.
- `apply` refuses to execute if the computed plan contains blocked operations or errors.
- Repository creation occurs before collaborator/team permission operations.
- Permission operations occur before Actions verification.
- Manifest updates occur after successful GitHub operations.
- If a later operation fails, earlier successful operations are not rolled back automatically.
- The command output and logs identify completed, failed, skipped, and blocked operations.

---

### NFR-REL-009 — Deterministic planning

The system shall generate deterministic plans for the same input files and observed GitHub state, except for timestamps and operation IDs.

**Acceptance criteria**

- Given unchanged config, rosters, manifest, and GitHub state, repeated `plan` runs produce equivalent operations.
- Operation ordering is stable across repeated runs.
- Student operations are ordered by section and normalized `student_id`.
- Plan differences reflect actual input or GitHub state changes.

---

### NFR-REL-010 — Fresh GitHub state checks

The system shall query GitHub for current remote state before making operations that depend on repository, permission, workflow, or artifact state.

**Acceptance criteria**

- `apply` checks whether expected repositories exist before creating them.
- `apply` checks collaborator/team permission state before adding permissions.
- `grade` checks workflow availability before triggering.
- `report` checks current repository, workflow, artifact, and commit state before generating reports.
- The manifest is used as historical/generated state, not as the sole source of current GitHub truth.

---

## 2. Safety Requirements

### NFR-SAFE-001 — No repository deletion

The system shall not delete GitHub repositories in MVP.

**Acceptance criteria**

- No MVP command deletes a student repository.
- There is no MVP `delete` command.
- `graider archive` is the only repository removal-like lifecycle operation.
- If a user attempts to request repository deletion through an unsupported command or option, Graider reports a command error and performs no deletion.

---

### NFR-SAFE-002 — Explicit destructive operations

The system shall require archive and access removal actions to be performed through explicit commands.

**Acceptance criteria**

- Changing `assignment.status` to `archived` does not archive GitHub repositories.
- Changing `assignment.status` to `closed` does not remove student access.
- `graider apply` does not archive repositories.
- `graider apply` does not remove student access.
- Only `graider archive` archives repositories.
- Only `graider remove-access` or `graider archive --remove-student-access` removes student collaborator access.

---

### NFR-SAFE-003 — Confirmation for impactful commands

The system shall require confirmation before `apply`, `archive`, and `remove-access` modify GitHub state unless `--yes` is provided.

**Acceptance criteria**

- Interactive `apply` prompts before creating repositories or changing permissions.
- Interactive `archive` prompts before archiving repositories.
- Interactive `remove-access` prompts before removing student collaborator access.
- `--yes` bypasses confirmation prompts.
- In non-interactive environments, commands that would prompt fail unless `--yes` is provided.
- A command that fails due to missing confirmation performs no GitHub changes.
- Missing confirmation uses the `confirmation_required` error code.

---

### NFR-SAFE-004 — Explicit target selection for multi-repo operations

The system shall require explicit target selectors for commands that operate on selected student repositories.

**Acceptance criteria**

- `graider grade` requires exactly one of `--all`, `--section`, `--student-id`, or `--github-username`.
- `graider archive` requires exactly one of `--all`, `--section`, `--student-id`, or `--github-username`.
- `graider remove-access` requires exactly one of `--all`, `--section`, `--student-id`, or `--github-username`.
- If no target selector is provided, the command fails with `target_selector_missing`.
- If more than one target selector is provided, the command fails with `target_selector_ambiguous`.
- If a target selector matches no students, the command fails with `target_matches_no_students`.

---

### NFR-SAFE-005 — Additive normal synchronization

The system shall make normal synchronization additive.

**Acceptance criteria**

- `graider apply` does not remove collaborators.
- `graider apply` does not remove teams.
- `graider apply` does not archive repositories.
- `graider apply` does not delete repositories.
- `graider apply` does not downgrade permissions.
- Unexpected collaborators and teams are ignored and left unchanged.
- Higher-than-expected student permissions are left unchanged and reported.

---

### NFR-SAFE-006 — Blocked plans prevent apply

The system shall prevent `apply` from executing when the computed plan contains any blocked operation or error.

**Acceptance criteria**

- If a generated repository name collides with an untracked GitHub repository, the plan contains a blocked operation.
- If the computed plan contains any blocked operation, `apply` performs no GitHub changes.
- If the computed plan contains validation errors, `apply` performs no GitHub changes.
- The command output identifies all blocked operations that prevented execution.
- The command exits with code `1` for domain validation or command errors, or code `5` for configuration/schema errors.

---

### NFR-SAFE-007 — Plan command is non-mutating

The system shall ensure `graider plan` never modifies GitHub state.

**Acceptance criteria**

- `graider plan` does not create repositories.
- `graider plan` does not add collaborators.
- `graider plan` does not add team permissions.
- `graider plan` does not enable Actions.
- `graider plan` does not trigger workflows.
- `graider plan` does not update the manifest.
- `graider plan` only writes a timestamped plan file and command output.

---

### NFR-SAFE-008 — Validate command is non-mutating

The system shall ensure `graider validate` never modifies GitHub state or generated assignment state.

**Acceptance criteria**

- `graider validate` does not create repositories.
- `graider validate` does not add collaborators.
- `graider validate` does not add team permissions.
- `graider validate` does not enable Actions.
- `graider validate` does not trigger workflows.
- `graider validate` does not create or update the manifest.
- `graider validate` may read GitHub state required for validation.

---

### NFR-SAFE-009 — No automatic adoption of unknown repositories

The system shall not automatically adopt existing repositories that are not recorded in the manifest.

**Acceptance criteria**

- If an expected generated repository name exists on GitHub but is not recorded in the manifest, Graider reports `repo_name_collision`.
- `graider apply` does not add collaborators to the untracked repository.
- `graider apply` does not add team permissions to the untracked repository.
- `graider apply` does not enable Actions on the untracked repository.
- `graider apply` does not write the untracked repository into the manifest.
- Future adoption requires a separate explicit flow outside MVP.

---

### NFR-SAFE-010 — Report publishing requires explicit flag

The system shall not publish student reports to student repositories unless explicitly requested.

**Acceptance criteria**

- `graider report` without `--publish-student-reports` writes reports only to the course-admin repository.
- `graider report` without `--publish-student-reports` does not commit files to student repositories.
- `graider report --publish-student-reports` commits `grading/report.md` and `grading/results.json` to student repositories.
- Published student report writes are included in command output.
- Failed student report publishes are reported per student.

---

### NFR-SAFE-011 — Sensitive information redaction

The system shall not print or write secrets to command output, logs, reports, plans, or manifests.

**Acceptance criteria**

- GitHub tokens are never printed in normal command output.
- GitHub tokens are never written to manifests.
- GitHub tokens are never written to plan files.
- GitHub tokens are never written to report files.
- GitHub tokens are never written to logs.
- If an error message includes a token-like value, Graider redacts it before output.
- Redacted values are replaced with a stable placeholder such as `[REDACTED]`.

---

### NFR-SAFE-012 — Raw grading logs are excluded by default

The system shall not include raw grading logs in reports by default.

**Acceptance criteria**

- `grading-results.json` does not require raw logs.
- `faculty-summary.md` does not include raw grading logs.
- Student Markdown reports do not include raw grading logs.
- Published `grading/results.json` does not include raw grading logs.
- If raw logs are made available later, that behavior must require an explicit configuration or command option.

---

### NFR-SAFE-013 — Lifecycle state changes have no hidden GitHub side effects

The system shall treat assignment lifecycle state as command gating metadata, not as an automatic GitHub mutation trigger.

**Acceptance criteria**

- Changing `assignment.status` from `active` to `closed` does not modify GitHub repositories.
- Changing `assignment.status` from `closed` to `active` does not modify GitHub repositories until a command is run.
- Changing `assignment.status` to `archived` does not archive GitHub repositories.
- Changing `assignment.status` does not remove student collaborator access.
- Any GitHub mutation requires an explicit Graider command.

---

### NFR-SAFE-014 — Dry-run behavior is represented by plan

The system shall treat `graider plan` as the MVP dry-run mechanism.

**Acceptance criteria**

- `graider plan` shows intended operations without changing GitHub state.
- `graider plan` includes planned, no-op, skipped, and blocked operations.
- `graider plan` writes a timestamped plan file.
- MVP does not require a separate `--dry-run` option for `apply`.
- If a future `--dry-run` option is added, it must not mutate GitHub state.

---

### NFR-SAFE-015 — Safer defaults for grading-disabled assignments

The system shall avoid grading-related GitHub actions when grading is disabled for an assignment.

**Acceptance criteria**

- When `grading.enabled: false`, `validate` does not warn about a missing grading workflow.
- When `grading.enabled: false`, `apply` does not require grading workflow verification to pass.
- When `grading.enabled: false`, `grade` triggers no workflows and exits with a command error.
- When `grading.enabled: false`, `report` reports grading as `not_configured`.
- When `grading.enabled: false`, missing workflow artifacts do not produce missing artifact warnings.

---

## 3. Security Requirements

### NFR-SEC-001 — Token-based MVP authentication

The system shall authenticate to GitHub using a token for MVP.

**Acceptance criteria**

- Graider checks `GRAIDER_GITHUB_TOKEN` first.
- If `GRAIDER_GITHUB_TOKEN` is not set, Graider checks `GITHUB_TOKEN`.
- If neither token is available and the command requires GitHub access, the command fails with `github_auth_missing`.
- Missing authentication exits with code `3`.
- The token value is never printed to command output.

---

### NFR-SEC-002 — Future GitHub App compatibility

The system architecture shall allow token-based MVP authentication to be replaced by GitHub App authentication later.

**Acceptance criteria**

- GitHub access is abstracted behind an internal GitHub client or service boundary.
- Command logic does not directly depend on environment variable lookup.
- Authentication details are isolated from command business logic.
- Future GitHub App authentication can be added without rewriting command behavior.
- Tests can mock GitHub authentication independently from command parsing.

---

### NFR-SEC-003 — Least-privilege token documentation

The system documentation shall recommend the least privileged token profile appropriate for each use case.

**Acceptance criteria**

- Documentation includes a full MVP operator token profile.
- Documentation includes a report-only token profile.
- Documentation includes a grade-only token profile.
- Documentation explains which commands each token profile supports.
- Documentation explains which commands each token profile does not support.
- Documentation recommends scoping tokens to the course organization and required repositories when possible.

---

### NFR-SEC-004 — Token permission failure diagnostics

The system shall report clear errors when GitHub token permissions are insufficient.

**Acceptance criteria**

- If GitHub rejects the token, Graider reports `github_auth_failed`.
- If GitHub accepts the token but denies the requested operation, Graider reports `github_permission_denied`.
- If available, verbose output includes GitHub accepted-permissions response header information.
- Permission failures exit with code `3`.
- Permission failures identify the failed capability when possible, such as repository creation, team access, workflow dispatch, artifact download, or report publishing.

---

### NFR-SEC-005 — Secret redaction

The system shall redact secrets from command output, logs, plans, manifests, and reports.

**Acceptance criteria**

- GitHub tokens are never printed in normal command output.
- GitHub tokens are never written to logs.
- GitHub tokens are never written to manifests.
- GitHub tokens are never written to plan files.
- GitHub tokens are never written to report files.
- Token-like values appearing in exception messages are replaced with `[REDACTED]`.
- Redaction applies before data is written to disk or displayed to the user.

---

### NFR-SEC-006 — No credential persistence

The system shall not persist GitHub credentials in Graider-managed files.

**Acceptance criteria**

- Tokens are read from the environment at runtime.
- Tokens are not stored in `course.yml`.
- Tokens are not stored in `term.yml`.
- Tokens are not stored in `assignment.yml`.
- Tokens are not stored in manifests, plans, reports, or logs.
- Generated examples and templates do not include real token values.

---

### NFR-SEC-007 — Student data minimization

The system shall store and report only the student data required for MVP operation.

**Acceptance criteria**

- MVP roster requires only `student_id`, `github_username`, `section`, and `status`.
- Manifests do not store student names, email addresses, grades, or LMS identifiers unless later requirements add them.
- Faculty reports include only the MVP student identity fields plus repository, submission, grading, warning, and error data.
- Student reports do not expose other students’ data.
- Published student reports contain only the receiving student’s assignment/report data.

---

### NFR-SEC-008 — Student report isolation

The system shall ensure that reports published to student repositories contain only that student’s report data.

**Acceptance criteria**

- `grading/report.md` contains only the target student’s report.
- `grading/results.json` contains only the target student’s normalized report data.
- Published reports do not include the faculty summary.
- Published reports do not include other students’ IDs, usernames, repository names, results, warnings, or errors.
- Report publishing failures are reported per student without exposing other students’ report contents.

---

### NFR-SEC-009 — Raw grading logs excluded by default

The system shall exclude raw grading logs from reports by default.

**Acceptance criteria**

- `grading-results.json` does not require raw logs.
- Faculty reports do not include raw workflow logs.
- Student reports do not include raw workflow logs.
- Published `grading/results.json` does not include raw workflow logs.
- If raw log inclusion is added later, it requires explicit configuration or command-line opt-in.

---

### NFR-SEC-010 — Private repositories by default

The system shall create all MVP student repositories as private repositories.

**Acceptance criteria**

- `course.yml` must set `github.repository_visibility: private`.
- Validation fails if repository visibility is not `private`.
- `apply` creates private student repositories.
- No MVP command makes a student repository public.
- Public student repositories are not supported in MVP.

---

### NFR-SEC-011 — Faculty and grader access through teams

The system shall manage faculty and grader access through configured GitHub teams.

**Acceptance criteria**

- Faculty access is applied through the configured faculty team.
- Grader/TA access is applied through the configured grader team.
- Faculty team permission is `admin`.
- Grader team permission is `maintain`.
- Missing configured teams cause validation failure.
- Graider does not require individual faculty or TA usernames in assignment configuration for MVP.

---

### NFR-SEC-012 — Student access is individual and limited

The system shall grant student access as individual collaborator access with `push` permission.

**Acceptance criteria**

- Students are added as individual collaborators.
- Student permission is `push`.
- Students are not granted `admin` by Graider in MVP.
- Students are not granted team-based access by Graider in MVP.
- If a student already has higher-than-expected access, Graider leaves it unchanged and reports a warning.

---

### NFR-SEC-013 — GitHub organization boundary

The system shall restrict MVP operations to the configured GitHub organization.

**Acceptance criteria**

- Template repositories must be in the configured organization.
- Generated student repositories are created in the configured organization.
- Faculty and grader teams are resolved in the configured organization.
- Validation fails if the template repository is outside the configured organization.
- Graider does not create student repositories outside the configured organization in MVP.

---

### NFR-SEC-014 — Safe handling of GitHub API errors

The system shall avoid exposing sensitive GitHub API response details in normal output.

**Acceptance criteria**

- Normal command output summarizes GitHub API errors using Graider error codes.
- Verbose output may include additional GitHub diagnostic details after redaction.
- Token values and authorization headers are never shown.
- HTTP response bodies are redacted before being written to logs.
- Permission errors are mapped to `github_permission_denied`.
- Authentication errors are mapped to `github_auth_failed`.

---

### NFR-SEC-015 — Security-relevant audit trail

The system shall record security-relevant operations without recording secrets.

**Acceptance criteria**

- Manifests record when student access is applied.
- Manifests record whether student collaborator status is `active`, `invited`, or `unknown`.
- Manifests record when student access is removed.
- Manifests record when repositories are archived.
- Operation logs may record permission operations and lifecycle operations.
- Operation logs do not contain credentials.

---

### NFR-SEC-016 — Token profile setup documentation

The system documentation shall include setup guidance for GitHub tokens.

**Acceptance criteria**

- Documentation explains how `GRAIDER_GITHUB_TOKEN` and `GITHUB_TOKEN` are used.
- Documentation recommends `GRAIDER_GITHUB_TOKEN` for Graider-specific credentials.
- Documentation explains that fine-grained personal access tokens may require organization approval.
- Documentation recommends periodic token rotation.
- Documentation states that long-term authentication should move toward a GitHub App.
- Documentation warns users not to commit tokens to the course-admin repository.

---

## 4. Auditability and Traceability Requirements

### NFR-AUDIT-001 — Manifest as generated-state record

The system shall use the manifest as the durable record of actual generated GitHub state for an assignment.

**Acceptance criteria**

- `graider apply` creates the manifest when provisioning starts successfully.
- The manifest records assignment identity.
- The manifest records source file paths and hashes.
- The manifest records generated repository names, GitHub repository IDs, and repository URLs.
- The manifest records student-to-repository mappings.
- The manifest records applied permissions.
- The manifest records repository lifecycle state.
- The manifest records warnings and errors associated with repository records.
- The manifest is updated after successful GitHub operations.

---

### NFR-AUDIT-002 — Source file hashing and input fingerprinting

The system shall record hashes of input files used to produce generated state and shall compute a combined input fingerprint.

**Acceptance criteria**

- The manifest records a hash for `course.yml`.
- The manifest records a hash for `term.yml`.
- The manifest records a hash for `assignment.yml`.
- The manifest records hashes for each section roster used by the assignment.
- Plan files record the same source file hash structure.
- Hashes change when the corresponding source file content changes.
- Hashes are recorded separately per file.
- The manifest records a combined `input_fingerprint` derived from the ordered source file paths and hashes.
- Plan files record the same combined `input_fingerprint`.
- The `input_fingerprint` changes when any included source file hash changes.

---

### NFR-AUDIT-003 — Template source tracking

The system shall record the template repository source used to create student repositories.

**Acceptance criteria**

- The manifest records the template repository full name.
- The manifest records the template branch.
- The manifest records the template commit SHA used during apply.
- If the template commit later differs from the recorded commit, Graider can emit `template_changed_since_apply`.
- Existing student repositories are not automatically updated when the template changes.

---

### NFR-AUDIT-004 — Plan files as review artifacts

The system shall generate plan files as immutable review artifacts.

**Acceptance criteria**

- `graider plan` writes a timestamped JSON plan file.
- Plan files include assignment identity.
- Plan files include source file paths and hashes.
- Plan files include summary counts.
- Plan files include planned, no-op, skipped, and blocked operations.
- Plan files include structured warnings and errors.
- MVP plan files are not executable inputs to `apply`.
- `graider apply` computes its own plan rather than applying a saved plan file.

---

### NFR-AUDIT-005 — Operation summaries

The system shall record operation summaries for commands that modify or observe GitHub state.

**Acceptance criteria**

- `apply` records counts of repositories created, existing, failed, skipped, warnings, and errors.
- `grade` records counts of workflows triggered, skipped, failed, warnings, and errors.
- `report` records counts of reports generated, missing results, invalid results, warnings, and errors.
- `archive` records counts of repositories archived, already archived, skipped, failed, warnings, and errors.
- `remove-access` records counts of student access removed, already absent, skipped, failed, warnings, and errors.
- Operation summaries appear in command output.
- Operation summaries are suitable for inclusion in logs or manifests.

---

### NFR-AUDIT-006 — Structured warnings and errors

The system shall represent warnings and errors using structured catalog codes.

**Acceptance criteria**

- Warnings include a lowercase `snake_case` code.
- Errors include a lowercase `snake_case` code.
- Warnings written to files include `observed_at`.
- Errors written to files include `observed_at`.
- Warnings and errors include a human-readable message.
- Warnings and errors include relevant context when available.
- The same error/warning catalog is used in command output, logs, manifests, plans, and reports.

---

### NFR-AUDIT-007 — Local logs

The system shall support local structured logs for command execution.

**Acceptance criteria**

- Commands may write logs under `terms/<term>/logs/<assignment>/`.
- Logs use JSON Lines format.
- Logs include timestamped operation events.
- Logs include command name.
- Logs include affected repository or student when applicable.
- Logs include warning/error codes when applicable.
- Logs are not committed to the course-admin repository for MVP.
- Missing logs do not prevent later commands from running.

---

### NFR-AUDIT-008 — Timestamp consistency

The system shall record timestamps consistently in generated files.

**Acceptance criteria**

- Timestamps written to manifests include timezone offsets.
- Timestamps written to plan files include timezone offsets.
- Timestamps written to reports include timezone offsets.
- Timestamps written to logs include timezone offsets.
- Timestamps use ISO-8601-compatible formatting.
- The default timezone is inherited from `course.yml`.
- Assignment due dates must include timezone offsets.

---

### NFR-AUDIT-009 — Report traceability

The system shall make generated reports traceable to assignment, repository, submission, and grading state.

**Acceptance criteria**

- `faculty-summary.json` includes assignment identity.
- `faculty-summary.json` includes report generation timestamp.
- Student rows include student ID, GitHub username, section, and roster status.
- Student rows include repository name and URL when available.
- Student rows include latest commit SHA when available.
- Student rows include latest push timestamp when available.
- Student rows include grading workflow/result status.
- Student rows include warnings and errors.
- Student Markdown reports include assignment, student, repository, submission, and grading information.

---

### NFR-AUDIT-010 — Manifest update traceability

The system shall record meaningful manifest updates caused by operational commands.

**Acceptance criteria**

- `apply` updates manifest repository and permission state.
- `archive` updates repository archive state and archive timestamp.
- `remove-access` updates student access removal state and timestamp.
- `report` updates observed report/grading status for existing repo records.
- `grade` may append operation summary information.
- Manifest updates do not erase existing repository identity data.
- Manifest updates preserve prior warnings/errors unless they are explicitly superseded by fresh observed state.

---

### NFR-AUDIT-011 — No silent mutation

The system shall report all GitHub mutations performed by a command.

**Acceptance criteria**

- Repository creation appears in command output or structured summary.
- Collaborator additions appear in command output or structured summary.
- Team permission additions appear in command output or structured summary.
- Actions enablement appears in command output or structured summary.
- Workflow dispatch triggers appear in command output or structured summary.
- Report publication commits appear in command output or structured summary.
- Archive operations appear in command output or structured summary.
- Student access removals appear in command output or structured summary.

---

### NFR-AUDIT-012 — Reproducible planning context

The system shall include enough context in plan files to understand why operations were planned, skipped, no-op, or blocked.

**Acceptance criteria**

- Every plan operation includes an operation ID.
- Every plan operation includes an operation type.
- Every plan operation includes an operation status.
- Every plan operation includes `requires`.
- Skipped operations include a reason.
- Blocked operations include a reason.
- No-op operations include a reason when helpful.
- Student-scoped operations include student ID, GitHub username, and section.
- Repository-scoped operations include repository name.

---

### NFR-AUDIT-013 — Command JSON output traceability

The system shall make JSON command output traceable to generated files.

**Acceptance criteria**

- `validate --json` includes validation status, warnings, and errors.
- `plan --json` includes or references the generated plan file path.
- `report --json` includes or references generated report file paths.
- JSON command output includes assignment identity when applicable.
- JSON command output includes command result status.
- JSON command output uses the canonical warning/error codes.

---

### NFR-AUDIT-014 — Distinguish intended state from observed state

The system shall distinguish intended configuration from observed GitHub state.

**Acceptance criteria**

- `assignment.yml` represents intended assignment configuration.
- `manifest.yml` represents actual generated state.
- `plan.json` represents intended operations based on current input and observed state.
- `faculty-summary.json` represents observed report state at report generation time.
- Graider does not treat manifest state as the sole source of current GitHub truth.
- Commands query GitHub for fresh state before making decisions that depend on remote state.

---

### NFR-AUDIT-015 — History limits for MVP

The system shall keep MVP audit history simple and bounded by file organization rather than requiring complex historical databases.

**Acceptance criteria**

- Plan files are timestamped and may accumulate over time.
- Reports overwrite current report files for MVP.
- Logs are local-only and not required for later operation.
- Manifest operations may append summaries, but MVP does not require indefinite detailed operation history.
- MVP does not require an external database for audit history.
- MVP does not require server-side audit storage beyond GitHub and the course-admin repository files.

---

## 5. Usability Requirements

### NFR-USE-001 — Human-readable command output

The system shall provide human-readable output for every command.

**Acceptance criteria**

- `validate` summarizes validation success, warnings, and errors.
- `plan` summarizes planned, no-op, skipped, and blocked operations.
- `apply` summarizes created, existing, skipped, and failed repositories.
- `grade` summarizes triggered, skipped, and failed workflow runs.
- `report` summarizes generated report files and publish results.
- `archive` summarizes archived, already archived, skipped, and failed repositories.
- `remove-access` summarizes removed, already absent, skipped, and failed student access.
- Command output identifies the assignment being processed.

---

### NFR-USE-002 — JSON output for automation

The system shall support machine-readable JSON output for automation-oriented commands.

**Acceptance criteria**

- `graider validate --json` emits machine-readable validation results.
- `graider plan --json` emits or references a machine-readable plan summary.
- `graider report --json` emits or references generated report paths and summary status.
- JSON output includes assignment identity when applicable.
- JSON output includes command result status.
- JSON output uses canonical warning/error codes.
- JSON output does not include secrets.

---

### NFR-USE-003 — Clear validation diagnostics

The system shall provide actionable validation diagnostics.

**Acceptance criteria**

- Validation errors identify the affected file when applicable.
- Validation errors identify the affected field when applicable.
- Roster validation errors identify the affected section and row when applicable.
- GitHub validation errors identify the affected repository, team, user, or workflow when applicable.
- Diagnostics use canonical error/warning codes.
- Diagnostics include human-readable messages suitable for faculty/TAs.

---

### NFR-USE-004 — Predictable command structure

The system shall use a consistent command structure across MVP commands.

**Acceptance criteria**

- MVP commands accept an explicit assignment config path.
- Commands that operate on selected students use the same target selector names.
- `--json` has consistent behavior where supported.
- `--yes` has consistent behavior for commands that require confirmation.
- `--verbose` has consistent behavior for additional diagnostics.
- Command names remain stable during MVP.

---

### NFR-USE-005 — Explicit generated file paths

The system shall report generated file paths after commands write files.

**Acceptance criteria**

- `plan` output includes the generated plan file path.
- `report` output includes generated faculty report paths.
- `report` output includes the student report directory.
- `apply` output includes the manifest path.
- Commands that write logs in verbose or configured logging mode include the log path.
- JSON command output includes generated file paths when applicable.

---

### NFR-USE-006 — Faculty-friendly summaries

The system shall summarize large multi-repository operations in a concise faculty-friendly format.

**Acceptance criteria**

- `apply` includes counts for created, existing, skipped, failed, warnings, and errors.
- `grade` includes counts for triggered, skipped, failed, warnings, and errors.
- `report` includes counts for passed, failed, error, skipped, not configured, not run, missing artifact, invalid result, warnings, and errors.
- `archive` includes counts for archived, already archived, skipped, failed, warnings, and errors.
- `remove-access` includes counts for removed, already absent, skipped, failed, warnings, and errors.
- Detailed per-student information is available in generated files or JSON output.

---

### NFR-USE-007 — Actionable blocked-operation output

The system shall explain blocked operations clearly enough for a user to resolve them.

**Acceptance criteria**

- Blocked repository collisions identify the expected repository name.
- Blocked lifecycle operations identify the assignment status that blocked the command.
- Blocked username mismatch cases identify the affected `student_id`.
- Blocked missing-manifest cases identify the expected manifest path.
- Blocked operations include canonical error codes.
- Command output distinguishes blocked operations from warnings.

---

### NFR-USE-008 — Confirmation prompt clarity

The system shall make confirmation prompts clear and specific.

**Acceptance criteria**

- Confirmation prompts identify the command being confirmed.
- Confirmation prompts identify the assignment being affected.
- Confirmation prompts summarize the number of repositories or students affected.
- Confirmation prompts summarize the types of GitHub changes that will occur.
- Confirmation prompts do not display secrets.
- Confirmation prompts are skipped only when `--yes` is provided.

---

### NFR-USE-009 — Non-interactive failure clarity

The system shall clearly explain when a command fails because it requires confirmation in a non-interactive environment.

**Acceptance criteria**

- Non-interactive confirmation failure uses `confirmation_required`.
- The error message states that `--yes` is required for non-interactive execution.
- The command performs no GitHub changes before failing.
- The command exits with code `1`.

---

### NFR-USE-010 — Consistent target selector feedback

The system shall provide clear feedback for target selectors.

**Acceptance criteria**

- If no target selector is supplied where required, the command reports `target_selector_missing`.
- If multiple target selectors are supplied, the command reports `target_selector_ambiguous`.
- If a target selector matches no students, the command reports `target_matches_no_students`.
- If a target selector matches students, command output reports how many students matched.
- If matched students are skipped because of roster status or lifecycle state, command output reports the skipped count.

---

### NFR-USE-011 — Grading-disabled messaging

The system shall clearly distinguish disabled grading from missing or failed grading.

**Acceptance criteria**

- When grading is disabled, reports use `not_configured`.
- When grading is disabled, `grade` reports that no workflow is configured for the assignment.
- When grading is enabled but no workflow run exists, reports use `not_run`.
- When grading is enabled but the workflow is missing, reports use `missing_workflow`.
- Student reports use human-readable text explaining `not_configured`.

---

### NFR-USE-012 — Stable terminology

The system shall use stable terminology across commands, generated files, reports, and documentation.

**Acceptance criteria**

- `student_id` is used consistently, not alternated with `student`, `id`, or `school_id`.
- `github_username` is used consistently.
- `section` is used consistently.
- `assignment.slug` is referred to as assignment slug.
- Repository lifecycle terms use `active`, `closed`, and `archived` consistently.
- Roster statuses use `active`, `dropped`, and `hold` consistently.
- Grading statuses use the defined report status vocabulary consistently.

---

### NFR-USE-013 — Default output avoids excessive detail

The system shall keep default command output concise while preserving access to detailed information.

**Acceptance criteria**

- Default command output shows summaries and high-priority errors.
- Per-student details are written to generated files or shown with `--verbose`.
- Stack traces are not shown in normal output.
- Raw GitHub API responses are not shown in normal output.
- Detailed diagnostics are available through `--verbose` after redaction.

---

### NFR-USE-014 — Documentation examples

The system documentation shall include practical command examples for MVP workflows.

**Acceptance criteria**

- Documentation includes a validate example.
- Documentation includes a plan example.
- Documentation includes an apply example.
- Documentation includes a grade example.
- Documentation includes a report example.
- Documentation includes a report publishing example.
- Documentation includes archive and remove-access examples.
- Examples use the finalized assignment path style.

---

### NFR-USE-015 — First-run guidance

The system shall provide helpful guidance when required setup is missing.

**Acceptance criteria**

- Missing `course.yml` reports the expected path.
- Missing `term.yml` reports the expected path.
- Missing `assignment.yml` reports the expected path.
- Missing GitHub token reports the supported environment variable names.
- Missing manifest during `report` suggests running `apply` first if appropriate.
- Missing roster file reports the configured roster path.

---

## 6. Maintainability Requirements

### NFR-MAINT-001 — Schema versioning

The system shall version all configuration and generated data schemas.

**Acceptance criteria**

- `course.yml` includes `schema_version`.
- `term.yml` includes `schema_version`.
- `assignment.yml` includes `schema_version`.
- `manifest.yml` includes `schema_version`.
- `plan.json` includes `schema_version`.
- `faculty-summary.json` includes `schema_version`.
- `grading-results.json` includes `schema_version`.
- Published `grading/results.json` includes `schema_version`.
- Unsupported schema versions produce a clear validation error.

---

### NFR-MAINT-002 — Stable schema evolution

The system shall be designed to allow future schema versions without breaking MVP files unexpectedly.

**Acceptance criteria**

- Schema validation is centralized rather than duplicated across commands.
- Unknown future schema versions are rejected with `invalid_schema_version`.
- Optional future-compatible fields may be ignored when explicitly allowed by the schema.
- Required MVP fields remain validated consistently across commands.
- Schema migration support may be added later without rewriting command behavior.

---

### NFR-MAINT-003 — Separation of command phases

The system shall separate command processing into validation, planning, execution, and reporting phases where applicable.

**Acceptance criteria**

- `apply` validates inputs before planning.
- `apply` computes a plan before executing GitHub operations.
- `apply` executes only if the plan has no blocked operations or errors.
- `report` separates data collection from report rendering.
- `validate` performs no execution phase.
- `plan` performs no execution phase.
- Tests can exercise validation, planning, execution, and reporting logic independently.

---

### NFR-MAINT-004 — GitHub client abstraction

The system shall isolate GitHub API access behind an internal client or service boundary.

**Acceptance criteria**

- Command logic does not directly construct raw GitHub API calls.
- Authentication is handled by the GitHub client/service boundary.
- GitHub API errors are normalized into Graider error codes.
- Tests can mock GitHub state without calling the real GitHub API.
- Future GitHub App authentication can be added without rewriting command behavior.

---

### NFR-MAINT-005 — Centralized error and warning catalog

The system shall use a centralized catalog of error and warning codes.

**Acceptance criteria**

- Error and warning codes are lowercase `snake_case`.
- Codes are reused consistently across command output, logs, manifests, plans, and reports.
- Adding a new code requires adding it to the catalog.
- Tests can assert error and warning codes without depending only on human-readable messages.
- Human-readable messages may change without changing canonical codes.

---

### NFR-MAINT-006 — Reusable validation components

The system shall implement validation logic in reusable components rather than duplicating validation per command.

**Acceptance criteria**

- Course config validation is reusable by `validate`, `plan`, `apply`, `grade`, and `report`.
- Term config validation is reusable by relevant commands.
- Assignment config validation is reusable by relevant commands.
- Roster validation is reusable by relevant commands.
- GitHub readiness validation is reusable by relevant commands.
- Validation results use the canonical warning/error structure.

---

### NFR-MAINT-007 — Config model normalization

The system shall normalize configuration and roster data into typed internal models before command execution.

**Acceptance criteria**

- `student_id` is normalized before repo naming, manifest updates, and reports.
- `github_username` is normalized before repo naming, manifest updates, and reports.
- Section IDs preserve leading zeros.
- Assignment slug is validated before use.
- Term code is validated before use.
- Commands operate on normalized internal models rather than raw parsed YAML/CSV rows.

---

### NFR-MAINT-008 — Deterministic rendering

The system shall render generated files deterministically where content has not changed.

**Acceptance criteria**

- YAML output field ordering is stable.
- JSON output field ordering is stable where supported by the implementation.
- CSV column ordering is stable.
- Markdown report section ordering is stable.
- Student rows are ordered deterministically by section and normalized `student_id`.
- Deterministic rendering supports useful diffs in Git.

---

### NFR-MAINT-009 — Minimal external state

The system shall not require an external database or server-side state store for MVP.

**Acceptance criteria**

- Course-admin repository files are sufficient for MVP persistent state.
- GitHub is the source of remote repository state.
- Manifest files record generated state.
- Plan files record review artifacts.
- Reports record observed report state.
- MVP commands do not require a running server.
- MVP commands do not require a database.

---

### NFR-MAINT-010 — Testable command architecture

The system shall support automated testing of command behavior without requiring live GitHub access for most tests.

**Acceptance criteria**

- Core validation logic can be tested with local fixture files.
- Planning logic can be tested with mocked GitHub state.
- Report rendering can be tested with fixture report data.
- Error code behavior can be tested without live GitHub access.
- Live GitHub integration tests are optional and isolated from normal unit tests.
- Tests can verify exit codes, generated files, and structured warnings/errors.

---

### NFR-MAINT-011 — Dependency isolation

The system shall isolate dependencies that are likely to change.

**Acceptance criteria**

- GitHub API interactions are isolated behind a client boundary.
- File-system operations are isolated enough to support fixture-based tests.
- Time generation is isolated enough to support deterministic tests.
- Hash generation is isolated enough to support deterministic tests.
- Report rendering is isolated from GitHub data collection.
- Command-line parsing is isolated from command business logic.

---

### NFR-MAINT-012 — Backward-compatible command expansion

The system shall allow future commands and shorthand syntax without breaking MVP command forms.

**Acceptance criteria**

- MVP assignment-file command forms remain valid.
- Future repo shorthand can be added without removing assignment-file commands.
- Future `create-assignment` command can reuse existing config schema logic.
- Future adoption/migration commands can reuse manifest and GitHub client logic.
- Future group assignment commands can extend assignment type handling without changing individual assignment semantics.

---

### NFR-MAINT-013 — Documentation organization

The system documentation shall separate formal requirements, supporting specifications, and implementation guidance.

**Acceptance criteria**

- Formal requirements are stored separately from design examples.
- Error/warning catalog is stored as a supporting specification.
- GitHub token permission guidance is stored as a security/setup specification.
- Repo layout and schema examples are stored as design/specification documents.
- Test plan and traceability matrix are stored separately from the requirements document.
- Documentation structure supports future updates without merging all material into one file.

---

### NFR-MAINT-014 — Stable generated file contracts

The system shall treat generated file structures as explicit contracts during MVP.

**Acceptance criteria**

- Manifest structure changes require schema version consideration.
- Plan structure changes require schema version consideration.
- Faculty summary JSON changes require schema version consideration.
- Published student results JSON changes require schema version consideration.
- CSV column changes are documented.
- Report path changes are documented.
- Breaking changes are not made silently.

---

### NFR-MAINT-015 — Future feature containment

The system shall contain deferred features so they do not complicate MVP behavior.

**Acceptance criteria**

- Group assignments are excluded from MVP command behavior.
- Hidden faculty tests are excluded from MVP command behavior.
- LMS integration is excluded from MVP command behavior.
- Feedback pull requests are excluded from MVP command behavior.
- Repository adoption is excluded from MVP command behavior.
- Empty repository assignment support is excluded from MVP command behavior.
- Deferred features may be documented but do not affect MVP validation or execution.

---

## 7. Performance and Scale Requirements

### NFR-PERF-001 — MVP class-size support

The system shall support typical course assignment sizes for MVP.

**Acceptance criteria**

- Graider supports assignments with at least 150 active students.
- Graider supports assignments spanning multiple sections.
- Graider supports generating reports for all active students in an assignment.
- Graider supports applying permissions for all active students in an assignment.
- Graider does not require manual batching for typical course sizes.

---

### NFR-PERF-002 — Large roster validation

The system shall validate rosters efficiently for typical course sizes.

**Acceptance criteria**

- Roster validation supports at least 500 total term roster rows.
- Duplicate `student_id` detection works across all term roster files.
- Duplicate `github_username` detection works across all term roster files.
- Validation reports all detected duplicate roster problems when practical, rather than stopping at the first row.
- Roster validation time remains acceptable for interactive CLI use at MVP course sizes.

---

### NFR-PERF-003 — GitHub API rate-limit awareness

The system shall avoid unnecessary GitHub API calls and respect GitHub rate limits.

**Acceptance criteria**

- Graider reuses fetched GitHub state within a command when safe.
- Graider does not repeatedly query the same repository, team, or user unnecessarily during one command.
- Graider detects GitHub rate-limit responses.
- Graider honors `Retry-After` headers when present.
- Graider reports `github_rate_limited` when rate limits prevent completion.
- Rate-limit failures exit with code `4`.

---

### NFR-PERF-004 — Bounded concurrency

The system shall use bounded concurrency for GitHub operations when concurrency is implemented.

**Acceptance criteria**

- GitHub operations are not executed with unbounded parallelism.
- Default concurrency is conservative enough to avoid triggering GitHub secondary rate limits during typical course operations.
- The implementation provides a centralized concurrency limit for GitHub operations.
- Failed concurrent operations are reported per student/repository.
- Concurrent execution does not make plan or report output nondeterministic.

---

### NFR-PERF-005 — Deterministic output under concurrency

The system shall preserve deterministic generated output even when operations are performed concurrently.

**Acceptance criteria**

- Generated plans order operations deterministically by section and normalized `student_id`.
- Faculty summary rows are ordered deterministically by section and normalized `student_id`.
- Student report paths are deterministic.
- Manifest repository entries are ordered deterministically when rendered.
- Concurrency does not change generated file ordering across equivalent runs.

---

### NFR-PERF-006 — Avoid unnecessary repository mutation

The system shall avoid performing GitHub mutation calls when the desired state already exists.

**Acceptance criteria**

- `apply` does not call repository creation when a manifest-tracked repository already exists.
- `apply` does not re-add a student collaborator when the expected access already exists.
- `apply` does not re-add team permissions when expected access already exists.
- `archive` does not re-archive already archived repositories.
- `remove-access` does not attempt unnecessary collaborator removal when access is already absent.
- Avoided operations are reflected as no-op where applicable.

---

### NFR-PERF-007 — Efficient report generation

The system shall generate reports efficiently for typical assignment sizes.

**Acceptance criteria**

- `report` supports at least 150 active student repositories.
- `report` can collect workflow/artifact status for all manifest-tracked repositories in an assignment.
- `report` avoids downloading artifacts when grading is disabled.
- `report` avoids downloading artifacts when no relevant workflow run exists.
- `report` records missing or invalid artifacts without blocking report generation for other students.
- Report generation can continue across independent per-student artifact failures.

---

### NFR-PERF-008 — Efficient validation before mutation

The system shall perform validation and blocked-operation detection before GitHub mutation begins.

**Acceptance criteria**

- `apply` validates local config and roster data before making GitHub changes.
- `apply` checks for repository collisions before creating repositories.
- `apply` refuses to execute if blocked operations exist.
- Avoiding mutation on invalid input prevents wasted API calls.
- Validation errors are reported before any mutation occurs.

---

### NFR-PERF-009 — Streaming or incremental progress for long commands

The system shall provide progress feedback for long-running commands.

**Acceptance criteria**

- `apply` provides progress feedback during multi-repository operations.
- `grade` provides progress feedback while triggering workflows.
- `report` provides progress feedback while collecting grading results.
- `archive` provides progress feedback while archiving repositories.
- `remove-access` provides progress feedback while removing student access.
- Progress output remains concise and does not print excessive per-student detail unless `--verbose` is used.

---

### NFR-PERF-010 — Reasonable file sizes

The system shall keep generated files reasonably sized for normal Git workflows.

**Acceptance criteria**

- Faculty summary JSON contains structured summary data but does not include raw workflow logs.
- Faculty summary CSV contains flat rows and does not include raw workflow logs.
- Student Markdown reports do not include raw workflow logs.
- Published `grading/results.json` does not include raw workflow logs.
- Local logs may be larger but are not committed for MVP.
- Generated reports remain suitable for committing to the course-admin repository for typical course sizes.

---

### NFR-PERF-011 — Timeout handling

The system shall handle long-running GitHub operations without leaving command results ambiguous.

**Acceptance criteria**

- Network timeouts are reported with structured error codes.
- Retryable timeouts are retried according to the retry policy.
- Non-recoverable timeouts are reported per affected operation when possible.
- Commands with timeout-related partial failures exit with code `2` if some work succeeded.
- Commands with systemic timeout failures exit with code `4`.
- Completed work before timeout is reflected in manifest/log output when applicable.

---

### NFR-PERF-012 — Incremental manifest updates for scale

The system shall update manifest state incrementally during large `apply` operations.

**Acceptance criteria**

- Successful repository creation is recorded in the manifest as soon as practical.
- Successful permission application is recorded in the manifest as soon as practical.
- If a large `apply` run is interrupted, completed manifest-recorded work is not repeated unnecessarily.
- Incremental manifest updates do not corrupt the manifest if the command is interrupted.
- Manifest writes are deterministic and preserve existing valid state.

---

### NFR-PERF-013 — No required manual batching

The system shall not require faculty to manually split normal assignment operations into batches for MVP course sizes.

**Acceptance criteria**

- `apply --all` supports typical course assignment sizes.
- `grade --all` supports typical course assignment sizes when grading is enabled.
- `report` supports typical course assignment sizes.
- `archive --all` supports typical course assignment sizes.
- `remove-access --all` supports typical course assignment sizes.
- If rate limits or failures require stopping, rerunning the same command resumes safely.

---

### NFR-PERF-014 — Configurable implementation limits

The system should centralize performance-related implementation limits.

**Acceptance criteria**

- Retry count is centrally configured.
- GitHub operation concurrency limit is centrally configured.
- Network timeout values are centrally configured.
- Rate-limit handling policy is centrally configured.
- Defaults are safe for MVP course use.
- Future configuration of these limits does not require rewriting command logic.

---

### NFR-PERF-015 — Performance does not weaken safety

The system shall not trade safety guarantees for performance.

**Acceptance criteria**

- Concurrency does not bypass validation.
- Concurrency does not bypass blocked-plan checks.
- Concurrency does not cause non-deterministic generated output.
- Performance optimizations do not skip permission verification.
- Performance optimizations do not skip collision detection.
- Performance optimizations do not expose secrets in output or logs.

---

## 8. Portability and Environment Requirements

### NFR-PORT-001 — CLI-first operation

The system shall be usable as a command-line tool without requiring a web application.

**Acceptance criteria**

- All MVP workflows can be performed through CLI commands.
- No MVP command requires a browser-based UI.
- No MVP command requires a running Graider server.
- The CLI can be run from the course-admin repository working directory.
- The CLI can resolve paths relative to the course-admin repository root.

---

### NFR-PORT-002 — Local execution support

The system shall support local execution by faculty or course staff.

**Acceptance criteria**

- Graider can run from a local checkout of the course-admin repository.
- Graider can read local config, roster, manifest, plan, and report files.
- Graider can write generated manifests, plans, reports, and logs locally.
- Graider can authenticate to GitHub using environment variables.
- Local execution does not require CI-specific environment variables.

---

### NFR-PORT-003 — CI execution support

The system shall support execution in CI environments.

**Acceptance criteria**

- Commands that modify GitHub state support `--yes`.
- Commands that would otherwise prompt fail in non-interactive environments unless `--yes` is provided.
- GitHub authentication can be provided through environment variables.
- Machine-readable output is available for validation, planning, and reporting.
- Exit codes distinguish success, failure, partial success, auth failure, API failure, and schema/config failure.

---

### NFR-PORT-004 — Environment-variable authentication

The system shall support environment-variable based authentication for MVP.

**Acceptance criteria**

- Graider checks `GRAIDER_GITHUB_TOKEN` first.
- If `GRAIDER_GITHUB_TOKEN` is absent, Graider checks `GITHUB_TOKEN`.
- If neither token exists and the command requires GitHub access, the command fails with `github_auth_missing`.
- Tokens are not read from command-line arguments in MVP.
- Tokens are not read from Graider config files in MVP.

---

### NFR-PORT-005 — Repository-root discovery

The system shall reliably identify the course-admin repository root.

**Acceptance criteria**

- When run from the course-admin repository root, Graider finds `course.yml`.
- When run from a subdirectory of the course-admin repository, Graider can locate the nearest parent containing `course.yml`.
- If no `course.yml` can be found, Graider reports `missing_required_file`.
- Commands may also accept explicit assignment file paths.
- Path resolution is consistent between local and CI execution.

---

### NFR-PORT-006 — Relative path support

The system shall support relative paths in configuration files according to the finalized repo layout.

**Acceptance criteria**

- Roster paths in `term.yml` are resolved relative to the term folder.
- Assignment paths are resolved relative to the course-admin repository root when provided on the CLI.
- Report paths are generated relative to the course-admin repository root.
- Manifest paths are generated relative to the course-admin repository root.
- Plan paths are generated relative to the course-admin repository root.
- Generated paths use stable path separators in output.

---

### NFR-PORT-007 — Cross-platform path behavior

The system shall handle file paths consistently across supported operating systems.

**Acceptance criteria**

- Graider supports path resolution on macOS.
- Graider supports path resolution on Linux.
- Graider supports path resolution on Windows where practical for the chosen implementation language.
- Generated files use repository-relative paths in manifests, plans, and reports.
- Repository-relative paths in generated files use forward slashes.
- Absolute local machine paths are avoided in committed generated files unless explicitly needed for local logs.

---

### NFR-PORT-008 — No external database dependency

The system shall not require an external database for MVP operation.

**Acceptance criteria**

- Persistent MVP state is stored in the course-admin repository files and GitHub.
- Manifest files store generated assignment state.
- Plan files store review artifacts.
- Reports store observed reporting state.
- Local logs may store command execution details.
- No MVP command requires a database server.

---

### NFR-PORT-009 — No long-running service dependency

The system shall not require a long-running background service for MVP operation.

**Acceptance criteria**

- Commands run to completion as CLI invocations.
- Graider does not require a daemon process.
- Graider does not require a hosted web service.
- Graider does not require a scheduler service for MVP.
- Manual grading is triggered through `graider grade`, not a background Graider service.

---

### NFR-PORT-010 — Git compatibility

The system shall generate files suitable for committing to Git.

**Acceptance criteria**

- Generated Markdown files are plain text.
- Generated JSON files are formatted deterministically.
- Generated CSV files use stable column ordering.
- Generated YAML files use stable field ordering where applicable.
- Generated files avoid machine-specific absolute paths where practical.
- Generated files avoid secrets.

---

### NFR-PORT-011 — CI-friendly output

The system shall produce output suitable for CI logs.

**Acceptance criteria**

- Default output is concise.
- Errors are clearly labeled.
- Warnings are clearly labeled.
- Generated file paths are printed when files are written.
- `--json` output is available for automation-supported commands.
- Nonzero exit codes are meaningful for CI failure handling.
- Output does not require terminal interactivity when `--yes` is used.

---

### NFR-PORT-012 — Runtime dependency clarity

The system documentation shall clearly describe runtime dependencies.

**Acceptance criteria**

- Documentation identifies the required runtime or package manager.
- Documentation identifies required GitHub token environment variables.
- Documentation identifies whether Git is required locally.
- Documentation identifies supported operating systems.
- Documentation identifies any optional dependencies.
- Documentation includes a minimal installation or execution example.

---

### NFR-PORT-013 — GitHub-hosted environment compatibility

The system should be able to run in GitHub-hosted automation environments when provided appropriate credentials.

**Acceptance criteria**

- Graider can run in GitHub Actions or comparable CI environments.
- Graider can use environment-provided credentials.
- Graider can run without interactive prompts when `--yes` is provided.
- Graider can write generated files into the checked-out course-admin repository.
- Graider can use exit codes to signal workflow success or failure.
- Graider documentation explains that token permissions must be sufficient for the target operation.

---

### NFR-PORT-014 — No reliance on global machine state

The system shall avoid relying on global machine state for MVP behavior.

**Acceptance criteria**

- Commands do not require globally configured GitHub CLI authentication.
- Commands do not require globally configured Git identity unless committing generated files through Git is explicitly part of the selected implementation.
- Commands do not require user-specific global config files for core behavior.
- Required runtime configuration is provided through files in the course-admin repo, command-line arguments, or environment variables.
- Behavior remains consistent across developer machines and CI environments.

---

### NFR-PORT-015 — Future packaging flexibility

The system shall be designed so packaging can evolve without changing command semantics.

**Acceptance criteria**

- Command names and arguments are independent of packaging mechanism.
- The same command behavior can be provided through a local binary, script, package manager install, or CI invocation.
- Implementation does not require users to modify course-admin repository layout based on packaging mechanism.
- Documentation can describe multiple installation methods later without changing formal command behavior.
- Future packaging changes do not invalidate MVP requirements.

---

## 9. Data Retention and Privacy Requirements

### NFR-PRIV-001 — MVP student data minimization

The system shall use the minimum student identity data required for MVP operation.

**Acceptance criteria**

- MVP roster files require only `student_id`, `github_username`, `section`, and `status`.
- MVP manifests store `student_id`, `github_username`, `section`, and roster status.
- MVP faculty reports store `student_id`, `github_username`, `section`, and roster status.
- MVP student reports store only the receiving student’s `student_id`, `github_username`, and section.
- MVP does not require student names.
- MVP does not require student email addresses.
- MVP does not require LMS user identifiers.

---

### NFR-PRIV-002 — No secrets in persistent files

The system shall not store secrets in persistent Graider-managed files.

**Acceptance criteria**

- Tokens are not stored in `course.yml`.
- Tokens are not stored in `term.yml`.
- Tokens are not stored in `assignment.yml`.
- Tokens are not stored in manifests.
- Tokens are not stored in plans.
- Tokens are not stored in reports.
- Tokens are not stored in logs.
- Any token-like value is redacted before being written.

---

### NFR-PRIV-003 — Course-admin repository as primary persistent store

The system shall use the course-admin repository as the primary persistent store for MVP generated files.

**Acceptance criteria**

- Manifests are stored in the course-admin repository.
- Plan files are stored in the course-admin repository.
- Faculty reports are stored in the course-admin repository.
- Student report copies are stored in the course-admin repository.
- Course, term, assignment, and roster files are stored in the course-admin repository.
- MVP does not require an external database or separate persistent service.

---

### NFR-PRIV-004 — Local logs are not committed for MVP

The system shall treat command logs as local operational artifacts that are not committed for MVP.

**Acceptance criteria**

- Logs may be written under `terms/<term>/logs/<assignment>/`.
- Logs are not required for later command execution.
- Logs are not required in the course-admin repository history.
- Missing logs do not block `validate`, `plan`, `apply`, `grade`, `report`, `archive`, or `remove-access`.
- Documentation states that logs are local-only for MVP.
- Logs do not contain secrets.

---

### NFR-PRIV-005 — Student report isolation

The system shall ensure that student-published reports contain only the target student’s information.

**Acceptance criteria**

- Published `grading/report.md` includes only the target student’s assignment/report information.
- Published `grading/results.json` includes only the target student’s normalized report data.
- Published reports do not include faculty summary data.
- Published reports do not include other students’ `student_id` values.
- Published reports do not include other students’ GitHub usernames.
- Published reports do not include other students’ repository names.
- Published reports do not include aggregate class performance summaries.

---

### NFR-PRIV-006 — Faculty reports are course-admin only

The system shall generate faculty summary reports only in the course-admin repository.

**Acceptance criteria**

- `faculty-summary.md` is written only under `terms/<term>/reports/<assignment>/`.
- `faculty-summary.csv` is written only under `terms/<term>/reports/<assignment>/`.
- `faculty-summary.json` is written only under `terms/<term>/reports/<assignment>/`.
- Faculty summaries are not committed to student repositories.
- Faculty summaries are not included in published student reports.
- Faculty summaries may include all assignment roster target rows and manifest/GitHub state.

---

### NFR-PRIV-007 — Raw grading logs excluded by default

The system shall exclude raw grading logs from generated reports and published student files by default.

**Acceptance criteria**

- `faculty-summary.md` does not include raw workflow logs.
- `faculty-summary.csv` does not include raw workflow logs.
- `faculty-summary.json` does not include raw workflow logs.
- Student Markdown reports do not include raw workflow logs.
- Published `grading/results.json` does not include raw workflow logs.
- Raw logs may only be included later through explicit configuration or command option.

---

### NFR-PRIV-008 — Report overwrite policy

The system shall overwrite current report files for MVP rather than retaining every report generation in committed history paths.

**Acceptance criteria**

- `graider report` overwrites `faculty-summary.md`.
- `graider report` overwrites `faculty-summary.csv`.
- `graider report` overwrites `faculty-summary.json`.
- `graider report` overwrites student Markdown report files under `students/<section>/`.
- `graider report --publish-student-reports` overwrites `grading/report.md` in student repos.
- `graider report --publish-student-reports` overwrites `grading/results.json` in student repos.
- Historical report retention, if needed, is provided by Git history rather than timestamped report paths in MVP.

---

### NFR-PRIV-009 — Plan retention policy

The system shall retain generated plan files as timestamped review artifacts.

**Acceptance criteria**

- `graider plan` writes timestamped plan files.
- Plan files may accumulate over time.
- Plan files include intended operations but do not include secrets.
- Plan files include source hashes and input fingerprint.
- Plan files are not executable inputs to `apply` in MVP.
- Plan cleanup is not required for MVP.

---

### NFR-PRIV-010 — Manifest retention policy

The system shall retain manifests as durable generated-state records.

**Acceptance criteria**

- Manifests are not overwritten with empty state during failed commands.
- Manifest repository records are preserved across repeated command runs.
- Manifest records are updated as observed state changes.
- Manifest records do not store raw grading logs.
- Manifest records do not store secrets.
- Manifest history is retained through Git history when committed.

---

### NFR-PRIV-011 — Published student data minimization

The system shall minimize data committed back to student repositories.

**Acceptance criteria**

- Student repositories receive only `grading/report.md` and `grading/results.json` when publishing is enabled.
- Published files contain only target-student report data.
- Published files do not contain roster files.
- Published files do not contain manifests.
- Published files do not contain faculty summaries.
- Published files do not contain local command logs.
- Published files do not contain GitHub tokens or credential metadata.

---

### NFR-PRIV-012 — Data location transparency

The system documentation shall clearly explain where Graider stores each category of data.

**Acceptance criteria**

Documentation identifies storage locations for:

- course configuration
- term configuration
- assignment configuration
- rosters
- manifests
- plan files
- faculty reports
- student report copies in the course-admin repository
- published student reports in student repositories
- local logs
- GitHub repository state

---

### NFR-PRIV-013 — No hidden third-party data transfer

The system shall not send MVP data to services other than GitHub unless explicitly added in a future integration.

**Acceptance criteria**

- MVP commands use local files and GitHub APIs only.
- MVP commands do not send roster data to an LMS.
- MVP commands do not send report data to an LMS.
- MVP commands do not send report data to analytics services.
- MVP commands do not require a third-party hosted Graider service.
- Future integrations must be explicitly documented and configured.

---

### NFR-PRIV-014 — Controlled LMS-related data

The system shall keep LMS-related data optional and minimal for MVP.

**Acceptance criteria**

- `metadata.lms_assignment_id` may be `null`.
- Graider does not require LMS assignment IDs in MVP.
- Graider does not require LMS user IDs in MVP.
- Graider does not write reports to an LMS in MVP.
- Graider does not read LMS rosters in MVP.
- Future LMS integration must be explicitly added outside MVP.

---

### NFR-PRIV-015 — Privacy-preserving diagnostics

The system shall keep diagnostics useful without exposing unnecessary student data.

**Acceptance criteria**

- Command summaries use aggregate counts by default.
- Per-student diagnostics are available through generated reports or `--verbose`.
- Published student reports do not expose other students.
- Error messages identify affected student IDs or usernames only when needed to resolve the issue.
- Logs do not contain secrets.
- Raw GitHub API response bodies are redacted before being logged.

---

## 10. Observability Requirements

### NFR-OBS-001 — Concise default command output

The system shall provide concise default output suitable for normal faculty use.

**Acceptance criteria**

- Default command output summarizes the command result.
- Default command output includes assignment identity.
- Default command output includes warning and error counts.
- Default command output includes generated file paths when files are written.
- Default command output does not include stack traces.
- Default command output does not include raw GitHub API responses.
- Default command output does not include secrets.

---

### NFR-OBS-002 — Verbose diagnostics

The system shall provide additional diagnostics through `--verbose`.

**Acceptance criteria**

- `--verbose` may include per-student operation details.
- `--verbose` may include GitHub request context after redaction.
- `--verbose` may include retry attempts and retry timing.
- `--verbose` may include skipped/no-op operation details.
- `--verbose` may include generated log file paths.
- `--verbose` output does not include secrets.
- `--verbose` output redacts token-like values before display.

---

### NFR-OBS-003 — Structured command summaries

The system shall produce structured summaries for commands that process multiple students or repositories.

**Acceptance criteria**

- `apply` summary includes created, existing, skipped, failed, warnings, and errors.
- `grade` summary includes triggered, skipped, failed, warnings, and errors.
- `report` summary includes generated reports, published reports, missing results, invalid results, warnings, and errors.
- `archive` summary includes archived, already archived, skipped, failed, warnings, and errors.
- `remove-access` summary includes removed, already absent, skipped, failed, warnings, and errors.
- Summaries are included in human-readable output.
- Summaries are available in JSON output where supported.

---

### NFR-OBS-004 — Machine-readable output

The system shall provide machine-readable output for automation-supported commands.

**Acceptance criteria**

- `validate --json` produces machine-readable validation output.
- `plan --json` produces or references machine-readable plan data.
- `report --json` produces or references machine-readable report data.
- JSON output includes command result status.
- JSON output includes assignment identity.
- JSON output includes warning and error codes.
- JSON output includes generated file paths when applicable.
- JSON output does not include secrets.

---

### NFR-OBS-005 — Local command logs

The system shall support local command logs for troubleshooting.

**Acceptance criteria**

- Logs may be written under `terms/<term>/logs/<assignment>/`.
- Logs use JSON Lines format.
- Log entries include timestamps with timezone offsets.
- Log entries include command name.
- Log entries include event type.
- Log entries include affected student/repository when applicable.
- Log entries include warning/error codes when applicable.
- Logs do not contain secrets.

---

### NFR-OBS-006 — Progress reporting for long-running commands

The system shall provide progress reporting for commands that may process many repositories.

**Acceptance criteria**

- `apply` reports progress while processing multiple repositories.
- `grade` reports progress while triggering multiple workflows.
- `report` reports progress while collecting results across multiple repositories.
- `archive` reports progress while archiving multiple repositories.
- `remove-access` reports progress while removing access across multiple repositories.
- Progress output remains concise in default mode.
- Detailed per-student progress is available through `--verbose`.

---

### NFR-OBS-007 — Retry visibility

The system shall make retry behavior observable without overwhelming normal output.

**Acceptance criteria**

- Retry attempts are recorded in logs when logs are enabled.
- Retry attempts may be shown in `--verbose` output.
- Default output summarizes retry-related failures if retries are exhausted.
- Rate-limit retries include the `github_rate_limited` code when applicable.
- Network retry failures include an appropriate GitHub/network error code.
- Retry output does not include secrets.

---

### NFR-OBS-008 — Rate-limit diagnostics

The system shall provide useful diagnostics when GitHub rate limits affect command execution.

**Acceptance criteria**

- Rate-limit failures use the `github_rate_limited` error code.
- Command output states that GitHub rate limits prevented completion.
- If available, reset or retry timing is included in verbose output.
- Rate-limit diagnostics are recorded in logs when logs are enabled.
- Rate-limit failures exit with code `4`.
- Completed work before rate-limit failure is reported in the command summary.

---

### NFR-OBS-009 — Error code visibility

The system shall display or record canonical error and warning codes wherever practical.

**Acceptance criteria**

- Human-readable command output includes error codes for failures.
- JSON output includes error and warning codes.
- Logs include error and warning codes.
- Manifests include error and warning codes where applicable.
- Plans include error and warning codes where applicable.
- Reports include error and warning codes where applicable.

---

### NFR-OBS-010 — Generated artifact discoverability

The system shall make generated files easy to find after command execution.

**Acceptance criteria**

- `plan` output includes the generated plan path.
- `apply` output includes the manifest path.
- `report` output includes faculty report paths.
- `report` output includes the student report directory.
- `report --publish-student-reports` summarizes published student repo paths.
- JSON output includes generated file paths where applicable.

---

### NFR-OBS-011 — Failure context preservation

The system shall preserve enough context to diagnose failures after a command exits.

**Acceptance criteria**

- Failed operations include affected student ID when applicable.
- Failed operations include affected GitHub username when applicable.
- Failed operations include affected repository name when applicable.
- Failed operations include command name.
- Failed operations include canonical error code.
- Failed operations include human-readable message.
- Failed operations written to files include `observed_at`.

---

### NFR-OBS-012 — No raw stack traces in normal output

The system shall suppress raw stack traces in normal command output.

**Acceptance criteria**

- Normal output does not display stack traces for expected command, validation, GitHub, or schema errors.
- Normal output maps expected failures to Graider error codes.
- Stack traces may be available only in a future debug mode or developer mode.
- Stack traces are not written to user-facing reports.
- Stack traces are not written to manifests or plans.
- Any future stack trace output must be redacted.

---

### NFR-OBS-013 — Report-generation observability

The system shall make report generation status observable.

**Acceptance criteria**

- `report` output identifies the assignment being reported.
- `report` output summarizes grading statuses.
- `report` output summarizes missing artifacts.
- `report` output summarizes invalid result files.
- `report` output summarizes generated faculty reports.
- `report` output summarizes generated student reports.
- `report` output identifies whether student reports were published.

---

### NFR-OBS-014 — Validation observability

The system shall make validation results clear and actionable.

**Acceptance criteria**

- `validate` output states whether validation passed or failed.
- `validate` output includes warning count.
- `validate` output includes error count.
- `validate` output identifies files with validation errors.
- `validate` output identifies GitHub readiness failures.
- `validate --json` includes structured validation results.

---

### NFR-OBS-015 — Observability does not weaken privacy

The system shall ensure diagnostics and logs do not expose data beyond what is required for troubleshooting.

**Acceptance criteria**

- Tokens and secrets are redacted from all observability outputs.
- Published student reports do not include other students’ diagnostic data.
- Normal command output uses aggregate counts when detailed per-student output is not required.
- `--verbose` may include per-student details but must not include secrets.
- Logs do not contain raw authorization headers.
- Raw GitHub API response bodies are redacted before logging.

---

## 11. Exit Code Requirements

### NFR-EXIT-001 — Stable exit code model

The system shall use a stable MVP exit code model.

**Acceptance criteria**

| Code | Meaning                                             |
| ---: | --------------------------------------------------- |
|  `0` | Success                                             |
|  `1` | Validation or command error                         |
|  `2` | Partial success                                     |
|  `3` | Authentication or authorization failure             |
|  `4` | GitHub API, network, timeout, or rate-limit failure |
|  `5` | Configuration or schema error                       |

---

### NFR-EXIT-002 — Success exit code

The system shall exit with code `0` when a command completes successfully.

**Acceptance criteria**

- Commands with no errors exit with code `0`.
- Commands with warnings only exit with code `0`.
- `validate` exits with code `0` when validation succeeds, even if warnings are present.
- `plan` exits with code `0` when a plan is generated successfully, even if warnings are present.
- `report` exits with code `0` when reports are generated successfully, even if warnings are present.

---

### NFR-EXIT-003 — Validation or command error exit code

The system shall exit with code `1` for domain validation failures or command usage errors.

**Acceptance criteria**

- Duplicate roster student IDs exit with code `1`.
- Duplicate roster GitHub usernames exit with code `1`.
- Invalid roster status exits with code `1`.
- Missing required command target selector exits with code `1`.
- Ambiguous command target selector exits with code `1`.
- Target selector matching no students exits with code `1`.
- Lifecycle state blocking a command exits with code `1`.
- Grading disabled when running `grade` exits with code `1`.
- Confirmation required but not provided exits with code `1`.
- Blocked plan operations exit with code `1` unless caused by schema/config errors.

---

### NFR-EXIT-004 — Partial success exit code

The system shall exit with code `2` when a command completes with mixed successes and failures.

**Acceptance criteria**

- If `apply` succeeds for some students and fails for others, it exits with code `2`.
- If `grade` triggers some workflows and fails/skips others due to per-repo failures, it exits with code `2`.
- If `report` generates some student reports but fails for others, it exits with code `2`.
- If `archive` archives some repositories and fails for others, it exits with code `2`.
- If `remove-access` removes access for some students and fails for others, it exits with code `2`.
- Partial success output includes successful, failed, skipped, warning, and error counts.

---

### NFR-EXIT-005 — Authentication or authorization failure exit code

The system shall exit with code `3` for authentication and authorization failures.

**Acceptance criteria**

- Missing token exits with code `3`.
- Invalid token exits with code `3`.
- Expired token exits with code `3`.
- Token rejected by GitHub exits with code `3`.
- Token lacking required permission exits with code `3`.
- Organization token approval failure exits with code `3`.
- Authentication/authorization failures use `github_auth_missing`, `github_auth_failed`, or `github_permission_denied`.

---

### NFR-EXIT-006 — GitHub API/network/rate-limit exit code

The system shall exit with code `4` for GitHub API, network, timeout, or rate-limit failures that prevent command completion.

**Acceptance criteria**

- GitHub API failure exits with code `4` when it prevents completion.
- GitHub rate-limit exhaustion exits with code `4`.
- GitHub secondary rate-limit failure after retries exits with code `4`.
- Network timeout that prevents completion exits with code `4`.
- Network failure that prevents completion exits with code `4`.
- GitHub 5xx failure after retries exits with code `4`.
- Failures use codes such as `github_api_error`, `github_network_error`, or `github_rate_limited`.

---

### NFR-EXIT-007 — Configuration or schema error exit code

The system shall exit with code `5` for configuration file, schema, or structural input errors.

**Acceptance criteria**

- Missing required config file exits with code `5`.
- Malformed YAML exits with code `5`.
- Malformed JSON exits with code `5`.
- Missing required config field exits with code `5`.
- Unsupported `schema_version` exits with code `5`.
- Invalid file layout exits with code `5`.
- Invalid assignment folder/slug mismatch exits with code `5`.
- Invalid term folder/code mismatch exits with code `5`.

---

### NFR-EXIT-008 — Precedence when multiple failure classes occur

The system shall apply deterministic exit code precedence when multiple failure classes occur in one command.

**Acceptance criteria**

Exit code precedence, highest priority first:

1. `3` — Authentication or authorization failure.
2. `5` — Configuration or schema error.
3. `4` — GitHub API, network, timeout, or rate-limit failure.
4. `2` — Partial success.
5. `1` — Validation or command error.
6. `0` — Success or warnings only.

Examples:

- If config is malformed and roster also has duplicate students, exit code is `5`.
- If token is missing and config is otherwise valid, exit code is `3`.
- If some repositories are created and others fail due to per-repo validation/API issues, exit code is `2`.
- If warnings occur but no errors occur, exit code is `0`.

---

### NFR-EXIT-009 — JSON output includes exit classification

The system shall include exit classification data in JSON output where JSON output is supported.

**Acceptance criteria**

- `validate --json` includes command result status.
- `validate --json` includes the intended exit code or exit classification.
- `plan --json` includes command result status.
- `plan --json` includes the intended exit code or exit classification.
- `report --json` includes command result status.
- `report --json` includes the intended exit code or exit classification.
- JSON output includes warnings and errors using canonical codes.

---

### NFR-EXIT-010 — Exit code documentation

The system documentation shall document exit codes and common causes.

**Acceptance criteria**

- Documentation includes the full MVP exit code table.
- Documentation explains that warnings alone exit with code `0`.
- Documentation explains that partial success exits with code `2`.
- Documentation explains authentication/authorization failures exit with code `3`.
- Documentation explains GitHub API/rate-limit failures exit with code `4`.
- Documentation explains config/schema failures exit with code `5`.
- Documentation includes examples of common failures and their exit codes.
