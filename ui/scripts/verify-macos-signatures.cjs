/* global Buffer, process */
"use strict";
const fs = require("node:fs");
const { join, relative, sep } = require("node:path");
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
const appVerificationCategories = Object.freeze([
  "main-signature-failure",
  "main-identity-failure",
  "main-runtime-failure",
  "deep-signature-failure",
  "native-inventory-failure",
  "dugite-payload-missing",
  "native-signature-failure",
  "native-identity-failure",
  "native-runtime-failure",
  "native-kind-failure",
  ...["main", "native"].flatMap((component) =>
    ["missing", "malformed", "unexpected", "command"].map(
      (reason) => `${component}-entitlements-${reason}-failure`
    )
  ),
  "stapled-ticket-failure"
]);
const appVerificationFailures = new WeakMap();
const appVerificationCategory = (error) => appVerificationFailures.get(error);
const isAppVerificationDiagnostic = (value) =>
  appVerificationCategories.some(
    (category) => value === `stage=builder-app-verification; category=${category}`
  );
const appGate = (category, operation) => {
  if (!appVerificationCategories.includes(category))
    throw new Error("Invalid app verification gate.");
  try {
    return operation();
  } catch {
    // Only local provenance crosses the builder boundary, never the native error.
    const error = new Error("Application verification failed.");
    appVerificationFailures.set(error, category);
    throw error;
  }
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
const verifyRuntimeSignature = (
  file,
  environment,
  runtime = true,
  check = (_gate, operation) => operation(),
  requiresJit = () => true
) => {
  const expected = identity(environment);
  check("signature", () =>
    run("/usr/bin/codesign", [
      "--verify",
      "--strict",
      "-R",
      // Without '=', codesign treats this argument as a requirement FILE path.
      `=certificate leaf = H"${expected.fingerprint}"`,
      file
    ])
  );
  const details = check("identity", () => {
    const inspected = run("/usr/bin/codesign", ["--display", "--verbose=4", file]);
    if (
      !inspected.includes(`TeamIdentifier=${expected.team}\n`) ||
      !/Authority=Developer ID Application:/.test(inspected)
    ) {
      throw new Error("Developer ID team verification failed.");
    }
    return inspected;
  });
  if (runtime) {
    check("runtime", () => {
      if (!/flags=.*\bruntime\b/.test(details))
        throw new Error("Hardened runtime verification failed.");
    });
    verifyEntitlements(file, requiresJit(), check);
  }
};
// Apple's Hardened Runtime contract assigns entitlements to processes, not
// libraries/frameworks loaded into them. Classify actual Mach-O content, never
// infer a library from its filename. Unknown formats fail closed.
const nativeRequiresJit = (file, app) => {
  const format = run("/usr/bin/file", ["--brief", "--", file], {
    env: { ...process.env, LC_ALL: "C", LANG: "C" }
  });
  const descriptions = format
    .split("Mach-O ")
    .slice(1)
    .filter((description) => !description.startsWith("universal binary"));
  const kinds = descriptions.map(
    (description) =>
      /^(?:64-bit )?(executable|dynamically linked shared library|bundle) /.exec(description)?.[1]
  );
  if (kinds.length === 0 || kinds.some((kind) => !kind))
    throw new Error("Unrecognized native code kind.");
  if (!kinds.includes("executable")) return false;
  const location = relative(app, file).split(sep).join("/");
  // Git and Crashpad do not run V8. Other executables (including every Electron
  // helper and the main executable used for ELECTRON_RUN_AS_NODE) retain JIT.
  return !(
    location.startsWith("Contents/Resources/app.asar.unpacked/node_modules/dugite/git/") ||
    /^Contents\/Frameworks\/Electron Framework\.framework\/Versions\/[^/]+\/Helpers\/chrome_crashpad_handler$/.test(
      location
    )
  );
};
const verifyEntitlements = (file, required, check = (_gate, operation) => operation()) => {
  const execute = (command, args, options = {}) =>
    check("entitlements-command", () => {
      const result = spawnSync(command, args, {
        encoding: "utf8",
        shell: false,
        ...options
      });
      if (result.error || result.signal || result.status === null)
        throw new Error("Entitlement command failed.");
      return result;
    });
  // Request XML explicitly: recent codesign versions also support an abstract
  // display representation. Only stdout is entitlement data; stderr is private.
  const displayed = execute("/usr/bin/codesign", [
    "--display",
    "--entitlements",
    "-",
    "--xml",
    file
  ]);
  check("entitlements-command", () => {
    if (displayed.status !== 0) throw new Error("Entitlement command failed.");
  });
  const xml = displayed.stdout ?? "";
  if (xml.trim().length === 0) {
    check("entitlements-missing", () => {
      if (required) throw new Error("Missing required JIT entitlement.");
    });
  } else {
    const converted = execute("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", "-"], {
      input: xml
    });
    const entitlements = check("entitlements-malformed", () => {
      if (converted.status !== 0) throw new Error("Malformed entitlement data.");
      const value = JSON.parse(converted.stdout);
      if (value === null || typeof value !== "object" || Array.isArray(value))
        throw new Error("Malformed entitlement dictionary.");
      return value;
    });
    const keys = Object.keys(entitlements);
    check("entitlements-missing", () => {
      if (required && keys.length === 0) throw new Error("Missing required JIT entitlement.");
    });
    check("entitlements-unexpected", () => {
      if (
        keys.some((key) => key !== "com.apple.security.cs.allow-jit") ||
        (keys.length !== 0 && entitlements["com.apple.security.cs.allow-jit"] !== true)
      )
        throw new Error("Unexpected production signing entitlements.");
    });
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
  verifyRuntimeSignature(app, environment, true, (gate, operation) =>
    appGate(`main-${gate}-failure`, operation)
  );
  appGate("deep-signature-failure", () =>
    run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app])
  );
  const files = appGate("native-inventory-failure", () => nativeFiles(join(app, "Contents")));
  appGate("dugite-payload-missing", () => {
    if (!files.some((file) => file.includes("app.asar.unpacked") && file.includes("dugite"))) {
      throw new Error("Missing signed native Dugite payload.");
    }
  });
  for (const file of files)
    verifyRuntimeSignature(
      file,
      environment,
      true,
      (gate, operation) => appGate(`native-${gate}-failure`, operation),
      () => appGate("native-kind-failure", () => nativeRequiresJit(file, app))
    );
  appGate("stapled-ticket-failure", () => verifyStaple(app));
};
module.exports = {
  run,
  verifySignature,
  verifyDmgSignature,
  signatureCategory,
  appVerificationCategory,
  isAppVerificationDiagnostic,
  verifyStaple,
  verifyApp,
  nativeFiles,
  nativeRequiresJit,
  verifyEntitlements
};
