/* global process, __dirname */
"use strict";
const fs = require("node:fs");
const { join } = require("node:path");
const { run } = require("./verify-macos-signatures.cjs");
// Cancellation fallback on an ephemeral GitHub-hosted runner only. No secrets.
let failed = false;
for (const entry of fs.readdirSync(process.env.RUNNER_TEMP, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith("graider-signing-")) {
    const directory = join(process.env.RUNNER_TEMP, entry.name);
    try {
      const keychain = join(directory, "signing.keychain-db");
      if (fs.existsSync(keychain)) run("/usr/bin/security", ["delete-keychain", keychain]);
    } catch {
      failed = true;
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
}
fs.rmSync(join(__dirname, "../dist-electron/github-oauth.release.json"), { force: true });
if (failed) throw new Error("Temporary signing keychain cleanup failed.");
