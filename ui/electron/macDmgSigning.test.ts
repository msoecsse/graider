import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const nodeRequire = createRequire(path.resolve("package.json"));
const { signingCategory, signingArguments } = nodeRequire("./scripts/mac-dmg-signing.cjs");
const wrapper = nodeRequire("./scripts/package-mac-production.cjs");

describe("native DMG signing diagnosis", () => {
  it.each([
    ["already signed", "already-signed-dmg"],
    ["The timestamp service is not available.", "timestamp-service-failure"],
    ["A timestamp was expected but was not found.", "timestamp-service-failure"],
    ["no identity found", "identity-not-found"],
    ["The specified item could not be found in the keychain.", "identity-not-found"],
    ["ambiguous (matches multiple certificates)", "identity-ambiguous"],
    ["User interaction is not allowed.", "private-key-access-denied"],
    ["errSecAuthFailed", "private-key-access-denied"],
    ["no private key", "private-key-unavailable"],
    ["The specified keychain could not be found.", "keychain-unavailable"],
    ["CSSMERR_TP_CERT_EXPIRED", "certificate-trust-failure"],
    ["unable to build chain to self-signed root", "certificate-trust-failure"],
    ["bundle format unrecognized, invalid, or unsuitable", "invalid-or-unsupported-dmg"],
    ["image not recognized", "invalid-or-unsupported-dmg"],
    ["Permission denied", "filesystem-permission-denied"],
    ["Read-only file system", "filesystem-read-only"],
    ["No such file or directory", "filesystem-not-found"],
    ["No space left on device", "filesystem-no-space"],
    ["Input/output error", "filesystem-io-failure"],
    [
      "resource fork, Finder information, or similar detritus not allowed",
      "resource-fork-or-finder-info"
    ],
    ["identifier is not set", "identifier-required"],
    ["errSecInternalComponent", "native-security-internal-error"],
    ["unknown private native error", "unrecognized-native-signing-error"]
  ])("renders only a fixed category for %s", (marker, category) => {
    const secret = "private credential certificate path argv";
    const result = { status: 1, stderr: `${secret}: ${marker}\n${secret}`, stdout: secret };
    expect(signingCategory(result)).toBe(category);
    const module = { exports: {} as typeof wrapper };
    const spawn = vi.fn((_file: string, _args: string[], _options: unknown) => result);
    runInNewContext(fs.readFileSync("scripts/package-mac-production.cjs", "utf8"), {
      module,
      __dirname: path.resolve("scripts"),
      process,
      require: (name: string) =>
        name === "node:child_process"
          ? { spawnSync: spawn }
          : name.startsWith("./")
            ? nodeRequire(`./scripts/${name.slice(2)}`)
            : nodeRequire(name)
    });
    for (const stage of ["dmg-sign", "dmg-preflight-sign"]) {
      let diagnostic = "";
      try {
        module.exports.run("/usr/bin/codesign", [secret], { LANG: "other" }, stage);
      } catch (error) {
        diagnostic = module.exports.diagnostic(error);
      }
      expect(diagnostic).toBe(`stage=${stage}; category=${category}`);
      expect(diagnostic.includes(secret)).toBe(false);
    }
    expect(spawn.mock.calls[0][2]).toMatchObject({ env: { LC_ALL: "C", LANG: "C" }, shell: false });
  });

  it("does not infer a key ACL cause from a Security internal error or trust stdout", () => {
    expect(signingCategory({ status: 1, stderr: "errSecInternalComponent" })).toBe(
      "native-security-internal-error"
    );
    expect(signingCategory({ status: 1, stdout: "no identity found" })).toBe(
      "unrecognized-native-signing-error"
    );
    expect(signingCategory({ status: 0, stderr: "already signed" })).toBeUndefined();
    expect(
      signingCategory({ status: 1, error: new Error("private"), stderr: "already signed" })
    ).toBe("command-start-or-io-failure");
    expect(signingCategory({ status: null, signal: "SIGTERM", stderr: "already signed" })).toBe(
      "command-terminated"
    );
    expect(signingCategory({ status: 1, stderr: { message: "already signed" } })).toBe(
      "unrecognized-native-signing-error"
    );
  });

  // Only macOS supplies DiskImages and codesign. Deterministic cases above run
  // on every platform; this fixture never imports or queries real identities.
  it.runIf(process.platform === "darwin")(
    "signs native UDZO images and classifies actual failures",
    () => {
      const root = fs.mkdtempSync(path.join(tmpdir(), "graider-dmg-signing-"));
      const native = (file: string, args: string[]) =>
        spawnSync(file, args, {
          encoding: "utf8",
          shell: false,
          env: { PATH: "/usr/bin:/bin", LC_ALL: "C", LANG: "C" }
        });
      const success = (file: string, args: string[]) => {
        const result = native(file, args);
        expect(result.error === undefined && result.status === 0).toBe(true);
        return result;
      };
      try {
        fs.chmodSync(root, 0o700);
        const source = path.join(root, "source");
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, "fixture.txt"), "disposable fixture");
        const image = path.join(root, "unsigned.dmg");
        success("/usr/bin/hdiutil", [
          "create",
          "-quiet",
          "-format",
          "UDZO",
          "-srcfolder",
          source,
          image
        ]);
        expect(success("/usr/bin/hdiutil", ["imageinfo", "-format", image]).stdout.trim()).toBe(
          "UDZO"
        );
        for (const explicit of [false, true]) {
          const copy = path.join(root, explicit ? "explicit.dmg" : "implicit.dmg");
          fs.copyFileSync(image, copy);
          success("/usr/bin/codesign", [
            "--sign",
            "-",
            "--timestamp=none",
            ...(explicit ? ["-i", "edu.graider.ui.fixture.dmg"] : []),
            copy
          ]);
          success("/usr/bin/codesign", ["--verify", "--strict", copy]);
          const duplicate = native("/usr/bin/codesign", ["--sign", "-", copy]);
          expect(duplicate.status !== 0).toBe(true);
          expect(signingCategory(duplicate)).toBe("already-signed-dmg");
        }
        const invalid = path.join(root, "invalid.dmg");
        fs.writeFileSync(invalid, "invalid DMG fixture");
        const invalidFormat = native("/usr/bin/hdiutil", ["imageinfo", "-format", invalid]);
        expect(invalidFormat.status !== 0).toBe(true);
        expect(signingCategory(invalidFormat)).toBe("invalid-or-unsupported-dmg");
        const missing = native("/usr/bin/codesign", [
          "--sign",
          "-",
          path.join(root, "missing.dmg")
        ]);
        expect(signingCategory(missing)).toBe("filesystem-not-found");
        const identity = native("/usr/bin/codesign", [
          "--sign",
          "0".repeat(40),
          "--keychain",
          path.join(root, "absent.keychain-db"),
          "--timestamp",
          image
        ]);
        expect(identity.status !== 0).toBe(true);
        expect(["identity-not-found", "keychain-unavailable"]).toContain(signingCategory(identity));
        expect(signingArguments(image, "fixture-fingerprint", "fixture-keychain")).toEqual([
          "--sign",
          "fixture-fingerprint",
          "--keychain",
          "fixture-keychain",
          "--timestamp",
          image
        ]);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    60_000
  );
});
