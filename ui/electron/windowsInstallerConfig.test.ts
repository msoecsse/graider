import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
const configFile = "electron-builder.windows-installer-test.cjs";

describe("Windows NSIS installer foundation", () => {
  it("validates the NSIS configuration while preserving portable and macOS defaults", async () => {
    const { getConfig, validateConfiguration } = nodeRequire(
      "app-builder-lib/out/util/config/config"
    );
    const configuration = await getConfig(process.cwd(), configFile, {});
    await validateConfiguration(configuration);
    const base = await getConfig(process.cwd(), "electron-builder.config.cjs", {});

    expect(configuration).toMatchObject({
      appId: "edu.graider.ui",
      productName: "Graider",
      publish: null,
      directories: { output: "release/windows-installer-test" },
      win: {
        target: [{ target: "nsis", arch: ["x64"] }],
        artifactName: "Graider-${version}-win-${arch}-unsigned-test-setup.${ext}",
        signExecutable: false,
        verifyUpdateCodeSignature: true
      },
      nsis: {
        oneClick: true,
        perMachine: false,
        differentialPackage: true,
        runAfterFinish: false,
        deleteAppDataOnUninstall: false
      }
    });
    expect(configuration.files).toEqual(base.files);
    expect(configuration.asarUnpack).toEqual(base.asarUnpack);
    expect(configuration.beforePack).toBe(base.beforePack);
    expect(configuration.nsis.guid).toBeUndefined(); // Builder derives identity from appId.
    expect(base.win.target).toEqual([{ target: "portable", arch: ["x64"] }]);
    expect(base.win.artifactName).toBe("Graider.${ext}");
    expect(base.mac.target).toEqual([{ target: "dir", arch: ["arm64"] }]);
  });

  it.each([
    { platform: "win32", arch: "x64", allowed: true },
    { platform: "win32", arch: "arm64", allowed: false },
    { platform: "darwin", arch: "arm64", allowed: false },
    { platform: "linux", arch: "x64", allowed: false }
  ])("restricts packaging to native $platform/$arch: $allowed", ({ platform, arch, allowed }) => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "scripts/package-win-installer-test.cjs"),
      "utf8"
    );
    const signingNames = ["CSC_LINK", "WIN_CSC_LINK", "CSC_KEY_PASSWORD", "WIN_CSC_KEY_PASSWORD"];
    const environment = Object.fromEntries(
      signingNames.map((name) => [name, "fake-signing-value"])
    );
    const calls: {
      executable: string;
      args: string[];
      options: { env: object; shell: boolean };
    }[] = [];
    const exits: number[] = [];
    const mockRequire = Object.assign(
      (name: string): unknown => {
        if (name === "node:child_process") {
          return {
            spawnSync: (
              executable: string,
              args: string[],
              options: (typeof calls)[number]["options"]
            ) => {
              calls.push({ executable, args, options });
              return { status: 0 };
            }
          };
        }
        throw new Error(`Unexpected module: ${name}`);
      },
      { resolve: () => "electron-builder-cli" }
    );
    const run = (): void => {
      runInNewContext(source, {
        require: mockRequire,
        process: {
          platform,
          arch,
          execPath: "native-node",
          env: environment,
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
          executable: "native-node",
          args: [
            "electron-builder-cli",
            "--win",
            "nsis",
            "--x64",
            "--publish",
            "never",
            "--config",
            configFile
          ],
          options: { env: { CSC_IDENTITY_AUTO_DISCOVERY: "false" }, shell: false, stdio: "inherit" }
        }
      ]);
      expect(exits).toEqual([0]);
      expect(Object.values(environment)).toEqual(signingNames.map(() => "fake-signing-value"));
    } else {
      expect(run).toThrow("native Windows x64");
      expect(calls).toEqual([]);
    }
  });

  it("builds before packaging and keeps native validation credential-free and unpublished", () => {
    const packageJson = nodeRequire(path.join(process.cwd(), "package.json"));
    expect(packageJson.scripts["package:win:installer-test"]).toBe(
      "npm run build:cli && npm run build && node scripts/package-win-installer-test.cjs"
    );
    const workflow = parse(
      fs.readFileSync(
        path.join(process.cwd(), "../.github/workflows/windows-installer-test.yml"),
        "utf8"
      )
    );
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.on.push.branches).toEqual(["remote-course-v2"]);
    const job = workflow.jobs["windows-installer-test"];
    expect(job["runs-on"]).toBe("windows-latest");
    const packaging = job.steps.find(
      (step: { run?: string }) => step.run === "npm --prefix ui run package:win:installer-test"
    );
    expect(packaging.env).toEqual({
      GRAIDER_GITHUB_OAUTH_CLIENT_SECRET: "ci-only-nonfunctional-nsis-test"
    });
    const workflowSource = JSON.stringify(workflow);
    expect(workflowSource).not.toContain("secrets.");
    expect(workflowSource).not.toContain("upload-artifact");
    expect(workflowSource).toContain("verify-packaged-dugite.cjs");
    expect(workflowSource).toContain("Get-AuthenticodeSignature");
    expect(workflowSource).toContain("Uninstall Graider.exe");
  });

  it("fails packaging when builder fails, is terminated or cannot start", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "scripts/package-win-installer-test.cjs"),
      "utf8"
    );
    const failedBuildStatus = 7;
    const unavailableBuilder = new Error("Builder unavailable");
    for (const result of [
      { status: failedBuildStatus },
      { status: null },
      { error: unavailableBuilder }
    ]) {
      const exits: number[] = [];
      const run = (): void => {
        runInNewContext(source, {
          require: Object.assign(() => ({ spawnSync: () => result }), {
            resolve: () => "electron-builder-cli"
          }),
          process: {
            platform: "win32",
            arch: "x64",
            execPath: "native-node",
            env: {},
            exit: (status: number): void => {
              exits.push(status);
            }
          }
        });
      };
      if ("error" in result) {
        expect(run).toThrow(unavailableBuilder);
        expect(exits).toEqual([]);
      } else {
        run();
        expect(exits).toEqual([result.status ?? 1]);
      }
    }
  });
});
