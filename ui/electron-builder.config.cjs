/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "edu.graider.ui",
  productName: "Graider",
  directories: {
    output: "release"
  },
  files: [
    "dist/**/*",
    "dist-electron/**/*",
    "dist-graider-cli/**/*",
    "package.json",
    "!dist-electron/**/*.test.js",
    "!dist-electron/**/*.test.js.map",
    "!dist-electron/**/*.test.d.ts"
  ],
  mac: {
    category: "public.app-category.education",
    target: [{ target: "dir", arch: ["arm64"] }]
  },
  win: {
    target: [{ target: "portable", arch: ["x64"] }],
    artifactName: "Graider.${ext}",
    signExecutable: false
  },
  dmg: {
    sign: false
  },
  asar: true,
  asarUnpack: ["dist-graider-cli/**/*"]
};
