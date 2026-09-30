# UI snapshots

Turns the existing Vitest suite into screenshots of the real UI, so a UI change
can be reviewed visually instead of by reading JSX diffs.

It works by reusing the tests themselves. Every test that renders a component
already builds realistic fixture data and drives the component into a specific
state. This harness saves the resulting DOM, then renders it in Chromium with
the real `globals.css`. No separate mock layer, no fake data to maintain.

## Running it

```bash
npm --prefix ui run snapshots
```

The command uses the dedicated `ui/vitest.snapshot.config.ts`, wraps the
captured DOM with `globals.css`, and renders PNGs with Electron. It fails if no
HTML is produced or if any page cannot be captured. Generated HTML, wrapped
pages, and PNGs go under `ui/.ui-snapshots/{html,pages,png}` and are ignored by
Git.

On Linux without `DISPLAY`, the command automatically uses `xvfb-run` when it
is installed. If it is unavailable, install Xvfb first:

```bash
sudo apt-get install -y xvfb
Xvfb :99 -screen 0 1600x6000x24 &
DISPLAY=:99 npm --prefix ui run snapshots
```

Pass a single filename as the last argument to capture just one page. Electron
startup dominates the runtime, so capturing a chosen handful is much faster than
capturing all of them.

## Choosing which screens to capture

By default everything is wrapped, which is a lot. Fill in `PICKS` in `wrap.mjs`
to select a named subset, for example:

```js
const PICKS = {
  "01-grading-workspace":
    "GradingWorkspacePage__renders_the_workspace_with_a_loaded_submission.html",
  "02-assignment-detail": "AssignmentDetailPage__renders_the_existing_assignment_panels.html"
};
```

Snapshot filenames are `<SuiteName>__<test name>` with non-alphanumeric runs
replaced by underscores, truncated to 110 characters. Run the tests once and
list `.ui-snapshots/html/` to see what is available.

## Suggested use in CI

Run it on pull requests that touch `ui/src/**`, upload `.ui-snapshots/png/` as
a build artifact, and require the screenshots on any PR from the UI redesign
branch. Visual regressions in this codebase are otherwise invisible in review.

## Caveats

- jsdom does no layout, so what is captured is the DOM a test produced, laid out
  fresh by Chromium. Anything that depends on measured element sizes at runtime
  will not be reflected.
- Monaco does not render in jsdom; source-viewer screenshots show the
  surrounding chrome, not highlighted code.
- Tests that render very little are skipped (under 800 bytes of body HTML).
