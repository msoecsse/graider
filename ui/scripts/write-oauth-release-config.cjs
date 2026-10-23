/* global __dirname, process */
// Runs only at packaging time. Never print the secret or place it in Vite configuration.
const fs = require("node:fs");
const path = require("node:path");
const output = path.join(__dirname, "..", "dist-electron", "github-oauth.release.json");
exports.default = () => {
  const clientSecret = process.env.GRAIDER_GITHUB_OAUTH_CLIENT_SECRET?.trim();
  if (!clientSecret)
    throw new Error("Release packaging requires GRAIDER_GITHUB_OAUTH_CLIENT_SECRET.");
  fs.writeFileSync(output, JSON.stringify({ clientSecret }), { mode: 0o600 });
};
