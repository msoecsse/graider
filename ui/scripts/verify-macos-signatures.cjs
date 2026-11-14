/* global Buffer, process */
"use strict";
const fs = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { identity } = require("./macos-signing-config.cjs");

// Never include command arguments, subprocess output or raw errors in failures.
const run = (file, args, options = {}) => {
  const result = spawnSync(file, args, { encoding: "utf8", shell: false, ...options });
  if (result.error || result.status !== 0) throw new Error(`macOS verification failed: ${file}.`);
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
};
// Only locally created errors carry a safe category across the wrapper boundary.
const signatureFailures = new WeakMap();
const signatureCategory = (error) => signatureFailures.get(error);
const rejectSignature = (category) => {
  const error = new Error(`macOS signature verification failed: ${category}.`);
  signatureFailures.set(error, category);
  throw error;
};
const verifyDmgSignature = (file, environment) => {
  const expected = identity(environment);
  const execute = (args, category, inspect = false) => {
    const result = spawnSync("/usr/bin/codesign", args, {
      encoding: "utf8",
      shell: false,
      env: { ...process.env, LC_ALL: "C", LANG: "C" }
    });
    if (result.error) rejectSignature("command-start-or-io-failure");
    if (result.signal) rejectSignature("command-terminated");
    if (result.status !== 0) {
      // Interpret only Apple's fixed unsigned marker; never render native output.
      if (inspect && result.stderr?.includes("code object is not signed at all"))
        rejectSignature("unsigned-dmg");
      rejectSignature(category);
    }
  };
  execute(["--display", "--verbose=4", file], "signature-inspection-failure", true);
  execute(["--verify", "--strict", file], "invalid-signature");
  execute(
    ["--verify", "--strict", "-R", `=certificate leaf = H"${expected.fingerprint}"`, file],
    "certificate-requirement-mismatch"
  );
  // Disk images need not have a Mach-O CodeDirectory TeamIdentifier. Verify
  // the actual certificate chain, Developer ID extension and OU natively.
  execute(
    [
      "--verify",
      "--strict",
      "-R",
      `=anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "${expected.team}"`,
      file
    ],
    "developer-id-team-requirement-mismatch"
  );
};
const verifyRuntimeSignature = (file, environment, runtime = true) => {
  const expected = identity(environment);
  run("/usr/bin/codesign", [
    "--verify",
    "--strict",
    "-R",
    // Without '=', codesign treats this argument as a requirement FILE path.
    `=certificate leaf = H"${expected.fingerprint}"`,
    file
  ]);
  const details = run("/usr/bin/codesign", ["--display", "--verbose=4", file]);
  if (
    !details.includes(`TeamIdentifier=${expected.team}\n`) ||
    !/Authority=Developer ID Application:/.test(details) ||
    (runtime && !/flags=.*\bruntime\b/.test(details))
  ) {
    throw new Error("Developer ID team or hardened runtime verification failed.");
  }
  if (runtime) {
    const signedEntitlements = run("/usr/bin/codesign", [
      "--display",
      "--entitlements",
      ":-",
      file
    ]);
    const xml = signedEntitlements.match(/<\?xml[\s\S]*?<\/plist>/)?.[0];
    if (!xml) throw new Error("Missing hardened runtime entitlements.");
    const entitlements = JSON.parse(
      run("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", "-"], { input: xml })
    );
    if (
      entitlements["com.apple.security.cs.allow-jit"] !== true ||
      Object.keys(entitlements).length !== 1
    ) {
      throw new Error("Unexpected production signing entitlements.");
    }
  }
};
const verifySignature = (file, environment, runtime = false) => {
  if (runtime) verifyRuntimeSignature(file, environment);
  else verifyDmgSignature(file, environment);
};
const verifyStaple = (file) => run("/usr/bin/xcrun", ["stapler", "validate", file]);
// Inspect every real Mach-O, including extensionless Dugite executables and dylibs;
// --deep alone does not reliably cover native code in Resources/app.asar.unpacked.
const MACHO_HEADERS = new Set([
  "feedface",
  "cefaedfe",
  "feedfacf",
  "cffaedfe",
  "cafebabe",
  "bebafeca",
  "cafebabf",
  "bfbafeca"
]);
const MACHO_HEADER_BYTES = 4;
const nativeFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return nativeFiles(file);
    if (!entry.isFile()) return [];
    const header = Buffer.alloc(MACHO_HEADER_BYTES);
    const descriptor = fs.openSync(file, "r");
    try {
      fs.readSync(descriptor, header, 0, header.length, 0);
    } finally {
      fs.closeSync(descriptor);
    }
    return MACHO_HEADERS.has(header.toString("hex")) ? [file] : [];
  });
const verifyApp = (app, environment) => {
  verifySignature(app, environment, true);
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
  const files = nativeFiles(join(app, "Contents"));
  if (!files.some((file) => file.includes("app.asar.unpacked") && file.includes("dugite"))) {
    throw new Error("Missing signed native Dugite payload.");
  }
  for (const file of files) verifySignature(file, environment, true);
  verifyStaple(app);
};
module.exports = {
  run,
  verifySignature,
  verifyDmgSignature,
  signatureCategory,
  verifyStaple,
  verifyApp,
  nativeFiles
};
