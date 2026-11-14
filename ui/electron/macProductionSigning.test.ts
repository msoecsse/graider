import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

const nodeRequire = createRequire(path.resolve("package.json"));
const helpers = nodeRequire("./scripts/macos-signing-config.cjs");
const fingerprint = "A".repeat(40);
const team = "FAKETEAM01";
// Generated disposable test key; never loads owner/keychain credentials.
const privateKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({
  type: "pkcs8",
  format: "pem"
});
const environment: Record<string, string> = {
  GRAIDER_MAC_CERT_SHA1: fingerprint,
  GRAIDER_APPLE_TEAM_ID: team,
  GRAIDER_MAC_CERT_P12_BASE64: Buffer.from("fake-p12").toString("base64"),
  GRAIDER_MAC_CERT_PASSWORD: "fake-password",
  GRAIDER_APPLE_API_KEY_P8_BASE64: Buffer.from(privateKey).toString("base64"),
  GRAIDER_APPLE_API_KEY_ID: "FAKEKEY001",
  GRAIDER_APPLE_API_ISSUER: "00000000-0000-0000-0000-000000000000",
  GRAIDER_GITHUB_OAUTH_CLIENT_SECRET: "fake-oauth",
  RUNNER_TEMP: path.resolve("fake-runner-temp"),
  PATH: "host-tools",
  GH_TOKEN: "fake-publishing-token",
  APPLE_ID: "fake-alternate-account",
  CSC_LINK: "fake-alternate-certificate",
  NODE_OPTIONS: "fake-injection",
  DEBUG: "*"
};
const prepared = {
  ...environment,
  CSC_KEYCHAIN: "temporary-keychain",
  APPLE_API_KEY: "temporary-p8",
  APPLE_API_KEY_ID: environment.GRAIDER_APPLE_API_KEY_ID,
  APPLE_API_ISSUER: environment.GRAIDER_APPLE_API_ISSUER
};
const originalKeychains = [
  "/Users/Fake Owner/Library/Keychains/login.keychain-db",
  "/Library/Keychains/System.keychain",
  '/Users/Fake Owner/quoted " keychain\\literal.keychain-db'
];
// security wraps raw paths in quotes; it does not shell/JSON-escape their contents.
const searchListOutput = originalKeychains.map((file) => `    "${file}"\n`).join("");
const searchListArguments = ["list-keychains", "-d", "user", "-s"];
const builderScript = path.resolve("scripts/mac-production-builder.cjs");
const wrapperSource = fs.readFileSync("scripts/package-mac-production.cjs", "utf8");

function harness(platform = "darwin", arch = "arm64") {
  const nativeCommand = vi.fn(
    (
      _file: string,
      _args: string[],
      _options: unknown
    ): {
      status: number | null;
      stdout: string;
      stderr: string;
      error?: Error;
      signal?: string;
    } => ({ status: 0, stdout: "", stderr: "" })
  );
  const writes = vi.fn();
  const copies = vi.fn();
  const reports = vi.fn();
  const removes = vi.fn();
  const permissions = vi.fn();
  const reads = vi.fn(() => Buffer.from("fake-archive"));
  const lstat = vi.fn(() => ({ isFile: (): boolean => true, size: 1 }));
  const directories = vi.fn((prefix: string) => `${prefix}test`);
  const verify = { verifySignature: vi.fn() };
  const command = vi.fn((file: string, args: string[], _env: Record<string, string>): string => {
    if (args[0] === "list-keychains" && !args.includes("-s")) return searchListOutput;
    if (args[0] === "find-identity")
      return `1) ${fingerprint} "Developer ID Application: Fake Owner (${team})"\n`;
    if (args[0] === "notarytool") return JSON.stringify({ status: "Accepted" });
    if (args[0] === "imageinfo") return "UDZO\n";
    if (args[0] === "--display") return "Timestamp=fixture timestamp\n";
    return "";
  });
  const module = {
    exports: {} as {
      sign: (env: Record<string, string>, cmd: typeof command, verifier: typeof verify) => void;
      notarize: (file: string, env: Record<string, string>, cmd: typeof command) => void;
      diagnostic: (error: unknown) => string;
      run: typeof command;
    }
  };
  const loader = Object.assign(
    (name: string): unknown => {
      if (name === "node:fs")
        return {
          constants: fs.constants,
          copyFileSync: copies,
          mkdtempSync: directories,
          mkdirSync: vi.fn(),
          chmodSync: permissions,
          writeFileSync: writes,
          rmSync: removes,
          readFileSync: reads,
          lstatSync: lstat
        };
      if (name === "./macos-signing-config.cjs") return helpers;
      if (name === "node:child_process") return { spawnSync: nativeCommand };
      if (name === "./mac-dmg-signing.cjs") return nodeRequire("./scripts/mac-dmg-signing.cjs");
      if (name === "./mac-app-signing.cjs") return nodeRequire("./scripts/mac-app-signing.cjs");
      if (name === "./mac-production-builder.cjs")
        return nodeRequire("./scripts/mac-production-builder.cjs");
      if (name === "./verify-macos-signatures.cjs") return verify;
      return nodeRequire(
        name === "./mac-production-artifacts.cjs" ? "./scripts/mac-production-artifacts.cjs" : name
      );
    },
    { resolve: () => builderScript }
  );
  runInNewContext(wrapperSource, {
    require: loader,
    module,
    __dirname: path.resolve("scripts"),
    process: { platform, arch, execPath: "node", env: {}, stdout: { write: reports } }
  });
  return {
    ...module.exports,
    writes,
    copies,
    reports,
    removes,
    permissions,
    reads,
    directories,
    verify,
    command,
    nativeCommand,
    lstat
  };
}

describe("fail-closed macOS production signing", () => {
  it.each([searchListOutput, ""])(
    "registers the private keychain and restores the exact ordered list: %j",
    (output) => {
      const test = harness();
      const original = output ? originalKeychains : [];
      const successful = test.command.getMockImplementation()!;
      test.command.mockImplementation((file, args, env) =>
        args[0] === "list-keychains" && !args.includes("-s") ? output : successful(file, args, env)
      );
      test.sign(environment, test.command, test.verify);
      const calls = test.command.mock.calls;
      const search = calls.filter(([, args]) => args[0] === "list-keychains");
      const keychain = calls.find(([, args]) => args[0] === "create-keychain")![1].at(-1)!;
      expect(search.map(([file, args]) => [file, args])).toEqual([
        ["/usr/bin/security", ["list-keychains", "-d", "user"]],
        ["/usr/bin/security", [...searchListArguments, ...original, keychain]],
        ["/usr/bin/security", [...searchListArguments, ...original]]
      ]);
      const indexOf = (operation: string): number =>
        calls.findIndex(([, args]) => args[0] === operation);
      expect(calls.indexOf(search[0])).toBeLessThan(indexOf("create-keychain"));
      expect(indexOf("set-key-partition-list")).toBeLessThan(calls.indexOf(search[1]));
      expect(calls.indexOf(search[1])).toBeLessThan(indexOf("find-identity"));
      expect(indexOf("notarytool")).toBeLessThan(calls.indexOf(search[2]));
      expect(calls.indexOf(search[2])).toBeLessThan(indexOf("delete-keychain"));
      expect(test.command.mock.invocationCallOrder[indexOf("delete-keychain")]).toBeLessThan(
        test.removes.mock.invocationCallOrder[0]
      );
      expect(JSON.stringify([test.reports.mock.calls, test.writes.mock.calls])).not.toContain(
        originalKeychains[0]
      );
    }
  );

  it.each([
    "unquoted private output",
    '    "/private/valid.keychain-db"\nmalformed private output',
    '    "relative.keychain-db"\n',
    '    ""\n',
    '    "/private/null\0.keychain-db"\n'
  ])("rejects an unparseable search list before keychain creation: %j", (output) => {
    const test = harness();
    test.command.mockReturnValue(output);
    expect(() => test.sign(environment, test.command, test.verify)).toThrow(
      "Original failure: stage=keychain-search-list-parse; category=invalid-response."
    );
    expect(test.command.mock.calls.map(([, args]) => args)).toEqual([
      ["list-keychains", "-d", "user"]
    ]);
    expect(test.removes).toHaveBeenCalledTimes(2);
    expect(test.reports).not.toHaveBeenCalled();
  });

  it.each([
    ["query", "keychain-search-list-query"],
    ["create", "keychain-create"],
    ["register", "keychain-search-list-register"],
    ["import", "certificate-import"],
    ["preflight", "app-preflight-sign"],
    ["builder", "builder-sign-notarize-archive"]
  ])(
    "restores before deleting after %s failure, including partial mutation",
    (operation, stage) => {
      const test = harness();
      const successful = test.command.getMockImplementation()!;
      let current = [...originalKeychains];
      test.command.mockImplementation((file, args, env) => {
        const query = args[0] === "list-keychains" && !args.includes("-s");
        const register = args[0] === "list-keychains" && args.includes(env.CSC_KEYCHAIN);
        // Model creation/registration mutating state even when the command throws.
        if (args[0] === "create-keychain") current.push(args.at(-1)!);
        if (args[0] === "list-keychains" && args.includes("-s"))
          current = args.slice(searchListArguments.length);
        if (
          (operation === "query" && query) ||
          (operation === "create" && args[0] === "create-keychain") ||
          (operation === "register" && register) ||
          (operation === "import" && args[0] === "import") ||
          (operation === "preflight" && args[0] === "--sign") ||
          (operation === "builder" && args[0] === builderScript)
        )
          throw new Error(JSON.stringify({ file, args, env, output: searchListOutput }));
        return successful(file, args, env);
      });
      let message = "";
      try {
        test.sign(environment, test.command, test.verify);
      } catch (error) {
        message = test.diagnostic(error);
      }
      expect(message).toBe(
        `Original failure: stage=${stage}; category=${operation === "preflight" ? "signing-failure" : "command-failure"}.`
      );
      expect(current).toEqual(originalKeychains);
      const calls = test.command.mock.calls;
      if (operation === "query") expect(calls).toHaveLength(1);
      else {
        expect(calls.at(-2)?.[1]).toEqual([...searchListArguments, ...originalKeychains]);
        expect(calls.at(-1)?.[1][0]).toBe("delete-keychain");
        expect(test.command.mock.invocationCallOrder.at(-1)).toBeLessThan(
          test.removes.mock.invocationCallOrder[0]
        );
      }
      expect(test.removes).toHaveBeenCalledTimes(2);
      expect(test.writes.mock.calls.some(([file]) => file.endsWith(".sha256"))).toBe(false);
    }
  );

  it.each([
    [false, false],
    [true, false],
    [true, true]
  ])(
    "fails closed on restoration failure with signing failure=%s, deletion failure=%s",
    (failSigning, failDeletion) => {
      const test = harness();
      const successful = test.command.getMockImplementation()!;
      test.command.mockImplementation((file, args, env) => {
        if (
          (args[0] === "list-keychains" &&
            args.includes("-s") &&
            !args.includes(env.CSC_KEYCHAIN)) ||
          (failSigning && args[0] === "--sign") ||
          (failDeletion && args[0] === "delete-keychain")
        )
          throw new Error(JSON.stringify({ file, args, env, output: searchListOutput }));
        return successful(file, args, env);
      });
      let message = "";
      try {
        test.sign(environment, test.command, test.verify);
      } catch (error) {
        message = test.diagnostic(error);
      }
      expect(message).toBe(
        [
          failSigning
            ? "Original failure: stage=app-preflight-sign; category=signing-failure."
            : "Signing stages completed.",
          "Cleanup failure: stage=cleanup-keychain-search-list; category=command-failure.",
          ...(failDeletion
            ? ["Cleanup failure: stage=cleanup-keychain; category=command-failure."]
            : [])
        ].join("\n")
      );
      expect(test.command.mock.calls.at(-2)?.[1]).toEqual([
        ...searchListArguments,
        ...originalKeychains
      ]);
      expect(test.command.mock.calls.at(-1)?.[1][0]).toBe("delete-keychain");
      expect(test.removes).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    { status: 1, category: "command-exit-failure" },
    {
      status: null,
      error: new Error("private command argv"),
      category: "command-start-or-io-failure"
    },
    { status: null, signal: "SIGTERM", category: "command-terminated" }
  ])("suppresses native restoration output and paths: $category", (result) => {
    const test = harness();
    const secret = "private native output credential certificate";
    test.nativeCommand.mockImplementation((_file, args) => {
      if (args[0] === "list-keychains") {
        if (!args.includes("-s")) return { status: 0, stdout: searchListOutput, stderr: secret };
        if (args.at(-1) === originalKeychains.at(-1))
          return { ...result, stdout: searchListOutput, stderr: secret };
      }
      if (args[0] === "find-identity")
        return {
          status: 0,
          stdout: `${fingerprint} "Developer ID Application: Fake (${team})"`,
          stderr: secret
        };
      if (args[0] === "--sign")
        return { status: 1, stdout: secret, stderr: "errSecItemNotFound " + secret };
      return { status: 0, stdout: secret, stderr: secret };
    });
    let message = "";
    try {
      test.sign(environment, test.run, test.verify);
    } catch (error) {
      message = test.diagnostic(error);
    }
    expect(message).toBe(
      [
        "Original failure: stage=app-preflight-sign; category=keychain-item-not-found.",
        `Cleanup failure: stage=cleanup-keychain-search-list; category=${result.category}.`
      ].join("\n")
    );
    expect(test.reports).not.toHaveBeenCalled();
    expect(test.nativeCommand.mock.calls.at(-2)?.[1]).toEqual([
      ...searchListArguments,
      ...originalKeychains
    ]);
    expect(test.nativeCommand.mock.calls.at(-1)?.[1][0]).toBe("delete-keychain");
    expect(test.removes).toHaveBeenCalledTimes(2);
  });

  it("proves actual signing on a disposable executable before starting builder", () => {
    const test = harness();
    test.sign(environment, test.command, test.verify);
    const calls = test.command.mock.calls;
    const lookup = calls.findIndex(([, args]) => args[0] === "find-identity");
    const preflight = calls.findIndex(([, args]) => args.at(-1)?.endsWith("signing-preflight"));
    const builder = calls.findIndex(([, args]) => args[0] === builderScript);
    const [file, args, child] = calls[preflight];
    const executable = args.at(-1)!;
    expect(lookup).toBeLessThan(preflight);
    expect(preflight).toBeLessThan(builder);
    expect(file).toBe("/usr/bin/codesign");
    expect(args).toEqual([
      "--sign",
      fingerprint,
      "--force",
      "--keychain",
      child.CSC_KEYCHAIN,
      "--timestamp",
      "--options",
      "runtime",
      "--entitlements",
      path.resolve("build/entitlements.mac-production.plist"),
      executable
    ]);
    expect(child).toBe(calls[builder][2]);
    expect(path.dirname(executable)).toBe(path.dirname(child.CSC_KEYCHAIN));
    expect(test.copies).toHaveBeenCalledExactlyOnceWith(
      "node",
      executable,
      fs.constants.COPYFILE_EXCL
    );
    expect(test.permissions).toHaveBeenCalledWith(executable, 0o700);
    expect(test.verify.verifySignature).toHaveBeenNthCalledWith(1, executable, child, true);
    expect(test.reports).toHaveBeenCalledExactlyOnceWith(
      "stage=app-preflight-verification; category=passed\n"
    );
    expect(calls.some(([, args]) => args[0] === "default-keychain")).toBe(false);
  });

  it.each(["prepare", "sign", "verification", "timestamp", "timestamp-missing", "timestamp-none"])(
    "fails closed with private cleanup when app preflight fails at %s",
    (operation) => {
      const test = harness();
      const successful = test.command.getMockImplementation()!;
      const privateFailure = () => {
        throw new Error("private native output certificate credential /private/path");
      };
      if (operation === "prepare") test.copies.mockImplementation(privateFailure);
      if (operation === "verification")
        test.verify.verifySignature.mockImplementation(privateFailure);
      test.command.mockImplementation((file, args, env) => {
        if (args.at(-1)?.endsWith("signing-preflight")) {
          if (operation === "sign" && args[0] === "--sign") privateFailure();
          if (operation.startsWith("timestamp") && args[0] === "--display") {
            if (operation === "timestamp") privateFailure();
            return operation === "timestamp-none" ? "Timestamp=none\n" : "Signed Time=local time\n";
          }
        }
        return successful(file, args, env);
      });
      const stage = operation.startsWith("timestamp") ? "timestamp" : operation;
      const category =
        operation === "prepare"
          ? "filesystem-failure"
          : operation === "sign"
            ? "signing-failure"
            : "verification-failure";
      expect(() => test.sign(environment, test.command, test.verify)).toThrow(
        `Original failure: stage=app-preflight-${stage}; category=${category}.`
      );
      expect(test.reports).not.toHaveBeenCalled();
      expect(
        test.command.mock.calls.some(
          ([, args]) => args[0] === builderScript || args[0] === "notarytool"
        )
      ).toBe(false);
      expect(test.writes.mock.calls.some(([file]) => file.endsWith(".sha256"))).toBe(false);
      expect(test.command.mock.calls.at(-1)?.[1][0]).toBe("delete-keychain");
      expect(test.removes).toHaveBeenCalledTimes(2);
    }
  );

  it.each(Object.keys(environment).filter((name) => name.startsWith("GRAIDER_")))(
    "requires %s before commands or file writes",
    (name) => {
      const test = harness();
      for (const value of [undefined, "", "   "]) {
        expect(() =>
          test.sign(
            { ...environment, [name]: value } as Record<string, string>,
            test.command,
            test.verify
          )
        ).toThrow("stage=input-validation; category=invalid-configuration");
      }
      expect(test.command).not.toHaveBeenCalled();
      expect(test.writes).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["GRAIDER_MAC_CERT_SHA1", "-"],
    ["GRAIDER_MAC_CERT_SHA1", "Developer ID Application: Fake"],
    ["GRAIDER_APPLE_TEAM_ID", "msoecsse"],
    ["GRAIDER_MAC_CERT_P12_BASE64", "file:///certificate.p12"],
    ["GRAIDER_MAC_CERT_P12_BASE64", "Zm9v\n"],
    ["GRAIDER_APPLE_API_KEY_ID", "bad"],
    ["GRAIDER_APPLE_API_ISSUER", "bad"],
    ["GRAIDER_APPLE_API_KEY_P8_BASE64", Buffer.from("invalid private key").toString("base64")]
  ])("rejects malformed %s", (name, value) => {
    const test = harness();
    expect(() => test.sign({ ...environment, [name]: value }, test.command, test.verify)).toThrow();
    expect(test.command).not.toHaveBeenCalled();
    expect(test.writes).not.toHaveBeenCalled();
  });

  it.each([
    ["darwin", "x64"],
    ["win32", "x64"],
    ["linux", "arm64"]
  ])("rejects %s/%s before touching credentials", (platform, arch) => {
    const test = harness(platform, arch);
    expect(() => test.sign(environment, test.command, test.verify)).toThrow(
      "stage=host-validation; category=unsupported-host"
    );
    expect(test.writes).not.toHaveBeenCalled();
    expect(test.command).not.toHaveBeenCalled();
  });

  it("isolates credentials, signs before notarizing DMG, verifies both archives, and cleans up", () => {
    const test = harness();
    test.sign(environment, test.command, test.verify);
    const calls = test.command.mock.calls;
    const builder = calls.find((call) => call[1][0] === builderScript);
    expect(builder?.[1]).toEqual([builderScript]);
    const child = builder?.[2];
    expect(child).toMatchObject({
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
      GRAIDER_MAC_CERT_SHA1: fingerprint,
      GRAIDER_APPLE_TEAM_ID: team
    });
    for (const name of [
      "GH_TOKEN",
      "APPLE_ID",
      "CSC_LINK",
      "NODE_OPTIONS",
      "DEBUG",
      "GRAIDER_MAC_CERT_PASSWORD",
      "GRAIDER_MAC_CERT_P12_BASE64",
      "GRAIDER_APPLE_API_KEY_P8_BASE64"
    ])
      expect(child?.[name]).toBeUndefined();
    expect(test.permissions).toHaveBeenCalledWith(expect.any(String), 0o700);
    expect(test.writes.mock.calls.slice(0, 2).every((call) => call[2].mode === 0o600)).toBe(true);
    expect(test.verify.verifySignature).toHaveBeenCalledWith(
      expect.stringMatching(/-signed\.dmg$/),
      child
    );
    const dmgSignIndex = calls.findIndex(
      (call) => call[1].at(-1)?.endsWith("-signed.dmg") && call[1][0] === "--sign"
    );
    expect(calls[dmgSignIndex][1]).toEqual([
      "--sign",
      fingerprint,
      "--keychain",
      child?.CSC_KEYCHAIN,
      "--timestamp",
      expect.stringMatching(/-signed\.dmg$/)
    ]);
    expect(dmgSignIndex).toBeGreaterThan(calls.findIndex((call) => call[1][0] === builderScript));
    const notaryIndex = calls.findIndex((call) => call[1][0] === "notarytool");
    expect(notaryIndex).toBeGreaterThan(dmgSignIndex);
    expect(calls[notaryIndex + 1][1].slice(0, 2)).toEqual(["stapler", "staple"]);
    expect(calls[notaryIndex + 2][1].slice(0, 2)).toEqual(["stapler", "validate"]);
    expect(calls[notaryIndex + 3][1][0]).toMatch(/verify-mac-production\.cjs$/);
    expect(test.writes.mock.calls.filter((call) => call[0].endsWith(".sha256"))).toHaveLength(2);
    expect(calls.at(-1)?.[1][0]).toBe("delete-keychain");
    expect(test.removes).toHaveBeenCalledWith(expect.stringContaining("graider-signing-"), {
      recursive: true,
      force: true
    });
    expect(test.removes).toHaveBeenCalledWith(
      expect.stringMatching(/github-oauth\.release\.json$/),
      { force: true }
    );
    expect(environment.CSC_LINK).toBe("fake-alternate-certificate");
  });

  it.each(["passed", "source", "create", "sign", "verification"])(
    "retains the actual signing failure and private cleanup when preflight=%s",
    (outcome) => {
      const test = harness();
      const successful = test.command.getMockImplementation()!;
      test.command.mockImplementation((file, args, env) => {
        if (args[0] === "--sign" && args.at(-1)?.includes(path.join("release", "macos-production")))
          throw new Error("private original signing failure");
        if (
          (outcome === "create" && args[0] === "create") ||
          (outcome === "sign" &&
            args[0] === "--sign" &&
            !args.at(-1)?.endsWith("signing-preflight"))
        )
          throw new Error("private preflight failure");
        return successful(file, args, env);
      });
      if (outcome === "source")
        test.writes
          .mockImplementationOnce(() => {})
          .mockImplementationOnce(() => {})
          .mockImplementationOnce(() => {
            throw new Error("private path");
          });
      if (outcome === "verification")
        test.verify.verifySignature.mockImplementation((file: string) => {
          if (!file.endsWith("signing-preflight")) throw new Error("private certificate");
        });
      let message = "";
      try {
        test.sign(environment, test.command, test.verify);
      } catch (error) {
        message = test.diagnostic(error);
      }
      expect(
        message.startsWith(
          "Original failure: stage=dmg-sign; category=command-failure.\nDMG preflight: stage=dmg-preflight-"
        )
      ).toBe(true);
      expect(message.includes("private")).toBe(false);
      expect(
        message.endsWith(
          outcome === "passed"
            ? "category=passed."
            : outcome === "source"
              ? "category=filesystem-failure."
              : outcome === "verification"
                ? "category=verification-failure."
                : "category=command-failure."
        )
      ).toBe(true);
      const signatures = test.command.mock.calls.filter(
        (call) => call[1][0] === "--sign" && !call[1].at(-1)?.endsWith("signing-preflight")
      );
      if (["passed", "sign", "verification"].includes(outcome)) {
        expect(signatures).toHaveLength(2);
        expect(signatures[0][1].slice(0, -1)).toEqual(signatures[1][1].slice(0, -1));
        expect(signatures[0][2]).toEqual(signatures[1][2]);
      }
      expect(test.command.mock.calls.some((call) => call[1][0] === "notarytool")).toBe(false);
      expect(test.writes.mock.calls.some((call) => call[0].endsWith(".sha256"))).toBe(false);
      expect(test.command.mock.calls.at(-1)?.[1][0]).toBe("delete-keychain");
      expect(test.removes).toHaveBeenCalledTimes(2);
    }
  );

  it.each(["dmg", "zip"])(
    "rejects missing %s before inspecting or signing either archive",
    (extension) => {
      const test = harness();
      test.lstat.mockImplementation(() => {
        throw Object.assign(new Error("private path"), { code: "ENOENT" });
      });
      if (extension === "zip")
        test.lstat.mockImplementationOnce(() => ({ isFile: () => true, size: 1 }));
      expect(() => test.sign(environment, test.command, test.verify)).toThrow(
        `stage=artifact-validation-${extension}; category=missing-artifact`
      );
      expect(
        test.command.mock.calls.some(
          (call) =>
            ["imageinfo", "--sign", "notarytool"].includes(call[1][0]) &&
            !call[1].at(-1)?.endsWith("signing-preflight")
        )
      ).toBe(false);
      expect(test.verify.verifySignature).toHaveBeenCalledTimes(1);
      expect(test.writes.mock.calls.some((call) => call[0].endsWith(".sha256"))).toBe(false);
      expect(test.removes).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    [false, 1, "artifact-not-regular-file"],
    [true, 0, "empty-artifact"]
  ] as const)(
    "rejects unusable archives before native inspection: %s/%s",
    (isFile, size, category) => {
      const test = harness();
      test.lstat.mockReturnValue({ isFile: () => isFile, size });
      expect(() => test.sign(environment, test.command, test.verify)).toThrow(
        `stage=artifact-validation-dmg; category=${category}`
      );
      expect(test.command.mock.calls.some((call) => call[1][0] === "imageinfo")).toBe(false);
    }
  );

  it.each(["UDRW", "UDBZ", "", "UDZO\nprivate path"])(
    "rejects unexpected generated DMG format %s",
    (format) => {
      const test = harness();
      const successful = test.command.getMockImplementation()!;
      test.command.mockImplementation((file, args, env) =>
        args[0] === "imageinfo" ? format : successful(file, args, env)
      );
      expect(() => test.sign(environment, test.command, test.verify)).toThrow(
        "stage=dmg-format-inspection; category=unexpected-dmg-format"
      );
      expect(
        test.command.mock.calls.some(
          (call) => call[1][0] === "--sign" && !call[1].at(-1)?.endsWith("signing-preflight")
        )
      ).toBe(false);
      expect(test.removes).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    "create-keychain",
    "import",
    "set-key-partition-list",
    builderScript,
    "notarytool",
    "delete-keychain"
  ])("fails and cleans private files when %s fails", (stage) => {
    const test = harness();
    const successful = test.command.getMockImplementation()!;
    test.command.mockImplementation((file, args, env) => {
      if (args[0] === stage) throw new Error("fake-sensitive-output");
      return successful(file, args, env);
    });
    expect(() => test.sign(environment, test.command, test.verify)).toThrow();
    expect(test.removes).toHaveBeenCalledWith(expect.stringContaining("graider-signing-"), {
      recursive: true,
      force: true
    });
    expect(test.writes.mock.calls.some((call) => call[0].endsWith(".sha256"))).toBe(
      stage === "delete-keychain"
    );
  });

  it("rejects a wrong certificate/team before builder", () => {
    const test = harness();
    const successful = test.command.getMockImplementation()!;
    test.command.mockImplementation((file, args, env) =>
      args[0] === "find-identity" ? "Wrong identity" : successful(file, args, env)
    );
    expect(() => test.sign(environment, test.command, test.verify)).toThrow(
      "stage=identity-match; category=identity-mismatch"
    );
    expect(test.command.mock.calls.some((call) => call[1][0] === builderScript)).toBe(false);
    expect(test.removes).toHaveBeenCalled();
  });

  it.each(["{}", '{"status":"Invalid"}', '{"status":"In Progress"}', "malformed response"])(
    "rejects unaccepted notarization: %s",
    (response) => {
      const test = harness();
      test.command.mockReturnValue(response);
      expect(() => test.notarize("artifact.dmg", prepared, test.command)).toThrow(
        /category=(invalid-response|not-accepted)/
      );
      expect(test.command).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["staple", "validate", "verify-mac-production.cjs"])(
    "fails without checksums if %s fails",
    (stage) => {
      const test = harness();
      const successful = test.command.getMockImplementation()!;
      test.command.mockImplementation((file, args, env) => {
        if (args.includes(stage) || args.some((arg) => arg.endsWith(stage)))
          throw new Error("failed check");
        return successful(file, args, env);
      });
      expect(() => test.sign(environment, test.command, test.verify)).toThrow(
        "category=command-failure"
      );
      expect(test.removes).toHaveBeenCalled();
      expect(test.writes.mock.calls.some((call) => call[0].endsWith(".sha256"))).toBe(false);
    }
  );

  it.each<[string, string, Record<string, unknown>?]>([
    ["The specified item could not be found in the keychain.", "keychain-item-not-found"],
    ["errSecItemNotFound", "keychain-item-not-found"],
    ["No identity found for signing.", "identity-not-found"],
    ["User interaction is not allowed.", "private-key-access-denied"],
    ["errSecAuthFailed", "private-key-access-denied"],
    ["no private key", "private-key-unavailable"],
    ["The timestamp service is not available.", "timestamp-service-failure"],
    ["CSSMERR_TP_CERT_EXPIRED", "certificate-trust-failure"],
    ["unable to build chain to self-signed root", "certificate-trust-failure"],
    ["errSecInternalComponent", "native-security-internal-error"],
    ["unrecognized native failure", "signing-command-exit-failure"],
    ["missing exit status", "unknown-signing-rejection", { status: null }],
    [
      "errSecItemNotFound",
      "command-start-or-io-failure",
      { error: new Error("private native Error") }
    ],
    ["errSecItemNotFound", "command-terminated", { signal: "SIGTERM" }],
    ["unknown stderr", "signing-command-exit-failure", { stdout: "errSecItemNotFound" }],
    [
      "malformed stderr",
      "signing-command-exit-failure",
      { stderr: { message: "errSecItemNotFound" } }
    ]
  ])(
    "classifies preflight native stderr privately at the entry point: %s",
    (marker, category, overrides) => {
      const secret = "fake credential certificate /private/path command argv";
      const stderr = vi.fn();
      const stdout = vi.fn();
      const removes = vi.fn();
      const processMock = {
        platform: "darwin",
        arch: "arm64",
        execPath: secret,
        env: environment,
        stdout: { write: stdout },
        stderr: { write: stderr },
        exitCode: 0
      };
      const spawn = vi.fn((_file: string, args: string[]) => {
        if (args[0] === "find-identity")
          return { status: 0, stdout: `${fingerprint} "Developer ID Application: Fake (${team})"` };
        if (args[0] === "--sign")
          return {
            status: 1,
            stderr: `${secret}\n${marker}\n${secret}`,
            stdout: secret,
            ...overrides
          };
        return { status: 0, stdout: "" };
      });
      const module = { exports: {} };
      const loader = Object.assign(
        (name: string): unknown => {
          if (name === "node:child_process") return { spawnSync: spawn };
          if (name === "node:fs")
            return {
              constants: fs.constants,
              copyFileSync: vi.fn(),
              mkdtempSync: () => secret,
              chmodSync: vi.fn(),
              writeFileSync: vi.fn(),
              rmSync: removes
            };
          if (name === "./verify-macos-signatures.cjs") return { verifySignature: vi.fn() };
          return name.startsWith("./")
            ? nodeRequire(`./scripts/${name.slice(2)}`)
            : nodeRequire(name);
        },
        { main: module, resolve: () => builderScript }
      );
      runInNewContext(wrapperSource, {
        require: loader,
        module,
        process: processMock,
        __dirname: path.resolve("scripts")
      });
      expect(processMock.exitCode).toBe(1);
      expect(stderr).toHaveBeenCalledExactlyOnceWith(
        `macOS production signing failed. Original failure: stage=app-preflight-sign; category=${category}. No acceptance recorded.\n`
      );
      expect(stdout).not.toHaveBeenCalled();
      const output = JSON.stringify(stderr.mock.calls);
      for (const sensitive of [
        secret,
        marker,
        "private native Error",
        fingerprint,
        team,
        ...Object.values(environment)
      ]) {
        expect(output).not.toContain(sensitive);
      }
      expect(
        spawn.mock.calls.some(([, args]) => args[0] === builderScript || args[0] === "notarytool")
      ).toBe(false);
      expect(spawn.mock.calls.at(-1)?.[1][0]).toBe("delete-keychain");
      expect(removes).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    { status: 1, stderr: "fake-secret", stdout: "fake-secret", category: "command-exit-failure" },
    { status: null, error: new Error("fake-secret"), category: "command-start-or-io-failure" },
    { status: null, signal: "SIGTERM", stderr: "fake-secret", category: "command-terminated" }
  ])("redacts subprocess errors at the executable entry point", (result) => {
    const stderr = vi.fn();
    const processMock = {
      platform: "darwin",
      arch: "arm64",
      execPath: "node",
      env: environment,
      stdout: { write: vi.fn() },
      stderr: { write: stderr },
      exitCode: 0
    };
    const module = { exports: {} };
    const loader = Object.assign(
      (name: string): unknown => {
        if (name === "node:child_process") return { spawnSync: () => result };
        if (name === "./macos-signing-config.cjs") return helpers;
        if (name === "./mac-dmg-signing.cjs") return nodeRequire("./scripts/mac-dmg-signing.cjs");
        if (name === "./mac-app-signing.cjs") return nodeRequire("./scripts/mac-app-signing.cjs");
        if (name === "./mac-production-builder.cjs")
          return nodeRequire("./scripts/mac-production-builder.cjs");
        if (name === "./verify-macos-signatures.cjs") return {};
        if (name === "node:fs")
          return {
            constants: fs.constants,
            copyFileSync: vi.fn(),
            mkdtempSync: () => "fake-temp",
            chmodSync: vi.fn(),
            writeFileSync: vi.fn(),
            rmSync: vi.fn()
          };
        return nodeRequire(
          name === "./mac-production-artifacts.cjs"
            ? "./scripts/mac-production-artifacts.cjs"
            : name
        );
      },
      { main: module, resolve: () => builderScript }
    );
    runInNewContext(wrapperSource, {
      module,
      require: loader,
      process: processMock,
      __dirname: path.resolve("scripts")
    });
    expect(processMock.exitCode).toBe(1);
    expect(JSON.stringify(stderr.mock.calls)).not.toContain("fake-secret");
    expect(stderr).toHaveBeenCalledWith(
      `macOS production signing failed. Original failure: stage=keychain-search-list-query; category=${result.category}. No acceptance recorded.\n`
    );
  });

  it.each([
    ["create-keychain", "keychain-create"],
    ["set-keychain-settings", "keychain-settings"],
    ["unlock-keychain", "keychain-unlock"],
    ["import", "certificate-import"],
    ["set-key-partition-list", "keychain-partition-list"],
    ["find-identity", "identity-query"],
    [builderScript, "builder-sign-notarize-archive"],
    ["--sign", "dmg-sign"],
    ["notarytool", "dmg-notarization-submit"],
    ["staple", "dmg-stapler-staple"],
    ["validate", "dmg-stapler-validate"],
    ["verify-mac-production.cjs", "archive-installation-verification"],
    ["delete-keychain", "cleanup-keychain"]
  ])("reports only safe diagnostics for injected %s failure", (operation, stage) => {
    const test = harness();
    const successful = test.command.getMockImplementation()!;
    test.command.mockImplementation((file, args, env) => {
      if (
        args.some((arg) => arg === operation || path.basename(arg) === operation) &&
        !args.at(-1)?.endsWith("signing-preflight")
      ) {
        // Include every class of forbidden data, including a forged safe-looking error.
        const error = new Error(JSON.stringify({ file, args, env, privateKey }));
        Object.assign(error, { stage: "forged-stage", category: "forged-category" });
        throw error;
      }
      return successful(file, args, env);
    });
    let message = "";
    try {
      test.sign(environment, test.command, test.verify);
    } catch (error) {
      message = test.diagnostic(error);
    }
    expect(message).toBe(
      operation === "delete-keychain"
        ? "Signing stages completed.\nCleanup failure: stage=cleanup-keychain; category=command-failure."
        : `Original failure: stage=${stage}; category=command-failure.${operation === "--sign" ? "\nDMG preflight: stage=dmg-preflight-sign; category=command-failure." : ""}`
    );
    expect(test.removes).toHaveBeenCalledTimes(2);
    expect(test.writes.mock.calls.some((call) => call[0].endsWith(".sha256"))).toBe(
      operation === "delete-keychain"
    );
  });

  it.each([
    "temporary-directory-create",
    "temporary-directory-permissions",
    "certificate-write",
    "api-key-write",
    "dmg-signature-verification",
    "checksum-dmg",
    "checksum-zip"
  ])("identifies injected %s failure and suppresses private errors", (stage) => {
    const test = harness();
    const fail = () => {
      throw new Error(`private path ${environment.RUNNER_TEMP} ${privateKey}`);
    };
    if (stage === "temporary-directory-create") test.directories.mockImplementation(fail);
    if (stage === "temporary-directory-permissions") test.permissions.mockImplementation(fail);
    if (stage === "certificate-write") test.writes.mockImplementationOnce(fail);
    if (stage === "api-key-write")
      test.writes.mockImplementationOnce(() => {}).mockImplementationOnce(fail);
    if (stage === "dmg-signature-verification")
      test.verify.verifySignature.mockImplementation((file: string) => {
        if (!file.endsWith("signing-preflight")) fail();
      });
    if (stage === "checksum-dmg") test.reads.mockImplementationOnce(fail);
    if (stage === "checksum-zip")
      test.reads.mockImplementationOnce(() => Buffer.from("archive")).mockImplementationOnce(fail);
    const category = stage.startsWith("checksum")
      ? "filesystem-or-hash-failure"
      : stage === "dmg-signature-verification"
        ? "verification-failure"
        : "filesystem-failure";
    expect(() => test.sign(environment, test.command, test.verify)).toThrow(
      `stage=${stage}; category=${category}`
    );
    expect(test.removes).toHaveBeenCalledTimes(stage === "temporary-directory-create" ? 0 : 2);
  });

  it.each([false, true])(
    "preserves original failure with independent cleanup failures=%s",
    (failSigning) => {
      const test = harness();
      const successful = test.command.getMockImplementation()!;
      test.command.mockImplementation((file, args, env) => {
        if (args[0] === "delete-keychain" || (failSigning && args[0] === "import"))
          throw new Error("sensitive-command-error");
        return successful(file, args, env);
      });
      test.removes.mockImplementation(() => {
        throw new Error("sensitive-private-path");
      });
      let message = "";
      try {
        test.sign(environment, test.command, test.verify);
      } catch (error) {
        message = test.diagnostic(error);
      }
      expect(message).toBe(
        [
          failSigning
            ? "Original failure: stage=certificate-import; category=command-failure."
            : "Signing stages completed.",
          "Cleanup failure: stage=cleanup-keychain; category=command-failure.",
          "Cleanup failure: stage=cleanup-private-directory; category=cleanup-failure.",
          "Cleanup failure: stage=cleanup-oauth-file; category=cleanup-failure."
        ].join("\n")
      );
      expect(test.removes).toHaveBeenCalledTimes(2);
    }
  );

  it("uses a fixed fallback for untrusted errors and non-error throws", () => {
    const test = harness();
    for (const error of [
      new Error("private path"),
      "secret",
      null,
      { message: "secret", stage: "forged" }
    ])
      expect(test.diagnostic(error)).toBe("stage=unknown; category=unexpected-failure");
  });

  it.each([
    ...nodeRequire("./scripts/mac-app-signing.cjs").categories.map((category: string) => [
      "stage=builder-app-sign; category=" + category,
      "builder-app-sign; category=" + category
    ]),
    [
      "stage=builder-artifact-dmg; category=unexpected-output-directory",
      "builder-artifact-dmg; category=unexpected-output-directory"
    ],
    [
      "stage=builder-app-verification; category=verification-failure",
      "builder-app-verification; category=verification-failure"
    ],
    [
      "stage=builder-app-sign; category=signing-failure",
      "builder-app-sign; category=signing-failure"
    ],
    [
      "stage=builder-app-notarize-staple; category=notarization-failure",
      "builder-app-notarize-staple; category=notarization-failure"
    ],
    [
      "stage=builder-archive; category=archive-failure",
      "builder-archive; category=archive-failure"
    ],
    [
      "secret path argv certificate",
      "builder-sign-notarize-archive; category=command-exit-failure"
    ],
    [
      "stage=builder-app-sign; category=signing-failure\nsecret",
      "builder-sign-notarize-archive; category=command-exit-failure"
    ],
    [undefined, "builder-sign-notarize-archive; category=command-exit-failure"]
  ])("accepts only exact diagnostics from the builder pipe: %s", (detail, expected) => {
    const stderr = vi.fn();
    const processMock = {
      platform: "darwin",
      arch: "arm64",
      execPath: "node",
      env: environment,
      stdout: { write: vi.fn() },
      stderr: { write: stderr },
      exitCode: 0
    };
    const spawnSync = vi.fn((_file: string, args: string[]) => {
      if (args[0] === "find-identity")
        return { status: 0, stdout: `${fingerprint} "Developer ID Application: Fake (${team})"` };
      if (args[0] === "--display") return { status: 0, stderr: "Timestamp=fixture timestamp\n" };
      if (args[0] === builderScript)
        return {
          status: 1,
          stdout: "secret",
          stderr: "secret",
          output: [null, "secret", "secret", detail]
        };
      return { status: 0, stdout: "" };
    });
    const module = { exports: {} };
    const loader = Object.assign(
      (name: string): unknown => {
        if (name === "node:child_process") return { spawnSync };
        if (name === "node:fs")
          return {
            constants: fs.constants,
            copyFileSync: vi.fn(),
            mkdtempSync: () => "fake-temp",
            chmodSync: vi.fn(),
            writeFileSync: vi.fn(),
            rmSync: vi.fn()
          };
        if (name === "./verify-macos-signatures.cjs") return { verifySignature: vi.fn() };
        if (name.startsWith("./")) return nodeRequire(`./scripts/${name.slice(2)}`);
        return nodeRequire(
          name === "./mac-production-artifacts.cjs"
            ? "./scripts/mac-production-artifacts.cjs"
            : name
        );
      },
      { main: module }
    );
    runInNewContext(wrapperSource, {
      module,
      require: loader,
      process: processMock,
      __dirname: path.resolve("scripts")
    });
    expect(processMock.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(
      `macOS production signing failed. Original failure: stage=${expected}. No acceptance recorded.\n`
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "node",
      [builderScript],
      expect.objectContaining({ shell: false, stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"] })
    );
  });

  it("independently checks certificate hash, Developer ID, runtime, minimal entitlements and staple", () => {
    const load = (details: string, entitlements: Record<string, boolean>, failedStage?: string) => {
      const spawnSync = vi.fn((_file: string, args: string[]) => {
        if (args.includes(failedStage ?? "absent-stage"))
          return { status: 1, stderr: "fake-secret" };
        if (args.includes("--verbose=4")) return { status: 0, stderr: details };
        if (args.includes("--entitlements"))
          return { status: 0, stdout: '<?xml version="1.0"?><plist><dict/></plist>' };
        if (args.includes("-convert")) return { status: 0, stdout: JSON.stringify(entitlements) };
        return { status: 0, stdout: "" };
      });
      const module = {
        exports: {} as {
          verifySignature: (file: string, env: Record<string, string>, runtime: boolean) => void;
          verifyStaple: (file: string) => void;
        }
      };
      runInNewContext(fs.readFileSync("scripts/verify-macos-signatures.cjs", "utf8"), {
        module,
        Buffer,
        process,
        require: (name: string): unknown => {
          if (name === "node:child_process") return { spawnSync };
          if (name === "./macos-signing-config.cjs") return helpers;
          if (name === "./mac-dmg-signing.cjs") return nodeRequire("./scripts/mac-dmg-signing.cjs");
          if (name === "./mac-production-builder.cjs")
            return nodeRequire("./scripts/mac-production-builder.cjs");
          return nodeRequire(
            name === "./mac-production-artifacts.cjs"
              ? "./scripts/mac-production-artifacts.cjs"
              : name
          );
        }
      });
      return { ...module.exports, spawnSync };
    };
    const details = `Authority=Developer ID Application: Fake Owner (${team})\nTeamIdentifier=${team}\nCodeDirectory flags=0x10000(runtime)\n`;
    const entitlements = { "com.apple.security.cs.allow-jit": true };
    const valid = load(details, entitlements);
    valid.verifySignature("app", environment, true);
    valid.verifyStaple("app");
    const requirement = valid.spawnSync.mock.calls[0][1][3];
    expect(valid.spawnSync.mock.calls[0][1]).toEqual([
      "--verify",
      "--strict",
      "-R",
      `=certificate leaf = H"${fingerprint}"`,
      "app"
    ]);
    // Only macOS provides Apple's requirement compiler. All platforms assert
    // the exact argv above; native macOS CI also checks actual tool semantics.
    if (process.platform === "darwin") {
      const compiled = spawnSync("/usr/bin/csreq", ["-r", requirement, "-t"], {
        encoding: "utf8",
        shell: false
      });
      expect(compiled.error).toBeUndefined();
      expect(compiled.status).toBe(0);
      expect(compiled.stdout.trim()).toBe(`certificate leaf = H"${fingerprint.toLowerCase()}"`);
    }
    expect(valid.spawnSync.mock.calls.at(-1)?.[1]).toEqual(["stapler", "validate", "app"]);
    const diskImage = load(details, entitlements);
    diskImage.verifySignature("signed.dmg", environment, false);
    const dmgCalls = diskImage.spawnSync.mock.calls.map((call) => call[1]);
    expect(dmgCalls.slice(0, 3)).toEqual([
      ["--display", "--verbose=4", "signed.dmg"],
      ["--verify", "--strict", "signed.dmg"],
      ["--verify", "--strict", "-R", requirement, "signed.dmg"]
    ]);
    expect(dmgCalls[3][3]).toBe(
      `=anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "${team}"`
    );
    if (process.platform === "darwin")
      expect(spawnSync("/usr/bin/csreq", ["-r", dmgCalls[3][3], "-t"]).status).toBe(0);
    for (const invalid of [
      details
        .replace(team, "WRONGTEAM0")
        .replace(`TeamIdentifier=${team}`, "TeamIdentifier=WRONGTEAM0"),
      details.replace("Developer ID Application:", "Apple Development:"),
      details.replace("runtime", "adhoc")
    ]) {
      expect(() => load(invalid, entitlements).verifySignature("app", environment, true)).toThrow();
    }
    // Display text is not an identity gate for DMGs; native requirements are.
    load("TeamIdentifier=not set\n", entitlements).verifySignature(
      "signed.dmg",
      environment,
      false
    );
    expect(() =>
      load(details, entitlements, "--verify").verifySignature("signed.dmg", environment, false)
    ).toThrow("invalid-signature");
    expect(() =>
      load(details, {
        ...entitlements,
        "com.apple.security.cs.disable-library-validation": true
      }).verifySignature("app", environment, true)
    ).toThrow("Unexpected");
    expect(() => load(details, {}, "--verify").verifySignature("app", environment, true)).toThrow(
      "verification failed"
    );
    expect(() => load(details, entitlements, "validate").verifyStaple("app")).toThrow(
      "verification failed"
    );
  });

  it.each([
    [0, "unsigned-dmg"],
    [1, "invalid-signature"],
    [2, "certificate-requirement-mismatch"],
    [3, "developer-id-team-requirement-mismatch"]
  ])("distinguishes native DMG failure operation %s with safe diagnostics", (failed, category) => {
    let operation = 0;
    const module = { exports: {} as any };
    runInNewContext(fs.readFileSync("scripts/verify-macos-signatures.cjs", "utf8"), {
      module,
      Buffer,
      process,
      require: (name: string): unknown =>
        name === "node:child_process"
          ? {
              spawnSync: () => ({
                status: operation++ === failed ? 1 : 0,
                stderr:
                  failed === 0 ? "private-path: code object is not signed at all" : "fake-secret"
              })
            }
          : name === "./macos-signing-config.cjs"
            ? helpers
            : nodeRequire(name)
    });
    const verifier = module.exports;
    const test = harness();
    test.verify.verifySignature.mockImplementation((file: string) => {
      if (!file.endsWith("signing-preflight"))
        verifier.verifyDmgSignature("private-path", environment);
    });
    Object.assign(test.verify, { signatureCategory: verifier.signatureCategory });
    // The wrapper loads this exact verifier instance, whose WeakMap rejects forged errors.
    expect(() => test.sign(environment, test.command, test.verify)).toThrow(
      `stage=dmg-signature-verification; category=${category}`
    );
    expect(verifier.signatureCategory(new Error("unsigned-dmg"))).toBeUndefined();
    expect(test.command.mock.calls.some((call) => call[1][0] === "notarytool")).toBe(false);
    expect(test.removes).toHaveBeenCalled();
  });

  // hdiutil and codesign exist only on macOS; mocks above run on every CI host.
  it.runIf(process.platform === "darwin")(
    "checks unsigned, ad hoc and damaged DMGs with native tools",
    () => {
      const directory = fs.mkdtempSync(path.join(tmpdir(), "graider-native-dmg-"));
      const dmg = path.join(directory, "fixture.dmg");
      const native = (file: string, args: string[]) => {
        const result = spawnSync(file, args, { encoding: "utf8", shell: false });
        // Never put fixture output or paths in assertion messages.
        expect(result.error === undefined).toBe(true);
        expect(result.status === 0).toBe(true);
        return `${result.stdout}${result.stderr}`;
      };
      const verifier = nodeRequire("./scripts/verify-macos-signatures.cjs");
      try {
        native("/usr/bin/hdiutil", [
          "create",
          "-size",
          "1m",
          "-fs",
          "HFS+",
          "-volname",
          "Fixture",
          dmg
        ]);
        expect(() => verifier.verifyDmgSignature(dmg, environment)).toThrow("unsigned-dmg");
        native("/usr/bin/xattr", ["-c", dmg]);
        native("/usr/bin/codesign", ["--sign", "-", dmg]);
        native("/usr/bin/codesign", ["--verify", "--strict", dmg]);
        expect(
          native("/usr/bin/codesign", ["--display", "--verbose=4", dmg]).includes(
            "TeamIdentifier=not set"
          )
        ).toBe(true);
        expect(() => verifier.verifyDmgSignature(dmg, environment)).toThrow(
          "certificate-requirement-mismatch"
        );
        const bytes = fs.readFileSync(dmg);
        const firstByte = 0;
        bytes[firstByte] ^= 1;
        fs.writeFileSync(dmg, bytes);
        expect(() => verifier.verifyDmgSignature(dmg, environment)).toThrow("invalid-signature");
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
    30_000
  );

  it("discovers extensionless and nested native payloads without treating CLI JavaScript as signed code", () => {
    const directory = fs.mkdtempSync(path.join(tmpdir(), "graider-signature-fixture-"));
    try {
      const nested = path.join(directory, "app.asar.unpacked", "node_modules", "dugite", "git");
      fs.mkdirSync(nested, { recursive: true });
      const binary = path.join(nested, "git");
      const library = path.join(nested, "libgit.dylib");
      fs.writeFileSync(binary, Buffer.from("cffaedfe00000000", "hex"));
      fs.writeFileSync(library, Buffer.from("cafebabe00000000", "hex"));
      fs.writeFileSync(path.join(nested, "cli.js"), "#!/usr/bin/env node\n");
      const { nativeFiles } = nodeRequire("./scripts/verify-macos-signatures.cjs");
      expect(nativeFiles(directory).sort()).toEqual([binary, library].sort());
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([false, true])(
    "verifies installed copies with quarantine/isolated CLI and cleans mounts on failure=%s",
    (failInstalledDmg) => {
      const calls: { file: string; args: string[]; options?: { env?: Record<string, string> } }[] =
        [];
      const verifyApp = vi.fn((app: string) => {
        if (failInstalledDmg && app.includes("installed from dmg"))
          throw new Error("invalid installed app");
      });
      const removes = vi.fn();
      const loader = (name: string): unknown => {
        if (name === "node:fs")
          return {
            realpathSync: (file: string) => file,
            mkdtempSync: (prefix: string) => `${prefix}test`,
            readdirSync: () => [],
            existsSync: () => false,
            statSync: () => ({ size: 1 }),
            mkdirSync: vi.fn(),
            rmSync: removes
          };
        if (name === "./macos-signing-config.cjs") return helpers;
        if (name === "./mac-dmg-signing.cjs") return nodeRequire("./scripts/mac-dmg-signing.cjs");
        if (name === "./mac-production-builder.cjs")
          return nodeRequire("./scripts/mac-production-builder.cjs");
        if (name === "@electron/asar")
          return {
            listPackage: () => [
              "/dist/index.html",
              "/dist-electron/main.js",
              "/dist-electron/preload.js"
            ]
          };
        if (name === "./verify-macos-signatures.cjs")
          return {
            verifyApp,
            verifySignature: vi.fn(),
            verifyStaple: vi.fn(),
            run: (file: string, args: string[], options?: { env?: Record<string, string> }) => {
              calls.push({ file, args, options });
              if (file.endsWith("plutil"))
                return JSON.stringify({
                  CFBundleIdentifier: "edu.graider.ui",
                  CFBundleShortVersionString: "0.1.0"
                });
              if (file.endsWith("lipo")) return "arm64";
              return "";
            }
          };
        return nodeRequire(
          name === "./mac-production-artifacts.cjs"
            ? "./scripts/mac-production-artifacts.cjs"
            : name
        );
      };
      const execute = () =>
        runInNewContext(fs.readFileSync("scripts/verify-mac-production.cjs", "utf8"), {
          require: loader,
          __dirname: path.resolve("scripts"),
          process: {
            platform: "darwin",
            arch: "arm64",
            env: environment,
            stdout: { write: vi.fn() }
          }
        });
      if (failInstalledDmg) expect(execute).toThrow("invalid installed app");
      else execute();
      expect(verifyApp).toHaveBeenCalledTimes(2);
      expect(calls.some((call) => call.args[0] === "detach")).toBe(true);
      expect(calls.some((call) => call.args.includes("com.apple.quarantine"))).toBe(true);
      expect(
        calls.some((call) => call.args.includes("execute") && call.file.endsWith("spctl"))
      ).toBe(true);
      const proof = calls.find((call) =>
        call.args.some((arg) => arg.endsWith("verify-packaged-dugite.cjs"))
      );
      expect(proof?.options?.env?.PATH).toBe("");
      expect(proof?.options?.env?.ELECTRON_RUN_AS_NODE).toBe("1");
      expect(JSON.stringify(proof)).not.toContain("fake-oauth");
      expect(removes).toHaveBeenCalledWith(
        expect.stringContaining("Graider signed archives with spaces"),
        { recursive: true, force: true }
      );
    }
  );

  it("validates the locked builder schema, keeps existing defaults and enforces app checks before archives", async () => {
    const module = { exports: {} as Record<string, any> };
    const verifyApp = vi.fn();
    runInNewContext(fs.readFileSync("electron-builder.mac-production.cjs", "utf8"), {
      process: { env: prepared },
      module,
      require: (name: string): unknown => {
        if (name === "./scripts/verify-macos-signatures.cjs") return { verifyApp };
        return nodeRequire(
          name === "./mac-production-artifacts.cjs"
            ? "./scripts/mac-production-artifacts.cjs"
            : name
        );
      }
    });
    const config = module.exports;
    const { validateConfiguration } = nodeRequire("app-builder-lib/out/util/config/config");
    await validateConfiguration(config);
    expect(config).toMatchObject({
      publish: null,
      forceCodeSigning: true,
      directories: { output: "release/macos-production" },
      mac: {
        identity: fingerprint,
        hardenedRuntime: true,
        strictVerify: true,
        notarize: true,
        type: "distribution"
      },
      dmg: { sign: false, writeUpdateInfo: false }
    });
    expect(config.mac.target).toEqual([
      { target: "dmg", arch: ["arm64"] },
      { target: "zip", arch: ["arm64"] }
    ]);
    config.afterSign({ appOutDir: "signed-output" });
    expect(verifyApp).toHaveBeenCalledWith(path.join("signed-output", "Graider.app"), prepared);
    verifyApp.mockImplementation(() => {
      throw new Error("missing staple");
    });
    expect(() => config.afterSign({ appOutDir: "signed-output" })).toThrow("missing staple");
    const base = nodeRequire("./electron-builder.config.cjs");
    expect(base.dmg.sign).toBe(false);
    expect(base.mac.target).toEqual([{ target: "dir", arch: ["arm64"] }]);
    expect(config.asarUnpack).toEqual(base.asarUnpack);
    expect(fs.readFileSync(config.mac.entitlements, "utf8").match(/<key>(.*?)<\/key>/g)).toEqual([
      "<key>com.apple.security.cs.allow-jit</key>"
    ]);
  });

  it("uses manual upstream protected execution, exact SHA, step-only credentials and narrow uploads", () => {
    const workflow = parse(
      fs.readFileSync("../.github/workflows/macos-production-signing.yml", "utf8")
    );
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    const job = workflow.jobs.signing;
    expect(job.environment).toBe("macos-production-signing");
    expect(job.if).toBe(
      "github.repository == 'msoecsse/graider' && github.ref == 'refs/heads/remote-course-v2'"
    );
    expect(job["runs-on"]).toBe("macos-15");
    expect(job.env).toBeUndefined();
    expect(workflow.env).toBeUndefined();
    const checkout = job.steps.find((step: any) => step.uses === "actions/checkout@v4");
    expect(checkout.with).toEqual({ ref: "${{ github.sha }}", "persist-credentials": false });
    const credentialSteps = job.steps.filter((step: any) =>
      JSON.stringify(step).includes("secrets.")
    );
    expect(credentialSteps).toHaveLength(1);
    expect(credentialSteps[0].run).toBe("npm run package:mac:production");
    expect(job.steps.find((step: any) => step.if === "always()").run).toBe(
      "node ui/scripts/cleanup-mac-production.cjs"
    );
    const upload = job.steps.find((step: any) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(upload.with.path.trim().split("\n")).toEqual([
      "ui/release/macos-production/*-signed.dmg",
      "ui/release/macos-production/*-signed.zip",
      "ui/release/macos-production/*-signed.dmg.sha256",
      "ui/release/macos-production/*-signed.zip.sha256"
    ]);
    expect(JSON.stringify(workflow)).not.toMatch(/contents:write|gh release|pull_request_target/);
  });
});
