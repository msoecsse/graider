import type { RawTermConfig } from "./config-models.js";
import { rawTermConfigSchema } from "./config-schemas.js";
import { validateRawConfigSchema, type SchemaValidationResult } from "./config-validation.js";
import { readTextFile } from "../io/file-system.js";
import { parseYaml } from "../io/stable-yaml.js";

export const loadTermConfig = (filePath: string): SchemaValidationResult<RawTermConfig> => {
  const fileResult = readTextFile(filePath);

  if (fileResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [fileResult.diagnostic]
    };
  }

  return parseTermConfig(fileResult.content, filePath);
};

/** Shared safe parser for local files and trusted remote metadata. */
export const parseTermConfig = (
  content: string,
  filePath: string
): SchemaValidationResult<RawTermConfig> => {
  const yamlResult = parseYaml(content, filePath);

  if (yamlResult.status === "failure") {
    return {
      status: "failure",
      diagnostics: [yamlResult.diagnostic]
    };
  }

  return validateRawConfigSchema(filePath, rawTermConfigSchema, yamlResult.value);
};
