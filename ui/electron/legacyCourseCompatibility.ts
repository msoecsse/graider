import fs from "node:fs";
import path from "node:path";

/** Local defense only; the IPC/CLI boundary additionally revalidates the remote schema/revision. */
export const legacyCourseWriteIncompatible = (root: string): boolean => {
  const backend = require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "remoteCourseMetadataBackend.cjs"
    )
  ) as { legacyCourseWriteIncompatible(root: string): boolean };
  return backend.legacyCourseWriteIncompatible(root);
};
export const legacyCourseContentIncompatible = (content: string): boolean => {
  const backend = require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "remoteCourseMetadataBackend.cjs"
    )
  ) as { legacyCourseContentIncompatible(content: string): boolean };
  return backend.legacyCourseContentIncompatible(content);
};

/** A fresh standalone folder must not be a route into an existing Git remote. */
export const standaloneSetupHasRepository = (root: string): boolean => {
  let directory = path.resolve(root);
  let inspecting = true;
  let found = false;
  while (inspecting) {
    found = fs.existsSync(path.join(directory, ".git"));
    const parent = path.dirname(directory);
    inspecting = !found && parent !== directory;
    directory = parent;
  }
  return found;
};
