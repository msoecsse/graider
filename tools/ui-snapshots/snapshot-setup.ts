/**
 * Snapshot capture hook.
 *
 * Loaded as an extra Vitest setup file (after the normal one) so that it can
 * grab `document.body.innerHTML` before Testing Library's `cleanup()` unmounts
 * the tree. Vitest runs afterEach hooks in reverse registration order, which is
 * why this file must come LAST in `setupFiles`.
 *
 * Every test that renders something meaningful leaves an HTML file in
 * `.ui-snapshots/html/`. Those are real component output with the test's own
 * fixture data, so no separate mock layer is needed.
 */
import { afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = process.env.UI_SNAPSHOT_DIR ?? ".ui-snapshots/html";
const MIN_BYTES = 800;

fs.mkdirSync(OUT_DIR, { recursive: true });

afterEach((ctx) => {
  try {
    const html = document.body.innerHTML;
    if (html.length < MIN_BYTES) {
      return;
    }

    const task = (ctx as { task?: { name?: string; suite?: { name?: string } } }).task;
    const suite = task?.suite?.name ?? "";
    const name = task?.name ?? "unknown";
    const safe = `${suite}__${name}`.replace(/[^a-z0-9]+/gi, "_").slice(0, 110);

    fs.writeFileSync(path.join(OUT_DIR, `${safe}.html`), html);
  } catch {
    // Never let snapshot capture fail a test run.
  }
});
