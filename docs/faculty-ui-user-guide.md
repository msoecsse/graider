# Graider Faculty User Guide

Graider is a desktop app for managing GitHub-based course assignments from a
local course folder. Use a safe sandbox course first when trying actions that
create repositories, push a grading workflow, or dispatch grading.

## What Graider Does

Graider helps faculty:

- set up course, term, and roster files;
- create and edit assignments;
- preview and apply student repository setup;
- generate a student repository access page for Canvas;
- view, edit, and push the configured grading workflow;
- preview and dispatch grading, check its status, and generate a faculty report.

## What Graider Does Not Do Yet

- It does not send student email.
- It does not post to Canvas.
- It does not enable GitHub Pages.
- It does not automatically commit or push the student access page.
- It does not replace GitHub permissions or organization policy.
- It does not grade on your computer; configured GitHub Actions workflows do
  the grading.

## Before You Start

You need a local course folder, access to its GitHub organization and course
repository, and GitHub authentication. For most faculty, open Terminal once and
run `gh auth login`, then start Graider and check that the dashboard reports
GitHub authentication as connected. The packaged app includes Graider itself;
you do not need a separate CLI install.

## Publish Course Changes

Roster CSVs, term files, assignments, and course settings are saved locally in
the course/admin repository. From the Course Dashboard, use **Publish Course
Changes** when the dashboard reports local Graider-managed changes or unpushed
commits. Review the listed files and confirm before publishing.

Graider stages only supported course files such as `course.yml`, `term.yml`,
roster CSVs, assignment YAML files, and the managed grading workflow. It does
not stage unrelated files. Student Access Pages use a separate Pages repository
and must still be published with **Publish Student Access Page**.

Prepare these items before an assignment cycle:

- A configured course folder with `course.yml` at its root.
- A canonical roster CSV for each section:

  ```text
  student_id,github_username,email,first_name,last_name,section,status
  ```

- `active`, `dropped`, or `hold` roster status for every student. Active
  students are eligible for repositories and access-page links; dropped and
  hold students are skipped.
- A local clone of the configured student-access Pages repository. The private
  course/admin repository can remain private.
- A configured grading workflow before dispatching grading.

## Launch Graider

Open `Graider.app`. On macOS, the pilot build may be unsigned; if Gatekeeper
blocks it, use your institution's approved procedure to open a known pilot app.
Confirm the GitHub authentication status before GitHub-backed work.

## Open a Course Folder

Use the dashboard's course-folder action to select the local folder containing
`course.yml`. Graider remembers registered folders and refreshes them on later
launches. Use **Refresh** after changing files outside Graider or after fixing
authentication.

If the folder is rejected, confirm that `course.yml` is at its root and that
the expected `terms/` folder is inside it.

## Course Dashboard Overview

The dashboard groups available courses, terms, and assignments. Select an
assignment row to open Assignment Detail. Use **New Assignment** to create an
assignment, **Manage Rosters** to edit a section roster, and **Refresh** to
reload local/GitHub-backed readiness information.

## Set Up a Course and Term

For a new course, use the course setup wizard. Provide the course title and
code, GitHub organization, term code, and one or more section IDs. You may add
roster uploads during setup.

The wizard writes these local files after confirmation:

```text
course.yml
terms/<term-code>/term.yml
terms/<term-code>/rosters/<section-id>.csv
```

Term codes use the `YYsN` format, such as `27s1`; use the term convention
already adopted by your department/course repository.

## Manage Rosters

Choose **Manage Rosters**, select the term and section, review the table, then
save the canonical seven-column CSV. Use **Add Student** to add an individual
student; the selected section is filled in and the status defaults to `active`.
Use **Remove Student** to remove a row, **Replace from CSV** to replace the
selected roster with an uploaded canonical CSV, or **Clear Roster Rows** to
save a header-only roster while keeping the section. Review the preview before
using **Save Roster**. Keep `student_id` and `github_username` accurate. Use `active` for students who should receive repositories; use
`dropped` or `hold` to exclude them from repository access-page generation.

To add a section after course setup, select the term and choose **Add Section**.
Enter a safe, unique section ID, optionally upload a canonical roster CSV (or
leave it empty), preview the `term.yml` and roster changes, then explicitly
save. Graider creates `terms/<term-code>/rosters/section-<section-id>.csv`.

If Graider reports a legacy roster, explicitly save it through the roster
manager to migrate it to the seven-column format. Do not remove the email and
name columns even though the student access page never displays them.

## Create a New Assignment

Use **New Assignment** from the dashboard. Enter the assignment title and
slug, term, target sections, template repository and branch, deadline, points,
and grading settings. Review the generated configuration, then use **Save
assignment setup**.

When you select a term, all of its sections are selected by default, including
sections with an empty roster. Clear any section checkbox that should not be
included before previewing and saving the assignment.

The assignment is stored at:

```text
terms/<term-code>/assignments/<assignment-slug>/assignment.yml
```

Before saving a template-backed assignment, Graider checks that the authenticated
GitHub identity can access the template repository and that the selected branch
exists. Leave the branch blank to use the repository's GitHub default branch
(for example, `master`); an explicit branch is validated exactly as entered. If validation fails, check the owner/repository spelling, branch name,
and GitHub permissions; Graider will not save the assignment with an unverified
template reference.

Choose the intended assignment status. A draft or closed assignment can still
be reviewed, but repository creation and grading readiness may be restricted.

## Edit an Assignment

Open Assignment Detail and choose **Edit assignment**. Review the title,
sections, template repository/branch, deadline, status, points, and grading
settings. Save with **Save assignment changes** only after reviewing the
preview. The assignment term and slug are identity/path fields, so create a new
assignment rather than trying to rename them in place.

## Apply an Assignment and Create Student Repositories

From Assignment Detail choose **Preview apply**. The preview shows the
repositories Graider would create, update, skip, or block. Resolve unexpected
repository names, roster problems, and blockers before continuing.

Use the confirm control on the Apply Preview page to run the apply operation.
It creates/configures the selected students' repositories and records the local
manifest. “Not applied” usually means repositories have not been created yet;
it is not automatically an error. Apply must succeed before repository links
can be shared with students.

## Share Repository Links with Students Using Canvas

Graider's current student-notification fallback is a static GitHub Pages access
page, not email.

1. Configure the optional Pages target in `course.yml` (or the Course Setup
   wizard), then select its local filesystem clone from Assignment Detail. The
   default target derives from the selected course GitHub organization as
   `<org>/<org>pages`, with base URL `https://<org>.github.io/<org>pages`.
   For CSC1120:

   ```yaml
   notifications:
     student_access_pages:
       repository: csc1120/csc1120pages
       base_url: https://csc1120.github.io/csc1120pages
       branch: main
   ```

   `repository` is the GitHub `owner/repository`, while `base_url` is the HTTPS
   Pages URL. The local repository folder is a machine-local filesystem path;
   Graider does not store that path in `course.yml`.

2. In **Student repository access page**, choose **Generate student access
   page** (or **Regenerate student access page**).
3. Confirm the output path in the selected Pages repository is:

   ```text
   terms/<term-code>/notifications/<assignment-slug>/student-repositories.html
   ```

4. Review Included and Missing repositories. Resolve missing repository links
   before posting the page when possible; missing rows are excluded by default.
5. Use **Copy Canvas link**, then paste that link into Canvas.

The page lists MSOE usernames (`student_id`) and repository links only. It does
not list names, emails, grades, roster statuses, or diagnostics. Students find
their MSOE username and select **Open repository**.

For example:

```text
terms/27s2/notifications/lab02/student-repositories.html
https://csc1120.github.io/csc1120pages/terms/27s2/notifications/lab02/student-repositories.html
```

## Publish the Student Repository Access Page

Generating the file does not make the Canvas link live. In Assignment Detail,
review **Publish readiness**:

| Status               | What to do                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Not generated        | Generate the access page first.                                                                    |
| Not a git repository | Select the intended local Pages repository clone; Graider cannot assess publishing here.           |
| Uncommitted          | Choose **Publish Student Access Page**, review the single page-file change, then confirm.          |
| No upstream          | Configure/push an upstream branch using the displayed manual command.                              |
| Unpushed             | Choose **Publish Student Access Page**, then confirm the push.                                     |
| Pages unknown        | Local checks are complete, but the GitHub Pages URL could not be determined from course settings.  |
| Ready to publish     | Local file, commit, and push checks look ready. Confirm Pages is enabled before posting in Canvas. |

**Publish Student Access Page** is always explicit and requires a review before
it runs. It stages only the generated page for the current assignment, commits
it with a predictable message, and pushes the current upstream branch; it never
stages unrelated Pages-repository files. Suggested commands remain available
for manual troubleshooting. Readiness is local-only: Graider does not verify
that GitHub Pages is enabled or that the URL is live. Enable Pages in GitHub
before sharing the Canvas link. Course configuration changes still require a
separate commit and push of the admin repository.

## View or Edit the Grading Workflow

From Assignment Detail select **View workflow**. Graider reads the configured
template repository, branch, and workflow path (normally
`.github/workflows/grade.yml`). Review changes carefully, use
the workflow preview, and select **Confirm push** only for a safe, authorized
template repository. If the workflow is missing, Graider shows the absence so
you can provide the expected workflow before grading.

## Configure Group Assignment Membership

From Assignment Detail, select **Group repositories** under **Repository mode**
and provide a `groups.csv` file in the assignment folder using:

```text
group_id,student_id
team-1,student-a
team-1,student-b
```

Each student must be active, selected for the assignment, and belong to the
same section as the other members of their group. Saving keeps `groups.csv`
beside `assignment.yml`; use **Publish Course Changes** to share those local
admin-repository changes. Group Apply Preview shows one planned repository per
group ID, including its members and repository name. Use Preview before Apply.
Apply creates one shared repository per group and gives every member admin
access. If Apply fails partway, Graider writes no manifest and some repositories
may already exist; delete partial repositories manually or wait for a future
reconcile workflow before trying again. Group grading and status/report views
remain limited until their group-aware work is completed.

## Dispatch Grading

Choose **Preview grading** from Assignment Detail. Review the planned workflow
dispatches and diagnostics. Confirm dispatch only when the selected assignment
and repositories are ready. Dispatch starts the configured GitHub Actions
workflows; it does not compute grades locally.

## Check Grade Status

Use **View grading status** or **View full grade status**. The status page can
refresh while work is unfinished; use **Refresh status** if automatic refresh
stops or you want a new snapshot. A missing run usually means dispatch has not
occurred, the workflow is unavailable, or GitHub has not started it yet.

## Generate the Faculty Report

Choose **Generate report** from Assignment Detail, or **View faculty report**
from Grade Status. Use **Refresh report** after grading artifacts become
available. The report depends on configured grading results, so unavailable or
failed workflow results may leave report rows incomplete.

## Common Problems and Fixes

- **GitHub authentication not detected:** Run `gh auth login`, relaunch or
  refresh Graider, and confirm the account can access the organization.
- **Course folder not recognized:** Select the folder containing `course.yml`,
  not a parent or assignment subfolder.
- **Assignment not applied / repositories missing:** Use **Preview apply**,
  resolve blockers, then confirm apply. Do not share the access page until the
  manifest has repository URLs for intended active students.
- **Roster schema rejected:** Save the canonical seven-column header shown
  above and ensure each row's section and status are valid.
- **Student missing from access page:** Check that the roster status is active
  and that the assignment manifest has a repository URL for that student.
- **Canvas link opens 404:** Confirm the page was generated in the selected
  Pages clone, committed and pushed there, and that GitHub Pages is enabled for
  the Pages repository.
- **Access page uncommitted or unpushed:** Use the displayed copy-only commands
  in a terminal from the Pages repository, then refresh readiness.
- **Workflow missing or grade dispatch fails:** Check the configured template,
  branch, workflow path, GitHub auth, and Assignment Detail diagnostics.
- **Grade status has no runs:** Confirm dispatch was completed and allow GitHub
  Actions time to start; then refresh status.
- **Report unavailable:** Wait for grading results/artifacts and refresh the
  report.
- **macOS blocks the packaged app:** The pilot may be unsigned. Follow your
  institution's approved Gatekeeper guidance for a trusted pilot build.

## Safe Operating Tips

- Use a sandbox course when testing apply, workflow push, or grade dispatch.
- Always preview before confirming apply or grading.
- Review roster identities and missing-repository diagnostics before sharing.
- Keep course files and generated access pages under version control.
- Never put GitHub tokens in course files, rosters, reports, or screenshots.

## Quick Reference Checklist

1. Confirm roster.
2. Create or edit the assignment.
3. Preview apply.
4. Apply the assignment.
5. Generate the student access page.
6. Check publish readiness.
7. Commit and push the generated page manually.
8. Copy the Canvas link.
9. Post the link in Canvas.
10. Dispatch grading when ready.
11. Check grade status.
12. Generate the faculty report.

For packaged-app and developer validation details, see the
[Electron Release Readiness Guide](electron-release-readiness.md).
