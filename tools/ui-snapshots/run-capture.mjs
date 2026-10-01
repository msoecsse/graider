import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ELECTRON_BIN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../ui/node_modules/.bin",
  process.platform === "win32" ? "electron.cmd" : "electron"
);
const ELECTRON_COMMAND = ELECTRON_BIN;
const ELECTRON_ARGS = ["../tools/ui-snapshots/capture.cjs"];

const hasDisplay = process.env.DISPLAY !== undefined && process.env.DISPLAY.length > 0;
const needsVirtualDisplay = process.platform === "linux" && !hasDisplay;
const command = needsVirtualDisplay ? "xvfb-run" : ELECTRON_COMMAND;
const args = needsVirtualDisplay
  ? ["--auto-servernum", ELECTRON_COMMAND, ...ELECTRON_ARGS]
  : ELECTRON_ARGS;
const snapshotDirectory = path.resolve(
  process.env.UI_SNAPSHOT_DIR ?? path.join(process.cwd(), ".ui-snapshots")
);

if (needsVirtualDisplay) {
  const probe = spawnSync("xvfb-run", ["--help"], { stdio: "ignore" });
  if (probe.error !== undefined) {
    throw new Error(
      "UI snapshot capture on Linux requires xvfb-run when DISPLAY is unset. Install Xvfb and rerun npm run snapshots."
    );
  }
}

const result = spawnSync(command, args, {
  env: { ...process.env, UI_SNAPSHOT_DIR: snapshotDirectory },
  stdio: "inherit"
});
if (result.error !== undefined) {
  throw result.error;
}

process.exit(result.status ?? 1);
