"use strict";

const { spawnSync } = require("node:child_process");

const target = process.argv[2];
const targets = {
  mac: {
    platform: "darwin",
    architecture: "arm64",
    args: ["--mac", "dir", "--arm64", "--config.mac.identity=null"]
  },
  win: {
    platform: "win32",
    architecture: "x64",
    args: ["--win", "dir", "--x64", "--config.win.signExecutable=false"]
  }
};
const selected = targets[target];

if (selected === undefined) {
  throw new Error("Expected a packaged Git proof target of mac or win.");
}
if (process.platform !== selected.platform || process.arch !== selected.architecture) {
  throw new Error(
    `The ${target} packaged Git proof must be built on native ${selected.platform}/${selected.architecture}.`
  );
}

// An unsigned proof build must not inherit signing credentials from a developer or CI shell.
const environment = { ...process.env };
for (const name of ["CSC_LINK", "WIN_CSC_LINK", "CSC_KEY_PASSWORD", "WIN_CSC_KEY_PASSWORD"]) {
  delete environment[name];
}

const result = spawnSync(
  process.execPath,
  [
    require.resolve("electron-builder/cli.js"),
    ...selected.args,
    "--publish",
    "never",
    "--config",
    "electron-builder.config.cjs"
  ],
  { env: environment, stdio: "inherit" }
);

if (result.error != null) {
  throw result.error;
}
process.exit(result.status ?? 1);
