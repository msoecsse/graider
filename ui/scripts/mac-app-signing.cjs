"use strict";

// These are evidence categories, not diagnoses. Inspect only data properties;
// never stringify an external rejection or copy its fields into diagnostics.
const markers = Object.freeze([
  [
    "timestamp-service-failure",
    /timestamp service is not available|timestamp service (?:failed|refused)|timestamp authority|invalid timestamp|timestamp was expected but was not found|timestamp.*(?:unavailable|could not|cannot|failed|failure|timed out)/i
  ],
  ["identity-not-found", /no identity found/i],
  // Security uses this for missing items during native operations too. It does
  // not identify the missing item or contradict a successful identity query.
  [
    "keychain-item-not-found",
    /specified item could not be found in the keychain|errSecItemNotFound/i
  ],
  ["identity-ambiguous", /ambiguous \(matches|multiple identities/i],
  [
    "private-key-access-denied",
    /user interaction is not allowed|errSecInteractionNotAllowed|authorization (?:was )?denied|errSecAuthFailed|CSSMERR_CSP_(?:NO_USER_INTERACTION|OPERATION_AUTH_DENIED)|the user name or passphrase you entered is not correct/i
  ],
  [
    "private-key-unavailable",
    /no private key|private key is not available|CSSMERR_CSP_INVALID_KEY/i
  ],
  [
    "keychain-unavailable",
    /specified keychain could not be found|not a valid keychain|errSecNoSuchKeychain|errSecInvalidKeychain/i
  ],
  [
    "certificate-trust-failure",
    /CSSMERR_TP_(?:NOT_TRUSTED|CERT_EXPIRED|CERT_REVOKED|CERT_NOT_VALID_YET)|errSecCertificate(?:Expired|Revoked|NotValidYet)|unable to build chain to self-signed root|certificate.*(?:not trusted|has expired|revoked)/i
  ],
  [
    "entitlements-failure",
    /cannot read entitlement data|invalid entitlements|entitlements.*(?:not valid|invalid|malformed|failed to parse)|failed to parse.*entitlements/i
  ],
  [
    "signing-configuration-failure",
    /Path to application must be specified|Extension of application must be `\.app`|Additional binaries should be an Array|Type must be either|Platform must be|Path to provisioning profile should be a string/i
  ],
  [
    "signing-target-missing",
    /Application at path .* could not be found|no such file or directory/i
  ],
  [
    "signing-target-invalid",
    /(?:bundle|object file) format (?:unrecognized|is ambiguous)|code object is not signed at all|main executable failed strict validation|bundle format is ambiguous/i
  ],
  ["filesystem-permission-denied", /permission denied|operation not permitted|access denied/i],
  ["filesystem-read-only", /read-only file system/i],
  ["filesystem-no-space", /no space left on device|disk (?:is )?full/i],
  ["filesystem-io-failure", /input\/output error|I\/O error/i],
  [
    "resource-fork-or-finder-info",
    /resource fork, Finder information, or similar detritus not allowed/i
  ],
  [
    "native-security-internal-error",
    /errSecInternalComponent|internal error in Code Signing subsystem/i
  ]
]);
const categories = Object.freeze([
  ...markers.map(([category]) => category),
  "signing-command-start-or-io-failure",
  "signing-command-terminated",
  "signing-command-exit-failure",
  "signing-filesystem-failure",
  "unknown-signing-rejection"
]);
const classify = (error) => {
  try {
    const field = (name) => Object.getOwnPropertyDescriptor(error, name)?.value;
    const code = field("code");
    const syscall = field("syscall");
    if (field("signal") || field("killed") === true) return "signing-command-terminated";
    // execFile errors include stderr in message; osx-sign's wrapper rejects that
    // Error without attaching stdout/stderr. Do not inspect cmd, argv or stack.
    const message = field("message");
    const stderr = field("stderr");
    const nativeText = [message, stderr].filter((value) => typeof value === "string").join("\n");
    const marker = markers.find(([, pattern]) => pattern.test(nativeText));
    if (marker) return marker[0];
    if (
      [
        "ENOENT",
        "EACCES",
        "EIO",
        "ENOEXEC",
        "EMFILE",
        "ENFILE",
        "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
      ].includes(code)
    )
      return (typeof syscall === "string" && syscall.startsWith("spawn")) ||
        code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
        ? "signing-command-start-or-io-failure"
        : "signing-filesystem-failure";
    if (typeof code === "number" && Number.isInteger(code) && code !== 0)
      return "signing-command-exit-failure";
  } catch {
    // Includes primitives, hostile accessors/proxies and malformed rejections.
  }
  return "unknown-signing-rejection";
};
const isSigningDiagnostic = (value) =>
  categories.some((category) => value === `stage=builder-app-sign; category=${category}`);

module.exports = { classify, isSigningDiagnostic, categories };
