"use strict";

const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const target = process.argv[2];
const targetDetails = {
  mac: {
    platform: "darwin",
    architecture: "arm64",
    executables: [
      join("release", "mac-arm64", "Graider.app", "Contents", "MacOS", "Graider"),
      join("release", "mac", "Graider.app", "Contents", "MacOS", "Graider")
    ],
    resourcesFor: (executable) => resolve(executable, "..", "..", "Resources")
  },
  win: {
    platform: "win32",
    architecture: "x64",
    executables: [join("release", "win-unpacked", "Graider.exe")],
    resourcesFor: (executable) => join(resolve(executable, ".."), "resources")
  }
};
const selected = targetDetails[target];

if (selected === undefined) {
  throw new Error("Expected a packaged Git proof target of mac or win.");
}
if (process.platform !== selected.platform || process.arch !== selected.architecture) {
  throw new Error(
    `The ${target} packaged Git proof must run on native ${selected.platform}/${selected.architecture}.`
  );
}

const executable = selected.executables.map((candidate) => resolve(candidate)).find(existsSync);
if (executable === undefined) {
  throw new Error(`Could not locate the packaged ${target} Graider executable.`);
}

const resourcesDirectory = selected.resourcesFor(executable);
const proofScript = resolve(__dirname, "verify-packaged-dugite.cjs");
const liveArguments = process.argv.slice(3).filter((argument) => argument === "--live-private");
const result = spawnSync(
  executable,
  [proofScript, "--resources", resourcesDirectory, ...liveArguments],
  {
    cwd: resolve(__dirname, ".."),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    shell: false,
    stdio: "inherit"
  }
);

if (result.error != null) {
  throw result.error;
}
process.exit(result.status ?? 1);
