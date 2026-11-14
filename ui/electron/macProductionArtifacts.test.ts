import fs from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

const nodeRequire = createRequire(path.resolve("package.json"));
const artifacts = nodeRequire("./scripts/mac-production-artifacts.cjs");

describe("production artifact provenance", () => {
  it("uses the installed builder targets, path expansion, completion events and build result", async () => {
    const builder = nodeRequire("electron-builder");
    const { Packager, MacPackager } = nodeRequire("app-builder-lib");
    const testEnvironment = {
      GRAIDER_MAC_CERT_SHA1: "A".repeat(40),
      GRAIDER_APPLE_TEAM_ID: "FAKETEAM01",
      GRAIDER_GITHUB_OAUTH_CLIENT_SECRET: "fake-oauth",
      CSC_KEYCHAIN: "fake-keychain",
      APPLE_API_KEY: "fake-p8",
      APPLE_API_KEY_ID: "FAKEKEY001",
      APPLE_API_ISSUER: "00000000-0000-0000-0000-000000000000"
    };
    for (const [name, value] of Object.entries(testEnvironment)) vi.stubEnv(name, value);
    // Run installed doBuild on every host with the native-host gate isolated.
    const file = nodeRequire.resolve("app-builder-lib/out/packager");
    const localRequire = createRequire(file);
    const exports = {} as any;
    runInNewContext(fs.readFileSync(file, "utf8"), {
      exports,
      process: { ...process, platform: "darwin" },
      require: localRequire
    });
    const packager = new Packager({
      targets: builder.Platform.MAC.createTarget(["dmg", "zip"], builder.Arch.arm64),
      config: path.resolve("electron-builder.mac-production.cjs")
    });
    const completed: { file: string; target: { name: string }; arch: number }[] = [];
    const customized: string[] = [];
    const archived: string[] = [];
    const dmgUtil = nodeRequire("dmg-builder/out/dmgUtil");
    const dmgLicense = nodeRequire("dmg-builder/out/dmgLicense");
    const archive = nodeRequire("app-builder-lib/out/targets/archive");
    const differential = nodeRequire("app-builder-lib/out/targets/differentialUpdateInfoBuilder");
    const { DmgTarget } = nodeRequire("dmg-builder/out/dmg");
    vi.spyOn(DmgTarget.prototype, "computeDmgOptions").mockResolvedValue({});
    vi.spyOn(dmgLicense, "addLicenseToDmg").mockResolvedValue(null);
    vi.spyOn(dmgUtil, "customizeDmg").mockImplementation(async (...args: unknown[]) => {
      customized.push((args[0] as { artifactPath: string }).artifactPath);
      return true;
    });
    vi.spyOn(archive, "archive").mockImplementation(async (...args: unknown[]) => {
      archived.push(args[1] as string);
    });
    vi.spyOn(differential, "createBlockmap").mockResolvedValue(null);
    try {
      await packager.validateConfig();
      // Public build initializes app/framework info before createHelper is used.
      const expected = artifacts.expectedArtifacts(process.cwd());
      vi.spyOn(packager, "createHelper").mockImplementation(async () => {
        const helper = new MacPackager(packager);
        vi.spyOn(helper, "pack").mockImplementation(async (...args: unknown[]) => {
          const [outDir, arch, targets, tasks] = args;
          helper.packageInDistributableFormat(
            path.join(helper.computeAppOutDir(outDir, arch), "Graider.app"),
            arch,
            targets,
            tasks
          );
        });
        return helper;
      });
      packager.eventEmitter.on("artifactBuildCompleted", (event: (typeof completed)[number]) => {
        completed.push(event);
      });
      vi.spyOn(packager, "doBuild").mockImplementation(() =>
        exports.Packager.prototype.doBuild.call(packager)
      );
      const result = await nodeRequire("app-builder-lib").build({ publish: "never" }, packager);
      expect([...packager.options.targets.get(builder.Platform.MAC)]).toEqual([
        [builder.Arch.arm64, ["dmg", "zip"]]
      ]);
      expect(customized).toEqual([expected[0].file]);
      expect(archived).toEqual([expected[1].file]);
      expect(completed.map((event) => [event.target.name, event.arch, event.file]).sort()).toEqual(
        expected
          .map(({ extension, file }: { extension: string; file: string }) => [
            extension,
            builder.Arch.arm64,
            file
          ])
          .sort()
      );
      expect(result.sort()).toEqual(expected.map(({ file }: { file: string }) => file).sort());
      for (const { file } of expected)
        expect(artifacts.resultCategory(file, result)).toBeUndefined();
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      packager.clearPackagerEventListeners();
    }
  });

  it("checks real files without accepting empty archives, directories or symlinks", () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "graider artifact validation "));
    try {
      const image = path.join(root, "fixture.dmg");
      expect(artifacts.fileCategory(image)).toBe("missing-artifact");
      fs.writeFileSync(image, "");
      expect(artifacts.fileCategory(image)).toBe("empty-artifact");
      fs.writeFileSync(image, "fixture");
      expect(artifacts.fileCategory(image)).toBeUndefined();
      expect(artifacts.fileCategory(root)).toBe("artifact-not-regular-file");
      // Windows junction creation needs no symlink privilege.
      const link = path.join(root, "link.dmg");
      fs.symlinkSync(root, link, "junction");
      expect(artifacts.fileCategory(link)).toBe("artifact-not-regular-file");
      expect(artifacts.fileCategory(path.join(image, "nested"))).toBe("missing-artifact");
      expect(
        artifacts.fileCategory(image, {
          lstatSync: () => {
            throw Object.assign(new Error("private path"), { code: "EACCES" });
          }
        })
      ).toBe("artifact-filesystem-failure");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires current completion evidence even when a stale expected file exists", () => {
    const [{ file }] = artifacts.expectedArtifacts(process.cwd());
    expect(artifacts.resultCategory(file, [])).toBe("missing-artifact");
    expect(artifacts.resultCategory(file, [file])).toBeUndefined();
    expect(artifacts.resultCategory(file, [file + ".blockmap"])).toBe("missing-artifact");
    expect(artifacts.resultCategory(file, [path.join(path.dirname(file), "private.dmg")])).toBe(
      "unexpected-artifact-filename"
    );
    expect(artifacts.resultCategory(file, [path.join(tmpdir(), path.basename(file))])).toBe(
      "unexpected-output-directory"
    );
    expect(artifacts.resultCategory(file, [{ file }])).toBe("invalid-artifact-result");
  });

  it("keeps native inspection failure separate from missing artifact", () => {
    const module = { exports: {} as any };
    runInNewContext(fs.readFileSync("scripts/package-mac-production.cjs", "utf8"), {
      module,
      __dirname: path.resolve("scripts"),
      process,
      require: (name: string) =>
        name === "node:child_process"
          ? { spawnSync: () => ({ status: 1, stderr: "private image: No such file or directory" }) }
          : createRequire(path.resolve("scripts/package-mac-production.cjs"))(name)
    });
    expect(() => module.exports.run("/usr/bin/hdiutil", [], {}, "dmg-format-inspection")).toThrow(
      "stage=dmg-format-inspection; category=image-inspection-failure"
    );
  });

  it.each([
    undefined,
    "",
    "private path",
    "stage=builder-artifacts; category=validated\nprivate",
    "stage=builder-artifacts; category=validated"
  ])("requires exact completion evidence with a zero builder exit: %s", (detail) => {
    const module = { exports: {} as any };
    const scriptRequire = createRequire(path.resolve("scripts/package-mac-production.cjs"));
    runInNewContext(fs.readFileSync("scripts/package-mac-production.cjs", "utf8"), {
      module,
      __dirname: path.resolve("scripts"),
      process,
      require: (name: string) =>
        name === "node:child_process"
          ? { spawnSync: () => ({ status: 0, output: [null, "", "", detail] }) }
          : scriptRequire(name)
    });
    const execute = () => module.exports.run("node", [], {}, "builder-sign-notarize-archive");
    if (detail === "stage=builder-artifacts; category=validated") expect(execute).not.toThrow();
    else
      expect(execute).toThrow(
        "stage=builder-sign-notarize-archive; category=missing-completion-evidence"
      );
  });

  it("pauses Windows only for development pushes and preserves release gates", () => {
    const workflow = parse(fs.readFileSync("../.github/workflows/ci.yml", "utf8"));
    expect(workflow.on.push.branches).toEqual(
      expect.arrayContaining(["master", "release/**", "remote-course-v2"])
    );
    for (const name of ["grading-cache-safety", "migration-regression"]) {
      const job = workflow.jobs[name];
      expect(job.needs).toBeUndefined();
      const expression = job.strategy.matrix.include.slice(3, -2);
      for (const [event_name, ref, targets] of [
        ["push", "refs/heads/remote-course-v2", ["macOS arm64"]],
        ["push", "refs/heads/master", ["macOS arm64", "Windows x64"]],
        ["push", "refs/heads/release/1.0", ["macOS arm64", "Windows x64"]],
        ["pull_request", "refs/pull/1/merge", ["macOS arm64", "Windows x64"]]
      ] as const) {
        const rows = runInNewContext(expression, {
          fromJSON: JSON.parse,
          github: { event_name, ref }
        });
        expect(rows.map((row: { target: string }) => row.target)).toEqual(targets);
      }
    }
    expect(workflow.jobs["normal-checks"].needs).toBeUndefined();
    const signing = parse(
      fs.readFileSync("../.github/workflows/macos-production-signing.yml", "utf8")
    );
    const command = signing.jobs.signing.steps.find(
      (step: { name?: string }) =>
        step.name === "Test signing and existing packaging paths without credentials"
    ).run;
    expect(command).not.toContain("windowsInstallerConfig");
    expect(command).toContain("macProductionArtifacts.test.ts");
    expect(command).toContain("packagingConfig.test.ts");
  });
});
