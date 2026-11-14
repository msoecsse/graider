/* global process, __dirname */
"use strict";
const fs = require("node:fs");
const { join, resolve } = require("node:path");
const {
  expectedArtifacts,
  resultCategory,
  fileCategory,
  isArtifactDiagnostic
} = require("./mac-production-artifacts.cjs");
const DIAGNOSTIC_PIPE = 3;
const completion = "stage=builder-artifacts; category=validated";

// Dedicated pipe, never builder stdout/stderr. Only these fixed identifiers may
// cross the subprocess boundary; caught errors are never inspected or rendered.
const categories = Object.freeze({
  "builder-initialize": "builder-failure",
  "builder-pack": "builder-failure",
  "builder-app-sign": "signing-failure",
  "builder-app-notarize-staple": "notarization-failure",
  "builder-app-verification": "verification-failure",
  "builder-archive": "archive-failure"
});
let currentStage = "builder-initialize";
const stage = (value) => {
  if (!Object.hasOwn(categories, value)) throw new Error("Invalid builder stage.");
  currentStage = value;
};
const diagnostic = () => `stage=${currentStage}; category=${categories[currentStage]}`;
const isDiagnostic = (value) =>
  isArtifactDiagnostic(value) ||
  Object.entries(categories).some(
    ([name, category]) => value === `stage=${name}; category=${category}`
  );
const build = async () => {
  try {
    const builder = require("electron-builder");
    const produced = await builder.build({
      targets: builder.Platform.MAC.createTarget(["dmg", "zip"], builder.Arch.arm64),
      publish: "never",
      config: join(__dirname, "../electron-builder.mac-production.cjs")
    });
    const invalid = expectedArtifacts(resolve(__dirname, ".."))
      .map(({ extension, file }) => ({
        extension,
        category: resultCategory(file, produced) || fileCategory(file, fs)
      }))
      .find(({ category }) => category);
    if (invalid) {
      fs.writeSync(
        DIAGNOSTIC_PIPE,
        `stage=builder-artifact-${invalid.extension}; category=${invalid.category}`
      );
      process.exitCode = 1;
    } else {
      fs.writeSync(DIAGNOSTIC_PIPE, completion);
    }
  } catch {
    fs.writeSync(DIAGNOSTIC_PIPE, diagnostic());
    process.exitCode = 1;
  }
};
module.exports = { stage, isDiagnostic, build, completion };
if (require.main === module) void build();
