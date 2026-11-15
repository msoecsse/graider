/* global process, __dirname, Buffer */
"use strict";
const fs = require("node:fs");
const { join, resolve } = require("node:path");
const { classify, isSigningDiagnostic } = require("./mac-app-signing.cjs");
const {
  appVerificationCategory,
  isAppVerificationDiagnostic
} = require("./verify-macos-signatures.cjs");
const { performance } = require("node:perf_hooks");
const {
  expectedArtifacts,
  resultCategory,
  fileCategory,
  isArtifactDiagnostic
} = require("./mac-production-artifacts.cjs");
const DIAGNOSTIC_PIPE = 3;
const LIFECYCLE_PIPE = 4;
const completion = "stage=builder-artifacts; category=validated";

// Dedicated pipe, never builder stdout/stderr. Only these fixed identifiers may
// cross the subprocess boundary; caught errors are never rendered.
const categories = Object.freeze({
  "builder-initialize": "builder-failure",
  "builder-pack": "builder-failure",
  "builder-sign-prepare": "signing-failure",
  "builder-app-sign": "signing-failure",
  "builder-app-notarize-staple": "notarization-failure",
  "builder-app-verification": "verification-failure",
  "builder-archive": "archive-failure",
  "builder-artifact-validation": "artifact-validation-failure"
});
let currentStage = "builder-initialize";
let signingFailure;
let verificationFailure;
let stageStarted = performance.now();
let durationRecorded = false;
const MINUTE_MS = 60_000;
const durationBuckets = Object.freeze([
  [1, "stage-duration-under-1m"],
  [5, "stage-duration-1m-to-5m"],
  [15, "stage-duration-5m-to-15m"],
  [30, "stage-duration-15m-to-30m"],
  [Infinity, "stage-duration-30m-or-more"]
]);
const finishStage = () => {
  if (!durationRecorded) {
    const minutes = (performance.now() - stageStarted) / MINUTE_MS;
    observation(durationBuckets.find(([limit]) => minutes < limit)[1]);
    durationRecorded = true;
  }
};
const stage = (value) => {
  if (!Object.hasOwn(categories, value)) throw new Error("Invalid builder stage.");
  finishStage();
  currentStage = value;
  signingFailure = undefined;
  verificationFailure = undefined;
  stageStarted = performance.now();
  durationRecorded = false;
  observation("stage-entered");
};
const diagnostic = () =>
  `stage=${currentStage}; category=${signingFailure || verificationFailure || categories[currentStage]}`;
const lifecycleCategories = Object.freeze([
  "stage-entered",
  "promise-started",
  "promise-resolved",
  "promise-rejected",
  "promise-pending-before-exit",
  "premature-exit",
  "uncaught-exception",
  "artifact-validation-started",
  "completion-write-started",
  "completion-written",
  "completion-write-failed",
  "exit-after-record",
  ...durationBuckets.map(([, category]) => category)
]);
const isLifecycle = (value) =>
  typeof value === "string" &&
  (["signing-call-entered", "signing-call-resolved", "signing-call-rejected"].some(
    (category) => value === `stage=builder-app-sign; category=${category}`
  ) ||
    Object.keys(categories).some((name) =>
      lifecycleCategories.some((category) => value === `stage=${name}; category=${category}`)
    ) ||
    ["dmg", "zip"].some(
      (extension) => value === `stage=builder-artifact-${extension}; category=build-completed`
    ));
// Separate from FD3: a successful write observed here can diagnose loss of the
// completion record without ever making this channel acceptance evidence.
const observe = (value) => {
  if (!isLifecycle(value)) throw new Error("Invalid lifecycle observation.");
  try {
    fs.writeSync(LIFECYCLE_PIPE, `${value}\n`);
  } catch {
    // Observations must neither throw during exit nor replace the build result.
  }
};
const observation = (category) => observe(`stage=${currentStage}; category=${category}`);
const signApplication = async (options) => {
  stage("builder-app-sign");
  observation("signing-call-entered");
  try {
    await require("app-builder-lib/out/codeSign/macCodeSign").sign(options);
    observation("signing-call-resolved");
  } catch (error) {
    signingFailure = classify(error);
    observation("signing-call-rejected");
  }
  // Never forward the vendor Error, its native output, properties or cause.
  if (signingFailure) throw new Error("Application signing failed.");
};
const artifactCompleted = (event) => {
  const artifact = expectedArtifacts(resolve(__dirname, "..")).find(
    ({ file }) => event?.file === file
  );
  if (artifact) observe(`stage=builder-artifact-${artifact.extension}; category=build-completed`);
};
const isDiagnostic = (value) =>
  isSigningDiagnostic(value) ||
  isAppVerificationDiagnostic(value) ||
  isArtifactDiagnostic(value) ||
  Object.keys(categories).some((name) =>
    ["promise-pending-before-exit", "premature-exit", "uncaught-exception"].some(
      (category) => value === `stage=${name}; category=${category}`
    )
  ) ||
  Object.entries(categories).some(
    ([name, category]) => value === `stage=${name}; category=${category}`
  );
const build = async () => {
  let pending = true;
  let recorded = false;
  let exitObserved = false;
  const record = (value) => {
    observation("completion-write-started");
    try {
      if (fs.writeSync(DIAGNOSTIC_PIPE, value) !== Buffer.byteLength(value)) {
        throw new Error("Incomplete completion write.");
      }
      recorded = true;
      observation("completion-written");
    } catch {
      observation("completion-write-failed");
      process.exitCode = 1;
    }
  };
  const earlyExit = (category) => {
    if (!recorded && !exitObserved) {
      exitObserved = true;
      finishStage();
      observation(category);
      process.exitCode = 1;
      record(`stage=${currentStage}; category=${category}`);
    }
  };
  // An awaited promise does not keep Node alive. Fail at quiescence instead of
  // letting an unresolved build look like a successful child process. Do not
  // add a keepalive timer: that would hide the defect as a workflow timeout.
  process.once("beforeExit", () => {
    if (pending) earlyExit("promise-pending-before-exit");
  });
  process.once("uncaughtExceptionMonitor", () => earlyExit("uncaught-exception"));
  process.once("exit", () => {
    earlyExit("premature-exit");
    if (recorded) observation("exit-after-record");
  });
  observation("promise-started");
  try {
    const builder = require("electron-builder");
    const produced = await builder.build({
      targets: builder.Platform.MAC.createTarget(["dmg", "zip"], builder.Arch.arm64),
      publish: "never",
      config: join(__dirname, "../electron-builder.mac-production.cjs")
    });
    pending = false;
    finishStage();
    observation("promise-resolved");
    stage("builder-artifact-validation");
    observation("artifact-validation-started");
    const invalid = expectedArtifacts(resolve(__dirname, ".."))
      .map(({ extension, file }) => ({
        extension,
        category: resultCategory(file, produced) || fileCategory(file, fs)
      }))
      .find(({ category }) => category);
    if (invalid) {
      record(`stage=builder-artifact-${invalid.extension}; category=${invalid.category}`);
      process.exitCode = 1;
    } else {
      record(completion);
    }
  } catch (error) {
    if (currentStage === "builder-app-verification")
      verificationFailure = appVerificationCategory(error);
    finishStage();
    if (pending) observation("promise-rejected");
    pending = false;
    record(diagnostic());
    process.exitCode = 1;
  }
};
module.exports = {
  stage,
  signApplication,
  isDiagnostic,
  isLifecycle,
  artifactCompleted,
  build,
  completion
};
if (require.main === module) void build();
