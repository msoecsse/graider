/* global __dirname, process */
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const asar = require("@electron/asar");

assert(process.platform === "darwin" && process.arch === "arm64", "Native macOS arm64 required.");
const ui = resolve(__dirname, "..");
const output = join(ui, "release/macos-archive-test");
const version = require(join(ui, "package.json")).version;
const stem = `Graider-${version}-mac-arm64-unsigned-test`;
const root = fs.realpathSync(
  fs.mkdtempSync(join(tmpdir(), "Graider mac archive test with spaces "))
);
const run = (executable, args, options = {}) => {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    ...options
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${executable} failed: ${result.stderr}`);
  return result.stdout;
};
const verifyApp = (app) => {
  const resources = join(app, "Contents/Resources");
  const archive = join(resources, "app.asar");
  const entries = asar.listPackage(archive);
  for (const file of ["/dist/index.html", "/dist-electron/main.js", "/dist-electron/preload.js"]) {
    assert(entries.includes(file), `Missing packaged ${file}`);
  }
  const metadata = JSON.parse(asar.extractFile(archive, "package.json").toString());
  assert.equal(metadata.version, version);
  const oauth = JSON.parse(
    asar.extractFile(archive, "dist-electron/github-oauth.release.json").toString()
  );
  assert.equal(oauth.clientSecret, "ci-only-nonfunctional-mac-archive-test");
  assert(!fs.existsSync(join(resources, "app-update.yml")), "Unexpected update feed.");
  const plist = run("/usr/bin/plutil", [
    "-convert",
    "json",
    "-o",
    "-",
    join(app, "Contents/Info.plist")
  ]);
  assert.equal(JSON.parse(plist).CFBundleIdentifier, "edu.graider.ui");
  assert.equal(JSON.parse(plist).CFBundleShortVersionString, version);
  const executable = join(app, "Contents/MacOS/Graider");
  assert.equal(run("/usr/bin/lipo", ["-archs", executable]).trim(), "arm64");
  // Electron's upstream ad-hoc signature is permitted; Developer ID signing is not.
  const signature = spawnSync("/usr/bin/codesign", ["-dv", "--verbose=4", app], {
    encoding: "utf8"
  });
  assert(!signature.error, "Cannot inspect app signature.");
  assert(
    !/Authority=|TeamIdentifier=(?!not set)/.test(signature.stderr),
    "Unexpected signing identity."
  );
  run(executable, [join(ui, "scripts/verify-packaged-dugite.cjs"), "--resources", resources], {
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      PATH: "",
      HOME: root,
      TMPDIR: root,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: join(root, "absent-gitconfig")
    },
    stdio: "inherit"
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
    const artifact = join(output, `${stem}.${extension}`);
    assert(fs.statSync(artifact).size > 0, "Empty archive.");
    const destination = join(root, extension);
    fs.mkdirSync(destination);
    if (extension === "zip") {
      run("/usr/bin/ditto", ["-x", "-k", artifact, destination]);
      verifyApp(join(destination, "Graider.app"));
    } else {
      const signature = spawnSync("/usr/bin/codesign", ["-dv", artifact], { encoding: "utf8" });
      assert.equal(signature.status, 1, "Test DMG must be unsigned.");
      assert.match(signature.stderr, /not signed at all/);
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
        // Copy off the read-only image: same layout as a drag-to-Applications install.
        const installed = join(root, "installed from dmg", "Graider.app");
        run("/usr/bin/ditto", [join(destination, "Graider.app"), installed]);
        verifyApp(installed);
      } finally {
        run("/usr/bin/hdiutil", ["detach", destination]);
      }
    }
    const checksum = createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
    process.stdout.write(`MAC_ARCHIVE_TEST_OK ${extension} ${checksum}\n`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
