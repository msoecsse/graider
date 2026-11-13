import fs from "node:fs";
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
const wrapperSource = fs.readFileSync("scripts/package-mac-production.cjs", "utf8");

function harness(platform = "darwin", arch = "arm64") {
  const writes = vi.fn();
  const removes = vi.fn();
  const permissions = vi.fn();
  const verify = { verifySignature: vi.fn() };
  const command = vi.fn((file: string, args: string[], _env: Record<string, string>): string => {
    if (args[0] === "find-identity")
      return `1) ${fingerprint} "Developer ID Application: Fake Owner (${team})"\n`;
    if (args[0] === "notarytool") return JSON.stringify({ status: "Accepted" });
    return "";
  });
  const module = {
    exports: {} as {
      sign: (env: Record<string, string>, cmd: typeof command, verifier: typeof verify) => void;
      notarize: (file: string, env: Record<string, string>, cmd: typeof command) => void;
    }
  };
  const loader = Object.assign(
    (name: string): unknown => {
      if (name === "node:fs")
        return {
          mkdtempSync: (prefix: string) => `${prefix}test`,
          chmodSync: permissions,
          writeFileSync: writes,
          rmSync: removes,
          readFileSync: () => Buffer.from("fake-archive")
        };
      if (name === "./macos-signing-config.cjs") return helpers;
      if (name === "./verify-macos-signatures.cjs") return verify;
      return nodeRequire(name);
    },
    { resolve: () => "builder-cli" }
  );
  runInNewContext(wrapperSource, {
    require: loader,
    module,
    __dirname: path.resolve("scripts"),
    process: { platform, arch, execPath: "node", env: {} }
  });
  return { ...module.exports, writes, removes, permissions, verify, command };
}

describe("fail-closed macOS production signing", () => {
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
        ).toThrow(name);
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
    expect(() => test.sign(environment, test.command, test.verify)).toThrow("native macOS arm64");
    expect(test.writes).not.toHaveBeenCalled();
    expect(test.command).not.toHaveBeenCalled();
  });

  it("isolates credentials, signs before notarizing DMG, verifies both archives, and cleans up", () => {
    const test = harness();
    test.sign(environment, test.command, test.verify);
    const calls = test.command.mock.calls;
    const builder = calls.find((call) => call[1][0] === "builder-cli");
    expect(builder?.[1]).toEqual([
      "builder-cli",
      "--mac",
      "dmg",
      "zip",
      "--arm64",
      "--publish",
      "never",
      "--config",
      "electron-builder.mac-production.cjs"
    ]);
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
    const notaryIndex = calls.findIndex((call) => call[1][0] === "notarytool");
    expect(notaryIndex).toBeGreaterThan(calls.findIndex((call) => call[1][0] === "builder-cli"));
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

  it.each([
    "create-keychain",
    "import",
    "set-key-partition-list",
    "builder-cli",
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
    test.command.mockReturnValue("Wrong identity");
    expect(() => test.sign(environment, test.command, test.verify)).toThrow("does not match");
    expect(test.command.mock.calls.some((call) => call[1][0] === "builder-cli")).toBe(false);
    expect(test.removes).toHaveBeenCalled();
  });

  it.each(["{}", '{"status":"Invalid"}', '{"status":"In Progress"}', "malformed response"])(
    "rejects unaccepted notarization: %s",
    (response) => {
      const test = harness();
      test.command.mockReturnValue(response);
      expect(() => test.notarize("artifact.dmg", prepared, test.command)).toThrow("not Accepted");
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
      expect(() => test.sign(environment, test.command, test.verify)).toThrow("failed check");
      expect(test.removes).toHaveBeenCalled();
      expect(test.writes.mock.calls.some((call) => call[0].endsWith(".sha256"))).toBe(false);
    }
  );

  it.each([
    { status: 1, stderr: "fake-secret", stdout: "fake-secret" },
    { status: null, error: new Error("fake-secret") }
  ])("redacts subprocess errors at the executable entry point", (result) => {
    const stderr = vi.fn();
    const processMock = {
      platform: "darwin",
      arch: "arm64",
      execPath: "node",
      env: environment,
      stderr: { write: stderr },
      exitCode: 0
    };
    const module = { exports: {} };
    const loader = Object.assign(
      (name: string): unknown => {
        if (name === "node:child_process") return { spawnSync: () => result };
        if (name === "./macos-signing-config.cjs") return helpers;
        if (name === "./verify-macos-signatures.cjs") return {};
        if (name === "node:fs")
          return {
            mkdtempSync: () => "fake-temp",
            chmodSync: vi.fn(),
            writeFileSync: vi.fn(),
            rmSync: vi.fn()
          };
        return nodeRequire(name);
      },
      { main: module, resolve: () => "builder-cli" }
    );
    runInNewContext(wrapperSource, {
      module,
      require: loader,
      process: processMock,
      __dirname: path.resolve("scripts")
    });
    expect(processMock.exitCode).toBe(1);
    expect(JSON.stringify(stderr.mock.calls)).not.toContain("fake-secret");
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("No acceptance recorded"));
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
        require: (name: string): unknown => {
          if (name === "node:child_process") return { spawnSync };
          if (name === "./macos-signing-config.cjs") return helpers;
          return nodeRequire(name);
        }
      });
      return { ...module.exports, spawnSync };
    };
    const details = `Authority=Developer ID Application: Fake Owner (${team})\nTeamIdentifier=${team}\nCodeDirectory flags=0x10000(runtime)\n`;
    const entitlements = { "com.apple.security.cs.allow-jit": true };
    const valid = load(details, entitlements);
    valid.verifySignature("app", environment, true);
    valid.verifyStaple("app");
    expect(valid.spawnSync.mock.calls[0][1]).toContain(`certificate leaf = H"${fingerprint}"`);
    expect(valid.spawnSync.mock.calls.at(-1)?.[1]).toEqual(["stapler", "validate", "app"]);
    for (const invalid of [
      details
        .replace(team, "WRONGTEAM0")
        .replace(`TeamIdentifier=${team}`, "TeamIdentifier=WRONGTEAM0"),
      details.replace("Developer ID Application:", "Apple Development:"),
      details.replace("runtime", "adhoc")
    ]) {
      expect(() => load(invalid, entitlements).verifySignature("app", environment, true)).toThrow();
    }
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
        return nodeRequire(name);
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
        return nodeRequire(name);
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
      dmg: { sign: true, writeUpdateInfo: false }
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
