import fs from "node:fs";
import path from "node:path";
import { loadManifest } from "../manifest/manifest-loader.js";
import type { AssignmentDetailApplyState } from "./assignment-detail-models.js";

const SINGLE_FILE_LINK_COUNT = 1;

/** Read existing runtime evidence without creating, importing or changing any files. */
export const readAssignmentApplyState = (
  root: string,
  manifestPath: string
): AssignmentDetailApplyState => {
  const relative = path.relative(root, manifestPath);
  const parts = relative.split(path.sep);
  if (path.isAbsolute(relative) || parts.some((part) => !part || part === "." || part === ".."))
    return "unknown";
  let current = root;
  try {
    for (const part of ["", ...parts]) {
      current = path.join(current, part);
      const stat = fs.lstatSync(current);
      if (
        stat.isSymbolicLink() ||
        (current === manifestPath
          ? !stat.isFile() || stat.nlink !== SINGLE_FILE_LINK_COUNT
          : !stat.isDirectory())
      )
        return "unknown";
    }
    return loadManifest(manifestPath).status === "loaded" ? "applied" : "unknown";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "not_applied" : "unknown";
  }
};
