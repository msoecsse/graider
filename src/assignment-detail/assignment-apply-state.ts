import fs from "node:fs";
import path from "node:path";
import { loadManifest } from "../manifest/manifest-loader.js";
import { PLAN_OPERATION_TYPES } from "../planning/operation-models.js";
import type { AssignmentDetailApplyState } from "./assignment-detail-models.js";

const SINGLE_FILE_LINK_COUNT = 1;
const APPLY_DIAGNOSTIC_OPERATIONS = new Set<string>([
  ...PLAN_OPERATION_TYPES,
  "verify_repository_baseline"
]);

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
    const loaded = loadManifest(manifestPath);
    if (loaded.status !== "loaded") return "unknown";
    const diagnostics = [
      ...loaded.manifest.warnings,
      ...loaded.manifest.errors,
      ...loaded.manifest.repositories.flatMap((record) => [...record.warnings, ...record.errors]),
      ...(loaded.manifest.targets?.flatMap((target) => target.diagnostics) ?? [])
    ];
    return diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === "error" &&
        typeof diagnostic.context?.operationType === "string" &&
        APPLY_DIAGNOSTIC_OPERATIONS.has(diagnostic.context.operationType)
    )
      ? "partially_applied"
      : "applied";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "not_applied" : "unknown";
  }
};
