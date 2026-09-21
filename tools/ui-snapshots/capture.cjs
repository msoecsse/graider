/**
 * Renders the HTML snapshots produced by snapshot-setup.ts into PNGs, using the
 * Electron binary that is already a dev dependency of this project.
 *
 * Usage (see README.md):
 *   node tools/ui-snapshots/wrap.mjs
 *   electron tools/ui-snapshots/capture.cjs <file.html>
 *
 * One page per invocation keeps a single bad page from wedging the whole run.
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

const capture = async (file) => {
  const win = new BrowserWindow({
    width: WIDTH,
    height: 900,
    show: false,
    webPreferences: { backgroundThrottling: false }
  });

  await win.loadFile(path.join(PAGES_DIR, file));
  await new Promise((resolve) => setTimeout(resolve, 400));

  const height = await win.webContents.executeJavaScript(
    `Math.min(document.documentElement.scrollHeight, ${MAX_HEIGHT})`
  );
  win.setContentSize(WIDTH, Math.max(600, Math.ceil(height)));
  await new Promise((resolve) => setTimeout(resolve, 400));

  const image = await win.webContents.capturePage();
  const out = path.join(OUT_DIR, file.replace(/\.html$/, ".png"));
  fs.writeFileSync(out, image.toPNG());
  console.log(`captured ${out} (${WIDTH}x${Math.ceil(height)})`);

  win.destroy();
};

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const arg = process.argv[process.argv.length - 1];
  const files = arg.endsWith(".html")
    ? [arg]
    : fs
        .readdirSync(PAGES_DIR)
        .filter((f) => f.endsWith(".html"))
        .sort();

  for (const file of files) {
    try {
      await capture(file);
    } catch (error) {
      console.error(`FAILED ${file}: ${error.message}`);
    }
  }

  app.quit();
});
