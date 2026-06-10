# Graider UI Requirements — Slice UI-1: Electron Course Dashboard

Developer-facing operational notes for the completed UI-1 implementation live in
[Electron Dashboard Developer Guide](electron-dashboard-dev.md).

## Purpose

Build the first Graider UI slice: a desktop dashboard that looks and behaves similarly to the original GitHub Classroom dashboard while using Graider CLI commands as the source of truth.

This slice should provide a read-only multi-course dashboard for faculty. Faculty should be able to open and remember multiple Graider course admin repositories, see one card per course-term, view recent assignments, identify items needing attention, and refresh current GitHub-backed dashboard status.

The UI should reduce cognitive load by preserving the GitHub Classroom mental model:

```text
Your Courses
course/term cards
recent assignment links
simple search/filter/sort controls
small needs-attention indicators
```

---

## Technology Decision

Use:

```text
Electron
React
TypeScript
Vite
```

The UI should be a desktop application, not a hosted web app.

---

## Architectural Boundary

The UI must call the installed `graider` CLI directly.

Do not import Graider backend TypeScript modules into the UI.

The CLI remains the source of truth for:

```text
course parsing
assignment parsing
dashboard card construction
GitHub status checks
diagnostics
JSON contracts
mutations in later slices
```

The UI is responsible for:

```text
local course folder registry
running CLI commands
rendering JSON output
showing diagnostics
managing UI-only filters/search/sort
remembering recently opened course folders
```

The UI should run:

```bash
graider dashboard --json
```

from each registered course admin repository folder.

---

## Scope

### Included in UI-1

```text
Electron app shell
React dashboard screen
local course folder registry/cache
add/open course folder
remove course folder from registry
load dashboard data from all registered course folders
run graider dashboard --json per course folder
combine returned cards into one dashboard grid
GitHub Classroom-like card layout
recent assignment links on each card
search/filter/sort controls
needs-attention badge
diagnostics display
refresh dashboard
GitHub token discovery via gh auth token
safe token passing to graider child processes
empty/loading/error states
```

### Excluded from UI-1

```text
assignment detail page
apply button
grade button
report page
publish student reports
workflow generation
settings page
student-level repo status
artifact/result parsing
workflow run inspection
multi-folder auto-scan
hosted web deployment
GitHub OAuth
user accounts
cloud sync
```

---

## Main User Flow

### First launch

When the app opens and no courses are registered:

```text
Show empty state:
No courses added yet.
Open a Graider course folder to get started.
[ Open course folder ]
```

### Add course folder

When faculty clicks `Open course folder`:

```text
open native folder picker
user selects a Graider course admin repository root
store selected folder in local registry
run graider dashboard --json in that folder
display returned cards
```

Expected selected folder structure:

```text
csc1120/
  course.yml
  terms/
```

If the folder is not a valid Graider course repo, the UI should still store nothing and show the CLI diagnostic returned by `graider dashboard --json`.

### Returning launch

When the app launches with registered course folders:

```text
load local course registry
show cached cards if available
refresh each registered course folder by running graider dashboard --json
replace cached cards as fresh responses arrive
show per-folder loading state if needed
```

### Refresh

A `Refresh` button should rerun:

```bash
graider dashboard --json
```

for each registered course folder.

Refresh must not mutate GitHub or local course files.

---

## Local Course Registry

The UI needs a local registry because faculty may teach multiple courses in the same term and the backend dashboard command intentionally summarizes one admin repository at a time.

### Registry responsibilities

The registry should store UI-local metadata only:

```text
course folder path
stable local id
last opened timestamp
last successful refresh timestamp
optional display alias
last dashboard status
optional cached dashboard response
```

The registry should not be the source of truth for:

```text
assignments
rosters
GitHub status
diagnostics
reports
workflow status
student repos
```

That data should come from `graider dashboard --json`.

### Suggested registry shape

```json
{
  "schemaVersion": 1,
  "courseFolders": [
    {
      "id": "local-csc1120",
      "path": "/Users/sean/dev/graider-sandbox/csc1120",
      "displayAlias": null,
      "lastOpenedAt": "2026-06-09T19:30:00.000Z",
      "lastRefreshedAt": "2026-06-09T19:31:00.000Z",
      "lastDashboardStatus": "success"
    }
  ]
}
```

### Storage location

Use the standard Electron app user-data directory.

Do not store the registry inside the course repository.

Do not store secrets in the registry.

### Remove folder

The UI should allow removing a course folder from the registry.

Removing a folder from the registry must not delete files from disk.

---

## Dashboard Data Loading

For each registered course folder, the UI should run:

```bash
graider dashboard --json
```

with:

```text
cwd = registered course folder path
```

The UI should parse stdout as JSON.

If stdout is not valid JSON, show a command output error and include stderr safely.

### Combined dashboard model

The UI should combine all returned `cards` arrays into a single card grid.

Each card should retain source folder metadata:

```json
{
  "sourceFolderId": "local-csc1120",
  "sourceFolderPath": "/Users/sean/dev/graider-sandbox/csc1120",
  "card": {
    "kind": "course-term",
    "displayName": "27s1-csc1120"
  }
}
```

The UI may normalize this internally, but it should preserve the original CLI card object for future navigation.

### Partial failures

If one registered folder fails:

```text
show that folder's error/diagnostics
keep cards from other folders visible
do not clear the whole dashboard
```

Example:

```text
CSC1120 loads successfully
CSC4641 fails because token missing or workflow inaccessible
Dashboard still shows CSC1120 card and an error panel/card for CSC4641
```

---

## CLI Command Runner

Create a safe command runner abstraction in the Electron main process.

The renderer must not directly spawn arbitrary shell commands.

Recommended approach:

```text
renderer requests "runDashboard(courseFolderId)"
main process resolves registered folder path
main process runs graider dashboard --json with controlled args
main process returns parsed JSON or structured error
```

### Command execution requirements

Use argument arrays, not shell string interpolation.

Good:

```text
spawn("graider", ["dashboard", "--json"], { cwd, env })
```

Avoid:

```text
exec("cd " + cwd + " && graider dashboard --json")
```

### Security

Do not pass user-controlled strings into a shell command.

Do not expose generic command execution IPC to the renderer.

Only expose specific UI operations, such as:

```text
selectCourseFolder
listCourseFolders
removeCourseFolder
refreshDashboard
refreshCourseFolder
```

---

## GitHub Token Handling

`graider dashboard --json` requires `GRAIDER_GITHUB_TOKEN`.

The desktop app may not inherit shell environment variables when launched from Finder/Dock, so the UI should support GitHub CLI token discovery.

### Required token discovery behavior

Before running Graider dashboard commands, the Electron main process should try:

```bash
gh auth token
```

If successful, pass the returned token to Graider child processes as:

```text
GRAIDER_GITHUB_TOKEN=<token from gh auth token>
```

The UI should also preserve any existing `GRAIDER_GITHUB_TOKEN` from the app environment if present.

Recommended precedence:

```text
1. existing process.env.GRAIDER_GITHUB_TOKEN if non-empty
2. token from gh auth token
3. no token available -> show GitHub token required message
```

### Token security

The UI must not:

```text
display token values
log token values
store token values in the registry
store token values in localStorage
write token values to disk
include token values in diagnostics
include token values in error messages
```

The token should only be passed as an environment variable to the `graider` child process.

### Missing token state

If no token can be resolved:

```text
show a clear blocking message
do not show stale data as if it is fresh
offer setup guidance
```

Suggested UI copy:

```text
GitHub token required

Graider needs GitHub access to check current course and assignment status.
Sign in with the GitHub CLI, then refresh.

Run:
gh auth login
```

If the CLI returns `github_token_missing`, show the same state.

---

## Main Dashboard UI

The main screen should resemble GitHub Classroom’s dashboard.

### Page title

Use:

```text
Your Courses
```

### Top controls

Include:

```text
Search box
View filter
Sort dropdown
Refresh button
Open course folder button
```

Suggested layout:

```text
Your Courses

[ Search for a course or assignment ] [ View: Active ▼ ] [ Sort: Newest first ▼ ] [ Refresh ] [ Open course folder ]
```

### View filter options

```text
Active
Needs attention
All
```

Optional later:

```text
Archived
```

### Sort options

```text
Newest first
Course
Term
Needs attention
Recently refreshed
```

For UI-1, implement what is straightforward using returned card fields.

### Search behavior

Search should filter visible cards by:

```text
courseSlug
courseTitle
termSlug
termTitle
displayName
assignment slug
assignment title
```

Search is local/UI-only.

---

## Course-Term Card Design

Each card should represent one course-term returned by `graider dashboard --json`.

### Card content

Each card should show:

```text
green top strip similar to GitHub Classroom
displayName
course title or course slug
term title or term slug
roster summary if available
assignment count
needs-attention badge if applicable
recent assignment links
overflow menu or remove/manage affordance if needed
```

Example:

```text
┌────────────────────────────────────┐
│                                    │ green strip
├────────────────────────────────────┤
│ 27s1-csc1120                 ⚠ 2  │
│ CSC1120 · Spring 2027              │
│ 3 students · 4 assignments         │
│ ─────────────────────────────────  │
│ Lab 02                             │
│ HW 01                              │
│ Lab 01                             │
└────────────────────────────────────┘
```

### Card click behavior

For UI-1:

```text
clicking a card may select/focus it
clicking an assignment link may show a placeholder "Assignment detail coming next" state
```

Do not implement assignment detail in UI-1.

### Assignment links

Recent assignment rows should display:

```text
assignment title
status badge if useful
needs-attention indicator if assignment.needsAttention is true
```

Clicking should not run apply/grade/report in UI-1.

---

## Needs Attention Display

If a card has:

```json
{
  "needsAttention": true,
  "attentionCount": 2
}
```

show a small warning badge, not a large alarming banner.

Example:

```text
⚠ 2 issues
```

The user should be able to expand/view diagnostics.

### Diagnostics display

Show diagnostics in a readable list:

```text
severity
message
optional code
optional path/context
```

Do not show raw JSON by default, but provide a copy/debug affordance if useful.

Diagnostics should be grouped by:

```text
course folder
course-term card
assignment
```

---

## States

### Empty state

```text
No courses added yet.
Open a Graider course folder to get started.
[ Open course folder ]
```

### Loading state

```text
Loading courses…
```

For multiple folders, support per-folder loading if practical.

### Refreshing state

Show a lightweight progress indicator.

Do not block viewing existing loaded cards while refresh runs.

### Missing token state

```text
GitHub token required.
Sign in with GitHub CLI using gh auth login, then refresh.
```

### CLI not found state

If `graider` cannot be found:

```text
Graider CLI not found.
Install Graider or make sure graider is available on PATH.
```

If `gh` cannot be found and no environment token exists:

```text
GitHub CLI not found.
Install GitHub CLI or launch the app with GRAIDER_GITHUB_TOKEN set.
```

### Invalid JSON state

If Graider returns non-JSON output:

```text
Could not read Graider dashboard output.
```

Include safe stderr/stdout snippets for debugging.

### Folder no longer exists

If a registered folder is missing:

```text
Course folder not found.
[ Remove from dashboard ] [ Locate folder ]
```

---

## Accessibility

UI-1 should support:

```text
keyboard navigation through controls and cards
visible focus states
button labels that are clear without icons
warning badges with accessible text
sufficient color contrast
diagnostics readable without relying only on color
```

Do not rely on the green strip alone to communicate meaning.

---

## Styling Direction

Use a simple GitHub/Classroom-inspired visual style:

```text
white cards
subtle borders
green top strip
rounded corners
clear typography
muted secondary text
small badges
minimal color palette
```

Do not over-design the first slice.

No dark mode requirement for UI-1 unless the framework gives it for free.

---

## Error and Diagnostic Safety

The UI must not display or persist secrets.

Never show:

```text
GRAIDER_GITHUB_TOKEN
gh auth token output
authorization headers
raw process.env
full stack traces by default
student report contents
artifact contents
```

Safe display:

```text
diagnostic code
diagnostic message
safe path
safe repository name
HTTP status
command name
exit code
```

---

## Testing Requirements

Use the project’s chosen UI test strategy.

Recommended tests:

```text
unit tests for registry storage
unit tests for dashboard response aggregation
unit tests for card filtering/search/sort
unit tests for token resolver behavior with fake command runner
unit tests for safe command runner argument construction
component tests for empty state
component tests for loaded card grid
component tests for needs-attention badge
component tests for diagnostics panel
component tests for missing token state
component tests for partial folder failure state
```

If using Playwright or Electron integration tests later, defer broad end-to-end tests until the app shell is stable.

### CLI runner tests

Use fake process runners.

Do not require live `graider`.

Do not require live `gh`.

Test:

```text
runs graider dashboard --json with cwd set to course folder
passes GRAIDER_GITHUB_TOKEN when resolved
does not log token
handles nonzero exit with JSON body
handles nonzero exit with non-JSON output
handles missing graider executable
```

### Registry tests

Test:

```text
adds course folder
deduplicates same path
removes course folder
loads saved registry
handles corrupted registry safely
does not store token
```

---

## Suggested Project Structure

Use actual conventions chosen for the UI repository, but a reasonable starting structure is:

```text
ui/
  package.json
  index.html
  vite.config.ts
  electron/
    main.ts
    preload.ts
    ipc.ts
    courseRegistry.ts
    commandRunner.ts
    tokenResolver.ts
  src/
    App.tsx
    main.tsx
    dashboard/
      DashboardPage.tsx
      CourseTermCard.tsx
      DashboardToolbar.tsx
      DiagnosticsPanel.tsx
      dashboardTypes.ts
      dashboardAggregation.ts
      dashboardFilters.ts
    styles/
      globals.css
```

If the UI lives in the same monorepo, keep UI package boundaries clear.

---

## IPC Requirements

Expose only specific APIs from preload to renderer.

Recommended preload API:

```ts
window.graiderUI = {
  selectCourseFolder(): Promise<SelectCourseFolderResult>;
  listCourseFolders(): Promise<CourseFolderRecord[]>;
  removeCourseFolder(id: string): Promise<void>;
  refreshDashboard(): Promise<CombinedDashboardResult>;
  refreshCourseFolder(id: string): Promise<CourseFolderDashboardResult>;
};
```

Do not expose Node.js APIs directly to renderer.

Use Electron context isolation.

Do not enable remote module.

---

## Acceptance Criteria

UI-1 is complete when:

```text
- [ ] Electron + React + TypeScript + Vite app shell exists
- [ ] UI calls graider CLI directly instead of importing backend modules
- [ ] renderer cannot execute arbitrary shell commands
- [ ] local course folder registry exists
- [ ] faculty can add/open a course folder
- [ ] registry persists across app launches
- [ ] faculty can remove a course folder from registry
- [ ] UI runs graider dashboard --json in each registered course folder
- [ ] UI combines cards from multiple course folders
- [ ] UI shows one card per returned course-term
- [ ] UI shows recent assignment links on cards
- [ ] UI shows basic roster/assignment counts when returned
- [ ] UI shows needs-attention badges
- [ ] UI displays diagnostics safely
- [ ] UI supports search/filter/sort locally
- [ ] UI supports refresh
- [ ] UI obtains token from process.env.GRAIDER_GITHUB_TOKEN or gh auth token
- [ ] UI passes token to graider child processes as GRAIDER_GITHUB_TOKEN
- [ ] UI does not display, log, or store token values
- [ ] UI handles missing token clearly
- [ ] UI handles missing graider CLI clearly
- [ ] UI handles one folder failing while others still display
- [ ] UI performs no GitHub mutations in this slice
- [ ] UI does not run apply/grade/report/publish/generate in this slice
- [ ] tests cover registry, aggregation, filtering, command runner, token resolver, and key UI states
```

---

## Out of Scope

Do not implement:

```text
assignment detail screen
apply workflow
grade dispatch workflow
report generation screen
student report publishing
workflow generation UI
course creation wizard
student repository status scans
persistent token storage
hosted backend server
GitHub OAuth
cloud sync
permissions management
packaging/distribution installers
auto-update
```

---

## Future Slices

Likely next UI slices:

```text
UI-2: Assignment Detail Read-Only View
UI-3: Validation Diagnostics View
UI-4: Apply Preview and Confirm
UI-5: Grade Dispatch View
UI-6: Report Summary View
UI-7: Student Report Publishing View
UI-8: Workflow Generation View
UI-9: Packaging and Faculty Install Flow
```

The dashboard should provide navigation hooks for assignment detail but should not implement those pages yet.
