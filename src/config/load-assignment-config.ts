import type { RawAssignmentConfig } from "./config-models.js";
import { rawAssignmentConfigSchema } from "./config-schemas.js";
import { validateRawConfigSchema, type SchemaValidationResult } from "./config-validation.js";
import { readTextFile } from "../io/file-system.js";
import { parseYaml } from "../io/stable-yaml.js";

export const loadAssignmentConfig = (
  filePath: string
): SchemaValidationResult<RawAssignmentConfig> => {
  const fileResult = readTextFile(filePath);

  if (fileResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [fileResult.diagnostic]
    };
  }

  return parseAssignmentConfig(fileResult.content, filePath);
};

/** Shared parser for working files and exact-revision read-only analysis. */
export const parseAssignmentConfig = (
  content: string,
  filePath: string
): SchemaValidationResult<RawAssignmentConfig> => {
  const yamlResult = parseYaml(content, filePath);

  if (yamlResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [yamlResult.diagnostic]
    };
  }

  return validateRawConfigSchema(filePath, rawAssignmentConfigSchema, yamlResult.value);
};
