/* global __dirname */
const base = require("./electron-builder.config.cjs");

/** @type {import("electron-builder").Configuration} */
module.exports = {
  ...base,
  files: [...base.files],
  directories: { ...base.directories, output: "release/macos-archive-test" },
  publish: null,
  forceCodeSigning: false,
  generateUpdatesFilesForAllChannels: false,
  mac: {
    ...base.mac,
    target: [
      { target: "dmg", arch: ["arm64"] },
      { target: "zip", arch: ["arm64"] }
    ],
    artifactName: "Graider-${version}-mac-${arch}-unsigned-test.${ext}",
    identity: null,
    notarize: false
  },
  dmg: { ...base.dmg, sign: false },
  // Fixed nonfunctional data; never consume the caller's OAuth credentials.
  beforePack: () => {
    require("node:fs").writeFileSync(
      require("node:path").join(__dirname, "dist-electron/github-oauth.release.json"),
      JSON.stringify({ clientSecret: "ci-only-nonfunctional-mac-archive-test" }),
      { mode: 0o600 }
    );
  }
};
