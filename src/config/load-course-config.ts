import type { RawCourseConfig } from "./config-models.js";
import { rawCourseConfigSchema } from "./config-schemas.js";
import { validateRawConfigSchema, type SchemaValidationResult } from "./config-validation.js";
import { readTextFile } from "../io/file-system.js";
import { parseYaml } from "../io/stable-yaml.js";

export const loadCourseConfig = (filePath: string): SchemaValidationResult<RawCourseConfig> => {
  const fileResult = readTextFile(filePath);

  if (fileResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [fileResult.diagnostic]
    };
  }

  return parseCourseConfig(fileResult.content, filePath);
};

/** Shared safe parser for local files and trusted remote metadata. */
export const parseCourseConfig = (
  content: string,
  filePath: string
): SchemaValidationResult<RawCourseConfig> => {
  const yamlResult = parseYaml(content, filePath);

  if (yamlResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [yamlResult.diagnostic]
    };
  }

  return validateRawConfigSchema(filePath, rawCourseConfigSchema, yamlResult.value);
};
