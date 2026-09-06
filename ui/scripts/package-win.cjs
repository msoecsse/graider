"use strict";

const { spawnSync } = require("node:child_process");

// An unsigned build must not inherit credentials from a developer or CI shell.
const environment = { ...process.env };
for (const name of ["CSC_LINK", "WIN_CSC_LINK", "CSC_KEY_PASSWORD", "WIN_CSC_KEY_PASSWORD"]) {
  delete environment[name];
}

const result = spawnSync(
  process.execPath,
  [
    require.resolve("electron-builder/cli.js"),
    "--win",
    "portable",
    "--x64",
    "--publish",
    "never",
    "--config",
    "electron-builder.config.cjs",
    "--config.win.signExecutable=false"
  ],
  { env: environment, stdio: "inherit" }
);

if (result.error != null) {
  throw result.error;
}
process.exit(result.status ?? 1);
