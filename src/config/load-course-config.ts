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

  const yamlResult = parseYaml(fileResult.content, filePath);

  if (yamlResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [yamlResult.diagnostic]
    };
  }

  return validateRawConfigSchema(filePath, rawCourseConfigSchema, yamlResult.value);
};
