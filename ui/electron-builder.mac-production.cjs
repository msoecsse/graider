/* global process */
"use strict";
const base = require("./electron-builder.config.cjs");
const { prepared } = require("./scripts/macos-signing-config.cjs");
const signing = prepared(process.env);

/** @type {import("electron-builder").Configuration} */
module.exports = {
  ...base,
  files: [...base.files],
  directories: { ...base.directories, output: "release/macos-production" },
  publish: null,
  forceCodeSigning: true,
  generateUpdatesFilesForAllChannels: false,
  mac: {
    ...base.mac,
    target: [
      { target: "dmg", arch: ["arm64"] },
      { target: "zip", arch: ["arm64"] }
    ],
    artifactName: "Graider-${version}-mac-${arch}-signed.${ext}",
    identity: signing.fingerprint,
    type: "distribution",
    hardenedRuntime: true,
    strictVerify: true,
    preAutoEntitlements: false,
    entitlements: "build/entitlements.mac-production.plist",
    entitlementsInherit: "build/entitlements.mac-production.plist",
    notarize: true
  },
  dmg: { ...base.dmg, sign: true, writeUpdateInfo: false },
  // Builder 26 may skip notarization without credentials. Independently require
  // valid signatures and the stapled ticket before either archive is created.
  afterSign: (context) => {
    const { join } = require("node:path");
    require("./scripts/verify-macos-signatures.cjs").verifyApp(
      join(context.appOutDir, "Graider.app"),
      process.env
    );
  }
};
