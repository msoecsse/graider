# Graider MVP Architecture

Working title: **graider**  
Implementation stack: **TypeScript + Node.js LTS**

---

## 1. Purpose

This document defines the proposed MVP architecture for Graider.

Graider is a CLI-first tool for managing GitHub-based course assignments. The MVP focuses on:

- creating individual student repositories from GitHub template repositories
- applying faculty, grader, and student permissions
- supporting GitHub Actions based grading workflows
- generating faculty and student reports
- archiving repositories and removing student access through explicit commands
- keeping operations safe, idempotent, auditable, and testable

The architecture is designed to support fast MVP delivery while preserving long-term maintainability and expansion.

---

## 2. Architecture Goals

Graider should be:

| Goal          | Meaning                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| Safe          | No hidden destructive behavior; no repo deletion; explicit mutation commands    |
| Testable      | Most tests run without live GitHub access                                       |
| Deterministic | Stable generated output for useful Git diffs                                    |
| Maintainable  | Clear module boundaries and centralized schema/error handling                   |
| Extensible    | Future support for groups, LMS integration, adoption flows, and GitHub App auth |
| Deployable    | Packaged as a predictable CLI using Node.js LTS and pinned dependencies         |

---

## 3. Technology Stack

### 3.1 Runtime and language

| Decision        | Choice                        |
| --------------- | ----------------------------- |
| Language        | TypeScript                    |
| Runtime         | Node.js LTS                   |
| Module format   | ESM                           |
| Package manager | pnpm, with lockfile committed |
| Build tool      | tsup                          |
| Test runner     | Vitest                        |

### 3.2 Core libraries

| Concern                | Library                                                   |
| ---------------------- | --------------------------------------------------------- |
| CLI parsing            | Commander                                                 |
| GitHub API             | Octokit                                                   |
| Schema validation      | Zod                                                       |
| YAML parsing/rendering | yaml                                                      |
| CSV parsing/rendering  | csv-parse / csv-stringify or lightweight internal wrapper |
| Markdown rendering     | Internal renderer                                         |
| JSON output            | Native JSON with stable stringify helper                  |
| Logging                | Internal JSON Lines logger                                |
| Date/time              | Native Date plus timezone-aware formatting helper         |

### 3.3 Dependency discipline

The MVP should keep dependencies intentionally small.

Required controls:

- commit `pnpm-lock.yaml`
- enable strict TypeScript
- use pinned dependency versions
- run dependency audit in CI
- enable Dependabot or equivalent dependency update checks
- avoid dependencies for trivial utilities
- wrap third-party libraries at module boundaries

---

## 4. High-Level Architecture

Graider should be organized as a command pipeline:

```text
CLI parsing
  -> command orchestration
    -> config loading
      -> schema validation
        -> model normalization
          -> GitHub state discovery
            -> planning
              -> execution
                -> manifest/report/log rendering
```

Not every command uses every phase.

Examples:

- `validate` stops after validation and GitHub readiness checks.
- `plan` stops after writing a plan.
- `apply` validates, plans, executes, and updates the manifest.
- `report` validates, collects observed state, and renders reports.

---

## 5. Command Pipeline

### 5.1 Common command context

Each command should create a shared `CommandContext`.

```ts
export interface CommandContext {
  commandName: string;
  cwd: string;
  repoRoot: string;
  assignmentPath: string;
  startedAt: ZonedTimestamp;
  options: CommonCommandOptions;
  github: GitHubClient;
  logger: GraiderLogger;
}
```

Common options:

```ts
export interface CommonCommandOptions {
  json: boolean;
  verbose: boolean;
  yes: boolean;
}
```

### 5.2 Pipeline phases

| Phase     | Responsibility                                                    |
| --------- | ----------------------------------------------------------------- |
| Parse     | Parse CLI args and options                                        |
| Locate    | Discover course-admin repo root and resolve assignment path       |
| Load      | Read YAML/CSV/JSON files                                          |
| Validate  | Validate schema, layout, roster, assignment, and GitHub readiness |
| Normalize | Convert raw config into typed internal models                     |
| Discover  | Query current GitHub state when needed                            |
| Plan      | Compute intended operations                                       |
| Execute   | Perform GitHub mutations when allowed                             |
| Render    | Write manifest, plan, reports, JSON output, and logs              |

---

## 6. Package Layout

Recommended source tree:

```text
src/
  cli/
    index.ts
    commands/
      validate.command.ts
      plan.command.ts
      apply.command.ts
      grade.command.ts
      report.command.ts
      archive.command.ts
      remove-access.command.ts

  core/
    command-context.ts
    command-result.ts
    exit-codes.ts
    clock.ts
    paths.ts

  config/
    load-course-config.ts
    load-term-config.ts
    load-assignment-config.ts
    config-models.ts
    config-schemas.ts
    config-validation.ts

  roster/
    roster-loader.ts
    roster-models.ts
    roster-validation.ts
    roster-normalization.ts

  github/
    github-client.ts
    octokit-github-client.ts
    fake-github-client.ts
    github-models.ts
    github-errors.ts
    github-retry.ts
    github-rate-limit.ts

  planning/
    plan-models.ts
    plan-builder.ts
    operation-models.ts
    operation-ordering.ts
    plan-renderer.ts

  execution/
    apply-executor.ts
    grade-executor.ts
    archive-executor.ts
    remove-access-executor.ts
    mutation-guard.ts

  manifest/
    manifest-models.ts
    manifest-loader.ts
    manifest-renderer.ts
    manifest-updater.ts

  reporting/
    report-models.ts
    report-collector.ts
    faculty-json-renderer.ts
    faculty-csv-renderer.ts
    faculty-markdown-renderer.ts
    student-markdown-renderer.ts
    student-results-json-renderer.ts

  grading/
    grading-result-models.ts
    grading-result-validator.ts
    grading-status-mapper.ts

  diagnostics/
    error-catalog.ts
    diagnostic.ts
    redaction.ts
    result-summary.ts

  logging/
    jsonl-logger.ts
    log-event.ts

  io/
    file-system.ts
    stable-json.ts
    stable-yaml.ts
    csv.ts

tests/
  fixtures/
  unit/
  cli/
  github/
  reporting/
  recovery/
  live/
```

---

## 7. Command Responsibilities

### 7.1 `graider validate`

Purpose:

- validate local config and roster files
- validate assignment layout
- validate template repo readiness
- validate GitHub users/teams/repositories/workflows as needed
- perform no mutations

Pipeline:

```text
parse -> locate -> load -> validate -> discover GitHub readiness -> output
```

Mutation policy:

```text
No GitHub mutations.
No manifest writes.
No plan writes.
```

---

### 7.2 `graider plan`

Purpose:

- compute intended operations
- write a timestamped plan file
- perform no GitHub mutations
- do not update manifest

Pipeline:

```text
parse -> locate -> load -> validate -> discover GitHub state -> plan -> render plan
```

Mutation policy:

```text
No GitHub mutations.
No manifest writes.
Writes only plan file and optional local logs.
```

---

### 7.3 `graider apply`

Purpose:

- compute its own plan
- refuse to run if plan contains blocked operations or errors
- create missing repos for active students
- apply expected additive permissions
- enable/verify Actions
- update manifest incrementally

Pipeline:

```text
parse -> locate -> load -> validate -> discover GitHub state -> plan -> confirm -> execute -> update manifest
```

Mutation policy:

```text
Additive only.
No deletion.
No archive.
No access removal.
No permission downgrade.
No unknown repo adoption.
```

---

### 7.4 `graider grade`

Purpose:

- manually trigger grading workflow dispatch for selected student repos

Pipeline:

```text
parse -> locate -> load -> validate -> load manifest -> select targets -> verify workflow -> dispatch
```

Mutation policy:

```text
May trigger GitHub Actions workflow_dispatch.
Does not create repos.
Does not change permissions.
Does not archive repos.
```

---

### 7.5 `graider report`

Purpose:

- collect current repository/submission/grading state
- generate faculty Markdown/CSV/JSON reports
- generate student Markdown reports by section
- optionally publish student reports to student repos

Pipeline:

```text
parse -> locate -> load -> validate -> load manifest -> collect observed state -> render reports -> optionally publish
```

Mutation policy:

```text
No student repo mutation unless --publish-student-reports is provided.
May update observed status in existing manifest records.
```

---

### 7.6 `graider archive`

Purpose:

- archive selected student repositories explicitly

Pipeline:

```text
parse -> locate -> load -> validate -> load manifest -> select targets -> confirm -> archive -> update manifest
```

Mutation policy:

```text
Archives repositories.
Does not delete repositories.
Preserves faculty/grader access.
Removes student access only if explicit --remove-student-access is provided.
```

---

### 7.7 `graider remove-access`

Purpose:

- remove selected student collaborator access explicitly

Pipeline:

```text
parse -> locate -> load -> validate -> load manifest -> select targets -> confirm -> remove access -> update manifest
```

Mutation policy:

```text
Removes only student collaborator access.
Does not remove faculty/grader teams.
Does not archive or delete repositories.
```

---

## 8. Domain Models

### 8.1 Course configuration

```ts
export interface CourseConfig {
  schemaVersion: 1;
  course: {
    code: string;
    title: string;
    repository: string;
  };
  github: {
    organization: string;
    repositoryVisibility: "private";
    repoNamePattern: string;
    studentPermission: "push";
    facultyTeam: string;
    facultyPermission: "admin";
    graderTeam: string;
    graderPermission: "maintain";
  };
  defaults: {
    timezone: string;
    assignmentType: "individual";
  };
  grading: GradingConfig;
  reports: ReportConfig;
}
```

### 8.2 Term configuration

```ts
export interface TermConfig {
  schemaVersion: 1;
  term: {
    code: string;
    academicYear: string;
    semester: 1 | 2 | 3;
    displayName: string;
  };
  sections: TermSection[];
}

export interface TermSection {
  id: string;
  roster: string;
}
```

### 8.3 Assignment configuration

```ts
export interface AssignmentConfig {
  schemaVersion: 1;
  assignment: {
    slug: string;
    title: string;
    type: "individual";
    status: "draft" | "active" | "closed" | "archived";
  };
  template: {
    repository: string;
    branch: string;
  };
  sections: string[];
  deadline: {
    dueAt: string;
    latePolicy: string;
  };
  metadata: {
    facultyOwner: string;
    lmsAssignmentId: string | null;
    gradingCategory: string;
    points: number | null;
  };
  grading?: AssignmentGradingConfig;
}
```

### 8.4 Roster student

```ts
export interface RosterStudent {
  studentId: string;
  githubUsername: string;
  section: string;
  status: "active" | "dropped" | "hold";
}
```

### 8.5 Diagnostic

```ts
export interface Diagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  context?: Record<string, unknown>;
  observedAt?: string;
}
```

### 8.6 Command result

```ts
export interface CommandResult {
  commandName: string;
  assignment?: AssignmentIdentity;
  status: "success" | "failure" | "partial_success";
  exitCode: 0 | 1 | 2 | 3 | 4 | 5;
  warnings: Diagnostic[];
  errors: Diagnostic[];
  generatedFiles: string[];
  summary: Record<string, unknown>;
}
```

---

## 9. Schema Validation

### 9.1 Zod schemas

All config and generated file schemas should be represented with Zod.

Schema modules:

```text
config-schemas.ts
manifest-models.ts
plan-models.ts
report-models.ts
grading-result-models.ts
```

Validation should produce canonical Graider diagnostics, not raw Zod errors.

Example:

```ts
const CourseConfigSchema = z.object({
  schema_version: z.literal(1),
  course: z.object({
    code: z.string().min(1),
    title: z.string().min(1),
    repository: z.string().min(1)
  })
});
```

### 9.2 Raw vs normalized models

Graider should distinguish:

| Model type       | Purpose                                                   |
| ---------------- | --------------------------------------------------------- |
| Raw parsed model | Mirrors YAML/JSON file structure                          |
| Normalized model | Uses TypeScript naming, normalized values, resolved paths |
| Render model     | Controls stable output structure                          |

Commands should operate on normalized models.

---

## 10. GitHub Client Abstraction

### 10.1 Interface

All GitHub API access should go through `GitHubClient`.

```ts
export interface GitHubClient {
  getAuthenticatedUser(): Promise<GitHubUser>;

  getRepository(owner: string, repo: string): Promise<GitHubRepository | null>;
  getTemplateRepository(owner: string, repo: string): Promise<GitHubTemplateRepository | null>;
  createRepositoryFromTemplate(input: CreateFromTemplateInput): Promise<GitHubRepository>;

  getUser(username: string): Promise<GitHubUser | null>;

  getTeam(org: string, teamSlug: string): Promise<GitHubTeam | null>;
  getCollaboratorPermission(
    owner: string,
    repo: string,
    username: string
  ): Promise<GitHubPermissionState>;
  addCollaborator(input: AddCollaboratorInput): Promise<GitHubCollaboratorResult>;
  removeCollaborator(input: RemoveCollaboratorInput): Promise<void>;

  getTeamPermission(owner: string, repo: string, teamSlug: string): Promise<GitHubPermissionState>;
  addTeamPermission(input: AddTeamPermissionInput): Promise<void>;

  getActionsState(owner: string, repo: string): Promise<GitHubActionsState>;
  enableActions(owner: string, repo: string): Promise<void>;

  getWorkflow(owner: string, repo: string, workflowPath: string): Promise<GitHubWorkflow | null>;
  dispatchWorkflow(input: DispatchWorkflowInput): Promise<void>;
  listWorkflowRuns(input: ListWorkflowRunsInput): Promise<GitHubWorkflowRun[]>;
  downloadArtifact(input: DownloadArtifactInput): Promise<DownloadedArtifact | null>;

  archiveRepository(owner: string, repo: string): Promise<void>;
}
```

### 10.2 Implementations

| Implementation           | Purpose                                  |
| ------------------------ | ---------------------------------------- |
| `OctokitGitHubClient`    | Real GitHub API implementation           |
| `FakeGitHubClient`       | Deterministic test implementation        |
| future `GitHubAppClient` | GitHub App auth implementation if needed |

### 10.3 Error normalization

GitHub errors should be mapped to Graider diagnostics:

| GitHub/API condition | Graider code               | Exit code |
| -------------------- | -------------------------- | --------: |
| missing token        | `github_auth_missing`      |       `3` |
| invalid token        | `github_auth_failed`       |       `3` |
| permission denied    | `github_permission_denied` |       `3` |
| rate limited         | `github_rate_limited`      |       `4` |
| network error        | `github_network_error`     |       `4` |
| GitHub 5xx           | `github_api_error`         |       `4` |

---

## 11. Planning Model

### 11.1 Operation model

```ts
export interface PlanOperation {
  id: string;
  type: PlanOperationType;
  status: "planned" | "noop" | "skipped" | "blocked";
  studentId?: string;
  githubUsername?: string;
  section?: string;
  repositoryName?: string;
  requires: string[];
  reason?: string;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}
```

### 11.2 Operation ordering

Plan operations should be deterministic:

```text
section -> normalized student_id -> operation type order
```

Recommended operation type order:

```text
create_repository_from_template
add_student_collaborator
add_faculty_team_permission
add_grader_team_permission
enable_actions
verify_grading_workflow
verify_workflow_dispatch
update_manifest
```

### 11.3 Blocked plan behavior

If any operation is blocked, `apply` performs no GitHub changes.

Examples of blocked operations:

- repo exists but is not in manifest
- assignment status blocks command
- missing required target
- invalid GitHub state
- schema/config error

---

## 12. Manifest Strategy

### 12.1 Manifest role

The manifest records generated state. It is not the sole source of truth for current GitHub state.

Commands should query GitHub when making remote-state decisions.

### 12.2 Incremental writes

`apply` should update the manifest as soon as practical after each stable successful student operation.

This supports recovery:

| Interruption point                    | Rerun behavior           |
| ------------------------------------- | ------------------------ |
| repo created and manifest updated     | no-op                    |
| repo created before manifest update   | collision, manual review |
| permission added and manifest updated | no-op/verify             |
| permission failed                     | retry on rerun           |

### 12.3 Stable rendering

Manifest rendering should use:

- stable field ordering
- deterministic student ordering
- repository-relative paths
- forward slashes
- no secrets

---

## 13. Reporting Architecture

### 13.1 Report phases

```text
collect observed state -> build canonical faculty-summary model -> render outputs
```

### 13.2 Canonical report model

`faculty-summary.json` should be the canonical report source.

Renderers:

| Renderer                     | Output                                 |
| ---------------------------- | -------------------------------------- |
| `FacultyJsonRenderer`        | `faculty-summary.json`                 |
| `FacultyCsvRenderer`         | `faculty-summary.csv`                  |
| `FacultyMarkdownRenderer`    | `faculty-summary.md`                   |
| `StudentMarkdownRenderer`    | `students/<section>/<student_id>.md`   |
| `StudentResultsJsonRenderer` | `grading/results.json` when publishing |

### 13.3 Student report isolation

Student report renderers must receive only a single student report model.

They should not receive the full faculty summary if avoidable.

---

## 14. Error, Warning, and Exit Handling

### 14.1 Error catalog

All diagnostics should use canonical codes.

```ts
export const ErrorCodes = {
  MissingRequiredFile: "missing_required_file",
  InvalidYaml: "invalid_yaml",
  DuplicateStudentId: "duplicate_student_id",
  GitHubAuthMissing: "github_auth_missing",
  RepoNameCollision: "repo_name_collision"
} as const;
```

### 14.2 Exit code resolution

Exit code precedence:

```text
3 authentication/authorization
5 configuration/schema
4 GitHub API/network/rate-limit
2 partial success
1 validation/command
0 success/warnings only
```

Exit code logic should be centralized.

---

## 15. Logging and Observability

### 15.1 Default output

Default CLI output should be concise:

- command name
- assignment identity
- summary counts
- generated file paths
- warnings/errors

No stack traces or raw GitHub responses in normal output.

### 15.2 Verbose output

`--verbose` may include:

- per-student operation details
- retry attempts
- skipped/no-op operations
- redacted GitHub diagnostic context
- log file paths

### 15.3 JSON Lines logs

Local logs may be written as JSON Lines:

```json
{
  "timestamp": "2026-09-01T14:30:00-05:00",
  "command": "apply",
  "event": "repo_created",
  "student_id": "jones",
  "repo": "27s1-se2030-lab04-seanjones"
}
```

Logs are local-only for MVP and should not contain secrets.

---

## 16. File and Path Handling

### 16.1 Repository root discovery

Graider should discover the course-admin repository root by searching upward for `course.yml`.

### 16.2 Path rules

| Path type                 | Rule                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| CLI assignment path       | resolved from current working directory                                                             |
| generated committed paths | repository-relative                                                                                 |
| generated path separators | forward slash                                                                                       |
| local logs                | may use local file paths internally, but rendered references should be repo-relative when committed |
| config roster paths       | resolved relative to term folder                                                                    |

---

## 17. Testing Architecture

### 17.1 Test types

| Test type              | Location           |
| ---------------------- | ------------------ |
| unit tests             | `tests/unit/`      |
| CLI fixture tests      | `tests/cli/`       |
| fake GitHub tests      | `tests/github/`    |
| report rendering tests | `tests/reporting/` |
| recovery tests         | `tests/recovery/`  |
| optional live tests    | `tests/live/`      |

### 17.2 Fake GitHub client

The fake GitHub client should be stateful and deterministic.

It should support:

- repos
- users
- teams
- collaborators
- team permissions
- Actions state
- workflows
- workflow runs
- artifacts
- error injection
- retry simulation

### 17.3 Live GitHub tests

Live tests must be explicitly gated:

```text
GRAIDER_RUN_LIVE_GITHUB_TESTS=true
```

Live tests should use one or two sandbox repositories only.

---

## 18. CI Pipeline

Recommended CI jobs:

```text
install
typecheck
lint
unit-tests
fixture-cli-tests
report-rendering-tests
mock-github-tests
dependency-audit
```

Optional gated job:

```text
live-github-tests
```

CI must not require a GitHub token for normal test runs.

---

## 19. Packaging and Deployment

### 19.1 MVP packaging

Recommended MVP packaging:

```text
npm package with bin entry
```

Example usage:

```bash
graider validate terms/27s1/assignments/lab04/assignment.yml
```

Package configuration:

```json
{
  "bin": {
    "graider": "./dist/cli/index.js"
  }
}
```

### 19.2 Future packaging options

Potential later options:

- `npx graider`
- organization-private npm package
- Docker image
- bundled executable with `pkg`, `nexe`, or Node single executable tooling
- GitHub Action wrapper

Architecture should not depend on a single packaging approach.

---

## 20. Initial Implementation Slices

Implementation should proceed in small, test-first slices.

### Slice 1 — Project skeleton

Deliver:

- TypeScript project setup
- Commander CLI shell
- Vitest setup
- strict TypeScript config
- basic command registration
- placeholder command results

### Slice 2 — Config loading and validation

Deliver:

- repo root discovery
- `course.yml` loading
- `term.yml` loading
- `assignment.yml` loading
- Zod schema validation
- canonical diagnostics
- `validate` command for local config only

### Slice 3 — Roster loading and validation

Deliver:

- CSV loader
- roster models
- required column checks
- duplicate student/GitHub checks
- section consistency checks
- normalization warnings

### Slice 4 — Fake GitHub client and GitHub readiness validation

Deliver:

- `GitHubClient` interface
- `FakeGitHubClient`
- mocked template/user/team checks
- validation tests without live GitHub

### Slice 5 — Planning

Deliver:

- plan operation model
- deterministic plan generation
- plan renderer
- plan command
- blocked collision behavior

### Slice 6 — Apply

Deliver:

- additive repo creation execution
- permission application
- incremental manifest writes
- idempotency tests
- blocked plan prevents mutation

### Slice 7 — Reporting

Deliver:

- report collector
- faculty JSON/CSV/Markdown renderers
- student Markdown renderer
- grading status mapping

### Slice 8 — Grade, archive, remove-access

Deliver:

- workflow dispatch
- explicit archive
- explicit access removal
- target selector behavior
- lifecycle gating

### Slice 9 — Live sandbox tests

Deliver:

- optional live test gate
- one or two sandbox repo tests
- no production org default behavior

---

## 21. Future Extension Points

The architecture should leave room for:

- group assignments
- LMS integration
- GitHub App authentication
- repository adoption flow
- empty repository assignments
- hidden faculty tests
- multiple due dates
- extension handling
- points-based grading
- web UI or service wrapper
- GitHub Action wrapper

Deferred features must not affect MVP behavior until explicitly implemented.

---

## 22. Architecture Decisions Summary

| Area            | Decision                         |
| --------------- | -------------------------------- |
| Language        | TypeScript                       |
| Runtime         | Node.js LTS                      |
| CLI             | Commander                        |
| Validation      | Zod                              |
| GitHub API      | Octokit behind `GitHubClient`    |
| Testing         | Vitest                           |
| Package manager | pnpm                             |
| Build           | tsup                             |
| State           | course-admin repo files + GitHub |
| Database        | none for MVP                     |
| Service         | none for MVP                     |
| Logs            | local JSON Lines                 |
| Reports         | generated Markdown/CSV/JSON      |
| Live tests      | optional, gated, sandboxed       |
