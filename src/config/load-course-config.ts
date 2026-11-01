import type { RawCourseConfig } from "./config-models.js";
import {
  rawCourseConfigV1Schema,
  rawCourseConfigV2Schema,
  SUPPORTED_SCHEMA_VERSION,
  COURSE_SCHEMA_VERSION_V2
} from "./config-schemas.js";
import {
  createInvalidSchemaVersionDiagnostic,
  validateRawConfigSchema,
  type SchemaValidationResult
} from "./config-validation.js";
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

  const value = yamlResult.value;
  const version =
    value && typeof value === "object" && "schema_version" in value
      ? value.schema_version
      : undefined;
  if (
    typeof version === "number" &&
    version !== SUPPORTED_SCHEMA_VERSION &&
    version !== COURSE_SCHEMA_VERSION_V2
  ) {
    return {
      status: "failure",
      diagnostics: [
        createInvalidSchemaVersionDiagnostic(filePath, version, COURSE_SCHEMA_VERSION_V2)
      ]
    };
  }
  return version === COURSE_SCHEMA_VERSION_V2
    ? validateRawConfigSchema(filePath, rawCourseConfigV2Schema, value)
    : validateRawConfigSchema(filePath, rawCourseConfigV1Schema, value);
};
