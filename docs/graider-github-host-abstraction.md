# GitHub host boundary — Phase 1.3 Complete

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
The guard protects concrete implementation ownership and centralized production
client composition through trusted seams. GitHub interfaces, models, errors and retry imports remain
permitted. `GitHubClient` remains GitHub-specific, with branch lookup added in
1.3C-1 and metadata read/conditional write added in 1.3C-2. No generic RemoteHost, RemoteProvider, GitProvider or GitLabProvider is
introduced; GitLab remains deferred.

## Current GitHubClient capabilities

| Group                         | Current methods                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                      | `getAuthenticatedUser`, `getUser`                                                                                                                                                                 |
| Repository metadata/lifecycle | `getRepository`, `getRepositoryBranch`, `getTemplateRepository`, `getDefaultBranchCommitSha`, `createRepository`, `createRepositoryFromTemplate`, `archiveRepository`                             |
| Permissions                   | `getCollaboratorPermission`, `addCollaborator`, `removeCollaborator`, `getTeam`, `getTeamPermission`, `addTeamPermission`                                                                         |
| Actions                       | `getActionsState`, `enableActions`, `getWorkflow`, `dispatchWorkflow`, `listWorkflowRuns`, `listWorkflowRunsForCommit`, `listWorkflowRunArtifacts`, `downloadArtifactArchive`, `downloadArtifact` |
| Repository content            | `getRepositoryFileContent`, `readRepositoryFile`, `writeRepositoryFile`, `conditionalWriteRepositoryFile`                                                                                         |
| Collaboration                 | `findPullRequest`, `createPullRequest`                                                                                                                                                            |
| Branch management             | `deleteRepositoryBranch` (managed remote branch deletion with default-branch protection)                                                                                                          |

Repository IDs are required in `GitHubRepository`; user and team IDs are currently
optional in their models. Immutable authenticated identity and canonical course
repository identity therefore need more than merely exposing existing fields.

## Phase 1.3B-1 completion

The trusted transitional seam is `src/github/github-client-composition.ts`.
The adapter factory now requires an explicit token and only constructs the concrete
production adapter. Environment acquisition and priority belong to composition:
injected `GitHubClient`, explicit token, `GRAIDER_GITHUB_TOKEN`, `GITHUB_TOKEN`,
then `token_missing`; whitespace-only tokens are missing. Explicit-token resolution
now honors its argument, including with an empty environment.

All seven CLI API-client consumers use the seam. Assignment resolves API clients
through composition and separately reads a transport token for the operation-scoped
`GitCredentialResolver` used by repository download. Injection bypasses acquisition;
custom command environments are honored. Faculty diagnostics are unchanged.

## Phase 1.3B-2 completion

The five generated backends now receive clients rather than constructing them.
`githubClientCompositionBackend.cjs` bundles the approved composition seam;
`ui/electron/githubClientProvider.ts` owns trusted main-process explicit-token
composition with `env: {}` after the unchanged `resolveGithubToken()` acquisition.
Bulk workflow repair reuses one client across repositories, and report publication
reuses one client for evidence retrieval and publication.

Template sync receives a separate API client and explicit Git transport credential.
Its service no longer reads environment credentials or decides token priority.
Clients and transport tokens stay in the main process; renderer/preload IPC DTOs
are unchanged. Only composition may import the adapter factory.

Electron's `ui/electron/tokenResolver.ts` retains its `gh auth token` fallback.
The following inventories record the 1.3A baseline rather than replacing it.

## Phase 1.3C-1 completion

Template repository validation now uses `GitHubClient` through the existing
Electron provider after local syntax validation and token resolution. The minimal
`GitHubRepositoryBranch` model and `getRepositoryBranch()` capability provide an
explicit branch lookup with a commit SHA; Octokit maps 404 to null, and the fake
uses explicit branch state. Blank branch input uses `getRepository().defaultBranch`.
Safe faculty diagnostics and the renderer/preload IPC result shape are preserved.

Repository validation owns no REST transport. The architecture guard now permits
production GitHub REST only in the approved adapter, with no feature exception.

## Phase 1.3C-2 completion and Phase 1 closure

Template workflow read, preview, and save use `GitHubClient` through the trusted
Electron provider. Each valid public operation resolves credentials once and
constructs one client; save reuses it for repository access, file read, comparison,
and conditional write. Local validation still precedes authentication.
Renderer/preload/IPC DTOs and transitional authentication text remain unchanged.

`readRepositoryFile()` returns typed found/missing/unsupported state and decoded
content with a `blobSha`. `conditionalWriteRepositoryFile()` sends the caller's
expected blob SHA unchanged, or omits it for expected absence, with no SHA
preflight or upsert retry. HTTP 409/422 become typed conflicts in the adapter.
This preserves stale-update and create-race protection after preview.
The fake models the same compare-and-write behavior without mutating on conflict.
Existing content-only reads and generic upsert writes retain their semantics.

Phase 1.3 is complete. Octokit and REST transport are confined to the approved
adapter/factory boundary (REST and the Octokit package belong only to the adapter).
CLI client composition and generated backend composition are centralized;
feature contexts receive clients. Credentials are composed through trusted seams,
and local Git transport credentials remain separate from API-client composition.
No feature-level direct REST remains, and architecture tests protect the boundary.
Future GitHub capabilities stay deferred until their roadmap phase needs them.

Phase 1 is complete. The next work is Phase 2 — First-Class Authentication,
slice 2.1 — Browser-based GitHub sign-in. It has not begun. Environment-token
fallback and `gh auth token` remain in place; OAuth, secure storage, and account
switching are deferred to Phase 2.

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

The baseline direct-fetch services had API ownership leaks without Octokit
imports. Both repository validation and template workflow read/write now use
GitHubClient. The adapter owns the authoritative API-version policy and all
production GitHub REST transport.

## Future capability gaps

Capabilities remain intentionally deferred until required by their roadmap phase:

- Required immutable authenticated-user identity.
- Immutable repository identity as canonical course identity, including lookup by
  immutable ID where rename/transfer handling needs it.
- Organization enumeration/metadata and organization membership/invitations.
- Team creation, membership and reconciliation (current lookup/permission writes
  do not provide these).
- Repository permission reconciliation beyond current collaborator/team operations.
- Branch-rule management and repository topics.
- Release metadata for Phase 3.

## Completed Phase 1.3 sequence

### 1.3A — Freeze/inventory boundary — Complete

Architecture guard and this inventory only. No production API behavior changes.
Phase 1.2 and Phase 1.3 are complete.

### 1.3B — Centralize production composition — Complete

Centralize production GitHubClient creation/resolution behind one trusted
GitHub-specific composition seam. Feature/domain contexts receive a GitHubClient
or narrow provider rather than constructing clients from raw tokens. Account for
CLI and generated backend composition while preserving Electron trust boundaries
and separate operation-scoped Git authentication.

### 1.3C — Capability ownership and Phase 1 closure — Complete

Repository validation and workflow read/write now use the protected GitHub host
boundary. Only the capabilities needed by these consumers were added.

1.3A, 1.3B-1, 1.3B-2, 1.3C-1, and 1.3C-2 are complete. Phase 1.3 and Phase 1
are closed. `GRAIDER_GITHUB_TOKEN`, `GITHUB_TOKEN`, `gh auth token`, faculty
authentication, token priority, existing upsert retry, diagnostics, and repository/
Actions behavior are preserved. Phase 2 / 2.1 is next and has not begun.
