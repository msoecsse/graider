"use strict";

const { spawnSync } = require("node:child_process");

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("The NSIS installer test must be built on native Windows x64.");
}

// This command creates unsigned test packages even on a configured signing host.
const environment = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" };
for (const name of ["CSC_LINK", "WIN_CSC_LINK", "CSC_KEY_PASSWORD", "WIN_CSC_KEY_PASSWORD"]) {
  delete environment[name];
}

const result = spawnSync(
  process.execPath,
  [
    require.resolve("electron-builder/cli.js"),
    "--win",
    "nsis",
    "--x64",
    "--publish",
    "never",
    "--config",
    "electron-builder.windows-installer-test.cjs"
  ],
  { env: environment, shell: false, stdio: "inherit" }
);

if (result.error != null) {
  throw result.error;
}
process.exit(result.status ?? 1);
