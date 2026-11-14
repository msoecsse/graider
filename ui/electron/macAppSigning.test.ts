// @vitest-environment node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const nodeRequire = createRequire(path.resolve("package.json"));
const { classify, categories, isSigningDiagnostic } = nodeRequire("./scripts/mac-app-signing.cjs");
const secret = "PRIVATE certificate /private/path credential argv";
const examples = [
  ["timestamp-service-failure", "The timestamp service is not available."],
  ["identity-not-found", "No identity found for signing."],
  ["keychain-item-not-found", "specified item could not be found in the keychain"],
  ["keychain-item-not-found", "errSecItemNotFound"],
  ["identity-ambiguous", "ambiguous (matches multiple identities)"],
  ["private-key-access-denied", "User interaction is not allowed."],
  ["private-key-unavailable", "CSSMERR_CSP_INVALID_KEY"],
  ["keychain-unavailable", "errSecNoSuchKeychain"],
  ["certificate-trust-failure", "unable to build chain to self-signed root"],
  ["entitlements-failure", "cannot read entitlement data"],
  ["signing-configuration-failure", "Path to application must be specified."],
  ["signing-target-missing", "no such file or directory"],
  ["signing-target-invalid", "bundle format unrecognized, invalid, or unsuitable"],
  ["filesystem-permission-denied", "Operation not permitted"],
  ["filesystem-read-only", "Read-only file system"],
  ["filesystem-no-space", "No space left on device"],
  ["filesystem-io-failure", "Input/output error"],
  [
    "resource-fork-or-finder-info",
    "resource fork, Finder information, or similar detritus not allowed"
  ],
  ["native-security-internal-error", "errSecInternalComponent"]
];
const structural: [unknown, string][] = [
  [{ code: "ENOENT", syscall: "spawn codesign" }, "signing-command-start-or-io-failure"],
  [{ code: "EACCES", syscall: "spawn codesign" }, "signing-command-start-or-io-failure"],
  [{ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }, "signing-command-start-or-io-failure"],
  [{ code: "EIO", syscall: "read" }, "signing-filesystem-failure"],
  [{ signal: "SIGTERM", message: "errSecInternalComponent" }, "signing-command-terminated"],
  [{ killed: true }, "signing-command-terminated"],
  [{ code: 1, message: secret }, "signing-command-exit-failure"],
  [{ code: 0 }, "unknown-signing-rejection"],
  [new Error(secret), "unknown-signing-rejection"],
  ["errSecInternalComponent", "unknown-signing-rejection"],
  [null, "unknown-signing-rejection"],
  [undefined, "unknown-signing-rejection"],
  [{ category: "private-key-access-denied", message: secret }, "unknown-signing-rejection"]
];

describe("fixed application signing rejection categories", () => {
  it.each(examples)("classifies %s without returning native text", (category, marker) => {
    // Installed osx-sign forwards execFile's Error; Node embeds native stderr
    // in its message, without separate stdout/stderr properties.
    const error = Object.assign(new Error(secret + "\n" + marker), { code: 1 });
    expect(classify(error)).toBe(category);
    expect(classify({ stderr: marker, code: 1 })).toBe(category);
    const record = "stage=builder-app-sign; category=" + classify(error);
    expect(isSigningDiagnostic(record)).toBe(true);
    expect(record).not.toContain(secret);
    expect(isSigningDiagnostic(record + "\n" + secret)).toBe(false);
  });

  it.each(structural)("uses structural evidence safely: %#", (error, category) => {
    expect(classify(error)).toBe(category);
  });

  it("does not invoke getters or stringify arbitrary errors", () => {
    const getter = vi.fn(() => {
      throw new Error(secret);
    });
    const rejection = Object.defineProperty({ toString: getter }, "message", { get: getter });
    expect(classify(rejection)).toBe("unknown-signing-rejection");
    expect(getter).not.toHaveBeenCalled();
    expect(classify(new Proxy({}, { getOwnPropertyDescriptor: getter }))).toBe(
      "unknown-signing-rejection"
    );
  });

  it("tests every allowlisted category and rejects invented records", () => {
    expect(
      [
        ...new Set([
          ...examples.map(([category]) => category),
          ...structural.map(([, category]) => category)
        ])
      ].sort()
    ).toEqual([...categories].sort());
    for (const category of categories) {
      expect(isSigningDiagnostic("stage=builder-app-sign; category=" + category)).toBe(true);
      expect(isSigningDiagnostic("stage=builder-archive; category=" + category)).toBe(false);
    }
    expect(isSigningDiagnostic("stage=builder-app-sign; category=" + secret)).toBe(false);
  });
});

function installedSigner(signAsync?: (options: unknown) => Promise<void>) {
  nodeRequire("electron-builder");
  const file = nodeRequire.resolve("app-builder-lib/out/codeSign/macCodeSign");
  const localRequire = createRequire(file);
  const exports = {} as any;
  // Native probes remove retry delays only; the contract test below asserts the
  // installed retry configuration. Production retains the unmodified helper.
  const retry = vi.fn(async (operation: () => Promise<void>, _options: unknown) => operation());
  runInNewContext(fs.readFileSync(file, "utf8"), {
    exports,
    process,
    require: (name: string) => {
      if (name === "builder-util") return { ...localRequire(name), retry };
      if (name === "../util/dynamicImport" && signAsync)
        return { dynamicImport: async () => ({ signAsync }) };
      return localRequire(name);
    }
  });
  return { sign: exports.sign, retry };
}

it("distinguishes installed identity selection rejection from a native signing item failure", async () => {
  const file = nodeRequire.resolve("@electron/osx-sign/dist/cjs/sign");
  const localRequire = createRequire(file);
  const exports = {} as any;
  const findIdentities = vi.fn(async () => []);
  const execute = vi.fn(async () => {
    throw Object.assign(new Error(secret + ": errSecItemNotFound"), { code: 1 });
  });
  runInNewContext(fs.readFileSync(file, "utf8"), {
    exports,
    __dirname: path.dirname(file),
    require: (name: string) => {
      if (name === "./util-identities") return { ...localRequire(name), findIdentities };
      if (name === "./util")
        return {
          ...localRequire(name),
          execFileAsync: execute,
          validateOptsApp: async () => {},
          walkAsync: async () => []
        };
      return localRequire(name);
    }
  });
  const options = {
    app: path.resolve("Fixture.app"),
    identity: "A".repeat(40),
    keychain: "fixture-keychain",
    platform: "darwin",
    type: "distribution",
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    optionsForFile: () => ({ hardenedRuntime: true, entitlements: "fixture.plist" })
  };
  await expect(exports.signApp(options).catch(classify)).resolves.toBe("identity-not-found");
  expect(findIdentities).toHaveBeenCalledExactlyOnceWith(options.keychain, options.identity);
  expect(execute).not.toHaveBeenCalled();
  findIdentities.mockClear();
  await expect(
    exports.signApp({ ...options, identityValidation: false }).catch(classify)
  ).resolves.toBe("keychain-item-not-found");
  expect(findIdentities).not.toHaveBeenCalled();
  expect(execute).toHaveBeenCalledExactlyOnceWith(
    "codesign",
    expect.arrayContaining([
      "--sign",
      options.identity,
      "--keychain",
      options.keychain,
      "--timestamp"
    ])
  );
});

it("installed osx-sign passes fingerprint, keychain, entitlements, runtime and secure timestamp to nested signing commands", async () => {
  const file = nodeRequire.resolve("@electron/osx-sign/dist/cjs/sign");
  const localRequire = createRequire(file);
  const exports = {} as any;
  const app = path.resolve("Fixture.app");
  const targets = [
    path.join(app, "Contents", "Resources", "git"),
    path.join(app, "Contents", "Resources", "libgit.dylib")
  ];
  const execute = vi.fn(async (_command: string, _args: string[]) => "");
  runInNewContext(fs.readFileSync(file, "utf8"), {
    exports,
    __dirname: path.dirname(file),
    require: (name: string) => {
      if (name === "os") return { ...localRequire(name), release: () => "24.0.0" };
      if (name === "./util")
        return {
          ...localRequire(name),
          execFileAsync: execute,
          validateOptsApp: async () => {},
          walkAsync: async () => [...targets]
        };
      return localRequire(name);
    }
  });
  const identity = "A".repeat(40);
  await exports.signApp({
    app,
    identity,
    identityValidation: false,
    keychain: "fixture-keychain",
    platform: "darwin",
    type: "distribution",
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    strictVerify: true,
    optionsForFile: () => ({ hardenedRuntime: true, entitlements: "fixture.plist" })
  });
  const signingCalls = execute.mock.calls.filter(([, args]) => args.includes("--sign"));
  expect(execute.mock.calls.some(([command]) => command === "security")).toBe(false);
  expect(signingCalls).toHaveLength(3);
  expect(signingCalls.map(([, args]) => args.at(-1))).toEqual([...targets, app]);
  for (const [command, args] of signingCalls) {
    expect(command).toBe("codesign");
    expect(args).toEqual(
      expect.arrayContaining([
        "--sign",
        identity,
        "--force",
        "--keychain",
        "fixture-keychain",
        "--timestamp",
        "--options",
        "runtime",
        "--entitlements",
        "fixture.plist"
      ])
    );
  }
  expect(execute.mock.calls.at(-2)?.[1]).toEqual([
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    app
  ]);
  expect(execute.mock.calls.at(-1)?.[1]).toEqual(["--display", "--entitlements", ":-", app]);
});

it("installed builder callback accepts the fingerprint and retains retry, keychain and per-file options", async () => {
  const signAsync = vi.fn(async (_options: unknown) => {});
  const signer = installedSigner(signAsync);
  const { MacTargetHelper } = nodeRequire("app-builder-lib/out/mac/MacTargetHelper");
  const fingerprint = "A".repeat(40);
  const config = {
    hardenedRuntime: true,
    strictVerify: true,
    preAutoEntitlements: false,
    entitlements: "build/entitlements.mac-production.plist",
    entitlementsInherit: "build/entitlements.mac-production.plist"
  };
  const options = await MacTargetHelper.prototype.buildSignOptions.call(
    {
      packager: { config: {}, resourceList: [], platformSpecificBuildOptions: {} },
      getOptionsForFile: MacTargetHelper.prototype.getOptionsForFile
    },
    "Fixture.app",
    { name: "Fake Developer ID", hash: fingerprint },
    "distribution",
    false,
    config,
    "fixture-keychain",
    1
  );
  expect(options).toMatchObject({
    identity: fingerprint,
    identityValidation: false,
    keychain: "fixture-keychain",
    strictVerify: true,
    preAutoEntitlements: false
  });
  await signer.sign(options);
  expect(signAsync).toHaveBeenCalledWith(options);
  expect(signer.retry.mock.calls[0]).toEqual([
    expect.any(Function),
    { retries: 3, interval: 5000, backoff: 5000 }
  ]);
  for (const file of [
    "Fixture.app",
    "Fixture.app/Contents/MacOS/Fixture",
    "Fixture.app/Contents/Resources/git",
    "Fixture.app/Contents/Resources/libgit.dylib"
  ]) {
    expect(options.optionsForFile(file)).toMatchObject({
      hardenedRuntime: true,
      entitlements: config.entitlements,
      timestamp: undefined
    });
  }
});

// Native codesign is available only on macOS. No real identity or private key;
// the installed helper and osx-sign execute real native signing on private copies.
it.runIf(process.platform === "darwin")(
  "the real preflight signs a private Mach-O copy and rejects an ad hoc identity",
  () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "graider executable preflight "));
    const executable = path.join(root, "preflight");
    const original = fs.readFileSync(process.execPath);
    const wrapper = nodeRequire("./scripts/package-mac-production.cjs");
    const environment = {
      GRAIDER_MAC_CERT_SHA1: "A".repeat(40),
      GRAIDER_APPLE_TEAM_ID: "FAKETEAM00",
      CSC_KEYCHAIN: "unused-fixture-keychain"
    };
    // Only the fixture command uses ad hoc/untimestamped signing. The production
    // verifier is unchanged and must reject it, even after strict integrity passes.
    const command = (file: string, args: string[], env: Record<string, string>, stage: string) => {
      const nativeArgs =
        stage === "app-preflight-sign"
          ? [
              "--sign",
              "-",
              "--force",
              "--timestamp=none",
              "--options",
              "runtime",
              "--entitlements",
              path.resolve("build/entitlements.mac-production.plist"),
              executable
            ]
          : args;
      return wrapper.run(file, nativeArgs, env, stage);
    };
    try {
      fs.chmodSync(root, 0o700);
      expect(() => wrapper.appPreflight(executable, environment, command)).toThrow(
        "stage=app-preflight-verification; category=verification-failure"
      );
      const verified = spawnSync("/usr/bin/codesign", ["--verify", "--strict", executable]);
      expect(verified.error === undefined && verified.status === 0).toBe(true);
      expect(fs.readFileSync(process.execPath).equals(original)).toBe(true);
      expect(fs.readFileSync(executable).equals(original)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
);

it.runIf(process.platform === "darwin")(
  "reproduces native installed-signer failures without credentials",
  async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "graider app signing "));
    try {
      const signer = installedSigner();
      const app = path.join(root, "Fixture.app");
      const contents = path.join(app, "Contents");
      fs.mkdirSync(path.join(contents, "MacOS"), { recursive: true });
      fs.copyFileSync(process.execPath, path.join(contents, "MacOS", "Fixture"));
      const resources = path.join(contents, "Resources");
      fs.mkdirSync(resources);
      fs.copyFileSync(path.resolve("node_modules/dugite/git/bin/git"), path.join(resources, "git"));
      fs.copyFileSync(
        path.resolve("node_modules/dugite/git/libexec/git-core/libSystem.Native.dylib"),
        path.join(resources, "libSystem.Native.dylib")
      );
      fs.writeFileSync(
        path.join(contents, "Info.plist"),
        '<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundleIdentifier</key><string>test.graider.fixture</string></dict></plist>'
      );
      const entitlements = path.resolve("build/entitlements.mac-production.plist");
      const base = {
        app,
        identity: "-",
        identityValidation: false,
        platform: "darwin",
        type: "distribution",
        preAutoEntitlements: false,
        strictVerify: true,
        optionsForFile: () => ({ hardenedRuntime: true, entitlements })
      };
      const results: string[] = [];
      for (const options of [
        base,
        { ...base, app: path.join(root, "Missing.app") },
        { ...base, binaries: [path.join(root, "missing-native")] },
        {
          ...base,
          optionsForFile: () => ({
            hardenedRuntime: true,
            entitlements: path.join(root, "missing.plist")
          })
        },
        { ...base, identity: "F".repeat(40), keychain: path.join(root, "missing.keychain-db") }
      ]) {
        try {
          await signer.sign(options);
          results.push("resolved");
        } catch (error) {
          results.push(classify(error));
        }
      }
      expect(results).toEqual([
        "resolved",
        "signing-target-missing",
        "signing-target-missing",
        "entitlements-failure",
        "identity-not-found"
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  90_000
);

it.runIf(process.platform === "darwin")(
  "delivers a real installed signing rejection after retries through the protected worker pipes",
  () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "graider signer rejection "));
    const TIMEOUT_MS = 60_000;
    try {
      const code = [
        "const builder = require('electron-builder');",
        "const worker = require('./scripts/mac-production-builder.cjs');",
        "require.cache[require.resolve('electron-builder')].exports = { ...builder, build: async () => {",
        "await worker.signApplication({ app: " +
          JSON.stringify(path.join(root, "Missing.app")) +
          ", identity: '-', identityValidation: false, platform: 'darwin' });",
        "throw new Error('unreachable'); }};",
        "void worker.build();"
      ].join("\n");
      const env = Object.fromEntries(
        ["PATH", "HOME", "TMPDIR"]
          .filter((name) => process.env[name])
          .map((name) => [name, process.env[name]!])
      );
      const result = spawnSync(process.execPath, ["-e", code], {
        env: { ...env, LC_ALL: "C", LANG: "C" },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
        timeout: TIMEOUT_MS
      });
      expect(result.error === undefined).toBe(true);
      expect(result.status).toBe(1);
      expect(result.output[3]).toBe("stage=builder-app-sign; category=signing-target-missing");
      const lifecycle = result.output[4]!;
      expect(lifecycle).toContain("stage=builder-app-sign; category=signing-call-entered\n");
      expect(lifecycle).toContain("stage=builder-app-sign; category=signing-call-rejected\n");
      expect(lifecycle).toContain("stage=builder-app-sign; category=promise-rejected\n");
      expect(lifecycle).toContain("stage=builder-app-sign; category=completion-written\n");
      expect(lifecycle).not.toContain("signing-call-resolved");
      expect(lifecycle).not.toContain(root);
      const wrapper = nodeRequire("./scripts/mac-production-builder.cjs");
      expect(lifecycle.trimEnd().split("\n").every(wrapper.isLifecycle)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  70_000
);
