# Graider Feature Request — Student Access to Private Pages

This file contains both the completed faculty-facing feature request and the developer feature addendum. It records the requirements for backlog item 56 in `docs/ui-redesign/backlog.md`.

---

# Graider Feature Request — Student Access to Private Pages

## 1. Short Summary

What feature or improvement are you requesting?

```text
Give enrolled students read access to the course's private Pages repository so they can open the student access pages, while the pages stay non-public.
```

---

## 2. Problem or Need

What problem would this solve? What is difficult, slow, confusing, or missing right now?

```text
A private Pages repository publishes its Pages site privately: only people signed in to GitHub with read access to the repository can view it. Students are members of the organization, but its base repository permission is none and the Pages repository has no teams or collaborators, so students cannot open the pages linked from Canvas. The organization allows private Pages sites and does not allow public ones, and the pages should stay non-public.
```

---

## 3. Desired Behavior

Describe what you would like Graider to do.

```text
Graider should keep the Pages repository's read access in step with the current term's rosters: active and on-hold students have read access as direct collaborators, and dropped students lose it.
```

---

## 4. Current Workaround

How are you handling this today, if at all?

```text
Faculty change repository permissions by hand in GitHub.
```

---

## 5. Example Command, Workflow, or Screen

If you have an example of how you imagine this working, write it here.

Example workflow:

```text
1. Save a roster, or Apply an assignment.
2. Graider saves the roster or completes the Apply as it does today.
3. Graider grants read access on the Pages repository to every active or on-hold student in the most recent term who lacks it, and removes it from students dropped in every section of that term.
4. If any change fails, the save or Apply stays done, and faculty see which students' access could not be updated, with a way to retry.
```

---

## 6. Relevant Files or Inputs

List or attach any files that seem related.

```text
course.yml (notifications.student_access_pages.repository)
terms/<term-code>/term.yml (academic_year, semester; selects the most recent term)
terms/<term-code>/rosters/section-<id>.csv (github_username, status)
```

---

## 7. Expected Output or Result

What should the output look like?

```text
After a roster save or Apply, every active or on-hold student in the most recent term can open the student access pages while signed in to GitHub. Faculty see an outcome only when an access change fails, naming the affected students and offering a retry.
```

If this feature creates or changes a file, describe the expected file.

```text
No files change. The change is to the Pages repository's collaborators on GitHub.
```

---

## 8. Who Benefits?

Who would use this feature?

```text
[x] Faculty
[ ] Graders
[ ] Course coordinators
[x] Students
[ ] Other:
```

Optional notes:

```text
Students can open the pages posted in Canvas. Faculty no longer manage Pages access by hand.
```

---

## 9. Importance

Choose one:

```text
[ ] Needed for course operations
[ ] Very useful soon
[ ] Nice improvement
[ ] Idea for later
```

Optional notes:

```text
Not yet recorded.
```

---

## 10. Timing

When would this be useful?

```text
[ ] Immediately
[ ] This term
[ ] Before the next offering
[ ] No specific deadline
```

Optional notes:

```text
Not yet recorded.
```

---

# Graider Developer Feature Addendum — Student Access to Private Pages

## A. Feature Classification

**Priority:**

```text
Not yet recorded. Backlog item 56 is tracked as "Should fix".
```

**Feature type:**

```text
GitHub permissions / roster / apply / docs / testing
```

**Affected command or area:**

```text
apply / roster saves / Pages repository permissions
```

**MVP status:**

```text
Not yet recorded.
```

---

## B. Proposed Behavior

Describe the intended behavior precisely.

```text
After a roster save or a successful Apply, Graider reconciles direct-collaborator read access on the configured Pages repository (notifications.student_access_pages.repository) against the rosters of the most recent term in the course repository, the same term the assignments page uses.

- Every student whose status is active or hold in any section of that term is granted read access as a direct collaborator, if they do not already have it.
- A student loses read access only when they are dropped and are not active or on hold in any other section of that term. A section switch (dropped in one section, active in another) keeps access.
- Students who appear only in earlier terms are not examined; any access they still have is left alone, and faculty clean it up outside Graider.

Access changes run after the local save or Apply, with no separate preview; roster saves already show one. If a GitHub call fails, the save or Apply stays done, and faculty see which students' access could not be updated, with a way to retry.
```

User-facing command or workflow, if applicable:

```text
Roster manager: Save Roster. Assignment Detail: Apply.
```

Generated files or outputs, if applicable:

```text
None.
```

---

## C. Requirements and Acceptance Criteria

Functional requirements:

```text
- [x] Active and on-hold students in the most recent term have read access to the Pages repository as direct collaborators.
- [x] Access is removed only for students dropped in every section of the most recent term in which they appear.
- [x] Students in a removed roster or section lose access unless active or on hold in another section of the most recent term.
- [x] Students only in earlier terms are left alone.
- [x] Access is checked and corrected after every roster save, roster removal, section removal, and every successful Apply.
- [x] Access changes never undo or block the roster save or Apply.
- [x] Failed access changes name the affected students and can be retried.
- [x] The organization base permission and repository visibility are never changed.
- [x] Faculty, grader, and other collaborators' access is never changed.
```

Nonfunctional requirements:

```text
- [x] Safe to rerun; granting existing access and removing absent access are no-ops.
- [x] Uses the existing GitHub collaborator calls.
- [x] Tests use FakeGitHubClient; no live GitHub calls.
- [x] Tokens are never logged, rendered, or stored.
```

Acceptance criteria:

```text
- [x] The feature is covered by tests.
- [x] Existing behavior is preserved.
- [x] JSON/YAML fixtures remain valid.
- [x] npm run typecheck passes.
- [x] npm run lint passes.
- [x] npm run format:check passes.
- [x] npm test passes.
- [x] npm run build passes.
```

Additional acceptance criteria:

```text
- [x] Docs and messages no longer imply the Pages repository is public.
- [x] Faculty docs say students must be signed in to GitHub to open the link.
```

---

## D. Suspected Implementation Area

Likely files or modules:

```text
src/github/github-client.ts (addCollaborator, removeCollaborator)
src/github/octokit-github-client.ts
src/github/fake-github-client.ts
src/execution/apply-executor.ts (existing student collaborator grants)
ui/electron/rosterManagerService.ts (saveRoster)
ui/electron/main.ts (roster and Apply IPC handlers)
ui/electron/studentAccessPagesIndexService.ts (most recent term selection; on PR #8)
ui/electron/studentRepositoryAccessPageService.ts (configuration error wording)
```

Relevant existing tests:

```text
tests/unit/github/
tests/unit/execution/
ui/electron/rosterManagerService.test.ts
```

New tests likely needed:

```text
Reconciliation rules: grant, keep on hold, remove when dropped everywhere, section switch, earlier terms ignored.
Failure reporting and retry after a roster save and after Apply.
```

---

## E. Safety and Privacy Constraints

Check all that apply:

```text
[x] Must not make live GitHub calls
[x] Must use FakeGitHubClient in tests
[ ] Must not mutate repositories
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
This feature changes collaborators on the Pages repository, so "Must not mutate repositories" does not apply to that repository; it must not change any other repository. Read access also shows students the Pages repository's files and history: the same usernames, repository links, clone scripts, and assignments page the site shows, including earlier versions. Only read (pull) permission is ever granted.
```

---

## F. Scope Boundaries

The feature may change:

```text
Collaborators on the configured Pages repository, roster save and Apply follow-up steps, related diagnostics, tests, and docs.
```

The feature must not change:

```text
Student repository permissions, the organization base permission, Pages repository visibility, faculty or grader access, or the generated pages.
```

Out of scope:

```text
Teams (option A), internal visibility, removing access for students from earlier terms, making the Pages site public.
```

---

## G. Design Notes for Codex

Implementation hints, architecture notes, or preferred approach:

```text
Later additions from the course owner: the check also runs after removing a roster or a whole section, and students in the removed roster or section lose access like dropped students, unless they are active or on hold in another section of the most recent term. The desktop app reads the roster's GitHub usernames before removing it, since nothing records them afterwards; an unreadable roster removes nobody, and a removed roster from an earlier term is ignored.

Decided: one shared module, src/pages-access/pages-access-context.ts, bundled for Electron as pagesAccessBackend and run by the desktop app after a successful roster save and after a successful Apply (the step after Apply already runs in the desktop app). Retry is by saving the roster again or running Apply again; there is no separate retry button.

Each section roster is loaded on its own, because a student who switched sections appears in two rosters and a whole-term load reports that as a duplicate. If any roster in the term cannot be read, removals are skipped and reported, since the student may be active in the unreadable section.

The most recent term rule is duplicated between src/pages-access/pages-access-context.ts and ui/electron/studentAccessPagesIndexService.ts (each tested), because Electron services cannot import src/ directly; both order by academic_year, then semester.
```

Potential edge cases:

```text
- Student with no GitHub username, or an invalid one
- Pending collaborator invitations not yet accepted
- Student dropped in one section and active in another (keeps access)
- Pages repository not configured
- GitHub API or permission failures partway through
- Faculty token lacks admin on the Pages repository
```

Potential migration or compatibility concerns:

```text
Existing courses gain student collaborators on the Pages repository the first time a roster is saved or an assignment is applied.
```

---

## H. Documentation Updates Needed

Check all that apply:

```text
[ ] README
[ ] docs/runtime.md
[ ] docs/generated-files.md
[x] docs/error-warning-catalog.md
[x] docs/github-token-permissions.md
[x] docs/troubleshooting.md
[ ] docs/examples
[ ] No documentation update expected
```

Specific docs notes:

```text
Correct docs/faculty-ui-user-guide.md:59-60, which implies a public Pages repository, and the configuration error in ui/electron/studentRepositoryAccessPageService.ts that calls the result a "public access page". Explain that students must be signed in to GitHub.
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
- [ ] Stop if granting or removing access would affect anyone other than students on the most recent term's rosters.
```

---

## J. Notes for Codex

Additional implementation context:

```text
Requirements were settled with the course owner: direct collaborators (option B); hold students are granted and keep access; access is checked on Apply and roster saves; only the most recent term counts; section switches keep access; failures leave the save or Apply done and offer a retry, with no separate preview.
```
