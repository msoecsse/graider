# Graider RC2 Faculty Pilot Release Notes

## What Is Available

RC2 supports the current faculty workflow: course/term/roster setup, assignment
creation and editing, apply preview and confirmed repository setup, grading
workflow review/push, grade dispatch/status, and faculty reports.

It also adds the student repository access-page workflow:

- generate `terms/<term-code>/notifications/<assignment-slug>/student-repositories.html`;
- copy the expected GitHub Pages/Canvas link;
- check local file, commit, upstream, and push readiness;
- copy suggested manual git commands when the page needs committing or pushing.

See the [Faculty UI User Guide](../../faculty-ui-user-guide.md) for the complete
workflow and the [RC2 smoke test](FACULTY-SMOKE-TEST.md) for pilot validation.

## Prerequisites

- A local configured course folder and GitHub organization access.
- GitHub authentication, normally through `gh auth login`.
- Canonical seven-column rosters.
- A selected local clone of the configured Pages repository when sharing Canvas links.
- A safe sandbox course for apply, workflow push, and grade dispatch testing.

## Known Limitations

- Graider does not send student email or post directly to Canvas.
- It does not enable GitHub Pages or verify that a Pages URL is live.
- It does not automatically commit or push the access page.
- Student access pages are generated in the configured Pages repository, not
  the private course/admin repository. For CSC1120 this is
  `csc1120/csc1120pages`, with URLs under
  `https://csc1120.github.io/csc1120pages/...`.
- The macOS app may be unsigned until signing/notarization is configured.
- Packaging may need network access when Electron Builder must download an
  uncached artifact.

## Validation Status

Use `npm run validate:release` from the repository root for lint, typecheck,
formatting, tests, builds, and packaging. Packaging/network failures should be
reported separately from source-validation failures.

## Pilot Feedback

Please report the course/assignment context (without tokens or student data),
what you expected, what happened, the visible diagnostic, and whether the step
was preview-only or confirmed. Include screenshots only after checking that
they contain no student emails, names, grades, or credentials.
