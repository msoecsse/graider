# Graider Faculty User Guide

Graider is a desktop app for GitHub-backed courses, with discovered managed courses
and separate legacy local course folders. Use a safe sandbox course first when trying actions that
create repositories, push a grading workflow, or dispatch grading.

## What Graider Does

Graider helps faculty:

- set up course, term, and roster files;
- create and edit assignments;
- preview and apply student repository setup;
- generate a student repository access page for Canvas;
- view, edit, and push a configured custom grading workflow, or use Graider's
  managed workflow deployment and replacement actions;
- preview and dispatch grading, check its status, and generate a faculty report.

## What Graider Does Not Do Yet

- It does not post to Canvas.
- It does not enable GitHub Pages.
- It does not automatically commit or push the student access page.
- It does not replace GitHub permissions or organization policy.
- It does not grade on your computer; configured GitHub Actions workflows do
  the grading.

## Before You Start

For managed courses, use **Sign in to GitHub** in Graider and authorize course access.
Courses are discovered and synchronized for that account; no manual admin-repository
clone or GitHub CLI sign-in is required. Creating a remote course requires owner
privileges in an existing GitHub organization. The packaged app includes Graider
and its Git engine; you do not need a separate CLI install. Separate legacy CLI/local
workflows retain their existing authentication requirements.

After sign-in and course authorization are established, opening supported cached
course details, roster sections, and the Comment Library does not check GitHub or
fetch the course again. Supported local assignment and configuration views also use
the cached course revision. A temporary GitHub outage does not add a new sign-in
requirement for those reads. Cached content can be older than GitHub; opening a view
does not verify remote freshness. Managed publication status describes pending local
changes only.

Saving course configuration, publishing, lifecycle changes, synchronization, and explicit remote status
or readiness checks still require current remote access. Sign-out, account changes,
known loss of course access, or an unsafe cache prevent cached reads. Startup and
**Refresh courses** still establish authorization through GitHub; this does not add
offline startup support. After the account is verified, previously discovered cards
appear from an account-specific local snapshot. Course access labels distinguish
cached, verifying, current, and needs attention; cached cards do not grant grading
or publication permission. Opening a registered course verifies that course without
waiting for organization-wide discovery. New courses continue appearing in the
background. **Refresh courses** preserves visible cards and assignment results;
a temporary discovery failure preserves them with an error message. Account changes
clear the previous account's loaded results. Schema 2 operation availability and section/role restrictions
remain unchanged.

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
  student_id,github_username,section,status
  ```

- `active`, `dropped`, or `hold` roster status for every student. Active
  students are eligible for repositories and access-page links; dropped and
  hold students are skipped.
- A local clone of the configured student-access Pages repository. The private
  course/admin repository can remain private.
- Either a configured custom grading workflow, or an assignment using Graider's
  managed `java-junit-checkstyle` preset. Managed assignments receive the
  canonical workflow during Apply; a custom workflow must be available before
  dispatching grading.

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

For discovered courses, use **Refresh courses** and **Course details**. Existing
Schema 1 courses still use your configured MSOE username and remain eligible for
**Review migration**. Schema 2 course access uses your signed-in GitHub account's
immutable identity and recorded faculty roles; changing your local username cannot
grant access. Course details include only terms authorized for that account. Former
faculty retain their permitted historical views; fallback administration alone does
not grant student or section access.

Shared archived Schema 2 courses appear through **Show archived** and continue to
synchronize. **Course details** includes **Inspect authorized rosters** and **Read
shared comments** as read-only evidence. A coordinator can explicitly choose
**Expand to all sections as coordinator**; the backend still verifies that role.
Fallback administration alone exposes no students or shared comments. Eligible
administrators/coordinators see **Archive course** or **Unarchive course** only when
the lifecycle/readiness guards allow it; saving changes the remote course state.

Assignment/roster editing, Apply, student repository downloads/updates, grading,
report publication, workflow/template changes and Access Pages for Schema 2 remain
unavailable pending their later phase services. Term activation/deletion/recovery
also remains unavailable without complete trusted execution evidence. Draft terms
cannot run student-facing work. Archived and former-role access never bypasses these
limits. Production course upgrades remain disabled. An incompatible or newer
schema requires an update; Graider will not open a stale Schema 1 cache as a workaround.
If the remote course changed or freshness cannot be verified, refresh courses before
opening its details. Your local files are preserved.

## Course Dashboard Overview

The dashboard groups available courses, terms, and assignments. Select an
assignment row to open Assignment Detail. Use **New Assignment** to create an
assignment, **Manage Rosters** to edit a section roster, and **Refresh** to
reload local/GitHub-backed readiness information.

From Assignment Detail, **Delete assignment** requires confirmation and removes
only that assignment's local `assignment.yml` configuration. It does not delete
GitHub repositories, student repositories, GitHub Classroom resources, or
generated local artifacts; create the assignment again with **New Assignment**
when needed.

## Create a Remote Course

1. Choose **Create remote course** after signing in.
2. Select an existing organization where you have owner privileges, then enter a
   new private repository name, course details, your institutional username and
   initial term code (`YYs1`, `YYs2` or `YYs3`).
3. Explicitly select at least one coordinator by institutional and GitHub username.
   You become fallback administrator automatically, with no automatic coordinator
   role. **Select me as a coordinator** is an explicit choice.
4. Select section faculty separately. Neither fallback nor coordinator status makes
   someone section faculty. Graider independently verifies every selected GitHub
   account; institutional usernames are directory metadata.
5. Choose **Verify setup**, review the verified account IDs and roles, then choose
   **Create private course**. Identities and organization access are checked again.

The new course uses Schema 2 immediately and starts with an Unarchived course and
a never-Active Draft term. It does not need migration. Graider publishes metadata,
then configures managed GitHub teams, permissions, branch protection and discovery.
Refresh courses to synchronize and open Course details. Student-facing operations
remain unavailable as described above; creating the course does not activate its term.

If GitHub invitations or external setup need attention, the published course is
preserved. Check the account/organization and repository before retrying anything;
Graider does not silently recreate or delete a partially configured course. An
unconfirmed creation result also requires checking whether the repository exists.
Changing account or closing the setup window invalidates its review.

## Set Up a Legacy Course Folder and Term

For standalone/legacy Schema 1 preparation, use **Set up course folder**. Provide the course title and
code, GitHub organization, term code, and one or more section IDs. You may add
roster uploads during setup.

Use a new folder outside an existing Git repository for standalone preparation.
Registered existing Git courses require current authenticated remote access. The
legacy wizard cannot replace Schema 2 or use a stale Schema 1 cache to downgrade it.
The roster, assignment, grading and publication instructions below describe existing
Schema 1 operations unless a section explicitly says Schema 2.

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
save the canonical four-column CSV. Use **Add Student** to add an individual
student; the selected section is filled in and the status defaults to `active`.
Use **Remove Student** to remove a row, **Replace from CSV** to replace the
selected roster with an uploaded canonical CSV, or **Clear Roster Rows** to
save a header-only roster while keeping the section and an explicitly configured
zero-student roster. **Remove Roster** deletes the roster files, reference, and
source history while keeping the section and its faculty. **Remove Section**
removes the section configuration and any associated roster files. All three
actions require confirmation, and none deletes student repositories. Review the
preview before using **Save Roster**. Keep `student_id` and `github_username`
accurate. Use `active` for students who should receive repositories; use
`dropped` or `hold` to exclude them from repository access-page generation.

To add a section after course setup, select the term and choose **Add Section**.
Enter a safe, unique section ID, optionally upload a canonical roster CSV (or
leave it empty), preview the `term.yml` and roster changes, then explicitly
save. Graider creates `terms/<term-code>/rosters/section-<section-id>.csv`.

Graider accepts former seven-column rosters for import compatibility and saves
them in the canonical four-column format.

## Create a New Assignment

Use **New Assignment** from the dashboard. Enter the assignment title and
slug, term, target sections, optional template repository/branch, optional
deadline and metadata (points, faculty owner, LMS assignment ID, and grading
category), and optional grading settings. Review the generated configuration,
then use **Save assignment setup**.

When you select a term, all of its sections are selected by default, including
sections with an empty roster. Clear any section checkbox that should not be
included before previewing and saving the assignment.

The assignment is stored at:

```text
terms/<term-code>/assignments/<assignment-slug>/assignment.yml
```

Leave both template fields blank to omit the template block. Before saving a
template-backed assignment, Graider checks that the authenticated
GitHub identity can access the template repository and that the selected branch
exists. Leave the branch blank to use the repository's GitHub default branch
(for example, `master`); an explicit branch is validated exactly as entered. If validation fails, check the owner/repository spelling, branch name,
and GitHub permissions; Graider will not save the assignment with an unverified
template reference.

Choose the intended assignment status. A draft or closed assignment can still
be reviewed, but repository creation and grading readiness may be restricted.

## Edit an Assignment

Open Assignment Detail and choose **Edit assignment**. Review the title,
sections, optional template repository/branch, optional deadline, status,
optional metadata (points, faculty owner, LMS assignment ID, and grading
category), and grading settings. Save with **Save assignment changes** only
after reviewing the preview. The assignment term and slug are identity/path
fields, so create a new assignment rather than trying to rename them in place.

## Apply an Assignment and Create Student Repositories

From Assignment Detail choose **Preview apply**. The preview shows the
repositories Graider would create, update, skip, or block. Resolve unexpected
repository names, roster problems, and blockers before continuing.

Use the confirm control on the Apply Preview page to run the apply operation.
It creates/configures the selected students' repositories, records the local
manifest, and generates or updates the student repository access page. Apply
reports failure if the required access page cannot be generated. “Not applied”
usually means repositories have not been created yet; it is not automatically
an error. The Dashboard presents this pre-Apply state as **Not applied**;
**Blocked** is reserved for diagnostics that prevent Apply. Apply must succeed
before repository links can be shared with students.

For an assignment explicitly using Graider's managed
`java-junit-checkstyle` preset, Apply also creates or updates the canonical
`.github/workflows/grade.yml` in applicable student repositories. Apply remains
conservative: it does not overwrite unmanaged or unsupported workflow content.
Use the explicit workflow-replacement actions when replacement is intended.

## Share Repository Links with Students Using Canvas

Graider provides a static GitHub Pages access page for repository links.

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

2. After Apply, confirm the generated page in **Student repository access page**.
   Choose **Regenerate student access page** only after roster or repository-link
   corrections.
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
| Not generated        | Apply the assignment, or regenerate the access page after correcting its inputs.                   |
| Not a git repository | Select the intended local Pages repository clone; Graider cannot assess publishing here.           |
| Uncommitted          | Choose **Publish Student Access Page**, review the single page-file change, then confirm.          |
| No upstream          | Configure/push an upstream branch using the displayed manual command.                              |
| Behind upstream      | Pull, rebase, or otherwise synchronize the local Pages repository before publishing.               |
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

## View, Edit, or Replace the Grading Workflow

From Assignment Detail select **View workflow**. For a custom workflow,
Graider reads the configured template repository, branch, and workflow path
(normally `.github/workflows/grade.yml`). Review changes carefully, use the
workflow preview, and select **Confirm push** only for a safe, authorized
template repository. If a required custom workflow is missing, provide it in
the template before dispatching grading.

For a managed `java-junit-checkstyle` assignment, the template copy is not
required for readiness: Apply deploys the canonical workflow to applicable
student repositories. Assignment Detail can explicitly **Replace template
workflow with Graider's workflow** after a review and confirmation. In the
grading workspace, **Replace Graider workflow…** can replace a student
repository workflow; the confirmation offers replacement-only or replacement
followed by grading. Both operations are targeted, confirmed mutations, and
replacement never silently dispatches grading.

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
For a valid preview, confirm Apply in the UI to create one shared repository per
group and give every member admin access. If Apply fails partway, Graider keeps
every observed repository in the assignment manifest. Review the failing
operation and retry Apply; tracked repositories are resumed without recreation.
Unknown repositories with matching names are still blocked and never adopted. Group
grading and status/report views remain limited until their group-aware work is
completed.

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

Assignment rows show **Grading passed** in green only after Graider verifies the
configured grading result for the current remote default-branch submission and
the selected workflow run/attempt. **Grading failed** is red when the result or
an explicit Checkstyle/JUnit check failed, even if GitHub Actions says success.
Missing, invalid, expired, stale, contradictory, unavailable, and unverified
results use attention labels; they are not recorded as actual grading failures.
Queued, in-progress, disabled, and newly created repository states remain separate.
The full Grade Status page retains Actions execution status/conclusion and run links.
Refresh only reads GitHub; it does not repair repositories or rerun grading.

For an older managed workflow missing the final status enforcement step, use the
existing **Replace Graider workflow…** operation in student grading, review and
confirm replacement of the managed workflow, then explicitly run grading for the
current submission and refresh. Update the template's managed workflow with **Replace with Graider workflow**
and confirm replacement for future repositories. The separate **Replace workflows
& run for all students** action also requires explicit confirmation. Unmanaged
workflow conflicts require faculty review. Existing student repositories are
never silently updated or rerun. The final workflow step fails the Actions job
when grading fails, after result and diagnostic artifact upload.

## Generate the Faculty Report

Choose **Generate report** from Assignment Detail, or **View faculty report**
from Grade Status. Use **Refresh report** after grading artifacts become
available. The report depends on configured grading results, so unavailable or
failed workflow results may leave report rows incomplete. Verified failed grading
results remain reportable; a failed Actions job does not by itself prevent report
generation when valid grading evidence exists.

## Common Problems and Fixes

- **GitHub authentication not detected:** Run `gh auth login`, relaunch or
  refresh Graider, and confirm the account can access the organization.
- **Course folder not recognized:** Select the folder containing `course.yml`,
  not a parent or assignment subfolder.
- **Assignment not applied / repositories missing:** Use **Preview apply**,
  resolve blockers, then confirm apply. Do not share the access page until the
  manifest has repository URLs for intended active students.
- **Roster schema rejected:** Save the canonical four-column header shown
  above and ensure each row's section and status are valid. Former seven-column
  files are accepted only for import and are saved back in canonical form.
- **Student missing from access page:** Check that the roster status is active
  and that the assignment manifest has a repository URL for that student.
- **Canvas link opens 404:** Confirm the page was generated in the selected
  Pages clone, committed and pushed there, and that GitHub Pages is enabled for
  the Pages repository.
- **Access page uncommitted or unpushed:** Use the displayed copy-only commands
  in a terminal from the Pages repository, then refresh readiness.
- **Workflow missing or grade dispatch fails:** For custom grading, check the
  configured template, branch, workflow path, GitHub auth, and Assignment
  Detail diagnostics. For managed grading, confirm the assignment explicitly
  uses the managed preset, Apply has completed, and any intended replacement
  was confirmed in the appropriate template or student-repository action.
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
4. Apply the assignment (which generates the student access page).
5. Check publish readiness.
6. Commit and push the generated page manually.
7. Copy the Canvas link.
8. Post the link in Canvas.
9. Dispatch grading when ready.
10. Check grade status.
11. Generate the faculty report.

For packaged-app and developer validation details, see the
[Electron Release Readiness Guide](electron-release-readiness.md).

# Downloading assignment repositories

From **Assignment Detail**, choose **Download Student Repositories**, then
choose a destination folder. Graider creates one local folder per repository
target: one per student repository for individual assignments, or one shared
folder per group repository for group assignments. The result lists the
students attached to each downloaded group repository.

Existing destination folders are left unchanged and reported as failures rather
than overwritten. A failure for one repository does not stop the remaining
downloads; review the per-repository results when the download completes.

## Local grading responsiveness

Once a Schema 1 course is authorized and its verified local cache is available,
preparing the grading workspace, opening student source, saving comments or
adjustments, marking grading complete and autosaving editor position use local
course evidence. This also applies to registered legacy folders whose origin,
revision and faculty metadata match the verified cache; no migration or cutover is
required. These actions do not fetch the course from GitHub. Signing out or changing accounts
invalidates the workspace; reopen it after authorizing the correct account. Changed
student submission commits still block stale grading changes.

Student source, grading details, saved editor position and local commit history
load independently of remote automated evidence. Choose **Load automated checks**
in the **Automated Checks** panel (or press **A**) to retrieve JUnit, Checkstyle and
workflow details. **Reload automated checks** retrieves fresh results. Switching
students clears the previous evidence and requires a new request; late results
from the previous student are discarded. Evidence retrieval does not block local
grading actions. Startup requests wait for sign-in restoration and course discovery
rather than treating loading as a sign-in failure.

Publishing reports, pulling student changes, downloading repositories, applying
assignments and running remote grading retain their remote checks. Use an explicit
course refresh to obtain newer remote course configuration. Schema 2 operation
restrictions are unchanged.

## Reviewing legacy grader access during migration

For an authorized discovered Schema 1 course, open **Review migration**. Complete
the Faculty, Course authority, Terms, assignment evidence and Review selections,
then choose **Complete migration review**. Decisions are automatically saved on this
computer, outside the course repository, for your signed-in account and exact source.
Leaving the page, closing the window or restarting Graider preserves unfinished
review progress. Reopening always shows the overview; choose **Check course** to
recheck source and identities before restoring decisions. Check course is read only
and creates no checkpoint. Complete both reviews again after restoration; saved
progress never authorizes publication.

Open **Legacy grader access** and choose **Load grader inventory**. The read-only
inventory shows the exact legacy team, immutable GitHub user IDs/current logins,
existing reviewed section assignments, and legacy repository permissions being
considered for retirement. Unknown or incomplete evidence stays visible.

Choose an explicit disposition for every verified member:

- **Existing section assignments are sufficient** preserves the reviewed roles.
- **No section faculty access should remain** adds no roles. It cannot remove an
  existing v1 section-faculty relationship.
- **Assign selected exact sections** requires a verified faculty directory identity.
  Select each exact term and section; membership never selects sections for you.

For a new identity, return to **Faculty**, enter the institutional username and
GitHub login, and explicitly verify/add the person. This resets review selections;
complete migration review again and reload the grader inventory. Numeric GitHub
IDs cannot be entered as identity proof.

Draft/Active selections add current section relationships. Archived selections
explicitly confirm normal historical completion retained as a current relationship;
they do not create former roles, removal history or timestamps.

Choose **Complete grader access review**. Missing dispositions or invalid choices
prevent completion. Completion grants no live access and authorizes no publication.
Refresh, identity re-verification, changed source/account/session or a replacement
inventory invalidates affected approvals. Source or identity changes discard stale
decisions rather than merging them onto new evidence. A different account cannot
reuse your saved progress. Damaged/incomplete saved state is ignored safely; check
the course and review again. An autosave error is shown explicitly; keep the page
open, restore course access and retry the selection before leaving.
No course files, teams or permissions change during review. Production courses
continue using Schema 1 until all independent publication prerequisites are satisfied.

## Confirming an upgrade and following progress

Migration is optional. Authorized Schema 1 courses have a dismissible upgrade
reminder; **Review migration** remains available after dismissal. Existing Schema 1
operations remain available while prerequisites are unmet.

After completing both reviews, open **Final summary**. Review course identity,
resolved roles/lifecycle decisions, preserved deferred findings and checkpoint
meaning. Faculty using incompatible Graider clients will lose access to the
migrated course until they update. The single **Upgrade course** button explicitly
acknowledges this consequence for the exact current review; there is no additional
checkbox, typed phrase or confirmation dialog.

The review and readiness checks happen before Graider creates and verifies the
immutable remote Schema 1 recovery checkpoint. Only after that checkpoint is
verified does Graider write the candidate in an isolated workspace, validate its
actual files and repeat the required safety checks before publishing. Read-only
preview does not write candidate files or upgrade the authoritative course.

Production migration remains disabled pending independently verified initiating-client
operational support, Phase 3 signing/distribution/update prerequisites and compatible
macOS arm64 and Windows x64 production releases. Review completion, acknowledgement,
a Preview app and passing tests do not enable migration. Backend blockers explain
whether to refresh/review current source or wait for and install a compatible
production update. No inventory of other faculty installations is required.

When execution is available, Graider displays actual preparation, validation,
checkpoint, publication, synchronization and reconciliation stages. Navigation is
blocked while the transaction is active. **Cancel upgrade** is available only while
the backend says preparation can be cancelled. Once publication begins, cancellation
is unavailable. Closing/reloading the window is not cancellation. Reopening recovers
authoritative status; an unknown push outcome must be verified before another attempt.

## Migration results, recovery and permanent history

- **Ready:** Schema 2 is authoritative and required current operational access was
  independently verified. Safely deferred historical findings remain informational.
- **Published — Needs attention:** Schema 2 is authoritative; synchronization or
  required reconciliation is incomplete/unverified. Return to the course overview
  for permitted functionality and use **Migration History and recovery** for details.
- **Not published:** this attempt did not publish. Reopen the saved review, check
  the course and complete current reviews before explicitly retrying. If the source
  changed, review the new revision; old decisions are never silently applied.

A rejected push is not automatically repeated. For an unknown outcome, reconnect
and choose **Verify publication outcome**. Graider observes remote history without
pushing again. Confirmed Schema 2 publication is never rolled back because cache
refresh or access reconciliation needs attention.

For published courses, **Course Settings → Migration History** permanently retains
the migration date, original Schema 1 checkpoint, publication revision, reviewed
faculty decisions, deferred findings and reconciliation results. The summary has
expandable **Technical details**. The checkpoint is preserved remote evidence, not
an automatic rollback or backup of machine-local grading records.

**Verify and retry reconciliation** checks fresh course/account/GitHub state. It
never republishes the migration. After intervening course changes, review the report
and explicitly choose **Review current state and retry with a fresh plan**. This
preserves original audit history and unresolved operations while rebuilding current
reconciliation intent. Historical Ready is not current access proof. Recovery
requires the current fallback administrator or a current coordinator of the
latest-created existing term, with fresh GitHub privileges; old reviews and cached
permissions cannot grant recovery authority. With no terms, fallback alone qualifies.
No Git, Terminal, PAT entry or manual reset is the normal recovery path.

On the first return to a course with freshly verified access, Graider shows a brief
upgrade-complete notice. Subsequent visits keep the permanent history entry without
repeating migration warnings. Published courses with incomplete/unverified current
access keep a **Needs attention** notice linking to recovery. Deferred student
identity/grading/comment findings alone do not generate repeated warnings for Ready
courses, and Ready does not enable operations reserved for later roadmap phases.

Applied and partially applied assignments offer **Continue grading** even when
optional remote template or workflow readiness checks are unavailable. Local
grading requires your verified Graider account and authorized local course state;
it does not require GitHub CLI sign-in or another course synchronization. Remote
readiness restrictions still apply to GitHub-dependent operations.

Opening an assignment selects the first student needing grading in your current
student sort order. If everyone is complete or published, it selects the first
student in that order.

Student switching loads source and saved editor position together. The editor opens
with its saved cursor and scroll position before position autosave is enabled.

Choose **Replace Graider workflow…** to check workflow repair availability. This
check runs on demand and can require GitHub access. Replacement still requires
the confirmation dialog and existing authorization checks.

After successful **Mark Complete** or **Set score to 0 and complete**, grading
moves to the next student needing grading in the current student sort order,
including students outside the active filter. Completion waits for persistence
and refreshed grading details. Pending drafts still require resolution. If you
switch students during completion, the completed request leaves your selection
alone. When none remain, the workspace stays on the completed student and shows
a grading-finished message.

### Previously opened courses and background refresh

After Graider verifies your signed-in GitHub account, previously opened course,
term, and assignment summaries can appear from this computer's display cache.
A **Cached display** status means the information may be stale while Graider checks
course access and updates in the background. You can browse available summaries
without waiting for organization-wide course discovery. Opening grading data or
performing operations may still wait for current course access and a safe local
source; cached cards do not grant permission to grade, modify, or publish.

Background updates preserve your route and grading selections. A genuine course
revision or authorization change can still require you to reload or resolve access
before proceeding. Refresh explicitly checks authoritative course state and retries
failed work. If GitHub is temporarily unavailable, existing summaries remain visible
and failed updates can be retried. A new session must still verify account identity;
if that cannot complete, Graider preserves the saved credential and asks you to retry
when connected. Signing out or switching accounts clears the displayed account data.

### Pull latest changes while grading

Select a student and choose **Pull latest changes** to fetch that student's
tracked upstream branch and safely advance the downloaded repository. Signing
into GitHub in Graider is sufficient; GitHub CLI sign-in and environment tokens
are not required. An unchanged repository reports that it is already up to date.

Saved feedback, deductions, manual adjustments, zero-score overrides, grading
status, editor position, publication information, and earlier update history are
preserved. Complete and Published students retain their status and show
**Updated Since Grading**. Source, annotations, documents, snapshot, and commit
history refresh in the open workspace. General comments stay general; uncertain
source anchors remain visible as stale for review.

Pulling does not rerun automated checks or republish feedback. Review the changed
source and stale anchors, explicitly rerun checks when needed, and review and
republish feedback when appropriate. Graider asks before discarding an unsaved
draft. Nonoverlapping local work is retained only when its safety can be proven.
If local changes, staged files, conflicts, divergent history, or repository
identity checks block the update, review the repository manually and resolve the
reported problem before retrying. Graider does not reset, clean, stash, or replace
the checkout. If Git completes but saving the new submission SHA fails, grading
remains blocked by its consistency guard until the repository and recorded SHA
are reconciled; existing grading work remains saved.

## Importing externally reviewed feedback

In an assignment's grading workspace, choose **Import Reviews...** and select the
review JSON files. **Review Import Preview** shows each student, repository,
reviewed SHA, current canonical SHA, and finding counts. Ready findings start
selected; **Apply Reviews** adds the selected feedback to ordinary grading.

When local Git evidence verifies that only Graider's managed grading workflow
changed, the preview explains that the reviewable submission is unchanged.
Both SHAs remain visible and ordinary import needs no recovery approval.
Other warnings, such as a rubric name fallback, still require approval.

For a student resubmission, the preview explains the SHA mismatch and required
approval above the findings. Choose **Review and approve all eligible recovered
findings** for the student, inspect the expanded findings, then choose **Approve
and select all eligible recovered findings**. You can still deselect individual
findings or approve them one at a time with **Process with recovery**. Unresolved
source locations, invalid rubric associations, and duplicates remain blocked.
Approval adds no comments until you choose **Apply Reviews**.

If the local student checkout is behind a reviewed commit, Review Import tries
one safe synchronization per student using your GitHub session. It verifies the
reviewed commit in the trusted remote branch and advances only by fast-forward
to its latest HEAD. The preview names the updated student and canonical SHA, and
revalidates the same JSON automatically. Ordinary imports whose history is already
available stay local and make no additional remote requests.

Synchronization preserves grading work, notes, scores, completion/publication
state, imported provenance, source-anchor history, and safe local changes. It
adds no imported feedback until **Apply Reviews**. Closing the preview preserves
any completed synchronization. Actual student changes still require recovery
approval; verified Graider workflow-only changes do not.

If synchronization is blocked, follow its diagnostic: sign in again, check network
or repository access, or review local conflicts, divergence, or concurrent work
using repository status/**Pull Latest**. Then reopen Import Reviews. Approval
cannot bypass missing evidence or inconsistent grading state. Graider does not
reset or discard local work to make an import succeed.

Graider rechecks the submission, repository, faculty access, source locations,
rubric mappings, and duplicates before applying feedback. If the submission
changes after preview, reopen the import. See [Review Import](review-import.md)
for the review file contract.

### Optional JavaFX GUI smoke tests

A successful JavaFX compilation or ordinary JUnit/TestFX run does not verify the
GUI. The managed Java preset reports **GUI not verified** with zero verified GUI
tests unless a faculty-provided test uses the optional `graider.gui.GuiSmoke`
helper. Existing assignments do not need to adopt it and retain their grading
behavior. The informational status appears in the grading result summary, the
Actions job summary and the grading artifact's `grading-evidence/gui.json`.

For an Application with a button `#submit` and label `#result`, a JUnit test can
use:

```java
@Test
void submitUpdatesResult() throws Exception {
    GuiSmoke.verify(MyApplication.class, "#submit", stage ->
        "Submitted".equals(((Label) stage.getScene().lookup("#result")).getText()));
}
```

Import `graider.gui.GuiSmoke` and the usual JUnit/JavaFX types. The label must
start with a different value. The helper shows the actual student application,
checks its Stage/Scene, clicks the button through JavaFX Robot under Xvfb, and
waits for the label change. Use one helper call per test. Existing TestFX tests
need explicit adaptation; do not combine competing toolkit lifecycle managers.

GUI launch, click/assertion and shutdown failures fail grading. Consult the
JUnit output and ordered GUI phase events in the always-uploaded artifact to
locate a failure. Startup, interaction and shutdown deadlines prevent hangs.
See the [grading result contract](grading-result-contract.md#optional-managed-javafx-gui-smoke-verification)
for deadlines, lifecycle compatibility and evidence semantics. Adopt the new
workflow using the existing explicit managed workflow repair; Graider does not
silently deploy it to existing repositories.
