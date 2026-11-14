"use strict";

// Interpret only fixed native markers. Never return output, arguments, paths,
// identity details, or an external Error. An internal Security error is not
// evidence of a key ACL failure; preserve that uncertainty in its category.
const nativeErrors = [
  ["already-signed-dmg", /already signed/i],
  [
    "timestamp-service-failure",
    /timestamp service is not available|timestamp service (?:failed|refused)|timestamp authority|invalid timestamp|timestamp was expected but was not found|timestamp.*(?:unavailable|could not|cannot|failed|failure|timed out)/i
  ],
  [
    "identity-not-found",
    /no identity found|specified item could not be found in the keychain|errSecItemNotFound/i
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
    "invalid-or-unsupported-dmg",
    /(?:bundle|object file) format (?:unrecognized|is ambiguous)|invalid or unsupported format|invalid disk image|image not recognized|not a valid disk image|disk image.*(?:invalid|unsupported|corrupt)/i
  ],
  ["filesystem-permission-denied", /permission denied|operation not permitted|access denied/i],
  ["filesystem-read-only", /read-only file system/i],
  ["filesystem-not-found", /no such file or directory/i],
  ["filesystem-no-space", /no space left on device|disk (?:is )?full/i],
  ["filesystem-io-failure", /input\/output error|I\/O error/i],
  [
    "resource-fork-or-finder-info",
    /resource fork, Finder information, or similar detritus not allowed/i
  ],
  ["identifier-required", /identifier.*(?:not set|missing|required)|must specify.*identifier/i],
  [
    "native-security-internal-error",
    /errSecInternalComponent|internal error in Code Signing subsystem/i
  ]
];

const signingCategory = (result) => {
  if (result.error) return "command-start-or-io-failure";
  if (result.signal) return "command-terminated";
  if (result.status === 0) return undefined;
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  return (
    nativeErrors.find(([, marker]) => marker.test(stderr))?.[0] ||
    "unrecognized-native-signing-error"
  );
};

const signingArguments = (file, fingerprint, keychain) => [
  "--sign",
  fingerprint,
  "--keychain",
  keychain,
  "--timestamp",
  file
];

module.exports = { signingCategory, signingArguments };
