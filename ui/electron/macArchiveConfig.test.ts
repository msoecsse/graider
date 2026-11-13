import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
const configFile = "electron-builder.mac-archive-test.cjs";
const wrapper = fs.readFileSync("scripts/package-mac-archive-test.cjs", "utf8");

describe("macOS test-only archives", () => {
  it("validates explicit unsigned arm64 targets without mutating existing defaults", async () => {
    const { getConfig, validateConfiguration } = nodeRequire(
      "app-builder-lib/out/util/config/config"
    );
    const config = await getConfig(process.cwd(), configFile, {});
    await validateConfiguration(config);
    const base = await getConfig(process.cwd(), "electron-builder.config.cjs", {});
    expect(config).toMatchObject({
      appId: base.appId,
      productName: base.productName,
      directories: { output: "release/macos-archive-test" },
      publish: null,
      forceCodeSigning: false,
      generateUpdatesFilesForAllChannels: false,
      mac: {
        identity: null,
        notarize: false,
        target: [
          { target: "dmg", arch: ["arm64"] },
          { target: "zip", arch: ["arm64"] }
        ],
        artifactName: "Graider-${version}-mac-${arch}-unsigned-test.${ext}"
      },
      dmg: { sign: false }
    });
    expect(config.files).toEqual(base.files);
    expect(config.asarUnpack).toEqual(base.asarUnpack);
    expect(base.mac.target).toEqual([{ target: "dir", arch: ["arm64"] }]);
    expect(base.win.target).toEqual([{ target: "portable", arch: ["x64"] }]);
  });

  it("writes only the nonfunctional OAuth fixture even with inherited real configuration", () => {
    const writes: unknown[][] = [];
    const module = { exports: {} as { beforePack: () => void } };
    runInNewContext(fs.readFileSync(configFile, "utf8"), {
      module,
      __dirname: process.cwd(),
      process: { env: { GRAIDER_GITHUB_OAUTH_CLIENT_SECRET: "fake-inherited-secret" } },
      require: (name: string): unknown => {
        if (name === "./electron-builder.config.cjs") return nodeRequire(path.resolve(name));
        if (name === "node:fs")
          return {
            writeFileSync: (...args: unknown[]): void => {
              writes.push(args);
            }
          };
        return nodeRequire(name);
      }
    });
    module.exports.beforePack();
    expect(writes).toEqual([
      [
        path.join(process.cwd(), "dist-electron/github-oauth.release.json"),
        JSON.stringify({ clientSecret: "ci-only-nonfunctional-mac-archive-test" }),
        { mode: 0o600 }
      ]
    ]);
  });

  it.each([
    ["darwin", "arm64", true],
    ["darwin", "x64", false],
    ["win32", "x64", false],
    ["linux", "arm64", false]
  ])("guards native %s/%s and suppresses signing/publishing", (platform, arch, allowed) => {
    const inherited = Object.fromEntries(
      [
        "CSC_LINK",
        "CSC_KEY_PASSWORD",
        "WIN_CSC_LINK",
        "CSC_NAME",
        "CSC_IDENTITY_AUTO_DISCOVERY",
        "APPLE_ID",
        "APPLE_APP_SPECIFIC_PASSWORD",
        "APPLE_API_KEY",
        "APPLE_API_ISSUER",
        "ASC_KEY_ID",
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "GITHUB_RELEASE_TOKEN",
        "GRAIDER_GITHUB_OAUTH_CLIENT_SECRET",
        "GRAIDER_MAC_CERT_P12_BASE64",
        "GRAIDER_MAC_CERT_PASSWORD",
        "GRAIDER_APPLE_API_KEY_P8_BASE64",
        "GRAIDER_APPLE_API_KEY_ID",
        "GRAIDER_APPLE_API_ISSUER"
      ].map((name) => [name, "fake-sensitive-value"])
    );
    const calls: { args: string[]; options: { env: Record<string, string>; shell: boolean } }[] =
      [];
    const exits: number[] = [];
    const run = (): void => {
      runInNewContext(wrapper, {
        require: Object.assign(
          () => ({
            spawnSync: (
              _file: string,
              args: string[],
              options: (typeof calls)[number]["options"]
            ) => {
              calls.push({ args, options });
              return { status: 0 };
            }
          }),
          { resolve: () => "builder-cli" }
        ),
        process: {
          platform,
          arch,
          execPath: "native-node",
          env: { ...inherited, PATH: "tools" },
          exit: (status: number): void => {
            exits.push(status);
          }
        }
      });
    };
    if (allowed) {
      run();
      expect(calls).toEqual([
        {
          args: [
            "builder-cli",
            "--mac",
            "dmg",
            "zip",
            "--arm64",
            "--publish",
            "never",
            "--config",
            configFile
          ],
          options: {
            env: { PATH: "tools", CSC_IDENTITY_AUTO_DISCOVERY: "false" },
            shell: false,
            stdio: "inherit"
          }
        }
      ]);
      expect(exits).toEqual([0]);
    } else {
      expect(run).toThrow("native macOS arm64");
      expect(calls).toEqual([]);
    }
    expect(Object.values(inherited).every((value) => value === "fake-sensitive-value")).toBe(true);
  });

  it.each([{ status: 7 }, { status: null }, { error: new Error("cannot start") }])(
    "propagates builder failure %j",
    (result) => {
      const exits: number[] = [];
      const run = (): void => {
        runInNewContext(wrapper, {
          require: Object.assign(() => ({ spawnSync: () => result }), {
            resolve: () => "builder-cli"
          }),
          process: {
            platform: "darwin",
            arch: "arm64",
            execPath: "node",
            env: {},
            exit: (status: number): void => {
              exits.push(status);
            }
          }
        });
      };
      if ("error" in result) expect(run).toThrow(result.error);
      else {
        run();
        expect(exits).toEqual([result.status ?? 1]);
      }
    }
  );

  it("builds first and restricts CI to scoped upstream pushes without credentials or release authority", () => {
    const scripts = nodeRequire(path.resolve("package.json")).scripts;
    expect(scripts["package:mac:archive-test"]).toBe(
      "npm run build:cli && npm run build && node scripts/package-mac-archive-test.cjs"
    );
    expect(scripts["verify:mac:archive-test"]).toBe("node scripts/verify-mac-archive-test.cjs");
    const workflow = parse(fs.readFileSync("../.github/workflows/macos-archive-test.yml", "utf8"));
    expect(Object.keys(workflow.on).sort()).toEqual(["push", "workflow_dispatch"]);
    expect(workflow.on.push.branches).toEqual(["remote-course-v2"]);
    expect(workflow.on.push.paths).toContain("ui/electron-builder.mac-archive-test.cjs");
    expect(workflow.permissions).toEqual({ contents: "read" });
    const job = workflow.jobs["macos-archive-test"];
    expect(job.if).toBe("github.repository == 'msoecsse/graider'");
    expect(job["runs-on"]).toBe("macos-15");
    const source = JSON.stringify(workflow);
    expect(source).not.toMatch(/secrets\.|upload-artifact|gh release|contents:write/);
    expect(source).toContain("npm --prefix ui run verify:mac:archive-test");
    expect(
      job.steps.some(
        (step: { if?: string; name?: string }) =>
          step.if === "always()" && step.name === "Remove loose OAuth fixture"
      )
    ).toBe(true);
  });
});
