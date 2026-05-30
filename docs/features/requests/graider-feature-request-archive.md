# Graider Feature Request Example — Archive Assignment Repositories

This file contains both the completed faculty-facing feature request and the developer feature addendum.

---

# Graider Feature Request — Archive Assignment Repositories

## 1. Short Summary

What feature or improvement are you requesting?

```text
Add supported archive behavior so faculty can safely archive assignment repositories after an assignment is fully complete.
```

Example:

```text
Add a way to archive all student repositories for a completed assignment.
```

---

## 2. Problem or Need

What problem would this solve? What is difficult, slow, confusing, or missing right now?

```text
After an assignment is finished, student repositories should eventually be moved out of active use. Right now the archive command exists but only reports that it is not supported in the MVP. Faculty need a safe way to archive assignment repositories without manually visiting every repository.
```

Example:

```text
I want the course organization to stay clean after a term ends, but I do not want to manually archive dozens or hundreds of repositories.
```

---

## 3. Desired Behavior

Describe what you would like Graider to do.

```text
I would like Graider to archive the repositories for a selected assignment after the assignment is closed or archived, using the manifest to identify exactly which repositories belong to that assignment.
```

Example:

```text
I would like to run an archive command and have Graider archive all manifest-tracked student repositories for Lab 04.
```

---

## 4. Current Workaround

How are you handling this today, if at all?

```text
The current workaround is to archive repositories manually in GitHub or leave them active indefinitely.
```

Example:

```text
I manually open each repository in GitHub and archive it one at a time.
```

---

## 5. Example Command, Workflow, or Screen

If you have an example of how you imagine this working, write it here.

Example command, if applicable:

```bash
graider archive terms/27s1/assignments/lab04/assignment.yml --yes
```

Example workflow:

```text
1. Close or archive the assignment in assignment.yml.
2. Run graider validate.
3. Run graider archive with --yes.
4. Review the summary of repositories archived, skipped, or failed.
```

---

## 6. Relevant Files or Inputs

List or attach any files that seem related.

Examples:

```text
assignment.yml
manifest.yml
```

Affected assignment file, if known:

```text
terms/27s1/assignments/lab04/assignment.yml
```

Relevant snippet, if helpful:

```text
assignment.status: archived
```

---

## 7. Expected Output or Result

What should the output look like?

```text
Graider should report how many repositories were archived, skipped, already archived, or failed. The manifest should record the archived lifecycle state for each repository.
```

If this feature creates or changes a file, describe the expected file.

```text
terms/<term-code>/manifests/<assignment-slug>/manifest.yml should be updated to record repositoryArchived: true and lifecycle status archived.
```

---

## 8. Who Benefits?

Who would use this feature?

```text
[x] Faculty
[x] Graders
[x] Course coordinators
[ ] Students
[ ] Other:
```

Optional notes:

```text
This is most useful after an assignment or term has ended.
```

---

## 9. Importance

Choose one:

```text
[ ] Needed for course operations
[x] Very useful soon
[ ] Nice improvement
[ ] Idea for later
```

Optional notes:

```text
This is not required for the MVP, but it would significantly reduce manual GitHub cleanup work.
```

---

## 10. Timing

When would this be useful?

```text
[ ] Immediately
[x] This term
[x] Before the next offering
[ ] No specific deadline
```

Optional notes:

```text
Useful before the next course offering or before cleaning up an organization after a term.
```

---

# Graider Developer Feature Addendum — Archive Assignment Repositories

## A. Feature Classification

**Priority:**

```text
medium
```

**Feature type:**

```text
GitHub lifecycle / manifest / CLI command / safety
```

**Affected command or area:**

```text
archive
```

**MVP status:**

```text
candidate for next release
```

---

## B. Proposed Behavior

Describe the intended behavior precisely.

```text
Implement real archive behavior for the existing archive command. The command should archive only manifest-tracked assignment repositories, never delete repositories, never remove collaborators, and never adopt unknown repositories. It should require an explicit safety confirmation such as --yes and should update the manifest lifecycle state after successful archive operations.
```

User-facing command or workflow, if applicable:

```bash
graider archive terms/27s1/assignments/lab04/assignment.yml --yes
```

Generated files or outputs, if applicable:

```text
terms/<term-code>/manifests/<assignment-slug>/manifest.yml
```

---

## C. Requirements and Acceptance Criteria

Functional requirements:

```text
- [ ] archive requires a valid assignment and manifest.
- [ ] archive targets only manifest-tracked repositories for the selected assignment.
- [ ] archive refuses to operate on repositories not recorded in the manifest.
- [ ] archive requires explicit confirmation or --yes before mutation.
- [ ] archive calls GitHubClient.archiveRepository for eligible repositories.
- [ ] archive updates manifest lifecycle state after each successful archive.
- [ ] archive is idempotent when repositories are already archived.
- [ ] archive reports archived, already archived, skipped, failed, and blocked counts.
- [ ] archive supports structured JSON output.
- [ ] archive performs no deletion and no access removal.
```

Nonfunctional requirements:

```text
- [ ] Archive behavior must be safe to rerun.
- [ ] Archive must preserve manifest history.
- [ ] Archive must use FakeGitHubClient in normal tests.
- [ ] Archive must not require live GitHub tests.
- [ ] Archive must preserve token redaction and existing exit-code behavior.
```

Acceptance criteria:

```text
- [ ] The feature is covered by tests.
- [ ] Existing behavior is preserved.
- [ ] JSON/YAML fixtures remain valid.
- [ ] npm run typecheck passes.
- [ ] npm run lint passes.
- [ ] npm run format:check passes.
- [ ] npm test passes.
- [ ] npm run build passes.
```

Additional acceptance criteria:

```text
- [ ] archive no longer returns not_supported_in_mvp when invoked with valid supported inputs.
- [ ] archive still fails safely when confirmation is missing.
```

---

## D. Suspected Implementation Area

Likely files or modules:

```text
src/cli/commands/archive.command.ts
src/execution/archive-executor.ts
src/execution/mutation-guard.ts
src/manifest/manifest-loader.ts
src/manifest/manifest-updater.ts
src/github/github-client.ts
src/github/fake-github-client.ts
src/diagnostics/error-catalog.ts
```

Relevant existing tests:

```text
tests/cli/archive-unsupported.test.ts
tests/unit/manifest/
tests/recovery/
```

New tests likely needed:

```text
tests/cli/archive.test.ts
tests/unit/execution/archive-executor.test.ts
tests/recovery/archive-recovery.test.ts
```

---

## E. Safety and Privacy Constraints

Check all that apply:

```text
[x] Must not make live GitHub calls
[x] Must use FakeGitHubClient in tests
[x] Must not mutate repositories without --yes or explicit confirmation
[ ] Must not publish student reports
[x] Must not expose student data
[x] Must not print or store secrets
[x] Must not change generated file schemas unless required
[x] Must preserve backward compatibility
[ ] Must keep archive/remove-access unsupported
[x] Must be additive and safe to rerun
```

Additional safety notes:

```text
Archive must never delete repositories. Archive must not remove student access. Archive must only operate on manifest-tracked repositories.
```

---

## F. Scope Boundaries

The feature may change:

```text
archive command implementation, manifest lifecycle updates, fake GitHub archive behavior, diagnostics, archive tests, documentation.
```

The feature must not change:

```text
apply, grade, report publishing, remove-access behavior, repository creation behavior, permission behavior.
```

Out of scope:

```text
repository deletion, student access removal, LMS updates, automatic archive scheduling, bulk org cleanup.
```

---

## G. Design Notes for Codex

Implementation hints, architecture notes, or preferred approach:

```text
Add an archive executor similar in structure to apply/grade executors. Load config, roster, and manifest. Build targets from manifest records. Require --yes. For each eligible repo, call GitHubClient.archiveRepository and then update manifest lifecycle state. Treat already archived repos as noop/verified.
```

Potential edge cases:

```text
- Missing manifest
- Repo missing from GitHub
- Repo already archived
- Manifest record missing repository identity
- Partial success after some repos archive
- Auth failure or API failure during archive
```

Potential migration or compatibility concerns:

```text
Existing archive unsupported tests must be replaced or updated to reflect supported archive behavior.
```

---

## H. Documentation Updates Needed

Check all that apply:

```text
[x] README
[ ] docs/runtime.md
[x] docs/generated-files.md
[x] docs/error-warning-catalog.md
[ ] docs/github-token-permissions.md
[x] docs/troubleshooting.md
[x] docs/examples
[ ] No documentation update expected
```

Specific docs notes:

```text
README must no longer describe archive as unsupported once implemented. Documentation should clearly state that archive does not delete repositories and does not remove student access.
```

---

## I. Stop Conditions for Codex

Codex should stop and report instead of implementing if:

```text
[x] The requested feature conflicts with existing requirements.
[x] The feature requires live GitHub access to design safely.
[x] The feature would require destructive repository behavior.
[x] The feature would expose private student data.
[x] The feature is larger than one focused change.
[x] The feature requires schema changes that are not specified.
```

Additional stop conditions:

```text
- [ ] Stop if the existing GitHubClient does not expose archiveRepository.
```

---

## J. Notes for Codex

Additional implementation context:

```text
This is intended as the first post-MVP lifecycle feature. Keep remove-access unsupported unless separately implemented.
```
