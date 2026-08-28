# Graider RC2 Faculty Smoke Test

Use a safe sandbox course. Items marked **Destructive** can create repositories,
push a workflow, or dispatch GitHub Actions. Items marked **External** require
GitHub/GitHub Pages access.

## App and Course

- [ ] Launch the packaged `Graider.app`.
- [ ] Confirm GitHub authentication shows connected.
- [ ] Register/open a course folder, including one whose path contains spaces.
- [ ] Confirm the Course Dashboard loads and refreshes.
- [ ] Quit/relaunch and confirm the registered course auto-loads.

## Course Data

- [ ] Optional: use the Course Setup wizard for a new sandbox course and verify
      `course.yml`, `term.yml`, and roster files are created.
- [ ] Open **Manage Rosters** and verify the canonical header:
      `student_id,github_username,email,first_name,last_name,section,status`.
- [ ] Confirm active, dropped, and hold rows are represented correctly.

## Assignment Lifecycle

- [ ] Create a sandbox assignment with **New Assignment**.
- [ ] Open **Edit assignment**, review the preview, and save a safe change.
- [ ] Open Assignment Detail and confirm Summary, workflow, roster, access-page,
      grade status, diagnostics, and actions render.
- [ ] Preview apply.
- [ ] **Destructive:** confirm apply only on the sandbox course.
- [ ] Confirm the assignment manifest has repository URLs for intended active
      students.

## Student Access Page

- [ ] Configure a Pages repository target and select its local clone (including
      a path with spaces if practical); confirm the course/admin repo remains
      the source of roster and manifest data.
- [ ] Generate the student access page.
- [ ] Verify the generated path is
      `terms/<term-code>/notifications/<assignment-slug>/student-repositories.html`.
- [ ] Open the local HTML file if practical; verify it contains only MSOE
      usernames and repository links, not names, emails, grades, or statuses.
- [ ] Confirm dropped/hold students and active students without repository URLs
      are excluded.
- [ ] Review Publish readiness and copy suggested commands if shown.
- [ ] Confirm **Copy Canvas link** works.
- [ ] **External/optional:** manually commit/push from the Pages repository,
      then open the Pages link in a browser after Pages is enabled there.

## Grading and Reports

- [ ] View the grading workflow.
- [ ] **Destructive/optional:** edit, preview, and confirm-push a workflow only
      in the safe test repository.
- [ ] Preview grading dispatch.
- [ ] **Destructive:** confirm grade dispatch only for the sandbox assignment.
- [ ] Open Grade Status; verify refresh and any available run links.
- [ ] Generate/view the Faculty Report after results are available.

## Release Validation

- [ ] Run `npm run validate:release`.
- [ ] Run `cd ui && npm run package` if packaging was not included above.
- [ ] Launch the packaged app and repeat the app/course smoke steps.

Do not use real student data for a pilot smoke test unless your institution has
approved that use and access controls.
