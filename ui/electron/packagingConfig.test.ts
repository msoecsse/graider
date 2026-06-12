import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
  });

  it("builds the bundled CLI before packaging app artifacts", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as {
      readonly scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["build:cli"]).toContain(
      "tsup --config ui/scripts/tsup.graider-cli.config.mjs"
    );
    expect(packageJson.scripts?.package).toContain("npm run build:cli");
    expect(packageJson.scripts?.make).toContain("npm run build:cli");
  });
});
