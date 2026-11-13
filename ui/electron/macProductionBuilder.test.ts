import fs from "node:fs";
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

function harness() {
  const writeSync = vi.fn();
  const processMock = { exitCode: 0 };
  const execute = vi.fn(async (_options: unknown) => {});
  const createTarget = vi.fn(() => "arm64-targets");
  const module = { exports: {} as any };
  runInNewContext(fs.readFileSync("scripts/mac-production-builder.cjs", "utf8"), {
    module,
    __dirname: path.resolve("scripts"),
    process: processMock,
    require: (name: string): unknown => {
      if (name === "node:fs") return { writeSync };
      if (name === "electron-builder")
        return { build: execute, Platform: { MAC: { createTarget } }, Arch: { arm64: 1 } };
      return nodeRequire(name);
    }
  });
  const worker = module.exports;
  const signer = vi.fn(async (_options: unknown) => {});
  const verifyApp = vi.fn();
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
      return nodeRequire(name);
    }
  });
  return {
    worker,
    config: configModule.exports,
    execute,
    createTarget,
    writeSync,
    processMock,
    signer,
    verifyApp,
    beforePack
  };
}

describe("safe diagnostics inside the production builder", () => {
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
    expect(test.writeSync.mock.calls).toEqual([[3, `stage=${stage}; category=${category}`]]);
    expect(test.worker.isDiagnostic(`stage=${stage}; category=${category}`)).toBe(true);
    expect(test.worker.isDiagnostic(`stage=${stage}; category=${category}\nsecret`)).toBe(false);
    expect(() => test.worker.stage("secret")).toThrow("Invalid builder stage");
  });

  it("preserves arm64 targets, publish never and the production config", async () => {
    const test = harness();
    await test.worker.build();
    expect(test.createTarget).toHaveBeenCalledWith(["dmg", "zip"], 1);
    expect(test.execute).toHaveBeenCalledWith({
      targets: "arm64-targets",
      publish: "never",
      config: path.join(path.resolve("scripts"), "../electron-builder.mac-production.cjs")
    });
    expect(test.writeSync).not.toHaveBeenCalled();
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
      });
      await test.worker.build();
      expect(test.processMock.exitCode).toBe(1);
      const stages: Record<string, string> = {
        pack: "builder-pack; category=builder-failure",
        sign: "builder-app-sign; category=signing-failure",
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
it("installed builder awaits signing, notarization and stapling, then verification, before archives", async () => {
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
    "./check-signature": {
      checkSignatures: async () => {
        events.push("notary-signature-check");
      }
    },
    "./notarytool": {
      isNotaryToolAvailable: async () => true,
      notarizeAndWaitForNotaryTool: async () => {
        events.push("notarize-accepted");
      }
    },
    "./staple": {
      stapleApp: async () => {
        events.push("staple");
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
        .mockReturnValue({ appPath: "test.app" });
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
  await MacPackager.prototype.packMacTargets.call(fake, "out", 1, [], null, {});
  expect(events).toEqual([
    "sign",
    "notary-signature-check",
    "notarize-accepted",
    "staple",
    "verify-app-and-staple",
    "archives"
  ]);
});
