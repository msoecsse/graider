const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const UI_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(UI_ROOT, "..");
const RELEASE_ROOT = path.join(UI_ROOT, "release");
const DIST_RELEASE_ROOT = path.join(UI_ROOT, "dist-release");
const RC_FOLDER_NAME = "Graider-RC1";
const RC_FOLDER = path.join(DIST_RELEASE_ROOT, RC_FOLDER_NAME);
const RC_ZIP = path.join(DIST_RELEASE_ROOT, "Graider-macOS-RC1.zip");
const RC_DOC_SOURCE = path.join(REPO_ROOT, "docs", "release", "rc1");
const REQUIRED_DOCS = [
  "README-Start-Here.md",
  "FACULTY-SMOKE-TEST.md",
  "KNOWN-ISSUES.md"
];
const APP_NAME = "Graider.app";
const MAC_RELEASE_DIRECTORIES = ["mac-arm64", "mac", "mac-x64"];

const findPackagedApp = () => {
  const candidates = MAC_RELEASE_DIRECTORIES.map((directoryName) =>
    path.join(RELEASE_ROOT, directoryName, APP_NAME)
  );

  return candidates.find((candidate) => fs.existsSync(candidate));
};

const ensureRequiredDocs = () => {
  for (const docName of REQUIRED_DOCS) {
    const docPath = path.join(RC_DOC_SOURCE, docName);

    if (!fs.existsSync(docPath)) {
      throw new Error(`Missing RC document: ${docPath}`);
    }
  }
};

const copyRequiredDocs = () => {
  for (const docName of REQUIRED_DOCS) {
    fs.copyFileSync(path.join(RC_DOC_SOURCE, docName), path.join(RC_FOLDER, docName));
  }
};

const packagedApp = findPackagedApp();

if (packagedApp === undefined) {
  throw new Error(
    `Could not locate ${APP_NAME} under ${RELEASE_ROOT}. Run npm run package and confirm electron-builder output.`
  );
}

ensureRequiredDocs();
fs.rmSync(RC_FOLDER, { recursive: true, force: true });
fs.rmSync(RC_ZIP, { force: true });
fs.mkdirSync(RC_FOLDER, { recursive: true });
fs.cpSync(packagedApp, path.join(RC_FOLDER, APP_NAME), { recursive: true });
copyRequiredDocs();
execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", RC_FOLDER_NAME, RC_ZIP], {
  cwd: DIST_RELEASE_ROOT,
  stdio: "inherit"
});

console.log(`Created RC folder: ${RC_FOLDER}`);
console.log(`Created RC zip: ${RC_ZIP}`);
