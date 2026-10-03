# Graider Feature Request — Student Access Pages Assignments Index

This file contains both the completed faculty-facing feature request and the developer feature addendum. It records the requirements for backlog item 55 in `docs/ui-redesign/backlog.md`.

---

# Graider Feature Request — Student Access Pages Assignments Index

## 1. Short Summary

What feature or improvement are you requesting?

```text
Link the generated student access pages together through a single assignments page at the root of the Pages repository, and ask search engines not to crawl or index the published pages.
```

---

## 2. Problem or Need

What problem would this solve? What is difficult, slow, confusing, or missing right now?

```text
Each Apply generates a standalone terms/<term-code>/notifications/<assignment-slug>/student-repositories.html in the Pages repository, and nothing links the pages together. An instructor has to set up a new link for every assignment.
```

---

## 3. Desired Behavior

Describe what you would like Graider to do.

```text
Graider should create a simple page at the root of the Pages repository that links to each assignment's student repository page, and each student repository page should link back to it. A single link in Canvas then reaches every assignment for the term. Graider should also add files at the root of the published pages that ask external robots not to scan them.
```

---

## 4. Current Workaround

How are you handling this today, if at all?

```text
Faculty copy each assignment's page link into Canvas separately.
```

---

## 5. Example Command, Workflow, or Screen

If you have an example of how you imagine this working, write it here.

Example workflow:

```text
1. Apply an assignment, or regenerate its student access page.
2. Graider writes the assignment's student-repositories.html and updates index.html at the Pages root.
3. Publish Student Access Page commits and pushes the page, clone scripts, index.html, and robots.txt.
4. Post the Pages base URL in Canvas once; students reach every current assignment from it.
```

Example assignments page:

```text
SWE4211 Real Time Systems Fall 2026 Assignments

  • lab5lights (slug: lab5lights)

  • Anticipation (slug: ant)

  • lab2io (slug: io2)
```

---

## 6. Relevant Files or Inputs

List or attach any files that seem related.

```text
course.yml (course.code, course.title, notifications.student_access_pages)
terms/<term-code>/term.yml (academic_year, semester, display_name)
terms/<term-code>/assignments/<assignment-slug>/assignment.yml (assignment.title)
terms/<term-code>/manifests/<assignment-slug>/manifest.yml (repositories[].repository.created_at)
<pages-repository>/terms/<term-code>/notifications/<assignment-slug>/student-repositories.html
```

---

## 7. Expected Output or Result

What should the output look like?

```text
The assignments page is titled with the course code, course title, term, and "Assignments", for example "SWE4211 Real Time Systems Fall 2026 Assignments". It lists the most recent term's assignments as a bulleted list with space between items, most recently created first. Each item links to the assignment's student repository page, is named by the assignment title, and is followed by "(slug: <assignment-slug>)". The course code at the top of each student repository page links to the assignments page.
```

If this feature creates or changes a file, describe the expected file.

```text
<pages-repository>/index.html — the assignments page.
<pages-repository>/robots.txt — "User-agent: *" and "Disallow: /", headed by a Graider comment.
<pages-repository>/terms/<term-code>/notifications/<assignment-slug>/student-repositories.html — the course code links to index.html, and the page carries a robots noindex meta tag.
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
Faculty post one link per term instead of one per assignment. Students find every current assignment from one page.
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

# Graider Developer Feature Addendum — Student Access Pages Assignments Index

## A. Feature Classification

**Priority:**

```text
Not yet recorded. Backlog item 55 was tracked as "Should fix".
```

**Feature type:**

```text
publish / docs / testing
```

**Affected command or area:**

```text
Electron student repository access page generation and publishing
```

**MVP status:**

```text
Not yet recorded.
```

---

## B. Proposed Behavior

Describe the intended behavior precisely.

```text
Whenever a student access page is generated (Apply, regenerate, or roster refresh), Graider also rewrites index.html and robots.txt at the root of the selected local Pages clone.

The assignments page covers the most recent term in the course repository, ordered by term.yml academic_year and semester, even when that term has no generated pages yet. It lists only that term's assignments whose student-repositories.html exists, newest first by the earliest repositories[].repository.created_at in each assignment's manifest. Assignments without a created_at go last, ordered by title.

Graider recognises files it wrote by a generator meta tag in index.html and a "Generated by Graider" comment in robots.txt. An existing index.html or robots.txt without that mark is left untouched and reported to faculty.

Publish readiness and Publish Student Access Page include index.html and robots.txt only when Graider wrote them.
```

User-facing command or workflow, if applicable:

```text
Assignment Detail: Apply, regenerate the student access page, and Publish Student Access Page.
```

Generated files or outputs, if applicable:

```text
<pages-repository>/index.html
<pages-repository>/robots.txt
```

---

## C. Requirements and Acceptance Criteria

Functional requirements:

```text
- [x] Generating any student access page rewrites index.html at the Pages root.
- [x] The title is the course code as stored, the course title, the term's display_name (falling back to the term code), and "Assignments".
- [x] Only the most recent term in the course repository is listed, even when it has no generated pages; earlier terms never appear.
- [x] Only assignments with a generated student-repositories.html are listed.
- [x] Each item links to the assignment's page, is named by the assignment title, and is followed by "(slug: <assignment-slug>)".
- [x] Items are a bulleted list with space between them, newest first by the earliest manifest repository created_at.
- [x] The course code in each student-repositories.html heading links to index.html.
- [x] robots.txt at the Pages root disallows all crawlers.
- [x] index.html and every student-repositories.html carry <meta name="robots" content="noindex, nofollow" />.
- [x] An existing index.html or robots.txt that Graider did not write is left untouched and reported.
- [x] Publishing stages index.html and robots.txt only when Graider wrote them.
```

Nonfunctional requirements:

```text
- [x] Generation stays local; no GitHub calls are added.
- [x] Root files are written atomically.
- [x] Pages still work when served from a project path, because links are relative.
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
- [x] Checked against a real course using a local build.
- [ ] Checked on Windows.
```

---

## D. Suspected Implementation Area

Likely files or modules:

```text
ui/electron/studentAccessPagesIndexService.ts (new)
ui/electron/htmlEscape.ts (new; shared escapeHtml)
ui/electron/studentRepositoryAccessPageService.ts
ui/electron/studentRepositoryAccessPagePublishService.ts
ui/electron/studentRepositoryAccessPagePublishStatusService.ts
```

Relevant existing tests:

```text
ui/electron/studentRepositoryAccessPageService.test.ts
ui/electron/studentRepositoryAccessPagePublishService.test.ts
ui/electron/assignmentApplyWithAccessPageService.test.ts
```

New tests likely needed:

```text
ui/electron/studentAccessPagesIndexService.test.ts
```

---

## E. Safety and Privacy Constraints

Check all that apply:

```text
[x] Must not make live GitHub calls
[ ] Must use FakeGitHubClient in tests
[x] Must not mutate repositories
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
The assignments page shows only assignment titles, slugs, and links; no student data is added. "Must not mutate repositories" refers to GitHub repositories: files are written only in the local Pages clone, and publishing remains an explicit faculty action. Hand-made index.html and robots.txt files are never overwritten or staged.
```

---

## F. Scope Boundaries

The feature may change:

```text
Student access page generation, the publish readiness check, Publish Student Access Page staging, related tests, and docs.
```

The feature must not change:

```text
Apply, grading, roster management, course publication, or who can access the Pages site.
```

Out of scope:

```text
Pages access control (backlog item 56), an assignment creation date in assignment.yml, links to earlier terms.
```

---

## G. Design Notes for Codex

Implementation hints, architecture notes, or preferred approach:

```text
Keep the index and robots logic in its own module so the student page service only calls it. Use relative links so the pages work under a project-site path.
```

Potential edge cases:

```text
- Most recent term has no generated pages (the list is empty)
- Assignment without a manifest created_at (listed last, by title)
- Existing hand-made index.html or robots.txt (left alone, reported)
- term.yml missing academic_year or semester (term ignored)
```

Potential migration or compatibility concerns:

```text
None. The files are new, and hand-made root files are preserved.
```

---

## H. Documentation Updates Needed

Check all that apply:

```text
[ ] README
[ ] docs/runtime.md
[ ] docs/generated-files.md
[ ] docs/error-warning-catalog.md
[ ] docs/github-token-permissions.md
[ ] docs/troubleshooting.md
[ ] docs/examples
[ ] No documentation update expected
```

Specific docs notes:

```text
Updated docs/electron-assignment-detail-dev.md and docs/faculty-ui-user-guide.md. Backlog item 55 is marked Resolved.
```

---

## I. Stop Conditions for Codex

Codex should stop and report instead of implementing if:

```text
[x] The requested feature conflicts with existing requirements.
[ ] The feature requires live GitHub access to design safely.
[x] The feature would require destructive repository behavior.
[x] The feature would expose private student data.
[x] The feature is larger than one focused change.
[x] The feature requires schema changes that are not specified.
```

---

## J. Notes for Codex

Additional implementation context:

```text
Implemented on feat/link-student-access-pages (PR #8). Ordering uses the manifest created_at until assignments carry their own creation date; that schema change is deferred to its own PR.
```
