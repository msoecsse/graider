const base = require("./electron-builder.config.cjs");

/** @type {import("electron-builder").Configuration} */
module.exports = {
  ...base,
  // Builder normalizes file filters in place; keep the shared config independent.
  files: [...base.files],
  directories: { ...base.directories, output: "release/windows-installer-test" },
  // Do not infer a feed from repository metadata or CI credentials.
  publish: null,
  win: {
    ...base.win,
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
};
