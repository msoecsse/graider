# Graider Feature Request Example — Remove Student Access

This file contains both the completed faculty-facing feature request and the developer feature addendum.

---

# Graider Feature Request — Remove Student Access

## 1. Short Summary

What feature or improvement are you requesting?

```text
Add supported remove-access behavior so faculty can remove student collaborator access from assignment repositories after an assignment or term is complete.
```

Example:

```text
Add a way to remove student access from all repositories for a completed assignment.
```

---

## 2. Problem or Need

What problem would this solve? What is difficult, slow, confusing, or missing right now?

```text
After grading is complete, faculty may want to prevent further student changes to assignment repositories while preserving the repositories for records and reporting. Right now remove-access exists as a command shell but is not supported.
```

Example:

```text
I want to keep repositories available to faculty and graders but prevent students from pushing new commits after the assignment is finished.
```

---

## 3. Desired Behavior

Describe what you would like Graider to do.

```text
I would like Graider to remove student collaborator access from manifest-tracked repositories for a selected assignment while preserving faculty and grader access.
```

Example:

```text
I would like to run remove-access after grades are final and have Graider remove each student collaborator from their own assignment repository.
```

---

## 4. Current Workaround

How are you handling this today, if at all?

```text
The current workaround is to remove collaborators manually in GitHub or leave student access unchanged.
```

Example:

```text
I manually open each repository and remove the student collaborator.
```

---

## 5. Example Command, Workflow, or Screen

If you have an example of how you imagine this working, write it here.

Example command, if applicable:

```bash
graider remove-access terms/27s1/assignments/lab04/assignment.yml --yes
```

Example workflow:

```text
1. Confirm grading/reporting is complete.
2. Run graider validate.
3. Run graider remove-access with --yes.
4. Review the summary of access removed, skipped, or failed.
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
assignment.status: closed
```

---

## 7. Expected Output or Result

What should the output look like?

```text
Graider should report how many student collaborators were removed, skipped, already removed, or failed. Faculty and grader team permissions should remain unchanged.
```

If this feature creates or changes a file, describe the expected file.

```text
terms/<term-code>/manifests/<assignment-slug>/manifest.yml should be updated to record studentAccessRemoved: true for each affected repository.
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
Students benefit indirectly because final grading state is preserved and clearly separated from later changes.
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
This is important for post-assignment cleanup and preserving final grading state.
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
Most useful after grades are final.
```

---

# Graider Developer Feature Addendum — Remove Student Access

## A. Feature Classification

**Priority:**

```text
medium
```

**Feature type:**

```text
GitHub permissions / manifest / CLI command / safety
```

**Affected command or area:**

```text
remove-access
```

**MVP status:**

```text
candidate for next release
```

---

## B. Proposed Behavior

Describe the intended behavior precisely.

```text
Implement real remove-access behavior for the existing remove-access command. The command should remove only the target student's collaborator access from manifest-tracked repositories. It must preserve faculty and grader team permissions, preserve repositories, and update manifest lifecycle/permission state after successful removal.
```

User-facing command or workflow, if applicable:

```bash
graider remove-access terms/27s1/assignments/lab04/assignment.yml --yes
```

Generated files or outputs, if applicable:

```text
terms/<term-code>/manifests/<assignment-slug>/manifest.yml
```

---

## C. Requirements and Acceptance Criteria

Functional requirements:

```text
- [ ] remove-access requires a valid assignment and manifest.
- [ ] remove-access targets only manifest-tracked repositories.
- [ ] remove-access removes only the student collaborator for each repository.
- [ ] remove-access preserves faculty and grader team permissions.
- [ ] remove-access requires explicit confirmation or --yes before mutation.
- [ ] remove-access is idempotent when student access is already removed.
- [ ] remove-access updates manifest permission/lifecycle state after successful removal.
- [ ] remove-access reports removed, already removed, skipped, failed, and blocked counts.
- [ ] remove-access supports structured JSON output.
```

Nonfunctional requirements:

```text
- [ ] Remove-access behavior must be safe to rerun.
- [ ] Remove-access must preserve manifest history.
- [ ] Remove-access must use FakeGitHubClient in normal tests.
- [ ] Remove-access must not require live GitHub tests.
- [ ] Remove-access must preserve token redaction and existing exit-code behavior.
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
- [ ] remove-access no longer returns not_supported_in_mvp for valid supported inputs.
- [ ] remove-access still fails safely when confirmation is missing.
```

---

## D. Suspected Implementation Area

Likely files or modules:

```text
src/cli/commands/remove-access.command.ts
src/execution/remove-access-executor.ts
src/execution/mutation-guard.ts
src/manifest/manifest-loader.ts
src/manifest/manifest-updater.ts
src/github/github-client.ts
src/github/fake-github-client.ts
src/diagnostics/error-catalog.ts
```

Relevant existing tests:

```text
tests/cli/remove-access-unsupported.test.ts
tests/unit/manifest/
tests/recovery/
```

New tests likely needed:

```text
tests/cli/remove-access.test.ts
tests/unit/execution/remove-access-executor.test.ts
tests/recovery/remove-access-recovery.test.ts
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
Remove-access must not delete repositories, archive repositories, remove faculty/grader permissions, or remove access from repositories not tracked in the manifest.
```

---

## F. Scope Boundaries

The feature may change:

```text
remove-access command implementation, manifest permission/lifecycle updates, fake GitHub removeCollaborator behavior, diagnostics, remove-access tests, documentation.
```

The feature must not change:

```text
apply, grade, report publishing, archive behavior, repository creation behavior, team permission behavior.
```

Out of scope:

```text
repository deletion, repository archive, LMS updates, scheduled access removal, removing faculty/grader permissions.
```

---

## G. Design Notes for Codex

Implementation hints, architecture notes, or preferred approach:

```text
Add a remove-access executor similar in structure to archive/apply executors. Load config, roster, and manifest. Build targets from manifest records. Require --yes. For each eligible repo, call GitHubClient.removeCollaborator for the target student and update manifest permission/lifecycle state.
```

Potential edge cases:

```text
- Missing manifest
- Student collaborator already removed
- Repo missing from GitHub
- Manifest record missing repository identity
- Partial success after some removals
- Auth failure or API failure during removal
```

Potential migration or compatibility concerns:

```text
Existing remove-access unsupported tests must be replaced or updated to reflect supported remove-access behavior.
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
README must no longer describe remove-access as unsupported once implemented. Documentation should clearly state that remove-access only removes student collaborator access and does not delete repositories.
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
- [ ] Stop if the existing GitHubClient does not expose removeCollaborator.
```

---

## J. Notes for Codex

Additional implementation context:

```text
This is a post-MVP lifecycle feature. It should be implemented separately from archive even though both are lifecycle cleanup commands.
```
