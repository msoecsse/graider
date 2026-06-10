const fs = require("node:fs");
const path = require("node:path");

const ELECTRON_OUTPUT_DIRECTORY = "dist-electron";
const PACKAGE_FILE_NAME = "package.json";

const outputDirectory = path.join(process.cwd(), ELECTRON_OUTPUT_DIRECTORY);
const packagePath = path.join(outputDirectory, PACKAGE_FILE_NAME);

fs.mkdirSync(outputDirectory, { recursive: true });

fs.writeFileSync(
    packagePath,
    `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
    "utf8"
);