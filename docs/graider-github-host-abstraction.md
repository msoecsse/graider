# GitHub host boundary — Phase 1.3A

## Current boundary

```text
Feature/domain code
        |
        v
   GitHubClient
        |
        v
OctokitGitHubClient
        |
        v
    GitHub REST API
```

Local Git remains separate:

```text
Feature/domain code
        |
        v
    GitWorkspace
        |
        v
GitCommandWorkspace
        |
        v
      Dugite
```

Trusted composition may supply both dependencies. These stacks do not connect below
that layer: `GitHubClient` does not resolve Dugite credentials, and Git transport
does not call GitHub API methods to acquire credentials.

The production Octokit package import and `new Octokit` are allowed only in
`src/github/octokit-github-client.ts`. Concrete adapter module imports and
`OctokitGitHubClient` references are allowed only there and in
`src/github/github-client-factory.ts`. Adapter tests may import the implementation.
The architecture guard scans production TypeScript in `src/` and `ui/electron/`,
including TSX and excluding colocated tests. Fixtures cover imports, re-exports,
dynamic imports, require calls, concrete references and construction. Comments and
ordinary strings do not count as dependencies.

Current production searches find no Octokit leakage outside those approved files.
This guard freezes concrete implementation ownership; client/token composition
is still distributed. GitHub interfaces, models, errors and retry imports remain
permitted. `GitHubClient` remains GitHub-specific, with unchanged signatures and
no split. No generic RemoteHost, RemoteProvider, GitProvider or GitLabProvider is
introduced; GitLab remains deferred.

## Current GitHubClient capabilities

| Group                         | Current methods                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                      | `getAuthenticatedUser`, `getUser`                                                                                                                                                                 |
| Repository metadata/lifecycle | `getRepository`, `getTemplateRepository`, `getDefaultBranchCommitSha`, `createRepository`, `createRepositoryFromTemplate`, `archiveRepository`                                                    |
| Permissions                   | `getCollaboratorPermission`, `addCollaborator`, `removeCollaborator`, `getTeam`, `getTeamPermission`, `addTeamPermission`                                                                         |
| Actions                       | `getActionsState`, `enableActions`, `getWorkflow`, `dispatchWorkflow`, `listWorkflowRuns`, `listWorkflowRunsForCommit`, `listWorkflowRunArtifacts`, `downloadArtifactArchive`, `downloadArtifact` |
| Repository content            | `getRepositoryFileContent`, `writeRepositoryFile`                                                                                                                                                 |
| Collaboration                 | `findPullRequest`, `createPullRequest`                                                                                                                                                            |
| Branch management             | `deleteRepositoryBranch` (managed remote branch deletion with default-branch protection)                                                                                                          |

Repository IDs are required in `GitHubRepository`; user and team IDs are currently
optional in their models. Immutable authenticated identity and canonical course
repository identity therefore need more than merely exposing existing fields.

## Client construction inventory

Paths below are relative to the repository. Dependency aliases (`createClient`)
are included, rather than counting only literal factory calls.

| File                                                           | Current responsibility                                                                                                                                               | Desired 1.3 direction                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/github/github-client-factory.ts`                          | Infrastructure factory: `createGitHubClient` selects Octokit; `resolveProductionGitHubClient` calls it after environment resolution or accepts injection             | Retain concrete adapter ownership behind one trusted GitHub composition seam |
| `src/cli/commands/assignment.command.ts`                       | CLI composition: helper calls `resolveProductionGitHubClient`; reads tokens for detail, grade preview, grade status, apply preview and repository download           | Obtain API clients through the seam; supply transport credentials separately |
| `src/cli/commands/apply.command.ts`                            | CLI composition: calls `resolveProductionGitHubClient` for Apply                                                                                                     | Use shared composition seam                                                  |
| `src/cli/commands/plan.command.ts`                             | CLI composition: calls `resolveProductionGitHubClient` for Plan                                                                                                      | Use shared composition seam                                                  |
| `src/cli/commands/validate.command.ts`                         | CLI composition: calls `resolveProductionGitHubClient` for readiness                                                                                                 | Use shared composition seam                                                  |
| `src/cli/commands/report.command.ts`                           | CLI composition: calls `resolveProductionGitHubClient` for Report                                                                                                    | Use shared composition seam                                                  |
| `src/cli/commands/grade.command.ts`                            | CLI composition: calls `resolveProductionGitHubClient` for dispatch                                                                                                  | Use shared composition seam                                                  |
| `src/cli/commands/dashboard.command.ts`                        | CLI composition: calls `resolveProductionGitHubClient` with environment/injection                                                                                    | Use shared composition seam                                                  |
| `src/template-sync/assignment-template-sync-context.ts`        | Generated backend/context composition: defaults `createClient` to `createGitHubClient`; execute resolves token, constructs client, passes the same token to Git sync | Receive client/provider and a separate transport authentication dependency   |
| `src/grading/grading-student-evidence-context.ts`              | Generated backend/context composition: factory alias constructs client from `resolvedGithubToken` for evidence retrieval                                             | Receive client/provider                                                      |
| `src/grading/grading-student-workflow-repair-context.ts`       | Generated backend/context composition: factory alias constructs client from `resolvedGithubToken` for repair                                                         | Receive client/provider                                                      |
| `src/grading/template-managed-workflow-replacement-context.ts` | Generated backend/context composition: factory alias constructs clients from tokens for preview and install                                                          | Receive client/provider                                                      |
| `src/grading/grading-student-report-publication-context.ts`    | Generated backend/context composition: default callback calls `createGitHubClient({ token })` for publication; forwards token to evidence context                    | Receive client/provider across both operations                               |

The five context modules are bundled as Electron CJS backends by
`ui/scripts/build-template-sync.mjs`. There are no direct factory/resolver calls in
`ui/electron/`, and no additional factory calls in domain/service modules. The
factory's own call is infrastructure composition, outside the four consumer
classifications. The seven command modules and five contexts above exhaust the
production factory/resolver consumers.

## Token responsibility inventory

| File                                                               | Current responsibility                                                                                                           | Desired 1.3 direction                                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/github/github-client-factory.ts`                              | API credential resolution: `readGitHubToken` trims `GRAIDER_GITHUB_TOKEN`, then `GITHUB_TOKEN`; factory accepts explicit token   | Put acquisition/client composition behind trusted seam without changing priority               |
| `src/cli/commands/assignment.command.ts`                           | CLI composition reads API tokens and separately supplies a token for repository download                                         | Keep API client and Git transport authentication dependencies distinct                         |
| `src/template-sync/assignment-template-sync-context.ts`            | Backend reads internal `resolvedGithubToken`, falls back to `readGitHubToken`, constructs API client and supplies Git sync token | Replace feature-local token-to-client construction with trusted composition                    |
| `src/template-sync/production-assignment-template-sync-service.ts` | Domain/service code reads environment or internal `resolvedToken` and forwards transport token to sync bridge                    | Receive operation authentication from trusted composition                                      |
| `ui/electron/tokenResolver.ts`                                     | Electron/main-process composition: resolves Graider environment token, fallback environment token, then `gh auth token`          | Preserve transitional acquisition behind trusted composition; defer session design             |
| `ui/electron/githubAuthChecker.ts`                                 | Electron/main-process composition: checks token availability, returns safe status without token/identity                         | Use trusted acquisition seam while preserving behavior                                         |
| `ui/electron/assignmentTemplateSyncService.ts`                     | Electron/main-process composition: resolves token and forwards internal `resolvedGithubToken` to trusted backend                 | Supply client/provider and separate transport authentication through trusted backend seam      |
| `ui/electron/gradingStudentEvidenceService.ts`                     | Electron/main-process composition: resolves token and forwards it to evidence backend (`resolvedGithubToken` parameter)          | Supply client/provider                                                                         |
| `ui/electron/gradingStudentWorkflowRepairService.ts`               | Electron/main-process composition: resolves token for repair backend                                                             | Supply client/provider                                                                         |
| `ui/electron/gradingBulkWorkflowRepairService.ts`                  | Electron/main-process composition: resolves token for bulk repair backend                                                        | Supply client/provider                                                                         |
| `ui/electron/gradingStudentReportPublicationService.ts`            | Electron/main-process composition: resolves token for evidence revalidation/publication backend                                  | Supply client/provider                                                                         |
| `ui/electron/templateManagedWorkflowReplacementService.ts`         | Electron/main-process composition: resolves token for preview/install backend                                                    | Supply client/provider                                                                         |
| `ui/electron/templateRepositoryValidationService.ts`               | Electron service: resolves token and calls GitHub REST directly with fetch for repository/branch validation                      | Move API ownership behind GitHubClient/provider; record any needed capability before migration |
| `ui/electron/templateWorkflowService.ts`                           | Electron service: resolves token and calls GitHub REST directly with fetch for workflow content/validation                       | Move API ownership behind GitHubClient/provider                                                |
| `ui/electron/dashboardRunner.ts`                                   | Electron/main-process composition: resolves/forwards token to CLI backend; redacts token assignments                             | Use trusted acquisition seam; retain redaction                                                 |
| `ui/electron/assignmentDetailRunner.ts`                            | Electron/main-process composition: resolves/forwards environment token to CLI backend                                            | Use trusted acquisition seam                                                                   |
| `ui/electron/assignmentApplyRunner.ts`                             | Electron/main-process composition: resolves/forwards environment token to CLI backend                                            | Use trusted acquisition seam                                                                   |
| `ui/electron/assignmentApplyPreviewRunner.ts`                      | Electron/main-process composition: resolves/forwards environment token to CLI backend                                            | Use trusted acquisition seam                                                                   |
| `ui/electron/assignmentGradeRunner.ts`                             | Electron/main-process composition: resolves/forwards environment token to CLI backend                                            | Use trusted acquisition seam                                                                   |
| `ui/electron/assignmentGradePreviewRunner.ts`                      | Electron/main-process composition: resolves/forwards environment token to CLI backend                                            | Use trusted acquisition seam                                                                   |
| `ui/electron/assignmentGradeStatusRunner.ts`                       | Electron/main-process composition: resolves/forwards environment token to CLI backend                                            | Use trusted acquisition seam                                                                   |
| `ui/electron/facultyReportRunner.ts`                               | Electron/main-process composition: resolves/forwards environment token to CLI backend                                            | Use trusted acquisition seam                                                                   |
| `ui/electron/assignmentRepositoryDownloadRunner.ts`                | Electron/main-process composition: resolves/forwards token to trusted CLI for Git download                                       | Preserve distinct transport authentication                                                     |
| `src/repository-download/repository-download.ts`                   | Transport composition: binds supplied token to operation-scoped `GitCredentialResolver`                                          | Preserve accepted Phase 1.2 transport boundary                                                 |
| `src/template-sync/production-template-sync-workspace.ts`          | Transport composition: binds token to operation-scoped resolver; receives GitHubClient separately for pull requests              | Preserve accepted Phase 1.2 transport boundary                                                 |

`src/git/git-credential-resolver.ts` defines the transport contract;
`src/git/dugite-git-workspace-context.ts` accepts it;
`src/git/git-command-workspace.ts` consumes it for authenticated transport and
knows the `x-access-token` username, not token environment priority. Diagnostic
messages/constants in CLI, assignment readiness, grade preview/status and the
error catalog mention token names without acquiring credentials;
`src/diagnostics/redaction.ts` recognizes credential patterns only to redact them.

API credential/session acquisition creates a `GitHubClient`. Git transport
credential resolution supplies operation-scoped credentials to
`GitCredentialResolver` for Dugite clone/fetch/push. The same transitional token
may originate in trusted composition, particularly template-sync, but these are
different responsibilities. Never merge the resolver into GitHubClient or expose
credentials through renderer DTOs, preload or public IPC. Existing Electron
authorization and projection boundaries stay intact.

The direct-fetch services are additional API ownership leaks, even though they
have no Octokit imports. Their existing API versions are left unchanged; this
slice does not claim all GitHub API behavior is centralized.

## Future capability gaps

Inventory against the roadmap, not APIs to implement in 1.3A:

- Required immutable authenticated-user identity.
- Immutable repository identity as canonical course identity, including lookup by
  immutable ID where rename/transfer handling needs it.
- Organization enumeration/metadata and organization membership/invitations.
- Team creation, membership and reconciliation (current lookup/permission writes
  do not provide these).
- Repository permission reconciliation beyond current collaborator/team operations.
- Branch-rule management and repository topics.
- Release metadata for Phase 3.

## Planned Phase 1.3 sequence

### 1.3A — Freeze/inventory boundary

Architecture guard and this inventory only. No production API behavior changes.
Phase 1.2 is complete; Phase 1.3 remains open.

### 1.3B — Centralize production composition

Centralize production GitHubClient creation/resolution behind one trusted
GitHub-specific composition seam. Feature/domain contexts receive a GitHubClient
or narrow provider rather than constructing clients from raw tokens. Account for
CLI and generated backend composition while preserving Electron trust boundaries
and separate operation-scoped Git authentication.

### 1.3C — Capability ownership and Phase 1 closure

Clean up capability ownership (including direct REST fetch), add only host
operations needed by upcoming phases, enforce architecture boundaries, and close
Phase 1 after acceptance.

Neither B nor C is implemented here. Preserve `GRAIDER_GITHUB_TOKEN`,
`GITHUB_TOKEN`, `gh auth token`, faculty authentication, token priority, API
versions, retry, diagnostics and all repository/Actions behavior. Phase 2 OAuth,
session implementation and secure storage remain undecided and unimplemented.
