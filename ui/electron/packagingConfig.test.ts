import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
const { getConfig, validateConfiguration } = nodeRequire(
  "app-builder-lib/out/util/config/config"
) as {
  getConfig: (
    projectDir: string,
    configPath: string,
    configFromOptions: Record<string, unknown>
  ) => Promise<{ win?: { signExecutable?: boolean } }>;
  validateConfiguration: (configuration: object) => Promise<void>;
};

describe("packaging configuration", () => {
  it("builds renderer assets with relative paths for file loading", () => {
    const viteConfigSource = fs.readFileSync(path.join(process.cwd(), "vite.config.ts"), "utf8");

    expect(viteConfigSource).toContain('PRODUCTION_ASSET_BASE = "./"');
    expect(viteConfigSource).toContain("base: PRODUCTION_ASSET_BASE");
  });

  it("includes production renderer, Electron output, and bundled CLI in the packaged app", () => {
    const packagingConfigSource = fs.readFileSync(
      path.join(process.cwd(), "electron-builder.config.cjs"),
      "utf8"
    );

    expect(packagingConfigSource).toContain('"dist/**/*"');
    expect(packagingConfigSource).toContain('"dist-electron/**/*"');
    expect(packagingConfigSource).toContain('"dist-graider-cli/**/*"');
    expect(packagingConfigSource).toContain('"package.json"');
    expect(packagingConfigSource).toContain('"dist-graider-cli/**/*"');
    expect(packagingConfigSource).toContain('"node_modules/dugite/git/**/*"');
  });

  it("builds the bundled CLI before packaging app artifacts", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as {
      readonly scripts?: Record<string, string>;
      readonly dependencies?: Record<string, string>;
      readonly allowScripts?: Record<string, boolean>;
    };

    expect(packageJson.dependencies?.dugite).toBe("3.2.3");
    expect(packageJson.allowScripts?.["dugite@3.2.3"]).toBe(true);
    expect(packageJson.scripts?.["build:cli"]).toContain(
      "tsup --config ui/scripts/tsup.graider-cli.config.mjs"
    );
    const genericPackageCommand =
      "npm run build:cli && npm run build && electron-builder --config electron-builder.config.cjs";
    const macPackageCommand =
      "npm run build:cli && npm run build && electron-builder --mac dir --arm64 --config electron-builder.config.cjs";
    expect(packageJson.scripts?.package).toBe(genericPackageCommand);
    expect(packageJson.scripts?.package).not.toContain("--mac");
    expect(packageJson.scripts?.package).not.toContain("--win");
    expect(packageJson.scripts?.["package:mac"]).toBe(macPackageCommand);
    expect(packageJson.scripts?.["package:mac"]).not.toContain("--win");
    expect(packageJson.scripts?.["package:win"]).toBe(
      "npm run build:cli && npm run build && node scripts/package-win.cjs"
    );
    expect(packageJson.scripts?.["package:win"]).not.toContain("--mac");
    expect(packageJson.scripts?.["package:git-proof:mac"]).toBe(
      "npm run build:cli && npm run build && node scripts/package-git-proof.cjs mac"
    );
    expect(packageJson.scripts?.["package:git-proof:win"]).toBe(
      "npm run build:cli && npm run build && node scripts/package-git-proof.cjs win"
    );
    expect(packageJson.scripts?.["verify:git-proof:mac"]).toBe(
      "node scripts/run-packaged-dugite-proof.cjs mac"
    );
    expect(packageJson.scripts?.["verify:git-proof:win"]).toBe(
      "node scripts/run-packaged-dugite-proof.cjs win"
    );
    expect(packageJson.scripts?.["release:rc1"]).toContain("npm run package:mac");
    expect(packageJson.scripts?.make).toContain("npm run build:cli");
  });

  it("keeps the packaged Dugite proof outside production application behavior", () => {
    const proofSource = fs.readFileSync(
      path.join(process.cwd(), "scripts", "verify-packaged-dugite.cjs"),
      "utf8"
    );
    const runnerSource = fs.readFileSync(
      path.join(process.cwd(), "scripts", "run-packaged-dugite-proof.cjs"),
      "utf8"
    );

    expect(runnerSource).toContain('ELECTRON_RUN_AS_NODE: "1"');
    expect(runnerSource).toContain("const result = spawnSync(");
    expect(runnerSource).toContain('[proofScript, "--resources", resourcesDirectory');
    expect(runnerSource).toContain("shell: false");
    expect(proofSource).toContain(
      'createRequire(join(resourcesDirectory, "app.asar", "package.json"))'
    );
    expect(proofSource).toContain("app.asar.unpacked");
    expect(proofSource).toContain('PATH: ""');
    expect(proofSource).toContain("PACKAGED_DUGITE_PROOF_OK");
  });

  it("packages explicit macOS and unsigned Windows x64 portable targets", () => {
    const packagingConfigSource = fs.readFileSync(
      path.join(process.cwd(), "electron-builder.config.cjs"),
      "utf8"
    );

    expect(packagingConfigSource).toContain('target: [{ target: "dir", arch: ["arm64"] }]');
    expect(packagingConfigSource).toContain('target: [{ target: "portable", arch: ["x64"] }]');
    expect(packagingConfigSource).toContain('artifactName: "Graider.${ext}"');
    expect(packagingConfigSource).toContain("signExecutable: false");
    expect(packagingConfigSource).not.toContain("signAndEditExecutable: false");
  });

  it("resolves the CLI Windows signing override as false", async () => {
    const configuration = await getConfig(process.cwd(), "electron-builder.config.cjs", {
      win: { signExecutable: "false" }
    });

    await validateConfiguration(configuration);
    expect(configuration.win?.signExecutable).toBe(false);
  });

  it("runs the Windows portable build unsigned even when the shell has signing credentials", () => {
    const packageWindowsSource = fs.readFileSync(
      path.join(process.cwd(), "scripts", "package-win.cjs"),
      "utf8"
    );

    expect(packageWindowsSource).toContain("delete environment[name]");
    expect(packageWindowsSource).toContain('"CSC_LINK"');
    expect(packageWindowsSource).toContain('"WIN_CSC_LINK"');
    expect(packageWindowsSource).toContain('"CSC_KEY_PASSWORD"');
    expect(packageWindowsSource).toContain('"WIN_CSC_KEY_PASSWORD"');
    expect(packageWindowsSource).toContain('"--win"');
    expect(packageWindowsSource).toContain('"portable"');
    expect(packageWindowsSource).toContain('"--x64"');
    expect(packageWindowsSource).toContain('"--publish"');
    expect(packageWindowsSource).toContain('"never"');
    expect(packageWindowsSource).toContain('"--config.win.signExecutable=false"');
    expect(packageWindowsSource).not.toContain("signAndEditExecutable");
  });
});
