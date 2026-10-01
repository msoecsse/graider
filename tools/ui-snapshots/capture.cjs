/**
 * Renders the HTML snapshots produced by snapshot-setup.ts into PNGs, using the
 * Electron binary that is already a dev dependency of this project.
 *
 * Usage (see README.md):
 *   node tools/ui-snapshots/wrap.mjs
 *   electron tools/ui-snapshots/capture.cjs <file.html>
 *
 * Pass one HTML filename to capture only that page.
 */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.env.UI_SNAPSHOT_DIR ?? ".ui-snapshots";
const PAGES_DIR = path.join(ROOT, "pages");
const OUT_DIR = path.join(ROOT, "png");
const WIDTH = Number(process.env.UI_SNAPSHOT_WIDTH ?? 1440);
const MAX_HEIGHT = 6000;

app.commandLine.appendSwitch("disable-gpu");
app.disableHardwareAcceleration();
if (
  process.platform === "linux" &&
  typeof process.getuid === "function" &&
  process.getuid() === 0
) {
  app.commandLine.appendSwitch("no-sandbox");
}

const waitForLayout = async (win) => {
  await win.webContents.executeJavaScript(
    "(document.fonts?.ready ?? Promise.resolve()).then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))"
  );
};

const capture = async (win, file) => {
  await win.loadFile(path.join(PAGES_DIR, file));
  await waitForLayout(win);

  const height = await win.webContents.executeJavaScript(
    `Math.min(document.documentElement.scrollHeight, ${MAX_HEIGHT})`
  );
  win.setContentSize(WIDTH, Math.max(600, Math.ceil(height)));
  await waitForLayout(win);

  const image = await win.webContents.capturePage();
  const out = path.join(OUT_DIR, file.replace(/\.html$/, ".png"));
  fs.writeFileSync(out, image.toPNG());
  console.log(`captured ${out} (${WIDTH}x${Math.ceil(height)})`);
};

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    if (!fs.existsSync(PAGES_DIR)) {
      throw new Error(`UI snapshot pages are missing: ${PAGES_DIR}`);
    }

    const arg = process.argv[process.argv.length - 1];
    const files = arg.endsWith(".html")
      ? [arg]
      : fs
          .readdirSync(PAGES_DIR)
          .filter((f) => f.endsWith(".html"))
          .sort();

    if (files.length === 0) {
      throw new Error(`No UI snapshot pages were found in ${PAGES_DIR}`);
    }

    const win = new BrowserWindow({
      width: WIDTH,
      height: 900,
      show: false,
      webPreferences: { backgroundThrottling: false }
    });

    try {
      const failures = [];
      for (const file of files) {
        try {
          await capture(win, file);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${file}: ${message}`);
          console.error(`FAILED ${file}: ${message}`);
        }
      }

      if (failures.length > 0) {
        throw new Error(`UI snapshot capture failed for ${failures.length} page(s).`);
      }
    } finally {
      win.destroy();
    }
  } catch (error) {
    process.exitCode = 1;
    console.error(error instanceof Error ? error.message : String(error));
  } finally {
    app.quit();
  }
});
