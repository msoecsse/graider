/* global process, __dirname */
"use strict";
const fs = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { randomBytes, createPrivateKey, createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { inputs } = require("./macos-signing-config.cjs");
const signatures = require("./verify-macos-signatures.cjs");

const MAX_COMMAND_OUTPUT = 64 * 1024 * 1024;
const KEYCHAIN_PASSWORD_BYTES = 32;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const run = (file, args, environment) => {
  const result = spawnSync(file, args, {
    env: environment,
    encoding: "utf8",
    shell: false,
    maxBuffer: MAX_COMMAND_OUTPUT
  });
  // Errors from security, builder and notarytool can contain secrets or argv.
  if (result.error || result.status !== 0)
    throw new Error(`macOS signing command failed: ${file}.`);
  return result.stdout;
};
const notarize = (artifact, environment, command = run) => {
  const output = command(
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
    environment
  );
  let accepted = false;
  try {
    accepted = JSON.parse(output).status === "Accepted";
  } catch {
    /* Fail closed. */
  }
  if (!accepted) throw new Error("DMG notarization was not Accepted.");
  command("/usr/bin/xcrun", ["stapler", "staple", artifact], environment);
  command("/usr/bin/xcrun", ["stapler", "validate", artifact], environment);
};
const sign = (environment = process.env, command = run, verify = signatures) => {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("Production signing requires native macOS arm64.");
  }
  const configuration = inputs(environment);
  try {
    const key = createPrivateKey(configuration.apiKey);
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
      throw new Error("Invalid key type.");
    }
  } catch {
    throw new Error("GRAIDER_APPLE_API_KEY_P8_BASE64 must encode a P-256 private key PEM.");
  }

  const ui = resolve(__dirname, "..");
  const root = fs.mkdtempSync(join(environment.RUNNER_TEMP || tmpdir(), "graider-signing-"));
  fs.chmodSync(root, PRIVATE_DIRECTORY_MODE);
  const keychain = join(root, "signing.keychain-db");
  const certificate = join(root, "certificate.p12");
  const apiKey = join(root, "AuthKey.p8");
  const password = randomBytes(KEYCHAIN_PASSWORD_BYTES).toString("base64");
  // Allow only host tooling settings; never inherit alternate signing, debugging,
  // publishing credentials or Node injection switches into packaging subprocesses.
  const child = Object.fromEntries(
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
  let keychainAttempted = false;
  try {
    fs.writeFileSync(certificate, configuration.certificate, { mode: PRIVATE_FILE_MODE });
    fs.writeFileSync(apiKey, configuration.apiKey, { mode: PRIVATE_FILE_MODE });
    keychainAttempted = true;
    command("/usr/bin/security", ["create-keychain", "-p", password, keychain], child);
    command("/usr/bin/security", ["set-keychain-settings", keychain], child);
    command("/usr/bin/security", ["unlock-keychain", "-p", password, keychain], child);
    command(
      "/usr/bin/security",
      [
        "import",
        certificate,
        "-k",
        keychain,
        "-P",
        configuration.password,
        "-T",
        "/usr/bin/codesign"
      ],
      child
    );
    command(
      "/usr/bin/security",
      [
        "set-key-partition-list",
        "-S",
        "apple-tool:,apple:,codesign:",
        "-s",
        "-k",
        password,
        keychain
      ],
      child
    );
    const identities = command(
      "/usr/bin/security",
      ["find-identity", "-v", "-p", "codesigning", keychain],
      child
    );
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
      throw new Error("Imported Developer ID does not match configured certificate and Team ID.");
    }
    command(
      process.execPath,
      [
        require.resolve("electron-builder/cli.js"),
        "--mac",
        "dmg",
        "zip",
        "--arm64",
        "--publish",
        "never",
        "--config",
        "electron-builder.mac-production.cjs"
      ],
      child
    );
    const output = join(ui, "release/macos-production");
    const version = require(join(ui, "package.json")).version;
    const dmg = join(output, `Graider-${version}-mac-arm64-signed.dmg`);
    verify.verifySignature(dmg, child);
    notarize(dmg, child, command);
    // Acceptance proof extracts BOTH archives and checks their contained apps.
    command(process.execPath, [join(__dirname, "verify-mac-production.cjs")], child);
    for (const extension of ["dmg", "zip"]) {
      const name = `Graider-${version}-mac-arm64-signed.${extension}`;
      const hash = createHash("sha256")
        .update(fs.readFileSync(join(output, name)))
        .digest("hex");
      fs.writeFileSync(join(output, `${name}.sha256`), `${hash}  ${name}\n`);
    }
  } finally {
    try {
      if (keychainAttempted) command("/usr/bin/security", ["delete-keychain", keychain], child);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(join(ui, "dist-electron/github-oauth.release.json"), { force: true });
    }
  }
};
module.exports = { sign, notarize };
if (require.main === module) {
  try {
    sign();
  } catch {
    process.stderr.write(
      "macOS production signing failed. Check protected configuration and signing/notarization status. No acceptance recorded.\n"
    );
    process.exitCode = 1;
  }
}
