/* global process */
"use strict";

const { spawnSync } = require("node:child_process");

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("The macOS archive test must be built on native macOS arm64.");
}

const environment = { ...process.env };
// Remove signing/notarization and publishing credentials, including inherited CI tokens.
for (const name of Object.keys(environment)) {
  if (/^(?:CSC_|WIN_CSC_|APPLE_|ASC_|GH_|GITHUB_|GRAIDER_GITHUB_)/i.test(name)) {
    delete environment[name];
  }
}
environment.CSC_IDENTITY_AUTO_DISCOVERY = "false";
const result = spawnSync(
  process.execPath,
  [
    require.resolve("electron-builder/cli.js"),
    "--mac",
    "dmg",
    "zip",
    "--arm64",
    "--publish",
    "never",
    "--config",
    "electron-builder.mac-archive-test.cjs"
  ],
  { env: environment, shell: false, stdio: "inherit" }
);
if (result.error != null) {
  throw result.error;
}
process.exit(result.status ?? 1);
