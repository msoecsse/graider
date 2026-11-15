import fs from "node:fs";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const nodeRequire = createRequire(path.resolve("package.json"));
const fingerprint = "A".repeat(40);
const environment = {
  GRAIDER_MAC_CERT_SHA1: fingerprint,
  GRAIDER_APPLE_TEAM_ID: "FAKETEAM01",
  GRAIDER_GITHUB_OAUTH_CLIENT_SECRET: "fake-oauth",
  CSC_KEYCHAIN: "fake-keychain",
  APPLE_API_KEY: "fake-p8",
  APPLE_API_KEY_ID: "FAKEKEY001",
  APPLE_API_ISSUER: "00000000-0000-0000-0000-000000000000"
};

function harness(verifier?: ReturnType<typeof verificationHarness>["verifier"]) {
  let elapsedMs = 0;
  const signer = vi.fn(async (_options: unknown) => {});
  const writeSync = vi.fn((_fd: number, value: string) => Buffer.byteLength(value));
  const lstatSync = vi.fn(() => ({ isFile: () => true, size: 1 }));
  const processMock = Object.assign(new EventEmitter(), { exitCode: 0 });
  const execute = vi.fn(
    async (_options: unknown): Promise<string[]> =>
      nodeRequire("./scripts/mac-production-artifacts.cjs")
        .expectedArtifacts(process.cwd())
        .map(({ file }: { file: string }) => file)
  );
  const createTarget = vi.fn(() => "arm64-targets");
  const module = { exports: {} as any };
  runInNewContext(fs.readFileSync("scripts/mac-production-builder.cjs", "utf8"), {
    module,
    Buffer,
    __dirname: path.resolve("scripts"),
    process: processMock,
    require: (name: string): unknown => {
      if (name === "node:fs") return { writeSync, lstatSync };
      if (name === "node:perf_hooks") return { performance: { now: () => elapsedMs } };
      if (name === "./verify-macos-signatures.cjs")
        return verifier ?? nodeRequire("./scripts/verify-macos-signatures.cjs");
      if (name === "app-builder-lib/out/codeSign/macCodeSign") return { sign: signer };
      if (name === "./mac-app-signing.cjs") return nodeRequire("./scripts/mac-app-signing.cjs");
      if (name === "electron-builder")
        return { build: execute, Platform: { MAC: { createTarget } }, Arch: { arm64: 1 } };
      return nodeRequire(
        name === "./mac-production-artifacts.cjs" ? "./scripts/mac-production-artifacts.cjs" : name
      );
    }
  });
  const worker = module.exports;
  const verifyApp = vi.fn(verifier?.verifyApp);
  const beforePack = vi.fn();
  const configModule = { exports: {} as any };
  runInNewContext(fs.readFileSync("electron-builder.mac-production.cjs", "utf8"), {
    module: configModule,
    process: { env: environment },
    require: (name: string): unknown => {
      if (name === "./scripts/mac-production-builder.cjs") return worker;
      if (name === "./scripts/verify-macos-signatures.cjs") return { verifyApp };
      if (name === "app-builder-lib/out/codeSign/macCodeSign") return { sign: signer };
      if (name === "./electron-builder.config.cjs") return { ...nodeRequire(name), beforePack };
      return nodeRequire(
        name === "./mac-production-artifacts.cjs" ? "./scripts/mac-production-artifacts.cjs" : name
      );
    }
  });
  return {
    worker,
    config: configModule.exports,
    execute,
    createTarget,
    writeSync,
    lstatSync,
    processMock,
    signer,
    verifyApp,
    beforePack,
    advance: (milliseconds: number) => {
      elapsedMs += milliseconds;
    }
  };
}

function verificationHarness(failed?: string, mode = "exit", failureTarget = 1) {
  const app = path.join("signed-output", "Graider.app");
  const contents = path.join(app, "Contents");
  const unpacked = path.join(contents, "Resources", "app.asar.unpacked");
  const modules = path.join(unpacked, "node_modules");
  const dugite = path.join(modules, "dugite", "git");
  const native = [
    path.join(contents, "MacOS", "Graider"),
    path.join(dugite, "git"),
    path.join(dugite, "libgit.dylib")
  ];
  const privateText = "private credential certificate executable-path native-output";
  const entries = new Map([
    [contents, ["MacOS", "Resources"]],
    [path.join(contents, "MacOS"), ["Graider"]],
    [path.join(contents, "Resources"), ["app.asar.unpacked"]],
    [unpacked, ["node_modules"]],
    [modules, ["dugite"]],
    [path.join(modules, "dugite"), ["git"]],
    [dugite, failed === "dugite-payload-missing" ? [] : ["git", "libgit.dylib"]]
  ]);
  const readdirSync = vi.fn((directory: string) => {
    if (failed === "native-inventory-failure") throw new Error(privateText);
    return entries.get(directory)!.map((name) => ({
      name,
      isDirectory: () => entries.has(path.join(directory, name)),
      isFile: () => native.includes(path.join(directory, name))
    }));
  });
  let entitlementTarget: string | undefined;
  const spawnSync = vi.fn((_file: string, args: string[]) => {
    const target = args.includes("-convert") ? entitlementTarget : args.at(-1);
    if (args.includes("--entitlements")) entitlementTarget = target;
    const prefix = target === app ? "main" : "native";
    const gate = args.includes("--deep")
      ? "deep-signature-failure"
      : args.includes("validate")
        ? "stapled-ticket-failure"
        : `${prefix}-${args.includes("--brief") ? "kind" : args.includes("--verbose=4") ? "identity" : args.includes("--entitlements") || args.includes("-convert") ? "entitlements-command" : "signature"}-failure`;
    // Fail on the extensionless Dugite executable, after the Electron executable.
    const fail =
      (failed === gate ||
        (gate === `${prefix}-entitlements-command-failure` &&
          failed?.startsWith(`${prefix}-entitlements-`))) &&
      (prefix === "main" || target === native[failureTarget] || gate === "stapled-ticket-failure");
    if (fail && mode === "throw") throw new Error(privateText);
    if (fail && mode === "start")
      return { error: new Error(privateText), status: null, stderr: privateText };
    if (fail && mode === "signal") return { signal: "SIGTERM", status: null, stderr: privateText };
    if (fail && mode === "exit") return { status: 1, stderr: privateText };
    if (args.includes("--brief"))
      return {
        status: 0,
        stdout: `Mach-O 64-bit ${target?.endsWith(".dylib") ? "dynamically linked shared library" : "executable"} arm64\n`
      };
    if (args.includes("--verbose=4")) {
      const runtimeFailure =
        failed === `${prefix}-runtime-failure` && (prefix === "main" || target === native[1]);
      const identityFailure = fail && mode === "metadata";
      return {
        status: 0,
        stderr: `Authority=${identityFailure ? privateText : "Developer ID Application: Fixture"}\nTeamIdentifier=${environment.GRAIDER_APPLE_TEAM_ID}\nflags=${runtimeFailure ? "adhoc" : "runtime"}\n`
      };
    }
    if (args.includes("--entitlements"))
      return {
        status: 0,
        stdout:
          fail && ["missing", "stderr-xml"].includes(mode)
            ? ""
            : mode === "empty-non-jit" && native.slice(1).includes(target!)
              ? ""
              : fail && mode === "missing-xml"
                ? privateText
                : '<?xml version="1.0"?><plist><dict/></plist>',
        stderr:
          fail && mode === "stderr-xml"
            ? '<?xml version="1.0"?><plist><dict/></plist>'
            : privateText
      };
    if (args.includes("-convert")) {
      if (fail && mode === "missing-xml") return { status: 1, stderr: privateText };
      if (fail && mode === "invalid-json") return { status: 0, stdout: privateText };
      const dictionaries: Record<string, unknown> = {
        "null-dictionary": null,
        "array-dictionary": [],
        "scalar-dictionary": true,
        "empty-dictionary": {},
        "false-jit": { "com.apple.security.cs.allow-jit": false },
        "string-jit": { "com.apple.security.cs.allow-jit": "true" },
        "debug-entitlement": { "com.apple.security.get-task-allow": true },
        "unsigned-memory-entitlement": {
          "com.apple.security.cs.allow-unsigned-executable-memory": true
        }
      };
      if (fail && Object.hasOwn(dictionaries, mode))
        return { status: 0, stdout: JSON.stringify(dictionaries[mode]) };
      return {
        status: 0,
        stdout: JSON.stringify({
          "com.apple.security.cs.allow-jit": true,
          ...(fail && mode === "extra-entitlement"
            ? { "com.apple.security.cs.disable-library-validation": true }
            : {})
        })
      };
    }
    return { status: 0, stdout: "" };
  });
  const module = { exports: {} as any };
  runInNewContext(fs.readFileSync("scripts/verify-macos-signatures.cjs", "utf8"), {
    module,
    Buffer,
    process: { env: {} },
    require: (name: string) => {
      if (name === "node:child_process") return { spawnSync };
      if (name === "node:fs")
        return {
          readdirSync,
          openSync: () => 1,
          readSync: (_fd: number, bytes: Buffer) => {
            bytes.writeUInt32BE(0xfeedfacf);
          },
          closeSync: vi.fn()
        };
      if (name === "./macos-signing-config.cjs")
        return nodeRequire("./scripts/macos-signing-config.cjs");
      return nodeRequire(name);
    }
  });
  return { verifier: module.exports, spawnSync, app, native };
}

describe("safe diagnostics inside the production builder", () => {
  it("accepts absent entitlements on signed native libraries and non-JIT Dugite tools", () => {
    const { verifier, app, spawnSync } = verificationHarness(undefined, "empty-non-jit");
    verifier.verifyApp(app, environment);
    expect(spawnSync.mock.calls.at(-1)?.[1]).toEqual(["stapler", "validate", app]);
  });

  it.each([
    ["main", 0],
    ["native", 0]
  ])("still requires JIT on the %s Electron process", (prefix, target) => {
    for (const mode of ["missing", "empty-dictionary", "stderr-xml"]) {
      const category = `${prefix}-entitlements-missing-failure`;
      const { verifier, app, spawnSync } = verificationHarness(category, mode, target);
      let rejected: unknown;
      try {
        verifier.verifyApp(app, environment);
      } catch (error) {
        rejected = error;
      }
      expect(verifier.appVerificationCategory(rejected)).toBe(category);
      expect(spawnSync.mock.calls.some(([, args]) => args.includes("validate"))).toBe(false);
    }
  });

  it.each([0, 1, 2])(
    "rejects malformed and unexpected entitlements on native component %s",
    (target) => {
      for (const mode of [
        "missing-xml",
        "invalid-json",
        "null-dictionary",
        "array-dictionary",
        "scalar-dictionary",
        "extra-entitlement",
        "debug-entitlement",
        "unsigned-memory-entitlement",
        "false-jit",
        "string-jit"
      ]) {
        const reason = [
          "extra-entitlement",
          "debug-entitlement",
          "unsigned-memory-entitlement",
          "false-jit",
          "string-jit"
        ].includes(mode)
          ? "unexpected"
          : "malformed";
        const category = `native-entitlements-${reason}-failure`;
        const { verifier, app, spawnSync } = verificationHarness(category, mode, target);
        let rejected: unknown;
        try {
          verifier.verifyApp(app, environment);
        } catch (error) {
          rejected = error;
        }
        expect(verifier.appVerificationCategory(rejected)).toBe(category);
        expect((rejected as Error).message).toBe("Application verification failed.");
        expect(spawnSync.mock.calls.some(([, args]) => args.includes("validate"))).toBe(false);
      }
    }
  );

  it.each(["exit", "start", "signal", "throw"])(
    "does not accept an entitlement inspection command %s failure as absent entitlements",
    async (mode) => {
      const category = "native-entitlements-command-failure";
      const verification = verificationHarness(category, mode);
      const test = harness(verification.verifier);
      test.execute.mockImplementation(async () => {
        test.config.afterSign({ appOutDir: "signed-output" });
        return [];
      });
      await test.worker.build();
      expect(test.writeSync.mock.calls.filter(([fd]) => fd === 3)).toEqual([
        [3, `stage=builder-app-verification; category=${category}`]
      ]);
      expect(test.processMock.exitCode).toBe(1);
    }
  );

  it.each([
    "main-signature-failure",
    "main-identity-failure",
    "main-runtime-failure",
    "main-entitlements-command-failure",
    "deep-signature-failure",
    "native-inventory-failure",
    "dugite-payload-missing",
    "native-signature-failure",
    "native-identity-failure",
    "native-runtime-failure",
    "native-entitlements-command-failure",
    "native-kind-failure",
    "stapled-ticket-failure"
  ])(
    "preserves the independent %s gate through the actual verifier and builder",
    async (category) => {
      const verification = verificationHarness(category);
      const test = harness(verification.verifier);
      test.execute.mockImplementation(async () => {
        test.config.afterSign({ appOutDir: "signed-output" });
        return [];
      });
      await test.worker.build();
      const detail = `stage=builder-app-verification; category=${category}`;
      expect(test.writeSync.mock.calls.filter(([fd]) => fd === 3)).toEqual([[3, detail]]);
      expect(test.worker.isDiagnostic(detail)).toBe(true);
      expect(test.worker.isDiagnostic(detail + "\nprivate")).toBe(false);
      expect(
        test.worker.isDiagnostic(detail.replace("builder-app-verification", "builder-app-sign"))
      ).toBe(false);
      expect(test.processMock.exitCode).toBe(1);
      expect(
        test.writeSync.mock.calls.some(([, value]) =>
          /private|credential|certificate|executable-path|native-output|builder-archive/.test(value)
        )
      ).toBe(false);
      if (category !== "stapled-ticket-failure")
        expect(
          verification.spawnSync.mock.calls.some(([, args]) => args.includes("validate"))
        ).toBe(false);
    }
  );

  it.each([
    "start",
    "signal",
    "throw",
    "metadata",
    "missing-xml",
    "invalid-json",
    "extra-entitlement"
  ])("keeps %s verification errors private with local provenance", (mode) => {
    const category =
      mode === "metadata"
        ? "native-identity-failure"
        : ["missing-xml", "invalid-json", "extra-entitlement"].includes(mode)
          ? `native-entitlements-${mode === "extra-entitlement" ? "unexpected" : "malformed"}-failure`
          : "native-signature-failure";
    const { verifier, app } = verificationHarness(category, mode);
    let rejected: unknown;
    try {
      verifier.verifyApp(app, environment);
    } catch (error) {
      rejected = error;
    }
    expect(verifier.appVerificationCategory(rejected)).toBe(category);
    expect((rejected as Error).message).toBe("Application verification failed.");
    expect((rejected as Error).cause).toBeUndefined();
    for (const forged of [new Error(category), { category, message: category }, null, "private"])
      expect(verifier.appVerificationCategory(forged)).toBeUndefined();
  });

  it("requires every native executable and dylib and the stapled ticket before archive construction", () => {
    const verification = verificationHarness();
    const test = harness(verification.verifier);
    test.config.afterSign({ appOutDir: "signed-output" });
    for (const target of [verification.app, ...verification.native]) {
      expect(verification.spawnSync).toHaveBeenCalledWith(
        "/usr/bin/codesign",
        ["--verify", "--strict", "-R", `=certificate leaf = H"${fingerprint}"`, target],
        expect.anything()
      );
      expect(verification.spawnSync).toHaveBeenCalledWith(
        "/usr/bin/codesign",
        ["--display", "--entitlements", "-", "--xml", target],
        expect.anything()
      );
    }
    expect(verification.spawnSync.mock.calls.at(-1)?.slice(0, 2)).toEqual([
      "/usr/bin/xcrun",
      ["stapler", "validate", verification.app]
    ]);
    expect(test.writeSync).toHaveBeenLastCalledWith(
      4,
      "stage=builder-archive; category=stage-entered\n"
    );
  });

  it.each([
    [0, "under-1m"],
    [60_000, "1m-to-5m"],
    [300_000, "5m-to-15m"],
    [900_000, "15m-to-30m"],
    [1_800_000, "30m-or-more"]
  ])(
    "records only a fixed duration bucket for %s elapsed milliseconds",
    async (elapsed, bucket) => {
      const test = harness();
      test.execute.mockImplementation(async () => {
        test.worker.stage("builder-app-notarize-staple");
        test.advance(elapsed);
        test.worker.stage("builder-app-verification");
        throw new Error("private");
      });
      await test.worker.build();
      const detail = `stage=builder-app-notarize-staple; category=stage-duration-${bucket}`;
      expect(test.writeSync.mock.calls.filter(([, value]) => value === detail + "\n")).toHaveLength(
        1
      );
      expect(test.worker.isLifecycle(detail)).toBe(true);
      expect(test.worker.isLifecycle(detail + "; private")).toBe(false);
      expect(
        test.worker.isLifecycle("stage=builder-app-notarize-staple; category=stage-duration-31m")
      ).toBe(false);
      expect(test.worker.isDiagnostic(detail)).toBe(false);
    }
  );

  it("marks actual signer entry and settlement independently of afterPack", async () => {
    const test = harness();
    test.config.afterPack();
    expect(test.writeSync).toHaveBeenCalledWith(
      4,
      "stage=builder-sign-prepare; category=stage-entered\n"
    );
    expect(
      test.writeSync.mock.calls.some(([, value]) => value.includes("signing-call-entered"))
    ).toBe(false);
    let settle!: () => void;
    test.signer.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        })
    );
    const pending = test.config.mac.sign({ identity: fingerprint });
    expect(test.writeSync).toHaveBeenCalledWith(
      4,
      "stage=builder-app-sign; category=signing-call-entered\n"
    );
    expect(
      test.writeSync.mock.calls.some(([, value]) => value.includes("signing-call-resolved"))
    ).toBe(false);
    expect(
      test.writeSync.mock.calls.some(([, value]) => value.includes("builder-app-notarize-staple"))
    ).toBe(false);
    settle();
    await pending;
    expect(test.writeSync).toHaveBeenCalledWith(
      4,
      "stage=builder-app-sign; category=signing-call-resolved\n"
    );
    expect(test.writeSync).toHaveBeenCalledWith(
      4,
      "stage=builder-app-notarize-staple; category=stage-entered\n"
    );
    expect(
      test.worker.isLifecycle("stage=builder-app-sign; category=signing-call-resolved\nsecret")
    ).toBe(false);
    expect(test.worker.isLifecycle("stage=builder-pack; category=signing-call-entered")).toBe(
      false
    );
  });

  it.each([
    ["User interaction is not allowed.", "private-key-access-denied"],
    ["errSecInternalComponent", "native-security-internal-error"],
    ["The timestamp service is not available.", "timestamp-service-failure"],
    ["cannot read entitlement data", "entitlements-failure"],
    ["unknown private failure", "unknown-signing-rejection"]
  ])(
    "preserves only a fixed signing category through builder rejection: %s",
    async (message, category) => {
      const test = harness();
      const raw = new Error(message + " secret certificate argv credential path");
      test.signer.mockRejectedValue(raw);
      let forwarded: unknown;
      test.execute.mockImplementation(async () => {
        try {
          await test.config.mac.sign({});
        } catch (error) {
          forwarded = error;
          throw error;
        }
        return [];
      });
      await test.worker.build();
      expect(forwarded).not.toBe(raw);
      expect((forwarded as Error).message).toBe("Application signing failed.");
      expect((forwarded as Error).cause).toBeUndefined();
      expect(test.writeSync).toHaveBeenCalledWith(
        3,
        "stage=builder-app-sign; category=" + category
      );
      expect(test.writeSync).toHaveBeenCalledWith(
        4,
        "stage=builder-app-sign; category=signing-call-rejected\n"
      );
      expect(
        test.writeSync.mock.calls.some(([, value]) => /secret|credential|argv/.test(value))
      ).toBe(false);
      expect(
        test.writeSync.mock.calls.some(([, value]) =>
          /signing-call-resolved|builder-app-notarize-staple/.test(value)
        )
      ).toBe(false);
      expect(test.processMock.exitCode).toBe(1);
    }
  );

  it("installed DMG builder selects UDZO and HFS+ for the production defaults", async () => {
    nodeRequire("electron-builder");
    const { DmgTarget } = nodeRequire("dmg-builder/out/dmg");
    const target = new DmgTarget(
      {
        config: { dmg: { sign: false, writeUpdateInfo: false } },
        compression: "normal",
        appInfo: { productFilename: "Graider" },
        getIconPath: async () => null,
        resourceList: []
      },
      "fixture-output"
    );
    const options = await target.computeDmgOptions("fixture.app");
    expect(options.format).toBe("UDZO");
    expect(options.filesystem).toBeUndefined();
    const file = nodeRequire.resolve("dmg-builder/out/dmgUtil");
    const localRequire = createRequire(file);
    const exports = {} as any;
    const writeFile = vi.fn(async (_file: string, _data: string) => {});
    const execute = vi.fn(async () => "");
    runInNewContext(fs.readFileSync(file, "utf8"), {
      exports,
      __dirname: path.dirname(file),
      process: { ...process, env: {} },
      require: (name: string) => {
        if (name === "builder-util") return { ...localRequire(name), exec: execute };
        if (name === "fs-extra") return { ...localRequire(name), writeFile };
        if (name === "app-builder-lib/out/util/electronGet")
          return { downloadBuilderToolset: async () => "fixture-toolset" };
        if (name === "app-builder-lib/out/util/toolsetLock")
          return { withToolsetLock: (operation: () => Promise<unknown>) => operation() };
        return localRequire(name);
      }
    });
    await exports.customizeDmg({
      appPath: "fixture.app",
      artifactPath: "fixture.dmg",
      volumeName: "Fixture",
      specification: { ...options, background: null },
      packager: {
        getResource: async () => null,
        getTempFile: async () => "fixture-settings.json",
        info: { getWorkspaceRoot: async () => "fixture-workspace" },
        packagerOptions: {}
      }
    });
    expect(JSON.parse(writeFile.mock.calls[0][1])).toMatchObject({
      format: "UDZO",
      filesystem: "HFS+"
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(["signed", "disallowed", "missing-identity", "disabled"])(
    "installed DMG signer behavior: %s",
    async (scenario) => {
      nodeRequire("electron-builder");
      const file = nodeRequire.resolve("dmg-builder/out/dmg");
      const localRequire = createRequire(file);
      const exec = vi.fn(async () => "");
      const findIdentity = vi.fn(async () =>
        scenario === "missing-identity" ? null : { hash: fingerprint }
      );
      const exports = {} as any;
      runInNewContext(fs.readFileSync(file, "utf8"), {
        exports,
        require: (dependency: string) => {
          if (dependency === "app-builder-lib/out/codeSign/macCodeSign")
            return { isSignAllowed: () => scenario !== "disallowed", findIdentity };
          if (dependency === "builder-util") return { ...localRequire(dependency), exec };
          return localRequire(dependency);
        }
      });
      const target = new exports.DmgTarget(
        {
          config: { dmg: { sign: true } },
          platformSpecificBuildOptions: {
            identity: scenario === "disabled" ? null : fingerprint
          },
          codeSigningInfo: { value: Promise.resolve({ keychainFile: "fake-keychain" }) }
        },
        "output"
      );
      await target.signDmg("signed.dmg");
      if (scenario === "signed") {
        expect(findIdentity).toHaveBeenCalledWith(
          "Developer ID Application",
          fingerprint,
          "fake-keychain"
        );
        expect(exec).toHaveBeenCalledWith("codesign", [
          "--sign",
          fingerprint,
          "--keychain",
          "fake-keychain",
          "signed.dmg"
        ]);
      } else {
        expect(exec).not.toHaveBeenCalled();
      }
    }
  );

  it("installed identity lookup honors explicit fingerprints with discovery disabled and scopes both queries", async () => {
    nodeRequire("electron-builder");
    const file = nodeRequire.resolve("app-builder-lib/out/codeSign/macCodeSign");
    const localRequire = createRequire(file);
    const exec = vi.fn(
      async (_file: string, _args: string[]) =>
        `1) ${fingerprint} "Developer ID Application: Fixture (FAKETEAM01)"\n`
    );
    const exports = {} as any;
    const flags = {} as any;
    runInNewContext(fs.readFileSync(localRequire.resolve("../util/flags"), "utf8"), {
      exports: flags,
      require: createRequire(localRequire.resolve("../util/flags")),
      process: { env: { CSC_IDENTITY_AUTO_DISCOVERY: "false" } }
    });
    runInNewContext(fs.readFileSync(file, "utf8"), {
      exports,
      process: { env: { CSC_IDENTITY_AUTO_DISCOVERY: "false" } },
      require: (dependency: string): unknown => {
        if (dependency === "builder-util") return { ...localRequire(dependency), exec };
        if (dependency === "../util/flags") return flags;
        if (dependency === "../util/dynamicImport")
          return {
            dynamicImport: async () => ({
              Identity: class {
                constructor(
                  public name: string,
                  public hash: string
                ) {}
              }
            })
          };
        return localRequire(dependency);
      }
    });
    expect(
      await exports.findIdentity("Developer ID Application", undefined, "fixture-keychain")
    ).toBeNull();
    expect(exec).not.toHaveBeenCalled();
    expect(
      await exports.findIdentity("Developer ID Application", fingerprint, "fixture-keychain")
    ).toMatchObject({ hash: fingerprint });
    expect(exec.mock.calls).toEqual([
      ["/usr/bin/security", ["find-identity", "-v", "fixture-keychain"]],
      ["/usr/bin/security", ["find-identity", "-v", "-p", "codesigning", "fixture-keychain"]]
    ]);
    expect(
      await exports.findIdentity("Developer ID Application", "B".repeat(40), "fixture-keychain")
    ).toBeNull();
  });

  it("installed MacPackager reads CSC_KEYCHAIN without importing or changing keychains", async () => {
    nodeRequire("electron-builder");
    const file = nodeRequire.resolve("app-builder-lib/out/macPackager");
    const localRequire = createRequire(file);
    const exports = {} as any;
    runInNewContext(fs.readFileSync(file, "utf8"), {
      exports,
      process: { platform: "darwin", env: { CSC_KEYCHAIN: "fixture-keychain" } },
      require: (dependency: string): unknown =>
        dependency === "./platformPackager"
          ? {
              PlatformPackager: class {
                getCscLink() {
                  return null;
                }
              }
            }
          : localRequire(dependency)
    });
    const packager = new exports.MacPackager({});
    expect(await packager.codeSigningInfo.value).toEqual({ keychainFile: "fixture-keychain" });
  });

  it("installed builder supplies runtime and configured entitlements to nested native code", async () => {
    nodeRequire("electron-builder");
    const { MacTargetHelper } = nodeRequire("app-builder-lib/out/mac/MacTargetHelper");
    const config = harness().config.mac;
    const options = await MacTargetHelper.prototype.getOptionsForFile.call(
      { packager: { resourceList: Promise.resolve([]), platformSpecificBuildOptions: {} } },
      "Graider.app",
      false,
      config
    );
    for (const file of [
      "Graider.app",
      "Graider.app/Contents/MacOS/Graider",
      "Graider.app/Contents/Frameworks/Electron Framework.framework",
      "Graider.app/Contents/Frameworks/Graider Helper (Renderer).app",
      "Graider.app/Contents/Resources/app.asar.unpacked/node_modules/dugite/git/bin/git",
      "Graider.app/Contents/Resources/app.asar.unpacked/node_modules/dugite/git/lib/libgit.dylib"
    ])
      expect(options(file)).toMatchObject({
        hardenedRuntime: true,
        entitlements: "build/entitlements.mac-production.plist"
      });
  });

  it.each([
    ["builder-initialize", "builder-failure"],
    ["builder-pack", "builder-failure"],
    ["builder-app-sign", "signing-failure"],
    ["builder-app-notarize-staple", "notarization-failure"],
    ["builder-app-verification", "verification-failure"],
    ["builder-archive", "archive-failure"]
  ])("reports only fixed identifiers for %s", async (stage, category) => {
    const test = harness();
    test.execute.mockImplementation(async () => {
      test.worker.stage(stage);
      throw new Error("secret certificate path argv credential raw builder output");
    });
    await test.worker.build();
    expect(test.processMock.exitCode).toBe(1);
    expect(test.writeSync.mock.calls.filter(([fd]) => fd === 3)).toEqual([
      [3, `stage=${stage}; category=${category}`]
    ]);
    expect(test.worker.isDiagnostic(`stage=${stage}; category=${category}`)).toBe(true);
    expect(test.worker.isDiagnostic(`stage=${stage}; category=${category}\nsecret`)).toBe(false);
    expect(() => test.worker.stage("secret")).toThrow("Invalid builder stage");
  });

  it.each([
    [[], "missing-artifact"],
    [["other.dmg"], "unexpected-output-directory"],
    [["release/macos-production/other.dmg"], "unexpected-artifact-filename"],
    [undefined, "invalid-artifact-result"]
  ])(
    "rejects inconsistent build results without exposing paths: %s",
    async (produced, category) => {
      const test = harness();
      test.execute.mockResolvedValue(produced as string[]);
      await test.worker.build();
      expect(test.processMock.exitCode).toBe(1);
      const detail = `stage=builder-artifact-dmg; category=${category}`;
      expect(test.writeSync.mock.calls.filter(([fd]) => fd === 3)).toEqual([[3, detail]]);
      expect(test.worker.isDiagnostic(detail)).toBe(true);
      expect(test.worker.isDiagnostic(detail + "\nprivate path")).toBe(false);
    }
  );

  it.each(["dmg", "zip"])(
    "requires a nonempty regular %s in addition to the build result",
    async (extension) => {
      const test = harness();
      test.lstatSync.mockReturnValue({ isFile: () => true, size: 0 });
      if (extension === "zip") test.lstatSync.mockReturnValueOnce({ isFile: () => true, size: 1 });
      await test.worker.build();
      expect(test.processMock.exitCode).toBe(1);
      expect(test.writeSync.mock.calls.filter(([fd]) => fd === 3)).toEqual([
        [3, `stage=builder-artifact-${extension}; category=empty-artifact`]
      ]);
    }
  );

  it("preserves arm64 targets, publish never and the production config", async () => {
    const test = harness();
    await test.worker.build();
    expect(test.createTarget).toHaveBeenCalledWith(["dmg", "zip"], 1);
    expect(test.execute).toHaveBeenCalledWith({
      targets: "arm64-targets",
      publish: "never",
      config: path.join(path.resolve("scripts"), "../electron-builder.mac-production.cjs")
    });
    expect(test.writeSync.mock.calls.filter(([fd]) => fd === 3)).toEqual([
      [3, "stage=builder-artifacts; category=validated"]
    ]);
    expect(test.processMock.exitCode).toBe(0);
  });

  it.each(["pack", "sign", "verify", "archive"])(
    "fails closed at %s without serializing errors",
    async (failed) => {
      const test = harness();
      const secret = new Error("secret certificate argv private path");
      if (failed === "pack")
        test.beforePack.mockImplementation(() => {
          throw secret;
        });
      if (failed === "sign") test.signer.mockRejectedValue(secret);
      if (failed === "verify")
        test.verifyApp.mockImplementation(() => {
          throw secret;
        });
      const options = { app: "test.app", identity: fingerprint, strictVerify: true };
      test.execute.mockImplementation(async () => {
        await test.config.beforePack({});
        await test.config.mac.sign(options);
        test.config.afterSign({ appOutDir: "signed-output" });
        if (failed === "archive") throw secret;
        return [];
      });
      await test.worker.build();
      expect(test.processMock.exitCode).toBe(1);
      const stages: Record<string, string> = {
        pack: "builder-pack; category=builder-failure",
        sign: "builder-app-sign; category=unknown-signing-rejection",
        verify: "builder-app-verification; category=verification-failure",
        archive: "builder-archive; category=archive-failure"
      };
      expect(test.writeSync).toHaveBeenCalledWith(3, `stage=${stages[failed]}`);
      if (failed !== "pack") expect(test.signer).toHaveBeenCalledWith(options);
      if (failed === "sign") expect(test.verifyApp).not.toHaveBeenCalled();
      if (failed === "verify" || failed === "archive")
        expect(test.verifyApp).toHaveBeenCalledWith(
          path.join("signed-output", "Graider.app"),
          environment
        );
    }
  );
});

// Execute the installed implementation with only external operations replaced.
// This guards against assuming afterSign precedes notarization in builder 26.
it.each(["accepted", "notary-rejected", "staple-rejected", "missing-auth"])(
  "installed builder notarization lifecycle: %s",
  async (scenario) => {
    nodeRequire("electron-builder");
    const events: string[] = [];
    function load(name: string, overrides: Record<string, unknown>): any {
      const file = nodeRequire.resolve(name);
      const localRequire = createRequire(file);
      const exports = {};
      runInNewContext(fs.readFileSync(file, "utf8"), {
        exports,
        require: (dependency: string) => overrides[dependency] ?? localRequire(dependency)
      });
      return exports;
    }
    const notarizer = load("@electron/notarize", {
      "promise-retry": (operation: () => Promise<void>) => operation(),
      "./check-signature": {
        checkSignatures: async () => {
          events.push("notary-signature-check");
        }
      },
      "./notarytool": {
        isNotaryToolAvailable: async () => true,
        notarizeAndWaitForNotaryTool: async () => {
          if (scenario === "notary-rejected") {
            events.push("notary-rejected");
            throw new Error("private notarization error");
          }
          events.push("notarize-accepted");
        }
      },
      "./staple": {
        stapleApp: async () => {
          events.push("staple");
          if (scenario === "staple-rejected") throw new Error("private stapling error");
        }
      }
    });
    const { MacTargetHelper } = load("app-builder-lib/out/mac/MacTargetHelper", {
      "../util/dynamicImport": { dynamicImport: async () => notarizer }
    });
    const { MacPackager } = load("app-builder-lib/out/macPackager", {
      "./codeSign/macCodeSign": { isSignAllowed: () => true },
      "./util/macosVersion": { isMacOsHighSierra: () => true }
    });
    const { PlatformPackager } = nodeRequire("app-builder-lib/out/platformPackager");
    const helper = {
      findSigningIdentity: async () => ({ name: "fake-identity" }),
      buildSignOptions: async () => ({}),
      notarizeIfProvided: async () => {
        const options = vi
          .spyOn(MacTargetHelper, "getNotarizeOptions")
          .mockReturnValue(scenario === "missing-auth" ? undefined : { appPath: "test.app" });
        try {
          await MacTargetHelper.prototype.notarizeIfProvided.call(
            { packager: { platformSpecificBuildOptions: { notarize: true } } },
            "test.app"
          );
        } finally {
          options.mockRestore();
        }
      }
    };
    const fake = {
      helper,
      platformSpecificBuildOptions: {},
      codeSigningInfo: { value: Promise.resolve({}) },
      computeAsarOptions: async () => ({}),
      computeAppOutDir: () => "signed-output",
      appInfo: { productFilename: "Graider" },
      getPlatformConfig: () => ({ platformName: "darwin", config: {} }),
      doSign: async () => {
        events.push("sign");
      },
      signApp: async () => MacPackager.prototype.sign.call(fake, "test.app"),
      info: {
        emitAfterSign: async () => {
          events.push("verify-app-and-staple");
          const verification = verificationHarness(
            scenario === "missing-auth" ? "stapled-ticket-failure" : undefined
          );
          verification.verifier.verifyApp(verification.app, environment);
        }
      },
      doPack: async () =>
        PlatformPackager.prototype.doSignAfterPack.call(
          fake,
          "out",
          "signed-output",
          "darwin",
          1,
          {},
          []
        ),
      packageInDistributableFormat: () => {
        events.push("archives");
      }
    };
    const packed = MacPackager.prototype.packMacTargets.call(fake, "out", 1, [], null, {});
    if (scenario === "accepted") await packed;
    else await expect(packed).rejects.toThrow();
    const expected: Record<string, string[]> = {
      accepted: [
        "sign",
        "notary-signature-check",
        "notarize-accepted",
        "staple",
        "verify-app-and-staple",
        "archives"
      ],
      "notary-rejected": ["sign", "notary-signature-check", "notary-rejected"],
      "staple-rejected": ["sign", "notary-signature-check", "notarize-accepted", "staple"],
      "missing-auth": ["sign", "verify-app-and-staple"]
    };
    expect(events).toEqual(expected[scenario]);
  }
);
