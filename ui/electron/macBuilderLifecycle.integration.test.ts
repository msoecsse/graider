// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ui = process.cwd();
const nodeRequire = createRequire(path.join(ui, "package.json"));
const wrapper = nodeRequire("./scripts/package-mac-production.cjs");
const completion = "stage=builder-artifacts; category=validated";
const CHILD_TIMEOUT_MS = 30_000;
const PACKAGING_TIMEOUT_MS = 180_000;
const stdio = ["ignore", "pipe", "pipe", "pipe", "pipe"] as const;
// No ambient credentials, NODE_OPTIONS, signing/debug/publishing overrides.
const environment = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "SystemRoot", "TEMP", "TMP"]
    .filter((name) => process.env[name])
    .map((name) => [name, process.env[name]!])
);

function fixture() {
  const root = fs.mkdtempSync(path.join(tmpdir(), "graider builder lifecycle "));
  const scripts = path.join(root, "scripts");
  fs.mkdirSync(scripts);
  for (const name of ["mac-production-builder.cjs", "mac-production-artifacts.cjs"])
    fs.copyFileSync(path.join(ui, "scripts", name), path.join(scripts, name));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      version: "1.0.0",
      main: "index.js",
      description: "fixture",
      author: "fixture"
    })
  );
  fs.writeFileSync(path.join(root, "index.js"), "void 0;\n");
  fs.symlinkSync(path.join(ui, "node_modules"), path.join(root, "node_modules"), "junction");
  const output = path.join(root, "release", "macos-production");
  const artifacts = ["dmg", "zip"].map((extension) =>
    path.join(output, `Graider-1.0.0-mac-arm64-signed.${extension}`)
  );
  const worker = path.join(scripts, "mac-production-builder.cjs");
  return { root, worker, output, artifacts };
}

function lifecycleChild(
  scenario: string,
  options: { closeRecordPipe?: boolean; closeObservationPipe?: boolean } = {}
) {
  const test = fixture();
  try {
    fs.mkdirSync(test.output, { recursive: true });
    for (const file of test.artifacts) fs.writeFileSync(file, "fixture archive");
    const code = `
      const fs = require('node:fs');
      const { createRequire } = require('node:module');
      const fixtureRequire = createRequire(${JSON.stringify(test.worker)});
      const builderPath = fixtureRequire.resolve('electron-builder');
      const builder = fixtureRequire('electron-builder');
      const worker = require(${JSON.stringify(test.worker)});
      require.cache[builderPath].exports = { ...builder, build: async () => {
        worker.stage('builder-archive');
        ${scenario}
      }};
      ${options.closeRecordPipe ? "fs.closeSync(3);" : ""}
      ${options.closeObservationPipe ? "fs.closeSync(4);" : ""}
      void worker.build();
    `;
    const result = spawnSync(process.execPath, ["-e", code], {
      cwd: test.root,
      env: environment,
      stdio: [...stdio],
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    return result;
  } finally {
    fs.rmSync(test.root, { recursive: true, force: true });
  }
}

describe("real Node builder subprocess lifecycle", () => {
  it.each([completion, "stage=builder-pack; category=builder-failure"])(
    "delivers an exact FD3 record with the original four stdio descriptors: %s",
    (record) => {
      expect(process.versions.node.split(".")[0]).toBe("24");
      const result = spawnSync(
        process.execPath,
        ["-e", `require('node:fs').writeSync(3, ${JSON.stringify(record)})`],
        {
          env: environment,
          stdio: ["ignore", "pipe", "pipe", "pipe"],
          encoding: "utf8",
          timeout: CHILD_TIMEOUT_MS
        }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.output[3]).toBe(record);
    }
  );

  it("reproduces Node's silent zero exit for a pending promise with no handles", () => {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        "void (async () => { await new Promise(() => {}); require('node:fs').writeSync(3, 'unreachable'); })();"
      ],
      {
        env: environment,
        stdio: [...stdio],
        encoding: "utf8",
        timeout: CHILD_TIMEOUT_MS
      }
    );
    expect(result.status).toBe(0);
    expect(result.output[3]).toBe("");
    const guarded = lifecycleChild("return await new Promise(() => {});");
    expect(guarded.status).toBe(1);
    expect(guarded.output[3]).toBe("stage=builder-archive; category=promise-pending-before-exit");
    expect(guarded.output[4]).toContain("category=promise-pending-before-exit\n");
    expect(guarded.output[4]?.match(/category=completion-written/g)).toHaveLength(1);
  });

  it("distinguishes explicit exit from event-loop quiescence", () => {
    const result = lifecycleChild("process.exit(0);");
    expect(result.status).toBe(1);
    expect(result.output[3]).toBe("stage=builder-archive; category=premature-exit");
    expect(result.output[4]).not.toContain("category=promise-pending-before-exit");
  });

  it("observes an uncaught exception without intercepting Node's failure handling", () => {
    const result = lifecycleChild(
      "setImmediate(() => { throw new Error('private exception'); }); return await new Promise(() => {});"
    );
    expect(result.status).toBe(1);
    expect(result.output[3]).toBe("stage=builder-archive; category=uncaught-exception");
    expect(result.output[4]).not.toContain("category=promise-pending-before-exit");
  });

  it("records rejection without serializing caught errors or native output", () => {
    const result = lifecycleChild(
      "console.error('private native output'); throw new Error('credential certificate argv path');"
    );
    expect(result.status).toBe(1);
    expect(result.output[3]).toBe("stage=builder-archive; category=archive-failure");
    expect(result.output[4]).toContain("category=promise-rejected\n");
    expect(String(result.output[3]) + String(result.output[4])).not.toMatch(
      /credential|certificate|argv|path|private/
    );
  });

  it("distinguishes resolved-without-artifacts from validation failure", () => {
    const result = lifecycleChild("return [];");
    expect(result.status).toBe(1);
    expect(result.output[3]).toBe("stage=builder-artifact-dmg; category=missing-artifact");
    expect(result.output[4]).toContain("category=promise-resolved\n");
    expect(result.output[4]).not.toContain("category=promise-rejected");
    const invalid = lifecycleChild(
      "const files = require('./scripts/mac-production-artifacts.cjs').expectedArtifacts(process.cwd()).map(({ file }) => file); fs.truncateSync(files[1]); return files;"
    );
    expect(invalid.output[3]).toBe("stage=builder-artifact-zip; category=empty-artifact");
  });

  it("requires real nonempty files and a resolved builder before writing success", () => {
    const result = lifecycleChild(
      "return require('./scripts/mac-production-artifacts.cjs').expectedArtifacts(process.cwd()).map(({ file }) => file);"
    );
    expect(result.status).toBe(0);
    expect(result.output[3]).toBe(completion);
    expect(result.output[4]).toContain("category=promise-resolved\n");
    expect(result.output[4]).toContain("category=completion-written\n");
    expect(result.output[4]).toContain("category=exit-after-record\n");
  });

  it("fails closed if FD3 is unavailable, with independent write-failure evidence", () => {
    const result = lifecycleChild("return [];", { closeRecordPipe: true });
    expect(result.status).toBe(1);
    expect(result.output[3]).toBe("");
    expect(result.output[4]).toContain("category=completion-write-failed\n");
  });

  it("does not let a missing observation pipe replace the original failure", () => {
    const result = lifecycleChild("throw new Error('private');", { closeObservationPipe: true });
    expect(result.status).toBe(1);
    expect(result.output[3]).toBe("stage=builder-archive; category=archive-failure");
  });

  it("the real wrapper accepts only exact success and never exposes child stdout/stderr", () => {
    const invoke = (record: string, extra = "") =>
      wrapper.run(
        process.execPath,
        [
          "-e",
          `
      console.log('private native stdout'); console.error('private native stderr');
      require('node:fs').writeSync(3, ${JSON.stringify(record)}); ${extra}
    `
        ],
        environment,
        "builder-sign-notarize-archive"
      );
    expect(() => invoke(completion)).not.toThrow();
    for (const record of [
      "",
      completion + "\nprivate",
      "stage=builder-archive; category=archive-failure"
    ])
      expect(() => invoke(record)).toThrow(
        record.startsWith("stage=builder-archive") ? record : "missing-completion-evidence"
      );
    expect(() => invoke(completion, "process.exitCode = 1;")).toThrow("command-exit-failure");
    // Windows implements self-signals as forced termination with different
    // status reporting. Existing injected-result tests cover that parent gate.
    if (process.platform !== "win32")
      expect(() => invoke(completion, "process.kill(process.pid, 'SIGTERM');")).toThrow(
        "command-terminated"
      );
    expect(() =>
      invoke(
        "",
        "require('node:fs').writeSync(4, 'stage=builder-archive; category=completion-written\\n');"
      )
    ).toThrow("completion-record-not-received");
    for (const observation of [
      "stage=builder-archive; category=completion-written\nprivate path\n",
      "stage=builder-archive; category=completion-written",
      "private credential output\n"
    ]) {
      try {
        invoke("", `require('node:fs').writeSync(4, ${JSON.stringify(observation)});`);
        expect.fail("Missing completion must fail.");
      } catch (error) {
        expect(wrapper.diagnostic(error)).toBe(
          "stage=builder-sign-notarize-archive; category=missing-completion-evidence"
        );
      }
    }
    try {
      invoke("");
    } catch (error) {
      expect(wrapper.diagnostic(error)).not.toContain("private");
    }
  });
});

// hdiutil and native macOS packaging are unavailable on Windows/Linux. Run in
// the existing macOS CI job; no signing identity or notarization service is used.
it.runIf(process.platform === "darwin" && process.arch === "arm64")(
  "installed electron-builder packages a credential-free app and completes real DMG/ZIP artifacts",
  () => {
    const test = fixture();
    try {
      fs.writeFileSync(
        path.join(test.root, "electron-builder.mac-production.cjs"),
        `
        const worker = require('./scripts/mac-production-builder.cjs');
        module.exports = {
          appId: 'test.graider.lifecycle', productName: 'Graider', publish: null,
          electronVersion: require(${JSON.stringify(nodeRequire.resolve("electron/package.json"))}).version,
          electronDist: ${JSON.stringify(path.join(path.dirname(nodeRequire.resolve("electron/package.json")), "dist"))},
          npmRebuild: false, files: ['index.js', 'package.json'],
          directories: { output: 'release/macos-production' },
          mac: { identity: null, artifactName: ${JSON.stringify("Graider-${version}-mac-${arch}-signed.${ext}")} },
          dmg: { sign: false, writeUpdateInfo: false, background: null },
          beforePack: () => worker.stage('builder-pack'),
          afterPack: () => worker.stage('builder-archive'),
          artifactBuildCompleted: worker.artifactCompleted
        };
      `
      );
      const result = spawnSync(process.execPath, [test.worker], {
        cwd: test.root,
        env: { ...environment, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
        stdio: [...stdio],
        encoding: "utf8",
        timeout: PACKAGING_TIMEOUT_MS
      });
      expect(result.error).toBeUndefined();
      expect(result.status, String(result.output[3]) + String(result.output[4])).toBe(0);
      expect(result.output[3]).toBe(completion);
      for (const extension of ["dmg", "zip"])
        expect(result.output[4]).toContain(
          `stage=builder-artifact-${extension}; category=build-completed\n`
        );
      expect(result.output[4]).toContain("category=promise-resolved\n");
      for (const file of test.artifacts) expect(fs.statSync(file).size).toBeGreaterThan(0);
    } finally {
      fs.rmSync(test.root, { recursive: true, force: true });
    }
  },
  PACKAGING_TIMEOUT_MS
);
