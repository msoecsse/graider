# Error and Warning Catalog

Graider diagnostics use a canonical shape:

```text
code
severity
message
context
```

Exit-code precedence is centralized. Warnings alone exit `0`.

| Exit code | Meaning                                             |
| --------- | --------------------------------------------------- |
| `0`       | Success, including warnings-only results            |
| `1`       | Validation or command error                         |
| `2`       | Partial success                                     |
| `3`       | Authentication or authorization failure             |
| `4`       | GitHub API, network, timeout, or rate-limit failure |
| `5`       | Configuration, schema, or structural file error     |

## Catalog

| Code                                       | Severity      | Meaning                                                         | Typical exit code | Likely fix                                                                   |
| ------------------------------------------ | ------------- | --------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `missing_required_file`                    | error         | Required config/generated file is missing.                      | `5`               | Create the missing file or run from inside the course-admin repo.            |
| `invalid_yaml`                             | error         | YAML could not be parsed.                                       | `5`               | Fix YAML syntax.                                                             |
| `invalid_schema_version`                   | error         | File schema version is unsupported.                             | `5`               | Use supported `schema_version: 1`.                                           |
| `missing_required_field`                   | error         | Required YAML field is absent.                                  | `5`               | Add the missing field.                                                       |
| `invalid_term_code`                        | error         | Term code is invalid or mismatched.                             | `5`               | Check `term.yml` and assignment path.                                        |
| `assignment_slug_mismatch`                 | error         | Assignment slug does not match path.                            | `5`               | Align assignment folder and `assignment.slug`.                               |
| `term_code_mismatch`                       | error         | Term config does not match path.                                | `5`               | Align term folder and `term.code`.                                           |
| `invalid_assignment_type`                  | error         | Assignment type is unsupported.                                 | `5`               | Use MVP-supported `individual`.                                              |
| `invalid_assignment_status`                | error         | Assignment status is unsupported.                               | `5`               | Use `draft`, `active`, `closed`, or `archived`.                              |
| `invalid_repository_visibility`            | error         | Repository visibility is unsupported.                           | `5`               | Use configured MVP visibility, normally `private`.                           |
| `invalid_permission`                       | error         | Permission value is unsupported.                                | `5`               | Use a valid GitHub permission value.                                         |
| `invalid_grading_config`                   | error         | Grading configuration is incomplete or invalid.                 | `5`               | Fix workflow/artifact/result-file settings.                                  |
| `unsupported_grading_mode`                 | error         | Grading mode is unsupported or incompatible.                    | `5`               | Use `preset`, `custom-workflow`, `contract-only`, or disabled `no-grading`.  |
| `missing_grading_workflow`                 | error         | Enabled grading lacks a workflow path.                          | `5`               | Add `grading.workflow`.                                                      |
| `missing_grading_artifact`                 | error         | Enabled grading lacks an artifact name.                         | `5`               | Add `grading.artifact`.                                                      |
| `missing_grading_result_file`              | error         | Enabled grading lacks a result file path.                       | `5`               | Add `grading.result_file`.                                                   |
| `missing_grading_preset`                   | error         | Preset grading lacks a preset name.                             | `5`               | Add `grading.preset`.                                                        |
| `unsupported_grading_preset`               | error         | Grading preset is unsupported.                                  | `5`               | Use `java-junit-checkstyle`.                                                 |
| `unsupported_student_publish_mode`         | error         | Student report publishing mode is unsupported.                  | `5`               | Use `graider-generated`, `faculty-provided`, `both`, or disabled `disabled`. |
| `missing_student_publish_destination`      | error         | Student report publishing lacks a destination.                  | `5`               | Add the required destination file path.                                      |
| `missing_student_publish_source_file`      | error         | Faculty-provided publishing lacks a source file.                | `5`               | Add `source_file`.                                                           |
| `missing_student_publish_artifact`         | error         | Faculty-provided publishing lacks an artifact.                  | `5`               | Add `artifact`.                                                              |
| `missing_graider_report_destination`       | error         | `both` publishing lacks Graider report destination.             | `5`               | Add `graider_report_destination`.                                            |
| `missing_faculty_report_source`            | error         | `both` publishing lacks faculty report source.                  | `5`               | Add `faculty_report_source`.                                                 |
| `missing_faculty_report_destination`       | error         | `both` publishing lacks faculty report destination.             | `5`               | Add `faculty_report_destination`.                                            |
| `workflow_generation_not_configured`       | error         | Workflow generation was requested without enabled grading.      | `1`               | Enable preset grading before generating a workflow.                          |
| `workflow_generation_requires_preset_mode` | error         | Workflow generation requires preset grading mode.               | `1`               | Use `grading.mode: preset`.                                                  |
| `generated_workflow_exists`                | error         | Generated workflow target already exists.                       | `1`               | Choose another output path or rerun with `--force`.                          |
| `workflow_generation_write_failed`         | error         | Generated workflow could not be written.                        | `1`               | Check output path and filesystem permissions.                                |
| `missing_required_column`                  | error         | Roster CSV column is missing.                                   | `1`               | Add `student_id`, `github_username`, `section`, and `status`.                |
| `missing_required_value`                   | error         | Roster row value is missing.                                    | `1`               | Fill required roster fields.                                                 |
| `invalid_roster_status`                    | error         | Roster status is invalid.                                       | `1`               | Use `active`, `dropped`, or `hold`.                                          |
| `section_mismatch`                         | error         | Roster row section does not match section file.                 | `1`               | Correct the roster section value or file mapping.                            |
| `duplicate_student_id`                     | error         | Student ID appears more than once.                              | `1`               | Remove duplicate roster rows.                                                |
| `duplicate_github_username`                | error         | GitHub username appears more than once.                         | `1`               | Assign unique GitHub usernames.                                              |
| `invalid_github_username`                  | error         | GitHub username syntax is invalid.                              | `1`               | Correct username syntax.                                                     |
| `student_id_normalized`                    | warning       | Student ID was normalized.                                      | `0`               | Prefer lowercase normalized IDs in roster files.                             |
| `github_username_normalized`               | warning       | GitHub username was normalized.                                 | `0`               | Prefer lowercase GitHub usernames in roster files.                           |
| `roster_status_normalized`                 | warning       | Roster status was normalized.                                   | `0`               | Prefer lowercase roster statuses.                                            |
| `github_auth_missing`                      | error         | No GitHub token is configured.                                  | `3`               | Set `GRAIDER_GITHUB_TOKEN` or `GITHUB_TOKEN`.                                |
| `github_auth_failed`                       | error         | GitHub rejected the token.                                      | `3`               | Check token value, expiration, and organization approval.                    |
| `github_permission_denied`                 | error         | Token lacks required permission.                                | `3`               | Grant required repository/organization permission.                           |
| `github_api_error`                         | error         | GitHub API request failed.                                      | `4`               | Retry later or inspect GitHub status.                                        |
| `github_network_error`                     | error         | Network request to GitHub failed.                               | `4`               | Check network, proxy, DNS, and CI egress.                                    |
| `github_rate_limited`                      | error         | GitHub rate limit prevented completion.                         | `4`               | Wait for reset or reduce token activity.                                     |
| `github_timeout`                           | error         | GitHub operation timed out.                                     | `4`               | Retry later; check network stability.                                        |
| `invalid_template_repository`              | error         | Template repository name is malformed.                          | `1`               | Use `owner/repo`.                                                            |
| `template_repository_outside_org`          | error         | Template owner does not match configured org.                   | `1`               | Use a template in the configured organization.                               |
| `template_repository_missing`              | error         | Template repository was not found.                              | `1`               | Create/fix the template repo or token access.                                |
| `template_repository_not_template`         | error         | Repository is not marked as a GitHub template.                  | `1`               | Enable template repository setting.                                          |
| `template_branch_missing`                  | error         | Configured template branch is missing.                          | `1`               | Use an existing branch.                                                      |
| `template_branch_not_default`              | error         | Template branch is not default for MVP.                         | `1`               | Use the default branch.                                                      |
| `template_readme_missing`                  | error         | Template repository lacks `README.md`.                          | `1`               | Add `README.md`.                                                             |
| `faculty_team_missing`                     | error         | Faculty team slug was not found.                                | `1`               | Fix `github.faculty_team`.                                                   |
| `grader_team_missing`                      | error         | Grader team slug was not found.                                 | `1`               | Fix `github.grader_team`.                                                    |
| `github_user_missing`                      | error         | Roster GitHub user was not found.                               | `1`               | Correct roster username or invite/create account.                            |
| `invalid_repository_name`                  | error         | Generated repository name is invalid.                           | `1`               | Fix repo name pattern or source values.                                      |
| `repo_name_pattern_missing_placeholder`    | error         | Repo pattern lacks a required placeholder.                      | `1`               | Include term/course/assignment/github username placeholders.                 |
| `repo_name_pattern_unknown_placeholder`    | error         | Repo pattern has an unknown placeholder.                        | `1`               | Remove unsupported placeholder.                                              |
| `source_file_missing`                      | error         | Source file for fingerprinting is missing.                      | `5`               | Restore the source file.                                                     |
| `source_file_outside_repo`                 | error         | Source file is outside repo root.                               | `5`               | Keep source files inside course-admin repo.                                  |
| `source_file_not_file`                     | error         | Source path is not a file.                                      | `5`               | Point at a regular file.                                                     |
| `source_fingerprint_failed`                | error         | Source hashing failed.                                          | `5`               | Check file permissions and path.                                             |
| `repo_name_collision`                      | error         | Expected repo exists but is not manifest-tracked.               | `1`               | Resolve collision manually; Graider will not adopt it.                       |
| `assignment_not_active`                    | error         | Assignment lifecycle blocks operation.                          | `1`               | Use an active assignment where required.                                     |
| `assignment_closed_blocks_creation`        | error         | Closed assignment blocks new repo creation.                     | `1`               | Reopen or use manifest-tracked repos only where supported.                   |
| `assignment_archived`                      | error         | Archived assignment blocks operation.                           | `1`               | Do not mutate archived assignments in MVP.                                   |
| `plan_contains_blocked_operations`         | error         | Plan has blocked operations.                                    | `1`               | Fix plan errors before apply.                                                |
| `plan_write_failed`                        | error         | Plan file could not be written.                                 | `5`               | Check directory permissions.                                                 |
| `manifest_missing`                         | error         | Required manifest is missing.                                   | `5`               | Run apply or restore manifest.                                               |
| `invalid_manifest`                         | error         | Manifest YAML is invalid.                                       | `5`               | Fix or regenerate manifest.                                                  |
| `invalid_manifest_schema_version`          | error         | Manifest schema version is unsupported.                         | `5`               | Use manifest schema version `1`.                                             |
| `missing_manifest_section`                 | error         | Manifest required section is missing.                           | `5`               | Regenerate or repair manifest.                                               |
| `invalid_manifest_repository_record`       | error         | Manifest repository record is invalid.                          | `5`               | Repair affected record.                                                      |
| `invalid_manifest_lifecycle_status`        | error         | Manifest lifecycle status is invalid.                           | `5`               | Use supported lifecycle statuses.                                            |
| `invalid_manifest_permission`              | error         | Manifest permission value is invalid.                           | `5`               | Use valid GitHub permission values.                                          |
| `manifest_write_failed`                    | error         | Manifest file could not be written.                             | `5`               | Check directory permissions.                                                 |
| `mutation_blocked`                         | error         | Mutation guard refused execution.                               | `1`               | Review diagnostics and command options.                                      |
| `confirmation_required`                    | error         | Mutating command requires confirmation.                         | `1`               | Pass `--yes` in non-interactive runs.                                        |
| `manifest_tracked_repository_missing`      | error         | Manifest repo no longer exists.                                 | `1`               | Investigate GitHub state.                                                    |
| `grading_workflow_missing`                 | error         | Configured workflow was not found during validation or grading. | `1`               | Add/fix workflow path or generate/copy the preset workflow locally.          |
| `workflow_dispatch_unsupported`            | error         | Workflow lacks dispatch support.                                | `1`               | Add `workflow_dispatch` to the configured workflow.                          |
| `workflow_dispatch_missing`                | error         | Dispatch configuration is missing.                              | `1`               | Fix grading workflow config.                                                 |
| `workflow_dispatch_failed`                 | error         | Workflow dispatch failed.                                       | `1`, `3`, or `4`  | Check per-error context.                                                     |
| `permission_not_downgraded`                | warning       | Existing higher permission was preserved.                       | `0`               | No action needed unless permission is unexpected.                            |
| `unexpected_collaborator_preserved`        | warning       | Unknown collaborator was left unchanged.                        | `0`               | Review repository collaborators manually.                                    |
| `grading_not_configured`                   | warning/error | Assignment has no grading workflow.                             | `0` or `1`        | Enable grading, or treat grade as a no-op for no-grading assignments.        |
| `assignment_status_blocks_grade`           | error         | Assignment lifecycle blocks grade.                              | `1`               | Grade only supported lifecycle states.                                       |
| `target_selector_missing`                  | error         | Grade target selector missing.                                  | `1`               | Use exactly one selector.                                                    |
| `target_selector_ambiguous`                | error         | Multiple grade selectors provided.                              | `1`               | Use one selector.                                                            |
| `target_matches_no_students`               | error         | Selector matched no active students.                            | `1`               | Fix selector or roster status.                                               |
| `target_student_not_active`                | error         | Selected student is dropped/hold.                               | `1`               | Select an active student.                                                    |
| `student_repository_missing`               | error         | Student has no manifest-tracked repo.                           | `1`               | Run apply or repair manifest.                                                |
| `manifest_repository_missing`              | error         | Manifest repository identity is missing.                        | `5`               | Repair manifest.                                                             |
| `invalid_grading_result`                   | error         | Grading result shape is invalid.                                | `1`               | Fix `grading-results.json`.                                                  |
| `invalid_grading_result_schema_version`    | error         | Grading result schema version unsupported.                      | `1`               | Use schema version `1`.                                                      |
| `invalid_grading_result_status`            | error         | Grading result status is invalid.                               | `1`               | Use supported result status.                                                 |
| `invalid_grading_check_status`             | error         | Check status is invalid.                                        | `1`               | Use `passed`, `failed`, `error`, or `skipped`.                               |
| `missing_grading_check_name`               | error         | Check result lacks a name.                                      | `1`               | Add check name.                                                              |
| `invalid_grading_score`                    | error         | Score/points value is invalid.                                  | `1`               | Use numbers or `null`.                                                       |
| `grading_workflow_failed_with_results`     | warning       | Workflow failed but usable results existed.                     | `0`               | Review workflow and result details.                                          |
| `report_write_failed`                      | error         | Local report file write failed.                                 | `1` or `2`        | Check file permissions.                                                      |
| `student_report_publish_failed`            | error         | Publishing a student report failed.                             | `2`, `3`, or `4`  | Check per-student context and token permissions.                             |
| `student_report_repository_missing`        | error         | Student report target repo is missing.                          | `1` or `2`        | Run apply or repair manifest.                                                |
| `student_report_source_missing`            | error         | Faculty-provided student report file is missing from artifact.  | `2`               | Fix `student_publish.source_file` or update the grading workflow artifact.   |
| `student_report_artifact_missing`          | error         | Faculty-provided student report artifact is missing.            | `2`               | Check `student_publish.artifact` and the grading workflow artifact upload.   |
| `student_report_write_failed`              | error         | GitHub Contents write failed.                                   | `2`, `3`, or `4`  | Check token/repo permissions.                                                |
| `student_report_publish_partial`           | warning       | Some student reports published and some failed.                 | `2`               | Review failed student diagnostics.                                           |
| `student_report_publish_not_requested`     | info          | Publishing was not requested.                                   | `0`               | Pass `--publish-student-reports` if desired.                                 |
| `not_supported_in_mvp`                     | error         | Reserved command is unsupported in MVP.                         | `1`               | Do not use archive/remove-access for MVP behavior.                           |
