import type { RawTermConfig } from "./config-models.js";
import {
  rawTermConfigV1Schema,
  rawTermConfigV2Schema,
  SUPPORTED_SCHEMA_VERSION,
  TERM_SCHEMA_VERSION_V2
} from "./config-schemas.js";
import {
  createInvalidSchemaVersionDiagnostic,
  validateRawConfigSchema,
  type SchemaValidationResult
} from "./config-validation.js";
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

  const value = yamlResult.value;
  const version =
    value && typeof value === "object" && "schema_version" in value
      ? value.schema_version
      : undefined;
  if (
    typeof version === "number" &&
    version !== SUPPORTED_SCHEMA_VERSION &&
    version !== TERM_SCHEMA_VERSION_V2
  ) {
    return {
      status: "failure",
      diagnostics: [createInvalidSchemaVersionDiagnostic(filePath, version, TERM_SCHEMA_VERSION_V2)]
    };
  }
  return version === TERM_SCHEMA_VERSION_V2
    ? validateRawConfigSchema(filePath, rawTermConfigV2Schema, value)
    : validateRawConfigSchema(filePath, rawTermConfigV1Schema, value);
};
