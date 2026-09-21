# UI snapshots

Turns the existing Vitest suite into screenshots of the real UI, so a UI change
can be reviewed visually instead of by reading JSX diffs.

It works by reusing the tests themselves. Every test that renders a component
already builds realistic fixture data and drives the component into a specific
state. This harness saves the resulting DOM, then renders it in Chromium with
the real `globals.css`. No separate mock layer, no fake data to maintain.

## One-time setup

Add a Vitest config that loads the snapshot hook **after** the normal setup file
(order matters — afterEach hooks run in reverse registration order):

`ui/vitest.snapshot.config.ts`

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts", "../tools/ui-snapshots/snapshot-setup.ts"],
    restoreMocks: true,
    clearMocks: true
  }
});
```

Add to `ui/package.json`:

```json
"snapshots": "vitest run --config vitest.snapshot.config.ts && node ../tools/ui-snapshots/wrap.mjs && node ../tools/ui-snapshots/run-capture.mjs"
```

Add `.ui-snapshots/` to `.gitignore`.

## Running it

```bash
cd ui

# 1. render every test's DOM to .ui-snapshots/html/
npx vitest run --config vitest.snapshot.config.ts

# 2. wrap them in documents that load globals.css
node ../tools/ui-snapshots/wrap.mjs

# 3. screenshot them
npx electron ../tools/ui-snapshots/capture.cjs
```

On a headless machine (CI, containers), Electron needs a virtual display and
`--no-sandbox` when running as root:

```bash
sudo apt-get install -y xvfb
Xvfb :99 -screen 0 1600x6000x24 &
DISPLAY=:99 npx electron --no-sandbox ../tools/ui-snapshots/capture.cjs
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
