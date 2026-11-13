/* global process, __dirname */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { run, verifyApp, verifySignature, verifyStaple } = require("./verify-macos-signatures.cjs");
const { identity } = require("./macos-signing-config.cjs");
const asar = require("@electron/asar");

assert(process.platform === "darwin" && process.arch === "arm64", "Native macOS arm64 required.");
identity(process.env);
const ui = resolve(__dirname, "..");
const output = join(ui, "release/macos-production");
const version = require(join(ui, "package.json")).version;
const root = fs.realpathSync(
  fs.mkdtempSync(join(tmpdir(), "Graider signed archives with spaces "))
);
const verifyInstalled = (app) => {
  verifyApp(app, process.env);
  const metadata = JSON.parse(
    run("/usr/bin/plutil", ["-convert", "json", "-o", "-", join(app, "Contents/Info.plist")])
  );
  assert.equal(metadata.CFBundleIdentifier, "edu.graider.ui");
  assert.equal(metadata.CFBundleShortVersionString, version);
  const resources = join(app, "Contents/Resources");
  const archive = join(resources, "app.asar");
  const entries = asar.listPackage(archive);
  for (const name of ["/dist/index.html", "/dist-electron/main.js", "/dist-electron/preload.js"]) {
    assert(entries.includes(name), "Required packaged resource missing.");
  }
  assert(!fs.existsSync(join(resources, "app-update.yml")), "Unexpected update feed.");
  const executable = join(app, "Contents/MacOS/Graider");
  assert.equal(run("/usr/bin/lipo", ["-archs", executable]).trim(), "arm64");
  run("/usr/bin/xattr", [
    "-w",
    "com.apple.quarantine",
    "0083;00000000;GraiderSigningVerification;",
    app
  ]);
  run("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", app]);
  run(executable, [join(ui, "scripts/verify-packaged-dugite.cjs"), "--resources", resources], {
    cwd: root,
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      PATH: "",
      HOME: root,
      TMPDIR: root,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: join(root, "absent-gitconfig")
    }
  });
};
try {
  assert(
    !fs
      .readdirSync(output)
      .some((name) => /\.(?:yml|yaml)$/.test(name) && !name.startsWith("builder-")),
    "Unexpected release metadata."
  );
  for (const extension of ["zip", "dmg"]) {
    const artifact = join(output, `Graider-${version}-mac-arm64-signed.${extension}`);
    assert(fs.statSync(artifact).size > 0, "Empty signed archive.");
    const destination = join(root, extension);
    fs.mkdirSync(destination);
    if (extension === "zip") {
      run("/usr/bin/ditto", ["-x", "-k", artifact, destination]);
      verifyInstalled(join(destination, "Graider.app"));
    } else {
      verifySignature(artifact, process.env);
      verifyStaple(artifact);
      run("/usr/sbin/spctl", [
        "--assess",
        "--type",
        "open",
        "--context",
        "context:primary-signature",
        "--verbose=4",
        artifact
      ]);
      run("/usr/bin/hdiutil", ["verify", artifact]);
      run("/usr/bin/hdiutil", [
        "attach",
        "-readonly",
        "-nobrowse",
        "-mountpoint",
        destination,
        artifact
      ]);
      try {
        const installed = join(root, "installed from dmg", "Graider.app");
        run("/usr/bin/ditto", [join(destination, "Graider.app"), installed]);
        verifyInstalled(installed);
      } finally {
        run("/usr/bin/hdiutil", ["detach", destination]);
      }
    }
  }
  process.stdout.write(
    "Signed archive automated checks passed. Downloaded Finder launch acceptance remains required.\n"
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
