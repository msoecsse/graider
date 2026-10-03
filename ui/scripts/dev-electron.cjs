/* global process */

"use strict";

const { spawnSync } = require("node:child_process");

// Set the dev server URL in Node so the script works under cmd.exe as well as POSIX shells.
const VITE_DEV_SERVER_URL = "http://127.0.0.1:5173";

const electronPath = require("electron");

const result = spawnSync(electronPath, ["."], {
  env: { ...process.env, VITE_DEV_SERVER_URL },
  stdio: "inherit"
});

if (result.error != null) {
  throw result.error;
}
process.exit(result.status ?? 1);
