"use strict";

const { spawnSync } = require("node:child_process");

// `VAR=value command` is Bourne-shell syntax and fails on Windows, so the dev
// server URL is applied here instead of inside the npm script.
const DEV_SERVER_URL = "http://127.0.0.1:5173";

const environment = { ...process.env, VITE_DEV_SERVER_URL: DEV_SERVER_URL };

const result = spawnSync(require("electron"), ["."], { env: environment, stdio: "inherit" });

if (result.error != null) {
  throw result.error;
}
process.exit(result.status ?? 1);
