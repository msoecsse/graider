"use strict";
const fs = require("node:fs");
const { dirname, extname, join, resolve } = require("node:path");

const categories = Object.freeze([
  "missing-artifact",
  "unexpected-artifact-filename",
  "unexpected-output-directory",
  "invalid-artifact-result",
  "artifact-not-regular-file",
  "empty-artifact",
  "artifact-filesystem-failure"
]);
const expectedArtifacts = (ui) => {
  const { version } = require(join(ui, "package.json"));
  return ["dmg", "zip"].map((extension) => ({
    extension,
    file: join(ui, "release/macos-production", `Graider-${version}-mac-arm64-signed.${extension}`)
  }));
};

// Use builder's completed artifact paths, not a directory scan or a fallback
// archive. A stale file is insufficient evidence of this build's completion.
const resultCategory = (expected, produced) => {
  if (!Array.isArray(produced) || produced.some((file) => typeof file !== "string"))
    return "invalid-artifact-result";
  const archives = produced
    .map((file) => resolve(file))
    .filter((file) => extname(file) === extname(expected));
  if (archives.length === 0) return "missing-artifact";
  if (archives.some((file) => dirname(file) !== dirname(expected)))
    return "unexpected-output-directory";
  if (archives.some((file) => file !== expected)) return "unexpected-artifact-filename";
  return undefined;
};

const fileCategory = (file, filesystem = fs) => {
  try {
    // Reject directories and symlinks, including links to nonempty archives.
    const stat = filesystem.lstatSync(file);
    if (!stat.isFile()) return "artifact-not-regular-file";
    if (stat.size === 0) return "empty-artifact";
  } catch (error) {
    return error?.code === "ENOENT" || error?.code === "ENOTDIR"
      ? "missing-artifact"
      : "artifact-filesystem-failure";
  }
  return undefined;
};

const isArtifactDiagnostic = (value) =>
  ["dmg", "zip"].some((extension) =>
    categories.some(
      (category) => value === `stage=builder-artifact-${extension}; category=${category}`
    )
  );

module.exports = { expectedArtifacts, resultCategory, fileCategory, isArtifactDiagnostic };
