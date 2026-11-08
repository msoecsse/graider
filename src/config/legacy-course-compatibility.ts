import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

/** Defense for internal legacy writers. Public entry points separately require fresh remote evidence. */
export const legacyCourseContentIncompatible = (content: string): boolean => {
  try {
    const value: unknown = parse(content);
    return (
      !value ||
      typeof value !== "object" ||
      !("schema_version" in value) ||
      value.schema_version !== 1
    );
  } catch {
    return true;
  }
};
export const legacyCourseWriteIncompatible = (root: string): boolean => {
  const file = path.join(root, "course.yml");
  if (!fs.existsSync(file)) return false; // Data-model-only storage may have no course configuration.
  try {
    return legacyCourseContentIncompatible(fs.readFileSync(file, "utf8"));
  } catch {
    return true;
  }
};
