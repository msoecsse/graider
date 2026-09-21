/**
 * Wraps the raw body-HTML snapshots from the test run into complete HTML
 * documents that load the real application stylesheet, so Chromium lays them
 * out exactly as the app would.
 *
 * Optionally filters to a named subset via PICKS below, so a PR can carry a
 * handful of relevant screens rather than 250 of them.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.UI_SNAPSHOT_DIR ?? ".ui-snapshots";
const HTML_DIR = path.join(ROOT, "html");
const PAGES_DIR = path.join(ROOT, "pages");
const CSS_SOURCE = "src/styles/globals.css";

/**
 * Map of output name -> snapshot filename. Leave empty to wrap everything.
 * Snapshot filenames are `<SuiteName>__<test name>.html` with non-alphanumerics
 * replaced by underscores; run the tests once and list the directory to see them.
 */
const PICKS = {};

fs.mkdirSync(PAGES_DIR, { recursive: true });
fs.copyFileSync(CSS_SOURCE, path.join(PAGES_DIR, "globals.css"));

const template = (body) =>
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <link rel="stylesheet" href="globals.css">
  </head>
  <body>${body}</body>
</html>
`;

const entries = Object.keys(PICKS).length
  ? Object.entries(PICKS)
  : fs
      .readdirSync(HTML_DIR)
      .filter((f) => f.endsWith(".html"))
      .map((f) => [f.replace(/\.html$/, ""), f]);

for (const [name, source] of entries) {
  const from = path.join(HTML_DIR, source);
  if (!fs.existsSync(from)) {
    console.error(`missing snapshot: ${source}`);
    continue;
  }
  fs.writeFileSync(path.join(PAGES_DIR, `${name}.html`), template(fs.readFileSync(from, "utf8")));
  console.log(`wrapped ${name}`);
}
