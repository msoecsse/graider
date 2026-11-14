/* global process, __dirname */
"use strict";
const fs = require("node:fs");
const { basename, join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { randomBytes, createPrivateKey, createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { inputs } = require("./macos-signing-config.cjs");
const signatures = require("./verify-macos-signatures.cjs");
const { isDiagnostic, completion } = require("./mac-production-builder.cjs");
const { signingCategory, signingArguments } = require("./mac-dmg-signing.cjs");
const { expectedArtifacts, fileCategory } = require("./mac-production-artifacts.cjs");

const MAX_COMMAND_OUTPUT = 64 * 1024 * 1024;
const KEYCHAIN_PASSWORD_BYTES = 32;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const BUILDER_DIAGNOSTIC_PIPE = 3;
// Only errors created here may reach diagnostics. Never serialize caught errors.
const safeFailures = new WeakSet();
const failure = (stage, category) => {
  const error = new Error(`stage=${stage}; category=${category}`);
  safeFailures.add(error);
  return error;
};
const step = (stage, category, operation) => {
  try {
    return operation();
  } catch (error) {
    if (safeFailures.has(error)) throw error;
    throw failure(stage, signatures.signatureCategory?.(error) || category);
  }
};
const diagnostic = (error) =>
  safeFailures.has(error) ? error.message : "stage=unknown; category=unexpected-failure";
const run = (file, args, environment, stage) => {
  const builder = stage === "builder-sign-notarize-archive";
  const dmgSigning = stage === "dmg-sign" || stage === "dmg-preflight-sign";
  const result = spawnSync(file, args, {
    env: { ...environment, LC_ALL: "C", LANG: "C" },
    encoding: "utf8",
    shell: false,
    maxBuffer: MAX_COMMAND_OUTPUT,
    ...(builder ? { stdio: ["ignore", "pipe", "pipe", "pipe"] } : {})
  });
  // Errors from security, builder and notarytool can contain secrets or argv.
  if (result.error) throw failure(stage, "command-start-or-io-failure");
  if (result.signal) throw failure(stage, "command-terminated");
  if (result.status !== 0) {
    if (dmgSigning) throw failure(stage, signingCategory(result));
    if (stage === "dmg-format-inspection") {
      // The artifact already passed filesystem validation. Native output alone
      // cannot establish that the image itself is missing.
      throw failure(stage, "image-inspection-failure");
    }
    const detail = builder ? result.output?.[BUILDER_DIAGNOSTIC_PIPE] : undefined;
    if (typeof detail === "string" && isDiagnostic(detail)) {
      const error = new Error(detail);
      safeFailures.add(error);
      throw error;
    }
    throw failure(stage, "command-exit-failure");
  }
  if (builder && result.output?.[BUILDER_DIAGNOSTIC_PIPE] !== completion) {
    throw failure(stage, "missing-completion-evidence");
  }
  return result.stdout;
};
const notarize = (artifact, environment, command = run) => {
  const output = step("dmg-notarization-submit", "command-failure", () =>
    command(
      "/usr/bin/xcrun",
      [
        "notarytool",
        "submit",
        artifact,
        "--key",
        environment.APPLE_API_KEY,
        "--key-id",
        environment.APPLE_API_KEY_ID,
        "--issuer",
        environment.APPLE_API_ISSUER,
        "--wait",
        "--timeout",
        "30m",
        "--output-format",
        "json"
      ],
      environment,
      "dmg-notarization-submit"
    )
  );
  const response = step("dmg-notarization-response", "invalid-response", () => JSON.parse(output));
  if (response?.status !== "Accepted") throw failure("dmg-notarization-response", "not-accepted");
  for (const action of ["staple", "validate"]) {
    const stage = `dmg-stapler-${action}`;
    step(stage, "command-failure", () =>
      command("/usr/bin/xcrun", ["stapler", action, artifact], environment, stage)
    );
  }
};
const sign = (environment = process.env, command = run, verify = signatures) => {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw failure("host-validation", "unsupported-host");
  }
  const configuration = step("input-validation", "invalid-configuration", () =>
    inputs(environment)
  );
  try {
    const key = createPrivateKey(configuration.apiKey);
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
      throw new Error("Invalid key type.");
    }
  } catch {
    throw failure("api-key-validation", "invalid-private-key");
  }

  const ui = resolve(__dirname, "..");
  const root = step("temporary-directory-create", "filesystem-failure", () =>
    fs.mkdtempSync(join(environment.RUNNER_TEMP || tmpdir(), "graider-signing-"))
  );
  const keychain = join(root, "signing.keychain-db");
  const certificate = join(root, "certificate.p12");
  const apiKey = join(root, "AuthKey.p8");
  // Allow only host tooling settings; never inherit alternate signing, debugging,
  // publishing credentials or Node injection switches into packaging subprocesses.
  let child;
  let keychainAttempted = false;
  let originalFailure;
  let preflightDiagnostic;
  const cleanupFailures = [];
  const execute = (stage, file, args) =>
    step(stage, "command-failure", () => command(file, args, child, stage));
  try {
    const password = step("keychain-password-generation", "random-generation-failure", () =>
      randomBytes(KEYCHAIN_PASSWORD_BYTES).toString("base64")
    );
    step("subprocess-environment", "configuration-failure", () => {
      child = Object.fromEntries(
        ["PATH", "HOME", "TMPDIR", "LANG"]
          .filter((name) => environment[name])
          .map((name) => [name, environment[name]])
      );
      Object.assign(child, {
        CSC_IDENTITY_AUTO_DISCOVERY: "false",
        CSC_KEYCHAIN: keychain,
        APPLE_API_KEY: apiKey,
        APPLE_API_KEY_ID: configuration.keyId,
        APPLE_API_ISSUER: configuration.issuer,
        GRAIDER_MAC_CERT_SHA1: configuration.fingerprint,
        GRAIDER_APPLE_TEAM_ID: configuration.team,
        GRAIDER_GITHUB_OAUTH_CLIENT_SECRET: configuration.oauth
      });
    });
    step("temporary-directory-permissions", "filesystem-failure", () =>
      fs.chmodSync(root, PRIVATE_DIRECTORY_MODE)
    );
    step("certificate-write", "filesystem-failure", () =>
      fs.writeFileSync(certificate, configuration.certificate, { mode: PRIVATE_FILE_MODE })
    );
    step("api-key-write", "filesystem-failure", () =>
      fs.writeFileSync(apiKey, configuration.apiKey, { mode: PRIVATE_FILE_MODE })
    );
    keychainAttempted = true;
    execute("keychain-create", "/usr/bin/security", ["create-keychain", "-p", password, keychain]);
    execute("keychain-settings", "/usr/bin/security", ["set-keychain-settings", keychain]);
    execute("keychain-unlock", "/usr/bin/security", ["unlock-keychain", "-p", password, keychain]);
    execute("certificate-import", "/usr/bin/security", [
      "import",
      certificate,
      "-k",
      keychain,
      "-P",
      configuration.password,
      "-T",
      "/usr/bin/codesign"
    ]);
    execute("keychain-partition-list", "/usr/bin/security", [
      "set-key-partition-list",
      "-S",
      "apple-tool:,apple:,codesign:",
      "-s",
      "-k",
      password,
      keychain
    ]);
    const identities = execute("identity-query", "/usr/bin/security", [
      "find-identity",
      "-v",
      "-p",
      "codesigning",
      keychain
    ]);
    if (
      !identities
        .split("\n")
        .some(
          (line) =>
            line.includes(configuration.fingerprint) &&
            line.includes('"Developer ID Application:') &&
            line.includes(`(${configuration.team})"`)
        )
    ) {
      throw failure("identity-match", "identity-mismatch");
    }
    execute("builder-sign-notarize-archive", process.execPath, [
      join(__dirname, "mac-production-builder.cjs")
    ]);
    const output = join(ui, "release/macos-production");
    const version = step(
      "artifact-metadata",
      "configuration-failure",
      () => require(join(ui, "package.json")).version
    );
    const artifacts = step("artifact-metadata", "configuration-failure", () =>
      expectedArtifacts(ui)
    );
    for (const { extension, file } of artifacts) {
      const category = fileCategory(file, fs);
      if (category) throw failure(`artifact-validation-${extension}`, category);
    }
    const dmg = artifacts.find(({ extension }) => extension === "dmg").file;
    const format = execute("dmg-format-inspection", "/usr/bin/hdiutil", [
      "imageinfo",
      "-format",
      dmg
    ]);
    if (format.trim() !== "UDZO") {
      throw failure("dmg-format-inspection", "unexpected-dmg-format");
    }
    // Builder's DMG signer can silently skip. Own this operation explicitly,
    // using only the identity already verified in our temporary keychain.
    try {
      execute(
        "dmg-sign",
        "/usr/bin/codesign",
        signingArguments(dmg, configuration.fingerprint, keychain)
      );
    } catch (error) {
      // Diagnose a failed operation without retrying or replacing its artifact.
      // Same identity/keychain/timestamp options, fresh private UDZO image.
      try {
        const source = join(root, "dmg-preflight-source");
        // Keep the basename too: codesign derives an implicit identifier from it.
        const image = join(root, basename(dmg));
        step("dmg-preflight-source", "filesystem-failure", () => {
          fs.mkdirSync(source, { mode: PRIVATE_DIRECTORY_MODE });
          fs.writeFileSync(join(source, "fixture.txt"), "Graider signing preflight\n", {
            mode: PRIVATE_FILE_MODE
          });
        });
        execute("dmg-preflight-create", "/usr/bin/hdiutil", [
          "create",
          "-quiet",
          "-format",
          "UDZO",
          "-srcfolder",
          source,
          image
        ]);
        step("dmg-preflight-permissions", "filesystem-failure", () =>
          fs.chmodSync(image, PRIVATE_FILE_MODE)
        );
        execute(
          "dmg-preflight-sign",
          "/usr/bin/codesign",
          signingArguments(image, configuration.fingerprint, keychain)
        );
        step("dmg-preflight-verification", "verification-failure", () =>
          verify.verifySignature(image, child)
        );
        preflightDiagnostic = "stage=dmg-preflight-verification; category=passed";
      } catch (preflightError) {
        preflightDiagnostic = diagnostic(preflightError);
      }
      throw error;
    }
    step("dmg-signature-verification", "verification-failure", () =>
      verify.verifySignature(dmg, child)
    );
    notarize(dmg, child, command);
    // Acceptance proof extracts BOTH archives and checks their contained apps.
    execute("archive-installation-verification", process.execPath, [
      join(__dirname, "verify-mac-production.cjs")
    ]);
    for (const extension of ["dmg", "zip"]) {
      const name = `Graider-${version}-mac-arm64-signed.${extension}`;
      step(`checksum-${extension}`, "filesystem-or-hash-failure", () => {
        const hash = createHash("sha256")
          .update(fs.readFileSync(join(output, name)))
          .digest("hex");
        fs.writeFileSync(join(output, `${name}.sha256`), `${hash}  ${name}\n`);
      });
    }
  } catch (error) {
    originalFailure = error;
  } finally {
    // Each cleanup runs even if another fails; none replaces the original failure.
    const clean = (stage, operation) => {
      try {
        step(stage, "cleanup-failure", operation);
      } catch (error) {
        cleanupFailures.push(diagnostic(error));
      }
    };
    if (keychainAttempted)
      clean("cleanup-keychain", () =>
        execute("cleanup-keychain", "/usr/bin/security", ["delete-keychain", keychain])
      );
    clean("cleanup-private-directory", () => fs.rmSync(root, { recursive: true, force: true }));
    clean("cleanup-oauth-file", () =>
      fs.rmSync(join(ui, "dist-electron/github-oauth.release.json"), { force: true })
    );
  }
  if (originalFailure || cleanupFailures.length > 0) {
    const error = new Error(
      [
        originalFailure
          ? `Original failure: ${diagnostic(originalFailure)}.`
          : "Signing stages completed.",
        ...(preflightDiagnostic ? [`DMG preflight: ${preflightDiagnostic}.`] : []),
        ...cleanupFailures.map((message) => `Cleanup failure: ${message}.`)
      ].join("\n")
    );
    safeFailures.add(error);
    throw error;
  }
};
module.exports = { sign, notarize, diagnostic, run };
if (require.main === module) {
  try {
    sign();
  } catch (error) {
    process.stderr.write(
      `macOS production signing failed. ${diagnostic(error)} No acceptance recorded.\n`
    );
    process.exitCode = 1;
  }
}
