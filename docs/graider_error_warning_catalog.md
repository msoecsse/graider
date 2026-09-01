# Graider Error and Warning Code Catalog

This catalog defines structured codes for validation output, plans, manifests, reports, command summaries, and logs.

Recommended structured shape:

```json
{
  "code": "duplicate_student_id",
  "severity": "error",
  "category": "roster",
  "message": "Student ID \"jones\" appears more than once in the term roster set.",
  "context": {
    "student_id": "jones"
  },
  "observed_at": "2026-09-01T14:30:00-05:00"
}
```

## Severity Levels

| Severity  | Meaning                                          |
| --------- | ------------------------------------------------ |
| `error`   | Command cannot complete the requested operation  |
| `warning` | Command can continue, but the user should review |
| `info`    | Informational status used in logs/reports        |

## Locked Catalog Decisions

| Item                            | Decision                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Warnings alone                  | Exit code `0`                                                                     |
| Config/schema structural errors | Exit code `5`                                                                     |
| Domain validation failures      | Exit code `1`                                                                     |
| Code naming                     | Lowercase `snake_case`                                                            |
| Catalog usage                   | Same catalog used for logs, reports, manifests, and JSON command output           |
| `observed_at`                   | Required for warnings/errors written to files; optional for direct command output |

---

# 1. Configuration/schema codes

| Code                                    | Severity | Meaning                                                           |
| --------------------------------------- | -------- | ----------------------------------------------------------------- |
| `missing_required_file`                 | error    | Required config/input file is missing                             |
| `invalid_yaml`                          | error    | YAML file cannot be parsed                                        |
| `invalid_json`                          | error    | JSON file cannot be parsed                                        |
| `missing_required_field`                | error    | Required field is missing                                         |
| `invalid_schema_version`                | error    | `schema_version` is missing or unsupported                        |
| `invalid_field_value`                   | error    | Field value is syntactically valid but not allowed                |
| `invalid_path`                          | error    | Path does not match required layout                               |
| `assignment_slug_folder_mismatch`       | error    | `assignment.slug` does not match assignment folder                |
| `term_code_folder_mismatch`             | error    | `term.code` does not match term folder                            |
| `invalid_term_code`                     | error    | Term code does not match `YYsN`                                   |
| `invalid_assignment_type`               | error    | Assignment type is not supported in MVP                           |
| `invalid_assignment_status`             | error    | Assignment lifecycle state is not recognized                      |
| `invalid_grading_override`              | error    | Assignment grading override is partial or inconsistent            |
| `grading_disabled_with_override_fields` | error    | `grading.enabled: false` includes workflow/artifact/result fields |
| `invalid_due_date`                      | error    | Deadline is missing, invalid, or lacks timezone offset            |
| `invalid_report_format`                 | error    | Required report formats are missing or unsupported                |

---

# 2. Roster codes

| Code                             | Severity | Meaning                                                   |
| -------------------------------- | -------- | --------------------------------------------------------- |
| `missing_roster_column`          | error    | Required roster CSV column is missing                     |
| `missing_roster_value`           | error    | Required value in a roster row is missing                 |
| `invalid_roster_status`          | error    | Roster status is not `active`, `dropped`, or `hold`       |
| `roster_section_mismatch`        | error    | Row section does not match section roster file            |
| `duplicate_student_id`           | error    | Student ID appears more than once in term roster set      |
| `duplicate_github_username`      | error    | GitHub username appears more than once in term roster set |
| `student_id_normalized`          | warning  | Student ID was not lowercase and was normalized           |
| `github_username_normalized`     | warning  | GitHub username was not lowercase and was normalized      |
| `invalid_github_username_syntax` | error    | GitHub username has invalid syntax                        |
| `github_user_not_found`          | error    | GitHub username does not exist                            |
| `hold_student_skipped`           | info     | Student with `hold` status was skipped                    |
| `dropped_student_skipped`        | info     | Dropped student was skipped during provisioning           |
| `active_student_missing_repo`    | warning  | Active student has no repo in report output               |

---

# 3. GitHub/template codes

| Code                                | Severity | Meaning                                                  |
| ----------------------------------- | -------- | -------------------------------------------------------- |
| `github_auth_missing`               | error    | No usable GitHub token found                             |
| `github_auth_failed`                | error    | Token is invalid or rejected                             |
| `github_permission_denied`          | error    | Token lacks required permission                          |
| `github_rate_limited`               | error    | GitHub API rate limit blocks operation                   |
| `github_api_error`                  | error    | Non-specific GitHub API error                            |
| `github_network_error`              | error    | Network failure calling GitHub                           |
| `template_repo_missing`             | error    | Template repository does not exist or is inaccessible    |
| `template_repo_wrong_org`           | error    | Template repository is outside configured organization   |
| `template_not_marked_template`      | error    | Template repository is not a GitHub template repo        |
| `template_branch_missing`           | error    | Configured template branch does not exist                |
| `template_branch_not_default`       | error    | Configured template branch does not match default branch |
| `template_readme_missing`           | error    | Template repository does not contain `README.md`         |
| `template_changed_since_apply`      | warning  | Template commit differs from commit recorded in manifest |
| `template_grading_workflow_missing` | warning  | Grading is enabled but workflow is missing from template |

---

# 4. Repository/provisioning codes

| Code                          | Severity | Meaning                                                  |
| ----------------------------- | -------- | -------------------------------------------------------- |
| `repo_name_invalid`           | error    | Generated repo name is invalid                           |
| `repo_name_collision`         | error    | Expected repo exists but is not recorded in manifest     |
| `repo_create_failed`          | error    | Repository creation failed                               |
| `repo_created`                | info     | Repository was created                                   |
| `repo_create_noop`            | info     | Repository already exists and is manifest-tracked        |
| `repo_missing_from_github`    | error    | Manifest-tracked repo cannot be found on GitHub          |
| `repo_archived`               | info     | Repository was archived                                  |
| `repo_already_archived`       | info     | Archive operation was no-op                              |
| `repo_archive_failed`         | error    | Archive operation failed                                 |
| `repo_unexpected_archived`    | warning  | Repository is archived when command expected active repo |
| `repo_template_not_reapplied` | info     | Existing repo was not updated from changed template      |
| `repo_adoption_required`      | error    | Existing repo requires future explicit adoption flow     |

---

# 5. Permission codes

| Code                                      | Severity | Meaning                                                       |
| ----------------------------------------- | -------- | ------------------------------------------------------------- |
| `faculty_team_missing`                    | error    | Configured faculty team does not exist or is inaccessible     |
| `grader_team_missing`                     | error    | Configured grader team does not exist or is inaccessible      |
| `student_collaborator_added`              | info     | Student collaborator was added                                |
| `student_collaborator_invited`            | info     | Student collaborator invite is pending                        |
| `student_collaborator_missing`            | warning  | Expected student collaborator is missing                      |
| `student_permission_lower_than_expected`  | warning  | Student permission is lower than expected                     |
| `student_permission_higher_than_expected` | warning  | Student permission is higher than expected and left unchanged |
| `student_access_removed`                  | info     | Student collaborator access was removed                       |
| `student_access_already_removed`          | info     | Remove-access was no-op                                       |
| `student_access_remove_failed`            | error    | Student access removal failed                                 |
| `faculty_team_permission_added`           | info     | Faculty team permission added                                 |
| `grader_team_permission_added`            | info     | Grader team permission added                                  |
| `team_permission_lower_than_expected`     | warning  | Team permission is lower than expected                        |

---

# 6. Grading/reporting codes

| Code                            | Severity | Meaning                                             |
| ------------------------------- | -------- | --------------------------------------------------- |
| `grading_not_configured`        | info     | Assignment has grading disabled                     |
| `grading_workflow_missing`      | warning  | Grading is enabled but workflow is missing          |
| `workflow_dispatch_missing`     | warning  | Workflow exists but does not support manual trigger |
| `workflow_not_run`              | warning  | No grading workflow run found                       |
| `workflow_failed_no_results`    | warning  | Workflow failed before producing results            |
| `grading_artifact_missing`      | warning  | Expected grading artifact is missing                |
| `grading_result_file_missing`   | warning  | Artifact exists but result file is missing          |
| `grading_result_file_invalid`   | warning  | `grading-results.json` is invalid                   |
| `grading_result_valid`          | info     | `grading-results.json` is valid                     |
| `grading_result_status_passed`  | info     | Grading result status is `passed`                   |
| `grading_result_status_failed`  | warning  | Grading result status is `failed`                   |
| `grading_result_status_error`   | warning  | Grading result status is `error`                    |
| `grading_result_status_skipped` | info     | Grading result status is `skipped`                  |
| `student_report_generated`      | info     | Student report was generated                        |
| `student_report_published`      | info     | Student report was committed to student repo        |
| `student_report_publish_failed` | error    | Student report publish failed                       |
| `faculty_report_generated`      | info     | Faculty reports were generated                      |
| `late_submission`               | warning  | Last push occurred after due date                   |

---

# 7. Lifecycle/command codes

| Code                                     | Severity | Meaning                                           |
| ---------------------------------------- | -------- | ------------------------------------------------- |
| `assignment_status_blocks_apply`         | error    | Assignment status does not allow `apply`          |
| `assignment_status_blocks_grade`         | error    | Assignment status does not allow `grade`          |
| `assignment_status_blocks_archive`       | error    | Assignment status does not allow `archive`        |
| `assignment_status_blocks_remove_access` | error    | Assignment status does not allow `remove-access`  |
| `manifest_missing`                       | error    | Required manifest does not exist                  |
| `manifest_created`                       | info     | Manifest was created                              |
| `manifest_updated`                       | info     | Manifest was updated                              |
| `manifest_invalid`                       | error    | Manifest exists but cannot be parsed or validated |
| `blocked_operations_present`             | error    | Plan contains blocked operations                  |
| `confirmation_required`                  | error    | Command requires confirmation or `--yes`          |
| `target_selector_missing`                | error    | Command requires target selector                  |
| `target_selector_ambiguous`              | error    | More than one target selector was provided        |
| `target_matches_no_students`             | error    | Target selector matches no students               |
| `command_partial_success`                | warning  | Command completed with some failures              |
| `command_failed`                         | error    | Command failed                                    |
| `command_success`                        | info     | Command succeeded                                 |

---

# 8. Exit code mapping

| Code family                         | Typical exit code |
| ----------------------------------- | ----------------: |
| Configuration/schema errors         |               `5` |
| Validation/command errors           |               `1` |
| Authentication/authorization errors |               `3` |
| GitHub API/rate limit errors        |               `4` |
| Partial success                     |               `2` |
| Success/info/warnings only          |               `0` |
