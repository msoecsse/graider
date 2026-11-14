/* global process */
"use strict";
const base = require("./electron-builder.config.cjs");
const { prepared } = require("./scripts/macos-signing-config.cjs");
const signing = prepared(process.env);
const { stage, artifactCompleted } = require("./scripts/mac-production-builder.cjs");

/** @type {import("electron-builder").Configuration} */
module.exports = {
  ...base,
  files: [...base.files],
  directories: { ...base.directories, output: "release/macos-production" },
  publish: null,
  forceCodeSigning: true,
  generateUpdatesFilesForAllChannels: false,
  artifactBuildCompleted: artifactCompleted,
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
    // Delegate to builder's installed signer, retaining its retry behavior and
    // options. Builder itself awaits notarization/stapling after this resolves.
    sign: async (options) => {
      stage("builder-app-sign");
      await require("app-builder-lib/out/codeSign/macCodeSign").sign(options);
      stage("builder-app-notarize-staple");
    },
    notarize: true
  },
  // The wrapper signs the completed DMG explicitly; builder may silently skip.
  dmg: { ...base.dmg, sign: false, writeUpdateInfo: false },
  beforePack: async (context) => {
    stage("builder-pack");
    await base.beforePack(context);
  },
  afterPack: () => stage("builder-app-sign"),
  // Builder 26 may skip notarization without credentials. Independently require
  // valid signatures and the stapled ticket before either archive is created.
  afterSign: (context) => {
    stage("builder-app-verification");
    const { join } = require("node:path");
    require("./scripts/verify-macos-signatures.cjs").verifyApp(
      join(context.appOutDir, "Graider.app"),
      process.env
    );
    stage("builder-archive");
  }
};
